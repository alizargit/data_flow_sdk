// ===== records.js — an app's records, checked against its manifest =====
//
// An app sends plain objects, one per record, keyed by field name:
//
//   { entryId: 'EX-000-car_12-ali', date: '2026-08-02', owed: 24900 }
//
// Each is checked against the stream's declared fields and turned into exactly
// the body Data Flow's inbound contract accepts:
//
//   { data: [ { name: 'entryId', type: 'string', value: 'EX-000-car_12-ali' },
//             { name: 'date', type: 'date', value: '2026-08-02' },
//             { name: 'owed', type: 'money', currency: 'EUR', value: 24900 } ] }
//
// ALL OR NOTHING. If any record in a call is wrong, nothing is sent and the
// RecordError lists every problem (up to MAX_LISTED). A partial send would leave
// the user's Data Flow holding some of a batch with no way to tell which part.
//
// Strict on purpose — no coercion. "true" is not true, "42" is not 42, a Date
// object is not a date string. Each of those has one obvious conversion in the
// app that sends it and an ambiguous one anywhere later, so the SDK asks the app
// to do it. `null` is refused too: Data Flow has no null; leave the field out.

import {
  isValidDate, DATE_EXAMPLES, fitsCurrency, CURRENCY_DECIMALS,
  fileProblem, carriesFile, MAX_FILES_PER_FIELD,
} from './formats.js';

const MAX_LISTED = 50;
export const MAX_RECORDS_PER_CALL = 5000;

export class RecordError extends Error {
  constructor(problems, total) {
    const more = total > problems.length ? `\n  … and ${total - problems.length} more` : '';
    super(`Records were not sent — nothing in this call reached Data Flow:\n  - ${problems.join('\n  - ')}${more}`);
    this.name = 'RecordError';
    this.problems = problems;
    this.total = total;
  }
}

const WIRE = { file: 'string', files: 'json' };

/**
 * Check `records` against `stream` (a normalised manifest stream).
 * Returns the wire bodies, in order, or throws a RecordError.
 */
export function toPayloads(stream, records) {
  const problems = [];
  let total = 0;
  const add = msg => { total++; if (problems.length < MAX_LISTED) problems.push(msg); };

  if (!Array.isArray(records)) throw new RecordError(['records must be an array of objects.'], 1);
  if (records.length > MAX_RECORDS_PER_CALL) {
    throw new RecordError([`at most ${MAX_RECORDS_PER_CALL} records per call — got ${records.length}.`], 1);
  }

  const byName = new Map(stream.fields.map(f => [f.name, f]));
  const keys = new Map();
  const out = [];

  records.forEach((rec, i) => {
    const at = `record ${i}`;
    if (!rec || typeof rec !== 'object' || Array.isArray(rec) || Object.getPrototypeOf(rec) !== Object.prototype && Object.getPrototypeOf(rec) !== null) {
      add(`${at} must be a plain object.`); return;
    }
    const before = total;
    for (const k of Object.keys(rec)) {
      if (!byName.has(k)) add(`${at}: "${k}" is not a field of stream "${stream.id}".`);
    }
    const data = [];
    for (const f of stream.fields) {
      const v = rec[f.name];
      if (v === undefined) {
        if (f.required) add(`${at}: "${f.name}" is required.`);
        continue;
      }
      const why = valueProblem(f, v);
      if (why) { add(`${at}: "${f.name}" ${why}`); continue; }
      const item = { name: f.name, type: WIRE[f.type] || f.type, value: v };
      if (f.type === 'money') item.currency = f.currency;
      data.push(item);
    }
    if (!data.length && total === before) add(`${at} is empty: Data Flow needs at least one field.`);
    if (stream.key && rec[stream.key] !== undefined) {
      const k = String(rec[stream.key]);
      if (keys.has(k)) add(`${at}: ${stream.key} "${k}" repeats record ${keys.get(k)}; each record's key must be unique.`);
      else keys.set(k, i);
    }
    out.push({ data });
  });

  if (total) throw new RecordError(problems, total);
  return out;
}

function valueProblem(f, v) {
  if (v === null) return 'is null. Data Flow has no null — leave the field out instead.';
  switch (f.type) {
    case 'string':
      if (typeof v !== 'string') return `must be a string, not ${kind(v)}.`;
      if (carriesFile(v)) return 'holds a file. Declare the field as type "file" to send one.';
      return '';
    case 'boolean':
      return v === true || v === false ? '' : `must be true or false, not ${kind(v)}.`;
    case 'number':
      return typeof v === 'number' && isFinite(v) ? '' : `must be a finite number, not ${kind(v)}.`;
    case 'date': {
      if (isValidDate(v, f.precision)) return '';
      const got = typeof v === 'string' ? show(v) : kind(v);
      return f.precision
        ? `must be an ISO 8601 UTC ${f.precision} like "${DATE_EXAMPLES[f.precision]}" — got ${got}.`
        : `must be ISO 8601 UTC: "${DATE_EXAMPLES.date}", "${DATE_EXAMPLES.time}" or "${DATE_EXAMPLES.datetime}" — got ${got}.`;
    }
    case 'money':
      if (typeof v !== 'number' || !isFinite(v)) return `must be the amount as a number in ${f.currency}, not ${kind(v)}.`;
      if (!fitsCurrency(v, f.currency)) {
        const d = CURRENCY_DECIMALS[f.currency];
        return `has more decimals than ${f.currency} allows (${d}) — got ${v}. Round it before sending.`;
      }
      return '';
    case 'json': {
      if (!v || typeof v !== 'object') return `must be a JSON object or array, not ${kind(v)}.`;
      let text;
      try { text = JSON.stringify(v); } catch { return 'cannot be turned into JSON (it refers to itself).'; }
      if (!sameShape(v, JSON.parse(text))) {
        return 'holds values JSON cannot carry (functions, undefined, Dates, NaN…).';
      }
      if (carriesFile(text)) return 'holds a file. Declare a field of type "files" to send several.';
      return '';
    }
    case 'file':
      return fileProblem(v) ? `${fileProblem(v)}.` : '';
    case 'files': {
      if (!Array.isArray(v) || !v.length) return 'must be a non-empty array of file data: URIs.';
      if (v.length > MAX_FILES_PER_FIELD) return `holds ${v.length} files; at most ${MAX_FILES_PER_FIELD}.`;
      const bad = v.findIndex(x => fileProblem(x));
      return bad < 0 ? '' : `[${bad}] ${fileProblem(v[bad])}.`;
    }
  }
  return 'has an unknown type.';
}

/** Does `a` survive a JSON round trip unchanged? Catches Dates, NaN, undefined in arrays. */
function sameShape(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const proto = Object.getPrototypeOf(a);
  if (!Array.isArray(a) && proto !== Object.prototype && proto !== null) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => sameShape(a[k], b[k]));
}

function kind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  if (v instanceof Date) return 'a Date object (send its ISO string)';
  if (typeof v === 'string') return `the string ${show(v)}`;
  if (typeof v === 'number' && !isFinite(v)) return String(v);
  return `a ${typeof v}`;
}

const show = v => {
  const s = typeof v === 'string' ? JSON.stringify(v) : String(v);
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
};

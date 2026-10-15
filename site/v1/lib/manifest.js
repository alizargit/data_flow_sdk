// ===== manifest.js — what an app declares, and the palette Data Flow builds from it =====
//
// A connecting app describes itself ONCE, up front, and Data Flow builds an input
// palette from that description:
//
//   {
//     app: 'carisma',                         // the app's registered Puter name
//     palette: {
//       label: 'Carisma',                     // the palette's name in the menu
//       description: 'Your investor ledger.', // the palette's info text
//       icon: '/assets/icon-512.png',         // a perfectly square image (icon.js)
//     },
//     streams: [{                             // one per output port on the palette
//       id: 'ledger', label: 'Ledger',
//       mode: 'snapshot',                     // or 'append'
//       key: 'entryId',                       // the field Data Flow matches rows on
//       fields: [
//         { name: 'entryId', type: 'string', required: true },
//         { name: 'date',    type: 'date', precision: 'date', required: true },
//         { name: 'owed',    type: 'money', currency: 'EUR' },
//       ],
//     }],
//   }
//
// The user approves THIS — the fields and their types — in Data Flow, so it is
// also the limit of what the app may send. A record with a field the manifest
// does not name is refused (records.js), and so is one whose value is not of the
// declared type. Changing the manifest means asking the user again (the hash).
//
// Every problem is reported at once, as a list, so a developer fixes their
// manifest in one pass rather than one error per reload.

import { FIELD_TYPES, CURRENCIES, DATE_PRECISIONS } from './formats.js';
import { prepareIcon, IconError } from './icon.js';

export const LIMITS = Object.freeze({
  label: 24, description: 280, fieldLabel: 64, fieldName: 64, streams: 4, fields: 64,
});
export const MODES = ['append', 'snapshot'];

const APP_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const STREAM_ID = /^[a-z][a-z0-9_]{0,31}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export class ManifestError extends Error {
  constructor(problems) {
    super(`Data Flow manifest is not valid:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ManifestError';
    this.problems = problems;
  }
}

/**
 * Check a manifest and turn it into the frozen form the SDK uses and sends.
 * Resolves to the normalised manifest, or rejects with a ManifestError listing
 * every problem. Async only because the icon has to be loaded to be checked.
 */
export async function defineManifest(input) {
  const problems = [];
  const m = isObj(input) ? input : (problems.push('manifest must be an object.'), {});

  const app = typeof m.app === 'string' ? m.app.trim() : '';
  if (!APP_NAME.test(app)) problems.push('app must be your app\'s registered Puter name (letters, digits, - and _).');

  const p = isObj(m.palette) ? m.palette : (problems.push('palette must be an object.'), {});
  const label = text(p.label, 'palette.label', LIMITS.label, true, problems);
  const description = text(p.description, 'palette.description', LIMITS.description, false, problems);

  const streams = [];
  if (!Array.isArray(m.streams) || !m.streams.length) {
    problems.push('streams must be a non-empty array.');
  } else if (m.streams.length > LIMITS.streams) {
    problems.push(`streams may hold at most ${LIMITS.streams} (one per palette output).`);
  } else {
    const ids = new Set();
    m.streams.forEach((s, i) => {
      const st = stream(s, `streams[${i}]`, problems);
      if (!st) return;
      if (ids.has(st.id)) problems.push(`streams[${i}].id "${st.id}" is used twice.`);
      ids.add(st.id);
      streams.push(st);
    });
  }

  let icon = null;
  if (p.icon == null) problems.push('palette.icon is required: a perfectly square image of at least 64×64 px.');
  else {
    try { icon = await prepareIcon(p.icon); }
    catch (e) { problems.push(`palette.${e instanceof IconError ? e.message : 'icon could not be read.'}`); }
  }

  if (problems.length) throw new ManifestError(problems);

  const out = { app, palette: { label, description, icon: { menu: icon.menu, canvas: icon.canvas } }, streams };
  out.hash = await hashOf(out);
  return deepFreeze(out);
}

function stream(s, at, problems) {
  if (!isObj(s)) { problems.push(`${at} must be an object.`); return null; }
  const before = problems.length;
  const id = typeof s.id === 'string' ? s.id : '';
  if (!STREAM_ID.test(id)) problems.push(`${at}.id must be lower-case letters, digits and _, starting with a letter (max 32).`);
  const label = text(s.label ?? id, `${at}.label`, LIMITS.label, true, problems);
  const mode = s.mode ?? 'append';
  if (!MODES.includes(mode)) problems.push(`${at}.mode must be "append" or "snapshot".`);

  const fields = [];
  if (!Array.isArray(s.fields) || !s.fields.length) {
    problems.push(`${at}.fields must be a non-empty array.`);
  } else if (s.fields.length > LIMITS.fields) {
    problems.push(`${at}.fields may hold at most ${LIMITS.fields}.`);
  } else {
    const names = new Set();
    s.fields.forEach((f, j) => {
      const fd = field(f, `${at}.fields[${j}]`, problems);
      if (!fd) return;
      if (names.has(fd.name)) problems.push(`${at}.fields[${j}].name "${fd.name}" is used twice.`);
      names.add(fd.name);
      fields.push(fd);
    });
  }

  // The key is how Data Flow recognises a row it already has (its Key ID match).
  // A snapshot REPLACES the stream's rows, which is only well-defined when every
  // row can be told apart — so a snapshot stream must have one.
  let key = null;
  if (s.key != null) {
    const kf = fields.find(f => f.name === s.key);
    if (!kf) problems.push(`${at}.key "${s.key}" is not one of its fields.`);
    else if (kf.type !== 'string' && kf.type !== 'number') problems.push(`${at}.key must name a string or number field.`);
    else { kf.required = true; key = kf.name; }
  } else if (mode === 'snapshot') {
    problems.push(`${at}.key is required for a snapshot stream: it is how Data Flow tells its rows apart.`);
  }

  return problems.length > before ? null : { id, label, mode, key, fields };
}

function field(f, at, problems) {
  if (!isObj(f)) { problems.push(`${at} must be an object.`); return null; }
  const before = problems.length;
  const name = typeof f.name === 'string' ? f.name : '';
  if (!name || name !== name.trim() || name.length > LIMITS.fieldName || CONTROL.test(name)) {
    problems.push(`${at}.name must be a non-empty name of at most ${LIMITS.fieldName} characters, without leading or trailing spaces.`);
  }
  if (!FIELD_TYPES.includes(f.type)) problems.push(`${at}.type must be one of: ${FIELD_TYPES.join(', ')}.`);
  const out = { name, type: f.type, required: f.required === true };
  if (f.label != null) out.label = text(f.label, `${at}.label`, LIMITS.fieldLabel, false, problems);

  // A money field states its currency ONCE, here. Every amount the app sends for
  // it is in that currency, so Data Flow never has to guess what a number means.
  if (f.type === 'money') {
    if (!CURRENCIES.includes(f.currency)) problems.push(`${at}.currency must be one of: ${CURRENCIES.join(', ')}.`);
    else out.currency = f.currency;
  } else if (f.currency != null) problems.push(`${at}.currency is only for a money field.`);

  if (f.type === 'date') {
    if (f.precision != null && !DATE_PRECISIONS.includes(f.precision)) {
      problems.push(`${at}.precision must be one of: ${DATE_PRECISIONS.join(', ')}.`);
    } else if (f.precision) out.precision = f.precision;
  } else if (f.precision != null) problems.push(`${at}.precision is only for a date field.`);

  return problems.length > before ? null : out;
}

function text(v, at, max, required, problems) {
  if (v == null || v === '') {
    if (required) problems.push(`${at} is required.`);
    return '';
  }
  if (typeof v !== 'string' || CONTROL.test(v) || v.trim().length > max || !v.trim()) {
    problems.push(`${at} must be text of at most ${max} characters.`);
    return '';
  }
  return v.trim();
}

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * SHA-256 of the manifest's canonical JSON. Data Flow stores the hash it
 * approved; when the app ships a different manifest the hashes differ and the
 * user is asked again — an app cannot widen what it sends without them.
 */
async function hashOf(obj) {
  const bytes = new TextEncoder().encode(canonical(obj));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

function deepFreeze(o) {
  Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

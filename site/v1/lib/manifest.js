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
//     keys: [                                 // EVERY Key ID the records carry
//       { name: 'carId',   label: 'Car' },
//       { name: 'entryId', label: 'Entry', parent: 'carId' },
//     ],
//     streams: [{                             // one per output port on the palette
//       id: 'ledger', label: 'Ledger',
//       mode: 'snapshot',                     // or 'append'
//       key: 'entryId',                       // the record's identity: a key_id field
//       fields: [
//         { name: 'entryId', type: 'key_id' },
//         { name: 'carId',   type: 'key_id' },
//         { name: 'date',    type: 'date', precision: 'date', required: true },
//         { name: 'owed',    type: 'money', currency: 'EUR' },
//       ],
//     }],
//   }
//
// KEYS (1.2.0). The app declares each of its Key IDs once, for the whole app,
// and how they relate — the same two relations Data Flow's own Key ID tree has:
//
//   parent       this key lives inside that one (an entry inside a car). A
//                child's values must still be unique ON THEIR OWN: Data Flow
//                takes the most specific key as the identity.
//   references   keys this one points at without living inside them (an entry
//                naming its investor).
//
// A stream's `key` is its records' identity; every other key_id field it
// carries must be an ancestor of that key or one the key references, so each
// record has exactly one identity. Ancestors a stream carries are required too.
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
  keys: 16, keyDepth: 4,
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

  const keys = keyList(m.keys, problems);
  const keyByName = new Map(keys.map(k => [k.name, k]));

  const streams = [];
  if (!Array.isArray(m.streams) || !m.streams.length) {
    problems.push('streams must be a non-empty array.');
  } else if (m.streams.length > LIMITS.streams) {
    problems.push(`streams may hold at most ${LIMITS.streams} (one per palette output).`);
  } else {
    const ids = new Set();
    m.streams.forEach((s, i) => {
      const st = stream(s, `streams[${i}]`, keyByName, problems);
      if (!st) return;
      if (ids.has(st.id)) problems.push(`streams[${i}].id "${st.id}" is used twice.`);
      ids.add(st.id);
      streams.push(st);
    });
    // Declared means used: a key no stream carries is a mistake in one or the
    // other. Only once every stream is valid, or a broken one would list its
    // keys here too.
    if (streams.length === m.streams.length) keys.forEach(k => {
      if (!streams.some(st => st.fields.some(f => f.type === 'key_id' && f.name === k.name))) {
        problems.push(`keys: "${k.name}" is declared but no stream has a key_id field of that name.`);
      }
    });
  }

  let icon = null;
  if (p.icon == null) problems.push('palette.icon is required: a perfectly square image of at least 64×64 px.');
  else {
    try { icon = await prepareIcon(p.icon); }
    catch (e) { problems.push(`palette.${e instanceof IconError ? e.message : 'icon could not be read.'}`); }
  }

  if (problems.length) throw new ManifestError(problems);

  const out = { app, palette: { label, description, icon: { menu: icon.menu, canvas: icon.canvas, source: icon.source } }, keys, streams };
  out.hash = await hashOf(hashed(out));
  return deepFreeze(out);
}

/**
 * What the hash covers: everything, except that the icon is represented by its
 * SOURCE fingerprint rather than by the drawn copies, which differ by browser
 * (icon.js). Data Flow's worker hashes exactly this shape.
 */
function hashed(m) {
  return { ...m, palette: { ...m.palette, icon: { source: m.palette.icon.source } } };
}

/* ---------- Keys ---------- */

/** Every ancestor of `name`, nearest first (the list is already free of cycles). */
function ancestorsOf(name, byName) {
  const out = [];
  let cur = byName.get(name);
  while (cur && cur.parent && !out.includes(cur.parent)) { out.push(cur.parent); cur = byName.get(cur.parent); }
  return out;
}

function keyList(list, problems) {
  if (!Array.isArray(list) || !list.length) {
    problems.push('keys must be a non-empty array: every Key ID your records carry, and how they relate (README, "Record IDs").');
    return [];
  }
  if (list.length > LIMITS.keys) { problems.push(`keys may hold at most ${LIMITS.keys}.`); return []; }
  const out = [];
  const names = new Set();
  list.forEach((k, i) => {
    const at = `keys[${i}]`;
    if (!isObj(k)) { problems.push(`${at} must be an object.`); return; }
    const before = problems.length;
    const name = nameOf(k.name, `${at}.name`, problems);
    if (name && names.has(name)) problems.push(`${at}.name "${name}" is declared twice.`);
    const o = { name };
    if (k.label != null) o.label = text(k.label, `${at}.label`, LIMITS.fieldLabel, false, problems);
    if (k.parent != null) {
      if (typeof k.parent !== 'string' || !k.parent) problems.push(`${at}.parent must be the name of another key.`);
      else o.parent = k.parent;
    }
    if (k.references != null) {
      if (!Array.isArray(k.references) || !k.references.length || k.references.some(r => typeof r !== 'string' || !r)) {
        problems.push(`${at}.references must be a non-empty array of key names.`);
      } else if (new Set(k.references).size !== k.references.length) {
        problems.push(`${at}.references names a key twice.`);
      } else o.references = [...k.references];
    }
    if (problems.length > before) return;
    names.add(name);
    out.push(o);
  });

  const byName = new Map(out.map(k => [k.name, k]));
  const before = problems.length;
  out.forEach(k => {
    if (!k.parent) return;
    if (k.parent === k.name) problems.push(`keys: "${k.name}" cannot be its own parent.`);
    else if (!byName.has(k.parent)) problems.push(`keys: "${k.name}" has parent "${k.parent}", which is not a declared key.`);
  });
  // Cycles and depth, by walking each key's parents.
  out.forEach(k => {
    const seen = [k.name];
    let cur = k;
    while (cur.parent && byName.has(cur.parent)) {
      if (seen.includes(cur.parent)) { problems.push(`keys: "${k.name}" is inside itself (${[...seen, cur.parent].join(' → ')}).`); return; }
      seen.push(cur.parent);
      cur = byName.get(cur.parent);
    }
    if (seen.length > LIMITS.keyDepth) problems.push(`keys: "${k.name}" is ${seen.length} levels deep; at most ${LIMITS.keyDepth}.`);
  });
  if (problems.length > before) return out;

  out.forEach(k => (k.references || []).forEach(r => {
    if (r === k.name) problems.push(`keys: "${k.name}" cannot reference itself.`);
    else if (!byName.has(r)) problems.push(`keys: "${k.name}" references "${r}", which is not a declared key.`);
    else if (ancestorsOf(k.name, byName).includes(r)) problems.push(`keys: "${k.name}" already lives inside "${r}"; drop it from references.`);
    else if (ancestorsOf(r, byName).includes(k.name)) problems.push(`keys: "${r}" lives inside "${k.name}", so "${k.name}" cannot reference it.`);
  }));
  return out;
}

function stream(s, at, keyByName, problems) {
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
      const fd = field(f, `${at}.fields[${j}]`, keyByName, problems);
      if (!fd) return;
      if (names.has(fd.name)) problems.push(`${at}.fields[${j}].name "${fd.name}" is used twice.`);
      names.add(fd.name);
      fields.push(fd);
    });
  }

  // The key is how Data Flow recognises a row it already has (its Key ID match).
  // Every stream has one (1.2.0): a snapshot REPLACES the stream's rows, which
  // is only well-defined when every row can be told apart, and an append record
  // delivered twice (a lost acknowledgement) is then an update, not a copy.
  let key = null;
  if (s.key == null) {
    problems.push(`${at}.key is required: the key_id field that is each record's identity.`);
  } else {
    const kf = fields.find(f => f.name === s.key);
    if (!kf) problems.push(`${at}.key "${s.key}" is not one of its fields.`);
    else if (kf.type !== 'key_id') problems.push(`${at}.key must name a key_id field.`);
    else { kf.required = true; key = kf.name; }
  }
  // One identity per record: every other Key ID the stream carries is one of
  // its key's ancestors (required with it) or a key it references.
  if (key && keyByName.has(key)) {
    const ancestors = ancestorsOf(key, keyByName);
    const refs = keyByName.get(key).references || [];
    fields.filter(f => f.type === 'key_id' && f.name !== key).forEach(f => {
      if (ancestors.includes(f.name)) f.required = true;
      else if (!refs.includes(f.name)) {
        problems.push(`${at}: key_id "${f.name}" is not related to the stream's key "${key}". Make it an ancestor of "${key}" (parent) or list it in "${key}".references — or, if it is not an identity, send it as a string.`);
      }
    });
  }

  return problems.length > before ? null : { id, label, mode, key, fields };
}

function nameOf(v, at, problems) {
  const name = typeof v === 'string' ? v : '';
  if (!name || name !== name.trim() || name.length > LIMITS.fieldName || CONTROL.test(name)) {
    problems.push(`${at} must be a non-empty name of at most ${LIMITS.fieldName} characters, without leading or trailing spaces.`);
  }
  return name;
}

function field(f, at, keyByName, problems) {
  if (!isObj(f)) { problems.push(`${at} must be an object.`); return null; }
  const before = problems.length;
  const name = nameOf(f.name, `${at}.name`, problems);
  if (!FIELD_TYPES.includes(f.type)) problems.push(`${at}.type must be one of: ${FIELD_TYPES.join(', ')}.`);
  if (f.type === 'key_id' && name && !keyByName.has(name)) {
    problems.push(`${at}: key_id field "${name}" is not declared in keys.`);
  }
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

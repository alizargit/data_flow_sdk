// ===== formats.js — the value formats Data Flow accepts =====
//
// A copy of Data Flow's inbound contract, so a record is refused HERE, in the
// sending app, with a message naming the field — rather than travelling to Data
// Flow and being refused there, or worse, arriving changed.
//
// The reference is Data Flow's own `site/js/core/apiformat.js`, which its worker
// (`workers/dataflow-api.js`) mirrors. This is a third copy of the same rules.
// CHANGE ALL THREE TOGETHER — and since this file is public and versioned, a rule
// should only get LOOSER within v1: tightening one breaks apps already sending.
// 1.2.0 broke this once, on purpose and before any app had shipped against it:
// Key IDs became their own type, declared with their relationships (manifest.js).
//
// One place this file is deliberately stricter than Data Flow: a money amount
// with more decimals than its currency has is REFUSED here, where Data Flow would
// round it. Rounding changes the number the app meant to send; the SDK's promise
// is that what an app sends is what arrives.

/** The wire types Data Flow's inbound contract accepts. */
export const WIRE_TYPES = ['string', 'boolean', 'number', 'date', 'money', 'json', 'key_id'];

/**
 * The field types a manifest may declare. The seven wire types, plus two that
 * travel as wire types but mean something more to Data Flow:
 *   file   — one file, sent as a base64 data: URI in a string field
 *   files  — up to MAX_FILES_PER_FIELD of them, as a json array of data: URIs
 * Data Flow stores each file on the user's drive and keeps only its Puter UID.
 */
export const FIELD_TYPES = [...WIRE_TYPES, 'file', 'files'];

/** ISO 4217 code -> the decimals an amount carries. Mirrors CURRENCY_DECIMALS in the worker. */
export const CURRENCY_DECIMALS = Object.freeze({
  AED: 2, AUD: 2, CAD: 2, CHF: 2, CNY: 2, EUR: 2, GBP: 2, JPY: 0, USD: 2,
});
export const CURRENCIES = Object.keys(CURRENCY_DECIMALS).sort();

/* ---------- Dates ----------
   ISO 8601, UTC only (trailing Z). Date, time, or both — the same three shapes
   Data Flow accepts. A manifest may narrow a field to one of them. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/;

export const DATE_PRECISIONS = ['date', 'time', 'datetime'];
const DATE_SHAPES = { date: DATE_ONLY, time: TIME_ONLY, datetime: DATE_TIME };
export const DATE_EXAMPLES = { date: '2026-08-02', time: '14:30:00Z', datetime: '2026-08-02T14:30:00Z' };

/**
 * Is `v` a date string Data Flow accepts — and, when `precision` is given, of
 * that one shape? A string that matches the shape but names no real day
 * ("2026-02-31") is refused too: Data Flow would keep it as text that no date
 * column could ever read back.
 */
export function isValidDate(v, precision) {
  if (typeof v !== 'string') return false;
  const shapes = precision ? [precision] : DATE_PRECISIONS;
  const kind = shapes.find(p => DATE_SHAPES[p].test(v));
  if (!kind) return false;
  if (kind === 'time') return validClock(v);
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  return kind === 'date' || validClock(v.slice(11));
}

function validClock(t) {
  const [h, min, s] = t.replace('Z', '').split(':').map(Number);
  return h < 24 && min < 60 && (s == null || s < 60);
}

/* ---------- Money ---------- */

/** Does `amount` fit its currency's decimals exactly (1250.5 EUR yes, 1250.555 EUR no)? */
export function fitsCurrency(amount, code) {
  const d = CURRENCY_DECIMALS[code];
  if (d == null || typeof amount !== 'number' || !isFinite(amount)) return false;
  const scaled = amount * 10 ** d;
  // Floating point: 0.1 + 0.2 is not exactly 0.3, but it is a valid cent amount.
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/* ---------- Files ----------
   Mirrors FILE_URI_RE, MAX_FILE_BYTES and MAX_FILES_PER_FIELD in the worker. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_FIELD = 20;
const FILE_URI_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)((?:;[^;,]+)*);base64,([A-Za-z0-9+/]+={0,2})$/i;
// A data: URI anywhere in a value — what the worker refuses outside a file field.
const CARRIES_FILE = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^;,"]+)*;base64,/i;

/** Problems with one file data: URI, as a message, or '' when it is acceptable. */
export function fileProblem(v) {
  if (typeof v !== 'string') return 'must be a base64 data: URI string (data:<type>;base64,…)';
  const m = FILE_URI_RE.exec(v);
  if (!m) return 'must be a base64 data: URI (data:<type>;base64,…)';
  // Decoded size from the base64 length, without decoding it.
  const b64 = m[3];
  const bytes = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_FILE_BYTES) return `is over ${MAX_FILE_BYTES / 1024 / 1024} MB`;
  return '';
}

/** Does a value carry a file somewhere inside it? Only file fields may. */
export const carriesFile = v => CARRIES_FILE.test(typeof v === 'string' ? v : JSON.stringify(v));

/** Byte length of a string as UTF-8. */
export function byteLen(s) {
  try { return new TextEncoder().encode(s).length; } catch { return String(s).length; }
}

/* ---------- Key IDs ----------
   A record's identity, and the identities it points at: a string or a number,
   at most MAX_KEY_ID_CHARS as text. Mirrors MAX_KEY_ID_CHARS in the worker. A
   string must already be trimmed — the worker would trim it, and the value that
   arrives must be the value sent. */
export const MAX_KEY_ID_CHARS = 200;

/** Problems with one Key ID value, as a message, or '' when it is acceptable. */
export function keyIdProblem(v) {
  if (typeof v === 'number') {
    return isFinite(v) ? '' : `must be a finite number or a string, not ${v}`;
  }
  if (typeof v !== 'string') return 'must be a string or a number';
  if (!v) return 'is empty';
  if (v !== v.trim()) return 'has leading or trailing spaces';
  if (v.length > MAX_KEY_ID_CHARS) return `is over ${MAX_KEY_ID_CHARS} characters`;
  return '';
}

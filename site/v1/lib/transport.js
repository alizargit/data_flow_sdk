// ===== transport.js — how the SDK reaches the user's Data Flow =====
//
// Everything goes through Data Flow's own worker with puter.workers.exec(), which
// attaches the signed-in user's Puter session. That session is the whole
// addressing scheme: the worker takes the user from it, never from the request
// body, so an app can only ever reach the Data Flow of the person using it — and
// only after that person approved the connection in Data Flow itself.
//
// The routes (see PROTOCOL.md for the full contract):
//
//   POST /connect/status      { app }                          -> the connection's state
//   POST /connect/request     { app, requestId, manifest }     -> parks a request for approval
//   POST /connect/send        { app, stream, hash, records, snapshot? }
//   POST /connect/disconnect  { app }
//
// The approval itself is NOT a route the app can call. The user approves in
// Data Flow's own page (openConsent), signed in to Data Flow, and Data Flow
// records it. The app only ever learns the outcome by asking /connect/status.
//
// PUTER APPS ONLY. The SDK refuses to run outside one (environment()), and Data
// Flow's worker checks again on its side — this check is for the developer's
// benefit, the worker's is the one that counts.

import { byteLen } from './formats.js';

const settings = {
  apiUrl: 'https://dataflow-api.puter.work',
  appUrl: 'https://dataflow.puter.site',
};

/**
 * Point the SDK at another Data Flow deployment. FOR DEVELOPING DATA FLOW
 * ITSELF (a local copy of its consent page); an app shipping to users leaves
 * these alone.
 */
export function configure({ apiUrl, appUrl } = {}) {
  if (apiUrl) settings.apiUrl = String(apiUrl).replace(/\/+$/, '');
  if (appUrl) settings.appUrl = String(appUrl).replace(/\/+$/, '');
}

export class ConnectError extends Error {
  constructor(message, code) { super(message); this.name = 'ConnectError'; this.code = code; }
}

/**
 * Can the SDK run here? { ok: true, dev } or { ok: false, reason }.
 * `dev` is true on localhost — allowed so an app can be built against the SDK,
 * but Data Flow's worker decides whether it accepts a connection from there.
 */
export function environment() {
  const p = globalThis.puter;
  if (!p || !p.workers || typeof p.workers.exec !== 'function') {
    return { ok: false, reason: 'Load puter.js (https://js.puter.com/v2/) before the Data Flow SDK.' };
  }
  const host = location.hostname;
  const dev = host === 'localhost' || host === '127.0.0.1';
  if (p.env === 'app' || host.endsWith('.puter.site') || dev) return { ok: true, dev };
  return { ok: false, reason: 'Data Flow connections work only in apps that run on Puter.' };
}

export const isSignedIn = () => {
  try { return !!globalThis.puter.auth.isSignedIn(); } catch { return false; }
};

/** POST one route; resolves to its JSON body or rejects with a ConnectError. */
async function call(path, body) {
  let res;
  try {
    res = await globalThis.puter.workers.exec(settings.apiUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ConnectError('Data Flow could not be reached. Check your connection and try again.', 'network');
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  // The worker's catch-all answers 404 for a route it does not have: a Data
  // Flow deployed before connections existed. Said plainly, not as an error.
  if (res.status === 404) {
    throw new ConnectError('This Data Flow cannot accept app connections yet.', 'unsupported');
  }
  if (res.status === 401) throw new ConnectError('Sign in to Puter to connect to Data Flow.', 'signin');
  if (!res.ok || !data || data.ok === false) {
    throw new ConnectError((data && data.error) || `Data Flow refused the request (${res.status}).`, (data && data.code) || 'refused');
  }
  return data;
}

export const api = {
  status: app => call('/connect/status', { app }),
  request: (app, requestId, manifest) => call('/connect/request', { app, requestId, manifest }),
  disconnect: app => call('/connect/disconnect', { app }),
  send: (body) => call('/connect/send', body),
};

/** 128 random bits as hex: the id a consent request is parked under. */
export function newRequestId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Open Data Flow's consent page for `requestId`. MUST run synchronously inside
 * the click that asked for it, before any await — a browser only lets a page
 * open a window during a user gesture. That is why the request id is made here,
 * in the browser, rather than handed out by the worker: the window opens first,
 * and the request it shows is parked a moment later. The consent page waits for
 * it to appear.
 */
export function openConsent(requestId) {
  const url = `${settings.appUrl}/#/connect/${requestId}`;
  return window.open(url, 'dataflow-connect', 'popup,width=520,height=760');
}

/* ---------- Sending ----------
   One call's records are cut into requests no bigger than these. The worker
   keeps a user's pending records in one store value, so what a request leaves
   THERE must stay well under that value's ceiling (399 KiB) — and so must a
   single record.

   Files do not count toward it: the worker hands each file to the user's own
   drive and keeps only its Puter UID. But a file is big on the way in, so a
   record that carries one travels in a request of its own. */
export const MAX_REQUEST_RECORDS = 200;
export const MAX_REQUEST_BYTES = 256 * 1024;

/**
 * Split wire bodies into requests. `fileFields` names the stream's file and
 * files fields. Returns arrays of payloads, or throws when a single record is
 * too big to store at all.
 */
export function chunk(payloads, fileFields = []) {
  const files = new Set(fileFields);
  const out = [];
  let cur = [], size = 0;
  const flush = () => { if (cur.length) out.push(cur); cur = []; size = 0; };
  payloads.forEach((p, i) => {
    const hasFile = p.data.some(d => files.has(d.name));
    // What the worker will store: the record with each file already a UID.
    const stored = hasFile
      ? { data: p.data.map(d => files.has(d.name) ? { ...d, value: Array.isArray(d.value) ? d.value.map(() => 'u'.repeat(40)) : 'u'.repeat(40) } : d) }
      : p;
    const n = byteLen(JSON.stringify(stored));
    if (n > MAX_REQUEST_BYTES) {
      throw new ConnectError(`record ${i} is ${Math.ceil(n / 1024)} KB; one record may be at most ${MAX_REQUEST_BYTES / 1024} KB (files not counted).`, 'too_large');
    }
    if (hasFile) { flush(); out.push([p]); return; }
    if (cur.length && (cur.length >= MAX_REQUEST_RECORDS || size + n > MAX_REQUEST_BYTES)) flush();
    cur.push(p); size += n;
  });
  flush();
  return out;
}

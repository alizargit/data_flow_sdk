// ===== connection.js — one app's connection to the signed-in user's Data Flow =====
//
// States (connection.state), and what the widget says for each:
//
//   checking     asking Data Flow where things stand
//   signin       not signed in to Puter; switching on signs in first
//   off          not connected (never was, was declined, or was switched off)
//   pending      the consent page is open, waiting for the user to approve
//   on           approved for THIS manifest — send() and replace() work
//   outdated     approved, but for a different manifest; switching on asks again
//   unavailable  cannot work here at all (not a Puter app, or a Data Flow
//                without connections); the switch is disabled
//   error        the last attempt failed; connection.message says why
//
// Beside the state, `connection.code` names WHY when there is more to say
// (`declined`, `timeout`, `closed`, `open_link`, `unsupported`, `not_puter`,
// a worker code…), and `connection.message` says it in English. The widget
// translates by code and falls back to the message (widget.js).
//
// `connection.consentUrl` is set while pending when the consent window could
// not be opened (code `open_link`): the widget shows it as a link instead.
//
// Listen with connection.addEventListener('change', …) or connection.on('change', …).

import { toPayloads } from './records.js';
import {
  api, environment, isSignedIn, openConsent, consentUrl, newRequestId, chunk, ConnectError,
} from './transport.js';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 10 * 60 * 1000;

export class Connection extends EventTarget {
  #manifest;
  #poll = null;

  constructor(manifest) {
    super();
    this.#manifest = manifest;
    this.state = 'checking';
    this.message = '';
    this.code = '';
    this.consentUrl = '';
  }

  /** The normalised manifest this connection was defined with (frozen). */
  get manifest() { return this.#manifest; }

  on(type, fn) { this.addEventListener(type, e => fn(e.detail)); return this; }

  #set(state, message = '', code = '') {
    if (state !== 'pending') this.consentUrl = '';
    if (state === this.state && message === this.message && code === this.code) return;
    this.state = state;
    this.message = message;
    this.code = code;
    this.dispatchEvent(new CustomEvent('change', { detail: { state, message, code } }));
  }

  /** Ask Data Flow where this connection stands. Safe to call any time. */
  async refresh() {
    const env = environment();
    if (!env.ok) return this.#set('unavailable', env.reason, env.code);
    if (!isSignedIn()) return this.#set('signin');
    if (this.state !== 'pending') this.#set('checking');
    try {
      const s = await api.status(this.#manifest.app);
      this.#apply(s);
    } catch (e) {
      this.#fail(e);
    }
  }

  #apply(s) {
    if (s.state === 'connected') {
      this.#stopPoll();
      this.#set(s.hash === this.#manifest.hash ? 'on' : 'outdated');
    } else if (s.state === 'pending') {
      if (this.state !== 'pending') this.#set('pending');
    } else {
      this.#stopPoll();
      if (s.state === 'denied') this.#set('off', 'The connection was declined in Data Flow.', 'declined');
      else this.#set('off');
    }
  }

  #fail(e) {
    this.#stopPoll();
    if (e instanceof ConnectError && e.code === 'unsupported') return this.#set('unavailable', e.message, 'unsupported');
    if (e instanceof ConnectError && e.code === 'signin') return this.#set('signin');
    this.#set('error', e.message || 'Something went wrong.', (e && e.code) || '');
  }

  /**
   * What the widget's switch does. MUST be called directly from the click —
   * connecting opens Data Flow's consent page, and a browser only allows that
   * during a user gesture.
   */
  toggle() {
    if (this.state === 'on') return this.disconnect();
    if (this.state === 'pending') return this.cancel();
    return this.connect();
  }

  /** Start connecting. Call from a click (see toggle). */
  async connect() {
    if (this.state === 'unavailable' || this.state === 'checking') return;
    if (!isSignedIn()) {
      // Signing in uses the gesture's one popup; the consent page needs a
      // second click, which the widget asks for once the state comes back.
      try { await globalThis.puter.auth.signIn(); } catch { /* closed */ }
      return this.refresh();
    }
    const requestId = newRequestId();
    const win = openConsent(requestId);   // before any await — see openConsent
    // No window — a pop-up blocker, or an iframe in the Puter desktop that may
    // not open one. The request is parked all the same, and the widget offers
    // the consent page as a link: a click on a link is allowed where a
    // scripted window is not.
    if (win) this.#set('pending');
    else {
      this.consentUrl = consentUrl(requestId);
      this.#set('pending', 'Open Data Flow to approve the connection.', 'open_link');
    }
    try {
      await api.request(this.#manifest.app, requestId, this.#manifest);
    } catch (e) {
      try { if (win) win.close(); } catch { /* already closed */ }
      return this.#fail(e);
    }
    this.#startPoll(win);
  }

  /** Stop waiting for approval. Anything the user approves later still counts on the next refresh. */
  cancel() {
    this.#stopPoll();
    this.#set('off');
    return this.refresh();
  }

  /** Switch the connection off. Data already in Data Flow stays there. */
  async disconnect() {
    this.#set('checking');
    try {
      await api.disconnect(this.#manifest.app);
      this.#set('off');
    } catch (e) {
      this.#fail(e);
    }
  }

  #startPoll(win) {
    this.#stopPoll();
    const started = Date.now();
    let closedChecks = 0;
    this.#poll = setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        this.#stopPoll();
        return this.#set('off', 'The connection was not approved in time. Switch on to try again.', 'timeout');
      }
      try {
        const s = await api.status(this.#manifest.app);
        // Only a window this page opened can be seen closing; a link opened
        // elsewhere simply waits for the answer or the time limit.
        if (s.state === 'pending' && win && win.closed && ++closedChecks > 2) {
          this.#stopPoll();
          return this.#set('off', 'Data Flow was closed before the connection was approved.', 'closed');
        }
        this.#apply(s);
      } catch (e) {
        this.#fail(e);
      }
    }, POLL_MS);
  }

  #stopPoll() {
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = null;
  }

  /**
   * Add records to an "append" stream. Resolves to { sent } once every request
   * was accepted; rejects with a RecordError (nothing sent) when any record is
   * wrong, or a ConnectError when Data Flow refused or could not be reached.
   */
  async send(streamId, records) {
    const stream = this.#stream(streamId, 'append');
    const payloads = toPayloads(stream, records);
    if (!payloads.length) throw new ConnectError('send() needs at least one record.', 'empty');
    this.#ready();
    const parts = chunk(payloads, fileFields(stream));
    for (const part of parts) await this.#post(stream, part);
    return { sent: payloads.length };
  }

  /**
   * Replace everything a "snapshot" stream holds with `records` (an empty array
   * empties it). Data Flow applies the snapshot only once every part arrived,
   * so a failure part-way leaves the previous one in place.
   */
  async replace(streamId, records) {
    const stream = this.#stream(streamId, 'snapshot');
    const payloads = toPayloads(stream, records);
    this.#ready();
    const parts = payloads.length ? chunk(payloads, fileFields(stream)) : [[]];
    const id = newRequestId();
    for (let i = 0; i < parts.length; i++) {
      await this.#post(stream, parts[i], { id, part: i, parts: parts.length });
    }
    return { sent: payloads.length };
  }

  #stream(id, mode) {
    const s = this.#manifest.streams.find(x => x.id === id);
    if (!s) throw new ConnectError(`"${id}" is not a stream in this manifest.`, 'no_stream');
    if (s.mode !== mode) {
      throw new ConnectError(`stream "${id}" is a ${s.mode} stream — use ${s.mode === 'snapshot' ? 'replace()' : 'send()'}.`, 'wrong_mode');
    }
    return s;
  }

  #ready() {
    if (this.state === 'on') return;
    if (this.state === 'outdated') throw new ConnectError('Your app\'s manifest changed since the user approved it. They need to approve it again.', 'outdated');
    throw new ConnectError('Not connected to Data Flow.', 'not_connected');
  }

  async #post(stream, records, snapshot) {
    try {
      await api.send({
        app: this.#manifest.app, stream: stream.id, hash: this.#manifest.hash, records,
        ...(snapshot ? { snapshot } : {}),
      });
    } catch (e) {
      // The worker answers these when the user switched the connection off or
      // re-approved under another manifest since this page last looked.
      if (e instanceof ConnectError && (e.code === 'not_connected' || e.code === 'outdated')) this.refresh();
      throw e;
    }
  }
}

const fileFields = s => s.fields.filter(f => f.type === 'file' || f.type === 'files').map(f => f.name);

// ===== dataflow-connect.js — the Data Flow SDK, v1 =====
//
// Lets a Puter app send its users' data into THEIR OWN Data Flow, as an input
// palette the user approved. Load puter.js first, then this module:
//
//   <script src="https://js.puter.com/v2/"></script>
//   <script type="module">
//     import { DataFlow } from 'https://dataflow-sdk.puter.site/v1/dataflow-connect.js';
//
//     const conn = await DataFlow.define({ app, palette, streams });  // manifest.js
//     conn.mount(document.querySelector('#dataflow'));                // the widget
//
//     // once the user has switched it on (conn.state === 'on'):
//     await conn.replace('ledger', rows);   // a snapshot stream
//     await conn.send('events', rows);      // an append stream
//   </script>
//
// Or place <dataflow-connect></dataflow-connect> in the page yourself and set
// its `.connection` property.
//
// Modules:
//   lib/formats.js     the value formats Data Flow accepts (a copy of its contract)
//   lib/icon.js        the app's icon, checked square and shrunk to palette sizes
//   lib/manifest.js    the app's declaration, from which Data Flow builds the palette
//   lib/records.js     records checked against the manifest, turned into wire bodies
//   lib/transport.js   Data Flow's worker routes, the consent window, Puter-only checks
//   lib/connection.js  the connection's state and the send/replace calls
//   lib/widget.js      the <dataflow-connect> element
//
// VERSIONING. This file is served at /v1/ and every app that loads it gets the
// current copy (Puter hosting sends no-store). So within v1 a change may only
// ADD: a new optional manifest key, a looser rule, a new method. Anything that
// would break an app already using v1 goes into /v2/ beside it.

import { defineManifest, ManifestError, LIMITS, MODES } from './lib/manifest.js';
import { RecordError, toPayloads } from './lib/records.js';
import { ConnectError, configure, environment } from './lib/transport.js';
import { Connection } from './lib/connection.js';
import { DataFlowConnectElement, TEXT } from './lib/widget.js';
import { FIELD_TYPES, CURRENCIES, DATE_PRECISIONS } from './lib/formats.js';
import { IconError, ICON_MIN, ICON_SIZES } from './lib/icon.js';

export const VERSION = '1.1.0';

if (!customElements.get('dataflow-connect')) customElements.define('dataflow-connect', DataFlowConnectElement);

/**
 * Put the widget in `container`. Options:
 *   lang  'en' or 'pt' (default: the page's <html lang>, else English)
 *   text  replacement strings, keyed as in DataFlow.TEXT.en
 */
Connection.prototype.mount = function (container, { lang, text } = {}) {
  const el = document.createElement('dataflow-connect');
  if (lang) el.setAttribute('lang', lang);
  if (text) el.text = text;
  el.connection = this;
  container.appendChild(el);
  return el;
};

/**
 * Check `manifest` and create the connection it describes. Rejects with a
 * ManifestError listing every problem. The connection starts checking where it
 * stands with the user's Data Flow straight away.
 */
async function define(manifest) {
  const conn = new Connection(await defineManifest(manifest));
  conn.refresh();
  return conn;
}

/**
 * Check records against a stream WITHOUT sending them — for an app's own tests,
 * or to report problems before the user switches the connection on. Returns the
 * wire bodies, or throws the same RecordError send() would.
 */
function check(connection, streamId, records) {
  const s = connection.manifest.streams.find(x => x.id === streamId);
  if (!s) throw new ConnectError(`"${streamId}" is not a stream in this manifest.`, 'no_stream');
  return toPayloads(s, records);
}

export const DataFlow = Object.freeze({
  VERSION, define, check, configure, environment, TEXT,
  FIELD_TYPES, CURRENCIES, DATE_PRECISIONS, MODES, LIMITS, ICON_MIN, ICON_SIZES,
  ManifestError, RecordError, ConnectError, IconError,
});

export { ManifestError, RecordError, ConnectError, IconError };

// For a page that cannot use modules directly (an inline script after this loads).
if (!globalThis.DataFlow) globalThis.DataFlow = DataFlow;

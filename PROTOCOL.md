# Data Flow connection protocol — v1

The contract between the SDK (`site/v1/`) and Data Flow. The SDK implements the
app side. Data Flow implements the rest: its worker (`dataflow-api`), a consent
page and a "connected app" input palette.

**Status:** both sides are built. Data Flow's side is on its `sdk_compat` branch
and isn't deployed yet. Until it is, every route below answers 404 and the widget
shows *"This Data Flow cannot accept app connections yet."*

Data Flow's worker also has routes that only Data Flow itself calls: `pending`,
`answer`, `list`, `collect`, `ack` and `forget`. They are not part of this contract.
A full queue of waiting deliveries (200 per user) is refused with
`429 { code: "queue_full" }`, not dropped. The SDK shows its `error` as-is.

## Parties

- **App:** a Puter app using the SDK. It runs as the signed-in user.
- **User:** the person signed in to Puter. They are the same Puter account in the
  app and in Data Flow.
- **Data Flow:** the user's own Data Flow, plus its worker
  `https://dataflow-api.puter.work`.

The user's Puter session is the only addressing. Every route takes the user from
the session that `puter.workers.exec()` attaches, never from the body. An app can
only reach the Data Flow of the person using it.

## 1. Manifest

`DataFlow.define(manifest)` checks the manifest and normalises it into the form
below. That normalised form is what travels.

```json
{
  "app": "carisma",
  "palette": {
    "label": "Carisma",
    "description": "Your investor ledger.",
    "icon": { "menu": "data:image/png;base64,…", "canvas": "data:image/png;base64,…" }
  },
  "streams": [{
    "id": "ledger", "label": "Ledger", "mode": "snapshot", "key": "entryId",
    "fields": [
      { "name": "entryId", "type": "string", "required": true },
      { "name": "date", "type": "date", "precision": "date", "required": true },
      { "name": "owed", "type": "money", "currency": "EUR", "required": false }
    ]
  }],
  "hash": "<sha-256 hex of the canonical JSON of everything above>"
}
```

| Key | Rule |
|---|---|
| `app` | The app's registered Puter name: `^[a-z0-9][a-z0-9_-]{0,63}$`, case-insensitive. |
| `palette.label` | 1–24 characters. The palette's name in the menu and its default node name. |
| `palette.description` | 0–280 characters. The palette's info text. |
| `palette.icon.menu` | 32×32 PNG. Shown at 16 px where a built-in palette shows its Lucide glyph. |
| `palette.icon.canvas` | 56×56 PNG. Shown at 28 px, filling the node's icon tile (`.flow-node-icon`). |
| `streams` | 1–4. **One output port each**, in order, labelled `label`. |
| `stream.id` | `^[a-z][a-z0-9_]{0,31}$`, unique. |
| `stream.mode` | `append`: records add. `snapshot`: each `replace()` is the stream's complete current set. |
| `stream.key` | A `string` or `number` field, always required. This is the Key ID the receiver matches on. Required for `snapshot`. |
| `fields` | 1–64 per stream. Each name is unique and at most 64 characters, with no leading or trailing spaces. |
| `field.type` | `string`, `boolean`, `number`, `date`, `money`, `json`, `file`, `files`. |
| `field.currency` | Money only, and required for it. One of AED AUD CAD CHF CNY EUR GBP JPY USD. |
| `field.precision` | Date only, optional: `date`, `time` or `datetime`. |

**The icon.** The SDK refuses any icon that is not a perfect square, is smaller
than 64 px, is larger than 4096 px, or can't be read by the page (CORS). Accepted
formats are PNG, JPEG, WebP, GIF and SVG (an SVG must declare its width and
height). The two sizes above are drawn from the source, so Data Flow never sees
the original.

**The hash.** The user approves *a hash*. Any change to the manifest, its icon
included, gives a new hash. A connection approved under another hash is
`outdated`: Data Flow must refuse its sends, and the user must approve again.

## 2. Records on the wire

Each record is exactly the body Data Flow's inbound API already accepts
(`site/js/core/apiformat.js`):

```json
{ "data": [
  { "name": "entryId", "type": "string", "value": "EX-000-car_12" },
  { "name": "owed", "type": "money", "currency": "EUR", "value": 24900 }
] }
```

- `file` travels as `type: "string"` holding a base64 `data:` URI.
- `files` travels as `type: "json"` holding an array of 1–20 such URIs.
- Each file is at most 10 MB. A file anywhere other than a file field is refused.
- A field the record leaves out is omitted. There is no null.
- A money `value` already fits its currency's decimals. The SDK refuses more
  decimals rather than rounding.

**Data Flow must re-check every record against the APPROVED manifest.** A
record's field must exist in that stream, have the declared type, and use the
declared currency. The SDK's checks protect honest apps from their own mistakes.
The worker's checks are the ones that count.

## 3. Routes

All are `POST` to `https://dataflow-api.puter.work`, carry a JSON body, and use
`puter.workers.exec()` (Puter session in the `puter-auth` header).

| Status | When |
|---|---|
| 401 | No Puter session. The SDK shows "Sign in". |
| 404 | The route doesn't exist (Data Flow without connections). The SDK shows "unavailable". |
| 4xx with `{ ok: false, error, code }` | Refused. `error` is shown to the user as-is, so write it for them. |

The `code` values the SDK reacts to are `not_connected` and `outdated`. On
either one it re-reads the connection's status.

### `/connect/status`
`{ app }` → `{ ok: true, state, hash? }`

| `state` | Meaning |
|---|---|
| `none` | No connection, and no pending request. |
| `pending` | A request is parked and not yet answered. |
| `connected` | Approved. `hash` is the manifest hash the user approved. |
| `denied` | The user declined the latest request. |

### `/connect/request`
`{ app, requestId, manifest }` → `{ ok: true }`

Parks a consent request under `requestId` (32 hex characters, made by the SDK)
for the session's user.
- `manifest.app` must equal `app`.
- The worker validates the manifest by the rules in §1, and recomputes `hash`
  rather than trusting the one sent.
- It records the request's **`Origin` header**, so the consent page can show the
  user where the request came from.
- It refuses an origin that isn't a Puter app: `https://*.puter.site`, Puter's own
  app origins, and `http://localhost:*` only for the worker's owner while
  developing.
- A request expires after 10 minutes.
- One pending request is kept per user per app; a new one replaces it.

### `/connect/send`
`{ app, stream, hash, records: [wire body…], snapshot? }` → `{ ok: true, accepted }`

Refused with `not_connected` unless the connection is `connected`, and with
`outdated` unless `hash` equals the approved hash.
- Every record is validated against the approved manifest's stream. A failure
  refuses the whole request.
- Files go to the user's files worker exactly as `/in/:slug` does.
- Records join the user's inbox, tagged with the connection's palette node and
  output port.
- One request holds at most 200 records and 256 KB, file bytes not counted.

`snapshot` (snapshot streams only, and always present for them):
`{ id, part, parts }`.
- `id` is 32 hex characters.
- `part` runs 0 … `parts`−1.
- Data Flow applies the snapshot **only once every part of `id` has arrived**,
  replacing the stream's previous set; until then the previous set stands.
- `parts: 1` with `records: []` means the set is now empty.
- An unfinished snapshot is dropped when a newer `id` completes, or after
  10 minutes.

### `/connect/disconnect`
`{ app }` → `{ ok: true }`

Ends the connection. The palette and the rows it already delivered stay in the
user's flow. It just stops receiving.

## 4. Consent page

The SDK opens `https://dataflow.puter.site/#/connect/<requestId>` in a popup,
inside the click that switched the widget on. It opens before the request is
parked, so the page must wait (a few seconds) for the request to appear.

The page must:
1. Make sure the user is signed in to Data Flow, as themselves.
2. Load the parked request **for the signed-in user only**. A request id is never
   enough on its own.
3. Show the app name, the origin the request came from, the palette exactly as
   it will look (label, both icon sizes, output ports), and every field with its
   type.
4. On **Approve**: create the palette (or update an existing one for this app,
   keeping its wires), and record `{ hash, manifest, nodeId }` as the
   connection. On **Decline**: mark the request `denied`.
5. Close itself, or say it can be closed. The SDK learns the outcome by polling
   `/connect/status` every 2 seconds.

## 5. Not in v1

- **Server-side senders.** Every send is made by the user's own session. An app
  whose data is changed by someone else (for example Carisma, where the owner
  edits an investor's ledger) can only update the investor's Data Flow while the
  investor has the app open. A key-based route for a developer's own worker is a
  candidate for v1.x. It would only add to the protocol.
- **Two-way data.** Data Flow never writes back into the app.

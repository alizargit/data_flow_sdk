# Data Flow SDK

Lets a Puter app send its users' data into **their own**
[Data Flow](https://dataflow.puter.site). Each app becomes an input palette there,
which the user approves.

The app shows one switch. When the user turns it on, Data Flow asks them to
approve the connection. After that, the app's data arrives in their flow as an
input palette carrying the app's name and icon.

**Status:** the SDK (v1) is built, and so is Data Flow's side (its consent page
and worker routes). Data Flow's side isn't deployed yet, and until it is the
widget says so. See [PROTOCOL.md](PROTOCOL.md).

## Use

```html
<script src="https://js.puter.com/v2/"></script>
<div id="dataflow"></div>
<script type="module">
  import { DataFlow } from 'https://dataflow-sdk.puter.site/v1/dataflow-connect.js';

  const conn = await DataFlow.define({
    app: 'my-app',                                  // your registered Puter app name
    palette: {
      label: 'My App',                              // the palette's name in Data Flow
      description: 'Orders from My App.',
      icon: '/assets/icon-512.png',                 // perfectly square, at least 64 px
    },
    streams: [{
      id: 'orders', label: 'Orders', mode: 'append', key: 'orderId',
      fields: [
        { name: 'orderId', type: 'string', required: true },
        { name: 'placed',  type: 'date', precision: 'datetime' },
        { name: 'total',   type: 'money', currency: 'EUR' },
      ],
    }],
  });

  conn.mount(document.getElementById('dataflow'));  // the switch

  conn.on('change', async ({ state }) => {
    if (state === 'on') await conn.send('orders', [
      { orderId: 'PO-7', placed: '2026-08-02T14:30:00Z', total: 1250.5 },
    ]);
  });
</script>
```

- **`DataFlow.define(manifest)`** checks the whole manifest and lists every
  problem at once in a `ManifestError`.
- **`conn.send(stream, records)`** adds records to an `append` stream.
- **`conn.replace(stream, records)`** replaces everything a `snapshot` stream
  holds.
- **All or nothing.** If any record is wrong, nothing is sent, and the
  `RecordError` lists every problem.
- **`DataFlow.check(conn, stream, records)`** runs the same checks without
  sending.

### What Data Flow accepts

| Type | Value | Note |
|---|---|---|
| `string` | `"Acme"` | |
| `boolean` | `true` | Not `"true"`. |
| `number` | `42` | Finite. |
| `date` | `"2026-08-02"`, `"14:30:00Z"`, `"2026-08-02T14:30:00Z"` | ISO 8601, UTC. A real day. `precision` narrows it to one form. |
| `money` | `1250.5` | In the field's declared `currency`, with no more decimals than that currency has. |
| `json` | `{ "ref": "PO-7" }` | An object or array. Not a string holding one. |
| `file` | `"data:application/pdf;name=a.pdf;base64,…"` | Up to 10 MB. Stored on the user's drive. |
| `files` | `["data:…", …]` | 1–20 files. |

There is no null: leave a field out instead. Nothing is converted for you.

### The icon

It must be **perfectly square** and at least 64×64 px. Accepted formats are PNG,
JPEG, WebP, GIF, or SVG with its own width and height. Pass any of:

- a URL, absolute or relative to your page;
- a `data:` URI;
- a `Blob` or `File`.

A URL on another origin must be served with CORS headers, or the browser won't
let the SDK read the pixels. The SDK shrinks the icon to the two sizes Data Flow
shows (16 px in the palette menu, 28 px on the canvas) and sends only those small
copies, never your original file.

## Keeping Data Flow up to date

**Your app pushes; Data Flow never pulls.** Data Flow only receives what you send,
while a connection is `on`. It collects deliveries within seconds whenever the user
has Data Flow open, and they wait for it while it's closed.

**Pick the mode by what your data is:**

- **`snapshot`, with `replace()`**: for data that has a current state, such as a
  ledger, an inventory or a list of accounts. Each call sends the stream's
  *complete* current set:
  - rows that changed update in place in the user's Tables;
  - rows you no longer send are removed;
  - unchanged rows are left alone.

  Sending the same set twice changes nothing, so a snapshot is always safe to
  resend.
- **`append`, with `send()`**: for events that happen once, such as an order
  placed or a payment made. Each record is added. Give the stream a `key`: then
  a record sent twice updates the row it already made, instead of adding a second
  one.

**When to send:**

1. **When the connection turns on.** Send the current state then, so a new
   connection starts complete:
   ```js
   conn.on('change', ({ state }) => { if (state === 'on') syncAll(); });
   ```
2. **After the data changes.** For a snapshot, debounce it: wait a second or two
   after the last edit, then `replace()` the whole set once. For append records,
   send each event when it happens, or gather them and send one batch. Both work.
3. **When your app opens.** Call `syncAll()` again if `conn.state === 'on'`. This
   catches up anything that changed while the app was closed.

**Limits.** The SDK splits large calls into requests for you.

| Limit | Value |
|---|---|
| Records per `send()` or `replace()` call | 5,000 |
| One request (the SDK splits for you) | 200 records or 256 KB, files not counted |
| One record | 256 KB, files not counted |
| One file | 10 MB; up to 20 per `files` field |
| Deliveries waiting for Data Flow to collect | 200 per user. Past that, sends are refused with `code: 'queue_full'` until the user opens Data Flow. |

**When a send fails.** Sends reject with a `RecordError` when your data is wrong
(fix the data), or with a `ConnectError` for anything else. Its `code` says which:

| `code` | Meaning | What to do |
|---|---|---|
| `network` | Data Flow couldn't be reached. | Retry later. A snapshot or a keyed stream makes the retry harmless. |
| `queue_full` | Too much is waiting to be collected. | Retry later. |
| `not_connected` | The user switched the connection off. | Stop sending. The widget already shows it. |
| `outdated` | Your manifest changed since the user approved it. | The user switches on again to re-approve. Until then nothing can be sent. |
| `too_large` | One record is over the size limit. | Make it smaller. |

**One limit to design around.** Every send is made by the signed-in user's own
session, so your app can only send while that user has it open. If other people
change a user's data, as in an app where an administrator edits records for many
users, those changes reach the user's Data Flow the next time *they* open your
app and step 3 runs. Sending from your own server while the user is away isn't
part of v1 (see [PROTOCOL.md](PROTOCOL.md) §5).

## Consent and accounts

- **Approval is per Puter account, and per app.** The user approves your app on
  Data Flow's own page, signed in to Puter. The approval belongs to that account
  and your registered app name. Another Puter account using the same browser sees
  the switch off.
- **Use the same account in both places.** Records go into the Data Flow of
  whoever is signed in to your app. A user with two Puter accounts must use the
  same one in your app and in Data Flow.
- **Signing out doesn't end it.** The approval is stored by Data Flow, not in your
  app or the browser. While the user is signed out, the widget asks them to sign
  in. After they sign in again, on any device, the connection is `on` again with
  no new approval. Your app keeps nothing about the connection, so there is
  nothing for it to save or restore.
- **What ends it:**
  - the user switches the widget off;
  - the user disconnects or removes your app in Data Flow;
  - the user uses Data Flow's "Delete all my data".

  Records already delivered stay in the user's flow. If the user changes the
  connection in Data Flow while your app is open, the next send rejects with
  `not_connected` and the widget updates. Call `conn.refresh()` to check sooner.
- **Changing your manifest asks again.** Any change, including your icon, gives the
  manifest a new hash. The widget shows that the app changed, and the user approves
  it again before anything new can be sent. See
  [PROTOCOL.md](PROTOCOL.md) §1.

## Layout

| Path | What it is |
|---|---|
| `site/` | Exactly what is hosted at `https://dataflow-sdk.puter.site`. |
| `site/v1/` | The SDK. `dataflow-connect.js` is the entry; `lib/` holds its modules (each opens with a header comment). |
| `site/example/` | A working example: the widget in every state, the palette preview, and the checks. |
| `PROTOCOL.md` | The contract Data Flow implements. |
| `CHANGELOG.md` | Every release, newest first. |

## Versions and releases

**Import a major version folder** (`/v1/`), not a file name with a version in it.
Puter hosting sends `Cache-Control: no-store`, so every app loads the current
release of that folder on every page load. There is nothing to update in your app
for a v1 release.

**Within `v1`, releases only add things:** new optional manifest keys, new methods,
and rules that accept more than before. Nothing your app relies on is removed or
tightened. A breaking change goes into a new `/v2/` folder beside `/v1/`, which
keeps working.

**How you hear about a release:**

- Every release is listed in [CHANGELOG.md](CHANGELOG.md) and tagged on GitHub as
  `v<version>` (for example `v1.0.0`).
- **Watch → Custom → Releases** on the GitHub repository notifies you of each one.
- At runtime, `DataFlow.VERSION` names the release your page loaded.

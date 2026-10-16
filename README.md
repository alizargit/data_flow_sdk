# Data Flow SDK

Lets Users on puter.com send their data from an app on Puter to **their own**
[Data Flow](https://dataflow.puter.site). Each app becomes an input palette there,
which the user approves.

The app shows one switch. When the user turns it on, Data Flow asks them to
approve the connection. After that, the app's data arrives in their flow as an
input palette carrying the app's name and icon.

**Status:** v1 is live, at `https://dataflow-sdk.puter.site/v1/`, and so is
Data Flow's side. See [CHANGELOG.md](CHANGELOG.md) for the current release and
[PROTOCOL.md](PROTOCOL.md) for the contract.

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
    keys: [                                         // every Key ID your records carry
      { name: 'customerId', label: 'Customer' },
      { name: 'orderId', label: 'Order', parent: 'customerId' },
    ],
    streams: [{
      id: 'orders', label: 'Orders', mode: 'append', key: 'orderId',
      fields: [
        { name: 'orderId',    type: 'key_id' },
        { name: 'customerId', type: 'key_id' },
        { name: 'placed',     type: 'date', precision: 'datetime' },
        { name: 'total',      type: 'money', currency: 'EUR' },
      ],
    }],
  });

  conn.mount(document.getElementById('dataflow'));  // the switch

  conn.on('change', async ({ state }) => {
    if (state === 'on') await conn.send('orders', [
      { orderId: 'PO-7', customerId: 'C-12', placed: '2026-08-02T14:30:00Z', total: 1250.5 },
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

### Manifest reference

| Key | Required | Rule | What Data Flow does with it |
|---|---|---|---|
| `app` | yes | Your registered Puter app name: letters, digits, `-`, `_`. | Names the connection. Shown on the consent page. |
| `palette.label` | yes | 1–24 characters. | The palette's name in the menu, and the node's default name. |
| `palette.description` | no | Up to 280 characters. | Shown on the consent page and in the node's panel. |
| `palette.icon` | yes | See [The icon](#the-icon). | The palette's icon in the menu and on the canvas. |
| `keys` | yes | 1–16. Every Key ID your records carry, each used by some stream. See [Record IDs](#record-ids). | Each becomes a Key ID in the user's Data Flow, or is mapped onto one of theirs. |
| `key.name` | yes | Same rule as a field name. Unique. | The `key_id` fields of that name carry it. |
| `key.label` | no | Up to 64 characters. | Shown on the consent page. |
| `key.parent` | no | Another declared key. No cycles, at most 4 levels. | This key lives inside that one. |
| `key.references` | no | Other declared keys, not its own ancestors or descendants. | This key points at those, without living inside them. |
| `streams` | yes | 1–4. | One output port each, in this order. |
| `stream.id` | yes | Lower-case letters, digits and `_`, starting with a letter, up to 32 characters. Unique. | How you name the stream in `send()` and `replace()`. Wires follow it if you reorder streams. |
| `stream.label` | no | Up to 24 characters. Defaults to `id`. | The output port's label. |
| `stream.mode` | no | `append` (default) or `snapshot`. | See [Keeping Data Flow up to date](#keeping-data-flow-up-to-date). |
| `stream.key` | yes | The name of a `key_id` field. That field becomes required. | The record's identity: a Table updates the row with the same key instead of adding a new one. |
| `field.name` | yes | 1–64 characters, no leading or trailing spaces. Unique in its stream. | The column's key, and the name records use. |
| `field.label` | no | Up to 64 characters. | The column's heading in Data Flow, and the field's name on the consent page. Records still use `name`. |
| `field.type` | yes | `string`, `boolean`, `number`, `date`, `money`, `json`, `key_id`, `file`, `files`. | The column's type. See the table below. |
| `field.required` | no | `true` or `false` (default). | A record without it is refused. |
| `field.currency` | for `money` | AED, AUD, CAD, CHF, CNY, EUR, GBP, JPY or USD. | Every amount for the field is in this currency. |
| `field.precision` | no, `date` only | `date`, `time` or `datetime`. | Only that one date form is accepted. |

### Record IDs

Your records' identities are **Key IDs** in Data Flow, which its Tables match
rows on. Your app supplies the values. Data Flow never invents them.

**Declare every one in `keys`, with how they relate.** These are the same two
relations Data Flow's own Key ID tree uses:

```js
keys: [
  { name: 'carId',      label: 'Car' },
  { name: 'investorId', label: 'Investor' },
  { name: 'entryId',    label: 'Ledger entry', parent: 'carId', references: ['investorId'] },
],
```

- **`parent`:** this key lives inside that one. A ledger entry belongs to one
  car.
- **`references`:** this key points at another without living inside it. An
  entry names its investor.
- **A key with neither is top level.**

Then, in each stream:

- **`key` is the record's identity.** It is a `key_id` field and always required.
  Every stream has one.
- **Every other `key_id` field must be related to it:** an ancestor of the key,
  which is then required too, or one the key references. So each record has
  exactly one identity. A value that identifies nothing (a free-text code) is a
  `string`, not a `key_id`.

The rules for values:

- **Stable and unique.** The same record always sends the same value, and no two
  records share one. A changed value is a different record.
- **A child's values are unique on their own**, not only within the parent. Data
  Flow matches on the child alone. Building it from the parent works well, for
  example `car_12:1`.
- **Pick distinctive names.** Unmapped Key IDs are shared by name, so `contactId`
  is a better name than `id`.

**The user decides what each key means in their flow.** In the Key ID banner on
your palette's page in Data Flow, each key can be:
- **mapped** onto one of their own Key IDs, where their tree matches yours:
  - a top-level key maps onto a top-level Key ID of theirs;
  - a key with children maps only onto a Key ID with children;
  - a child maps only onto a child of the Key ID its parent was mapped onto.

  Your values are then used as they are, so they must match theirs to join the
  same records.
- left as **its own** Key ID. Data Flow registers it under your name, in your
  tree, and keeps your values from colliding with another source's equal values.

### What Data Flow accepts

| Type | Value | Note |
|---|---|---|
| `key_id` | `"car_12:1"` or `42` | A declared key. A string must be trimmed and 1–200 characters; a number must be finite. |
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
let the SDK read it. The SDK shrinks the icon to the two sizes Data Flow shows
(16 px in the palette menu, 28 px on the canvas) and sends only those small
copies, never your original file.

**The approval covers your icon file, not the copies.** Browsers draw the small
copies slightly differently, so they aren't the same from one browser to the
next. The manifest's fingerprint therefore uses the SHA-256 of your icon file's
own bytes:

- the same icon file gives the same approval in every browser;
- a new icon file means the user approves again.

If you build the icon in the page (a `Blob` drawn at runtime), keep its bytes
stable, or users will be asked again.

## The widget

`conn.mount(container, options)` adds it to `container`. You can also place
`<dataflow-connect>` in your page yourself and set its `connection` property.

- **Language.** English and Portuguese are built in. The widget uses
  `options.lang` (or a `lang` attribute on the element) if you give one,
  otherwise your page's `<html lang>`, otherwise English:
  ```js
  conn.mount(el, { lang: 'pt' });   // 'pt', 'pt-PT' and 'pt-BR' all choose Portuguese
  ```
  Without its own `lang`, the widget follows `<html lang>` as it changes, so an
  app with a language switch that sets `<html lang>` needs to do nothing more.
- **Your own words.** `options.text` (or the element's `text` property) replaces
  any string. Keys are listed in `DataFlow.TEXT.en`. A value is text, or a
  function of your palette label:
  ```js
  conn.mount(el, { lang: 'pt', text: { off: label => `Enviar o razão de ${label} para o Data Flow.` } });
  ```
  "Data Flow" itself is a name and isn't translated.
- **Look.** It is a fixed panel in Data Flow's colours, so users recognise it as
  Data Flow's. Only its width is yours to set, up to 440 px.

### Inside the Puter desktop

When an app runs inside the Puter desktop, it runs in an iframe. Switching on
first tries to open Data Flow's consent page in a new window. If the browser or
the frame doesn't allow that, the request is still made, and the widget shows an
**Open Data Flow** link instead. A click on a link is allowed where a scripted
window isn't. Either way the widget turns on by itself once the user approves.

### Developing on localhost

The SDK runs on `http://localhost` and `http://127.0.0.1` as well as on Puter
(`*.puter.site`, or inside the Puter desktop). Data Flow accepts connections from
localhost from any developer. The consent page tells the user the request comes
from a development copy on their own computer, and they approve it as usual.
Sign in to Puter on your local page with the account you'll test with.

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
  placed or a payment made. Each record is added. Its `key` (every stream has
  one) means a record sent twice updates the row it already made, instead of
  adding a second one.

**What a snapshot does in Data Flow.** Data Flow compares each snapshot with the
previous one by `key`:

- **New keys** add a row.
- **Changed records** update the row with that key in place.
- **Keys you stopped sending** remove that row.
- **Unchanged records** aren't touched at all, so a column the user added or a
  cell they edited in a Table stays, until that record changes.
- **Locked cells and rows** in the user's Tables are kept, even when your
  snapshot would change or remove them. The user is told.

Data Flow keeps no history of earlier versions of a row: the Table always shows
the latest. Wires belong to the palette, not to the data, so no snapshot changes
them.

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
| `network` | Data Flow couldn't be reached. | Retry later. Every stream is keyed, so the retry is harmless. |
| `queue_full` | Too much is waiting to be collected. | Retry later. |
| `not_connected` | The user switched the connection off. | Stop sending. The widget already shows it. |
| `outdated` | Your manifest changed since the user approved it. | The user switches on again to re-approve. Until then nothing can be sent. |
| `too_large` | One record is over the size limit. | Make it smaller. |

**One limit to design around.** Every send is made by the signed-in user's own
session, so your app can only send while that user has it open. If other people
change a user's data, as in an app where an administrator edits records for many
users, those changes reach the user's Data Flow the next time *they* open your
app and step 3 runs.

Sending from your own server while the user is away isn't part of v1. A
key-based sender for an app's own worker is being considered: the user would
approve it on the consent page, and your worker would send with a key scoped to
that one user and your manifest. It isn't scheduled yet. If you need it, open an
issue on the GitHub repository so it can be prioritised.

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
keeps working. **The one exception is 1.2.0.** It made Key IDs a declared type
inside v1, before any app had shipped against it (see the CHANGELOG).

**When a release goes live.** `https://dataflow-sdk.puter.site/v1/` is deployed
from this repository at the same time a release is tagged. The hosted `/v1/`
files are always the latest `v1.x` tag. Untagged commits on `master` aren't
deployed.

**How you hear about a release:**

- Every release is listed in [CHANGELOG.md](CHANGELOG.md) and tagged on GitHub as
  `v<version>` (for example `v1.1.0`).
- **Watch → Custom → Releases** on the GitHub repository notifies you of each one.
- At runtime, `DataFlow.VERSION` names the release your page loaded.

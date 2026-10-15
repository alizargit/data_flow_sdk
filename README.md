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
JPEG, WebP, GIF, or SVG with its own width and height. Serve it from your app or
with CORS. The SDK shrinks it to the two sizes Data Flow shows: 16 px in the
palette menu, 28 px on the canvas.

## Layout

| Path | What it is |
|---|---|
| `site/` | Exactly what is hosted at `https://dataflow-sdk.puter.site`. |
| `site/v1/` | The SDK. `dataflow-connect.js` is the entry; `lib/` holds its modules (each opens with a header comment). |
| `site/example/` | A working example: the widget in every state, the palette preview, and the checks. |
| `PROTOCOL.md` | The contract Data Flow implements. |

## Versions

Puter hosting sends `Cache-Control: no-store`, so every app always loads the
current file of the version folder it imports. Within `v1`, changes only add
things: new optional keys and looser rules. A breaking change goes into a new
`v2/` folder beside it.

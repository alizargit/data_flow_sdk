# Changelog

Each release of the SDK is listed here, newest first, and tagged on GitHub as
`v<version>`. Within a major version, releases only add things (1.2.0 is the one
exception, explained there); see
[Versions and releases](README.md#versions-and-releases).

## 1.2.0 — 2026-10-16

**Breaking, on purpose, inside v1.** No app had shipped against v1 yet, so Key
IDs changed in place instead of starting `/v2/`. A 1.1 manifest is refused until
it is updated as below. Data Flow then asks the user to approve it again.

- **New `keys` list.** Declare every Key ID your records carry, once for the
  whole app, and how they relate: `parent` (lives inside another) and
  `references` (points at another). See the README, "Record IDs".
- **New field type `key_id`.** It travels as `key_id`, holding a trimmed string
  of 1–200 characters or a finite number.
- **Every stream needs a `key`**, append streams included, and it must be a
  `key_id` field. Records delivered twice then update instead of duplicating.
- **One identity per record.** Every other `key_id` field in a stream must be an
  ancestor of the stream's key (and is required with it) or one the key
  references.
- In Data Flow the user maps each of your keys onto their own Key IDs, but only
  where their tree matches yours.

## 1.1.2 — 2026-10-16

- The widget has a 1 px mid-bright border (`#6f88a8`, a lighter shade of its own
  navy), so the panel stays distinct on a dark page or one in the same navy.

## 1.1.1 — 2026-10-15

- The widget follows `<html lang>` as it changes, when it has no `lang` of its
  own.
- A 404 from Data Flow is checked against `GET /`'s `features`: "cannot accept
  app connections yet" is shown only when `app-connect` is missing. Any other
  404 is reported as what it is, with `code: 'not_found'`.
- Data Flow's worker with the connection routes is live.

## 1.1.0 — 2026-10-15

- **The widget speaks Portuguese.** `conn.mount(el, { lang: 'pt' })`, a `lang`
  attribute, or the page's `<html lang>`. Any string can be replaced with
  `{ text }`; the keys are in `DataFlow.TEXT`.
- **Works inside the Puter desktop.** When the consent window can't be opened,
  the widget shows an **Open Data Flow** link instead of failing.
- **One approval in every browser.** The manifest's fingerprint now covers the
  icon by the SHA-256 of its source file, not by the resized copies, which differ
  between browsers. Requires Data Flow's worker from the same date.
- **Localhost for every developer.** Data Flow accepts connections from
  `http://localhost` and `http://127.0.0.1` from anyone, marked on the consent
  page as a development copy.
- `connection.code` names why a state was reached (`declined`, `timeout`,
  `open_link`, …), and `connection.consentUrl` holds the link while one is shown.
- Docs: manifest reference (including `field.label`), what a snapshot does,
  the widget's options, the Puter desktop, localhost, and when releases go live.

## 1.0.0 — 2026-10-15

First release, served at `https://dataflow-sdk.puter.site/v1/`.

- `DataFlow.define(manifest)`: palette label, description and icon, and 1–4
  streams of typed fields in `append` or `snapshot` mode.
- `conn.send()` for append streams, `conn.replace()` for snapshot streams, and
  `DataFlow.check()` to validate without sending.
- `<dataflow-connect>`, the widget, through `conn.mount()`.
- Icons are checked square and drawn at Data Flow's palette sizes.
- Records are checked against Data Flow's formats, all or nothing.

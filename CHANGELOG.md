# Changelog

Each release of the SDK is listed here, newest first, and tagged on GitHub as
`v<version>`. Within a major version, releases only add things; see
[Versions and releases](README.md#versions-and-releases).

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

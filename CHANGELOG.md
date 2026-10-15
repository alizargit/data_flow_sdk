# Changelog

Each release of the SDK is listed here, newest first, and tagged on GitHub as
`v<version>`. Within a major version, releases only add things; see
[Versions and releases](README.md#versions-and-releases).

## 1.0.0 — 2026-10-15

First release, served at `https://dataflow-sdk.puter.site/v1/`.

- `DataFlow.define(manifest)`: palette label, description and icon, and 1–4
  streams of typed fields in `append` or `snapshot` mode.
- `conn.send()` for append streams, `conn.replace()` for snapshot streams, and
  `DataFlow.check()` to validate without sending.
- `<dataflow-connect>`, the widget, through `conn.mount()`.
- Icons are checked square and drawn at Data Flow's palette sizes.
- Records are checked against Data Flow's formats, all or nothing.

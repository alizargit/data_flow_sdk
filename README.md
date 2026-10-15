# Data Flow SDK

A client library that lets a Puter app connect to a user's own
[Data Flow](https://dataflow.puter.site) and send records into it, after the user
approves the connection in Data Flow.

**Status:** under construction. No version is released yet.

## Layout

| Path | What it is |
|---|---|
| `site/` | Exactly what is hosted at `https://dataflow-sdk.puter.site`. Released builds live in versioned folders (`site/v1/…`); a published version path is never broken, only added to. |

## Hosting

Served by Puter static hosting. Files are sent with `Access-Control-Allow-Origin: *`
and `Cache-Control: no-store`, so every app loads the current file of the version
folder it names.

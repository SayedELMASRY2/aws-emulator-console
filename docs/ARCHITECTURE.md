# Architecture

```
Browser (React + Cloudscape)  ──/api/*──▶  server.py (stdlib HTTP + boto3)  ──HTTPS + SigV4──▶  AWS Emulator (127.0.0.1:9297)
        ▲                                         │
        └──────────── web/dist, /legacy/ ◀────────┘
```

## server.py

This is a single file, using only the standard library plus boto3.

**Clients**

- One boto3 client per service, cached in `CLIENTS`.
- The endpoint is `https://EMULATOR_HOST:EMULATOR_PORT`, verified against the emulator's CA at `~/.aws/emulator/<port>/ca.pem`.
- Credentials are read from `~/.aws/emulator/<port>/emulator_credentials`. They change on every emulator start, and the server reloads them.
- Client config:
  - `signature_version="s3v4"`: SigV2 presigned URLs get 403 from the emulator.
  - Path-style S3 addressing.
  - `inject_host_prefix=False`: the emulator has no per-host prefixes.
  - A single attempt, so errors surface right away.

**Routes**

| Route | Purpose |
|---|---|
| `POST /api/call` | `{service, operation, params}` → `{result}`. Generic boto3 call with PascalCase operation names. Responses are made JSON-safe: datetimes, Decimals and bytes are converted, and StreamingBody is read. |
| `GET /api/health` | Whether the emulator is up, plus endpoint, region and account |
| `GET /api/meta/services`, `/api/meta/operations`, `/api/meta/operation` | Botocore model data, used by the API Explorer |
| `POST /api/s3/upload` | Raw body upload. PutObject options arrive base64-JSON in `X-Upload-Options` and are filtered against an allowed list. |
| `GET /api/s3/download` | Streams an object, as an attachment or with `inline=1` |
| `POST /api/s3/presign` | Presigned GET or PUT URL |
| `POST /api/lambda/code` | Creates or updates a Lambda function from inline code (zipped on the server) |
| `/legacy/*` | Serves `static/`, the first-generation pages |
| everything else | Serves `web/dist` with SPA fallback to `index.html` |

**CSRF guard.** API requests must carry `X-Emu-Console: 1`, and their Host/Origin must be local. Errors are returned as `{error: {code, message, status}}`. Emulator NotImplemented responses keep status 501, so the UI can explain them.

## web/

**Stack:** React 19, TypeScript, Vite, `@cloudscape-design/components` and `@cloudscape-design/collection-hooks`, with `react-router-dom` using a HashRouter.

### Core files

| File | What it holds |
|---|---|
| `api.ts` | `api.call(service, op, params)`, `upload`, `presign`, `downloadUrl`, plus `isNotImplemented` and `isNotConfigured`. |
| `common.tsx` | `FlashProvider` / `useFlash` (Flashbar notifications), `useAsync` (load/reload/error state), `ErrorAlert`, `EmulatorNote`, `ValueWithLabel`, `Copyable`, `ConfirmModal` (type-to-confirm), `fmtBytes` / `fmtDate`. |
| `App.tsx` | Shell: TopNavigation, a SideNavigation chosen by path prefix (each service exports its own `*_NAV`), breadcrumbs through `useCrumbs()`, and the service routes. |
| `services.ts` | Service catalog for the home page and the Services menu. `legacy: true` entries link to `/legacy/#...`. |

### Per-service folders: `pages/<service>/`

**Required in every service folder**

- `routes.tsx`: exports `<SVC>_NAV` (side nav, with unsupported items marked by an **n/a** badge) and the default `Routes` component.
- `lib.tsx` or `lib.ts`: holds the following.
  - A typed call helper, for example `rds(op, params)`.
  - A pagination helper.
  - A status indicator mapping.
  - Breadcrumb helpers.
  - Picker hooks.
- Page components, grouped by area.

**Shared building blocks** (in `pages/ec2/ResourcePage.tsx`, used everywhere)

- `ResourcePage<T>`: a full-page table that includes:
  - Filter, pagination and column preferences.
  - Selection, a primary-actions row and an Actions dropdown.
  - A create button and an optional detail panel.
  - Polling while rows are busy.
- `ActionModal`: a modal with async OK, busy state and inline errors.
- `useModal` and `forEachReport` (run an action on many rows and report failures).

**Patterns**

- Detail and edit pages are wrapped in `<Fresh>` (a Fragment keyed by `pathname + search`), so moving between two records of the same route remounts the page with fresh state.
- **Don't** change the URL's search params from inside a `<Fresh>` page to track UI state such as the active tab. That remounts the page and throws away unsaved edits.
- Creating a resource goes through a full page with `Container` sections, like AWS. Quick edits use `ActionModal`.

## static/ (legacy)

Vanilla JS pages from the first version, one file per service group in `static/pages/`. They're kept so every service has at least basic pages until it's migrated. Once a service has full pages, its `services.ts` entry points to the new route.

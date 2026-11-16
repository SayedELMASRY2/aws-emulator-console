# Adding (or migrating) a service

This is the process every full-console service so far followed. Follow it in order: **probe → plan → build → test → document**.

## 1. Probe the emulator first

Don't build pages for operations the emulator doesn't implement. With the emulator and `server.py` running, write a small script that calls the service through the console API. Keep it **outside the repo**, for example in `/tmp`.

```python
import json, urllib.request
def call(svc, op, p={}):
    req = urllib.request.Request("http://127.0.0.1:8297/api/call",
        data=json.dumps({"service": svc, "operation": op, "params": p}).encode(),
        headers={"X-Emu-Console": "1", "Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e: return {"ERR": e.read().decode()[:300]}

for op in ["DescribeThings", "ListOtherThings"]:
    print(op, json.dumps(call("svc", op))[:300])
```

1. Call every **List/Describe/Get** operation the console would use. Note which return `NotImplemented` (501).
2. Run the **mutations** end to end: create, modify, start/stop, delete, plus the "advanced" ones like snapshots, replicas and exports. Poll async status until it settles.
3. Check whether the service does **real work**: real endpoints on `127.0.0.1`, code execution, files written to S3. These are the most valuable things to expose in the UI.
4. **Mind IAM:** the emulator enforces it for work done on your behalf. Test with a role that has the right trust policy and permissions.
5. **Clean up** everything you created.
6. Record the findings in [EMULATOR_NOTES.md](EMULATOR_NOTES.md).

## 2. Plan the pages from the real AWS console

- Copy the AWS console's side navigation for the service, all of it. Items the emulator can't support go to `unsupported/<feature>` with an **n/a** badge and a one-line reason.
- For each resource, plan the following:
  - **List page:** columns, actions and create button.
  - **Create page or wizard:** the same sections and defaults as AWS.
  - **Detail page:** summary container plus tabs.
  - **Edit flows:** a page for big forms, a modal for single settings.
- Actions the emulator doesn't implement stay in menus, but disabled with `disabledReason`.

## 3. Build

Create `web/src/pages/<service>/` with these files:

| File | Contents |
|---|---|
| `lib.tsx` | Call helper (`const svc = (op, p) => api.call("svc", op, p)`), a pagination helper (NextToken/Marker), a status component mapping states to `StatusIndicator` types, crumbs helpers, picker hooks built on `useAsync`. |
| `routes.tsx` | `export const SVC_NAV` and the default `Routes`. Wrap detail and edit routes in `<Fresh>`. |
| Page files | Grouped by area, for example `Databases.tsx`, `CreateDatabase.tsx`, `DatabaseDetail.tsx`. |

Wire it up:

1. In `App.tsx`: import the routes and nav, add `if (path.startsWith("/svc")) return SVC_NAV;`, and add `<Route path="/svc/*" …>`.
2. In `services.ts`: replace the `L(...)` legacy entry with a full entry pointing to `#/svc/...`.

Reuse what exists:

- `ResourcePage`, `ActionModal`, `forEachReport` (`pages/ec2/ResourcePage.tsx`).
- `useAsync`, `useFlash`, `ErrorAlert`, `EmulatorNote`, `ValueWithLabel`, `Copyable` (`common.tsx`).
- `Tags` (`pages/s3/fields.tsx`) with `toTagSet` / `fromTagSet` (`pages/s3/lib.ts`).
- VPC, subnet and security group pickers (`pages/ec2/lib.tsx`).

Cloudscape rules learned the hard way:

- **Buttons inside a `<form>`** need `formAction="none"`, or they submit it.
- **Don't use `expandToViewport` on selects inside modals.** Clicking an option counts as an outside click and closes the modal.
- **Wrap conditional groups of fields in `SpaceBetween`, not a fragment.** A parent `SpaceBetween` treats a fragment as one child, and the fields end up crammed together.
- **Success flashes auto-dismiss after 8 s.** Use `type: "info"` for anything the user must copy, like generated passwords.
- **Don't update the URL's search params to track tabs inside a `<Fresh>` page.** It remounts the page and loses edits.
- **Selects:** give long lists `filteringType="auto"`.

## 4. Test in a browser

1. Build with `cd web && npm run typecheck && npm run build`, then reload `http://127.0.0.1:8297/?v=<n>#/svc/...`. The query string busts the cache.
2. **Sweep every route** with a script in the browser console. It visits each hash, waits, and collects error alerts and `console.error` output (ignore `ResizeObserver`). Every page must render without errors.
3. Run the **main flows through the UI**, not the API: create the main resource with non-default settings, modify it, run its actions, and delete it. Then verify on the emulator, through the API, that each setting landed.
4. Clean up test resources, or leave a small, clearly named demo set and say so.

Browser automation tips:

- Cloudscape `Select` options don't respond to `element.click()`. Dispatch `pointerdown, mousedown, pointerup, mouseup, click` on the option.
- Text inputs need real typing or a form-input tool, because React-controlled inputs ignore `.value =`.
- If the browser pane is hidden, screenshots can be stale. Read the DOM instead.

## 5. Document

- [STATUS.md](STATUS.md): pages, what was tested, and bugs fixed.
- [EMULATOR_NOTES.md](EMULATOR_NOTES.md): what works, what isn't implemented, and any emulator bugs.
- [ROADMAP.md](ROADMAP.md): mark the service done and adjust what's next.
- The README's "What works" table.

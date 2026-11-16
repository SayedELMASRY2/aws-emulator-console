# Instructions for AI agents

These instructions are for AI coding agents (Claude Code, Codex, Cursor and others) working on this repo. Read them before changing anything.

## What this project is

This repo is a local web console for the AWS Emulator that copies the real AWS Management Console. The goal is a page-for-page match with AWS: same navigation, page structure, wizards, field names, defaults, action menus and wording. The aim is not just a working CRUD UI.

- [README.md](README.md): setup.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits together.
- [docs/STATUS.md](docs/STATUS.md): what's done.
- [docs/ROADMAP.md](docs/ROADMAP.md): what's next.

## Ground rules

1. **Only talk to the local emulator.** `server.py` must keep binding to `127.0.0.1`, keep the `X-Emu-Console` / Host / Origin checks, and never call real AWS endpoints. Never add code that reads the user's real `~/.aws/credentials`.
2. **Probe before you build.** For a new service, follow [docs/ADDING_A_SERVICE.md](docs/ADDING_A_SERVICE.md) step 1. Never claim the emulator supports something you haven't seen work. Record findings in [docs/EMULATOR_NOTES.md](docs/EMULATOR_NOTES.md).
3. **Match the AWS console.** Use Cloudscape components the way AWS does:
   - `ContentLayout` with an h1 `Header`.
   - `Container` sections.
   - `Table` with `variant="full-page"` for lists.
   - `Wizard` where AWS uses one.
   - `Tabs` on detail pages.
   - `ButtonDropdown` "Actions" menus.

   Keep AWS's labels and descriptions.
4. **Unsupported does not mean hidden.** Keep AWS's navigation items and actions. Mark unsupported pages **n/a** (route `unsupported/<feature>` with a reason). Disable unsupported actions with `disabledReason`.
5. **Reuse the shared pieces** listed in ARCHITECTURE.md: `ResourcePage`, `ActionModal`, `useAsync`, `useFlash`, `ErrorAlert`, `EmulatorNote`, `Tags`, and the EC2 pickers. Don't add new UI libraries.
6. **One service per folder:** `web/src/pages/<service>/`, with `lib.tsx`, `routes.tsx` and the page files. Wire it into `App.tsx` and `services.ts`.
7. **Type-check and build** before you say something works: `cd web && npm run typecheck && npm run build`.
8. **Test in a real browser** (step 4 of the playbook). Sweep every route for errors, and run the main create/modify/delete flows through the UI, then check the result on the emulator. If you only tested something through the API, say so.
9. **Update the docs in the same change:** STATUS.md, EMULATOR_NOTES.md, ROADMAP.md, and the README table.
10. **Don't commit secrets or local state.** No `.venv`, `node_modules`, `web/dist`, emulator keys or logs. `.gitignore` covers them.

## Known pitfalls

- **Cloudscape forms and layout:**
  - Buttons inside a `<form>` need `formAction="none"`.
  - No `expandToViewport` on selects in modals.
  - Wrap conditional field groups in `SpaceBetween`, not fragments.
- **Page state:** pages wrapped in `<Fresh>` remount when `pathname` or `search` changes. Don't put tab state in the URL there.
- **boto3 and the emulator:**
  - Presigned URLs need SigV4 (configured).
  - RunInstances UserData is base64-encoded by boto3, so pass raw text.
  - DynamoDB export encryption must be `AES256`.
- **IAM is enforced** for emulator-run work (Glue, RDS exports). Use roles with the correct trust policy and permissions. The console's "create role" helpers do this for you.
- **Emulator state** lives in memory and is wiped on restart, and the keys rotate. `server.py` reloads the keys automatically.

## Useful commands

```bash
./start.sh                              # everything
.venv/bin/python server.py              # API + built UI on :8297
cd web && npm run dev                   # hot reload on :5297 (needs server.py running)
cd web && npm run typecheck && npm run build
aws-emulator --version                  # emulator version (docs were written against 1.0.385)
```

## Picking up work

1. Read [docs/ROADMAP.md](docs/ROADMAP.md). The next service is marked 🔜.
2. Start the emulator and the console, then probe the service.
3. Build following the playbook, test, update the docs, and open a PR with a short summary of what you tested.

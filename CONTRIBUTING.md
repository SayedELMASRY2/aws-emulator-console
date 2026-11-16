# Contributing

Thanks for helping! The most useful contribution is moving another service from the basic `/legacy/` pages to a full console that matches AWS.

## Setup

```bash
./start.sh                      # first run creates .venv and builds web/
cd web && npm run dev           # optional: hot reload on http://127.0.0.1:5297
```

You need the [AWS Emulator](https://github.com/aws/aws-emulator), Python 3.10+ and Node.js 20.19+ (or 22+).

## Workflow

1. Pick a service from [docs/ROADMAP.md](docs/ROADMAP.md), or an issue. Comment so others know you're on it.
2. Follow [docs/ADDING_A_SERVICE.md](docs/ADDING_A_SERVICE.md): probe → plan → build → test → document.
3. Before opening a PR:
   - Run `cd web && npm run typecheck && npm run build`, which must pass.
   - Open every page you touched, and check that no errors show in the page or the browser console.
   - Run the main create/modify/delete flow through the UI.
   - Update `docs/STATUS.md`, `docs/EMULATOR_NOTES.md`, `docs/ROADMAP.md` and the README table.
4. In the PR description, say what you tested in the browser, and what you only checked through the API.

## Style

- TypeScript with React function components and Cloudscape only. No other UI libraries.
- Keep AWS console wording, layout and defaults.
- One folder per service under `web/src/pages/`.
- `server.py` uses only the standard library plus boto3. Keep it that way.

## Reporting emulator issues

If something fails because of the emulator rather than the console, mention it in [docs/EMULATOR_NOTES.md](docs/EMULATOR_NOTES.md), and consider reporting it at [aws/aws-emulator](https://github.com/aws/aws-emulator/issues).

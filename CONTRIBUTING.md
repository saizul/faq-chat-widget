# Contributing

1. Fork, clone and run `npm install` (Node 22 or newer).
2. Make your change on a branch. Keep the widget dependency free: the only dev dependencies are the build and lint tools.
3. Add tests in `test/` for matcher, i18n or handoff changes (`npm test` uses `node --test`).
4. Run `npm run check` (lint, tests, build). All must pass.
5. For UI changes, run `npm run build && npm run serve`, open http://localhost:8080 and try keyboard-only use, Bangla input and dark mode.
6. Update `CHANGELOG.md` and open a pull request.

Security rule: the widget runs in public pages, so never add secrets, API keys or signing code to anything under `src/`.
Signing belongs on a server you control (see `server-example/`).

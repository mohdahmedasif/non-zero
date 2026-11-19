# Contributing to Non-Zero

Thanks for helping out. Non-Zero is a self-hosted habit tracker built with Fastify, React and SQLite.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before you take part.

## Keep private data out

Never commit, upload or paste:

- `.env`, `ADMIN_KEY`, PINs or push (VAPID) keys
- The `data/` folder, including `non-zero.db`, or any JSON export of a profile
- Real habit names, notes or entries

Use invented habits and placeholder tokens in tests and fixtures.

## Development setup

You need Node.js 24.

```bash
git clone https://github.com/mohdahmedasif/non-zero.git
cd non-zero
cp .env.example .env
npm install
npm run dev
```

## Checks before you open a PR

```bash
npm run typecheck
npm test
npm run build
```

CI runs the same checks on pull requests, so they're a useful preview.

## Pull requests

1. For a larger change, it helps to open an issue first to discuss the approach.
2. Keep each PR to one problem.
3. Follow the style of the surrounding code, and avoid reformatting files you aren't changing.
4. In the PR description, explain **why** the change is needed, not only what changed.
5. Fill in the PR template, including the privacy checklist.

## Good places to start

- Clearer empty states, error messages and labels
- Accessibility improvements in the UI
- Tests for the API routes and streak logic, using fake data
- Documentation fixes

## License

By contributing, you agree that your work will be released under the [MIT License](LICENSE).

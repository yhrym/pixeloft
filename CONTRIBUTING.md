# Contributing to Pixeloft

## Pull requests

**External pull requests are not accepted for now.** Pull requests from outside the project will be closed without review. Bug reports, feature ideas and questions are welcome as issues.

The rest of this page is for the maintainer's own development.

## Dev setup

```sh
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db   # DB_PORT=55432 if 5432 is taken
npm install
npx prisma migrate deploy
npm run dev
```

If you change `DB_PORT`, change the port in `DATABASE_URL` in `.env` too.

`npm run dev`, `build`, `test`, `lint`, `build:pages` and `build:thumbs` first run `scripts/plugins.mjs`, which reads `plugins/*/` and writes `src/plugins/generated/` (git-ignored). Run `node scripts/plugins.mjs` by hand if you use `next dev` or `tsc` directly.

## Tests and checks

Run these before committing:

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run build:pages   # if you touched the editor or the engine
```

Tests are `node:test` files named `*.test.ts` under `src/`.

## Rules

- **Catalog ids are never removed or renamed.** Items in `src/engine/catalog.js` are referenced by id from saved map JSON. Removing or renaming one breaks every map that uses it. Add new ids; do not touch existing ones. Existing props keep their meaning and shape.
- **The map JSON has a `version`.** Any change that older maps could not load needs a new `version` and a way to read the old one. Additive changes (a new optional field, a new catalog item) keep `version: 1`.
- **No real places, companies or people in sample content.** Maps in `maps/`, names, labels and screenshots must be fiction. Use generic room names ("Lobby", "Break Room") and no job titles or org roles. Keep `maps/sample.ja.json` and `maps/sample.en.json` on the same layout, and both must pass `validateMap` with no errors (`src/lib/map/samples.test.ts` checks this).
- **No monitoring features.** Do not add time-in-seat or last-activity displays.
- **One app process.** Some state lives in process memory by design (see the README). Do not add features that need several app processes to share it.
- **All user-facing strings go in `src/i18n/ja.json` and `en.json`**, with the same keys in both.
- Keep changes small and focused.

# CareerMate

CareerMate is a local Next.js prototype for an AI career navigation and lifelong-learning companion. It is designed for the Zhejiang University student service innovation contest workflow discussed in the project documents.

## Security Rules

- Never commit `.env.local`, real API keys, plugin tokens, SQLite databases, logs, uploads, exports, or raw screenshots.
- Keep real Baibaoxiang values only in `.env.local` or deployment secrets.
- Run `npm.cmd run secret:scan` before every commit.

## Local Setup

```bash
npm.cmd install
npm.cmd run prisma:generate
npm.cmd run db:migrate:deploy
npm.cmd run seed
npm.cmd run dev
```

The default mode is `TBOX_MODE=mock`, so the full P0 flow can run without Baibaoxiang credentials or an API whitelist. `npm.cmd run seed` replaces local application data; run it only when you intentionally want the demo dataset.

### Upgrading a pre-migration local database

The first migration is a baseline for databases originally created with `prisma db push`. Back up the database, then mark only that baseline as already applied before deploying the compatible P0 migration:

```bash
if not exist ..\.careermate-backups mkdir ..\.careermate-backups
copy prisma\dev.db ..\.careermate-backups\dev.db.pre-migrations.bak
npm.cmd run db:migrate:baseline
npm.cmd run db:migrate:deploy
```

Do not run `db:migrate:baseline` for a new empty database. `db:migrate:deploy` applies both migrations automatically on an empty database.

## Authentication and plugin access

Browser sessions use a seven-day, HTTP-only cookie containing a random token. Only its SHA-256 hash is stored in the database; logging out removes that server-side session.

Plugin endpoints deny requests when `CAREERMATE_PLUGIN_TOKEN` is missing. In non-production development only, an explicit `ALLOW_UNAUTHENTICATED_PLUGIN=true` permits an unconfigured client. When a token is configured, clients must send exactly `Authorization: Bearer <token>`.

## Tests and verification

```bash
npm.cmd run test
npm.cmd run test:watch
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run secret:scan
npm.cmd run verify
```

`npm.cmd run verify` runs the secret scan, lint, typecheck, unit tests, and production build in sequence.

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
npm.cmd run db:push
npm.cmd run seed
npm.cmd run dev
```

The default mode is `TBOX_MODE=mock`, so the full P0 flow can run without a Baibaoxiang API whitelist.

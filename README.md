# helpua-moderator-bot (`deacon-bot`)

Telegram moderation bot for the HelpUkraine supergroup: it enforces a nightly
silent window, asks new participants for consent before removing their
messages, and posts the closing / opening announcements on a schedule.

NestJS 10 · TypeScript 5.3 · `node-telegram-bot-api` · Prisma → PostgreSQL.

> **This source tree was reconstructed from a production runtime snapshot — the
> archive contained no source code.** Read
> [docs/RECONSTRUCTION.md](docs/RECONSTRUCTION.md) first; it states exactly what
> was recovered, how it was proven correct, and what is still unknown.

## What the bot does

| Behaviour | Where |
| --- | --- |
| Deletes non-command messages inside the silent window, unless the user opted in | `src/silent-time/` + `src/app.service.ts` |
| Asks a user for consent the first time their message would be removed, then remembers the answer | `src/user-consent/` |
| Schedules the "group is read-only tonight" and "group is open" announcements | `src/announcement/` |
| Telegram transport (long polling or webhook) | `src/bot-provider/` |
| Consent persistence | `src/database-provider/` |

## Requirements

* Node.js ≥ 18 (developed against 24)
* PostgreSQL 12+ — two databases, because `prisma/schema.prisma` declares a
  `shadowDatabaseUrl` that `prisma migrate` requires
* A Telegram bot token and the supergroup id

## Setup

```bash
npm ci                      # exact dependency graph from package-lock.json
npx prisma generate         # generate the Prisma client (see note below)
cp env.example .env         # then edit .env — dotenv only reads `.env`
```

`.env` needs, at minimum: `BOT_TOKEN`, `CHAT_ID`, `DATABASE_URL`,
`SHADOW_DATABASE_URL`. See `env.example` for all variables and their caveats.

`npx prisma generate` matters: it produces `node_modules/.prisma/client`, and
without it the client is an un-generated stub, so `this.prisma.userConsent`
compiles against `any` and has no type safety. The build still succeeds either
way, which is why this is easy to miss.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | `nest build` → CommonJS in `dist/` |
| `npm start:prod` | `node dist/main` |
| `npm start:dev` | `nest start --watch` |
| `npx jest` | Unit + wiring tests (isolated — no Telegram, no database) |
| `npm run format` | Prettier — 4 emit-pinned files are listed in `.prettierignore`, see below |
| `npm run lint` | ESLint (`prettier/prettier` off; Prettier itself is the formatting authority) |
| `npm run test:e2e` | **Broken**: needs `test/jest-e2e.json`, which the snapshot did not contain |

### Verifying against the runtime snapshot

Two scripts exist so the reconstruction can be checked, not just trusted:

```bash
./scripts/verify-against-snapshot.sh            # byte-for-byte diff of dist/
python3 scripts/check-sourcemap-equivalence.py  # proves source-map differences are cosmetic
```

Both accept the snapshot's `dist/` via `SNAPSHOT_DIST=/path/to/dist`.

Expected result: `tsc` exit 0, **15/15 `.js` identical**, **15/15 `.d.ts`
identical**, 11/15 `.js.map` identical and 4 proven offset-only.

⚠️ Four files are exempt from Prettier via `.prettierignore`, because their
exact layout is copied into the compiled output — `AnnouncementModule`'s
`imports` array is the one place where reformatting changes the emitted `.js`
bytes. Treat map equality as a reconstruction check, not a CI gate: ordinary
edits move source lines and break `.js.map` identity even when `.js` stays
byte-exact.

## Layout

```
src/
  main.ts                       Nest application context + Telegram event wiring
  app.module.ts / app.service.ts  message router: commands, consent, silent time
  bot-provider/                 Telegram transport (global module) + ChatType
  silent-time/                  silent-window decision rules (static, stateless)
  user-consent/                 consent state machine (in-memory + persisted)
  database-provider/            PrismaService + the CONSENT_PERSISTENCY port
  announcement/                 cron-scheduled closure / opening messages
prisma/schema.prisma            UserConsent model
legacy/pre-typescript-prototype/  archived CommonJS+Telegraf drafts (not built)
scripts/                        snapshot verification harness
docs/RECONSTRUCTION.md          provenance, method, validation, known gaps
```

## Deliberately preserved defects

Several bugs in the running program were reproduced exactly rather than fixed,
so that behaviour matches production and so the fixes become conscious
decisions. They are enumerated in
[docs/RECONSTRUCTION.md §7](docs/RECONSTRUCTION.md) — the short version: two
`try`/`catch` blocks have no `await` and therefore don't contain async
failures; `IS_BOT_SILENT` is hard-wired to `true` by a `|| true`; one `.catch`
returns a function instead of calling it; and the silent window is evaluated in
container-local time although it is documented as UTC.

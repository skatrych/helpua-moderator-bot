# helpua-moderator-bot (`deacon-bot`)

Telegram moderation bot for a HelpUkraine supergroup. Built with NestJS 10 ·
TypeScript 5.3 · `node-telegram-bot-api` · Prisma → PostgreSQL.

> **This source tree was reconstructed from a production runtime snapshot — the
> archive contained no source code.** Read
> [docs/RECONSTRUCTION.md](docs/RECONSTRUCTION.md) first; it states exactly what
> was recovered, how it was proven correct, and what is still unknown.

## What the program actually does

This is a description of the recovered behaviour, including the parts that look
unintended. The bugs were kept, not fixed; see
[docs/RECONSTRUCTION.md §7](docs/RECONSTRUCTION.md).

| Behaviour | Where | Note |
| --- | --- | --- |
| Receives updates by **Telegram long polling** | `src/bot-provider/` | Polling only — there is no webhook, HTTP server, or Express app anywhere in the program |
| In the **silent window**, deletes every non-`/start` group message | `src/silent-time/` | **Consent is never consulted on this path** — opted-in users are silenced too |
| **Outside** the silent window, deletes messages from users without consent, and prompts them once | `src/app.service.ts` | This is the only place consent is read |
| Runs a `/start` consent dialog in a private chat, persists the answer | `src/user-consent/` | |
| Posts **one** scheduled "group is read-only tonight" announcement | `src/announcement/` | There is **no** opening/morning announcement — only the closure one |

Message routing, in order (`AppService.processMessage`):

1. Group message that is not `/start` → `processStandardGroupMessage`:
   **first** `handleSilentTime`, which returns early if the message falls in the
   silent window. Only if it does not, the consent check runs.
2. Anything else → `processConsentDialog` (private chats only).

Because step 1 is ordered that way, a user who consented still cannot post
during the silent window. That is the shipped behaviour.

## Requirements

* Node.js ≥ 18 (developed against 24)
* PostgreSQL 12+ — **two** databases, because `prisma/schema.prisma` declares a
  `shadowDatabaseUrl`, which `prisma migrate` requires
* A Telegram bot token and the supergroup id

## Setup

```bash
npm ci                        # exact dependency graph from package-lock.json
npx prisma generate           # REQUIRED unless npm ci already ran it (see below)
cp env.example .env           # dotenv only reads `.env`; then edit it
```

### `prisma generate` is a build prerequisite

`@prisma/client` ships as a generator stub; the real `PrismaClient` class and the
`userConsent` model exist only after generation. Consequences, both verified:

* `npm ci` **with** lifecycle scripts enabled runs Prisma's `postinstall`, which
  generates the client, and the build then works.
* `npm ci --ignore-scripts` leaves **no** `.prisma/client` directory at all and
  `npm run build` then **fails with 5 TypeScript errors**
  (`TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'`,
  plus `userConsent` / `$connect` / `$disconnect` missing).

So run `npx prisma generate` explicitly whenever install scripts are skipped
(CI, `--ignore-scripts`, distro-packaged Node). It needs no database
connection — generation reads `schema.prisma` only.

### Required configuration

There is no code default for either of these, so they must be present in `.env`:

* `GROUP_CLOSURE_ANNOUNCEMENT` — read with `configService.get(...)` and passed
  straight to `sendMessage`. If unset, **`undefined` is sent** on schedule.
* `CHAT_ID` — the target chat for the scheduled announcement.

And `BOT_POLLING` must be truthy (`1`): the client is constructed as
`new TelegramBot(token, { polling: Boolean(Number(BOT_POLLING)) })`, and nothing
else ever starts a transport. With `BOT_POLLING=0` or unset, the process boots,
schedules the cron job, logs `Bot started...` — and **receives no updates
forever**. There is no webhook to fall back to.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | `nest build` → CommonJS in `dist/` |
| `npm start:prod` | `node dist/main` |
| `npm start:dev` | `nest start --watch` |
| `npx jest --ci` | Unit + wiring tests (isolated — no Telegram, no database) |
| `npm run format` | Prettier; 4 files are exempt via `.prettierignore` |
| `npm run lint` | ESLint (`prettier/prettier` off; Prettier is the formatting authority) |
| `npm run test:e2e` | **Broken**: needs `test/jest-e2e.json`, which the snapshot did not contain |

### Verifying against the runtime snapshot

```bash
./scripts/verify-against-snapshot.sh            # byte-for-byte diff of dist/
python3 scripts/check-sourcemap-equivalence.py  # proves map diffs are cosmetic
./scripts/verify-verification-harness.sh        # proves the two above fail closed
```

Both accept the snapshot's `dist/` via `SNAPSHOT_DIST=/path/to/dist`, and both
are **fail-closed**: a missing or empty snapshot, any compiler diagnostic, a
file-set mismatch in either direction, or any differing `.js` / `.d.ts` exits
non-zero. A differing `.js.map` is accepted only after the map checker proves
the offset never changes direction and never moves a column.

Expected:

```
.js      15/15 identical
.d.ts    15/15 identical
.js.map  11/15 identical, 4 differing → 11 identical, 4 consistent, 0 divergent
```

Treat map equality as a reconstruction artefact, not a CI gate: ordinary edits
move source lines and break `.js.map` identity even when `.js` stays byte-exact.

## Layout

```
src/
  main.ts                       Nest application context + Telegram event wiring
  app.module.ts / app.service.ts  message router: commands, consent, silent time
  bot-provider/                 Telegram long-polling transport (global module)
  silent-time/                  silent-window decision rules (static, stateless)
  user-consent/                 consent state machine (in-memory + persisted)
  database-provider/            PrismaService + the CONSENT_PERSISTENCY port
  announcement/                 the single closure-announcement cron job
prisma/schema.prisma            UserConsent model
scripts/                        snapshot verification harness (+ its self-test)
legacy/pre-typescript-prototype/  archived CommonJS+Telegraf drafts (not built)
docs/RECONSTRUCTION.md          provenance, method, validation, known gaps
```

## Testing

`npx jest --ci` runs 90 assertions over 7 suites. It performs **no** HTTP
request, opens **no** database connection, and reads **no** fixture from disk:
the Telegram client is replaced at the `require` boundary, the database is
reached only through a fake of the `CONSENT_PERSISTENCY` port, the cron package
is stubbed, and `app.module.spec.ts` asserts the DI graph from decorator
metadata rather than booting a module.

Passing tests are **not** startup, connectivity, or production-readiness
evidence. `src/main.ts` and the Prisma lifecycle hooks are never executed.

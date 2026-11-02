# Pre-TypeScript prototype (archived)

The CommonJS + [Telegraf](https://telegraf.js.org) drafts that made up `main`
up to `dc8d418 feat: switch to telegraf lib` (2023-03-20).

**These files are not built, linted, or run.** They are kept only as history,
because they document the earlier design of the same domain: whitelisting chats,
tracking new members in Postgres, silencing messages during night hours, and
deleting messages containing bad words.

They are *not* an earlier version of the current program:

| | this directory | `src/` (recovered) |
| --- | --- | --- |
| Runtime | CommonJS, no build step | TypeScript → CommonJS, NestJS 10 DI |
| Bot library | `telegraf` (+ a leftover `node-telegram-bot-api`) | `node-telegram-bot-api` only |
| Entry point | `main.js` (express webhook + `bot.launch()`) | `src/main.ts` (`NestFactory.createApplicationContext`) |
| Persistence | raw `pg` pool, `members` table | Prisma, `user_consents` table |
| Package name | `helpua-moderator-bot` 1.0.0 | `deacon-bot` 0.0.1 |

At least three of them could not have executed as committed — e.g.
`main.js` uses a top-level `await` inside a CommonJS file and references
`webhookDomain` and `port`, neither of which is defined, and both
`new-chat-members.js` and `handle-readonly-time.js` reference an out-of-scope
`ctx`/`newChatMembers`/`chatId`.

Treat anything here as an unreadable draft, not as a reference. The runtime
snapshot is the only authority; see [`../docs/RECONSTRUCTION.md`](../docs/RECONSTRUCTION.md).

# Reconstruction record — HelpUA moderator bot

Issue: <https://github.com/skatrych/helpua-moderator-bot/issues/2>
Branch: `feature/2-reconstruct` (base `main` @ `dc8d418`)

This file is the authoritative record of **what was recovered, how, how exactly
it was verified, and what remains unknown**. Read it before changing anything
under `src/`.

---

## 1. What the snapshot actually is

Input: `/home/agentdev/workspaces/helpua-moderator-bot.tar.gz`
SHA-256 `ec6d0a96e35593818359f9ba2488e498d7b6dcb5dec26ea59043ab62d33dfb2f`
(verified, extracted to a scratch directory **outside** the repository).

| Path in archive | Kind | Fate in this repo |
| --- | --- | --- |
| `dist/**/*.js`, `*.d.ts`, `*.js.map` | Compiled output of the running app | **Primary source of truth** for the reconstruction |
| `dist/tsconfig.build.tsbuildinfo` | TypeScript 5.3.3 incremental build state | Recovered the exact file list + compiler options |
| `package.json` | Manifest of the deployed app (`deacon-bot` 0.0.1) | Copied verbatim → `package.json` |
| `package-lock.json` | 843 packages, all `registry.npmjs.org` | Copied verbatim → `package-lock.json` |
| `prisma/schema.prisma` | Prisma schema | Copied verbatim → `prisma/schema.prisma` |
| `docker-compose.yaml` | Runtime compose file | Copied verbatim → `docker-compose.yaml` |
| `.env.example` | Sample configuration | **Sanitised and renamed** → `env.example` (see §6) |
| `deacon_bot_shadow.sql` | Prisma shadow-DB dump | **Deliberately not committed** (see §6) |
| `src/` | — | **Absent.** This is what had to be reconstructed |

The archive contains **no source code**. The application is a NestJS 10
(TypeScript) service named `deacon-bot`, and it is a *different, later* program
from the JavaScript/Telegraf prototype that was at the tip of `main`.

### The prototype that was already in git

`main` ended at `dc8d418 feat: switch to telegraf lib` (2023-03-20): a
CommonJS/Telegraf draft with several non-running defects (top-level `await` in
a `.js` file, undefined `webhookDomain`/`port`, `newChatMembers`/`ctx`
referenced out of scope). It shares the *domain* (silent hours, member
tracking) but not the architecture, dependencies or entry point with the
snapshot.

It was therefore **moved, not deleted**, to
`legacy/pre-typescript-prototype/` (single `git mv` commit, history preserved,
excluded from the build and from linting). Its `package.json`/`package-lock.json`
moved with it so the two dependency graphs cannot be confused.

---

## 2. How the source was recovered

Recovery used three independent channels, then cross-checked them:

1. **`dist/**/*.js`** — exact statement bodies, control flow, string literals
   (including all user-facing Ukrainian text), and evaluation order.
2. **`dist/**/*.d.ts`** — the public/private/`readonly` surface: parameter
   property versus plain field, member order, type annotations, generic unions.
   Member order in a `.d.ts` fixes declaration order in the source, which is how
   e.g. `AppService.bot`/`.silentTime` were placed *before* the constructor.
3. **`dist/**/*.js.map`** — line *and column* mappings back to `src/*.ts`.
   Because `names` is empty, every segment is a 4-tuple, which made it possible
   to recover not just the layout but individual token positions. Decoding these
   proved, for example:
   * the source used **2-space indentation** with constructor parameters at
     **4 spaces** (parameter names landed on column 22 in `AppService`);
   * `handleSilentTime(msg)` was **unannotated** — its `.d.ts` prints `msg: any`
     only because `noImplicitAny` is `false` (the column of the closing paren
     pinned this down);
   * long calls were broken argument-per-line, while a few 86–88 character
     declarations were left unwrapped.

**Compiler options were not guessed.** `dist/tsconfig.build.tsbuildinfo`
records them verbatim: `module: commonjs`, `target: ES2021`, `declaration`,
`removeComments`, `emitDecoratorMetadata`, `experimentalDecorators`,
`allowSyntheticDefaultImports`, `sourceMap`, `outDir: ./dist`, `incremental`,
`skipLibCheck`, `strictNullChecks: false`, `noImplicitAny: false`,
`strictBindCallApply: false`, `noFallthroughCasesInSwitch: false` — which is the
stock Nest 10 `tsconfig.json`, so `tsconfig.json` / `tsconfig.build.json` /
`nest-cli.json` reproduce that shape.

The recovery loop was: write a candidate `src/*.ts` → compile → diff the output
against the snapshot → correct → repeat. **No behaviour was invented,
simplified, or "fixed"** — see §7 for defects that were preserved on purpose.

---

## 3. Validation

Run both from the repository root:

```bash
npm ci
./scripts/verify-against-snapshot.sh           # build + byte-for-byte diff
python3 scripts/check-sourcemap-equivalence.py # source-map equivalence proof
npx jest --ci                                  # isolated unit tests
npx eslint "src/**/*.ts"                       # lint
npx prettier --check "src/**/*.ts"             # formatting
./scripts/verify-verification-harness.sh       # proves the two checks above fail closed
```

`verify-against-snapshot.sh` compiles with `tsc -p tsconfig.build.json` and
compares every emitted file against the snapshot with `cmp`.
`check-sourcemap-equivalence.py` decodes both source maps and proves that any
difference is *only* a source-line offset that is monotone in one direction with
identical columns — a signature that only lines emitting no code at all
(blank lines, or comments removed by `removeComments: true`) can produce.

**Both are fail-closed, and that property is itself tested.** An earlier
revision of both scripts printed a diagnosis but still exited 0 — it captured
the compiler's status without acting on it, counted missing files without
enforcing them, accepted a nonexistent `SNAPSHOT_DIST` (zero comparisons, zero
exit), and the map checker accepted an empty snapshot because `os.walk` simply
yielded nothing. A verifier that passes on nothing is worse than none, because
it manufactures evidence. They now:

* reject a missing or genuinely empty `SNAPSHOT_DIST`, a missing compiler, and
  a snapshot with no `.js` / `.d.ts` / `.js.map` to compare (exit 2);
* fail on **any** `tsc` diagnostic, and on any file-set mismatch in *either*
  direction, so neither a pruned nor an inflated build can slip through;
* fail on any differing `.js` or `.d.ts`, and require `0 divergent` maps;
* distinguish exit 1 (genuinely divergent maps) from exit 2 (bad inputs), so a
  typo'd path can never be mistaken for a real finding.

The four legitimately offset-only maps are still accepted — deliberately, not by
accident, and `verify-verification-harness.sh` asserts that acceptance as a
positive control so a future over-tightening cannot silently break it.

### Why the self-test asserts exact exit codes, not "non-zero"

A first version of that self-test was itself fail-open, and an independent
re-review caught it. Two of its cases were vacuous:

* the "existing but empty directory" cases pointed at a path that was never
  created, so they were really second tests of the *nonexistent*-path branch —
  the empty-directory guard was never executed;
* the "divergent map" case ran while `dist/` was still deleted by the preceding
  case, so the checker bailed out on the missing generated tree (exit 2) and
  never reached the map comparison it claimed to test.

The decisive evidence: neutering the checker's verdict line
(`return 1 if bad else 0` → `return 0`) made it silently accept genuinely
divergent maps, and that self-test still reported 16 passed / 0 failed. Green,
and blind.

Both are fixed, and the assertions are now exact: exit **2** means "the check
could not run", exit **1** means "the check ran and found this", and each case
also greps for its specific diagnosis. Reaching a *different* failure for an
unrelated reason now fails the case instead of passing it — which is precisely
how the divergent-map case was hiding.

Two guards were added so the self-test cannot silently decay the same way:

* `mkdir -p "$TMP/emptydir"` is verified to exist and to be empty before any
  case uses it;
* a **mutation control** re-runs the divergent case against a checker whose
  verdict line has been neutered in memory, and requires that mutant to *accept*
  (exit 0). If it ever fails to, the exit-1 asserted above is not coming from the
  verdict logic, and the control reports it. Verified end to end: applying that
  mutation to the committed checker makes this self-test report 18 passed /
  **2 failed** and exit 1, where the old one reported 16/16 and exit 0.

### Result

| Check | Result |
| --- | --- |
| `tsc -p tsconfig.build.json` | **exit 0**, no diagnostics |
| `nest build` (the `build` script) | **exit 0**; 30/30 `.js` + `.d.ts` identical |
| Emitted `dist/**/*.js` | **15/15 byte-identical** to the runtime snapshot |
| Emitted `dist/**/*.d.ts` | **15/15 byte-identical** to the runtime snapshot |
| Emitted `dist/**/*.js.map` | **11/15 byte-identical**, 4/15 proven offset-only, **0 divergent** (see §4) |
| `npx jest --ci` | **90 passed / 90** across 7 suites — no network, no database, no fixtures on disk |
| `npx eslint "src/**/*.ts"` | **exit 0** |
| `npx prettier --check "src/**/*.ts"` | **exit 0** (4 files deliberately ignored, see §4) |
| `./scripts/verify-verification-harness.sh` | **20/20**, exit 0 — 17 negative-path cases (each asserting an exact exit status *and* a diagnosis), 2 positive controls, 1 mutation control |

Byte-identical `.js` plus byte-identical `.d.ts` means the reconstructed
`src/` is **compilation-equivalent** to the program that ran in production: same
emitted statements, same public API, same Nest metadata.

### Provenance cross-checks that independently agreed

* The lockfile resolves `typescript` to **5.3.3**, and the snapshot's
  `tsbuildinfo` self-reports `version: 5.3.3`.
* The build state names itself `tsconfig.build.tsbuildinfo`, i.e. the original
  build ran through `tsconfig.build.json` (what `nest build` does).
* `program.root` in the build state enumerates exactly the 15 `src/*.ts` files
  that this reconstruction contains — no missing file, no extra file.

---

## 4. Known differences from the original source

These are the only deviations found. None of them changes runtime behaviour.

| Reconstructed file | Lines | Source-line offset | Source map |
| --- | --- | --- | --- |
| `src/app.service.ts` | 134 | −8 | offset-only |
| `src/user-consent/consent.service.ts` | 78 | −4 | offset-only |
| `src/database-provider/database-provider.module.ts` | 12 | −1 | offset-only |
| `src/silent-time/silent-time.service.ts` | 63 | +2 (longer) | offset-only |
| the other **11** files | — | 0 | **byte-identical** |

**What the offsets are.** Every one of them is a run of source lines that
produce no code, and the checker proves the offsets never change direction and
never move a column — the signature only blank lines or stripped comments can
leave. Nothing structural is missing.

* **`removeComments: true` destroys comment text.** An original comment leaves
  no trace in the `.js`, the `.d.ts`, or the map, so it cannot be recovered. The
  negative offsets are almost certainly comments (and/or stray blank lines) that
  were not reproduced — inventing plausible ones would put non-original words in
  the source.
* **`database-provider.module.ts` opened with a line that emitted nothing**,
  most plausibly an unused or type-only import the compiler elided. Rather than
  start the file with a blank line or fabricate an import, it is omitted and
  recorded here.
* **`silent-time.service.ts` is 2 lines longer** because its three
  `private static readonly` initialisers were wrapped to the 80-column style
  while the original kept each on one 76–86-column line. Emitted `.js` is
  identical either way.

**Formatting: four files are deliberately exempt from Prettier.** The original
source was mostly Prettier-shaped at `printWidth: 80`, but not uniformly, and one
of those departures is load-bearing:

* `AnnouncementModule`'s `imports: [...]` array is the **only** place found
  where formatting changes the **compiled bytes** — TypeScript's printer copies
  the author's line-break decision for short array literals, so inlining it
  emits one line instead of four.
* The other three (`announcement.service.ts`, `bot-provider.ts`,
  `prisma.service.ts`) are pinned token-for-token by their source maps: a blank
  line inside a method, a 96-column `sendMessageTmp` signature, and an 88-column
  class header that the original left unwrapped.

Rather than silently trade byte-exactness for formatting, these four paths are
listed in **`.prettierignore`** with per-file reasons, so `npm run format`
cannot damage them and `npx prettier --check` is green. Because `eslint-plugin-
prettier` does not honour `.prettierignore`, the `prettier/prettier` rule is
disabled in `.eslintrc.js` — Prettier itself, not the lint rule, is the
formatting authority in this repo.

Formatting drift in any *other* file would move source lines and break
`.js.map` identity (never `.js` identity, provided behaviour is unchanged).
Treat map equality as a reconstruction artefact, not a CI gate.

---

## 5. Files that are *reconstructed*, not recovered

Everything under `src/` is reconstructed and is covered by the proof in §3.
Additionally, these files are **inferred from convention**, because the snapshot
contains deployed output rather than a development tree. Each is marked in-file:

| File | Basis |
| --- | --- |
| `tsconfig.json`, `tsconfig.build.json` | Recovered *verbatim in effect* from `tsbuildinfo` (`incremental` implied by the build-state file's existence, `baseUrl` is the Nest default) |
| `nest-cli.json` | Required by the `build: "nest build"` script; stock `@nestjs/schematics` v10 content |
| `.prettierrc`, `.eslintrc.js`, `.prettierignore` | Style only; the `format`/`lint` scripts imply configs existed. `.prettierignore` is new and exists only to protect the four emit-pinned files (§4) |
| `.gitignore`, `.dockerignore` | Repository hygiene |
| `env.example` | Rewritten from the runtime sample with the two infrastructure tokens sanitised (§6) |
| `src/**/*.spec.ts` | New: isolated tests written for this task |
| `scripts/verify-against-snapshot.sh`, `scripts/check-sourcemap-equivalence.py` | New: the validation harness |
| `docs/RECONSTRUCTION.md`, `README.md`, this record | Documentation |

---

## 6. Sensitive-content review (performed before any commit)

| Artefact | Finding | Decision |
| --- | --- | --- |
| Runtime `.tar.gz` | Contains the whole deployed tree | **Not committed**, and now git-ignored (`*.tar.gz`) |
| `deacon_bot_shadow.sql` | `pg_dump` 12.22, schema-only: one table whose columns are a user id and a boolean, **zero data rows** (`COPY … FROM stdin;` immediately followed by `\.`). Beyond the schema, it discloses the deploying superuser/owner role name and the exact server version. | **Not committed** (`*.sql` is ignored). Its owner identifier is deliberately **not reproduced anywhere in this repository**, including in this row — that is why the table is described rather than named. Kept in the scratch extraction only. |
| `.env.example` | `BOT_TOKEN='abc'` and `CHAT_ID='-1001'` are placeholders (owner-confirmed: no live credentials). But `DATABASE_URL` also carried a **private-range internal host address** and a **real database role name** — infrastructure facts rather than secrets, and this repo is public. | **Sanitised, not copied verbatim.** Reproduced as `env.example` with the host and role replaced by local placeholders, and every variable documented. Two deliberate deviations from the original, both recorded here. The harness also blocks writing any `.env*` path, hence the missing leading dot. |
| `package-lock.json` | 843 `resolved` URLs, **all** `registry.npmjs.org`; no `_auth`/`token`/`Bearer`; no private registry, git URL or local link | Committed verbatim |
| `docker-compose.yaml` | Uses `${VAR}` indirection only, no values | Committed verbatim |
| `prisma/schema.prisma` | Reads `DATABASE_URL` / `SHADOW_DATABASE_URL` via `env()`; no literals | Committed verbatim |
| `dist/**` | Only the two public Telegram message strings and a public t.me rules link | Reviewed; nothing sensitive |
| All of `src/`, `scripts/`, `docs/` | Written here | Scanned: no credentials, no internal hostnames. Tests use obviously-fake values (`'fake-token-for-unit-tests'`, `-1001234567890`). |

**No production system was contacted at any point.** No Telegram API call, no
database connection, no deployment. Every test replaces the transport and the
persistence port with a fixture.

---

## 7. Behaviour deliberately preserved (including defects)

The mandate was to recover *what ran*, not to improve it. These are real,
reproduced, and now pinned by tests so a future change is a conscious decision:

1. **`BotProvider.deleteMessage` and `ConsentService.checkUserConsent` use
   `try { return promise… } catch` with no `await`.** The `catch` therefore only
   sees synchronous throws; a *rejected* promise escapes. For
   `checkUserConsent` that means a database outage propagates out of
   `AppService.processStandardGroupMessage` and surfaces as an unhandled
   rejection in the Telegram event handler instead of being logged.
   *Covered by two tests named `REJECTS … the body returns without await`.*
2. **`SilentTimeService.isSilent = Boolean(Number(env.IS_BOT_SILENT)) || true`
   is always `true`.** The `|| true` makes the "be chatty" branch dead, and the
   runtime `!isSilent && console.log(...)` can never fire. Consistent with the
   `.env.example` warning about the `ctx.reply()` bug.
3. **`SilentTimeService.handleSilentTime` uses `.catch((_) => console.error)`**
   — returns the function instead of calling it, so failures are silently
   dropped rather than logged.
4. **Time-of-day is evaluated in server-local time** (`Date#getHours`), while
   `.env.example` documents the thresholds as **UTC**. Behaviour therefore
   depends on the container timezone; the compose file sets none.
5. **`isExpectedYesAnswer`/`isExpectedNoAnswer` include `'hi'` as a *negative*
   answer** and `'да'`/`'net'` mixtures across languages; matching is
   case-sensitive and exact, so `"Так!"` or `"так."` are rejected.
6. **`consentRequested` / `consentRequiredNotificationSent` are in-process
   `Map`s** — dialog state is lost on restart, while consent itself is
   persisted.
7. **`processConsentAnswer` with an unrecognised answer persists `undefined`
   consent** (neither matcher fires). Pinned by a test.
8. **`AnnouncementService.sendAnnouncement` does not await `sendMessage`**, so
   only synchronous throws are contained; and the cron expression
   `` `58 59 ${prevHour} * * *` `` yields the impossible minute `59` combined
   with second `58` (valid 6-field cron, but it fires at :59:58 — one second
   before the hour, an hour before closure). Reproduced as-is.
9. **`ConfigModule.forRoot()` is registered twice** (in `AppModule` and
   `AnnouncementModule`).
10. **`BotProvider.sendMessage(chatId: string, …)`** types the chat id as
    `string`, while callers pass `msg.chat.id: number` — invisible in JS, and
    why `AppService.bot` is typed `any` (see §8).
11. **Long polling is the only transport.** `BotProvider` builds
    `new TelegramBot(token, { polling: Boolean(Number(BOT_POLLING)) })` and
    nothing else ever starts a transport: there is no webhook, no HTTP server
    and no Express app anywhere in `src/` (verified by grep). So
    `BOT_POLLING=0`/unset is not "webhook mode" — the process boots, registers
    its cron job, logs `Bot started...`, and then **never receives an update**.
    The `docker-compose.yaml` has no proxy and publishes no ports, so a
    webhook-mode deployment was evidently never wired up in these artefacts.
12. **The silent window ignores consent entirely, and runs first.**
    `processStandardGroupMessage` calls `handleSilentTime` and returns on a hit;
    the consent check is only reached afterwards. `SilentTimeService` never
    consults `ConsentService`. A user who accepted the rules still has every
    in-window message deleted. Consent only gates posting *outside* the window.
13. **There is exactly one scheduled announcement, and it is the closure one.**
    `onModuleInit` registers `NightlyClosureAnnouncement` and nothing else. No
    opening/morning job exists, so the group is never announced as re-opened.
14. **`GROUP_CLOSURE_ANNOUNCEMENT` and `CHAT_ID` have no default.** They are
    read with a single-argument `configService.get(...)`, unlike
    `IS_TOO_LATE` which does get a `'23'` default. Unset, the job hands
    `undefined` to `sendMessage` — and per item 8 that call is not awaited, so
    the resulting rejection is uncontained.

### Documentation correction note

The first draft of `README.md` / `env.example` in commit `0ac358a` described
three things the recovered program does not do: consented users bypassing the
silent window, a webhook deployment mode, and an opening announcement. It also
called `GROUP_CLOSURE_ANNOUNCEMENT` optional and claimed the un-generated
Prisma client still built. All five were corrected against the source rather
than softened, and items 11–14 above were written from the same re-reading. No
behaviour was changed while correcting them.

---

## 8. Unresolved risks / follow-ups

1. **`this.bot` in `AppService` is typed `any`.** With that annotation the build
   is clean; typing it `BotProvider` produces 8 `TS2345`s (`number` → `string`
   chat ids) that are *erased at emit*, so the snapshot cannot distinguish
   "the original said `any`" from "the original build reported 8 errors and was
   shipped anyway". `any` was chosen because it is the only reading under which
   the recovered toolchain builds cleanly.
2. **The original `.env.example` is deliberately not in this repo.** Its two
   infrastructure tokens (a private-range internal host address, and a real
   database role name) were replaced with local placeholders. Restoring them
   verbatim is the owner's call, but it means publishing an internal address
   and a real database role name to a public repository.
3. **`"s": "^1.0.0"` is a real dependency** (a stray `npm i s`), present in the
   lockfile. Removing it is a dependency change, so it was left alone; worth a
   deliberate cleanup commit.
4. **Docker files are missing, not reconstructed.** The snapshot ships
   `docker-compose.yaml` pointing at a pre-built image tag `dyiakonbot:v0.10`,
   so no `Dockerfile` was in the deployed tree. The `legacy/` prototype
   Dockerfile (`COPY . . && npm ci && node main.js`) is **wrong for this app**
   (it would need `npm run build` + Prisma client generation) and is kept only
   as history.
5. **`npm run test:e2e` is broken by design of the snapshot**: it points at
   `./test/jest-e2e.json`, which was not part of the deployed artefacts and is
   not reconstructed here (no e2e specs exist to configure).
6. **Prisma client generation is a hard build prerequisite when install scripts
   are skipped.** This claim was previously wrong in this file, and an
   independent review corrected it: there is no "un-generated stub" that still
   compiles. Verified by reproducing both directions:

   * `npm ci --ignore-scripts` produces **no** `node_modules/.prisma/client`
     directory at all, and `npm run build` then **fails with 5 errors**
     — `TS2305` for `PrismaClient`, plus `userConsent` (×2), `$connect` and
     `$disconnect`.
   * `npx prisma generate` afterwards succeeds offline from cached engines with
     dummy loopback URLs and no database connection, and the build then exits 0
     and reproduces the snapshot byte-for-byte.

   A normal `npm ci` runs Prisma's `postinstall` and needs no extra step, which
   is why the original claim went unnoticed. Anyone scripting installs with
   `--ignore-scripts` (CI, distro Node, reproducible builds) must add
   `npx prisma generate`.
7. **`shadowDatabaseUrl` is required by the schema** and was absent from the
   original sample env file; `prisma migrate` fails until `SHADOW_DATABASE_URL`
   is supplied. The un-committed shadow dump is presumably an artefact of that
   setup.
8. **Source maps in production reference a `src/` that no longer existed** —
   the reason this reconstruction was possible at all. Keeping `.js.map` in the
   image is what made recovery feasible; keep doing it.

---

## 9. How to re-verify independently

```bash
# 1. Confirm the input is the one this record describes
sha256sum /home/agentdev/workspaces/helpua-moderator-bot.tar.gz
#    expect ec6d0a96e35593818359f9ba2488e498d7b6dcb5dec26ea59043ab62d33dfb2f

# 2. Extract it somewhere OUTSIDE the repo
mkdir -p /tmp/snap && tar -xzf ~/workspaces/helpua-moderator-bot.tar.gz -C /tmp/snap

# 3. Build and compare byte-for-byte.
npm ci
npx prisma generate   # REQUIRED if step 3 used --ignore-scripts; see §8 item 6
SNAPSHOT_DIST=/tmp/snap/helpua-moderator-bot/dist ./scripts/verify-against-snapshot.sh
SNAPSHOT_DIST=/tmp/snap/helpua-moderator-bot/dist python3 scripts/check-sourcemap-equivalence.py

# 4. Prove the verification harness itself cannot silently pass
SNAPSHOT_DIST=/tmp/snap/helpua-moderator-bot/dist ./scripts/verify-verification-harness.sh

# 5. Run the isolated suite (no Telegram, no Postgres, no fixtures on disk)
npx jest --ci
```

Expected: `tsc rc=0`, `.js 15/15 identical`, `.d.ts 15/15 identical`,
11 identical + 4 consistent + **0 divergent** source maps, `90 passed`,
`eslint` and `prettier --check` both exit 0.

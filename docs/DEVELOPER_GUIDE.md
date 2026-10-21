# Semuta Casino Bot — Developer Guide

**Purpose**
This guide describes the codebase structure, configuration, and runtime behavior for the Semuta Casino Discord bot. It is intended for developers working on features, infrastructure, or debugging.

**Repository Layout**
Key folders and files.
- `src/index.mjs`: Discord bot entry point.
- `src/runtime/`: Bot composition, dispatch, middleware, caches, notices and worker ownership.
- `src/cli/deploy-commands.mjs`: Slash command registration.
- `src/api/server.mjs`: HTTP API (OAuth + webhooks).
- `src/commands/`: Slash command handlers.
- `src/games/`: Game engines and session flow.
- `src/jobs/`: Job system + scenarios.
- `src/cartel/`: Semuta Cartel system + background worker.
- `src/db/`: Postgres adapter and query helpers.
- `src/services/`: Integrations and background services (votes, updates, news).
- `src/lib/`: Shared helpers (emojis, casino category utilities, etc).
- `scripts/`: Operational and maintenance scripts.
- `docs/`: Design and feature docs.
- `UPDATE.md` and `news.md`: Update announcements and news items.

**Runtime Entry Points**
- Bot runtime: `node src/index.mjs`
- API runtime: `node src/api/server.mjs`
- Slash commands: `node src/cli/deploy-commands.mjs`

**Node Version**
`package.json` requires Node `>=20`. JSON import assertions used in the repo do not work on Node 18.

**Core Concepts**
- **Chips vs Credits**: Chips are the main currency; credits are a secondary balance used first on losses.
- **Global economy**: Balances and job data are stored in a shared ledger and are scoped by `guild_id`, but can be pinned to a single economy via `GLOBAL_ECONOMY_ID`.
- **Sessions**: Games create active sessions with timeouts and logging.
- **Permissions**: Owner overrides come from runtime configuration; admin/moderator lists are stored in the database and checked in `src/runtime/access.mjs`.

**Database**
The bot uses Postgres only.
- Schema file: `scripts/pg-schema.sql`
- Migration script: `scripts/migrate.mjs`
- Adapter: `src/db/db.pg.mjs` (loaded via `src/db/db.auto.mjs`)

Common commands:
1. Create database and user in Postgres.
2. Run migrations:
   - `DOTENV_CONFIG_PATH=debug/.env npm run sql:migrate:node`

**Permissions and Access**
- Owner override: `OWNER_USER_IDS`
- Admin/moderator lists are stored in DB and managed via:
  - `/addadmin`, `/removeadmin`
  - `/addmod`, `/removemod`
- Key checks live in `src/runtime/access.mjs` (`hasAdminAccess`, `hasModeratorAccess`).

**Slash Command Registration**
Global commands are registered via `src/cli/deploy-commands.mjs`.
- Deploy:
  - `DOTENV_CONFIG_PATH=debug/.env npm run deploy`
- Global commands can take up to 1 hour to propagate.

**Command Map**
Commands are declared in `src/cli/deploy-commands.mjs` and implemented in `src/commands/`.

Gameplay:
- `/blackjack` → `src/commands/blackjack.mjs`
- `/slots` → `src/commands/slots.mjs`
- `/roulette` → `src/commands/roulette.mjs`
- `/ridebus` → `src/commands/ridebus.mjs`
- `/dicewar` → `src/commands/dicewar.mjs`
- `/horserace` → `src/commands/horserace.mjs`
- `/holdem` → `src/commands/holdem.mjs`

Economy and user tools:
- `/balance` → `src/commands/balance.mjs`
- `/givechip` → `src/commands/givechip.mjs`
- `/givecredits` → `src/commands/givecredits.mjs`
- `/leaderboard` → `src/commands/leaderboard.mjs`
- `/dailyspin` → `src/commands/dailyspin.mjs`
- `/vote` → `src/commands/vote.mjs`
- `/beg` → `src/commands/beg.mjs`
- `/news` → `src/commands/news.mjs`

Jobs:
- `/job` → `src/commands/job.mjs`

Requests and moderation:
- `/request` → `src/commands/request.mjs`
- `/requesttimer` → `src/commands/requesttimer.mjs`
- `/stafflist` → `src/commands/stafflist.mjs`
- `/housebalance` → `src/commands/housebalance.mjs`
- `/houseadd` → `src/commands/houseadd.mjs`
- `/houseremove` → `src/commands/houseremove.mjs`
- `/mintchip` → `src/commands/mintchip.mjs`
- `/buyin` → `src/commands/buyin.mjs`
- `/takechips` → `src/commands/takechips.mjs`
- `/cashout` → `src/commands/cashout.mjs`
- `/givecredits` → `src/commands/givecredits.mjs`
- `/takecredits` → `src/commands/takecredits.mjs`
- `/addadmin` → `src/commands/addadmin.mjs`
- `/removeadmin` → `src/commands/removeadmin.mjs`
- `/addmod` → `src/commands/addmod.mjs`
- `/removemod` → `src/commands/removemod.mjs`
- `/resetallbalance` → `src/commands/resetallbalance.mjs`

Configuration:
- `/setcasinocategory` → `src/commands/setcasinocategory.mjs`
- `/setgamelogchannel` → `src/commands/setgamelogchannel.mjs`
- `/setcashlog` → `src/commands/setcashlog.mjs`
- `/setrequestchannel` → `src/commands/setrequestchannel.mjs`
- `/setupdatech` → `src/commands/setupdatech.mjs`
- `/setrake` → `src/commands/setrake.mjs`
- `/setmaxbet` → `src/commands/setmaxbet.mjs`
- `/kittenmode` → `src/commands/kittenmode.mjs`

Status and misc:
- `/ping` → `src/commands/ping.mjs`
- `/status` → `src/commands/status.mjs`
- `/8ball` → `src/commands/eightball.mjs`

Semuta Cartel system:
- `/cartel` → `src/commands/cartel.mjs`
- `/cartelreset` → `src/commands/cartelreset.mjs`
- `/setcartelshare` → `src/commands/setcartelshare.mjs`
- `/setcartelrate` → `src/commands/setcartelrate.mjs`
- `/setcartelxp` → `src/commands/setcartelxp.mjs`

**Games**
Game engines live in `src/games/`. Sessions, logging, and shared utilities are here.
- Session state: `src/games/session.mjs`
- Logging: `src/games/logging.mjs`
- Cards: `src/games/cards.mjs`
- Blackjack: `src/games/blackjack.mjs`
- Slots: `src/games/slots.mjs`
- Roulette: `src/games/roulette.mjs`
- Ride the Bus: `src/games/ridebus.mjs`
- Dice War: `src/commands/dicewar.mjs`
- Horse Race: `src/games/horserace.mjs`
- Hold’em: `src/games/holdem.mjs`

Most games:
- Check guild category settings before starting.
- Record session activity and timeouts.
- Use credits-first staking (chips are only taken if credits don’t cover the bet).
- Write to game logs when configured.

**Game Mechanics (Detailed)**
Technical flows and rules per game. File references are included for deep dives.

**Blackjack (`/blackjack`)**
Implementation: `src/games/blackjack.mjs`, `src/interactions/blackjackButtons.mjs`, `src/commands/blackjack.mjs`
1. Entry validation: must be in a guild. Table rules: `LOW` max bet `999`, `HIGH` min bet `1000`.
2. Staking model: credits-first. Chips stake is moved to the house on buy‑in; credits are only burned on loss.
3. House cover check: requires `chipStake + (bet * 2)` to cover worst-case payouts.
4. Natural blackjack: if player has 21 on first two cards, payout is `floor(bet * 1.5)` and chip stake is returned.
5. Dealer rules: hits to 17; `HIGH` uses H17 (hits soft 17), `LOW` uses S17.
6. Actions: `Hit`, `Stand`, `Double`, `Split`.
7. Double: only on first decision; adds another full bet, deals one card, then dealer plays.
8. Split: allowed when first two cards share the same value (10/J/Q/K all count as 10). Creates two hands with separate stakes. Double-after-split is disabled.
9. Settlement: win pays `chipStake + bet`; push returns `chipStake`; loss burns credit stake and keeps chip stake.
10. Timeout: inactive hands expire after the shared session timeout and are settled as a loss.

**Slots (`/slots`)**
Implementation: `src/games/slots.mjs`, `src/commands/slots.mjs`
1. Grid: 5 columns × 3 rows. Reels are fixed strips; `X` placeholders are filled with low symbols.
2. Paylines: 20 fixed lines (`SLOTS_LINES`), evaluated left → right.
3. Bet: total bet is spread across paylines. Line bet = `bet / 20`.
4. Symbols: wild (`W`) substitutes for regular symbols; scatter (`S`) pays anywhere.
5. Line wins: 3/4/5 of a kind on a line, payouts are `floor(pay * lineBet)`.
6. Scatter wins: `3/4/5` scatters pay `floor(scatterPay * lineBet)` and are added to line wins.
7. Staking model: credits-first. Chips stake is moved to the house; credits are burned only on a losing spin.
8. Payouts: only the win amount is paid (no stake return). House cover check uses `cover + chipStake >= win`.

**Roulette (`/roulette`)**
Implementation: `src/games/roulette.mjs`, `src/interactions/rouletteTypeSelect.mjs`, `src/interactions/rouletteModal.mjs`, `src/interactions/rouletteButtons.mjs`
1. Session: `/roulette` creates a per-user session and displays bet summary.
2. Bet entry: select a bet type, then fill a modal with amount (min `5`). Straight bets accept `0`, `00`, or `1–36`.
3. Bets are stored in-order and confirmed via a “Confirm” button.
4. Staking model: credits-first, allocated across bets in order. Credit portions are burned only on losing bets.
5. Payout multipliers: even‑money `1:1`, dozens/columns `2:1`, straight `35:1`.
6. House cover check: requires `chipStake + Σ(betAmount × payoutMult)` before spinning.
7. Spin: American roulette with pockets `0`, `00`, and `1–36`. `00` is represented internally as `37`.
8. Settlement: winning bets pay `betAmount × mult` plus return of their chip stake; losing bets burn their credit part.
9. Timeout: session expires via the shared timeout; expired sessions are closed without a spin.

**Ride the Bus (`/ridebus`)**
Implementation: `src/games/ridebus.mjs`, `src/interactions/ridebusButtons.mjs`
1. Entry: guild‑only; house cover check ensures `bet * 10` is available.
2. Staging: 4 questions with increasing multipliers `2× → 3× → 4× → 10×`.
3. Q1 (Color): red vs black; wrong answer loses.
4. Q2 (Higher/Lower): compare to Q1 card; ties lose.
5. Q3 (Inside/Outside): compare to range of first two cards. If Q1/Q2 are a pair, only “Outside” is legal.
6. Q4 (Suit): guess the suit of the final card.
7. Cash out: available after Q3 for `bet * 4`.
8. Staking model: credits-first. Chips stake is moved to the house; credits are burned only on loss.
9. Settlement: payout is `bet * multiplier` (or cashout), paid in chips.
10. Timeout: expired sessions burn credit stake and keep chip stake.

**Dice War (`/dicewar`)**
Implementation: `src/commands/dicewar.mjs`
1. Entry: guild‑only, bet must be positive integer.
2. Roll: player rolls 2d6, house rolls 2d6.
3. Win: player total > house total. Doubles only double payout on a win.
4. Tie: house wins.
5. Staking model: credits-first. Chips stake is moved to the house; credits are burned only on loss.
6. House cover check: requires `chipStake + (2 * bet)` for a possible double‑win.
7. Settlement: win pays `chipStake + bet` or `chipStake + 2*bet` if doubles.

**Horse Race (`/horserace`)**
Implementation: `src/games/horserace.mjs`
1. One race per channel. `/horserace` creates a race card and controls.
2. Betting stage: players select a horse (1–5) and amount (positive integer). One active bet per user.
3. Staking model: credits-first. Credits are burned; chips are staked to house.
4. House cover: exposure is `Σ(betAmount × 4)` and must be covered by house balance.
5. Countdown: host or moderators must start; a 5‑second countdown locks bets.
6. Running: 10 stages, each 2.5s. Each stage advances horses by `5–15` units on a 0–100 track.
7. Finish: early finish if any horse reaches 100; otherwise a winner is forced at stage 10.
8. Bet changes while running: stake amount is locked; only horse swaps are allowed with a fee of `ceil(originalAmount × max(1, stage/2))`.
9. Payouts: base multiplier is `4×`. Tie of 2 halves the multiplier to `2×`. Tie of 3+ uses `1×` (stake refund).
10. Cancellation and timeout: race can be cancelled before start by host/mod; a betting‑stage timeout refunds all stakes and fees.

**Texas Hold’em (`/holdem`)**
Implementation: `src/games/holdem.mjs`, `src/commands/holdem.mjs`
1. Table creation: `/holdem` offers presets or a custom modal. A new channel `holdem-table-N` is created inside the casino category.
2. Presets: `1/2` (min/max `10/100`), `5/10` (`50/500`), `20/40` (`200/2000`). Default rake is `500` bps (5%) with cap = max buy‑in.
3. Channel permissions: read for everyone, write for host + staff. Table is temporary.
4. Auto‑cleanup: empty tables close after 2 minutes; idle lobby closes after 10 minutes; inactive host is removed after 10 minutes.
5. Joining: buy‑in is chips‑only and escrowed (`escrowAdd`). Seat stack equals buy‑in.
6. Rebuy: allowed only between hands; chips‑only; must keep stack within min/max.
7. Hand flow: button rotates each hand; SB/BB are posted and committed to escrow; two hole cards are dealt.
8. Actions: fold, check/call, bet/raise, all‑in. If a player can’t cover a call, only fold or all‑in are allowed.
9. Timers: 30s action timer with a 10s warning; timeout auto‑folds.
10. Streets: preflop → flop → turn → river → showdown. If all active players are all‑in, remaining streets are run out.
11. Side pots: built from committed stacks. Pots are split evenly among tied winners; odd chips go to the first winner after the button.
12. Rake: computed from total pot as `floor(totalPot × rakeBps / 10000)` capped by `rakeCap`, removed from pots before payouts.
13. Settlement: winners are credited in escrow; rake is settled to house; result card is shown, then next hand auto‑starts.

**Jobs System**
Jobs are defined in `src/jobs/registry.mjs` and executed by `src/jobs/shift-engine.mjs`.
- Profiles and status are persisted in Postgres via `src/db/db.pg.mjs`.
- Job scenarios live in `src/jobs/scenarios/`.
- `/job` handles start, cancel, inspect, and admin resets.

**Semuta Cartel**
Cartel features are under `src/cartel/` and the `cartel` command.
- Passive production and market mechanics.
- Dealer system and upkeep.
- Background worker: `startCartelWorker` in `src/cartel/service.mjs`.

**Logging and Auditing**
These channels are configurable per guild:
- Game log channel: `/setgamelogchannel`
- Cash log channel: `/setcashlog`
- Request channel: `/setrequestchannel`
Each game and admin action writes structured summaries when configured.

**Requests and Privacy**
`/request` supports Buy In, Cash Out, and Erase Account Data.
- Request records are stored in DB.
- Staff approval flow is handled via interaction buttons.

**Votes and Rewards**
Vote integrations are in `src/services/votes.mjs`.
- Top.gg: API posting and webhook verification.
- DiscordBotList: webhook verification and rewards.
- Auto-redeem flow can be enabled via env vars.

**Inactivity Lifecycle Configuration**
Inactivity tracking, sweep behavior, and comeback bonus controls use the following env vars.
- `INACTIVE_DAYS_THRESHOLD` (default `30`): minimum inactive days before a user is marked inactive.
- `INACTIVE_SWEEP_INTERVAL_MS` (default `21600000`): interval for the inactivity sweep worker (minimum `60000`).
- `INACTIVE_SWEEP_BATCH_SIZE` (default `100`): max users processed per sweep pass.
- `INACTIVE_DM_ENABLED` (default `true`): enables one-time inactivity DM attempts on inactive transitions.
- `COMEBACK_BONUS_ENABLED` (default `true`): enables comeback bonus grants when inactive users return.
- `COMEBACK_BONUS_CHIPS` (default `10000`): comeback bonus amount in chips.

**News and Updates**
- Update notes: `UPDATE.md`
- News items: `news.md`
- Update broadcast script: `scripts/updatepush.mjs`
- News service: `src/services/news.mjs`

**Emojis**
The bot uses application emojis declared in `src/lib/emojis.mjs`.
- Base mapping: `BASE_EMOJI`
- Runtime mapping: `EMOJI`

**API Server (OAuth + Webhooks)**
`src/api/server.mjs` provides:
- `/auth/discord` → Discord OAuth start
- `/auth/discord/callback` → OAuth callback
- `/auth/logout` → clear session
- Webhooks for Top.gg and DiscordBotList

OAuth requires:
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `AUTH_SESSION_SECRET`

**Operational Scripts**
Useful scripts in `scripts/`:
- `migrate.mjs`: Postgres migrations.
- `create-db.mjs`: Create DB from `DATABASE_URL`.
- `list-application-emojis.mjs`: Inspect emoji list for a bot.
- `build-emoji-map.mjs`: Generate debug emoji override map.
- `post-message.mjs`: Post a message to a guild channel (admin utility).
- `restart.sh`: Deploy commands and restart via systemd or PM2.

**Troubleshooting**
Common issues and fixes.
- Node syntax errors with `with { type: 'json' }`: upgrade to Node 20+.
- Slash commands missing: global propagation can take up to 1 hour.

## Refactoring safety and testing (P0)

The [refactoring checklist](./TO-DO.md) is the active implementation plan.
P0 establishes a baseline; it does not move production code or change game rules.

### Isolated test commands

Run the offline suite with `npm test`. For focused coverage:

```sh
node --import ./test/support/register.mjs --test test/holdem.behavior.test.mjs test/holdem-lifecycle.test.mjs test/holdem-architecture.test.mjs test/isolation.test.mjs
```

Do not run behavior tests with bare `node --test`: production imports through
`src/db/db.auto.mjs` load `db.pg.mjs`, construct a Postgres pool, and execute
schema/legacy migrations at import time. A localhost connection string alone is
not sufficient isolation.

The test-only preload in `test/support/register.mjs`:

- Clears inherited application settings, retaining only OS path/temp/home and
  Node test-context variables, and fixes the timezone to UTC.
- Blocks fetch, TCP, TLS, and HTTP(S) connections. Tests must supply fake clients
  or transports; this is an accidental-service-access guard, not an OS sandbox.
- Registers a loader that rejects direct Postgres and dotenv imports and replaces
  the database adapter without executing it. No local `.env` file is loaded.
- Reads the adapter's exported names to generate functions that delegate to
  `test/support/database.mjs`. Unconfigured calls throw; there are no automatic
  successful database results. Install explicit fakes and reset them after tests.

P0 temporarily appended a test-only `__characterization__` namespace to Hold'em
for private rules. P1 removed that loader transformation: tests now import the
extracted modules directly. The loader only isolates database/runtime imports.

Tests use actual Discord payload builders but fake interaction/channel/message
objects. Hold'em tests control `crypto.randomInt`, `Date.now`, and timer callbacks
through per-test mocks, restored by Node's runner. No bot login or live settlement
is performed. These tests do not establish Postgres transaction correctness;
that requires the isolated-database tests planned for P3.

### Recorded baseline (2026-10-21)

Node `20.20.2`, existing four test files, with isolation installed before the
first run: **47 tests, 45 passing, 2 failing**. No production source was changed.

1. `todo list tracks inactive cleanup and comeback bonus implementation checklist`
   expected the retired feature backlog. Its configuration-documentation coverage
   now checks this guide instead of requiring obsolete TODO content.
2. `dealer list view includes dropdown dealer management controls and confirm routing`
   expects `buildDealerManageConfirmRow`, `handleCartelDealerManageConfirm`, and
   `cartel|dealers|manage|confirm`. Current code uses `buildDealerManageActionRows`,
   `handleCartelDealerManageAction`, and separate fire/pause/unpause routes.
   This pre-existing source-contract mismatch remains open for P4; P0 does not
   change the dealer UX or delete its assertions.

The added isolation/Hold'em files initially pass **34/34 tests**. They cover
facade exports, registry identity, seat/deck shapes, all hand categories,
tie/kicker ordering, bet validation, short calls, partial raises, refunds, street
transitions, fold payouts, side pots/rake, odd-chip ordering, private peeking,
wrong-turn rejection, buy-in checks, manual start, and action timers.

After the P0 changes, the full isolated suite reports **81 tests, 80 passing,
1 failing**: only the pre-existing Cartel dealer-control assertion above.
Syntax checks pass for all added/changed test modules. There are no production
gameplay changes in this baseline.

Two existing rule defects are explicitly characterized, not corrected:

- A six-card overlapping straight run currently selects the lower five-card run.
- When everyone is all-in preflop, one runout path currently deals four board
  cards rather than five.

These tests record compatibility, not desired poker rules. Fix either in a
separate approved gameplay change with corrected expectations. P1 adds automatic
starts, close/host-idle behavior, multi-way side pots, and settlement-call ordering.
Concurrent/duplicate settlement and broader multi-way odd-chip correctness remain
separate financial/rule hardening work, not guarantees of these unit tests.

### Dependency direction and ownership

The intended dependency flow is:

```text
runtime composition -> command/interaction adapters -> feature orchestration
feature orchestration -> pure rules + presentation + persistence
persistence -> shared connection/transaction layer
presentation -> Discord builders + existing formatting/assets/persona helpers
```

- **Composition** owns client creation, listener registration, startup, and
  worker startup/shutdown. Importing a rule module must not start any of these.
- **Adapters** parse Discord inputs and choose a feature operation. Preserve
  existing routes and acknowledgement ordering while moving implementation.
- **Orchestration** owns a feature's registry, state transitions, timer lifecycle,
  and effect ordering. Give each registry/timer one owner; re-export the same map
  instance rather than constructing a second one.
- **Rules** evaluate explicit input/state and return results or documented
  mutations. They must not import Discord, database adapters, runtime settings,
  command handlers, or timers.
- **Presentation** builds payloads without settling balances or choosing the
  next game state. Preserve custom IDs, privacy, attachments, and persona mode.
- **Persistence** owns queries/transactions, not Discord messaging. Reuse one
  pool and pass one transaction client through operations that are already atomic.

The current code does not yet follow every boundary. P1-P6 introduce them
incrementally, preserving facade signatures and import paths. Internal modules
must not import their own facade; that creates a circular dependency.

### Initial subsystem inventory

This is the navigation/ownership inventory, not an exhaustive frozen API for
every future phase. Before each subsystem moves, extend its inventory to list
exact exports/callers, custom IDs, environment names/defaults, timer cancellation,
and transaction boundaries; add characterization tests for the touched surface.

| Area | Current contracts and callers | Mutable state and side effects to preserve |
| --- | --- | --- |
| Runtime | `src/index.mjs` and `src/runtime/application.mjs`; explicit command/component maps, context factory and listener registration in `src/runtime/` | Module-private settings/access/news caches and onboarding/welcome sets; factory-owned orphan queues, timers, posters and vote lock; `DISCORD_TOKEN`, owner IDs and cache/worker settings |
| Persistence | `db.auto.mjs` facade over `db.pg.mjs`; commands, services, games, API and scripts import helpers | One pool, import-time migrations, economy scope, `q`/`q1`/`tx`; `DATABASE_URL`, SSL/certificate and pool settings, primary/global economy IDs; transaction clients and ledger ordering |
| Hold'em | Public facade and route details below | One table registry, per-table timers, string cards, chip-only escrow |
| Cartel | `commands/cartel.mjs` handlers/builders called by runtime; `cartel/service.mjs` called by commands, worker, and debug tools | Sell-minigame sessions, dealer-name/selection caches, market snapshots, worker guild cache and interval; log-channel, pricing, raid, dealer, expiry and worker settings; database-backed reserves/refunds and trade writes |
| Jobs | `startJobShift`, `handleJobShiftButton`, `cancelActiveShiftForUser`; job command and interaction adapters; scenario registry/progression/status/ranks | `sessionsById` and `sessionsByUser`, session expiry and acknowledgement timers; `JOB_SHIFT_BUTTON_ACK_MS`/`INTERACTION_STALE_MS`; stamina, XP, completion and house payouts |
| Other games | Commands and interaction adapters call game modules; shared `session.mjs`, `logging.mjs`, `format.mjs`, `cards.mjs` | Active-session and per-game maps, expiry/cleanup, horse-race ID/channel/message indexes and animation; credits-first settlement differs from Hold'em |
| API and deployment | `api/server.mjs`, API CLIs and `cli/deploy-commands.mjs`; command definitions, `commands.json` | HTTP listener, middleware order, OAuth cookies/state, key scopes, webhook delivery; OAuth/CORS/session/port and provider settings |
| Help and shared UI | Help command/select/page adapters, help sections/menu/embed/image modules; emoji/assets/persona helpers | Help navigation/session state, emoji override loading, asset paths, persona transforms; `EMOJI_MAP_PATH` |
| Services and operations | Votes, inactivity, champion-role, Top.gg, DiscordForge, news/updates; scripts and systemd entry points | Provider cooldowns/retries, inactivity and stats intervals, champion notice map/sync timer, delivery tracking; provider/auth/reward/inactivity settings; maintenance commands may write data |

### Hold'em extraction contract

`src/games/holdem.mjs` currently exports:

- State/helpers: `holdemTables`, `tableKey`, `ensureTableInChannel`, `emptySeat`.
- UI: `buildTableEmbed`, `tableButtons`.
- Operations: `setTableRake`, `hostTable`, `listTables`, `joinTable`, `leaveTable`,
  `rebuyAtTable`, `startHand`.
- Handlers: `onHoldemButton`, `onHoldemBetModal`, `onHoldemJoinModal`,
  `onHoldemCustomModal`.

`test/holdem.behavior.test.mjs` freezes this export-name set and checks identity
of registered table objects. Runtime imports the registry for orphan cleanup.
The four `src/interactions/holdem*.mjs` adapters directly import the corresponding
handlers; the slash command builds the table-creation selector rather than
calling `hostTable` directly. Runtime dispatches `hold|` buttons and modal
prefixes `hold|bet|`, `hold|join|`, and `hold|custom|`.

Preserve IDs for `create|preset|owner`, `join`, `leave`, `start|host`, `sitout`,
`sitin`, `peek`, and `act|fold/check/call/allin/raise|user` after the `hold|`
prefix. Modal fields are `amount`, `buyin`, and custom `sb`/`min`/`max`/`cap`.
Custom-table modal IDs additionally carry owner/source-message identifiers.

The sole map is keyed by `${guildId}:${channelId}`. State holds seats, table
configuration, button/actor indexes, deck/board/burned cards, pot/current bet,
hand/DB identifiers, message references, and persona callbacks. Seat fields
include stack, committed/betRound, hole cards, fold/all-in/acted flags, sit-out,
wait-for-BB, missed blinds, and buy-in/rake snapshots.

Timers belong to table state: `actionTimer` (30 seconds),
`warningTimer` (10 seconds before expiry), `hostKickTimer` (10 minutes),
`closeTimer` (empty 2 minutes/lobby 10 minutes), and `nextHandTimer` (10 seconds).
Cleanup also references `nextHandInterval`. P1 close cleanup cancels all these
handles, including `hostKickTimer`, marks state `closed`, and detaches it from the
registry before asynchronous channel cleanup. Timer callbacks check both the
closed flag and their handle identity, so canceled/replaced callbacks cannot
fold a player, close an active table early, or start another hand.
Hold'em reads no environment variables directly: guild settings supply category
and default rake, while context supplies access lists and persona behavior.

Database effects use `reserveHoldemTableNumber`,
`createHoldemHand`, `getEscrowBalance`, `getUserBalances`, `getHouseBalance`,
`escrowAdd`, `escrowReturn`, `escrowCommit`, `escrowCreditMany`, `settleRake`,
and `finalizeHoldemHand`. The escrow add/return/commit/credit and rake helpers
each have their own `tx` boundary. `persistHandResult`, called by
`scheduleNextHand`, credits winners, settles rake, then finalizes the hand in
separate calls, not one atomic transaction.
Preserve that ordering during a mechanical move; do not assume duplicate
settlement or crash recovery is already guaranteed.

`test/performance-regressions.test.mjs` currently asserts implementation locations
in Hold'em, runtime, database, Cartel, and services. Migrate each assertion with
its code move, retaining coverage for pool settings, database table-number
reservation (no guild-wide channel scan), bounded workers, caches, batching, and
efficient queries. P1 relocates the table-number-reservation source check
to `table-lifecycle.mjs` and adds a behavior test that fails if hosting lists
guild channels. P2 relocates runtime checks to their exact modules without
removing the known failing Cartel assertion. Database/Cartel checks remain for
their future extraction phases.

## Hold'em module layout (P1)

The public entry point [src/games/holdem.mjs](../src/games/holdem.mjs) is a
five-line compatibility facade. All 17 existing exports and the table map's
identity are preserved; runtime and the four existing interaction adapters keep
their import paths. Implementations live in [src/games/holdem/](../src/games/holdem/).

| Module | Responsibility |
| --- | --- |
| `state.mjs` | One table registry, lookups, seat construction, table/seat JSDoc shapes |
| `deck.mjs` | String-card deck and crypto shuffle; burn/deal helpers |
| `evaluation.mjs` | Rank evaluation and comparison, without Discord or database imports |
| `betting.mjs` | Actions, action eligibility, turn order, street advancement |
| `pots.mjs` | Fold payouts, side pots, ties/odd chips, rake, uncalled-bet refunds |
| `presentation.mjs` | Embeds, controls, card formatting, result/table payloads and attachments |
| `persona.mjs` | Existing per-table persona synchronization and transforms |
| `messages.mjs` | Discord message fetch/edit/notice/announcement and removal DMs |
| `persistence.mjs` | Database boundary and existing ordered settlement calls |
| `table-maintenance.mjs` | Underfunded-seat filtering, table disposal and lobby/empty timers |
| `hand-lifecycle.mjs` | Hand setup, blind posting/dealing, action/warning/next-hand timers |
| `table-lifecycle.mjs` | Host/join/leave/rebuy/rake operations and host-idle timer |
| `interaction-handlers.mjs` | Existing button and modal implementations |

Table maintenance deliberately does not import either lifecycle module.
Hand lifecycle imports maintenance; table lifecycle can then import hand
lifecycle without a cycle. Rules only import other rules (and Node crypto for
the deck). Presentation has no database access. Internal modules never import
the facade. `test/holdem-architecture.test.mjs` enforces these boundaries and
executes all four interaction adapters.

Manual and automatic starts share hand initialization, seat reset, blind posting,
dealing, and opening betting setup. Their existing button/actor selection remains
different: manual starts use seat indexes, while automatic starts use the
previous hand's active-seat flags before resetting them. Their missed-blind
removal/refund paths also remain distinct. Do not unify these rules casually.

P1's deliberate lifecycle safety changes are canceled/replaced callback guards,
complete timer cancellation on close, immediate registry detachment, and stopping
hand setup when closure happens during database awaits. Critical hand-creation,
blind-commit, and settlement failures now log explicitly. Existing settlement
continuation/transaction behavior is otherwise retained; this is not a retry,
idempotency, or crash-recovery redesign.

The existing straight/runout defects are still characterized. Other inherited
limitations include the automatic missed-blind notification path referring to
an unavailable `interaction`, and non-atomic/unguarded repeated hand settlement.
They need separate fixes with targeted financial/gameplay expectations, rather
than being silently changed as part of a readability extraction.

Test organization:

- `test/holdem.behavior.test.mjs`: original characterization, rules and base flows.
- `test/holdem-lifecycle.test.mjs`: hosting, joins/rebuys/leaving, automatic starts,
  host replacement, disposal, stale timers, payload/persona, settlement ordering,
  and a fake-ledger conservation flow.
- `test/holdem-architecture.test.mjs`: facade/registry/adapter and import boundaries.
- `test/support/holdem-fixtures.mjs`: shared fake state, clients and controlled timers.

No production Discord server or Postgres database is used by these tests. A live
test-guild/database smoke check remains a pre-deployment requirement, along with
the isolated transaction/concurrency testing planned for P3.

## Bot runtime module layout (P2)

[src/index.mjs](../src/index.mjs) loads environment configuration, constructs the
Discord client, attaches version/update-announcement helpers, registers the runtime,
and logs in. It is now 13 lines rather than 1,933. The explicit composition lives
in [src/runtime/application.mjs](../src/runtime/application.mjs); there is no
dynamic plugin discovery or handler-loading framework.

| Modules under `src/runtime/` | Responsibility |
| --- | --- |
| `application.mjs` | Assemble context/router/background factories and register listeners |
| `config.mjs` | Shared environment defaults, parsing, owner IDs and notice constants |
| `cache-primitives.mjs`, `caches.mjs` | Bounded timed/LRU helpers, guild settings/access caches and invalidation |
| `access.mjs`, `context.mjs` | Owner/admin/moderator checks and guild-bound command dependencies |
| `commands.mjs` | Existing slash command map and settings/access mutation sets |
| `interactions.mjs` | Response/persona middleware, logging, onboarding, cleanup, slash flow and request-modal authorization |
| `component-routing.mjs` | Synchronous, ordered button/select/modal dispatch and custom-ID parsing after middleware |
| `responses.mjs` | Non-mutating ephemeral flag normalization and idempotent persona wrappers |
| `onboarding.mjs`, `review-prompts.mjs` | Welcome bonus/acknowledgement and interaction logging/review DMs |
| `news-notices.mjs`, `champion-notices.mjs`, `comeback.mjs` | Existing user notice lifecycles and caches |
| `guild-welcome.mjs`, `events.mjs` | Guild welcome deduplication/inviter lookup and guild/message event callbacks |
| `vote-delivery.mjs` | Bounded DM workers with per-reward success/failure persistence |
| `orphan-cleanup.mjs` | Delayed, batched startup cleanup; skip active tables and refund before deletion |
| `background.mjs`, `process-errors.mjs` | Ready workers/snapshots/listing posters and explicit process error registration |

### Preserved dispatch contracts

The interaction callback patches response flags, reads guild persona settings,
patches persona behavior, and queues logging before dispatch. Slash commands then
run onboarding, initiate session cleanup, handle inactivity, execute the command,
invalidate mutation caches, send news reminders, and send comeback DMs. The cleanup
promise remains separately exposed through `ctx.awaitSessionCleanup`; game wrappers
do not acquire a new implicit wait. Database wrappers remain bound to the current
guild, and all game-state maps retain their existing identity.

Welcome acknowledgements and request-rejection authorization stay awaited in
middleware before regular component dispatch. The component router is deliberately
synchronous: returning a handler promise without awaiting it preserves the original
error/finally timing. Synchronous routing failures are caught by the interaction
callback; rejected returned handler promises still propagate to the existing
process rejection listener. Champion notices remain in `finally`. Changing that
error boundary should be a separate behavior change, not a side effect of extraction.

`responses.mjs` does not use `lib/interactionAck.mjs`: the latter implements delayed
acknowledgement behavior that does not match the original normalization/persona
wrappers. This extraction does not change acknowledgement deadlines or introduce
new deferred replies.

### Startup, ownership and disposal

`registerRuntime(client)` is one-shot per client and returns the same registration
on repeated calls. The runtime assumes one bot client per process, as do the
existing singleton inactivity/champion services. The ready listener uses `once`;
the background factory also guards repeated starts. Runtime module imports do not
log in, install process handlers, or start workers. They still import the existing
database adapter, which may initialize persistence in production; P3 will address
that boundary. Offline tests replace it before imports.

The returned `dispose()` removes only its own Discord/process listeners, clears
runtime intervals and orphan timers, stops listing posters and the inactivity/
champion watchers, and clears the Cartel worker interval. Disposal is idempotent;
a disposed registration cannot restart. Orphan cleanup checks disposal after
asynchronous work, so it cannot delete a channel or schedule another batch after
shutdown. Already-started database/refund/DM operations are allowed to finish.

This is a runtime-resource disposal API, not a new process shutdown policy:
it does not destroy the Discord client, close the database pool, install signal
handlers, or cancel active game timers. The service stop helpers reset their own
timer references. The unused private entry-point session-stat block was removed;
it had no callers or persistence effects.

### Runtime validation

- `test/runtime.behavior.test.mjs`: seven pre-extraction characterization tests for
  parsing, TTL/LRU bounds, guild/access caches, context, response flags and bounded
  vote DM delivery.
- `test/runtime-dispatch.test.mjs`: slash ordering, onboarding gating, mutation
  invalidation, owner override, error boundaries, persona context, welcome/help
  acknowledgements, request authorization, actual market modal IDs, and 63
  contextual button/select/modal route examples.
- `test/runtime-lifecycle.test.mjs`: single registration/start, listener ownership,
  timer disposal, non-overlapping vote sweeps, status snapshots, delayed orphan
  batches/refund ordering, cancellation during awaits and guild-event early returns.
- `test/runtime-architecture.test.mjs`: acyclic imports, a small entry point, and
  no login/process-listener/timer startup during runtime imports.

P2 verification: **28/28 runtime tests pass**; full isolated suite **133/134 pass**
with the same pre-existing Cartel dealer-management source assertion failure.
The original command map and literal component route selector order were compared
directly; syntax and whitespace checks pass. No live Discord login, production
database access or migrations were used. An isolated guild/database smoke test
remains required before deployment.

P1 validation on Node `20.20.2`: **59/59 focused Hold'em/architecture/isolation
tests pass**. The full isolated suite reports **106 tests, 105 passing, 1 failing**;
the sole failure is the pre-existing Cartel dealer-control source assertion
recorded above. Syntax checks pass for the facade, all 13 extracted modules,
and changed test/support modules. `git diff --check` passes.

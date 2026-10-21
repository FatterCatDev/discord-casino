# Readability Refactoring TODO

This replaces the previous feature backlog. The goal is to make the entire
program easier to navigate, understand, test, and maintain without changing
game rules, payouts, commands, or player-facing behavior.

This is an implementation plan, not a record of completed refactoring.
Existing feature design documents remain available for reference; their
unfinished features are not part of this refactor.

## Priorities and sequencing

Start with P0, then complete P1 (Hold'em) as the reference implementation.
After P1, P2-P5 can proceed independently, one area at a time. P6 follows the
relevant domain extractions, and P7 is the final repository-wide review.
Every phase includes its own tests and documentation updates.

| Priority | Area | Current starting point | Main outcome |
| --- | --- | --- | --- |
| P0 | Baseline and conventions | Four test files in `test/` | Safe, behavior-preserving extraction workflow |
| P1 | Hold'em | Five-line `src/games/holdem.mjs` facade and focused `src/games/holdem/` modules | Extraction implemented; live deployment check remains |
| P2 | Bot runtime | `src/index.mjs`, about 1,933 lines | Small composition root with explicit routing and startup |
| P3 | Database | `src/db/db.pg.mjs`, about 3,172 lines | Shared connection layer and domain query modules |
| P4 | Cartel | Command about 3,589 lines; service about 1,966 | Separate screens, handlers, business rules, and workers |
| P5 | Jobs | `src/jobs/shift-engine.mjs`, about 2,198 lines | Separate session flow, job-specific behavior, and presentation |
| P6 | Remaining surfaces | Other games, API, help, integrations, and scripts | Consistent organization across the program |
| P7 | Final verification | All changed modules and documentation | Verified behavior and accurate navigation docs |

Line counts are approximate review-time observations, not hard limits.

## Refactoring rules

- Split by responsibility, not arbitrary line counts or numbered file parts.
  Aim for focused modules of roughly 200-400 lines where natural; review modules
  above 500 lines rather than enforcing a limit that fragments cohesive code.
- Keep the existing `.mjs`/ES-module approach and directory conventions. No
  framework rewrite, TypeScript migration, or new dependencies are required.
- Keep existing public exports as compatibility facades while moving internals.
  Preserve function signatures, state-map identity, custom IDs, and import paths
  until all callers and tests have been deliberately migrated.
- Pure rules must not import Discord, open a database connection, start timers,
  or read runtime secrets. Orchestrators own side effects and call rules,
  persistence, and presentation modules in an explicit order.
- Keep mutable state and timers under a single owner per feature. Avoid circular
  imports, duplicated registries, and service modules importing command handlers.
- Use descriptive names, short focused functions, and brief comments explaining
  non-obvious rules. Add JSDoc for important state/result shapes and contracts.
- Extract shared helpers only when existing callers genuinely share behavior;
  keep game-specific rules local. Reuse existing helpers before adding new ones.
- Separate mechanical moves from deduplication or behavior changes. Characterize
  suspicious existing behavior first; track rule fixes separately rather than
  silently changing them during extraction.
- Keep work in small, independently reviewable changes. Do not deploy a
  half-extracted subsystem or refactor every feature in one large change.

## P0 - Establish the safety baseline

- [x] Run `npm test` with isolated test configuration; record existing failures
  before edits. Inspect import-time database initialization first so tests cannot
  accidentally connect to or modify production data.
- [ ] Inventory public exports, direct imports, command routes, component custom
  IDs, state maps, timers, environment settings, and database transaction boundaries
  for each subsystem before moving it.
  - [x] Record initial subsystem ownership map and detailed Hold'em contract in
    [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).
  - [ ] Extend the exact inventory for each remaining subsystem before its phase.
- [ ] Add characterization tests for each extraction target before its first
  move, starting with Hold'em. Use fixed state/decks, controlled clocks, and fake
  Discord/database boundaries instead of live services.
  - [x] Add 31 initial Hold'em characterization tests and 3 isolation guard tests,
    without changing production code or correcting existing poker rules.
  - [ ] Extend lifecycle/settlement coverage in P1 and characterize later targets
    before their own extraction.
- [ ] Replace location-dependent assertions in
  `test/performance-regressions.test.mjs` alongside each move. Prefer behavioral
  tests, but retain checks for bounded concurrency, batching, caching, and query
  efficiency; do not simply delete assertions to make moved code pass.
- [x] Define state ownership and import direction in
  [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md), including the distinction between
  command adapters, domain rules, persistence, and presentation.

P0 baseline: 47 existing tests, 45 passing and 2 failing under isolated settings.
The retired feature-backlog assertion is now checked against the developer
guide's configuration documentation. The pre-existing Cartel dealer-control
source assertion remains open for P4; details and known Hold'em quirks are in
the developer guide. After P0 changes: 81 tests, 80 passing, 1 existing failure.
No production module has been moved. The unchecked P0
items above are ongoing gates for the later extraction phases.

## P1 - Split Hold'em first

Keep `src/games/holdem.mjs` as the existing public entry point. Extract focused
modules under `src/games/holdem/`; names below describe the intended boundaries.
Combine adjacent responsibilities if a separate module would be trivial.

### Proposed module boundaries

| Proposed module | Responsibility / existing code to move |
| --- | --- |
| `state.mjs` | Sole `holdemTables` registry, `tableKey`, lookup, seat construction, documented table/seat shapes |
| `deck.mjs` | Hold'em deck creation, card constants, burn/deal operations |
| `evaluation.mjs` | `evaluate7`, straight detection, rank labels, comparison |
| `betting.mjs` | Fold/check/call/raise/all-in, action eligibility, turn order, street transitions |
| `pots.mjs` | Uncalled-bet refunds, side-pot eligibility, split/odd-chip allocation, rake calculations |
| `presentation.mjs` | Table/result embeds, buttons, card formatting, payloads, existing persona/asset application |
| `persistence.mjs` | Existing table/hand writes, escrow operations, payout/rake writes, hand finalization |
| `table-lifecycle.mjs` | Host/join/leave/rebuy, seat and host changes, temporary channel creation |
| `hand-lifecycle.mjs` | Manual/automatic starts, action orchestration, result settlement, next-hand scheduling, owned timer cleanup |
| `interaction-handlers.mjs` | Button/modal validation and dispatch to lifecycle operations |
| `table-maintenance.mjs` | Shared table cleanup and lobby/empty timers, without importing either lifecycle module |
| `messages.mjs`, `persona.mjs` | Discord message effects and existing persona transforms |

### Extraction checklist

- [x] Add Hold'em characterization tests: deck uniqueness; hand ranking including
  ace-low straights and ties; legal/illegal actions; minimum and partial raises;
  blind/turn ordering; all-in runouts; fold wins; and uncalled-bet refunds.
- [x] Cover multi-way side pots, folded-player contributions, ties, odd-chip
  ordering, rake, and chip conservation across stacks, pot, escrow, and house.
  Coverage is deterministic/fake-ledger testing, not a real database atomicity
  guarantee. Existing poker-rule defects remain unchanged.
- [x] Cover hosting, joining, leaving during a hand, rebuy, sit-out/sit-in,
  wait-for-BB, underfunded-seat removal, host replacement, private card peeking,
  action timeout, lobby timeout, and temporary-channel cleanup.
- [x] Extract state, deck, and evaluation first, keeping one registry instance.
  Hold'em uses string cards such as `T` plus suit symbols; shared
  `src/games/cards.mjs` uses `{ r, s }` objects and `10`. Do not substitute one
  representation or shuffle algorithm for the other during extraction.
- [x] Extract betting and pot calculations without Discord or database imports.
  Preserve result shapes and mutation ordering; let lifecycle code perform effects.
- [x] Extract presentation without changing custom IDs, embeds, attachments,
  ephemeral card privacy, or persona behavior.
- [x] Extract persistence while preserving current transaction boundaries, write
  ordering, and escrow semantics. Test that one resolution does not duplicate
  payouts, rake, or hand finalization.
  A single resolution calls each operation once; repeated-resolution idempotency
  and atomic recovery are inherited gaps requiring separate persistence work.
- [x] Extract table and hand lifecycle orchestration. Explicitly assign ownership
  of action/warning, host-idle, lobby/empty-close, and next-hand timers; cancel
  them on close and verify late callbacks cannot act on a closed table.
- [x] Compare `startHand` and `startHandAuto`; characterize their differences
  before sharing hand initialization, blind posting, dealing, and turn setup.
- [x] Move the implementations of `onHoldemButton`, `onHoldemBetModal`,
  `onHoldemJoinModal`, and `onHoldemCustomModal` behind the existing adapters in
  `src/interactions/`. Avoid creating a second competing dispatch layer.
- [x] Verify every caller: `src/commands/holdem.mjs`, all four Hold'em interaction
  adapters, and runtime table-registry/orphan-cleanup usage in `src/index.mjs`.
- [x] Keep the original module as a thin facade, check for circular imports,
  and document the new layout and state/timer ownership.

P1 implementation notes and known limitations are in the developer guide.
Production rules/UX are retained; the explicit safety change is complete timer
cleanup and stale-callback/closed-table guards. The temporary Hold'em test-loader
seam is removed. Database transaction/concurrency guarantees still require P3.
Validation: 59/59 focused tests pass; full suite 105/106 pass with only the
previously recorded Cartel assertion failure. Syntax and diff checks pass.

- [ ] Before deployment, smoke-test the refactored table in an isolated Discord
  guild and database. Offline fake-client tests do not replace this check.

## P2 - Reduce the bot entry point to composition

- [ ] Extract environment parsing, bounded cache helpers, guild settings/access
  caches, and invalidation into focused runtime modules under `src/runtime/`.
  Preserve defaults, TTLs, capacity bounds, and mutation-triggered invalidation.
- [ ] Extract owner/admin/moderator checks and command-context construction.
  Preserve guild binding, persona wrappers, and the session-cleanup promise.
- [ ] Move the existing command map and component routing into explicit routing
  modules. Preserve route precedence and custom-ID parsing; avoid a dynamic
  plugin loader or rewriting already-small command handlers.
- [ ] Separate response acknowledgement/persona middleware from dispatch,
  reusing `src/lib/interactionAck.mjs` where its contract actually matches.
- [ ] Move onboarding, review prompts, news/champion notices, comeback handling,
  guild welcome handling, and vote-reward DM delivery to focused services.
- [ ] Extract ready/guild/message event registration, status snapshots,
  listing-stat triggers, orphan-table cleanup, and scheduled workers. Ensure
  each listener/worker starts once and preserve delayed batches/concurrency.
- [ ] Leave `src/index.mjs` responsible for assembling dependencies, registering
  events, starting workers, and login. Test interaction ordering, access checks,
  acknowledgements, cache invalidation, and startup/shutdown behavior.

## P3 - Split persistence by domain

- [ ] Extract one shared Postgres pool, query helpers, transaction helper, SSL
  configuration, and economy-scope resolution. Never create a pool per module.
- [ ] Move schema/bootstrap and legacy migration routines out of the query
  implementation. Preserve current startup initialization initially; changing
  when migrations run requires a separate explicit rollout decision.
- [ ] Extract query modules for guild settings/access, wallets/house/ledger,
  onboarding/activity/news, votes, requests/API keys/status, jobs, Hold'em escrow,
  and Cartel. Split Cartel further by holdings/market/dealers if needed.
- [ ] Keep `src/db/db.pg.mjs` and `src/db/db.auto.mjs` public contracts stable,
  including existing naming aliases and wrapper signatures. Add export-contract
  tests before simplifying the adapter shim.
- [ ] Keep cross-domain money operations on the same transaction client; preserve
  locking, rollback, unique constraints, global-economy scope, and erasure coverage.
- [ ] Validate extracted queries and bootstrap/migrations against an isolated
  Postgres database, including rollback, concurrent settlement, and repeat startup.
  Keep `scripts/pg-schema.sql` and `scripts/migrate.mjs` behavior aligned.

## P4 - Separate Cartel UI, rules, and background work

- [ ] Split `src/commands/cartel.mjs` into overview/guide, warehouse, shares/market,
  dealer management, and sell-minigame modules. Keep related builders and handlers
  together; separate them further only when size or reuse warrants it.
- [ ] Give order snapshots, dealer selections, name caches, and minigame sessions
  explicit owners. Preserve their keys, lifetimes, confirmations, and custom IDs.
- [ ] Split `src/cartel/service.mjs` into focused pricing/market, warehouse/raids,
  dealers/upkeep, progression, and production-worker responsibilities.
  Reuse existing constants/progression/image modules rather than duplicating them.
- [ ] Move pure calculations away from persistence and Discord builders. Keep
  orchestration and public service exports stable during caller migration.
- [ ] Preserve and extend `test/cartel-raid.logic.test.mjs`; cover order expiry
  and fills, dealer upkeep/pausing, production batching, warehouse export/decay,
  and minigame reservation/refund/payout behavior with controlled time/randomness.

## P5 - Split the job shift engine

- [ ] Separate session registry/timeouts, stage progression/evaluation, completion
  and payout, shared presentation, and job-specific presentation/input handling.
- [ ] Keep bartender, bouncer, and dealer mechanics in focused modules alongside
  the existing scenario registry; retain `src/jobs/shift-engine.mjs` as a facade.
- [ ] Compare existing manual/automatic acknowledgement helpers with
  `src/lib/interactionAck.mjs` before consolidating equivalent behavior.
- [ ] Keep stamina/cooldown/rank/XP logic owned by the existing progression,
  status, and ranks modules. Keep `src/commands/job.mjs` focused on command input.
- [ ] Test each job's success/failure, scoring/timing penalties, retries, timeout,
  cancellation, and duplicate completion, including stamina, XP, and chip effects.

## P6 - Organize the remaining program

- [ ] Split `src/games/horserace.mjs` into race rules, betting/settlement,
  presentation, and lifecycle where warranted; preserve animation and swap fees.
- [ ] Review blackjack, roulette, ridebus, slots, and dicewar command/interaction
  flows. Extract mixed rules/UI/settlement only where it improves navigation;
  do not split small cohesive modules merely for consistency.
- [ ] Separate `src/games/session.mjs` session storage/expiry from message helpers,
  settlement, and promotional notices while preserving cross-game cleanup and
  credits-first behavior. Reuse `format.mjs` and `logging.mjs`.
- [ ] Split `src/api/server.mjs` into app assembly, configuration, OAuth/session
  handling, API-key authorization, and route groups. Preserve URLs, scopes,
  cookies, redirects, middleware ordering, rate limits, and webhook responses.
- [ ] Separate slash-command definitions from deployment in
  `src/cli/deploy-commands.mjs`, grouped by domain. Verify command names, options,
  permissions, job choices, help content, and `commands.json` stay aligned;
  determine how `commands.json` is maintained before changing it.
- [ ] Group `src/lib/helpSections.mjs` content by topic and separate content from
  rendering/navigation. Preserve `helpMenu`, embed/image rendering, emoji and
  asset lookup behavior; retain existing pagination/session helpers.
- [ ] Review vote, inactivity, champion-role, persona, news/update, Top.gg, and
  DiscordForge services for mixed responsibilities. Separate transport, payload
  building, scheduling, and domain decisions only where needed; preserve retries,
  cooldowns, delivery tracking, and existing behavior tests.
- [ ] Review remaining economy, request, moderation, configuration, and debug
  commands. Reuse established permission, acknowledgement, formatting, and logging
  helpers without hiding feature-specific validation in a generic handler.
- [ ] Review API CLIs, environment checks, simulations, broadcasts, migration and
  maintenance scripts. Separate reusable operations from executable entry points
  where useful; preserve package commands and systemd/update/restart contracts.
  Do not remove operational files or run destructive scripts during cleanup.

## P7 - Readability pass and completion gates

- [ ] Expand dense one-line state mutations and deeply nested branches in touched
  modules. Remove stale commented-out implementations after verifying they are
  not requirements; keep useful rule explanations and intentional exceptions.
- [ ] Document important table/session/context/result shapes with JSDoc; make
  units such as chips, credits, milliseconds, seconds, mg, and basis points clear.
- [ ] Classify catch blocks in moved code: preserve deliberate best-effort
  notification handling, but explicitly log/report critical persistence failures.
  Put any recovery/behavior change in a separate tested change, not a silent
  success-shaped fallback added during extraction.
- [ ] Check for dead imports, circular dependencies, duplicate helpers/registries,
  and module-import side effects. Verify pure-module tests need no live secrets.
- [ ] Run focused tests and `node --check` on changed `.mjs` modules for each
  extraction, then `npm test` across the completed refactor. No configured lint
  or build command currently exists; do not claim those checks have run.
- [ ] Smoke-test affected commands, buttons, selects, modals, timers, logging,
  assets, persona mode, API routes, and workers in an isolated Discord guild and
  database. Explicitly verify money conservation and no duplicate settlement.
- [ ] Update [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) with the final module map,
  dependency direction, test commands, and where to add a feature. Update related
  game/job/Cartel docs and README entry points only where organization changed.
- [ ] Review the final diff for accidental rules, economy, schema, configuration,
  or UX changes. Confirm each phase can be reverted independently and mark these
  tasks complete only after their tests and smoke checks pass.

# Top Priority: Performance + Scale Work

## 1) Immediate Scale Priorities

### Cartel Data Path
- [x] Remove cartel write-on-read behavior from pure reads (`getCartelPool`, `listCartelInvestors`, `getCartelInvestor`).
- [x] Rework cartel worker guild discovery to avoid full cross-table `UNION DISTINCT` scanning every tick.
- [x] Process cartel production in batches instead of loading all investors for a guild into memory at once.
- [x] Add targeted indexes for cartel read and ranking patterns.

### Leaderboard Path
- [x] Batch admin balance lookups instead of N per-user balance reads.
- [x] Replace full cartel investor load in leaderboard share ranking with a DB-level top-N query.
- [x] Batch or cache Discord member/user name resolution for leaderboard rendering.
- [x] Add leaderboard-oriented indexes for user ranking queries.

### Discord API + Startup Load
- [x] Move Hold'em orphan cleanup out of startup blocking flow into a background queue.
- [x] Replace Hold'em table-number discovery that fetches all guild channels with a cheaper allocation strategy.
- [ ] Add bounded concurrency for vote reward DM delivery.

### Memory + Runtime Safety
- [ ] Add hard bounds or eviction strategy for long-lived in-memory session/state maps.
- [ ] Revisit cache structures that can grow with guild/user count and make them LRU or size-bounded.
- [x] Add a pruning/index strategy for `user_interaction_events` that scales with time-based cleanup.

## 2) Current Step
- [ ] Add bounded concurrency for vote reward DM delivery.

# Warehouse Raid System Design + Implementation Checklist

## 1) Purpose
Add a warehouse risk system to the Cartel flow that introduces police raids based on stored Semuta heat.

## 2) Goals
- Add warehouse Semuta expiration mechanics.
- Trigger police raids based on a heat model (more Semuta in warehouse = more risk).
- Keep raid behavior deterministic enough for balancing and clear player communication.

## 3) Functional Requirements

### 3.1 Heat Model
- Raid chance is driven by a heat value (higher heat means higher trigger odds).
- Heat should be calculated from warehouse holdings.

### 3.2 Raid Trigger Timing
- On each Cartel command usage, roll a d20 to determine whether a raid triggers.
- A raid check only executes after one of these actions completes:
	- Collect Warehouse
	- Burn Warehouse
	- Export Warehouse

### 3.3 Heat Tiers and Trigger Rules
- Low heat: raid triggers on a natural 20.
- Medium heat: raid triggers on 14 or higher.
- High heat: raid triggers on 8 or higher.
- On fire: raid always triggers.
- If a raid triggers, raid success chance is 50%.

### 3.4 Raid Outcome Rules
- On successful raid:
	- Confiscate Semuta in raid scope.
	- Fine the player using: grams_lost * 6 chips.

### 3.5 Raid Scope Rules
- Collect Warehouse action: raid scope includes warehouse contents plus amount being collected.
- Burn Warehouse action: raid scope includes only Semuta remaining in warehouse after burn.
- Export Warehouse action: raid scope includes only Semuta remaining in warehouse after export.

### 3.6 Player Messaging
- When a raid triggers, notify the player that police are coming.

## 4) Non-Functional Requirements
- Keep behavior auditable in logs (trigger roll, tier, success/fail, confiscated amount, fine).
- Ensure no double-confiscation or negative balances.
- Ensure race-safe updates for warehouse and chips during raid resolution.

## 5) Implementation Checklist

### Data + Constants
- [x] Define heat constants and tier thresholds in cartel constants.
- [x] Define fine multiplier constant (6 chips per gram).
- [ ] Add configurable expiration settings for warehouse Semuta (heat decay constant exists; expiration flow not wired).

### Core Cartel Service Logic
- [x] Implement heat calculation from warehouse amount.
- [x] Implement d20 trigger logic by heat tier.
- [x] Implement 50% raid success check when trigger occurs.
- [ ] Implement raid scope calculation per action type (collect, burn, export).
- [ ] Apply confiscation and fine atomically in storage layer.
- [ ] Ensure raid resolution runs only after action completion.

### Expiration Mechanics
- [ ] Define expiration cadence (per tick/hour/day).
- [ ] Apply expiration decay safely to warehouse Semuta.
- [ ] Log expiration amounts for balancing and debugging.

### Player UX + Messaging
- [ ] Add raid trigger warning message: police are coming.
- [ ] Add final outcome message for success/failure.
- [ ] Include confiscated amount and fine in success message.

### Observability + Safety
- [ ] Add structured logs for heat, roll, tier, trigger, success, scope, and penalties.
- [ ] Guard against negative chips/warehouse values.
- [ ] Add fallback behavior for malformed investor state.

### Testing Checklist
- [ ] Unit test heat calculation across boundary values.
- [ ] Unit test tier mapping and d20 thresholds.
- [ ] Unit test 50% success branch behavior.
- [ ] Unit test raid scope for collect action.
- [ ] Unit test raid scope for burn and export actions.
- [ ] Unit test confiscation + fine transaction behavior.
- [ ] Integration test full action flow with and without raid.

## 6) Acceptance Criteria
- Raid logic triggers only under defined tier conditions.
- Raid executes only after collect, burn, or export completes.
- Successful raid confiscates correct Semuta scope and fines grams_lost * 6 chips.
- Player receives raid warning when triggered and outcome message after resolution.
- Expiration mechanics apply consistently and are logged.

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
- On each warehouse command attempt, roll a d20 to determine whether a raid triggers.
- A raid check executes before one of these actions completes:
	- Collect Warehouse
	- Burn Warehouse
	- Export Warehouse

### 3.3 Heat Tiers and Trigger Rules
- Low heat: raid triggers on d20 roll 1.
- Medium heat: raid triggers on d20 roll 1-7.
- High heat: raid triggers on d20 roll 1-13.
- On fire: raid always triggers (1-20).
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
- [x] Add configurable expiration settings for warehouse Semuta.

### Core Cartel Service Logic
- [x] Implement heat calculation from warehouse amount.
- [x] Implement d20 trigger logic by heat tier.
- [x] Implement 50% raid success check when trigger occurs.
- [x] Implement raid scope calculation per action type (collect, burn, export).
- [x] Apply confiscation and fine atomically in storage layer.
- [x] Ensure raid resolution runs only after action completion.

### Expiration Mechanics
- [x] Define expiration cadence (per tick/hour/day).
- [x] Apply expiration decay safely to warehouse Semuta.
- [x] Log expiration amounts for balancing and debugging.

### Player UX + Messaging
- [x] Add raid trigger warning message: police are coming.
- [x] Add final outcome message for success/failure.
- [x] Include confiscated amount and fine in success message.

### Observability + Safety
- [x] Add structured logs for heat, roll, tier, trigger, success, scope, and penalties.
- [x] Guard against negative chips/warehouse values.
- [x] Add fallback behavior for malformed investor state.

### Testing Checklist
- [x] Unit test heat calculation across boundary values.
- [x] Unit test tier mapping and d20 thresholds.
- [x] Unit test 50% success branch behavior.
- [x] Unit test raid scope for collect action.
- [x] Unit test raid scope for burn and export actions.
- [x] Unit test confiscation + fine transaction behavior.
- [x] Integration test full action flow with and without raid.

## 6) Acceptance Criteria
- Raid logic triggers only under defined tier conditions.
- Raid executes only after collect, burn, or export completes.
- Successful raid confiscates correct Semuta scope and fines grams_lost * 6 chips.
- Player receives raid warning when triggered and outcome message after resolution.
- Expiration mechanics apply consistently and are logged.

# Dune Inventory Items Design

## 1) Collection Identity

Primary collection name:
- **Desert Writs**

Optional premium shop label:
- **CHOAM Black-Market Relics**

Design tone:
- Scarcity, risk, foresight, political leverage.
- Effects alter bet settlement, never game RNG.

## 2) Global Rules

- All items are consumables.
- All items are destroyed immediately when used.
- Item effects apply only to eligible gambling commands.
- Item effects never alter game RNG/dealing/spin outcomes.
- One active item effect per player at a time (recommended MVP rule).

## 3) Core Item Specs

### 3.1 ITEM_SPICE_SURGE_SEAL

Display Name:
- Spice Surge Seal

Fantasy:
- A concentrated spice writ that amplifies your next stake without increasing your downside.

Use Type:
- Single-use, next-initial-bet modifier.

Effect Summary:
- Doubles the next **initial** bet for free.

Exact Behavior:
- Player uses item.
- Next eligible game reads `effective_bet = base_bet * 2`.
- Losses are still capped to `base_bet` (not effective bet).
- Wins are calculated using `effective_bet`.

Required Restriction:
- Applies only to the first wager snapshot at game start.
- Does not apply to any later wager changes inside the same game flow.
- Example: in blackjack, if player later double-downs, that follow-up bet is not boosted by this item.

Example:
- Base bet: 1000 chips
- Effective bet: 2000 chips
- If lose: wallet delta = -1000
- If win (1:1 style payout): payout math uses 2000

Settlement Contract (recommended):
- `base_bet`: player risked chips
- `effective_bet`: outcome math stake
- `max_loss = base_bet`
- `effect_consumed_on`: first eligible game resolution after use

### 3.2 ITEM_SHIELD_WALL_PROTOCOL

Display Name:
- Shield Wall Protocol

Fantasy:
- A temporary defensive writ that neutralizes losses while your shield wall holds.

Use Type:
- Timed single-use protection state.

Effect Summary:
- During a timer window, losing outcomes are refunded to break-even.
- Positive outcomes resolve normally.

Exact Behavior:
- Player uses item and a timer starts.
- During active window:
  - If a bet outcome is negative, refund enough to make net result 0 for that bet.
  - If a bet outcome is positive, do nothing extra (normal win behavior).
- Item effect ends when timer expires or protection pool is depleted.

Balance Guard (required):
- This effect requires a **protection pool** so it cannot grant infinite downside immunity.
- Pool is reserved at activation and consumed by loss refunds.

Recommended Activation Model:
- `protection_pool_cap = min(player_balance_at_use, configured_cap)`
- Suggested configured cap range: 10,000 to 50,000 chips (tunable)

Per-bet Refund Rule:
- `refund = min(abs(net_loss), remaining_pool)`
- Player net on losing bet becomes:
  - `net_after_refund = net_loss + refund`
- If `remaining_pool = 0`, effect ends immediately.

Suggested Duration:
- 3 to 5 minutes (tunable)

Example:
- Player activates with 10,000 pool and 5-minute timer.
- Bet 1: loses 1000 -> refund 1000 -> net 0, pool 9000
- Bet 2: wins 1500 -> normal +1500, pool unchanged
- Bet 3: loses 12,000 -> refund 9000 (pool remaining) -> net -3000, pool 0, effect ends

Settlement Contract (recommended):
- `protection_active_until`: timestamp
- `protection_pool_remaining`: integer
- `on_negative_result`: apply refund logic
- `on_non_negative_result`: no override


### 3.3 ITEM_ORNITHOPTER_TAILWIND

Display Name:
- Ornithopter Tailwind

Use Type:
- Single-use.

Effect Summary:
- Next win gets +15 percent bonus payout (base payout only).

Exact Behavior:
- Item is armed on use and waits for the next eligible resolved wager.
- If the next eligible result is a win, apply `bonus = floor(base_payout * 0.15)`.
- Bonus applies only to the base payout amount, not to any externally granted bonus layers.
- If the next eligible result is not a win, no bonus is granted.

Consumption Rule:
- Consumed on the next eligible resolved wager regardless of outcome.

### 3.4 ITEM_SIETCH_CREDIT_SLIP

Display Name:
- Sietch Credit Slip

Use Type:
- Single-use.

Effect Summary:
- Refund 20 percent of next losing initial bet.

Exact Behavior:
- Item is armed on use and waits for the next eligible resolved wager.
- If the next eligible result is a loss, refund `floor(initial_bet * 0.20)`.
- Refund uses only the initial bet snapshot; follow-up in-round bet changes are not included.
- If the next eligible result is not a loss, no refund is granted.

Consumption Rule:
- Consumed on the next eligible resolved wager.

### 3.5 ITEM_ENERGY_DRINK

Display Name:
- Energy Drink

Use Type:
- Single-use.

Effect Summary:
- Resets job stamina to max.

Exact Behavior:
- On use, set player job stamina to configured maximum immediately.
- Works independently of gambling outcomes.

Consumption Rule:
- Consumed immediately when use succeeds.

Restrictions:
- Cannot be used if stamina is already at max (recommended to prevent waste).

### 3.6 ITEM_HOUSE_CREDIT_CHIT

Display Name:
- House Credit Chit

Use Type:
- Single-use, next-initial-bet modifier.

Effect Summary:
- The next initial bet is free.

Exact Behavior:
- Player uses item.
- On next eligible resolved wager, no chips are deducted for the initial bet stake.
- Outcome calculations still use the full player-entered initial bet amount as the effective bet.
- Follow-up in-round wager changes are not free.

Validation Rule:
- House Credit Chit does not bypass bet-size validation.
- Player cannot place an initial bet above current balance while this item is active.
- Item only waives stake deduction for an otherwise valid initial bet amount.

Example:
- Player uses item.
- Player places an initial bet of 10,000 chips.
- Initial stake deduction is 0 chips.

Consumption Rule:
- Consumed on the next eligible resolved wager.

## 4) Eligibility and Consumption Rules

Eligibility:
- Applies to configured gambling commands only.
- Non-gambling and admin/economy commands cannot consume item effects.

Consumption Policy:
- Item is destroyed when `/useitem` succeeds.
- Effect is considered spent even if timer ends without full value extracted.
- Invalid bet commands (validation failures) do not consume/advance effect state.

Concurrency Rules:
- If player attempts to arm another item while one is active, block with clear message.
- Settlement + effect updates must be atomic to prevent double processing.

## 5) UX Copy Recommendations

Arming:
- "You consumed **Spice Surge Seal**. Your next initial bet is amplified."
- "You consumed **Shield Wall Protocol**. Loss protection active for 5m (Pool: 10,000)."

During Bet (Spice Surge):
- "Base Bet: 1,000 | Effective Bet: 2,000"

During Bet (Shield Wall):
- "Shield Wall active: remaining pool 9,000 | expires in 03:42"

Resolution (Shield Wall):
- "Loss intercepted: 1,000 refunded by Shield Wall Protocol. Net: 0"

## 6) Anti-Abuse and Safety

- Enforce one active effect per player.
- Add idempotency key per game result settlement.
- Log all item lifecycle events: arm, consume, refund, expire.
- Cap pool and duration server-side; never trust client values.
- Add clear audit fields: base bet, effective bet, refund amount, pool remaining.

## 7) Suggested Tuning Defaults (MVP)

ITEM_SPICE_SURGE_SEAL:
- Price tier: medium-high
- Cooldown between uses: optional (0 to 60s)

ITEM_SHIELD_WALL_PROTOCOL:
- Duration: 300s
- Pool cap: 10,000 chips (starter)
- Price tier: high

ITEM_ORNITHOPTER_TAILWIND:
- Bonus payout: +15 percent (base payout only)
- Price tier: medium

ITEM_SIETCH_CREDIT_SLIP:
- Refund ratio: 20 percent of next losing initial bet
- Price tier: low-medium

ITEM_ENERGY_DRINK:
- Effect: reset job stamina to max
- Price tier: medium

ITEM_HOUSE_CREDIT_CHIT:
- Effect: next initial bet costs 0 chips
- Price tier: high

## 8) Implementation Notes

Recommended canonical item ids:
- `ITEM_SPICE_SURGE_SEAL`
- `ITEM_SHIELD_WALL_PROTOCOL`
- `ITEM_ORNITHOPTER_TAILWIND`
- `ITEM_SIETCH_CREDIT_SLIP`
- `ITEM_ENERGY_DRINK`
- `ITEM_HOUSE_CREDIT_CHIT`

Recommended required effect fields:
- `effect_id`
- `source_item_id`
- `armed_at`
- `expires_at` (for timed item)
- `pool_remaining` (for protection item)
- `status` (`ARMED`, `CONSUMED`, `EXPIRED`)

## 9) QA Scenarios

Spice Surge Seal:
- Use item, place eligible bet, verify effective bet doubled.
- Verify max loss remains original base bet.
- Verify later in-round additional wager is not boosted.

Shield Wall Protocol:
- Use item, lose multiple bets, verify refunds consume pool.
- Win during active window, verify no extra changes.
- Exhaust pool before timer, verify effect ends immediately.
- Let timer expire with pool remaining, verify effect expires cleanly.

Ornithopter Tailwind:
- Use item, next resolved wager is a win, verify +15 percent applies to base payout only.
- Use item, next resolved wager is not a win, verify no bonus and item is still consumed.

Sietch Credit Slip:
- Use item, next resolved wager is a loss, verify 20 percent of initial bet is refunded.
- Use item, next resolved wager is not a loss, verify no refund and item is consumed.

Energy Drink:
- Use item below max stamina, verify stamina becomes max and item is consumed.
- Attempt to use at max stamina, verify use is blocked (or clearly warned) and no consumption occurs.

House Credit Chit:
- Use item, place next initial bet of 10,000, verify 0 chips are deducted upfront.
- Verify outcome settlement still uses full initial bet amount for payout/loss math.
- Verify follow-up in-round wager additions are charged normally.
- Attempt to bet above current balance while active, verify wager is rejected by normal balance validation.

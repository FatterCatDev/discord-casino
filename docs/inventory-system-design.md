# Inventory System Design

## 1. Purpose
Introduce a player inventory system where items are bought from a shop and consumed to affect betting outcomes in casino games.

Core direction:
- Every player has an inventory.
- Players buy items through `/shop`.
- Items do not modify core game logic (card dealing, roulette wheel, dice RNG, etc).
- Items modify bet interpretation and settlement behavior around a game result.

This keeps game fairness logic isolated while still allowing strategic item usage.

## 2. Goals
- Add a persistent per-player inventory.
- Add purchasable consumable items.
- Support "pre-bet" item effects that apply to the next eligible gamble.
- Keep effects transparent in UX and logs.
- Prevent abuse via strict effect scoping and expiry.

## 3. Non-Goals
- Rewriting existing game outcome engines.
- Adding collectible rarity systems at launch.
- Building item crafting/trading between players (future).

## 4. Key Gameplay Rules
- Player uses an item before placing a bet.
- Item creates an `active_effect` attached to player state.
- Next eligible gambling command consumes the effect.
- Effect changes bet accounting only, not game RNG.
- One active effect at a time (MVP rule).

Example (required behavior):
1. Player uses `Item1` (Double Next Bet Free).
2. Player places 1000 chips on blackjack.
3. Game resolves as if the stake were 2000 chips.
4. If player loses: they lose only 1000 chips (their real stake).
5. If player wins: payout is calculated from 2000 chips.

## 5. Player-Facing Command Surface
### `/shop`
- Lists buyable items, prices, and short effect text.
- Supports purchase action for chosen quantity.
- Deducts chips and adds item quantity to inventory.

### Recommended companion commands
- `/inventory`: view owned items and quantities.
- `/useitem <item>`: consume one item and arm its next-bet effect.
- `/item clear`: clear currently armed effect (optional but useful).

## 6. Data Model

### 6.1 Tables
#### `player_inventory`
- `guild_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `item_id` TEXT NOT NULL
- `quantity` INTEGER NOT NULL DEFAULT 0
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Primary key: `(guild_id, user_id, item_id)`

#### `shop_items`
- `item_id` TEXT PRIMARY KEY
- `display_name` TEXT NOT NULL
- `description` TEXT NOT NULL
- `price_chips` BIGINT NOT NULL
- `enabled` BOOLEAN NOT NULL DEFAULT TRUE
- `stack_limit` INTEGER NULL
- `effect_type` TEXT NOT NULL
- `metadata_json` JSONB NOT NULL DEFAULT '{}'::jsonb
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

#### `player_active_item_effect`
- `guild_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `effect_id` TEXT NOT NULL
- `source_item_id` TEXT NOT NULL
- `effect_payload_json` JSONB NOT NULL DEFAULT '{}'::jsonb
- `armed_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `expires_at` TIMESTAMPTZ NULL
- `consumed_at` TIMESTAMPTZ NULL
- `status` TEXT NOT NULL DEFAULT 'ARMED' CHECK (status IN ('ARMED','CONSUMED','EXPIRED','CLEARED'))
- Primary key: `(guild_id, user_id)`

#### `item_effect_audit_log`
- `id` TEXT PRIMARY KEY
- `guild_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `item_id` TEXT NOT NULL
- `effect_id` TEXT NOT NULL
- `event_type` TEXT NOT NULL
- `game_name` TEXT NULL
- `base_bet` BIGINT NULL
- `effective_bet` BIGINT NULL
- `net_settlement` BIGINT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `metadata_json` JSONB NOT NULL DEFAULT '{}'::jsonb

### 6.2 Indexes
- `player_inventory (guild_id, user_id)`
- `player_active_item_effect (guild_id, user_id, status)`
- `item_effect_audit_log (guild_id, user_id, created_at DESC)`

## 7. Item Effect Engine

### 7.1 Why a separate engine
Games should call one shared bet-adjustment layer before settlement:
- Input: game command context and intended base bet.
- Output: `base_bet`, `effective_bet`, and settlement rules.

This avoids re-implementing item logic per game.

### 7.2 Settlement contract
Each game settles through a common adapter:
- `base_bet`: what player risked from wallet.
- `effective_bet`: what outcome math uses.
- `loss_cap`: max real chips player can lose.
- `win_multiplier`: standard game multiplier logic remains unchanged.

For `Double Next Bet Free`:
- `effective_bet = base_bet * 2`
- `loss_cap = base_bet`
- On loss, wallet delta = `-base_bet`
- On win, payout uses `effective_bet`

## 8. Placeholder Item Catalog (MVP)

### `ITEM_DOUBLE_NEXT_BET_FREE`
- Display name: Double Next Bet (Free)
- Description: Your next eligible bet counts as 2x stake. If you lose, you only lose your original stake.
- Type: pre-bet single-use
- Scope: next eligible gamble only
- Stack behavior: normal inventory stack, only one active effect can be armed

### `ITEM_BET_INSURANCE_25`
- Display name: Bet Insurance 25%
- Description: On your next losing eligible bet, refund 25% of your base stake.
- Type: post-result single-use
- Scope: consumed on next eligible gamble resolution

### `ITEM_SAFE_PUSH_TOKEN`
- Display name: Safe Push Token
- Description: If your next eligible gamble loses, convert the outcome to push (stake returned).
- Type: post-result single-use
- Scope: consumed on first eligible losing resolution

### `ITEM_LUCKY_EDGE_10`
- Display name: Lucky Edge +10%
- Description: Increase next eligible winning payout by +10% of base payout.
- Type: payout modifier
- Scope: next eligible gamble only

Note: Placeholder items should be behind config flags so balancing can be tuned without code edits.

## 9. Eligibility Rules
- Item effects apply only to configured gambling commands (for example blackjack, roulette, dicewar, holdem).
- Effects do not apply to admin, economy transfer, or non-gambling commands.
- If command validation fails (invalid bet, cooldown, etc), effect remains armed.
- If game starts and resolves, effect is consumed per item policy.

## 10. Purchase and Usage Flows

### 10.1 Purchase flow (`/shop`)
1. Player opens `/shop`.
2. Player selects item and quantity.
3. System validates chip balance and stack limit.
4. Deduct chips, increment inventory quantity.
5. Emit audit event: `SHOP_PURCHASE`.

### 10.2 Use flow (`/useitem`)
1. Validate player owns quantity > 0.
2. Validate no active armed effect exists.
3. Decrement inventory quantity.
4. Create/replace row in `player_active_item_effect` with `ARMED`.
5. Emit audit event: `ITEM_ARMED`.

### 10.3 Bet resolve flow
1. Game receives base bet and validates as normal.
2. Shared effect engine checks `player_active_item_effect`.
3. If eligible, compute adjusted settlement contract.
4. Game resolves normally using adjusted contract.
5. Consume effect with `status = CONSUMED`, set `consumed_at`.
6. Emit audit event: `ITEM_CONSUMED_ON_GAME`.

## 11. UX and Messaging Requirements
- Pre-game message should clearly show when an effect is active.
- Bet confirmation should display both base bet and effective bet.
- Settlement message should show why payout/loss differs from base bet.

For Double Next Bet (example copy):
- "Item active: Double Next Bet (Free)."
- "Base Bet: 1000 | Effective Bet: 2000"
- Loss copy: "You lost 1000 chips (effective bet bonus was free)."
- Win copy: "You won based on 2000 chips due to your active item."

## 12. Safety, Abuse Prevention, and Limits
- One active effect per player at a time (MVP).
- Optional expiry window (for example 24h) to prevent forgotten armed state.
- Atomic DB transaction for consume + settlement to avoid double-consume race.
- Idempotency key per game resolution to prevent duplicate payouts.
- Full audit logs for purchases, arms, consume events, and clears.

## 13. Integration Plan

### Phase 1: Data and config
- Add migrations for inventory/effect/audit tables.
- Add static config registry for shop items.

### Phase 2: Shop and inventory commands
- Implement `/shop` read + purchase flow.
- Implement `/inventory` and `/useitem`.

### Phase 3: Shared effect settlement layer
- Introduce bet adjustment adapter used by gambling commands.
- Integrate with 1-2 games first (blackjack, roulette).

### Phase 4: Expand and harden
- Roll out to remaining eligible games.
- Add tests and telemetry dashboards.

## 14. Testing Strategy

### Unit tests
- Inventory increment/decrement correctness.
- Active effect arming and single-active enforcement.
- Double Next Bet settlement math:
  - base=1000, loss -> -1000
  - base=1000, win with 1:1 payout -> +2000 gross return path per existing settlement model
- Consume-once behavior and idempotency.

### Integration tests
- `/shop` purchase updates balance + inventory.
- `/useitem` then blackjack bet consumes effect exactly once.
- Validation failures do not consume armed effect.

### Manual QA
- Buy item, use item, place eligible bet, verify result text and ledger.
- Confirm non-eligible command does not consume effect.
- Confirm active effect blocks second arm.

## 15. Open Design Questions
- Should items be global per guild economy or globally account-wide?
- Should `/shop` pricing be fixed or dynamic based on house balance?
- Should multiple effects be queueable after MVP?
- Which games are included in "eligible" at first release?

## 16. MVP Recommendation
Ship only one item first:
- `ITEM_DOUBLE_NEXT_BET_FREE`

Reason:
- Directly matches the desired behavior.
- Easy to explain to players.
- Low implementation risk with high engagement impact.

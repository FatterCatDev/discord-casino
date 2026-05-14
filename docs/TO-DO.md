# DiscordForge API Integration (Top Priority)

## 1) Purpose
Integrate DiscordForge.org API support for bot listing operations, starting with server stats posting and staged support for vote checks and command sync.

## 2) Priority
- Priority: `P0` (highest)

## 3) Immediate Checklist
- [ ] Finalize and approve design doc: `docs/discordforge-api-integration-design.md`.
- [ ] Store DiscordForge API key in runtime secrets (env only, not in repo files).
- [ ] Add env validation for DiscordForge settings.
- [ ] Implement stats poster (`POST /api/bots/stats`) with 5+ minute interval.
- [ ] Trigger immediate stats post on ready/guild join/guild leave events.
- [ ] Add safe retries/backoff and structured logging for DiscordForge API calls.
- [ ] Add DiscordForge vote webhook endpoint plan (`Authorization` secret check, 2xx within 5s, skip `isTest`).
- [ ] Add optional vote-check helper (`GET /api/bots/:id/votes/check`) integration for future reward flow.
- [ ] Add slash-command sync (`POST /api/external/bots/commands`) and run it on deploy.
- [ ] Add tests for payload building, rate-limit guardrails, and failure handling.
- [ ] Document rollout and rollback procedure.

## 4) Acceptance Criteria
- [ ] DiscordForge stats are posted successfully on schedule without violating rate limits.
- [ ] Stats post can be manually triggered from runtime events.
- [ ] Missing/invalid key disables integration gracefully with clear logs.
- [ ] No API key is stored in source-controlled files.

# Inventory System Checklist

## 1) Purpose
Implement a persistent player inventory and shop flow where consumable items affect bet interpretation and settlement outcomes for eligible casino games.

## 2) Goals
- Every player has an inventory.
- All items are purchasable via `/shop`.
- Players can arm one item effect for the next eligible gamble.
- Item effects modify betting outcomes/settlement only, not game RNG logic.
- First MVP item supports: "double next bet for free" behavior.

## 3) Functional Requirements

### 3.1 Inventory + Shop
- [ ] Add `/shop` listing with item name, description, and chip price.
- [ ] Add purchase flow: validate balance, deduct chips, increment inventory quantity.
- [ ] Add `/inventory` to list owned items and quantities.

### 3.2 Item Use + Active Effect
- [ ] Add `/useitem <item>` to arm one active effect.
- [ ] Enforce single active effect at a time per player.
- [ ] Do not consume active effect on invalid/cancelled command attempts.

### 3.3 Bet Settlement Integration
- [ ] Introduce shared effect adapter to compute `base_bet` vs `effective_bet`.
- [ ] Ensure game engines remain unchanged for outcome RNG.
- [ ] Consume effect exactly once on next eligible game resolution.

### 3.4 Required MVP Behavior
- [ ] Implement `ITEM_DOUBLE_NEXT_BET_FREE`:
- [ ] If user bets 1000 with active item, effective bet is 2000.
- [ ] If user loses, loss is capped at 1000.
- [ ] If user wins, payout is calculated from 2000.

## 4) Data + Migration Checklist

### Schema
- [ ] Add `player_inventory` table.
- [ ] Add `shop_items` table (or registry-backed equivalent with persistence needs).
- [ ] Add `player_active_item_effect` table.
- [ ] Add `item_effect_audit_log` table.
- [ ] Add indexes for `(guild_id, user_id)` lookups and audit recency.

### Safety + Backward Compatibility
- [ ] Ensure migrations are idempotent (`IF NOT EXISTS` guards).
- [ ] Add parsing/normalization helpers for effect payload JSON.
- [ ] Add transactional boundaries for settle + consume operations.

## 5) DB Helper Checklist

### Inventory Helpers
- [ ] Upsert inventory rows and quantity increments/decrements.
- [ ] Guard against negative quantity.
- [ ] Add helper to list inventory for display.

### Effect Helpers
- [ ] Load active effect by guild/user.
- [ ] Arm effect atomically from inventory decrement.
- [ ] Consume/expire/clear effect with status transitions.
- [ ] Add idempotency protection for duplicate resolution attempts.

### Audit Helpers
- [ ] Log `SHOP_PURCHASE`, `ITEM_ARMED`, `ITEM_CONSUMED_ON_GAME`, `ITEM_CLEARED`, `ITEM_EXPIRED`.
- [ ] Ensure metadata is JSON-safe and bounded.

## 6) Runtime Integration Checklist

### Command Integration
- [ ] Add `/shop` command implementation.
- [ ] Add `/inventory` command implementation.
- [ ] Add `/useitem` command implementation.

### Eligible Game Integration
- [ ] Integrate effect adapter with blackjack.
- [ ] Integrate effect adapter with roulette.
- [ ] Expand to other configured gambling commands.

### UX Messaging
- [ ] Show active effect before settlement.
- [ ] Display `Base Bet` and `Effective Bet` in result messaging.
- [ ] Explain modified loss/win when item was used.

## 7) Testing Checklist

### Unit Tests
- [ ] Inventory buy/use decrement behavior is correct.
- [ ] Single-active-effect enforcement.
- [ ] Double-next-bet math is correct for win/loss paths.
- [ ] Invalid command attempt does not consume effect.
- [ ] Idempotent settlement does not double-consume or double-pay.

### Integration Tests
- [ ] `/shop` purchase updates balance + inventory.
- [ ] `/useitem` then eligible gamble consumes exactly once.
- [ ] Non-eligible command leaves effect armed.

### Regression Tests
- [ ] Core game outcome logic remains unchanged without active items.
- [ ] Existing ledger/transaction logs remain consistent.

## 8) Rollout Checklist

### Phase 1: Data + Commands
- [ ] Deploy schema and helpers.
- [ ] Enable `/shop`, `/inventory`, `/useitem` with MVP item only.

### Phase 2: Game Coverage
- [ ] Roll out effect adapter to additional games.
- [ ] Monitor payout variance and item usage rates.

### Phase 3: Stabilization
- [ ] Tune item pricing/balance from telemetry.
- [ ] Add additional placeholder items behind config flags.

## 9) Acceptance Criteria
- [ ] Every player can own inventory items.
- [ ] Players can buy items through `/shop`.
- [ ] Player can arm an item and have it apply to the next eligible gamble.
- [ ] `ITEM_DOUBLE_NEXT_BET_FREE` matches exact expected behavior.
- [ ] Item application is auditable and resilient to duplicate processing.

# Inactive User Cleanup + Comeback Bonus Checklist

## 1) Purpose
Implement the inactivity lifecycle described in the design doc so users inactive for 30+ days are marked inactive, excluded from broadcast DMs, and rewarded when they return.

## 2) Goals
- Mark users inactive after 30 days without command interaction.
- Attempt a one-time inactivity DM offer for 10,000 chips.
- Exclude inactive users from bulk broadcast audiences.
- Reactivate users on next command and grant comeback bonus once per inactivity cycle.
- Keep lifecycle and bonus events auditable.

## 3) Functional Requirements

### 3.1 Lifecycle Tracking
- Track `last_interaction_at` for command-triggering users.
- Mark user inactive when `last_interaction_at` exceeds threshold.
- Store inactivity timestamps and DM attempt metadata.

### 3.2 Inactive DM Flow
- Send one DM attempt when user transitions to inactive.
- DM failure must not block state transitions.
- Record DM attempt outcome in lifecycle event logs.

### 3.3 Broadcast Audience Filtering
- Broadcast scripts must target only active users.
- Staff/admin users are excluded from inactivity/broadcast lifecycle audience handling.

### 3.4 Reactivation + Bonus
- On first command from inactive user, reactivate user.
- Grant comeback bonus once per inactivity cycle.
- Send welcome-back embed with bonus amount and timestamp.
- Ignore DM send failures on reactivation path.

## 4) Data + Migration Checklist
- [ ] Keep schema and migration notes aligned with current implementation state.

## 5) DB Helper Checklist
- [ ] Keep DB helper tasks synchronized with current helper coverage and gaps.

## 6) Runtime Integration Checklist
- [ ] Keep runtime integration notes focused on remaining behavior gaps only.

## 7) Script + Ops Checklist

### Broadcast Script Integration
- [ ] Ensure script output reports skipped inactive/staff users.

### Configuration
- [ ] Keep env/config rollout notes in sync with current deployment defaults.

## 8) Testing Checklist

### Unit Tests
- [ ] Reactivation flips status and grants bonus exactly once per cycle.
- [ ] Broadcast audience helper excludes inactive users.
- [ ] Broadcast audience helper excludes admin/mod users.

### Integration Tests
- [ ] End-to-end: active -> inactive transition with DM attempt.
- [ ] End-to-end: inactive -> command -> reactivated + bonus granted.
- [ ] End-to-end: second command in same cycle does not duplicate bonus.

### Regression Tests
- [ ] Existing command handling unaffected for active users.
- [ ] Existing announcement flows continue for active users.
- [ ] No duplicate grants under concurrent command attempts.

## 9) Rollout Checklist

### Phase 1: Schema + Dry Run
- [ ] Deploy schema and helpers.
- [ ] Enable sweep with `INACTIVE_DM_ENABLED=false`.
- [ ] Validate inactive counts and batch behavior in logs.

### Phase 2: Enable DMs + Bonus
- [ ] Enable inactivity DM attempts.
- [ ] Enable comeback bonus grants.
- [ ] Monitor transaction volume and DM failure rates.

### Phase 3: Stabilization
- [ ] Verify staff/admin exclusion behavior in production.
- [ ] Verify broadcast audience reduction metrics.
- [ ] Confirm no duplicate bonuses after one week.

## 10) Acceptance Criteria
- [ ] Users inactive >30 days are marked inactive.
- [ ] Inactive users receive one DM attempt with comeback offer.
- [ ] Inactive users are excluded from broadcast DM scripts.
- [ ] Staff/admin users are excluded from inactivity/broadcast lifecycle handling.
- [ ] Returning inactive users are reactivated and receive 10,000 chips.
- [ ] Comeback bonus is granted once per inactivity cycle.
- [ ] Lifecycle and bonus events are auditable.

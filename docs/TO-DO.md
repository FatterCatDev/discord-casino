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

### Schema
- [x] Add `user_activity_lifecycle` table.
- [x] Add `user_activity_lifecycle_events` audit table.
- [x] Add index on lifecycle `last_interaction_at`.
- [x] Add index on lifecycle `is_inactive`.

### Safety + Backward Compatibility
- [x] Ensure migration is idempotent (`IF NOT EXISTS` guards).
- [x] Add normalization/parsing helpers for lifecycle rows in DB layer.
- [x] Add transactional boundaries where lifecycle and bonus updates co-occur.

## 5) DB Helper Checklist

### Lifecycle Read/Write Helpers
- [x] Upsert/update `last_interaction_at` on interaction.
- [x] Query users eligible to become inactive in sweep batches.
- [x] Mark user inactive and set `inactive_since`.
- [x] Record inactive DM success/failure metadata.
- [x] Reactivate inactive user with cycle-safe bonus grant transaction.

### Broadcast Helpers
- [x] Add `listBroadcastEligibleUserIds()` (or equivalent active-only helper).
- [x] Exclude inactive users from results.
- [x] Exclude admin/mod users from results.

### Audit Helpers
- [x] Add lifecycle event insert helper for all transitions.
- [x] Ensure event metadata is JSON-safe and bounded.

## 6) Runtime Integration Checklist

### Interaction Hooking
- [x] Wire lifecycle touchpoint into global command interaction path.
- [x] Skip staff/admin users from inactivity lifecycle handling.
- [x] On inactive user command, run reactivation + bonus path before normal command completion.

### Sweep Worker
- [x] Add periodic inactivity sweep scheduler.
- [x] Add env-configurable sweep interval.
- [x] Process in bounded batches to avoid DB spikes.
- [x] Emit sweep summary logs (`scanned`, `newInactive`, `dmSent`, `dmFailed`).

### Welcome-Back UX
- [x] Implement welcome-back embed builder.
- [x] Include bonus amount, trigger command (if known), and timestamp.
- [x] Fail open if DM cannot be delivered.

## 7) Script + Ops Checklist

### Broadcast Script Integration
- [x] Update `scripts/broadcast-job-promo.mjs` (and similar scripts) to use active-only audience helper.
- [ ] Ensure script output reports skipped inactive/staff users.

### Configuration
- [x] Add and document env vars:
  - `INACTIVE_DAYS_THRESHOLD=30`
  - `COMEBACK_BONUS_CHIPS=10000`
  - `INACTIVE_SWEEP_INTERVAL_MS=21600000`
  - `INACTIVE_DM_ENABLED=true`
  - `COMEBACK_BONUS_ENABLED=true`
- [x] Validate env parsing and sane fallbacks.

## 8) Testing Checklist

### Unit Tests
- [x] Marks inactive only after threshold.
- [x] Does not mark inactive before threshold.
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

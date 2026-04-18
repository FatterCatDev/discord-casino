# Inactive User Cleanup and Comeback Bonus — Design Doc

## Purpose
Design a lifecycle system that identifies players inactive for 30+ days, sends a comeback DM offer, excludes inactive users from announcement DM broadcasts, and automatically reactivates/grants a bonus when they return.

## Goals
- Mark users as inactive when they have not interacted with the bot for more than 30 days.
- Send inactive users a DM explaining a 10,000 chip comeback bonus.
- Remove inactive users from bulk DM audience selection used by announcement scripts.
- Reactivate users automatically when they run any command in any server with Semuta Casino bot.
- Grant comeback bonus on reactivation and send a welcome-back embed with awarded amount.
- Keep all state transitions auditable.

## Non-Goals
- No changes to game-specific payout math.
- No retroactive grants for users who returned before this feature ships.
- No major redesign of existing vote/news/update DM pipelines beyond audience filtering.

## Terminology
- Active user: A user with a tracked interaction within the last 30 days.
- Inactive user: A user whose last tracked interaction is older than 30 days.
- Reactivation: First valid command interaction after user is marked inactive.
- Comeback bonus: 10,000 chips granted upon reactivation.

## User Experience
### 1) Inactive DM
When a user crosses 30 days of inactivity, the bot attempts one DM:
- "You have been inactive for over 30 days."
- "Semuta Casino is offering 10,000 chips for returning players."
- "Run any command in any server with Semuta Casino bot to claim (example: /balance)."

### 2) Broadcast exclusion
Inactive users are not included in bulk DM announcement scripts.

### 3) Return flow
When an inactive user runs any command:
- User is marked active again.
- Bonus is granted.
- User receives a welcome-back embed containing:
  - Bonus amount granted
  - Trigger command (if available)
  - Timestamp

## System Design
### A) Data model
Add a lifecycle table.

Suggested table: `user_activity_lifecycle`
- `discord_user_id TEXT PRIMARY KEY`
- `last_interaction_at TIMESTAMPTZ NOT NULL`
- `is_inactive BOOLEAN NOT NULL DEFAULT FALSE`
- `inactive_since TIMESTAMPTZ NULL`
- `inactive_dm_sent_at TIMESTAMPTZ NULL`
- `inactive_dm_fail_count INTEGER NOT NULL DEFAULT 0`
- `reactivated_at TIMESTAMPTZ NULL`
- `comeback_bonus_granted_at TIMESTAMPTZ NULL`
- `comeback_bonus_amount BIGINT NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Optional audit table: `user_activity_lifecycle_events`
- `id BIGSERIAL PRIMARY KEY`
- `discord_user_id TEXT NOT NULL`
- `event_type TEXT NOT NULL` (`MARK_INACTIVE`, `INACTIVE_DM_SENT`, `INACTIVE_DM_FAIL`, `REACTIVATED`, `COMEBACK_BONUS_GRANTED`)
- `metadata_json TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Indexes:
- `idx_user_activity_last_interaction` on `last_interaction_at`
- `idx_user_activity_inactive` on `is_inactive`

### B) Interaction tracking
At command dispatch entrypoint:
- Upsert lifecycle row for user.
- Update `last_interaction_at = NOW()`.
- If currently inactive, run reactivation path.

Candidate integration point:
- `src/index.mjs` interaction handling before command-specific execution.

### C) Inactivity sweep
Run periodic job (default every 6 hours):
- Select users where:
  - `is_inactive = FALSE`
  - `NOW() - last_interaction_at > INTERVAL '30 days'`
- Mark them inactive and set `inactive_since`.
- Attempt DM if not yet sent.
- Record DM success/failure counters.

### D) Broadcast audience filtering
Bulk DM scripts should fetch only active users.

Current script likely impacted:
- `scripts/broadcast-job-promo.mjs` currently calls `listAllUserIds()`.

Planned change:
- Add DB helper `listActiveUserIds()` (or `listBroadcastEligibleUserIds()`).
- Replace bulk broadcast audience source to exclude inactive users.
- Exclude staff/admin accounts from broadcast lifecycle audiences entirely.

### E) Reactivation and bonus grant
On any command by an inactive user:
1. Start transaction.
2. Flip `is_inactive` to false.
3. Set `reactivated_at = NOW()`.
4. If no prior bonus grant (or policy allows one-time-per-cycle), grant 10,000 chips.
5. Set `comeback_bonus_granted_at` and `comeback_bonus_amount`.
6. Commit.
7. Send welcome-back embed.

Final policy:
- Comeback bonus is granted once per inactivity cycle.
- A new inactivity cycle begins only after a user is marked inactive again by the sweep.

## Messaging Content
### Inactive DM template
"You have not played Semuta Casino in over 30 days.\n\nWe are offering **10,000 chips** for returning players.\nRun any command in any server with Semuta Casino bot to claim your bonus (example: `/balance`)."

### Welcome-back embed
- Title: `Welcome Back to Semuta Casino`
- Description: `Your inactivity status has been cleared and your comeback bonus is ready.`
- Fields:
  - `Bonus Granted`: `10,000 chips`
  - `Triggered By`: command name if known (example: `/balance`)
  - `Time`: timestamp

## Configuration
Add env-based controls:
- `INACTIVE_DAYS_THRESHOLD=30`
- `COMEBACK_BONUS_CHIPS=10000`
- `INACTIVE_SWEEP_INTERVAL_MS=21600000` (6h)
- `INACTIVE_DM_ENABLED=true`
- `COMEBACK_BONUS_ENABLED=true`

## Failure Handling
- DM failure should not block inactivity marking.
- Reactivation bonus grant should be transactional and idempotent.
- If DM send fails on reactivation (including blocked DMs), ignore and continue command flow.

## Security and Abuse Controls
- Require real command interaction to trigger reactivation (not passive webhook hits).
- Enforce idempotent bonus grant check in DB transaction.
- Record grant in transactions table with reason `comeback bonus`.
- Exclude staff/admin accounts from inactivity marking and comeback bonus lifecycle.

## Migration Plan
1. Add new table(s) and indexes.
2. Add DB helpers:
   - upsert/update interaction timestamp
   - mark inactive batch
   - list active user IDs for broadcasts
   - reactivate and grant bonus transaction
3. Add periodic sweep runner in bot runtime.
4. Wire reactivation check into global interaction path.
5. Update broadcast script audience query.
6. Add tests.

## Testing Plan
### Unit tests
- Marks inactive after threshold.
- Does not mark inactive before threshold.
- Reactivation flips status and grants bonus exactly once.
- Broadcast user query excludes inactive users.

### Integration tests
- End-to-end path:
  - User becomes inactive
  - Inactive DM attempted
  - User command reactivates and grants bonus
  - Welcome-back embed payload generated

### Regression tests
- Existing announcement flows continue for active users.
- No duplicate bonus grants across repeated commands.

## Observability
Log counters per sweep:
- users scanned
- users newly inactive
- inactive DMs sent/failed
- reactivations
- bonuses granted

## Rollout Strategy
1. Deploy schema and helpers first.
2. Enable tracking and sweep with DM off for dry run (`INACTIVE_DM_ENABLED=false`).
3. Verify inactive counts and audience filtering.
4. Enable DMs and bonus grants.
5. Monitor logs and transaction volumes for one week.

## Open Questions
No open policy questions remain for MVP.

## Finalized Decisions
- Comeback bonus is once per inactivity cycle.
- Blocked/failed DMs are ignored and do not block lifecycle transitions.
- Staff/admin accounts are excluded from inactivity and broadcast lifecycle.

## Acceptance Criteria
- Users inactive >30 days are marked inactive.
- Inactive users receive one comeback DM attempt.
- Inactive users are excluded from broadcast DM scripts.
- Staff/admin accounts are never marked inactive and are excluded from broadcast lifecycle filtering.
- Returning inactive users get reactivated and receive 10,000 chips.
- Returning inactive users can receive comeback bonus again only after entering a new inactive cycle.
- Welcome-back embed is sent with bonus detail.
- Lifecycle and bonus events are auditable.

# Comprehensive Job System Implementation Plan

## 1. Finalize Design Specs
- Document the three launch roles (Bartender, Card Dealer, Bouncer) with lore blurbs, kitten-mode variants, and descriptions of player fantasy.
- Confirm shift pacing: players can chain up to five shifts back-to-back with no downtime, then enter a 6-hour cooldown before the next burst; target session length remains 45-60 seconds built around a single interactive scenario.
- Lock the 10-rank ladder (Novice, Trainee, Apprentice, Junior Specialist, Specialist, Senior Specialist, Expert, Veteran, Elite, Master).
- Publish the XP curve with exponential rank-up thresholds: `xp_to_next(rank) = round(100 * r^(rank-1))` where `r ~ 2.18048`, yielding the sequence `[100, 218, 475, 1,037, 2,261, 4,929, 10,748, 23,435, 51,100]` (total 94,303 XP) and confirm the Rank 10 max pay cap of <:chips:1427947979758637096>100,000 chips.
- Define the performance grade scale (e.g., Poor <50, Good >=70, Flawless >=95) and its messaging in both personas.

## 2. Specify Game Mechanics Per Job
- Draft full script flow for Bartender: ingredient matching rounds, rush hour prompts, timer windows, pass/fail scoring, streak bonuses.
- Draft Card Dealer flow: card reveal cadence, evaluating winning hands, VIP rounds with optional bonus prompts, penalty cases.
- Draft Bouncer flow: queue generation rules, ID attributes, random fake ID detection cues, user decision impact.
- Set interaction types for each step (buttons vs. select menus), maximum response time before auto-fail, and abort behavior.

## 3. Economy & Reward Rules
- Translate performance score to base pay: `base = floor(maxPay(rank) x performance / 100)` with max pay tied to next-rank XP (except Rank 10 = 100,000).
- Define rounding rules (always floor to whole chips) and clamp performance to 0-100 before payout.
- Design tip mechanic: weighted random selection where 0-15% has 2x probability of 16-20%; represent weights as a table `{ percent: weight }` (e.g., `{0:2, 1:2, ..., 15:2, 16:1, ..., 20:1}`) and document the RNG + seeding strategy.
- Plan fallback when house balance is insufficient: determine whether to fail the shift gracefully or award partial pay and log deficit attempts.
- Create transaction reason codes (e.g., `JOB_SHIFT_PAY`, `JOB_SHIFT_TIP`) for ledger auditing.

## 4. Data Model & Persistence
- Draft SQL for new tables:
  - `job_profiles` (guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at).
- `job_status` (guild_id, user_id, active_job, job_switch_available_at, cooldown_reason, daily_earning_cap, earned_today, cap_reset_at, shift_streak_count, shift_cooldown_expires_at, updated_at) or extend existing user metadata.
  - `job_shifts` (id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata JSON).
- Clarify that `xp_to_next` stores the remaining XP required to reach the next rank; helpers should recompute it after each shift.
- Set sensible defaults:
  - `job_profiles`: `rank` default 1, `total_xp` default 0, `xp_to_next` default 100 (Rank 1 -> 2 threshold), `last_shift_at` nullable (NULL indicates no history), timestamps default to current epoch.
  - `job_status`: `active_job` default 'none' (kept for future specialization states), `job_switch_available_at` default 0, `cooldown_reason` default NULL, `daily_earning_cap` NULL unless configured, `earned_today` default 0, `cap_reset_at` default NULL, `shift_streak_count` default 0, `shift_cooldown_expires_at` default 0, `updated_at` auto timestamp.
  - `job_shifts`: `completed_at` NULL until the run ends, `performance_score` default 0, `base_pay` default 0, `tip_percent` default 0, `tip_amount` default 0, `total_payout` default 0, `result_state` default 'PENDING', `metadata_json` default '{}' (JSON object).
- Capture the defaults in migrations. Example Postgres snippet:
  ```sql
  CREATE TABLE job_profiles (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1,
    total_xp INTEGER NOT NULL DEFAULT 0,
    xp_to_next INTEGER NOT NULL DEFAULT 100,
    last_shift_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id, job_id)
  );

  CREATE TABLE job_status (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    active_job TEXT NOT NULL DEFAULT 'none',
    job_switch_available_at BIGINT NOT NULL DEFAULT 0,
    cooldown_reason TEXT,
    daily_earning_cap INTEGER,
    earned_today INTEGER NOT NULL DEFAULT 0,
    cap_reset_at BIGINT,
    shift_streak_count INTEGER NOT NULL DEFAULT 0,
    shift_cooldown_expires_at BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE job_shifts (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    performance_score INTEGER NOT NULL DEFAULT 0,
    base_pay INTEGER NOT NULL DEFAULT 0,
    tip_percent INTEGER NOT NULL DEFAULT 0,
    tip_amount INTEGER NOT NULL DEFAULT 0,
    total_payout INTEGER NOT NULL DEFAULT 0,
    result_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (result_state IN ('PENDING','SUCCESS','PARTIAL_PAY','HOUSE_INSUFFICIENT','TIMEOUT','ABORTED','ERROR')),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  ```
- Plan indexes on guild/user columns for fast lookups and reporting:
  - `CREATE INDEX job_profiles_guild_user_idx ON job_profiles (guild_id, user_id);`
  - `CREATE INDEX job_profiles_job_idx ON job_profiles (job_id, guild_id);`
  - `CREATE INDEX job_status_guild_user_idx ON job_status (guild_id, user_id);`
  - `CREATE INDEX job_shifts_lookup_idx ON job_shifts (guild_id, user_id, started_at DESC);`
  - `CREATE INDEX job_shifts_job_idx ON job_shifts (job_id, started_at DESC);`
- Seed defaults in migrations:
  - Insert one `job_profiles` row per guild/user/job when a player first picks a job; avoid eager seeding for all combinations.
  - Provide a migration helper that, for existing users, inserts a `job_status` row with `active_job = 'none'`, `job_switch_available_at = 0`, `earned_today = 0`, `shift_streak_count = 0`, and `shift_cooldown_expires_at = 0`.
- Populate QA fixtures via runtime registries rather than static seed data: `src/jobs/registry.mjs` should register canonical bartender recipes, dealer boards, and bouncer scenarios. Add CLI tooling to load sample scenarios for test environments when needed.
- Define retention: keep `job_shifts` forever by default; add a global scheduled task that purges rows older than 180 days if storage pressure arises (no per-guild override needed at launch).
- Write migration scripts for Postgres (`db.pg.mjs`), including forward/backward compatibility guards and default values.

## 5. Command Surface & UX
- Detail `/jobs` response layout: surface shift streak status (shifts remaining before rest, cooldown timer), ranks per job, and flavor text per role.
- Define `/job start` parameters, validation (job choice, streak limit/cooldown checks, house balance), and ephemeral vs. public responses.
- Document `/job stats` output (lifetime shifts, total earnings, top performance, recent tips) and developer-mode diagnostics.
- List updates required for `/help` (new Job section, explain five-shift burst rule and 6h rest timer) plus kitten-mode narrative adjustments.

## 6. Interaction Architecture
- Extend (or introduce) a `buildCommandContext` helper with job utilities: `loadJobProfile`, `saveJobProfile`, `grantJobPayout`, `recordJobShift`, `canStartShift`, `shiftsRemaining`, `timeUntilNextShift`.
- Introduce a central jobs registry (`src/jobs/registry.mjs`) describing each role's minigame steps, prompts, scoring weights, default cooldowns, and copy.
- Create `src/interactions/jobs/` namespace housing per-job button/select handlers and shared utilities (state machine, timers, random event engine, localization, kitten-mode transformation).
- Ensure compatibility with existing session tracking: define a new in-memory map keyed by guild/user storing current shift state, with expiration fallback.

## 7. Enforce Shift Streak Limits & Cooldowns
- Track per-user streaks across all jobs: increment on each completed shift, cap at five, and start a 6-hour cooldown when the limit is reached.
- On `/job start`, block if `shift_cooldown_expires_at` is in the future and surface remaining cooldown time; otherwise, allow any job selection and surface remaining shifts in the burst.
- Reset streak counters and cooldown reason when the timer expires or an admin runs the reset command.
- Add optional daily earning cap per user (configurable) and integrate into `canStartShift`.

## 8. Anti-Abuse & Resilience
- Define penalties for repeated failures or manual aborts in quick succession (e.g., temporary lockouts, reduced XP).
- Decide how to score timeouts: treat as failure with minimal XP, still consume shift cooldown, and log for analytics.
- Implement restart safety: on bot crash or restart, detect orphaned shift session entries and mark them failed; optionally grant partial pay or nothing but ensure state clears cleanly.
- Add audit logging for streak resets (when cooldown triggers), payouts, and abnormal terminations.

## 9. Housekeeping & Documentation
- Update `commands.json` and `deploy-commands.mjs` with new job commands and descriptions.
- Draft release notes, README snippets, and moderator docs explaining setup, economy impact, and troubleshooting.
- Prepare kitten-mode copy variants for prompts, descriptions, and error messages to keep persona consistent.

## 10. Testing Strategy
- Unit tests:
  - XP progression math under repeated shifts.
  - Payout calculation and tip weighting distribution (statistical sanity check).
  - Streak counting and cooldown enforcement after the fifth shift.
  - Handling when house funds are insufficient.
- Integration tests:
  - DB migrations up/down on Postgres.
  - End-to-end shift flow per job (success, fail, timeout) verifying state persistence and ledger entries.
  - Session recovery after restart (simulate mid-shift reboot).
- Manual QA checklist:
  - Run each job's minigame in both personas.
  - Validate `/jobs`, `/job start`, `/job stats` outputs, streak remaining messaging, and security restrictions.
  - Confirm house balance deductions, transaction logs, and tip percentages in `/job stats`.

## 11. Deployment & Rollout
- Stage the feature in a test guild; register commands, seed sample data, and rehearse shift flows.
- Monitor house balance impact and adjust pay tables if needed before production release.
- Once stable, deploy migrations, redeploy commands, and push release notes highlighting the new system.
- After launch, gather telemetry (shift counts, payout distributions) to tune difficulty, tips, and anti-abuse thresholds.

## Dealer Shift: Single-Stage "Best Hand Call"

### Structure
- Each shift presents one fully revealed community board with three competing seats.
- Players identify the winning seat (A/B/C) or the valid split (A+B, A+C, B+C, or all three if necessary) using select buttons.

### Scoring
- Base score mirrors the classic flow: first-attempt correct answers earn 18 base points, a second attempt drops to 9, and a third misses out completely.
- A speed bonus of up to +2 applies: respond in under 6 seconds for +2, under 10 seconds for +1, otherwise +0.
- The stage total (0–20) is scaled to the 0–100 performance range; a flawless, fast answer yields the full 100.

### Timing & Flow
- Reveal the board for 4–5 seconds before controls unlock.
- Decision window: 18 seconds with a visible timer bar.
- Immediate post-shift recap lists hand strengths, the correct outcome, and the performance score.

### Edge Handling
- Timeouts count as incorrect (0 base, no bonus).
- All answer attempts and timings are logged so `/job stats` can surface toughest boards and average reaction speeds.

## Bartender Shift: Single-Stage "Rush Service"

### Concept
- You are behind the bar during a busy night. Each shift drops one cocktail ticket that must be built in the correct sequence before the patron loses patience.

### Structure
- One order per shift, pulled from a recipe registry with difficulty tags and kitten-mode copy.
- Ingredients, techniques, and garnish actions appear as buttons/select options. Some recipes inject twists (substitutions, double shakes, garnish swaps).

### Scoring
- Base points: 18 for a flawless build on the first try, 9 after a corrected mistake, 0 if the drink falls apart.
- Speed bonus: finish within 6 seconds for +2, within 10 seconds for +1, otherwise +0.
- The combined total scales to the 0–100 performance range; perfect execution hits 100.

### Flow
- Order Reveal (3–4 seconds): show drink name, notes, and kitten-mode flavor.
- Build Phase (up to 18 seconds): player selects steps in order; incorrect picks flash and consume the flawless streak.
- Result Reveal: showcase success/failure commentary, time taken, and the performance score.

### Variation & Safeguards
- Recipes rotate between simple classics, technique-heavy signatures, and VIP curveballs.
- Optional "recipe card" hint halves the achievable base score.
- Timeouts zero the shift; analytics log mistake types for balancing.

### Summary
- This quick-fire build captures the original rush energy while fitting the single-stage format, rewarding sharp memory and decisive execution.

## Bouncer Shift: Single-Stage "Queue Control"

### Premise
- You are working the velvet rope on a busy night. One lineup of guests approaches with mixed credentials—decide who gets in without letting the queue explode.

### Structure
- One scenario per shift featuring 2–5 guests and a rules briefing (age limit, dress code, VIP wristbands, bans).
- Guests disclose name, age, attire, wristband color, and guest-list status; some scenarios inject fake IDs, VIP overrides, or crowd caps.

### Scoring
- Base score (18) is divided among each guest’s decision. Correct admit/deny keeps that slice; mistakes zero it.
- Using an escalation/secondary check halves the slice but can save points.
- Speed bonus: clear the entire queue within 20 seconds for +2, within 30 seconds for +1, otherwise +0. Total scales to 0–100.

### Flow
- Briefing (3–4 seconds) sets nightly rules.
- Decision Phase (up to 30 seconds): select which guests to admit via multi-select. Confirm with **Continue**.
- Result Summary: recap every guest, highlight misses, and explain the final score.

### Safeguards & Analytics
- Timeouts treat the queue as collapsed (0 base, no bonus).
- Logs capture decision accuracy, escalations, and timing to tune difficulty and detect abuse.

### Summary
- The single-stage lineup keeps the observation puzzle intact while matching the new pacing—quick reads, sharp rule recall, and decisive calls earn perfect marks.

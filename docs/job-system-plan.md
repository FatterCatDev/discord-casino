# Comprehensive Job System Implementation Plan

## 1. Finalize Design Specs
- Document the three launch roles (Bartender, Card Dealer, Bouncer) with lore blurbs, kitten-mode variants, and descriptions of player fantasy.
- Confirm shift pacing: players can chain up to five shifts back-to-back with no downtime, then enter a 6-hour cooldown before the next burst; target session length remains 60-120 seconds built from five interactive stages.
- Lock the 10-rank ladder (Novice, Trainee, Apprentice, Junior Specialist, Specialist, Senior Specialist, Expert, Veteran, Elite, Master).
- Publish the XP curve with exponential rank-up thresholds: `xp_to_next(rank) = round(100 * r^(rank-1))` where `r ~ 2.18048`, yielding the sequence `[100, 218, 475, 1,037, 2,261, 4,929, 10,748, 23,435, 51,100]` (total 94,303 XP) and confirm the Rank 10 max pay cap of 100,000 chips.
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
- Capture the defaults in migrations. Example SQLite snippet (Postgres mirrors types and uses `NOW()` / `CURRENT_TIMESTAMP`, `JSONB`, and check constraints):
  ```sql
  CREATE TABLE job_profiles (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1,
    total_xp INTEGER NOT NULL DEFAULT 0,
    xp_to_next INTEGER NOT NULL DEFAULT 100,
    last_shift_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id, job_id)
  );

  CREATE TABLE job_status (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    active_job TEXT NOT NULL DEFAULT 'none',
    job_switch_available_at INTEGER NOT NULL DEFAULT 0,
    cooldown_reason TEXT,
    daily_earning_cap INTEGER,
    earned_today INTEGER NOT NULL DEFAULT 0,
    cap_reset_at INTEGER,
    shift_streak_count INTEGER NOT NULL DEFAULT 0,
    shift_cooldown_expires_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE job_shifts (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    performance_score INTEGER NOT NULL DEFAULT 0,
    base_pay INTEGER NOT NULL DEFAULT 0,
    tip_percent INTEGER NOT NULL DEFAULT 0,
    tip_amount INTEGER NOT NULL DEFAULT 0,
    total_payout INTEGER NOT NULL DEFAULT 0,
    result_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (result_state IN ('PENDING','SUCCESS','PARTIAL_PAY','HOUSE_INSUFFICIENT','TIMEOUT','ABORTED','ERROR')),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
  );
  ```
- For Postgres, mirror the schema but use `TIMESTAMPTZ DEFAULT NOW()`, `metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb`, and a `CHECK (result_state = ANY('{PENDING,SUCCESS,PARTIAL_PAY,HOUSE_INSUFFICIENT,TIMEOUT,ABORTED,ERROR}'))`.
- Plan indexes on guild/user columns for fast lookups and reporting:
  - `CREATE INDEX job_profiles_guild_user_idx ON job_profiles (guild_id, user_id);`
  - `CREATE INDEX job_profiles_job_idx ON job_profiles (job_id, guild_id);`
  - `CREATE INDEX job_status_guild_user_idx ON job_status (guild_id, user_id);`
  - `CREATE INDEX job_shifts_lookup_idx ON job_shifts (guild_id, user_id, started_at DESC);`
  - `CREATE INDEX job_shifts_job_idx ON job_shifts (job_id, started_at DESC);`
- Seed defaults in migrations:
  - Insert one `job_profiles` row per guild/user/job when a player first picks a job; avoid eager seeding for all combinations.
  - Provide a migration helper that, for existing users, inserts a `job_status` row with `active_job = 'none'`, `job_switch_available_at = 0`, and `earn_today = 0`.
- Populate QA fixtures via runtime registries rather than static seed data: `src/jobs/registry.mjs` should register canonical bartender recipes, dealer boards, and bouncer scenarios. Add CLI tooling to load sample scenarios for test environments when needed.
- Define retention: keep `job_shifts` forever by default; add a global scheduled task that purges rows older than 180 days if storage pressure arises (no per-guild override needed at launch).
- Write migration scripts for both SQLite (`db.mjs`) and Postgres (`db.pg.mjs`), including forward/backward compatibility guards and default values.

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

## 7. Enforce Single-Job Rules & Cooldowns
- Implement job switching logic:
  - On `/job transfer`, check `job_switch_available_at`; if time remaining, return denial with countdown.
  - On successful switch, set `active_job`, set `job_switch_available_at = now + 24h`, and reset `xp_to_next` for the selected job to the full requirement for the current rank while leaving rank untouched.
- Update help text and confirmation prompts to stress the XP reset and cooldown.
- For `/job start`, ensure only the active job can launch shifts; if the player attempts another role, respond with instructions to transfer and wait out cooldown.
- Add optional daily earning cap per user (configurable) and integrate into `canStartShift`.

## 8. Anti-Abuse & Resilience
- Define penalties for repeated failures or manual aborts in quick succession (e.g., temporary lockouts, reduced XP).
- Decide how to score timeouts: treat as failure with minimal XP, still consume shift cooldown, and log for analytics.
- Implement restart safety: on bot crash or restart, detect orphaned shift session entries and mark them failed; optionally grant partial pay or nothing but ensure state clears cleanly.
- Add audit logging for every job switch (old job, new job, timestamp, cooldown ends), payout, and abnormal termination.

## 9. Housekeeping & Documentation
- Update `commands.json` and `deploy-commands.mjs` with new job commands and descriptions.
- Draft release notes, README snippets, and moderator docs explaining setup, economy impact, and troubleshooting.
- Prepare kitten-mode copy variants for prompts, descriptions, and error messages to keep persona consistent.

## 10. Testing Strategy
- Unit tests:
  - XP progression math (including XP reset on transfer).
  - Payout calculation and tip weighting distribution (statistical sanity check).
  - Cooldown enforcement for shifts and transfers.
  - Handling when house funds are insufficient.
- Integration tests:
  - DB migrations up/down on SQLite and Postgres.
  - End-to-end shift flow per job (success, fail, timeout) verifying state persistence and ledger entries.
  - Session recovery after restart (simulate mid-shift reboot).
- Manual QA checklist:
  - Run each job's minigame in both personas.
  - Validate `/jobs`, `/job start`, `/job transfer`, `/job stats` outputs and security restrictions.
  - Confirm house balance deductions, transaction logs, and tip percentages in `/job stats`.

## 11. Deployment & Rollout
- Stage the feature in a test guild; register commands, seed sample data, and rehearse shift flows.
- Monitor house balance impact and adjust pay tables if needed before production release.
- Once stable, deploy migrations, redeploy commands, and push release notes highlighting the new system.
- After launch, gather telemetry (shift counts, payout distributions) to tune difficulty, tips, and anti-abuse thresholds.

## Dealer Shift: Five-Stage "Best Hand Call"

### Structure
- Each shift runs across five rounds (stages). Every stage shows the five-card board plus three two-card hands.
- Players must identify the winner (A/B/C) or the correct split (A+B, A+C, B+C, or all three if forced).

### Scoring Per Stage
- Base points: 0-18 depending on output.
- Correct answer on first tap earns the full 18.
- A second attempt (if allowed) drops to 9; third attempt yields 0 and ends the stage.
- Speed bonus: up to +2.
  - Respond within the first 6 seconds -> +2.
  - Respond within 6-10 seconds -> +1.
  - After 10 seconds -> +0 (still eligible for the 18 base if correct).
- Maximum per stage: 20 points.

### Shift Totals
- Five stages x 20 max = 100-point ceiling.
- Perfect performance (all five correct on first try with the speed bonus) grants 100 performance points and 100 XP.
- Partial credit (e.g., one slow answer) scales XP linearly: `xp = performanceScore`.

### Difficulty Mix
- Stage 1: obvious winner (e.g., straight vs. pair) to ease players in.
- Stage 2: medium difficulty (two big hands, kicker decides).
- Stage 3: potential split (identical full houses or straight on board); ensures split buttons see use.
- Stage 4: advanced read (flush vs. flush, kicker matters; or a sneaky straight from wheel cards).
- Stage 5: high-stakes finale-could be a rare triple split or a strong hand requiring kicker awareness.

### Timing & Flow
- Prompt phase: 4-5 seconds reveal before inputs unlock.
- Decision window: 18 seconds overall. Timer bar or countdown in embed helps.
- Immediate feedback after each stage: show all hand ranks and the correct outcome, plus total points so far.

### Edge Handling
- Timeout counts as incorrect: 0 base, no speed bonus.
- Optional second-chance mode only if you want to give recovering players a shot: lock to one retry per stage with half credit.
- Record stage-level stats so `/job stats` can highlight toughest scenarios and average reaction time.

### Summary
- This revised pacing keeps the shift within ~90 seconds, rewards accuracy and quick thinking equally, and makes the 100 XP payout feel earned without being punishing.

## Bartender Shift: Five-Stage "Rush Service"

### Concept
- You are behind the bar during a busy night. Every stage presents a cocktail order you must build in the right sequence. Each recipe lists 3-5 steps (ingredients, shake/stir, garnish). You follow prompts using buttons/selects, racing a timer.

### Shift Structure
- Five sequential stages per shift, escalating in complexity.
- Player sees the order ticket after a brief "order up" reveal. Ingredients appear either as text lists or icon cards.
- Player must place components in correct order; some stages include mini-events (double orders, rush modifiers, picky VIP).

### Stage Scoring
- Base points: 0-18 per stage.
- Perfect sequence on first try (no mistakes) yields 18.
- One misstep but corrected before finishing reduces base to 9.
- Two or more mistakes zero the stage and you move on after a short penalty.
- Speed bonus: up to +2 based on completion time from when inputs unlock.
  - Finish within 6 seconds -> +2.
  - Finish within 6-10 seconds -> +1.
  - Beyond 10 seconds -> +0.
- Maximum per stage: 20, so five perfect stages = 100 points.

### Stage Flow
- Order Reveal (3-4 seconds): show drink name, flavor notes, and a quick kitten-mode quip.
- Input Phase (15-18 seconds): ingredients appear on buttons/select options. Player taps/fills them one by one in order; UI confirms placements or flashes if incorrect.
- Result Reveal: display whether the drink was perfect, acceptable, or botched, plus flavor commentary and the stage score.

### Stage Difficulty Curve
- Stage 1: straightforward classic (e.g., "Old Fashioned": sugar -> bitters -> whiskey -> stir -> orange twist).
- Stage 2: introduce a technique (shake vs. stir) and a garnish to test attention.
- Stage 3: VIP request - two drinks in parallel. Player alternates steps (system prompts which drink needs the next ingredient).
- Stage 4: Rush hour - the bar queue introduces a "substitution" event (e.g., menu change mid-build). Player must slot the replacement ingredient without restarting.
- Stage 5: Signature cocktail with 5+ steps and a temperature cue (e.g., "dry shake, add ice, shake again, double strain, garnish"), testing order memory.

### Interaction Mechanics
- Buttons represent available actions; once chosen, the option greys out. Wrong choice triggers a quick vibration effect and either deducts points asynchronously or consumes the first-chance perfect streak.
- Some steps (e.g., "shake for 10 seconds") might require a timed hold or confirmation; incorporate a mini progress bar for flair.
- Provide a "recipe card" hint by spending a small future penalty (optional toggle). Using the hint locks base score to 9 max.

### Anti-Abuse & Error Handling
- Timeouts treat the drink as botched (0 base, no speed bonus); shift continues to next stage.
- Log every mistake type for analytics (misordered ingredient, missed technique, timeout) so balancing adjustments are data-driven.
- Detect repeated instant-fail patterns and surface an in-game warning or temporary slowdown to deter macro abuse.

### Feedback & Flavor
- After each stage, embed shows:
  - Drink image/emojis.
  - Steps completed, highlight missteps, time taken, and stage score.
  - House reaction: e.g., "Guest tips generously!" or "Patron sends it back...".
- Kitten-mode adds playful banter ("You worked that shaker like a dream, Kitten!").

### Integration Notes
- Maintain a recipe registry with metadata (ingredients, order, difficulty tags, copy text, kitten-mode variations).
- Store stage state in the session so replays/resumes know which step the player is on if interactions hiccup.
- After five stages, compute total score (0-100), convert directly to XP, roll tip bonus, deduct house payout, and log shift summary.

### Summary
- This bartending gauntlet mirrors the dealer minigame's pacing while emphasizing memory plus quick execution, matching the 100-point performance model and keeping shifts lively.

## Bouncer Shift: Five-Stage "Queue Control"

### Premise
- You are working the velvet rope on a busy night. Each stage shows a line of guests with IDs and behavior cues. Decide who gets in - or who must be turned away - while keeping the queue moving.

### Shift Layout
- Five stages per shift, each a mini-scenario with 3-5 queued guests.
- Players review each guest's profile (name, age, attire, membership status, notes) and cross-check against venue rules.
- Mixed in are random events - fake IDs, VIP arrivals, rowdy patrons - that demand different responses.

### Stage Scoring
- Each stage is worth up to 18 base points plus a 2-point speed bonus.
- Base scoring splits across the queue: every correct admit/deny is worth proportional points (e.g., 18 / guest count). Wrong calls zero that slice.
- If the player issues a "secondary check" (see below) and corrects themselves before committing, halve the points for that guest.
- Speed bonus applies if the entire queue is processed quickly:
  - Finish the stage within 20 seconds -> +2.
  - Finish within 30 seconds -> +1.
  - Beyond 30 seconds -> +0.
- Total shift perfect score: 100 (five flawless stages with speed bonus).

### Stage Flow
- Briefing (3-4 seconds): display nightly rules or special alerts (e.g., "Under 21 must be denied", "VIPs have gold wristbands").
- Queue Processing (up to 30 seconds): guests appear one at a time. Player chooses among:
  - Admit
  - Deny
  - Escalate (call manager / request secondary check)
- Result Summary: show correct decision, reasoning, and stage score breakdown.

### Guest Data & Mechanics
- Each guest card includes: age, ID photo vs. live photo (subtle differences), membership indicator, dress code compliance, behavioral tag (calm, aggressive), and extras (e.g., "plus one", "already inside earlier").
- Randomized rule list per shift: combination of age limits, dress code, banned individuals, maximum crowd count, etc.
- Fake ID detection: mismatched details (birth date vs. issue date), suspicious hologram notes, or names on a ban list.
- VIP exceptions: certain guests override standard rules if recognized or accompanied by a host; missing them costs significant points.
- Escalate option: reveals a hint or double-check result after a short delay. If used, any resulting points are halved; denies speed bonus for that stage.

### Special Event Stages
- Stage 1: introductory - simple age/dress decisions.
- Stage 2: introduces fake IDs or mismatched attire to teach spotting.
- Stage 3: crowd limit reached; player must deny even otherwise valid guests once capacity hits max.
- Stage 4: VIP suite night - allow only approved list; others need reservations.
- Stage 5: security alert - watch for a specific banned guest in disguise; includes a multi-step escalation option.

### Interaction Handling
- Buttons for admit/deny/escalate; escalate opens a modal or follow-up with additional info (manager response).
- If player hesitates beyond 10 seconds on a guest, flash a warning ("Queue growing impatient!") and deduct a small time penalty from base points.
- Allow a "review guest" button to re-read profile, but it consumes precious time (encourages quick decisions).

### Feedback & Copy
- After each stage, show:
  - Who was rightly/wrongly admitted or denied, with rationale.
  - Patron reactions (grateful VIP, angry denied guest) for flavor and kitten-mode quips.
  - Stage score, speed bonus, and cumulative total.
- Kitten-mode versions add playful tone ("You sniffed out that fake like a pro, Kitten!").

### Safeguards & Analytics
- Track misclassification counts, timeouts, and overuse of escalations to tune difficulty.
- Prevent farming by enforcing the 8-hour shift cooldown and logging patterns of repeated instant decisions.
- If the player times out on the entire stage, assign 0 base/bonus and move on; log as "queue collapse" for stats.

### Post-Shift Wrap-up
- Sum all stage points to performance score (0-100), award equal XP, then roll tip bonus and payout from house.
- Store each guest decision (timestamp, choice, correctness, escalation use) in the shift log for auditing and balancing.

### Summary
- This bouncer/security design emphasizes observation, rule adherence, and quick judgement, complements the dealer and bartender challenges, and slots neatly into the existing 5-stage/100-point shift framework.

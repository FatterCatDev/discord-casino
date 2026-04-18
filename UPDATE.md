# Pending Update

version: 1.3.3

## Changes

<!-- Add one bullet per noteworthy change below. Example: - Improved chip payout handling -->
- Added inactivity lifecycle DB schema (`user_activity_lifecycle`, `user_activity_lifecycle_events`) with indexes for interaction age and inactive-state scans.
- Added lifecycle DB helpers for touch, inactivity batching, DM attempt tracking, event logging, and transactional reactivation with comeback bonus grant.
- Switched broadcast targeting to active-only eligible users via `listBroadcastEligibleUserIds()` and excluded staff/admin accounts.
- Wired slash-command reactivation flow: inactive users are reactivated on command and can receive cycle-safe comeback bonus grants.
- Added welcome-back DM embed delivery after successful reactivation handling.
- Added inactivity sweep worker (`src/services/inactivity.mjs`) that periodically batch-marks inactive users, sends one-time inactive DMs, and records all DM outcomes and transition events to the lifecycle audit log.
- Hardened inactivity/comeback env parsing with numeric and boolean fallbacks to avoid invalid config values causing runtime drift.
- Documented inactivity lifecycle env controls in `docs/DEVELOPER_GUIDE.md`.

## Short Notes

<!-- Add 2-4 concise bullets for a quick summary. Example: - Faster startup and smoother leaderboard refreshes -->
- Step 1 shipped: lifecycle schema + helper plumbing + broadcast audience filtering.
- Step 2 shipped: command-path reactivation and comeback bonus transaction path.
- Step 3 shipped: inactivity sweep worker wired into bot startup with env-configurable interval, batch size, threshold, and DM enable gate.
- Step 4 shipped: configuration hardening and developer-facing env documentation for inactivity lifecycle controls.
- Full regression suite passes with lifecycle, broadcast, sweep worker, and env-doc coverage checks.

## Bug Fixes

<!-- Add one bullet per bug fix below. Example: - Fixed crash when playing blackjack in DMs -->
- Fixed stale restart behavior by making `npm run restart` restart both bot and API systemd services by default.


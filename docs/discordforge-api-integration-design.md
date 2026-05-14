# DiscordForge API Integration - Design Doc

## Purpose
Define a safe, phased integration for DiscordForge.org API support in Semuta Casino bot. This document is implementation-first guidance and should be approved before runtime changes.

## Context
DiscordForge provides API endpoints for:
- Posting bot stats
- Checking recent vote status for a user
- Receiving vote webhooks for real-time reward handling
- Fetching bot profile data (public)
- Syncing slash commands metadata
- Checking bump cooldown

Primary objective for phase 1 is stats posting parity with existing bot-list integrations.

## Goals
- Add reliable bot stats posting to DiscordForge with rate-limit compliance.
- Reuse existing runtime patterns already used for external stats posting.
- Keep API credentials secret-managed and out of repository files.
- Prefer webhook-driven vote handling for near real-time rewards.
- Keep optional features (vote check, command sync) behind clear phase gates.

## Non-Goals
- No direct reward-economy changes in phase 1.
- No migration of existing vote providers in phase 1.
- No hard dependency that blocks bot startup when DiscordForge config is missing.

## Security Requirements
- Never commit raw DiscordForge API key to tracked files.
- Use environment variable only:
  - `DISCORDFORGE_API_KEY`
- Store webhook secret in environment variable only:
  - `FORGE_WEBHOOK_SECRET`
- Optional endpoint/base URL override for testing:
  - `DISCORDFORGE_API_BASE_URL` (default `https://discordforge.org`)
- Webhook security requirements:
  - Verify `Authorization` header equals `FORGE_WEBHOOK_SECRET` exactly.
  - Reject unauthorized requests with `401`.
  - Return any `2xx` response within 5 seconds.
  - Skip rewards when `isTest=true` in webhook payload.
- Any logs must redact secrets.

## API Endpoints and Planned Usage

### 1) POST /api/bots/stats
Rate limit: 1 request / 5 minutes

Planned payload:
- `server_count`
- `user_count`

Out of scope for phase 1 stats posting:
- `shard_count`
- `voice_connections`

Auth:
- `Authorization: <DISCORDFORGE_API_KEY>`

Behavior:
- Schedule post interval at or above 300 seconds.
- Trigger additional posts on:
  - client ready
  - guild create
  - guild delete
- Deduplicate unchanged payloads where possible to reduce unnecessary calls.

### 2) GET /api/bots/:id/votes/check
Rate limit: 60 requests / min

Status:
- Phase 2 (optional)
- Use for user vote-check enhancements only after explicit reward-policy decision.

Query:
- `userId=<DISCORD_ID>`

`:id` resolution:
- Use the Discord bot client ID for all `:id` endpoint calls.

Auth:
- `Authorization: <DISCORDFORGE_API_KEY>`

### 3) GET /api/bots/:id
Public endpoint

Status:
- Optional diagnostic/read-only helper.
- No auth required.

### 4) POST /api/external/bots/commands
Up to 200 commands

Status:
- Phase 3
- Sync slash command metadata after command deployment pipeline runs.

Auth:
- Prefer `x-api-key: <DISCORDFORGE_API_KEY>`
- `Authorization` also accepted by provider.

Filtering:
- Sync player-facing commands only.
- Exclude all admin and mod commands (e.g. `/addadmin`, `/removeadmin`, `/addmod`, `/removemod`, `/mintchip`, `/resetallbalance`, `/houseadd`, `/houseremove`, `/setrake`, `/setmaxbet`, `/setcasinocategory`, `/setgamelogchannel`, `/setcashlog`, `/setrequestchannel`, `/setupdatech`, `/givecredits`, `/takecredits`, `/takechips`, `/buyin`, `/cashout`, `/cartelreset`, `/setcartelrate`, `/setcartelshare`, `/setcartelxp`, and all debug commands).
- The sync script must maintain an explicit allowlist or category tag to identify player-facing commands.

### 5) GET /api/external/bump/cooldown
Rate limit: 60 requests / min

Status:
- Deferred (not in MVP)

### 6) Vote Webhooks (dashboard-configured endpoint)
Status:
- Phase 2 preferred path for vote rewards

Delivery contract:
- Request header: `Authorization: <FORGE_WEBHOOK_SECRET>`
- Body includes: `id`, `username`, `weeklyVotes`, `totalVotes`, `isTest`
- Handler must return `2xx` within 5 seconds
- Provider retries failed deliveries up to 3 times with backoff (5s, 30s, 120s)

Behavior:
- Use `id` as authoritative Discord user id.
- Treat `username` as informational only.
- Ignore reward side effects for `isTest=true` payloads.

## Proposed Architecture

### Service Module
Create a dedicated service module:
- `src/services/discordforge.mjs`

Responsibilities:
- Build/validate config from env
- Build stats payload
- Post stats with request timeout, retry/backoff, and jitter
- Expose start/stop/trigger lifecycle similar to existing stats poster services

### Runtime Integration
Wire service in `src/index.mjs` client-ready flow:
- Start poster on ready
- Trigger on guild create/delete
- Fail open (log and continue) when disabled or API errors occur

### Webhook Integration
Add webhook handler in API server:
- File: `src/api/server.mjs`
- Suggested route: `POST /webhooks/forge-vote`

Responsibilities:
- Verify `Authorization` header matches `FORGE_WEBHOOK_SECRET`.
- Parse payload fields (`id`, `isTest`, etc.).
- Acknowledge quickly with `2xx` within 5 seconds.
- Route non-test events into existing vote reward service path.
- Log and track duplicate/replayed deliveries safely.

### Optional Command Sync Integration
Potential helper script:
- `scripts/discordforge-sync-commands.mjs`

Purpose:
- Send slash command metadata to DiscordForge without coupling to main runtime startup.

Execution:
- Run command sync on deploy (after slash command deployment completes).

## Configuration
Required/primary:
- `DISCORDFORGE_API_KEY`

Optional:
- `DISCORDFORGE_API_BASE_URL=https://discordforge.org`
- `DISCORDFORGE_STATS_INTERVAL_SECONDS=300`
- `DISCORDFORGE_REQUEST_TIMEOUT_MS=10000`
- `DISCORDFORGE_RETRY_MAX=2`
- `DISCORDFORGE_ENABLED=true`
- `FORGE_WEBHOOK_SECRET=<secret from dashboard>`
- `FORGE_WEBHOOK_ENABLED=true`
- `FORGE_WEBHOOK_PATH=/webhooks/forge-vote`

Validation rules:
- If key missing and enabled=true: log warning and disable integration.
- Enforce interval lower bound of 300 seconds.

## Rate-Limit and Retry Strategy
- Never schedule under 300 seconds for stats endpoint.
- On 429 or 5xx:
  - Retry with exponential backoff and jitter.
  - Respect `Retry-After` header if provided.
- On 4xx auth errors:
  - Do not hot-loop retries.
  - Log actionable error and pause until next scheduled interval.
- Webhook handlers should return quickly; provider-side retries already handle transient failures.

## Observability
Structured logs for:
- poster start/stop
- post success with payload summary (no secrets)
- post failure class (`auth`, `rate_limit`, `network`, `server`)
- trigger source (`startup`, `interval`, `guild_create`, `guild_delete`)
- webhook accepts/rejects and test-event skips

Optional metrics counters:
- `discordforge_stats_post_success_total`
- `discordforge_stats_post_failure_total`
- `discordforge_stats_post_skipped_total`
- `discordforge_webhook_accept_total`
- `discordforge_webhook_reject_total`
- `discordforge_webhook_test_skip_total`

## Testing Plan

Unit tests:
- Config parsing and enable/disable behavior
- Interval floor enforcement (>= 300 sec)
- Payload generation for sharded and non-sharded clients
- Retry classification logic

Behavior/integration tests:
- Start poster with mocked HTTP client
- Trigger-driven post on guild create/delete events
- Graceful disable when missing key
- Webhook auth validation (`401` on wrong secret)
- Webhook test payload handling (`isTest=true` does not grant rewards)
- Webhook ack timing budget (response path stays fast)

Manual verification:
- Confirm stats appear in DiscordForge dashboard
- Validate no request frequency above endpoint limits

## Rollout Plan
1. Phase 1: Stats poster only
- Add service module and runtime hooks
- Deploy with integration enabled
- Observe for 24-48h

2. Phase 2: Vote webhooks (preferred)
- Add webhook endpoint in API service
- Wire webhook events into vote reward pipeline
- Map webhook vote events 1:1 onto existing vote reward amounts.
- Keep test-event filtering and idempotency checks enabled

3. Phase 2b: Vote-check endpoint (optional fallback/helper)
- Add helper in vote service layer
- Use only where webhook data is unavailable or as diagnostic path

4. Phase 3: Command sync (optional)
- Add script and wire it into deploy flow
- Validate command payload schema compatibility

## Operational Prerequisites
- Add Forge bot to at least one shared server with this bot if platform status visibility is required.
- Ensure bot presence is not set to offline/invisible to avoid false offline state.

## Rollback Plan
- Set `DISCORDFORGE_ENABLED=false` or remove key.
- Keep runtime unaffected; integration should fail open.

## Acceptance Criteria
- Stats posts run at compliant intervals and on trigger events.
- Integration never crashes command handling or bot startup.
- API key is only read from environment variables.
- Webhook secret is only read from environment variables.
- Webhook requests are authenticated and acknowledged within the expected time window.
- Logs are actionable and do not leak secrets.

## Finalized Decisions
- Use Discord bot client ID for DiscordForge `:id` endpoint calls.
- Map DiscordForge webhook vote events 1:1 to existing vote reward amounts.
- Run DiscordForge command sync on deploy.

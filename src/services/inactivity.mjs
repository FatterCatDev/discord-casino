import {
  listUsersToMarkInactive,
  markUsersInactive,
  markUserInactiveDmResult,
  recordUserActivityLifecycleEvent,
} from '../db/db.auto.mjs';

function toMinInt(raw, fallback, min) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function toBool(raw, fallback = true) {
  if (raw == null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

const INACTIVE_DAYS_THRESHOLD = toMinInt(process.env.INACTIVE_DAYS_THRESHOLD, 30, 1);
const INACTIVE_SWEEP_INTERVAL_MS = toMinInt(process.env.INACTIVE_SWEEP_INTERVAL_MS, 6 * 60 * 60 * 1000, 60_000);
const INACTIVE_DM_ENABLED = toBool(process.env.INACTIVE_DM_ENABLED, true);
const INACTIVE_SWEEP_BATCH_SIZE = toMinInt(process.env.INACTIVE_SWEEP_BATCH_SIZE, 100, 1);
const COMEBACK_BONUS_CHIPS = toMinInt(process.env.COMEBACK_BONUS_CHIPS, 10_000, 0);

const INACTIVE_DM_MESSAGE =
  `You have not played Semuta Casino in over ${INACTIVE_DAYS_THRESHOLD} days.\n\n` +
  `We are offering **${COMEBACK_BONUS_CHIPS.toLocaleString()} chips** for returning players.\n` +
  `Run any command in any server with Semuta Casino bot to claim your bonus (example: \`/balance\`).`;

let sweepInFlight = false;
let sweepTimer = null;

async function runInactivitySweepInternal(client, deps, config, nowMs) {
  const counters = { scanned: 0, newInactive: 0, dmSent: 0, dmFailed: 0 };
  const nowSec = Math.floor(nowMs / 1000);
  const dmMessage =
    `You have not played Semuta Casino in over ${config.inactiveDaysThreshold} days.\n\n` +
    `We are offering **${config.comebackBonusChips.toLocaleString()} chips** for returning players.\n` +
    'Run any command in any server with Semuta Casino bot to claim your bonus (example: `/balance`).';

  try {
    const rows = await deps.listUsersToMarkInactive(config.inactiveDaysThreshold, config.batchSize);
    counters.scanned = rows.length;

    if (rows.length === 0) {
      return counters;
    }

    const ids = rows.map(r => String(r.user_id));
    await deps.markUsersInactive(ids, nowSec);
    counters.newInactive = ids.length;

    for (const row of rows) {
      const uid = String(row.user_id);
      await deps.recordUserActivityLifecycleEvent(uid, 'MARK_INACTIVE', {
        threshold_days: config.inactiveDaysThreshold,
        swept_at: nowSec,
      }).catch(() => {});
    }

    if (!config.dmEnabled) return counters;

    for (const row of rows) {
      const uid = String(row.user_id);
      let sent = false;
      try {
        const user = await client.users.fetch(uid);
        await user.send(dmMessage);
        sent = true;
        counters.dmSent++;
      } catch {
        counters.dmFailed++;
      }
      const dmTimestamp = Math.floor(nowMs / 1000);
      await deps.markUserInactiveDmResult(uid, { sent, timestamp: dmTimestamp }).catch(() => {});
      await deps.recordUserActivityLifecycleEvent(uid, sent ? 'INACTIVE_DM_SENT' : 'INACTIVE_DM_FAIL', {
        timestamp: dmTimestamp,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[inactivity-sweep] Sweep failed', err);
  }

  return counters;
}

export async function runInactivitySweepForTest(client, overrides = {}) {
  const deps = {
    listUsersToMarkInactive,
    markUsersInactive,
    markUserInactiveDmResult,
    recordUserActivityLifecycleEvent,
    ...(overrides.deps || {}),
  };
  const config = {
    inactiveDaysThreshold: toMinInt(overrides.inactiveDaysThreshold, INACTIVE_DAYS_THRESHOLD, 1),
    batchSize: toMinInt(overrides.batchSize, INACTIVE_SWEEP_BATCH_SIZE, 1),
    dmEnabled: toBool(overrides.dmEnabled, INACTIVE_DM_ENABLED),
    comebackBonusChips: toMinInt(overrides.comebackBonusChips, COMEBACK_BONUS_CHIPS, 0),
  };
  const nowMs = toMinInt(overrides.nowMs, Date.now(), 0);
  return runInactivitySweepInternal(client, deps, config, nowMs);
}

async function runInactivitySweep(client) {
  if (sweepInFlight) return;
  sweepInFlight = true;

  try {
    const counters = await runInactivitySweepInternal(
      client,
      {
        listUsersToMarkInactive,
        markUsersInactive,
        markUserInactiveDmResult,
        recordUserActivityLifecycleEvent,
      },
      {
        inactiveDaysThreshold: INACTIVE_DAYS_THRESHOLD,
        batchSize: INACTIVE_SWEEP_BATCH_SIZE,
        dmEnabled: INACTIVE_DM_ENABLED,
        comebackBonusChips: COMEBACK_BONUS_CHIPS,
      },
      Date.now()
    );
    console.log(
      `[inactivity-sweep] scanned=${counters.scanned} newInactive=${counters.newInactive}` +
      ` dmSent=${counters.dmSent} dmFailed=${counters.dmFailed}`
    );
  } finally {
    sweepInFlight = false;
  }
}

export function startInactivitySweep(client) {
  if (sweepTimer) return sweepTimer;
  runInactivitySweep(client).catch(() => {});
  sweepTimer = setInterval(() => {
    runInactivitySweep(client).catch(() => {});
  }, INACTIVE_SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
  console.log(`[inactivity-sweep] Started. interval=${INACTIVE_SWEEP_INTERVAL_MS}ms threshold=${INACTIVE_DAYS_THRESHOLD}d dmEnabled=${INACTIVE_DM_ENABLED}`);
  return sweepTimer;
}

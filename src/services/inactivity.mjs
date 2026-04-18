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

async function runInactivitySweep(client) {
  if (sweepInFlight) return;
  sweepInFlight = true;

  const counters = { scanned: 0, newInactive: 0, dmSent: 0, dmFailed: 0 };
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    const rows = await listUsersToMarkInactive(INACTIVE_DAYS_THRESHOLD, INACTIVE_SWEEP_BATCH_SIZE);
    counters.scanned = rows.length;

    if (rows.length === 0) {
      return;
    }

    const ids = rows.map(r => String(r.user_id));
    await markUsersInactive(ids, nowSec);
    counters.newInactive = ids.length;

    for (const row of rows) {
      const uid = String(row.user_id);
      await recordUserActivityLifecycleEvent(uid, 'MARK_INACTIVE', {
        threshold_days: INACTIVE_DAYS_THRESHOLD,
        swept_at: nowSec,
      }).catch(() => {});
    }

    if (!INACTIVE_DM_ENABLED) return;

    for (const row of rows) {
      const uid = String(row.user_id);
      let sent = false;
      try {
        const user = await client.users.fetch(uid);
        await user.send(INACTIVE_DM_MESSAGE);
        sent = true;
        counters.dmSent++;
      } catch {
        counters.dmFailed++;
      }
      const dmTimestamp = Math.floor(Date.now() / 1000);
      await markUserInactiveDmResult(uid, { sent, timestamp: dmTimestamp }).catch(() => {});
      await recordUserActivityLifecycleEvent(uid, sent ? 'INACTIVE_DM_SENT' : 'INACTIVE_DM_FAIL', {
        timestamp: dmTimestamp,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[inactivity-sweep] Sweep failed', err);
  } finally {
    sweepInFlight = false;
    console.log(
      `[inactivity-sweep] scanned=${counters.scanned} newInactive=${counters.newInactive}` +
      ` dmSent=${counters.dmSent} dmFailed=${counters.dmFailed}`
    );
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

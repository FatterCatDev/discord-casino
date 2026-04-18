import {
  listUsersToMarkInactive,
  markUsersInactive,
  markUserInactiveDmResult,
  recordUserActivityLifecycleEvent,
} from '../db/db.auto.mjs';

const INACTIVE_DAYS_THRESHOLD = Math.max(1, Number(process.env.INACTIVE_DAYS_THRESHOLD || 30));
const INACTIVE_SWEEP_INTERVAL_MS = Math.max(60_000, Number(process.env.INACTIVE_SWEEP_INTERVAL_MS || 6 * 60 * 60 * 1000));
const INACTIVE_DM_ENABLED = String(process.env.INACTIVE_DM_ENABLED ?? 'true').toLowerCase() !== 'false';
const INACTIVE_SWEEP_BATCH_SIZE = Math.max(1, Number(process.env.INACTIVE_SWEEP_BATCH_SIZE || 100));
const COMEBACK_BONUS_CHIPS = Math.max(0, Number(process.env.COMEBACK_BONUS_CHIPS || 10_000));

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

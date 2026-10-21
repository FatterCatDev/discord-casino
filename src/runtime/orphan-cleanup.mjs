import { listEscrowForTable, escrowReturn } from '../db/db.auto.mjs';
import { holdemTables } from '../games/holdem.mjs';
import {
  HOLDEM_ORPHAN_SWEEP_START_DELAY_MS,
  HOLDEM_ORPHAN_SWEEP_GUILD_BATCH_SIZE,
  HOLDEM_ORPHAN_SWEEP_BATCH_INTERVAL_MS
} from './config.mjs';
import { getGuildSettingsCached } from './caches.mjs';

export function createOrphanCleanup() {
  let disposed = false;
  let holdemOrphanSweepQueue = [];

  let holdemOrphanSweepTimer = null;

  let holdemOrphanSweepStarted = false;

  function collectActiveHoldemChannelIds() {
    return new Set(Array.from(holdemTables.values()).map(state => state?.channelId).filter(Boolean));
  }

  async function sweepOrphanHoldemChannelsForGuild(client, guildId) {
    try {
      const settings = await getGuildSettingsCached(guildId);
      const catId = settings?.casino_category_id;
      if (!catId) return;
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;
      const channels = await guild.channels.fetch().catch(() => null);
      if (!channels) return;
      const activeIds = collectActiveHoldemChannelIds();
      for (const ch of channels.values()) {
        if (disposed) return;
        if (!ch || !ch.isTextBased?.() || ch.parentId !== catId) continue;
        if (!/^holdem-table-\d+$/.test(ch.name)) continue;
        if (activeIds.has(ch.id)) continue;
        try {
          const escrows = await listEscrowForTable(ch.id) || [];
          for (const row of escrows) {
            try {
              if ((row.balance || 0) > 0) await escrowReturn(ch.id, row.user_id, row.balance || 0);
            } catch {}
          }
        } catch {}
        try {
          if (!disposed && ch.deletable) await ch.delete('Cleanup orphan Hold\'em table');
        } catch {}
      }
    } catch {}
  }

  function processHoldemOrphanSweepBatch(client) {
    if (disposed) return;
    if (disposed || !holdemOrphanSweepQueue.length) {
      if (holdemOrphanSweepTimer) clearTimeout(holdemOrphanSweepTimer);
      holdemOrphanSweepTimer = null;
      return;
    }
    const guildIds = holdemOrphanSweepQueue.splice(0, HOLDEM_ORPHAN_SWEEP_GUILD_BATCH_SIZE);
    Promise.all(guildIds.map(guildId => sweepOrphanHoldemChannelsForGuild(client, guildId)))
      .catch(() => {})
      .finally(() => {
        if (!holdemOrphanSweepQueue.length) {
          if (holdemOrphanSweepTimer) clearTimeout(holdemOrphanSweepTimer);
          holdemOrphanSweepTimer = null;
          return;
        }
        holdemOrphanSweepTimer = setTimeout(() => {
          processHoldemOrphanSweepBatch(client);
        }, HOLDEM_ORPHAN_SWEEP_BATCH_INTERVAL_MS);
        if (typeof holdemOrphanSweepTimer?.unref === 'function') holdemOrphanSweepTimer.unref();
      });
  }

  function scheduleStartupHoldemOrphanSweep(client) {
    if (disposed || holdemOrphanSweepStarted) return;
    holdemOrphanSweepStarted = true;
    holdemOrphanSweepQueue = Array.from(client.guilds.cache.keys());
    holdemOrphanSweepTimer = setTimeout(() => {
      processHoldemOrphanSweepBatch(client);
    }, HOLDEM_ORPHAN_SWEEP_START_DELAY_MS);
    if (typeof holdemOrphanSweepTimer?.unref === 'function') holdemOrphanSweepTimer.unref();
  }
  function dispose() {
    disposed = true;
    clearTimeout(holdemOrphanSweepTimer);
    holdemOrphanSweepTimer = null;
    holdemOrphanSweepQueue = [];
  }
  return { scheduleStartupHoldemOrphanSweep, dispose };
}

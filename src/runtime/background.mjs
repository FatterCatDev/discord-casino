import { pruneUserInteractionEvents, getGlobalPlayerCount, setBotStatusSnapshot } from '../db/db.auto.mjs';
import { autoRedeemPendingVoteRewards } from '../services/votes.mjs';
import { sweepExpiredSessions as sweepExpiredSessionsMod } from '../games/logging.mjs';
import { startLeaderboardChampionWatcher, stopLeaderboardChampionWatcher } from '../services/championRole.mjs';
import { startInactivitySweep, stopInactivitySweep } from '../services/inactivity.mjs';
import { startCartelWorker as startCartelWorkerMod } from '../cartel/service.mjs';
import { startDiscordForgeStatsPoster } from '../services/discordforge.mjs';
import { startTopggStatsPoster } from '../services/topgg.mjs';
import {
  INTERACTION_EVENT_RETENTION_DAYS,
  INTERACTION_EVENT_PRUNE_BATCH_SIZE,
  INTERACTION_EVENT_PRUNE_INTERVAL_MS
} from './config.mjs';
import { deliverVoteRewardDms } from './vote-delivery.mjs';

export function createBackgroundTasks(client, scheduleStartupHoldemOrphanSweep) {
  const timers = new Set();
  let started = false;
  let stopped = false;
  let topggPoster = null;
  let discordForgePoster = null;
  let voteRewardProcessing = false;

  function every(callback, delay) {
    const timer = setInterval(() => { if (!stopped) callback(); }, delay);
    timers.add(timer);
  }

  function triggerTopggStats(reason = 'manual') {
    if (topggPoster?.trigger) {
      topggPoster.trigger(reason).catch(() => {});
    }
  }

  function triggerDiscordForgeStats(reason = 'manual') {
    if (discordForgePoster?.trigger) {
      discordForgePoster.trigger(reason).catch(() => {});
    }
  }

  async function pushBotStatusSnapshot(reason = 'manual') {
    if (!client?.isReady?.()) return;
    try {
      const guildCount = client.guilds.cache.size;
      const playerCount = await getGlobalPlayerCount();
      await setBotStatusSnapshot({ guildCount, playerCount });
    } catch (err) {
      console.error('[metrics] failed to update bot status snapshot', reason, err);
    }
  }

  function startBackgroundTasks(c) {
    if (started || stopped) return;
    started = true;
    console.log(`Ready! Logged in as ${c.user.tag}`);
    pushBotStatusSnapshot('ready').catch(() => {});
    const botStatusIntervalMs = Math.max(30_000, Number(process.env.BOT_STATUS_SNAPSHOT_INTERVAL_MS || 120_000));
    every(() => {
      pushBotStatusSnapshot('interval').catch(() => {});
    }, botStatusIntervalMs);
    every(() => { sweepExpiredSessionsMod(client).catch(() => {}); }, 15 * 1000);
    scheduleStartupHoldemOrphanSweep(client);

    const intervalMs = Math.max(5_000, Number(process.env.VOTE_REWARD_AUTO_INTERVAL_MS || 15_000));
    const sweepVoteRewards = async () => {
      if (voteRewardProcessing) return;
      voteRewardProcessing = true;
      try {
        const results = await autoRedeemPendingVoteRewards();
        const dmEntries = [];
        for (const entry of results) {
          if (!entry || entry.error || !(entry.claimedTotal > 0)) {
            if (entry?.error) {
              console.error('Auto vote reward redeem failed for', entry.userId, entry.error);
            }
            continue;
          }
          dmEntries.push(entry);
        }
        await deliverVoteRewardDms(client, dmEntries);
      } catch (err) {
        console.error('Failed to auto redeem vote rewards', err);
      } finally {
        voteRewardProcessing = false;
      }
    };

    sweepVoteRewards().catch(() => {});
    every(() => { sweepVoteRewards().catch(() => {}); }, intervalMs);

    every(() => {
      pruneUserInteractionEvents(INTERACTION_EVENT_RETENTION_DAYS, INTERACTION_EVENT_PRUNE_BATCH_SIZE)
        .catch(err => {
          console.error('Failed to prune user_interaction_events', err);
        });
    }, INTERACTION_EVENT_PRUNE_INTERVAL_MS);

    startLeaderboardChampionWatcher(client);
    try {
      startInactivitySweep(client);
    } catch (err) {
      console.error('Failed to start inactivity sweep', err);
    }
    try {
      const timer = startCartelWorkerMod();
      timers.add(timer);
      if (typeof timer?.unref === 'function') timer.unref();
    } catch (err) {
      console.error('Failed to start cartel worker', err);
    }
    try {
      topggPoster = startTopggStatsPoster(client);
    } catch (err) {
      console.error('Failed to start top.gg stats poster', err);
    }
    try {
      discordForgePoster = startDiscordForgeStatsPoster(client);
    } catch (err) {
      console.error('Failed to start DiscordForge stats poster', err);
    }
  }

  function dispose() {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) clearInterval(timer);
    timers.clear();
    topggPoster?.stop();
    discordForgePoster?.stop();
    if (started) {
      stopInactivitySweep();
      stopLeaderboardChampionWatcher();
    }
  }
  return { startBackgroundTasks, triggerTopggStats, triggerDiscordForgeStats, pushBotStatusSnapshot, dispose };
}

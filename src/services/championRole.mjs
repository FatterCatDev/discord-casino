import { getTopUsers } from '../db/db.auto.mjs';
import { chipsAmount } from '../games/format.mjs';

const HOME_GUILD_ID = (process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || '').trim() || null;
const LEADERBOARD_ROLE_ID = (process.env.HOME_LEADERBOARD_ROLE_ID || '1436737307591049308').trim() || null;
const HOME_GUILD_INVITE_URL = (process.env.HOME_GUILD_INVITE_URL || process.env.PRIMARY_GUILD_INVITE || 'https://discord.gg/semutaofdune').trim() || 'https://discord.gg/semutaofdune';
const SYNC_INTERVAL_MS = Math.max(60_000, Number(process.env.HOME_LEADERBOARD_ROLE_INTERVAL_MS || 5 * 60_000));
const NOTICE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // expire notices after a week

let cachedHomeGuild = null;
let cachePrimed = false;
let syncInFlight = false;
let syncTimer = null;
let currentTopUserId = null;

const championNotices = new Map();

function hasChampionConfig() {
  return Boolean(HOME_GUILD_ID && LEADERBOARD_ROLE_ID);
}

function cleanupChampionNotices() {
  const cutoff = Date.now() - NOTICE_TTL_MS;
  for (const [userId, notice] of championNotices) {
    if (!notice || (notice.queuedAt || 0) < cutoff) {
      championNotices.delete(userId);
    }
  }
}

function queueChampionNotice(userId, payload) {
  if (!userId) return;
  cleanupChampionNotices();
  const id = String(userId);
  championNotices.set(id, {
    ...payload,
    queuedAt: Date.now()
  });
}

export function claimChampionNotice(userId) {
  if (!userId) return null;
  cleanupChampionNotices();
  const id = String(userId);
  const notice = championNotices.get(id);
  if (!notice) return null;
  championNotices.delete(id);
  return notice;
}

async function fetchHomeGuild(client) {
  if (!hasChampionConfig()) return null;
  if (cachedHomeGuild) return cachedHomeGuild;
  try {
    cachedHomeGuild = await client.guilds.fetch(HOME_GUILD_ID);
    return cachedHomeGuild;
  } catch (err) {
    console.warn(`Champion role: failed to fetch home guild ${HOME_GUILD_ID}`, err);
    cachedHomeGuild = null;
    return null;
  }
}

async function ensureMemberCache(guild) {
  if (cachePrimed || !guild) return cachePrimed;
  try {
    await guild.members.fetch();
    cachePrimed = true;
  } catch (err) {
    console.warn('Champion role: failed to prime member cache, continuing with partial data', err);
  }
  return cachePrimed;
}

async function getLeaderboardTop() {
  try {
    const [first] = await getTopUsers(HOME_GUILD_ID, 1);
    if (first?.discord_id) {
      return {
        userId: String(first.discord_id),
        chips: Number(first.chips || 0)
      };
    }
  } catch (err) {
    console.error('Champion role: failed to query top users', err);
  }
  return null;
}

async function removeRoleFromMember(member, roleId) {
  if (!member) return false;
  if (!member.roles.cache.has(roleId)) return false;
  try {
    await member.roles.remove(roleId, 'Leaderboard champion rotation');
    return true;
  } catch (err) {
    console.warn(`Champion role: failed to remove role ${roleId} from ${member.id}`, err);
    return false;
  }
}

async function ensureExclusiveRole(role, championId) {
  if (!role) return { removed: [] };
  const removed = [];
  for (const member of role.members.values()) {
    if (!championId || member.id !== championId) {
      const ok = await removeRoleFromMember(member, role.id);
      if (ok) removed.push(member.id);
    }
  }
  return { removed: Array.from(new Set(removed)) };
}

async function assignChampionRole(role, member) {
  if (!role || !member) return false;
  try {
    if (member.roles.cache.has(role.id)) return true;
    await member.roles.add(role.id, 'Top leaderboard player');
    return true;
  } catch (err) {
    console.warn(`Champion role: failed to assign role ${role.id} to ${member.id}`, err);
    return false;
  }
}

async function dmChampionInvite(client, userId, chips) {
  if (!userId || !HOME_GUILD_INVITE_URL) return;
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    const amount = chipsAmount(Math.max(0, Number(chips || 0)));
    const message = [
      `🏆 Congrats! You just claimed the #1 spot on the global leaderboard with **${amount}** chips.`,
      `Join the home server to unlock a special champion role: ${HOME_GUILD_INVITE_URL}`
    ].join('\n');
    await user.send(message);
  } catch (err) {
    console.warn(`Champion role: failed to DM invite to ${userId}`, err);
  }
}

async function syncChampionRole(client, trigger = 'interval') {
  if (!hasChampionConfig()) return;
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const guild = await fetchHomeGuild(client);
    if (!guild) return;
    await ensureMemberCache(guild);
    const role =
      guild.roles.cache.get(LEADERBOARD_ROLE_ID) ||
      (await guild.roles.fetch(LEADERBOARD_ROLE_ID).catch(() => null));
    if (!role) {
      console.warn(`Champion role: role ${LEADERBOARD_ROLE_ID} not found in guild ${guild.id}`);
      return;
    }

    const topEntry = await getLeaderboardTop();
    const topUserId = topEntry?.userId || null;
    const topChips = topEntry?.chips || 0;
    const leaderboardChanged = topUserId !== currentTopUserId;

    let championMember = null;
    if (topUserId) {
      championMember = await guild.members.fetch({ user: topUserId, force: true }).catch(() => null);
    }

    const { removed } = await ensureExclusiveRole(role, championMember?.id || null);
    const roleAssigned = await assignChampionRole(role, championMember);

    if (leaderboardChanged) {
      if (topUserId) {
        queueChampionNotice(topUserId, { type: 'gained', chips: topChips });
      }
      if (currentTopUserId && currentTopUserId !== topUserId) {
        queueChampionNotice(currentTopUserId, { type: 'lost', dethronedBy: topUserId });
      }
      if (topUserId && !championMember) {
        await dmChampionInvite(client, topUserId, topChips);
      }
    }

    if (leaderboardChanged || removed.length) {
      const descriptor = leaderboardChanged
        ? (topUserId ? `top player is now ${topUserId}` : 'no ranked champion')
        : 'top unchanged';
      const roleSummary = roleAssigned
        ? `role assigned to ${championMember?.id}`
        : 'no eligible member for champion role';
      console.log(`Champion role sync (${trigger}): ${descriptor}; ${roleSummary}${removed.length ? `; cleaned ${removed.length}` : ''}`);
    }

    currentTopUserId = topUserId;
  } catch (err) {
    console.error('Champion role: sync failed', err);
  } finally {
    syncInFlight = false;
  }
}

export function startLeaderboardChampionWatcher(client) {
  if (!hasChampionConfig()) return false;
  if (syncTimer) return true;
  syncChampionRole(client, 'startup').catch(() => {});
  syncTimer = setInterval(() => {
    syncChampionRole(client).catch(() => {});
  }, SYNC_INTERVAL_MS);
  return true;
}

export async function forceSyncChampionRole(client, reason = 'manual') {
  await syncChampionRole(client, reason);
}

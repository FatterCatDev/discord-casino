import { getAdminChipTotal, getCartelShareLeaders, getCartelStaffShareTotal, getTopUsers } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';
import { chipsAmount } from '../games/format.mjs';
import {
  createLeaderboardSession,
  renderLeaderboardPage,
  updateLeaderboardSessionMeta
} from '../lib/leaderboardSessions.mjs';
import { decorateLeaderboardPayload } from '../lib/leaderboardToggle.mjs';

const LEADERBOARD_NAME_CACHE_TTL_MS = Math.max(60_000, Number(process.env.LEADERBOARD_NAME_CACHE_TTL_MS || 10 * 60_000));
const LEADERBOARD_NAME_CACHE_MAX = Math.max(100, Number(process.env.LEADERBOARD_NAME_CACHE_MAX || 2_000));
const LEADERBOARD_NAME_RESOLUTION_CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.LEADERBOARD_NAME_RESOLUTION_CONCURRENCY || 5)));
const leaderboardNameCache = new Map();

function getCachedLeaderboardName(userId) {
  const key = String(userId || '').trim();
  if (!key) return null;
  const cached = leaderboardNameCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    leaderboardNameCache.delete(key);
    return null;
  }
  leaderboardNameCache.delete(key);
  leaderboardNameCache.set(key, cached);
  return cached.name || null;
}

function setCachedLeaderboardName(userId, name) {
  const key = String(userId || '').trim();
  if (!key || !name) return;
  leaderboardNameCache.delete(key);
  leaderboardNameCache.set(key, {
    name,
    expiresAt: Date.now() + LEADERBOARD_NAME_CACHE_TTL_MS
  });
  while (leaderboardNameCache.size > LEADERBOARD_NAME_CACHE_MAX) {
    const oldestKey = leaderboardNameCache.keys().next().value;
    if (!oldestKey) break;
    leaderboardNameCache.delete(oldestKey);
  }
}

function getDisplayNameFromMember(member, fallback) {
  return member?.displayName || member?.user?.globalName || member?.user?.username || fallback;
}

function getDisplayNameFromUser(user, fallback) {
  return user?.globalName || user?.username || fallback;
}

async function resolveLeaderboardNames(interaction, userIds) {
  const guild = interaction.guild;
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map(id => String(id || '').trim()).filter(Boolean)));
  const names = new Map();
  const pendingIds = [];

  for (const userId of ids) {
    const fallback = `User ${userId}`;
    const cachedName = getCachedLeaderboardName(userId);
    if (cachedName) {
      names.set(userId, cachedName);
      continue;
    }
    const cachedMember = guild?.members?.cache?.get(userId);
    if (cachedMember) {
      const memberName = getDisplayNameFromMember(cachedMember, fallback);
      setCachedLeaderboardName(userId, memberName);
      names.set(userId, memberName);
      continue;
    }
    pendingIds.push(userId);
  }

  let cursor = 0;
  const workerCount = Math.min(LEADERBOARD_NAME_RESOLUTION_CONCURRENCY, pendingIds.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < pendingIds.length) {
      const userId = pendingIds[cursor++];
      const fallback = `User ${userId}`;
      let resolvedName = fallback;
      try {
        if (guild) {
          const member = await guild.members.fetch({ user: userId, force: false, cache: true }).catch(() => null);
          if (member) {
            resolvedName = getDisplayNameFromMember(member, fallback);
            setCachedLeaderboardName(userId, resolvedName);
            names.set(userId, resolvedName);
            continue;
          }
        }
        const user = await interaction.client.users.fetch(userId).catch(() => null);
        resolvedName = getDisplayNameFromUser(user, fallback);
      } catch {
        resolvedName = fallback;
      }
      setCachedLeaderboardName(userId, resolvedName);
      names.set(userId, resolvedName);
    }
  });

  await Promise.all(workers);
  return names;
}

export default async function handleLeaderboard(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const guildId = interaction.guild?.id || null;
  const pageSize = 10;
  const maxEntries = pageSize * 10;
  await interaction.deferReply({ ephemeral: false });

  let rows = [];
  try {
    rows = await getTopUsers(guildId, maxEntries);
  } catch (err) {
    console.error('leaderboard: failed to load top chip holders', err);
  }

  let adminIds = [];
  try {
    adminIds = Array.from(new Set(await ctx?.listAdmins?.() || [])).map(String);
  } catch (err) {
    console.error('leaderboard: failed to list admins', err);
  }

  let houseBalance = 0;
  if (typeof ctx?.getHouseBalance === 'function') {
    try {
      houseBalance = Number(await ctx.getHouseBalance()) || 0;
    } catch (err) {
      console.error('leaderboard: failed to fetch house balance', err);
    }
  }

  let adminChipTotal = 0;
  if (guildId && adminIds.length > 0) {
    try {
      adminChipTotal = Number(await getAdminChipTotal(guildId)) || 0;
    } catch (err) {
      console.error('leaderboard: failed to fetch admin chip total', err);
    }
  }

  const fmt = new Intl.NumberFormat('en-US');
  const medals = [emoji('medalGold'), emoji('medalSilver'), emoji('medalBronze')];
  const houseLine = `House: **${chipsAmount(Math.max(0, houseBalance + adminChipTotal))}** chips`;

  let shareLeaders = [];
  if (guildId) {
    try {
      shareLeaders = await getCartelShareLeaders(guildId, maxEntries);
    } catch (err) {
      console.error('leaderboard: failed to load cartel share leaders', err);
    }
  }
  let staffShareTotal = 0;
  if (guildId) {
    try {
      staffShareTotal = Number(await getCartelStaffShareTotal(guildId)) || 0;
    } catch (err) {
      console.error('leaderboard: failed to load cartel staff share total', err);
    }
  }
  const allUserIds = Array.from(new Set([
    ...rows.map(row => String(row?.discord_id || '').trim()),
    ...shareLeaders.map(row => String(row?.user_id || '').trim())
  ].filter(Boolean)));
  const resolvedNames = await resolveLeaderboardNames(interaction, allUserIds);

  const chipLines = rows.map((r, i) => {
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    const name = resolvedNames.get(String(r.discord_id)) || `User ${r.discord_id}`;
    const chipTotal = chipsAmount(Math.max(0, Number(r.chips || 0)));
    return say(
      `${rank} My radiant Kitten **${name}** — **${chipTotal}**`,
      `${rank} **${name}** — **${chipTotal}**`
    );
  });
  const chipCount = Math.min(rows.length, maxEntries);
  const chipTitle = say(
    `${emoji('trophy')} Global Chip Leaderboard — Top ${chipCount} Kittens`,
    `${emoji('trophy')} Global Chip Leaderboard (Top ${chipCount})`
  );

  const shareLines = shareLeaders.map((inv, i) => {
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    const name = resolvedNames.get(String(inv.user_id)) || `User ${inv.user_id}`;
    return say(
      `${rank} My radiant Kitten **${name}** — **${fmt.format(Number(inv.shares || 0))}** shares`,
      `${rank} **${name}** — **${fmt.format(Number(inv.shares || 0))}** shares`
    );
  });
  const shareCount = shareLeaders.length;
  const shareTitle = say(
    `${emoji('semuta_cartel')} Global Cartel Share Leaderboard — Top ${shareCount} Kittens`,
    `${emoji('semuta_cartel')} Global Cartel Share Leaderboard (Top ${shareCount})`
  );
  const cartelLine = `Cartel's Share: **${fmt.format(Math.max(0, staffShareTotal))}** shares`;

  const chipsSessionId = createLeaderboardSession({
    title: chipTitle,
    lines: chipLines,
    leadingLines: [houseLine]
  });
  const sharesSessionId = createLeaderboardSession({
    title: shareTitle,
    lines: shareLines,
    leadingLines: [cartelLine]
  });
  updateLeaderboardSessionMeta(chipsSessionId, { view: 'chips', chipsSessionId, sharesSessionId });
  updateLeaderboardSessionMeta(sharesSessionId, { view: 'shares', chipsSessionId, sharesSessionId });

  const payload = renderLeaderboardPage(chipsSessionId, 0);
  if (!payload) {
    return interaction.editReply({
      content: say('❌ I could not open the leaderboard right now, Kitten.', '❌ Failed to build the leaderboard. Try again in a moment.'),
      components: []
    });
  }
  const decorated = decorateLeaderboardPayload(payload, {
    view: 'chips',
    chipsSessionId,
    sharesSessionId
  });
  if (!decorated) {
    return interaction.editReply({
      content: say('❌ I could not open the leaderboard right now, Kitten.', '❌ Failed to build the leaderboard. Try again in a moment.'),
      components: []
    });
  }

  return interaction.editReply(decorated);
}

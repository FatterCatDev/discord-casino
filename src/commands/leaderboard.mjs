import { getTopUsers, listCartelInvestors } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';
import {
  createLeaderboardSession,
  renderLeaderboardPage,
  updateLeaderboardSessionMeta
} from '../lib/leaderboardSessions.mjs';
import { decorateLeaderboardPayload } from '../lib/leaderboardToggle.mjs';

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

  let moderatorIds = [];
  try {
    moderatorIds = Array.from(new Set(await ctx?.listModerators?.() || [])).map(String);
  } catch (err) {
    console.error('leaderboard: failed to list moderators', err);
  }

  const staffSet = new Set([...adminIds, ...moderatorIds]);

  let houseBalance = 0;
  if (typeof ctx?.getHouseBalance === 'function') {
    try {
      houseBalance = Number(await ctx.getHouseBalance()) || 0;
    } catch (err) {
      console.error('leaderboard: failed to fetch house balance', err);
    }
  }

  let adminChipTotal = 0;
  if (typeof ctx?.getUserBalances === 'function' && adminIds.length > 0) {
    await Promise.all(adminIds.map(async (id) => {
      try {
        const balances = await ctx.getUserBalances(id);
        adminChipTotal += Number(balances?.chips || 0);
      } catch (err) {
        console.error('leaderboard: failed to fetch admin balance', err);
      }
    }));
  }

  const fmt = new Intl.NumberFormat('en-US');
  const medals = [emoji('medalGold'), emoji('medalSilver'), emoji('medalBronze')];
  const houseLine = `House: **${fmt.format(Math.max(0, houseBalance + adminChipTotal))}** chips`;

  const resolveName = async (userId) => {
    const fallback = `User ${userId}`;
    try {
      const guild = interaction.guild;
      if (guild) {
        const cached = guild.members.cache.get(userId);
        if (cached) {
          return cached.displayName || cached.user?.globalName || cached.user?.username || fallback;
        }
        const fetched = await guild.members.fetch(userId).catch(() => null);
        if (fetched) {
          return fetched.displayName || fetched.user?.globalName || fetched.user?.username || fallback;
        }
      }
      const user = await interaction.client.users.fetch(userId).catch(() => null);
      return user?.globalName || user?.username || fallback;
    } catch {
      return fallback;
    }
  };

  const chipLines = await Promise.all(rows.map(async (r, i) => {
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    const name = await resolveName(r.discord_id);
    return say(
      `${rank} My radiant Kitten **${name}** — **${fmt.format(Number(r.chips || 0))}**`,
      `${rank} **${name}** — **${fmt.format(Number(r.chips || 0))}**`
    );
  }));
  const chipCount = Math.min(rows.length, maxEntries);
  const chipTitle = say(
    `${emoji('trophy')} Global Chip Leaderboard — Top ${chipCount} Kittens`,
    `${emoji('trophy')} Global Chip Leaderboard (Top ${chipCount})`
  );

  let investors = [];
  if (guildId) {
    try {
      investors = await listCartelInvestors(guildId);
    } catch (err) {
      console.error('leaderboard: failed to load cartel investors', err);
    }
  }
  const staffShareTotal = investors.reduce((sum, investor) => {
    if (!investor || !staffSet.has(String(investor.user_id))) return sum;
    return sum + Math.max(0, Number(investor.shares || 0));
  }, 0);
  const shareLeaders = investors
    .filter(inv => inv && !staffSet.has(String(inv.user_id)) && Number(inv.shares || 0) > 0)
    .sort((a, b) => Number(b.shares || 0) - Number(a.shares || 0))
    .slice(0, maxEntries);
  const shareLines = await Promise.all(shareLeaders.map(async (inv, i) => {
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    const name = await resolveName(inv.user_id);
    return say(
      `${rank} My radiant Kitten **${name}** — **${fmt.format(Number(inv.shares || 0))}** shares`,
      `${rank} **${name}** — **${fmt.format(Number(inv.shares || 0))}** shares`
    );
  }));
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

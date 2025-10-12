import { getTopUsers } from '../db/db.auto.mjs';

export default async function handleLeaderboard(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const limit = interaction.options.getInteger('limit') ?? 10;
  const rows = await getTopUsers(interaction.guild?.id, limit);
  if (!rows.length) {
    return interaction.reply({
      content: say('📉 No Kittens have claimed any chips yet. Be the first to indulge!', '📉 No players with chips yet. Be the first to earn some!'),
      ephemeral: true
    });
  }
  const medals = ['🥇', '🥈', '🥉'];
  const fmt = new Intl.NumberFormat('en-US');

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

  const lines = await Promise.all(rows.map(async (r, i) => {
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    const name = await resolveName(r.discord_id);
    return say(
      `${rank} My radiant Kitten **${name}** — **${fmt.format(Number(r.chips || 0))}**`,
      `${rank} **${name}** — **${fmt.format(Number(r.chips || 0))}**`
    );
  }));
  const title = say(`🏆 Global Chip Leaderboard — My Top ${rows.length} Kittens`, `🏆 Global Chip Leaderboard (Top ${rows.length})`);
  return interaction.reply({
    content: `**${title}**\n${lines.join('\n')}`,
    ephemeral: true
  });
}

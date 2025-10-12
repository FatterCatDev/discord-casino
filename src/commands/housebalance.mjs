import { getHouseBalance, getCasinoNetworth } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleHouseBalance(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may peek at the house ledger, Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const guildId = interaction.guild?.id;
  const h = await getHouseBalance(guildId);
  const net = await getCasinoNetworth(guildId);
  return interaction.reply({
    content: say(
      `${emoji('vault')} Global house balance: **${ctx.chipsAmount(h)}**\n${emoji('briefcase')} Global net worth of every tantalizing chip in play: **${ctx.chipsAmount(net)}**\nKeep it purring, Kitten.`,
      `${emoji('vault')} Global house balance: **${ctx.chipsAmount(h)}**\n${emoji('briefcase')} Global net worth (all chips in circulation): **${ctx.chipsAmount(net)}**`
    ),
    ephemeral: true
  });
}

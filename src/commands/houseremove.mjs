import { removeFromHouse } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleHouseRemove(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may skim from the house, Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Ask for a positive amount if you want the house to share, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  try {
  const guildId = interaction.guild?.id;
  const newBal = await removeFromHouse(guildId, amount, reason, interaction.user.id);
    const logLines = kittenMode
      ? [
          `${emoji('vault')} **House Remove**`,
          `Amount withdrawn for my schemes: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `New House Balance: **${ctx.chipsAmount(newBal)}**`
        ]
      : [
          `${emoji('vault')} **House Remove**`,
          `Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `New House Balance: **${ctx.chipsAmount(newBal)}**`
        ];
    await ctx.postCashLog(interaction, logLines);
    return interaction.reply({ content: say(`✅ Removed **${ctx.chipsAmount(amount)}** from the house reserves${reason ? ` (${reason})` : ''}. New house balance: **${ctx.chipsAmount(newBal)}**. Share it wisely, Kitten.`, `✅ Removed **${ctx.chipsAmount(amount)}** from the house${reason ? ` (${reason})` : ''}. New house balance: **${ctx.chipsAmount(newBal)}**.`), ephemeral: true });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_HOUSE') {
      return interaction.reply({ content: say('❌ The house doesn’t hold that many chips right now, Kitten.', '❌ The house does not have enough chips.'), ephemeral: true });
    }
    console.error(err);
    return interaction.reply({ content: say('❌ Something went wrong while pulling from the house, Kitten.', '❌ Something went wrong.'), ephemeral: true });
  }
}

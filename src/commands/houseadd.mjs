import { addToHouse } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleHouseAdd(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may fatten the house coffers, Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Offer a positive amount if you want to indulge the house, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  const guildId = interaction.guild?.id;
  const newBal = await addToHouse(guildId, amount, reason, interaction.user.id);
  const logLines = kittenMode
    ? [
        `${emoji('vault')} **House Add**`,
        `Amount for my velvet house: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
        `New House Balance: **${ctx.chipsAmount(newBal)}**`
      ]
    : [
        `${emoji('vault')} **House Add**`,
        `Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
        `New House Balance: **${ctx.chipsAmount(newBal)}**`
      ];
  await ctx.postCashLog(interaction, logLines);
  return interaction.reply({
    content: say(
      `✅ Added **${ctx.chipsAmount(amount)}** to the house hoard${reason ? ` (${reason})` : ''}. New house balance: **${ctx.chipsAmount(newBal)}**—thank you, Kitten.`,
      `✅ Added **${ctx.chipsAmount(amount)}** to the house${reason ? ` (${reason})` : ''}. New house balance: **${ctx.chipsAmount(newBal)}**.`
    ),
    ephemeral: true
  });
}

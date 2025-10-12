import { takeFromUserToHouse } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleTakeChips(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may collect chips for the house, Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Present a positive amount if you’re claiming chips, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  try {
    const { chips, house } = await takeFromUserToHouse(interaction.guild?.id, target.id, amount, reason, interaction.user.id);
    const logLines = kittenMode
      ? [
          `${emoji('vault')} **Take Chips to House**`,
          `User: My daring Kitten <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips (after): **${ctx.chipsAmount(chips)}** • House (after): **${ctx.chipsAmount(house)}**`
        ]
      : [
          `${emoji('vault')} **Take Chips to House**`,
          `User: <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips (after): **${ctx.chipsAmount(chips)}** • House (after): **${ctx.chipsAmount(house)}**`
        ];
    await ctx.postCashLog(interaction, logLines);
    return interaction.reply({ content: say(`✅ Collected **${ctx.chipsAmount(amount)}** from my teasing Kitten <@${target.id}> for the house${reason ? ` (${reason})` : ''}.`, `✅ Took **${ctx.chipsAmount(amount)}** from <@${target.id}> to the house${reason ? ` (${reason})` : ''}.`), ephemeral: true });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_USER') {
      return interaction.reply({ content: say('❌ That Kitten doesn’t have enough chips to cover it.', '❌ That user does not have enough chips.'), ephemeral: true });
    }
    console.error(err);
    return interaction.reply({ content: say('❌ Something went wrong while taking those chips, Kitten.', '❌ Something went wrong.'), ephemeral: true });
  }
}

import { transferFromHouseToUser } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleMintChip(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may grant chips to another Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Offer a positive amount if you want me to spoil them, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  try {
    const { chips, house } = await transferFromHouseToUser(interaction.guild?.id, target.id, amount, reason, interaction.user.id);
    const logLines = kittenMode
      ? [
          `${emoji('gift')} **Mint Chips**`,
          `To: My spoiled Kitten <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips: **${ctx.chipsAmount(chips)}** • House: **${ctx.chipsAmount(house)}**`
        ]
      : [
          `${emoji('gift')} **Mint Chips**`,
          `To: <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips: **${ctx.chipsAmount(chips)}** • House: **${ctx.chipsAmount(house)}**`
        ];
    await ctx.postCashLog(interaction, logLines);
    try {
      const dmContent = say(
        `${emoji('gift')} My darling staff just showered you with **${ctx.chipsAmount(amount)}** from <@${interaction.user.id}>${reason ? ` (${reason})` : ''}.\nKeep those paws ready — your balance now rests at **${ctx.chipsAmount(chips)}**.`,
        `${emoji('gift')} You received **${ctx.chipsAmount(amount)}** chips from <@${interaction.user.id}>${reason ? ` (${reason})` : ''}.\nYour balance is now **${ctx.chipsAmount(chips)}**.`
      );
      await target.send(dmContent);
    } catch (dmErr) {
      console.error('mintchip dm failed', dmErr);
    }
    return interaction.reply({
      content: say(
        `${emoji('gift')} Minted **${ctx.chipsAmount(amount)}** for my playful Kitten <@${target.id}>${reason ? ` (${reason})` : ''}.\n• Bask in it, Kitten — balance: **${ctx.chipsAmount(chips)}**\n• House balance: **${ctx.chipsAmount(house)}**`,
        `${emoji('gift')} Minted **${ctx.chipsAmount(amount)}** for <@${target.id}>${reason ? ` (${reason})` : ''}.\n• <@${target.id}>'s new balance: **${ctx.chipsAmount(chips)}**\n• House balance: **${ctx.chipsAmount(house)}**`
      ),
      ephemeral: true
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_HOUSE') {
      return interaction.reply({ content: say('❌ The house is short on chips for that gift, Kitten.', '❌ The house does not have enough chips.'), ephemeral: true });
    }
    console.error(err);
    return interaction.reply({ content: say('❌ Something went wrong while gifting those chips, Kitten.', '❌ Something went wrong.'), ephemeral: true });
  }
}

import { grantCredits } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleGiveCredits(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may shower Credits on another Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Bring me a positive amount if you want to spoil them, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  const { credits } = await grantCredits(interaction.guild?.id, target.id, amount, reason, interaction.user.id);
  const nf = new Intl.NumberFormat('en-US');
  const logLines = kittenMode
    ? [
        `${emoji('gift')} **Grant Credits**`,
        `To: My pampered Kitten <@${target.id}> • Amount: **${nf.format(amount)}** credits${reason ? ` • Reason: ${reason}` : ''}`,
        `User Credits: **${nf.format(credits)}**`
      ]
    : [
        `${emoji('gift')} **Grant Credits**`,
        `To: <@${target.id}> • Amount: **${nf.format(amount)}** credits${reason ? ` • Reason: ${reason}` : ''}`,
        `User Credits: **${nf.format(credits)}**`
      ];
  await ctx.postCashLog(interaction, logLines);
  const fmt = new Intl.NumberFormat('en-US');
  return interaction.reply({
    content: say(
      `✅ Showered **${fmt.format(amount)}** Credits on my cherished Kitten <@${target.id}>${reason ? ` (${reason})` : ''}.\n• Your gleaming balance, Kitten: **${fmt.format(credits)}**`,
      `✅ Gave **${fmt.format(amount)}** Credits to <@${target.id}>${reason ? ` (${reason})` : ''}.\n• <@${target.id}>'s Credits: **${fmt.format(credits)}**`
    ),
    ephemeral: true
  });
}

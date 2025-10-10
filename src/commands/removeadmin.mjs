import { removeAdmin } from '../db/db.auto.mjs';

export default async function handleRemoveAdmin(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const guildId = interaction.guild?.id;
  if (!guildId) {
    return interaction.reply({ content: say('❌ Administrative shifts happen inside a server, Kitten.', '❌ This command can only be used in a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my cherished administrators may demote another, Kitten.', '❌ Admin access required.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  if (!target) {
    return interaction.reply({ content: say('❌ Name the administrator you wish me to dismiss, Kitten.', '❌ Please choose a valid user.'), ephemeral: true });
  }
  try {
    const roster = await removeAdmin(guildId, target.id);
    const list = roster.length ? roster.map(id => `<@${id}>`).join(', ') : say('_none remain_', '_none_');
    const message = say(
      `✅ <@${target.id}> has been released from administrator duties.\nCurrent administrators: ${list}`,
      `✅ Removed <@${target.id}> from administrators.\nCurrent administrators: ${list}`
    );
    return interaction.reply({ content: message, ephemeral: true });
  } catch (err) {
    console.error('removeadmin error:', err);
    return interaction.reply({ content: say('❌ I couldn’t amend the administrator list, Kitten.', '❌ Failed to remove administrator.'), ephemeral: true });
  }
}

import { removeModerator } from '../db/db.auto.mjs';

export default async function handleRemoveMod(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const guildId = interaction.guild?.id;
  if (!guildId) {
    return interaction.reply({ content: say('❌ I only manage staff inside a server, Kitten.', '❌ This command can only be used in a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my senior staff may demote moderators, Kitten.', '❌ Admin access required.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  if (!target) {
    return interaction.reply({ content: say('❌ Name the pet you wish me to release, Kitten.', '❌ Please choose a valid user.'), ephemeral: true });
  }
  try {
    const roster = await removeModerator(guildId, target.id);
    const list = roster.length ? roster.map(id => `<@${id}>`).join(', ') : say('_none remain_', '_none_');
    const message = say(
      `✅ <@${target.id}> is no longer among my global moderators.\nGlobal moderators: ${list}`,
      `✅ Removed <@${target.id}> from global moderators.\nGlobal moderators: ${list}`
    );
    return interaction.reply({ content: message, ephemeral: true });
  } catch (err) {
    console.error('removemod error:', err);
    return interaction.reply({ content: say('❌ I couldn’t adjust the roster this time, Kitten.', '❌ Failed to remove moderator.'), ephemeral: true });
  }
}

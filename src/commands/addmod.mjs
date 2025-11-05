import { addModerator } from '../db/db.auto.mjs';

export default async function handleAddMod(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const guildId = interaction.guild?.id;
  if (!guildId) {
    return interaction.reply({ content: say('❌ I only promote Kittens inside a server.', '❌ This command can only be used in a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my senior staff may appoint moderators, Kitten.', '❌ Admin access required.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  if (!target) {
    return interaction.reply({ content: say('❌ Bring me a proper user to elevate, Kitten.', '❌ Please choose a valid user.'), ephemeral: true });
  }
  try {
    const roster = await addModerator(guildId, target.id);
    const list = roster.length ? roster.map(id => `<@${id}>`).join(', ') : say('_none yet_', '_none_');
    const message = say(
      `✅ <@${target.id}> now wears my moderator collar everywhere.\nGlobal moderators: ${list}`,
      `✅ Added <@${target.id}> as a global moderator.\nGlobal moderators: ${list}`
    );
    return interaction.reply({ content: message, ephemeral: true });
  } catch (err) {
    console.error('addmod error:', err);
    return interaction.reply({ content: say('❌ I could not crown that moderator, Kitten.', '❌ Failed to add moderator.'), ephemeral: true });
  }
}

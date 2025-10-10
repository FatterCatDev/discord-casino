import { addAdmin } from '../db.auto.mjs';

export default async function handleAddAdmin(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const guildId = interaction.guild?.id;
  if (!guildId) {
    return interaction.reply({ content: say('❌ I can only appoint administrators inside a server, Kitten.', '❌ This command can only be used in a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only those already in my inner circle may appoint administrators, Kitten.', '❌ Admin access required.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  if (!target) {
    return interaction.reply({ content: say('❌ Present a worthy candidate for my inner circle, Kitten.', '❌ Please choose a valid user.'), ephemeral: true });
  }
  try {
    const roster = await addAdmin(guildId, target.id);
    const list = roster.length ? roster.map(id => `<@${id}>`).join(', ') : say('_none yet_', '_none_');
    const message = say(
      `✅ <@${target.id}> now shares my authority.\nCurrent administrators: ${list}`,
      `✅ Added <@${target.id}> as an administrator.\nCurrent administrators: ${list}`
    );
    return interaction.reply({ content: message, ephemeral: true });
  } catch (err) {
    console.error('addadmin error:', err);
    return interaction.reply({ content: say('❌ I couldn’t welcome them into the inner circle, Kitten.', '❌ Failed to add administrator.'), ephemeral: true });
  }
}

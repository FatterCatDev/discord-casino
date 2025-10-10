import { EmbedBuilder } from 'discord.js';

export default async function handleStaffList(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const guildId = interaction.guild?.id;
  if (!guildId) {
    return interaction.reply({ content: say('❌ I only track staff inside a server, Kitten.', '❌ This command can only be used in a server.'), ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let admins = [];
  let moderators = [];
  try {
    admins = Array.from(new Set(await ctx.listAdmins() || [])).map(String);
  } catch (err) {
    console.error('stafflist admins error:', err);
  }
  try {
    moderators = Array.from(new Set(await ctx.listModerators() || [])).map(String);
  } catch (err) {
    console.error('stafflist moderators error:', err);
  }

  const adminSet = new Set(admins);
  const modOnly = moderators.filter(id => !adminSet.has(id));

  const fmtList = (ids, emptyMsg) => ids.length ? ids.map(id => `<@${id}>`).join('\n') : emptyMsg;
  const adminText = fmtList(admins, say('_No administrators yet_', '_No administrators configured_'));
  const modText = fmtList(modOnly, say('_No dedicated moderators yet_', '_No moderators configured_'));

  const embed = new EmbedBuilder()
    .setTitle(say('👥 Casino Staff Roster', '👥 Casino Staff'))
    .setColor(0xF5A623)
    .addFields(
      { name: say('👑 Administrators', '👑 Administrators'), value: adminText, inline: false },
      { name: say('🛡️ Moderators', '🛡️ Moderators'), value: modText, inline: false }
    )
    .setFooter({ text: say('Use /addmod or /addadmin to adjust this roster, Kitten.', 'Use /addmod or /addadmin to manage staff.') })
    .setTimestamp(new Date());

  return interaction.editReply({ embeds: [embed] });
}

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { setRequestChannel } from '../db/db.auto.mjs';

const PRIMARY_GUILD_ID = (process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || '').trim() || null;

export default async function handleSetRequestChannel(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!interaction.guild) {
    return interaction.reply({ content: say('❌ I can only place that lounge inside a server, Kitten.', '❌ This command can only be used inside a server.'), ephemeral: true });
  }
  if (!PRIMARY_GUILD_ID) {
    return interaction.reply({ content: say('❌ I don’t know which guild is home, Kitten. Set PRIMARY_GUILD_ID first.', '❌ PRIMARY_GUILD_ID is not configured. Please set it before running this command.'), ephemeral: true });
  }
  if (interaction.guild.id !== PRIMARY_GUILD_ID) {
    return interaction.reply({ content: say('❌ I only reroute requests inside my home guild, Kitten.', '❌ This command can only be used inside the primary guild.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my bot admins may decide where I take requests, Kitten.', '❌ Bot admin access required.'), ephemeral: true });
  }
  const channel = interaction.options.getChannel('channel');
  const isTextish = channel && (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  );
  if (!isTextish) return interaction.reply({ content: say('❌ Choose a text-capable channel so I can hear the pleas, Kitten.', '❌ Please choose a text channel.'), ephemeral: true });
  const me = await interaction.guild.members.fetchMe();
  const botPerms = channel.permissionsFor(me);
  if (!botPerms?.has(PermissionFlagsBits.ViewChannel) || !botPerms?.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({ content: say(`❌ I need **View Channel** and **Send Messages** in <#${channel.id}>, Kitten.`, `❌ I need **View Channel** and **Send Messages** in <#${channel.id}>.`), ephemeral: true });
  }
  await setRequestChannel(interaction.guild.id, channel.id);
  return interaction.reply({ content: say(`✅ Request channel set to <#${channel.id}>. Send your desires there, Kitten.`, `✅ Request channel set to <#${channel.id}>.`), ephemeral: true });
}

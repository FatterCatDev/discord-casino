import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { setUpdateChannel } from '../db/db.auto.mjs';

export default async function handleSetUpdateChannel(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  const hasDiscordAdmin = perms?.has?.(PermissionFlagsBits.Administrator);
  if (!(hasDiscordAdmin || await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins may choose my announcement lounge, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const channel = interaction.options.getChannel('channel');
  const isTextChannel = channel && (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  );
  if (!isTextChannel) {
    return interaction.reply({ content: say('❌ I need a text-capable stage for my updates, Kitten.', '❌ Please choose a text channel.'), ephemeral: true });
  }

  const me = await interaction.guild.members.fetchMe();
  const botPerms = channel.permissionsFor(me);
  if (!botPerms?.has(PermissionFlagsBits.ViewChannel) || !botPerms?.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({ content: say(`❌ Grant me **View Channel** and **Send Messages** in <#${channel.id}>, sweet Kitten.`, `❌ I need **View Channel** and **Send Messages** permissions in <#${channel.id}>.`), ephemeral: true });
  }

  await setUpdateChannel(interaction.guild.id, channel.id);
  return interaction.reply({ content: say(`✅ All set! I will parade my updates in <#${channel.id}>, Kitten.`, `✅ Update channel set to <#${channel.id}>.`), ephemeral: true });
}
// Slash Command: /setupdatech — admin-only channel selector for update announcements

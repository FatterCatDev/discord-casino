import { ChannelType } from 'discord.js';

export async function formatCasinoCategory(interaction, categoryId) {
  if (!interaction?.guild || !categoryId) return 'the configured casino category';
  try {
    const channel = await interaction.guild.channels.fetch(categoryId);
    if (!channel) return 'the configured casino category';
    if (channel.type === ChannelType.GuildCategory) {
      return `#${channel.name}`;
    }
    return `<#${channel.id}>`;
  } catch {
    return 'the configured casino category';
  }
}

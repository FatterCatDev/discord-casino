import { ChannelType } from 'discord.js';

const FALLBACK_LABEL = 'the configured casino category';

export async function formatCasinoCategory(interaction, categoryId) {
  if (!interaction?.guild || !categoryId) {
    return { label: FALLBACK_LABEL, exampleChannelMention: null };
  }
  try {
    const channel = await interaction.guild.channels.fetch(categoryId);
    if (!channel) return { label: FALLBACK_LABEL, exampleChannelMention: null };
    if (channel.type === ChannelType.GuildCategory) {
      const label = `#${channel.name}`;
      const exampleChannelMention = await findFirstTextChannelMention(interaction, channel);
      return { label, exampleChannelMention };
    }
    const mention = `<#${channel.id}>`;
    return { label: mention, exampleChannelMention: mention };
  } catch {
    return { label: FALLBACK_LABEL, exampleChannelMention: null };
  }
}

async function findFirstTextChannelMention(interaction, categoryChannel) {
  try {
    let childrenCollection = null;
    if (categoryChannel.children && typeof categoryChannel.children.fetch === 'function') {
      childrenCollection = await categoryChannel.children.fetch().catch(() => null);
    }
    if (!childrenCollection) {
      const cache = interaction.guild?.channels?.cache;
      if (cache) {
        childrenCollection = cache.filter((child) => child?.parentId === categoryChannel.id);
      }
    }
    if (!childrenCollection) return null;
    const candidates = [...childrenCollection.values()]
      .filter((child) => isRunnableText(child))
      .sort((a, b) => {
        const aPos = Number.isFinite(a.rawPosition) ? a.rawPosition : Number.isFinite(a.position) ? a.position : 0;
        const bPos = Number.isFinite(b.rawPosition) ? b.rawPosition : Number.isFinite(b.position) ? b.position : 0;
        return aPos - bPos;
      });
    const first = candidates[0];
    return first ? `<#${first.id}>` : null;
  } catch {
    return null;
  }
}

function isRunnableText(channel) {
  if (!channel) return false;
  if (typeof channel.isThread === 'function' && channel.isThread()) return false;
  if (typeof channel.isTextBased === 'function') {
    return channel.isTextBased();
  }
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

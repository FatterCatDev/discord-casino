import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { renderHelpSectionImage } from './helpImageRenderer.mjs';

const FALLBACK_COLOR = 0x5865F2;

export async function buildHelpEmbedPayload(section, opts = {}) {
  const {
    fallbackDescription = 'Use the menu below to switch categories.',
    fileBasename = 'help'
  } = opts;

  const embed = new EmbedBuilder()
    .setTitle(section.label)
    .setColor(section.color ?? FALLBACK_COLOR)
    .setDescription(section.description ?? fallbackDescription);

  if (section.footer) {
    embed.setFooter({ text: section.footer });
  }

  let buffer = null;
  try {
    buffer = await renderHelpSectionImage(section);
  } catch (err) {
    console.error('Failed to render help section image:', err);
  }

  if (buffer) {
    const fileName = `${fileBasename}-${section.id || 'section'}.png`;
    embed.setImage(`attachment://${fileName}`);
    const file = new AttachmentBuilder(buffer, { name: fileName });
    return { embed, files: [file] };
  }

  const groups = Array.isArray(section.groups) ? section.groups : [];
  for (const group of groups) {
    const lines = (group.items || []).map(item => {
      const decorated = item.emoji ? `${item.emoji} ${item.cmd}` : item.cmd;
      return `${decorated} — ${item.desc}`;
    }).join('\n\n');
    embed.addFields({ name: group.label, value: lines || '_none_' });
  }

  return { embed, files: [] };
}

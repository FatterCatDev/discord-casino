import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { paginateHelpSection, renderHelpSectionImage } from './helpImageRenderer.mjs';

const FALLBACK_COLOR = 0x5865F2;

function applyFieldFallback(embed, groups) {
  if (!Array.isArray(groups)) return;
  for (const group of groups) {
    const lines = (group.items || []).map(item => {
      const decorated = item.emoji ? `${item.emoji} ${item.cmd}` : item.cmd;
      return `${decorated} — ${item.desc || '_none_'}`;
    }).join('\n\n');
    embed.addFields({ name: group.label, value: lines || '_none_' });
  }
}

export async function buildHelpPagePayloads(section, opts = {}) {
  const {
    fallbackDescription = 'Use the menu below to switch categories.',
    fileBasename = 'help'
  } = opts;

  const pages = paginateHelpSection(section);
  const pageCount = Math.max(1, pages.length);
  const results = [];

  for (let i = 0; i < pageCount; i++) {
    const page = pages[i];
    const embed = new EmbedBuilder()
      .setTitle(section.label)
      .setColor(section.color ?? FALLBACK_COLOR)
      .setDescription(section.description ?? fallbackDescription);

    if (section.footer) {
      embed.setFooter({ text: section.footer });
    }

    let files = [];
    try {
      const buffer = await renderHelpSectionImage(section, {
        groups: page.groups,
        pageNumber: i + 1,
        pageCount
      });
      if (buffer) {
        const name = `${fileBasename}-${section.id || 'section'}-${i + 1}.png`;
        embed.setImage(`attachment://${name}`);
        files = [new AttachmentBuilder(buffer, { name })];
      } else if (page.groups?.length) {
        applyFieldFallback(embed, page.groups);
      }
    } catch (err) {
      console.error('Failed to render help section image:', err);
      if (page.groups?.length) applyFieldFallback(embed, page.groups);
    }

    if (!files.length && (!page.groups || !page.groups.length)) {
      applyFieldFallback(embed, section.groups || []);
    }

    results.push({
      embed,
      files,
      pageIndex: i,
      pageCount
    });
  }

  return results;
}

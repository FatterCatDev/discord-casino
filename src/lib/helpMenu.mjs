import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

export function buildHelpMenuRow(sections, selectedId, kittenMode) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help|section')
    .setPlaceholder(kittenMode ? 'Pick a playbook, Kitten' : 'Select a help category');

  const options = sections
    .filter(section => section.menuLabel)
    .map(section => {
      const option = { label: section.menuLabel, value: section.id };
      if (section.menuEmoji) option.emoji = section.menuEmoji;
      if (section.id === selectedId) option.default = true;
      return option;
    });

  if (options.length) {
    menu.addOptions(options);
  } else {
    menu.addOptions({ label: 'Overview', value: selectedId || 'overview', default: true });
  }

  return new ActionRowBuilder().addComponents(menu);
}

export function buildHelpNavRow(sectionId, pageIndex, pageCount) {
  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(pageIndex, 0), total - 1);
  const prev = new ButtonBuilder()
    .setCustomId(`help|page|${sectionId}|${Math.max(0, current - 1)}`)
    .setLabel('Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(current <= 0);

  const counter = new ButtonBuilder()
    .setCustomId('help|page|noop')
    .setLabel(`Page ${current + 1}/${total}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const next = new ButtonBuilder()
    .setCustomId(`help|page|${sectionId}|${Math.min(total - 1, current + 1)}`)
    .setLabel('Next')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(current >= total - 1);

  return new ActionRowBuilder().addComponents(prev, counter, next);
}

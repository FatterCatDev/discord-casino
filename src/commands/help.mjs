import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, PermissionFlagsBits } from 'discord.js';
import { buildHelpSections } from '../lib/helpSections.mjs';

const FALLBACK_COLOR = 0x5865F2;
const DEFAULT_SECTION_ID = 'overview';

export default async function handleHelp(interaction, ctx) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  const isServerAdmin = !!perms?.has?.(PermissionFlagsBits.Administrator);
  const isBotAdmin = await ctx.isAdmin(interaction);
  const isMod = await ctx.isModerator(interaction);
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;

  const sections = buildHelpSections({ kittenMode, isMod, isServerAdmin, isBotAdmin });
  const fallbackDescription = kittenMode
    ? 'Use the menu below to sample another flavor or return to the overview.'
    : 'Use the menu below to switch categories or jump back to the overview.';

  const makeEmbed = (sectionId = DEFAULT_SECTION_ID) => {
    const section = sections.find(entry => entry.id === sectionId) || sections[0];
    const embed = new EmbedBuilder()
      .setTitle(section.label)
      .setColor(section.color ?? FALLBACK_COLOR)
      .setDescription(section.description ?? fallbackDescription);
    const groups = section.groups || [];
    for (const group of groups) {
      const lines = (group.items || []).map(item => {
        const decorated = item.emoji ? `${item.emoji} ${item.cmd}` : item.cmd;
        return `${decorated} — ${item.desc}`;
      }).join('\n\n');
      embed.addFields({ name: group.label, value: lines || '_none_' });
    }
    if (section.footer) {
      embed.setFooter({ text: section.footer });
    }
    return embed;
  };

  const menuOptions = sections
    .filter(section => section.menuLabel)
    .map(section => {
      const option = { label: section.menuLabel, value: section.id };
      if (section.menuEmoji) option.emoji = section.menuEmoji;
      return option;
    });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help|section')
    .setPlaceholder(kittenMode ? 'Pick a playbook, Kitten' : 'Select a help category')
    .addOptions(menuOptions);

  const row = new ActionRowBuilder().addComponents(menu);
  return interaction.reply({
    embeds: [makeEmbed(DEFAULT_SECTION_ID)],
    components: [row],
    ephemeral: true
  });
}
// Slash Command: /help — interactive help categories

import { PermissionFlagsBits } from 'discord.js';
import { buildHelpSections } from '../lib/helpSections.mjs';
import { buildHelpPagePayloads } from '../lib/helpEmbedBuilder.mjs';
import { buildHelpMenuRow, buildHelpNavRow } from '../lib/helpMenu.mjs';

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

  const section = sections.find(entry => entry.id === DEFAULT_SECTION_ID) || sections[0];
  const pages = await buildHelpPagePayloads(section, {
    fallbackDescription,
    fileBasename: 'help'
  });
  const pageIndex = 0;
  const page = pages[pageIndex] || { embed: null, files: [], pageIndex: 0, pageCount: 1 };

  const menuRow = buildHelpMenuRow(sections, section.id, kittenMode);
  const navRow = buildHelpNavRow(section.id, pageIndex, page.pageCount || 1);
  const components = navRow ? [menuRow, navRow] : [menuRow];

  const response = {
    embeds: [page.embed],
    components,
    ephemeral: true
  };
  if (page.files?.length) response.files = page.files;

  return interaction.reply(response);
}
// Slash Command: /help — interactive help categories

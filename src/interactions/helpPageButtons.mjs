import { PermissionFlagsBits } from 'discord.js';
import { buildHelpSections } from '../lib/helpSections.mjs';
import { buildHelpPagePayloads } from '../lib/helpEmbedBuilder.mjs';
import { buildHelpMenuRow, buildHelpNavRow } from '../lib/helpMenu.mjs';

const DEFAULT_SECTION_ID = 'overview';

export default async function handleHelpPageButtons(interaction, ctx) {
  const parts = interaction.customId.split('|');
  const sectionId = parts[2] || DEFAULT_SECTION_ID;
  const targetPage = Number(parts[3] ?? '0') || 0;

  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  const isServerAdmin = !!perms?.has?.(PermissionFlagsBits.Administrator);
  const isBotAdmin = await ctx.isAdmin(interaction);
  const isMod = await ctx.isModerator(interaction);
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;

  const sections = buildHelpSections({ kittenMode, isMod, isServerAdmin, isBotAdmin });
  const fallbackDescription = kittenMode
    ? 'Use the menu below to sample another flavor or return to the overview.'
    : 'Use the menu below to switch categories or jump back to the overview.';

  const targetSection = sections.find(section => section.id === sectionId) || sections[0];
  const pages = await buildHelpPagePayloads(targetSection, {
    fallbackDescription,
    fileBasename: 'help'
  });

  const pageCount = Math.max(1, pages.length);
  const clampedPage = Math.min(Math.max(targetPage, 0), pageCount - 1);
  const page = pages[clampedPage] || pages[0];

  const menuRow = buildHelpMenuRow(sections, targetSection.id, kittenMode);
  const navRow = buildHelpNavRow(targetSection.id, clampedPage, page.pageCount || pageCount);
  const components = navRow ? [menuRow, navRow] : [menuRow];

  const payload = { embeds: [page.embed], components };
  if (page.files?.length) payload.files = page.files;

  return interaction.update(payload);
}

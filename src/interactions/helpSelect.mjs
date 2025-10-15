import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { buildHelpSections } from '../lib/helpSections.mjs';

const FALLBACK_COLOR = 0x5865F2;
const DEFAULT_SECTION_ID = 'overview';

export default async function handleHelpSelect(interaction, ctx) {
  const selectedId = interaction.values?.[0] || DEFAULT_SECTION_ID;
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  const hasDiscordAdmin = perms?.has?.(PermissionFlagsBits.Administrator);
  const isMod = await ctx.isModerator(interaction);
  const isSetupAdmin = hasDiscordAdmin || await ctx.isAdmin(interaction);
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;

  const sections = buildHelpSections({ kittenMode, isMod, isSetupAdmin });
  const fallbackDescription = kittenMode
    ? 'Use the menu below to sample another flavor or return to the overview.'
    : 'Use the menu below to switch categories or jump back to the overview.';

  const targetSection = sections.find(section => section.id === selectedId) || sections[0];
  const embed = new EmbedBuilder()
    .setTitle(targetSection.label)
    .setColor(targetSection.color ?? FALLBACK_COLOR)
    .setDescription(targetSection.description ?? fallbackDescription);

  const groups = targetSection.groups || [];
  for (const group of groups) {
    const lines = (group.items || []).map(item => {
      const decorated = item.emoji ? `${item.emoji} ${item.cmd}` : item.cmd;
      return `${decorated} — ${item.desc}`;
    }).join('\n\n');
    embed.addFields({ name: group.label, value: lines || '_none_' });
  }

  if (targetSection.footer) {
    embed.setFooter({ text: targetSection.footer });
  }

  return interaction.update({ embeds: [embed] });
}
// Interaction: Help select menu (switch sections)

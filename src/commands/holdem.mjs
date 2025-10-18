import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildSettings } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';
import { formatCasinoCategory } from '../lib/casinoCategory.mjs';

async function inCasinoCategory(interaction, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  try {
    if (!interaction.guild) {
      return {
        ok: false,
        reason: say(
          '❌ I can only host Hold’em inside a server. Invite me there and ask an admin to run `/setcasinocategory`.',
          '❌ Hold’em tables can only be hosted inside a server. Have an admin run `/setcasinocategory` in your guild.'
        )
      };
    }
    const { casino_category_id } = await getGuildSettings(interaction.guild.id) || {};
    if (!casino_category_id) {
      return {
        ok: false,
        reason: say(
          '❌ I can’t spin up a Hold’em lounge without a casino category, Kitten. Ask a server admin to run `/setcasinocategory` for me.',
          '❌ I can’t create a Hold’em table until a casino category is configured. Please ask a server admin to run `/setcasinocategory`.'
        )
      };
    }
    const ch = interaction.channel;
    let catId = null;
    try {
      if (typeof ch?.isThread === 'function' && ch.isThread()) catId = ch.parent?.parentId || null;
      else catId = ch?.parentId || null;
    } catch {}
    if (!catId || catId !== casino_category_id) {
      const categoryLabel = await formatCasinoCategory(interaction, casino_category_id);
      return { ok: false, reason: say(`❌ Hold’em belongs inside ${categoryLabel}, Kitten. Meet me there.`, `❌ This command can only be used inside ${categoryLabel}.`) };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: say('❌ I couldn’t verify the casino category this time, Kitten.', '❌ Unable to verify channel category.')
    };
  }
}

export default async function handleHoldem(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const loc = await inCasinoCategory(interaction, kittenMode);
  if (!loc.ok) return interaction.reply({ content: loc.reason, ephemeral: true });
  const suitBanner = `${emoji('pokerSpade')}${emoji('pokerHeart')}${emoji('pokerDiamond')}${emoji('pokerClub')}`;
  let title = `${suitBanner} Texas Hold’em — Create Table`;
  let description = 'Choose a preset to create a table in this channel:';
  let optionFields = [
    { name: 'Option 1', value: 'SB/BB: **1/2** • Min/Max: **10/100**' },
    { name: 'Option 2', value: 'SB/BB: **5/10** • Min/Max: **50/500**' },
    { name: 'Option 3', value: 'SB/BB: **20/40** • Min/Max: **200/2000**' }
  ];
  if (kittenMode) {
    title = `${suitBanner} Mistress Kitten’s Hold’em Lounge`;
    description = 'Choose a table that delights me, Kitten. Pick a preset or tempt me with something custom.';
    optionFields = [
      { name: 'Velvet Table', value: 'SB/BB: **1/2** • Min/Max: **10/100** — a gentle warm-up, Kitten.' },
      { name: 'Crimson Table', value: 'SB/BB: **5/10** • Min/Max: **50/500** — a purrfect mid-stakes tease.' },
      { name: 'Obsidian Table', value: 'SB/BB: **20/40** • Min/Max: **200/2000** — only for my boldest Kitten.' }
    ];
  }
  const e = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865F2)
    .setDescription(description)
    .addFields(optionFields);
  const buttonConfigs = kittenMode
    ? [
        { id: 'p1', label: 'Velvet Table', style: ButtonStyle.Primary },
        { id: 'p2', label: 'Crimson Table', style: ButtonStyle.Secondary },
        { id: 'p3', label: 'Obsidian Table', style: ButtonStyle.Success },
        { id: 'custom', label: 'Custom Fantasy', style: ButtonStyle.Secondary }
      ]
    : [
        { id: 'p1', label: 'Option 1', style: ButtonStyle.Primary },
        { id: 'p2', label: 'Option 2', style: ButtonStyle.Secondary },
        { id: 'p3', label: 'Option 3', style: ButtonStyle.Success },
        { id: 'custom', label: 'Custom', style: ButtonStyle.Secondary }
      ];
  const row = new ActionRowBuilder().addComponents(
    ...buttonConfigs.map(cfg => new ButtonBuilder()
      .setCustomId(`hold|create|${cfg.id}|${interaction.user.id}`)
      .setLabel(cfg.label)
      .setStyle(cfg.style))
  );
  return interaction.reply({ embeds: [e], components: [row] });
}

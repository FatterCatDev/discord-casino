import { getGuildSettings } from '../db/db.auto.mjs';
import { formatCasinoCategory } from '../lib/casinoCategory.mjs';

async function inCasinoCategory(interaction, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  try {
    if (!interaction.guild) return { ok: true };
    const { casino_category_id } = await getGuildSettings(interaction.guild.id) || {};
    if (!casino_category_id) return { ok: true };
    const ch = interaction.channel;
    let catId = null;
    try {
      if (typeof ch?.isThread === 'function' && ch.isThread()) catId = ch.parent?.parentId || null;
      else catId = ch?.parentId || null;
    } catch {}
    if (!catId || catId !== casino_category_id) {
      const categoryLabel = await formatCasinoCategory(interaction, casino_category_id);
      return { ok: false, reason: say(`❌ Bring me into ${categoryLabel} before we tempt fate, Kitten.`, `❌ This command can only be used inside ${categoryLabel}.`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: say('❌ I couldn’t verify the casino category, Kitten.', '❌ Unable to verify channel category.') };
  }
}

export default async function handleRideBus(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const loc = await inCasinoCategory(interaction, kittenMode);
  if (!loc.ok) return interaction.reply({ content: loc.reason, ephemeral: true });
  const bet = interaction.options.getInteger('bet');
  return ctx.startRideBus(interaction, bet);
}

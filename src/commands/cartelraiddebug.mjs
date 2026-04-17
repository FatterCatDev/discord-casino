import { triggerCartelRaidDebug, CartelError, formatSemuta } from '../cartel/service.mjs';

function parseAction(raw) {
  const value = String(raw || 'collect').toLowerCase();
  if (value === 'burn' || value === 'export') return value;
  return 'collect';
}

export default async function handleCartelRaidDebug(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({ content: say('❌ I can only trigger a raid inside a server, Kitten.', '❌ This command must be used inside a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins can force raids, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const target = interaction.options.getUser('user');
  if (!target) {
    return interaction.reply({ content: say('❌ Pick a target player first, Kitten.', '❌ Please choose a target player.'), ephemeral: true });
  }

  const actionType = parseAction(interaction.options.getString('action'));
  const collectedGramsInput = interaction.options.getNumber('collected_grams') ?? 0;
  const collectedGrams = Number.isFinite(collectedGramsInput) ? Math.max(0, collectedGramsInput) : 0;

  try {
    const result = await triggerCartelRaidDebug(interaction.guild.id, target.id, {
      actionType,
      collectedGrams
    });
    const raid = result.raid || {};
    const confiscated = Number(raid.confiscatedGrams || 0);
    const fineCharged = Math.max(0, Number(raid.fineChipsCharged || 0));
    const finePaid = Math.max(0, Number(raid.fineChipsPaid || 0));
    const partialLine = finePaid < fineCharged ? ' (partial due to low chips)' : '';
    const scopeWarehouse = formatSemuta(result.scopeWarehouseMg || 0, { maximumFractionDigits: 2 });
    const scopeCollected = formatSemuta(result.scopeCollectedMg || 0, { maximumFractionDigits: 2 });
    const content = say(
      `✅ Raid forced on <@${target.id}> (${actionType}). Scope: warehouse **${scopeWarehouse}g**, collected **${scopeCollected}g**. Confiscated **${confiscated.toLocaleString('en-US', { maximumFractionDigits: 2 })}g**. Fine paid **${finePaid.toLocaleString('en-US')}** / charged **${fineCharged.toLocaleString('en-US')}** chips${partialLine}.`,
      `✅ Forced cartel raid on <@${target.id}> (${actionType}). Scope warehouse: **${scopeWarehouse}g**, scope collected: **${scopeCollected}g**. Confiscated: **${confiscated.toLocaleString('en-US', { maximumFractionDigits: 2 })}g**. Fine paid: **${finePaid.toLocaleString('en-US')}** / charged **${fineCharged.toLocaleString('en-US')}** chips${partialLine}.`
    );
    return interaction.reply({ content, ephemeral: true });
  } catch (error) {
    if (error instanceof CartelError) {
      return interaction.reply({ content: `⚠️ ${error.message || 'Failed to force raid.'}`, ephemeral: true });
    }
    console.error('[cartelraiddebug] failed to force raid', error);
    return interaction.reply({ content: say('⚠️ I could not force that raid right now, Kitten.', '⚠️ Failed to force raid. Please try again soon.'), ephemeral: true });
  }
}

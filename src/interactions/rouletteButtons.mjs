import { EmbedBuilder } from 'discord.js';
import { emoji } from '../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../lib/fundsTip.mjs';
import { scheduleInteractionAck } from '../lib/interactionAck.mjs';

const ROULETTE_BUTTON_STALE_MS = (() => {
  const specific = Number(process.env.ROULETTE_BUTTON_STALE_MS);
  if (Number.isFinite(specific) && specific > 0) return specific;
  const general = Number(process.env.INTERACTION_STALE_MS);
  return Number.isFinite(general) && general > 0 ? general : 2500;
})();

export default async function onRouletteButtons(interaction, ctx) {
  if (!interaction.guild) {
    return respondEphemeral({ content: `${emoji('warning')} Roulette buttons only work inside servers.` });
  }
  const key = ctx.keyFor(interaction);
  const state = ctx.rouletteSessions.get(key);
  const parts = interaction.customId.split('|');
  const action = parts[1];
  const kittenMode = typeof ctx?.kittenModeEnabled === 'boolean'
    ? ctx.kittenModeEnabled
    : (typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false);
<<<<<<< HEAD
  const cancelAutoAck = scheduleInteractionAck(interaction, { timeout: ROULETTE_BUTTON_STALE_MS, mode: 'update' });
=======
>>>>>>> 4060006534002359355f885f429b8ca075370128
  let deferred = false;
  const deferUpdateOnce = async () => {
    if (!deferred && !interaction.deferred && !interaction.replied) {
      cancelAutoAck();
      await interaction.deferUpdate().catch(() => {});
      deferred = true;
    }
  };
<<<<<<< HEAD
  const respondEphemeral = async (payload = {}) => {
    cancelAutoAck();
    const base = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? { ...payload } : { content: String(payload || '') };
    if (!Object.prototype.hasOwnProperty.call(base, 'ephemeral')) base.ephemeral = true;
    if (deferred || interaction.deferred || interaction.replied) {
      if (typeof interaction.followUp === 'function') return interaction.followUp(base);
      if (typeof interaction.editReply === 'function') {
        const clone = { ...base };
        delete clone.ephemeral;
        return interaction.editReply(clone);
      }
    }
    return interaction.reply(base);
  };
  const updateMessage = (payload) => {
    cancelAutoAck();
    return ctx.sendGameMessage(interaction, payload, 'update');
  };
  if (action !== 'again') {
    if (ctx.hasActiveExpired(interaction.guild.id, interaction.user.id, 'roulette') || !ctx.getActiveSession(interaction.guild.id, interaction.user.id)) {
      ctx.rouletteSessions.delete(key);
      await deferUpdateOnce();
      return updateMessage({ content: `${emoji('hourglass')} This roulette session expired. Use \`/roulette\` to start a new one.`, embeds: [], components: [] });
    }
=======
  if (action !== 'again') {
    if (ctx.hasActiveExpired(interaction.guild.id, interaction.user.id, 'roulette') || !ctx.getActiveSession(interaction.guild.id, interaction.user.id)) {
      ctx.rouletteSessions.delete(key);
      return interaction.update({ content: `${emoji('hourglass')} This roulette session expired. Use `/roulette` to start a new one.`, embeds: [], components: [] });
    }
>>>>>>> 4060006534002359355f885f429b8ca075370128
    ctx.touchActiveSession(interaction.guild.id, interaction.user.id, 'roulette');
  }
  if (action === 'confirm') {
    if (!state || !state.bets?.length) return respondEphemeral({ content: '❌ No bets to confirm.' });
    const { chips, credits } = await ctx.getUserBalances(interaction.user.id);
    const total = state.bets.reduce((s,b)=>s+b.amount,0);
    if (chips + credits < total) {
      const msg = withInsufficientFundsTip('❌ Not enough funds.', kittenMode);
      return respondEphemeral({ content: msg });
    }
    // credits-first allocation
    let remH = chips, remC = credits;
    for (const b of state.bets) {
      b.creditPart = Math.min(b.amount, remC);
      remC -= b.creditPart;
      b.chipPart = b.amount - b.creditPart;
      remH -= b.chipPart;
      b.payoutMult = ctx.roulettePayoutMult(b.type);
    }
    const chipStake = state.bets.reduce((s,b)=>s+b.chipPart,0);
    const neededCover = chipStake + state.bets.reduce((s,b)=>s + (b.amount * b.payoutMult),0);
    if (await ctx.getHouseBalance() < neededCover) return respondEphemeral({ content: `❌ House cannot cover potential payout. Needed: **${ctx.chipsAmount(neededCover)}**.` });
    await deferUpdateOnce();
    if (chipStake>0) try {
      await ctx.takeFromUserToHouse(interaction.user.id, chipStake, 'roulette buy-in (chips)', interaction.user.id);
    } catch {
      return respondEphemeral({ content: '❌ Could not process buy-in.' });
    }
    const spin = ctx.spinRoulette();
    const colorEmoji = spin.color === 'RED'
      ? emoji('squareRed')
      : spin.color === 'BLACK'
        ? emoji('squareBlack')
        : emoji('squareGreen');
    const pocketLabel = spin.label;
    let winnings = 0;
    let creditsBurned = 0;
    const wins = [];
    for (const b of state.bets) {
      const won = ctx.rouletteWins(b.type, b.pocket, spin);
      if (won) { const w = b.amount * b.payoutMult; winnings += w; wins.push(b); }
      else {
        if (b.creditPart > 0) {
          try {
            await ctx.burnCredits(interaction.user.id, b.creditPart, `roulette loss (${b.type})`, null);
            creditsBurned += b.creditPart;
          } catch {}
        }
      }
    }
    const returnStake = wins.reduce((s,b)=>s+b.chipPart,0);
   const payout = winnings + returnStake;
    if (payout>0) {
      try {
        await ctx.transferFromHouseToUser(interaction.user.id, payout, 'roulette payout', null);
      } catch {
        return respondEphemeral({ content: '⚠️ Payout failed.' });
      }
    }
    const lines = [`${emoji('roulette')} Roulette Result: ${colorEmoji} **${pocketLabel}**`, ...state.bets.map(b=>`${wins.includes(b)?'✅ Win':'❌ Lose'}: ${b.type}${b.pocket!==undefined?` ${b.pocket}`:''} — **${ctx.chipsAmount(b.amount)}**`), `Total won: **${ctx.chipsAmount(winnings)}**`];
    if (creditsBurned > 0) {
      lines.push(`Credits burned: **${new Intl.NumberFormat('en-US').format(creditsBurned)}**`);
    }
    ctx.addHouseNet(interaction.guild.id, interaction.user.id, 'roulette', chipStake - payout);
    const net = payout - chipStake - creditsBurned;
    try { ctx.recordSessionGame(interaction.guild.id, interaction.user.id, net); } catch {}
    ctx.rouletteSessions.delete(key);
    const resultEmbed = new EmbedBuilder()
      .setTitle(`${emoji('roulette')} Roulette`)
      .setColor(winnings > 0 ? 0x57F287 : 0xED4245)
      .setDescription(lines.join('\n'));
    try {
      const { chips, credits } = await ctx.getUserBalances(interaction.user.id);
      const fmt = new Intl.NumberFormat('en-US');
      const sess = ctx.getActiveSession(interaction.guild.id, interaction.user.id);
      const sessLine = sess ? `Session: Games **${sess.games||0}** • Net **${(sess.playerNet||0)>=0?'+':'-'}${Math.abs(sess.playerNet||0).toLocaleString()} Chips**` : null;
      const val = [
        `Chips: **${ctx.chipsAmount(chips)}**`,
        `Credits: **${fmt.format(credits)}**`,
        sessLine
      ].filter(Boolean).join('\n');
      resultEmbed.addFields({ name: 'Player Balance', value: val });
      try { resultEmbed.addFields(ctx.buildTimeoutField(interaction.guild.id, interaction.user.id)); } catch {}
    } catch {}
    return updateMessage({ embeds: [resultEmbed], components: [ctx.rowButtons([{ id: `rou|again|${interaction.user.id}`, label: 'Play Again', style: 2 }])] });
  }
  if (action === 'cancel') {
    try {
      await ctx.endActiveSessionForUser(interaction, 'cancel');
    } catch {}
    return respondEphemeral({ content: '❌ Roulette session ended.' });
  }
  if (action === 'again') {
    const ownerId = parts[2];
    if (ownerId && ownerId !== interaction.user.id) {
      return respondEphemeral({ content: '❌ Only the original player can start again from this message.' });
    }
    await deferUpdateOnce();
    ctx.rouletteSessions.delete(key);
    ctx.rouletteSessions.set(key, { guildId: interaction.guild.id, userId: interaction.user.id, bets: [] });
    ctx.setActiveSession(interaction.guild.id, interaction.user.id, 'roulette', 'Roulette');
    return ctx.startRouletteSession(interaction);
  }
  return respondEphemeral({ content: '❌ Unknown action.' });
}
// Interaction: Roulette buttons (confirm/cancel/again)

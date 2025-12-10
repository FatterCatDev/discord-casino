import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getUserBalances, getHouseBalance, transferFromHouseToUser, takeFromUserToHouse, burnCredits } from '../db/db.auto.mjs';
import { makeDeck } from './cards.mjs';
import { chipsAmount, formatChips } from './format.mjs';
import { setActiveSession, addHouseNet, recordSessionGame, sendGameMessage, buildPlayerBalanceField, buildTimeoutField } from './session.mjs';
import { emoji } from '../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../lib/fundsTip.mjs';
import { applyEmbedThumbnail } from '../lib/assets.mjs';
import { renderBlackjackTableImage } from './blackjackTableImage.mjs';

export const blackjackGames = new Map();
export const BLACKJACK_ASSET = 'blackJack.png';

function buildBlackjackPayload(embedOrPayload, components) {
  const mainEmbed = embedOrPayload?.embed ?? embedOrPayload;
  const extraEmbeds = Array.isArray(embedOrPayload?.extraEmbeds)
    ? embedOrPayload.extraEmbeds.filter(Boolean)
    : [];
  const embeds = [];
  if (mainEmbed) embeds.push(mainEmbed);
  if (extraEmbeds.length) embeds.push(...extraEmbeds);
  const payload = {};
  if (embeds.length) payload.embeds = embeds;
  else if (Array.isArray(embedOrPayload?.embeds)) payload.embeds = embedOrPayload.embeds;
  else payload.embeds = [];
  const extraFiles = embedOrPayload?.files ?? [];
  if (components !== undefined) payload.components = components;
  if (extraFiles.length) {
    payload.files = extraFiles;
  }
  return payload;
}

// Compute hand total; treat Aces as 11 then reduce to avoid busting
export function bjHandValue(cards) {
  let total = 0; let aces = 0;
  for (const c of cards) { if (c.r === 'A') { aces++; total += 11; } else if (['K','Q','J','10'].includes(c.r)) total += 10; else total += Number(c.r); }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = aces > 0;
  return { total, soft };
}
// Helper: normalized value for split checks
export function cardValueForSplit(card) { if (card.r === 'A') return 11; if (['10','J','Q','K'].includes(card.r)) return 10; return Number(card.r); }
// Check if user can afford an additional stake
export async function canAffordExtra(guildId, userId, amount) {
  const { credits, chips } = await getUserBalances(guildId, userId);
  return (credits + chips) >= amount;
}

// Build the current Blackjack UI embed
export async function bjEmbed(state, opts = {}) {
  const { title = `${emoji('chipAce')} Blackjack`, color = 0x2b2d31, footer } = opts;
  const e = new EmbedBuilder().setTitle(title).setColor(color);
  e.addFields(
    { name: `${emoji('slots')} Table`, value: `${state.table}`, inline: true },
    { name: `${emoji('coin')} Bet`, value: `**${chipsAmount(state.bet)}**`, inline: true }
  );
  if (footer) {
    e.setDescription(footer);
  }
  let attachments = [];
  try {
    const buffer = await renderBlackjackTableImage(state);
    if (buffer?.length) {
      const fileName = `blackjack-table-${state.userId || 'player'}.png`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });
      attachments.push(attachment);
      e.setImage(`attachment://${fileName}`);
    }
  } catch (err) {
    console.error('Failed to render blackjack image', err);
  }
  const thumbAttachment = applyEmbedThumbnail(e, BLACKJACK_ASSET);
  if (thumbAttachment) {
    attachments.push(thumbAttachment);
  }
  const extraEmbeds = [];
  const statsEmbed = new EmbedBuilder().setColor(color);
  let statsFieldCount = 0;
  try {
    const balanceField = await buildPlayerBalanceField(state.guildId, state.userId);
    if (balanceField) {
      statsEmbed.addFields(balanceField);
      statsFieldCount += 1;
    }
  } catch (err) {
    console.error('Failed to build blackjack player balance field', err);
  }
  try {
    const timeoutField = buildTimeoutField(state.guildId, state.userId);
    if (timeoutField) {
      statsEmbed.addFields(timeoutField);
      statsFieldCount += 1;
    }
  } catch (err) {
    console.error('Failed to build blackjack timeout field', err);
  }
  if (statsFieldCount > 0) {
    extraEmbeds.push(statsEmbed);
  }
  return { embed: e, extraEmbeds, files: attachments };
}

export function bjPlayAgainRow(table, bet, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj|again|${table}|${bet}|${userId}`)
      .setLabel(`Play Again (${formatChips(bet)})`)
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bj|change|${table}|${bet}|${userId}`)
      .setLabel('Play Again (Change Bet)')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function startBlackjack(interaction, table, bet) {
  if (!interaction.guild) {
    const payload = { content: '❌ Blackjack tables are only available inside servers.', ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        if (typeof interaction.followUp === 'function') return interaction.followUp(payload);
        return interaction.reply(payload);
      }
      return interaction.reply(payload);
    } catch {
      return;
    }
  }
  const k = `${interaction.guild.id}:${interaction.user.id}`;
  if (blackjackGames.has(k)) return interaction.reply({ content: '❌ You already have an active Blackjack hand. Finish it first.', ephemeral: true });
  if (table === 'HIGH') { if (bet < 1000) return interaction.reply({ content: '❌ High table minimum is 1000.', ephemeral: true }); }
  else if (table === 'LOW') { if (bet > 999) return interaction.reply({ content: '❌ Low table maximum is 999.', ephemeral: true }); }
  else return interaction.reply({ content: '❌ Invalid table.', ephemeral: true });

  const guildId = interaction.guild?.id;
  const { chips, credits } = await getUserBalances(guildId, interaction.user.id);
  const total = chips + credits;
  if (total < bet) {
    const fmt = new Intl.NumberFormat('en-US');
    const base = `❌ Not enough funds. Credits: **${fmt.format(credits)}**, Chips: **${chipsAmount(chips)}**. Need: **${chipsAmount(bet)}**.`;
    return interaction.reply({ content: withInsufficientFundsTip(base), ephemeral: true });
  }
  const cover = await getHouseBalance(guildId);
  // Credits-first staking
  const creditStake = Math.min(bet, credits); const chipStake = bet - creditStake; const neededCover = chipStake + (bet * 2);
  if (cover < neededCover) return interaction.reply({ content: `❌ House cannot cover potential payout. Needed cover: **${formatChips(neededCover)}**.`, ephemeral: true });
  if (chipStake > 0) { try { await takeFromUserToHouse(guildId, interaction.user.id, chipStake, 'blackjack buy-in (chips)', interaction.user.id); } catch { return interaction.reply({ content: '❌ Could not process buy-in.', ephemeral: true }); } }

  const deck = makeDeck();
  const state = { guildId: interaction.guild.id, userId: interaction.user.id, table, bet, creditsStake: creditStake, chipsStake: chipStake, deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], finished: false, revealed: false };
  blackjackGames.set(k, state);
  setActiveSession(interaction.guild.id, interaction.user.id, 'blackjack', 'Blackjack');

  const p = bjHandValue(state.player); const d = bjHandValue(state.dealer);
  const playerBJ = (p.total === 21 && state.player.length === 2); const dealerBJ = (d.total === 21 && state.dealer.length === 2);
  if (playerBJ || dealerBJ) {
    state.revealed = true; blackjackGames.delete(k);
    if (playerBJ && dealerBJ) {
      try {
        if (state.chipsStake > 0) {
          await transferFromHouseToUser(state.guildId, state.userId, state.chipsStake, 'blackjack push (both BJ)', null);
        }
        addHouseNet(state.guildId, state.userId, 'blackjack', 0);
        try { recordSessionGame(state.guildId, state.userId, 0); } catch {}
        const row = bjPlayAgainRow(state.table, state.bet, state.userId);
        return sendGameMessage(interaction, buildBlackjackPayload(await bjEmbed(state, { footer: 'Push. Your stake was returned.', color: 0x2b2d31 }), [row]));
      } catch { return interaction.reply({ content: '⚠️ Settlement failed.', ephemeral: true }); }
    }
    if (playerBJ) {
      const win = Math.floor(bet * 1.5);
      try {
        const payout = state.chipsStake + win;
        await transferFromHouseToUser(state.guildId, state.userId, payout, 'blackjack natural', null);
        addHouseNet(state.guildId, state.userId, 'blackjack', -win);
        try { recordSessionGame(state.guildId, state.userId, win); } catch {}
        const row = bjPlayAgainRow(state.table, state.bet, state.userId);
        return sendGameMessage(interaction, buildBlackjackPayload(await bjEmbed(state, { footer: `Natural! You win ${chipsAmount(win)}.`, color: 0x57F287 }), [row]));
      } catch { return interaction.reply({ content: '⚠️ Payout failed.', ephemeral: true }); }
    }
    try {
      if (state.creditsStake > 0) {
        await burnCredits(state.guildId, state.userId, state.creditsStake, 'blackjack loss (dealer BJ)', null);
      }
      addHouseNet(state.guildId, state.userId, 'blackjack', state.chipsStake);
      try { recordSessionGame(state.guildId, state.userId, -state.chipsStake); } catch {}
      const row = bjPlayAgainRow(state.table, state.bet, state.userId);
      return sendGameMessage(interaction, buildBlackjackPayload(await bjEmbed(state, { footer: 'Dealer Blackjack. You lose.', color: 0xED4245 }), [row]));
    } catch { return interaction.reply({ content: '⚠️ Settle failed.', ephemeral: true }); }
  }
  const firstDecision = state.player.length === 2;
  const actions = [
    { id: 'bj|hit', label: 'Hit', style: ButtonStyle.Primary, emoji: '➕' },
    { id: 'bj|stand', label: 'Stand', style: ButtonStyle.Secondary, emoji: '✋' }
  ];
// Game: Blackjack — stateful hand play, settlement, and UI (Credits-first).
  if (firstDecision && await canAffordExtra(state.guildId, state.userId, state.bet)) actions.push({ id: 'bj|double', label: 'Double', style: ButtonStyle.Success, emoji: emoji('doubleArrow') });
  if (firstDecision) {
    const v1 = cardValueForSplit(state.player[0]);
    const v2 = cardValueForSplit(state.player[1]);
    if (v1 === v2 && await canAffordExtra(state.guildId, state.userId, state.bet)) actions.push({ id: 'bj|split', label: 'Split', style: ButtonStyle.Secondary, emoji: emoji('scissors') });
  }
  const row = new ActionRowBuilder().addComponents(...actions.map(({ id, label, style, emoji: icon }) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setEmoji(icon)));
  return sendGameMessage(interaction, buildBlackjackPayload(await bjEmbed(state), [row]));
}

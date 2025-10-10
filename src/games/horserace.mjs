import { randomUUID } from 'node:crypto';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  getUserBalances,
  getHouseBalance,
  burnCredits,
  takeFromUserToHouse,
  transferFromHouseToUser,
  grantCredits
} from '../db/db.auto.mjs';
import { formatChips } from './format.mjs';

const TRACK_LENGTH = 10;
const STAGE_COUNT = 5;
const STAGE_DELAY_MS = 5_000;
const START_COUNTDOWN_SEC = 5;
const PAYOUT_MULTIPLIER = 4;
const BET_CHANGE_PERCENT = 0.2;
const HORSE_LABELS = ['🟥 Horse 1', '🟩 Horse 2', '🟨 Horse 3', '🟦 Horse 4', '🟪 Horse 5'];

const racesById = new Map();
const racesByChannel = new Map();
const racesByMessage = new Map();

function createEmptyState(ctx, interaction) {
  const raceId = randomUUID();
  return {
    id: raceId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    hostId: interaction.user.id,
    ctx,
    stage: 0,
    stageDeadline: null,
    progress: [0, 0, 0, 0, 0],
    bets: new Map(),
    totalPot: 0,
    totalExposure: 0,
    status: 'betting',
    messageId: null,
    timeout: null,
    countdown: null,
    hostConfirm: false
  };
}

function renderTrack(progress) {
  const filled = '■'.repeat(progress);
  const empty = '░'.repeat(Math.max(0, TRACK_LENGTH - progress));
  return `${filled}${empty}`;
}

function buildHorseLine(index, progress) {
  const label = HORSE_LABELS[index];
  return `${label} — 🐎 │${renderTrack(progress)}│ (${progress}/${TRACK_LENGTH})`;
}

function summarizeBets(state) {
  if (!state.bets.size) return 'No bets yet. Use **Bet** to enter the race!';
  const entries = Array.from(state.bets.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map(bet => `<@${bet.userId}> → Horse ${bet.horse + 1} for **${formatChips(bet.amount)}**`);
  return entries.join('\n');
}

function createRaceEmbed(state, options = {}) {
  const title = state.status === 'running'
    ? `🏇 Horse Race — Stage ${state.stage}/${STAGE_COUNT}`
    : '🏇 Horse Race — Betting Stage';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(HORSE_LABELS.map((_, idx) => buildHorseLine(idx, state.progress[idx])).join('\n'))
    .addFields(
      { name: '💰 Pot', value: `${formatChips(state.totalPot)} chips`, inline: true },
      { name: '🎯 Exposure', value: `${formatChips(state.totalExposure)} chips`, inline: true },
      { name: '🏁 Bets', value: summarizeBets(state) }
    )
    .setFooter({ text: options.footerText || 'Place or change bets within 5 seconds of each stage.' });
  return embed;
}

function buildComponents(state) {
  const bettingOpen = state.status === 'betting';
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`horse|bet|${state.id}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel('Bet')
      .setDisabled(!bettingOpen),
    new ButtonBuilder()
      .setCustomId(`horse|cancel|${state.id}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('Cancel')
      .setDisabled(!bettingOpen)
  ];

  if (bettingOpen && !state.hostConfirm) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`horse|confirm|${state.id}`)
        .setStyle(ButtonStyle.Success)
        .setLabel('Start Race')
        .setDisabled(state.bets.size === 0)
    );
  }

  const row = new ActionRowBuilder().addComponents(buttons);
  return [row];
}

function storeRace(state, messageId) {
  state.messageId = messageId;
  racesById.set(state.id, state);
  racesByChannel.set(state.channelId, state);
  racesByMessage.set(messageId, state);
}

function clearRace(state) {
  if (!state) return;
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  racesById.delete(state.id);
  racesByChannel.delete(state.channelId);
  if (state.messageId) racesByMessage.delete(state.messageId);
}

async function editRaceMessage(state, client, options = {}) {
  try {
    const channel = await client.channels.fetch(state.channelId);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(state.messageId);
    await message.edit({ embeds: [createRaceEmbed(state, options)], components: buildComponents(state) });
  } catch (err) {
    console.error('Failed to edit horse race message:', err);
  }
}

function ensureWinner(state) {
  const maxProgress = Math.max(...state.progress);
  const leaders = state.progress.map((val, idx) => ({ val, idx }))
    .filter(item => item.val === maxProgress)
    .sort((a, b) => a.idx - b.idx);
  if (maxProgress >= TRACK_LENGTH) {
    const winners = leaders.map(item => item.idx);
    return winners;
  }
  const winner = leaders[0];
  state.progress[winner.idx] = TRACK_LENGTH;
  return [winner.idx];
}

async function payoutRace(state, winners, client) {
  const payouts = [];
  const losers = [];
  for (const bet of state.bets.values()) {
    if (winners.includes(bet.horse)) {
      const winnings = bet.amount * PAYOUT_MULTIPLIER;
      try {
        await transferFromHouseToUser(state.guildId, bet.userId, winnings, 'horse race win', null);
        payouts.push({ userId: bet.userId, amount: winnings });
      } catch (err) {
        console.error('Failed to pay horse race winnings for', bet.userId, err);
      }
    } else {
      losers.push(bet);
    }
  }

  const channel = await client.channels.fetch(state.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const winnerLines = winners.map(idx => HORSE_LABELS[idx]).join(', ');
  const resultEmbed = new EmbedBuilder()
    .setTitle('🏁 Horse Race Results')
    .setDescription(HORSE_LABELS.map((_, idx) => buildHorseLine(idx, state.progress[idx])).join('\n'))
    .addFields(
      { name: '🥇 Winning Horse(s)', value: winnerLines },
      { name: '💰 Payouts', value: payouts.length ? payouts.map(p => `<@${p.userId}> won **${formatChips(p.amount)}**`).join('\n') : 'No winners this time.' }
    )
    .setFooter({ text: 'Thanks for playing!' });

  await channel.send({ embeds: [resultEmbed] }).catch(() => {});
}

function computeExposure(state, replacingUserId, newAmount) {
  let exposure = 0;
  for (const bet of state.bets.values()) {
    if (bet.userId === replacingUserId) continue;
    exposure += bet.amount * PAYOUT_MULTIPLIER;
  }
  exposure += newAmount * PAYOUT_MULTIPLIER;
  return exposure;
}

async function collectFromUser(state, userId, amount, reason) {
  if (amount <= 0) return { creditsBurned: 0, chipsStaked: 0 };
  const balances = await getUserBalances(state.guildId, userId);
  const creditsToBurn = Math.min(amount, balances.credits);
  const chipsNeeded = amount - creditsToBurn;
  let creditsBurned = 0;
  let chipsStaked = 0;
  if (creditsToBurn > 0) {
    await burnCredits(state.guildId, userId, creditsToBurn, reason, userId);
    creditsBurned = creditsToBurn;
  }
  if (chipsNeeded > 0) {
    await takeFromUserToHouse(state.guildId, userId, chipsNeeded, reason, userId);
    chipsStaked = chipsNeeded;
  }
  return { creditsBurned, chipsStaked };
}

async function refundToUser(state, userId, creditsAmount, chipsAmount, reason) {
  if (creditsAmount > 0) {
    await grantCredits(state.guildId, userId, creditsAmount, reason, null);
  }
  if (chipsAmount > 0) {
    await transferFromHouseToUser(state.guildId, userId, chipsAmount, reason, null);
  }
}

async function advanceStage(state, client) {
  if (state.status !== 'running') return;
  state.stage += 1;
  // Random advance for first STAGE_COUNT - 1 stages
  if (state.stage <= STAGE_COUNT) {
    for (let i = 0; i < state.progress.length; i += 1) {
      const advance = Math.floor(Math.random() * 4); // 0-3
      state.progress[i] = Math.min(TRACK_LENGTH, state.progress[i] + advance);
    }
  }

  let winners = [];
  if (state.stage >= STAGE_COUNT) {
    winners = ensureWinner(state);
    state.status = 'finished';
  }

  const footer = state.status === 'finished'
    ? 'Race finished!'
    : 'Next stage in 5 seconds — adjust bets now!';

  await editRaceMessage(state, client, { footerText: footer, disableButtons: state.status !== 'running' });

  if (state.status === 'finished') {
    clearRace(state);
    await payoutRace(state, winners, client);
  } else {
    state.stageDeadline = Date.now() + STAGE_DELAY_MS;
    state.timeout = setTimeout(() => {
      advanceStage(state, client).catch(err => console.error('Horse race advance error:', err));
    }, STAGE_DELAY_MS);
  }
}

export function getRaceById(raceId) {
  return racesById.get(raceId);
}

export function getRaceByMessage(messageId) {
  return racesByMessage.get(messageId);
}

export function getRaceByChannel(channelId) {
  return racesByChannel.get(channelId);
}

export async function createHorseRace(interaction, ctx) {
  if (racesByChannel.has(interaction.channelId)) {
    return interaction.reply({ content: '❌ A horse race is already running in this channel.', ephemeral: true });
  }

  const state = createEmptyState(ctx, interaction);
  const embed = createRaceEmbed(state, { footerText: 'Race will begin in 5 seconds. Place your bets!' });
  const message = await interaction.reply({ embeds: [embed], components: buildComponents(state), fetchReply: true });
  storeRace(state, message.id);

  state.timeout = setTimeout(() => {
    advanceStage(state, interaction.client).catch(err => console.error('Horse race advance error:', err));
  }, STAGE_DELAY_MS);

  return state;
}

export async function handleHorseBet(interaction, state, horseIndex, amount) {
  if (state.status !== 'running') {
    return interaction.reply({ content: '❌ The race is not accepting bets right now.', ephemeral: true });
  }
  if (horseIndex < 0 || horseIndex >= HORSE_LABELS.length) {
    return interaction.reply({ content: '❌ Choose a horse between 1 and 5.', ephemeral: true });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: '❌ Bet amount must be a positive integer.', ephemeral: true });
  }

  const betKey = interaction.user.id;
  const existing = state.bets.get(betKey);
  const originalAmount = existing ? existing.originalAmount : amount;
  if (existing && amount !== originalAmount) {
    return interaction.reply({ content: `❌ Keep your stake at **${formatChips(originalAmount)}**. Bet changes only swap horses and incur a fee.`, ephemeral: true });
  }
  const fee = existing ? Math.ceil(originalAmount * BET_CHANGE_PERCENT) : 0;

  const newExposure = computeExposure(state, betKey, amount);
  const houseBalance = await getHouseBalance(state.guildId);
  if (houseBalance < newExposure) {
    return interaction.reply({ content: '❌ The house cannot cover that wager right now. Try a smaller bet.', ephemeral: true });
  }

  let creditsBurned = 0;
  let chipsStaked = 0;
  let feeCredits = 0;
  let feeChips = 0;

  try {
    if (!existing) {
      const collected = await collectFromUser(state, betKey, amount, 'horse race bet');
      creditsBurned = collected.creditsBurned;
      chipsStaked = collected.chipsStaked;
    }

    if (fee > 0) {
      const collectedFee = await collectFromUser(state, betKey, fee, 'horse race bet change fee');
      feeCredits = collectedFee.creditsBurned;
      feeChips = collectedFee.chipsStaked;
    }
  } catch (err) {
    console.error('Horse race bet collection failed:', err);
    return interaction.reply({ content: '❌ Could not process your bet. Do you have enough Credits/Chips?', ephemeral: true });
  }

  const betData = existing || {
    userId: betKey,
    originalAmount: amount,
    creditsBurned: 0,
    chipsStaked: 0,
    feesPaidCredits: 0,
    feesPaidChips: 0,
    changes: 0
  };

  betData.amount = originalAmount;
  betData.horse = horseIndex;
  betData.creditsBurned += creditsBurned;
  betData.chipsStaked += chipsStaked;
  betData.feesPaidCredits += feeCredits;
  betData.feesPaidChips += feeChips;
  if (existing) betData.changes += 1;

  state.bets.set(betKey, betData);
  state.totalPot = Array.from(state.bets.values()).reduce((sum, bet) => sum + bet.amount, 0);
  state.totalExposure = Array.from(state.bets.values()).reduce((sum, bet) => sum + bet.amount * PAYOUT_MULTIPLIER, 0);

  await interaction.reply({ content: `✅ Bet locked: Horse ${horseIndex + 1} for **${formatChips(amount)}**${fee > 0 ? ` (fee ${formatChips(fee)})` : ''}.`, ephemeral: true });
  await editRaceMessage(state, interaction.client, { footerText: 'Next stage in 5 seconds — adjust bets now!' });
}

export async function handleRaceCancel(interaction, state) {
  const isHost = interaction.user.id === state.hostId;
  let isModerator = false;
  try {
    isModerator = await state.ctx.isModerator(interaction);
  } catch {
    isModerator = false;
  }
  if (!isHost && !isModerator) {
    return interaction.reply({ content: '❌ Only the race host or moderators can cancel this race.', ephemeral: true });
  }

  state.status = 'cancelled';
  clearRace(state);

  // Refund all bets fully (including fees)
  for (const bet of state.bets.values()) {
    const totalCredits = bet.creditsBurned + bet.feesPaidCredits;
    const totalChips = bet.chipsStaked + bet.feesPaidChips;
    try {
      await refundToUser(state, bet.userId, totalCredits, totalChips, 'horse race cancelled');
    } catch (err) {
      console.error('Horse race refund failed for', bet.userId, err);
    }
  }

  await editRaceMessage(state, interaction.client, { footerText: 'Race cancelled.', disableButtons: true });
  await interaction.reply({ content: '🛑 Race cancelled. All bets have been refunded.', ephemeral: true });
}

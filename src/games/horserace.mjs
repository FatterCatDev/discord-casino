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
import { formatChips, chipsAmountSigned } from './format.mjs';
import { postGameSessionEnd, postGameSessionEndByIds } from './logging.mjs';

const TRACK_LENGTH = 100;
const STAGE_COUNT = 10;
const STAGE_DELAY_MS = 2_500;
const START_COUNTDOWN_SEC = 5;
const PAYOUT_MULTIPLIER = 4;
const HORSE_LABELS = ['Horse 1', 'Horse 2', 'Horse 3', 'Horse 4', 'Horse 5'];
const HORSE_EMOJIS = ['🟥', '🟩', '🟨', '🟦', '🟪'];
const INITIAL_FOOTER_TEXT = 'Place your bets! Host must press Start to begin the countdown.';
const DEFAULT_STAGE_FOOTER_TEXT = 'Place or change bets within 2.5 seconds of each stage.';
const NOTICE_DURATION_MS = 4_000;
const RACE_TIMEOUT_MS = 2 * 60 * 1_000;

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
    hostConfirm: false,
    lastResultsText: null,
    noticeText: null,
    noticeTimeout: null,
    idleTimeout: null,
    extraDescription: null,
    footerText: INITIAL_FOOTER_TEXT
  };
}

async function acknowledgeInteraction(interaction) {
  if (!interaction || interaction.deferred || interaction.replied) return;
  try {
    if (typeof interaction.deferUpdate === 'function') {
      await interaction.deferUpdate();
    } else if (typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply().catch(() => {});
    }
  } catch {}
}

const DISPLAY_TRACK_LENGTH = 20;
const TRACK_LINE_WIDTH = 70;

function renderTrack(progress) {
  const ratio = progress / TRACK_LENGTH;
  const filledTicks = Math.min(DISPLAY_TRACK_LENGTH, Math.max(0, Math.round(DISPLAY_TRACK_LENGTH * ratio)));
  const emptyTicks = DISPLAY_TRACK_LENGTH - filledTicks;
  return `${'■'.repeat(filledTicks)}${'░'.repeat(emptyTicks)}`;
}

function buildHorseLine(index, progress) {
  const label = `${HORSE_EMOJIS[index]} ${HORSE_LABELS[index]}`;
  const progressText = `${progress}/${TRACK_LENGTH}`;
  const left = `${label.padEnd(12)} ${progressText.padStart(8)}`;
  const track = `│${renderTrack(progress)}│`;
  const spaces = ' '.repeat(Math.max(1, TRACK_LINE_WIDTH - left.length - track.length));
  return `${left}${spaces}${track}`;
}

function summarizeBets(state) {
  if (!state.bets.size) return 'No bets yet. Use **Bet** to enter the race!';
  const entries = Array.from(state.bets.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map(bet => {
      const changeFee = getBetChangeFee(state, bet);
      const feeText = changeFee > 0 ? formatChips(changeFee) : 'Free';
      return `<@${bet.userId}> → Horse ${bet.horse + 1} for **${formatChips(bet.amount)}** (change fee: ${feeText})`;
    });
  return entries.join('\n');
}

function getBetChangeFee(state, bet) {
  if (!bet) return 0;
  if (state.status !== 'running') return 0;
  return Math.ceil(bet.originalAmount * Math.max(1, state.stage / 2));
}

function calculateHouseTotals(state, payouts = []) {
  let chipsCollected = 0;
  let creditsBurned = 0;
  for (const bet of state.bets.values()) {
    chipsCollected += (bet.chipsStaked || 0) + (bet.feesPaidChips || 0);
    creditsBurned += (bet.creditsBurned || 0) + (bet.feesPaidCredits || 0);
  }
  const chipsPaid = payouts.reduce((sum, payout) => sum + (payout.amount || 0), 0);
  return {
    chipsCollected,
    creditsBurned,
    chipsPaid,
    houseNet: chipsCollected - chipsPaid
  };
}

function createRaceEmbed(state, options = {}) {
  let title;
  if (state.status === 'running') {
    title = `🏇 Horse Race — Stage ${state.stage}/${STAGE_COUNT}`;
  } else if (state.status === 'countdown') {
    title = '🏇 Horse Race — Countdown';
  } else if (state.status === 'finished') {
    title = '🏇 Horse Race — Finished';
  } else if (state.status === 'cancelled') {
    title = '🏇 Horse Race — Cancelled';
  } else if (state.status === 'timedout') {
    title = '🏇 Horse Race — Timed Out';
  } else {
    title = '🏇 Horse Race — Betting Stage';
  }

  const trackLines = HORSE_LABELS.map((_, idx) => buildHorseLine(idx, state.progress[idx]));
  let description = '```\n' + trackLines.join('\n') + '\n```';
  let baseExtra;
  if (options.extraDescription !== undefined) {
    baseExtra = options.extraDescription;
  } else if (state.extraDescription != null) {
    baseExtra = state.extraDescription;
  } else if (state.lastResultsText) {
    baseExtra = state.lastResultsText;
  }
  if (baseExtra) {
    description += `\n${baseExtra}`;
  }

  const includeNotice = options.includeNotice ?? true;
  if (includeNotice && state.noticeText) {
    const notice = state.noticeText.trim();
    if (notice && (!baseExtra || !baseExtra.includes(notice))) {
      description += `\n${notice}`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: '💰 Pot', value: `${formatChips(state.totalPot)} chips`, inline: true },
      { name: '🎯 Exposure', value: `${formatChips(state.totalExposure)} chips`, inline: true },
      { name: '🏁 Bets', value: summarizeBets(state) }
    )
    .setFooter({ text: options.footerText ?? state.footerText ?? DEFAULT_STAGE_FOOTER_TEXT });
  return embed;
}

function buildComponents(state) {
  if (state.status === 'cancelled' || state.status === 'timedout') return [];

  const horseButtons = HORSE_LABELS.map((label, idx) => new ButtonBuilder()
    .setCustomId(`horse|pick|${state.id}|${idx}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(String(idx + 1))
    .setEmoji(HORSE_EMOJIS[idx] || null)
    .setDisabled(state.status === 'countdown'));

  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(horseButtons.slice(0, 3)));
  rows.push(new ActionRowBuilder().addComponents(horseButtons.slice(3)));

  if (state.status === 'betting') {
    const controls = [];
    controls.push(
      new ButtonBuilder()
        .setCustomId(`horse|cancel|${state.id}`)
        .setStyle(ButtonStyle.Danger)
        .setLabel('Cancel Race')
    );
    controls.push(
      new ButtonBuilder()
        .setCustomId(`horse|confirm|${state.id}`)
        .setStyle(ButtonStyle.Success)
        .setLabel('Start Race')
        .setDisabled(state.hostConfirm || state.bets.size === 0)
    );
    rows.push(new ActionRowBuilder().addComponents(controls));
  } else if (state.status === 'countdown') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`horse|cancel|${state.id}`)
        .setStyle(ButtonStyle.Danger)
        .setLabel('Cancel Race'),
      new ButtonBuilder()
        .setCustomId(`horse|confirm|${state.id}`)
        .setStyle(ButtonStyle.Success)
        .setLabel('Start Race')
        .setDisabled(true)
    ));
  }

  return rows;
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
  if (state.countdown) {
    clearTimeout(state.countdown);
    state.countdown = null;
  }
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
  clearRaceIdleTimer(state);
  state.noticeText = null;
  state.extraDescription = null;
  racesById.delete(state.id);
  racesByChannel.delete(state.channelId);
  if (state.messageId) racesByMessage.delete(state.messageId);
}

async function editRaceMessage(state, client, options = {}) {
  try {
    if (options.footerText !== undefined) {
      state.footerText = options.footerText ?? null;
    }
    if (options.extraDescription !== undefined) {
      state.extraDescription = options.extraDescription;
    }
    const channel = await client.channels.fetch(state.channelId);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(state.messageId);
    await message.edit({ embeds: [createRaceEmbed(state, options)], components: buildComponents(state) });
  } catch (err) {
    console.error('Failed to edit horse race message:', err);
  }
}

function clearRaceIdleTimer(state) {
  if (state.idleTimeout) {
    clearTimeout(state.idleTimeout);
    state.idleTimeout = null;
  }
}

function refreshRaceTimeout(state, client) {
  clearRaceIdleTimer(state);
  if (!client) return;
  if (state.status !== 'betting') return;
  state.idleTimeout = setTimeout(() => {
    handleRaceTimeout(state, client).catch(err => console.error('Horse race timeout error:', err));
  }, RACE_TIMEOUT_MS);
}

async function showRaceNotice(state, client, text, duration = NOTICE_DURATION_MS) {
  if (!state || !client) return;
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
  state.noticeText = text;
  try {
    await editRaceMessage(state, client);
  } catch (err) {
    console.error('Failed to show horse race notice:', err);
  }

  refreshRaceTimeout(state, client);

  if (duration > 0) {
    state.noticeTimeout = setTimeout(() => {
      if (state.noticeText !== text) return;
      state.noticeTimeout = null;
      state.noticeText = null;
      editRaceMessage(state, client).catch(err => console.error('Failed to clear horse race notice:', err));
    }, duration);
  }
}

async function handleRaceTimeout(state, client) {
  if (!state || !client) return;
  if (!(state.status === 'betting')) return;
  clearRaceIdleTimer(state);
  state.status = 'timedout';
  state.hostConfirm = false;
  state.noticeText = null;
  state.lastResultsText = null;
  const timeoutDescription = '⌛ This horse race timed out after 2 minutes of inactivity. All stakes have been refunded.\nUse `/horserace` to start a new game.';

  // Refund all stakes and fees
  for (const bet of state.bets.values()) {
    const totalCredits = bet.creditsBurned + bet.feesPaidCredits;
    const totalChips = bet.chipsStaked + bet.feesPaidChips;
    try {
      if (totalCredits > 0 || totalChips > 0) {
        await refundToUser(state, bet.userId, totalCredits, totalChips, 'horse race timed out');
      }
    } catch (err) {
      console.error('Horse race timeout refund failed for', bet.userId, err);
    }
  }

  state.progress = [0, 0, 0, 0, 0];
  state.stage = 0;
  state.stageDeadline = null;
  state.bets = new Map();
  state.totalPot = 0;
  state.totalExposure = 0;
  state.extraDescription = timeoutDescription;
  state.footerText = 'Race expired. Use /horserace to try again.';

  await editRaceMessage(state, client, {
    footerText: state.footerText,
    extraDescription: timeoutDescription,
    includeNotice: false
  });

  try {
    await postGameSessionEndByIds(client, state.guildId, state.hostId, { game: 'Horse Race', houseNet: 0 });
  } catch (err) {
    console.error('Horse race timeout log failed:', err);
  }

  clearRace(state);
}

function ensureWinner(state) {
  const maxProgress = Math.max(...state.progress);
  const leaders = state.progress.map((val, idx) => ({ val, idx }))
    .filter(item => item.val >= TRACK_LENGTH)
    .sort((a, b) => b.val - a.val || a.idx - b.idx);

  if (leaders.length > 0) {
    const topValue = leaders[0].val;
    const tied = leaders.filter(item => item.val === topValue);
    if (tied.length === 1) return [tied[0].idx];
    return tied.sort((a, b) => a.idx - b.idx).map(item => item.idx);
  }

  const maxBelow = Math.max(...state.progress);
  const leader = state.progress.findIndex(val => val === maxBelow);
  if (leader >= 0) state.progress[leader] = TRACK_LENGTH;
  return [leader];
}

async function payoutRace(state, winners, client) {
  clearRaceIdleTimer(state);
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
  state.noticeText = null;
  const payouts = [];
  const tieCount = winners.length;
  let multiplier = PAYOUT_MULTIPLIER;
  if (tieCount === 2) {
    multiplier = Math.max(1, Math.floor(PAYOUT_MULTIPLIER / 2));
  } else if (tieCount >= 3) {
    multiplier = 1;
  }
  for (const bet of state.bets.values()) {
    if (winners.includes(bet.horse)) {
      const winnings = bet.amount * multiplier;
      try {
        await transferFromHouseToUser(state.guildId, bet.userId, winnings, 'horse race win', null);
        payouts.push({ userId: bet.userId, amount: winnings });
      } catch (err) {
        console.error('Failed to pay horse race winnings for', bet.userId, err);
      }
    }
  }
  const totals = calculateHouseTotals(state, payouts);
  const winnerLines = winners.map(idx => HORSE_LABELS[idx]).join(', ');
  const tieNote = tieCount >= 3
    ? '\n(Tie of 3+ horses — stakes refunded)'
    : tieCount === 2
      ? '\n(Tie of 2 horses — payouts halved)'
      : '';
  const houseNetLine = `\n**🏦 House Net:** ${chipsAmountSigned(totals.houseNet)}`;
  const creditsBurnedLine = totals.creditsBurned > 0
    ? `\n**💳 Credits Burned:** ${formatChips(totals.creditsBurned)} Credits`
    : '';
  const resultsText = `**🥇 Winners:** ${winnerLines}\n${payouts.length ? payouts.map(p => `<@${p.userId}> won **${formatChips(p.amount)}**`).join('\n') : 'No winners this time.'}${tieNote}${houseNetLine}${creditsBurnedLine}`;
  state.lastResultsText = resultsText;
  state.status = 'finished';
  await editRaceMessage(state, client, {
    footerText: 'Race finished! Showing results in 3 seconds...',
    extraDescription: resultsText
  });
  try {
    await postGameSessionEndByIds(client, state.guildId, state.hostId, { game: 'Horse Race', houseNet: totals.houseNet });
  } catch (err) {
    console.error('Horse race results log failed:', err);
  }
  setTimeout(async () => {
    try {
      resetRaceState(state);
      await editRaceMessage(state, client, {
        footerText: INITIAL_FOOTER_TEXT,
        extraDescription: null
      });
      refreshRaceTimeout(state, client);
    } catch (err) {
      console.error('Failed to render final horse race results:', err);
    }
  }, 3_000);
}

function resetRaceState(state) {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  if (state.countdown) {
    clearTimeout(state.countdown);
    state.countdown = null;
  }
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
  clearRaceIdleTimer(state);
  state.stage = 0;
  state.stageDeadline = null;
  state.progress = [0, 0, 0, 0, 0];
  state.bets = new Map();
  state.totalPot = 0;
  state.totalExposure = 0;
  state.status = 'betting';
  state.hostConfirm = false;
  state.noticeText = null;
  state.extraDescription = null;
  state.footerText = INITIAL_FOOTER_TEXT;
}

async function startCountdown(state, client) {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  if (state.countdown) {
    clearTimeout(state.countdown);
    state.countdown = null;
  }
  state.lastResultsText = null;
  clearRaceIdleTimer(state);
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
  state.noticeText = null;
  state.status = 'countdown';
  let remaining = START_COUNTDOWN_SEC;

  const tick = async () => {
    if (state.status !== 'countdown') return;
    await editRaceMessage(state, client, {
      footerText: `🚦 Race starts in ${Math.max(0, remaining)}s!`,
      extraDescription: `**🚨 COUNTDOWN: ${Math.max(0, remaining)}s**`
    });

    if (remaining <= 0) {
      state.countdown = null;
      state.status = 'running';
      state.stage = 0;
      state.stageDeadline = Date.now() + STAGE_DELAY_MS;
      await editRaceMessage(state, client, {
        footerText: 'Stage 1 results in 2.5 seconds — adjust bets now!',
        extraDescription: null
      });
      state.timeout = setTimeout(() => {
        advanceStage(state, client).catch(err => console.error('Horse race advance error:', err));
      }, STAGE_DELAY_MS);
      return;
    }

    remaining -= 1;
    state.countdown = setTimeout(() => {
      tick().catch(err => console.error('Horse race countdown error:', err));
    }, 1_000);
  };

  await tick();
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
    let firstFinisher = null;
    for (let i = 0; i < state.progress.length; i += 1) {
      const advance = 5 + Math.floor(Math.random() * 11); // 5-15
      state.progress[i] = Math.min(TRACK_LENGTH, state.progress[i] + advance);
      if (firstFinisher === null && state.progress[i] >= TRACK_LENGTH) {
        firstFinisher = i;
      }
    }
    if (firstFinisher !== null) {
      state.status = 'finished';
      await payoutRace(state, [firstFinisher], client);
      return;
    }
  }

  let winners = [];
  if (state.stage >= STAGE_COUNT) {
    winners = ensureWinner(state);
    state.status = 'finished';
  }

  const footer = state.status === 'finished'
    ? 'Race finished!'
    : 'Next stage in 2.5 seconds — adjust bets now!';

  await editRaceMessage(state, client, { footerText: footer, extraDescription: null });

  if (state.status === 'finished') {
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
    return interaction.reply({ content: '❌ A horse race is already running in this channel.' });
  }

  const state = createEmptyState(ctx, interaction);
  const embed = createRaceEmbed(state, { footerText: INITIAL_FOOTER_TEXT });
  const message = await interaction.reply({ embeds: [embed], components: buildComponents(state), fetchReply: true });
  storeRace(state, message.id);
  refreshRaceTimeout(state, interaction.client);

  return state;
}

export async function handleRaceStart(interaction, state) {
  if (state.status !== 'betting') {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ The race is already underway.');
    return;
  }
  if (state.hostConfirm) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Countdown already in progress.');
    return;
  }
  if (!state.bets.size) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ At least one bet is required before starting the race.');
    return;
  }

  const isHost = interaction.user.id === state.hostId;
  let isModerator = false;
  try {
    isModerator = await state.ctx.isModerator(interaction);
  } catch (err) {
    isModerator = false;
  }

  if (!isHost && !isModerator) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Only the race host or moderators can start the countdown.');
    return;
  }

  clearRaceIdleTimer(state);
  state.hostConfirm = true;
  await editRaceMessage(state, interaction.client, {
    footerText: `🚦 Race starts in ${START_COUNTDOWN_SEC}s!`,
    extraDescription: `**🚨 COUNTDOWN: ${START_COUNTDOWN_SEC}s**`
  });
  await startCountdown(state, interaction.client);
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch {}
  }
}

export async function handleHorseBet(interaction, state, horseIndex, amount) {
  if (state.status === 'countdown') {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Bets are locked during the countdown.');
    return;
  }
  if (!(state.status === 'betting' || state.status === 'running')) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ The race is not accepting bets right now.');
    return;
  }
  if (horseIndex < 0 || horseIndex >= HORSE_LABELS.length) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Choose a horse between 1 and 5.');
    return;
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Bet amount must be a positive integer.');
    return;
  }

  const betKey = interaction.user.id;
  const existing = state.bets.get(betKey);
  const isBettingStage = state.status === 'betting';
  let stakeAmount = existing ? existing.originalAmount : amount;
  const previousAmount = stakeAmount;
  if (existing && !isBettingStage && amount !== stakeAmount) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, `⚠ Keep your stake at **${formatChips(stakeAmount)}**. Bet changes only swap horses and incur a fee.`);
    return;
  }
  const fee = existing
    ? (state.status === 'running'
        ? Math.ceil(stakeAmount * Math.max(1, state.stage / 2))
        : 0)
    : 0;

  const newExposure = computeExposure(state, betKey, amount);
  const houseBalance = await getHouseBalance(state.guildId);
  if (houseBalance < newExposure) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ The house cannot cover that wager right now. Try a smaller bet.');
    return;
  }

  let updatedCreditsBurned = existing ? existing.creditsBurned : 0;
  let updatedChipsStaked = existing ? existing.chipsStaked : 0;
  let feeCredits = 0;
  let feeChips = 0;

  try {
    if (!existing) {
      const collected = await collectFromUser(state, betKey, amount, 'horse race bet');
      updatedCreditsBurned = collected.creditsBurned;
      updatedChipsStaked = collected.chipsStaked;
      stakeAmount = amount;
    } else if (isBettingStage && amount !== previousAmount) {
      if (amount > previousAmount) {
        const delta = amount - previousAmount;
        const collected = await collectFromUser(state, betKey, delta, 'horse race bet adjustment');
        updatedCreditsBurned += collected.creditsBurned;
        updatedChipsStaked += collected.chipsStaked;
        stakeAmount = amount;
      } else {
        const delta = previousAmount - amount;
        let chipsRefund = Math.min(updatedChipsStaked, delta);
        let creditsRefund = Math.min(updatedCreditsBurned, delta - chipsRefund);
        const totalRefund = chipsRefund + creditsRefund;
        if (totalRefund > 0) {
          await refundToUser(state, betKey, creditsRefund, chipsRefund, 'horse race bet adjustment');
          updatedChipsStaked -= chipsRefund;
          updatedCreditsBurned -= creditsRefund;
        }
        stakeAmount = amount;
      }
    }

    if (fee > 0) {
      const collectedFee = await collectFromUser(state, betKey, fee, 'horse race bet change fee');
      feeCredits = collectedFee.creditsBurned;
      feeChips = collectedFee.chipsStaked;
    }
  } catch (err) {
    console.error('Horse race bet collection failed:', err);
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Could not process your bet. Do you have enough Credits/Chips?');
    return;
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

  if (!existing || isBettingStage) {
    betData.originalAmount = stakeAmount;
  }
  betData.amount = betData.originalAmount;
  betData.horse = horseIndex;
  betData.creditsBurned = updatedCreditsBurned;
  betData.chipsStaked = updatedChipsStaked;
  betData.feesPaidCredits += feeCredits;
  betData.feesPaidChips += feeChips;
  if (existing) betData.changes += 1;

  state.bets.set(betKey, betData);
  state.totalPot = Array.from(state.bets.values()).reduce((sum, bet) => sum + bet.amount, 0);
  state.totalExposure = Array.from(state.bets.values()).reduce((sum, bet) => sum + bet.amount * PAYOUT_MULTIPLIER, 0);

  const footerText = state.status === 'betting'
    ? (state.hostConfirm
        ? 'Countdown pending...'
        : 'Host must press Start to begin the countdown.')
    : 'Next stage in 2.5 seconds — adjust bets now!';
  await editRaceMessage(state, interaction.client, { footerText });
  refreshRaceTimeout(state, interaction.client);
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch {}
  }
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

  if (!(state.status === 'betting' || state.status === 'countdown')) {
    return interaction.reply({ content: '❌ You can only cancel before the race begins.', ephemeral: true });
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

  await editRaceMessage(state, interaction.client, { footerText: 'Race cancelled.', extraDescription: null });
  try {
    await postGameSessionEnd(interaction, { game: 'Horse Race', userId: state.hostId, houseNet: 0 });
  } catch (err) {
    console.error('Horse race cancel log failed:', err);
  }
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch {}
  }
}

export { showRaceNotice, acknowledgeInteraction };

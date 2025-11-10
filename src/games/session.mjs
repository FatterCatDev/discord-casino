import { EmbedBuilder } from 'discord.js';
import { getUserBalances, burnCredits, markUserFirstGameWin, transferFromHouseToUser } from '../db/db.auto.mjs';
import { chipsAmount, chipsAmountSigned } from './format.mjs';
import { finalizeSessionUIByIds, postGameSessionEndByIds } from './logging.mjs';
import { ridebusGames } from './ridebus.mjs';
import { blackjackGames } from './blackjack.mjs';
import { rouletteSessions } from './roulette.mjs';
import { slotSessions } from './slots.mjs';
import { emoji } from '../lib/emojis.mjs';
import { applyEmbedThumbnail, resolveGameThumbnail } from '../lib/assets.mjs';

export const ACTIVE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const activeSessions = new Map(); // key: `${guildId}:${userId}` -> state

// Key helpers
export function activeKey(guildId, userId) { return `${guildId}:${userId}`; }
export function keyFor(interaction) { return `${interaction.guild.id}:${interaction.user.id}`; }
export function getActiveSession(guildId, userId) { return activeSessions.get(activeKey(guildId, userId)) || null; }
export function setActiveSession(guildId, userId, type, gameLabel, opts = {}) {
  const now = Date.now();
  const k = activeKey(guildId, userId);
  const cur = activeSessions.get(k);
  const reset = !!opts.reset;
  if (cur && cur.type === type && !reset) {
    cur.lastAt = now;
    if (gameLabel) cur.gameLabel = gameLabel;
    return;
  }
  activeSessions.set(k, { type, lastAt: now, startedAt: now, houseNet: 0, playerNet: 0, games: 0, gameLabel: gameLabel || type });
}
export function touchActiveSession(guildId, userId, type) {
  const k = activeKey(guildId, userId);
  const s = activeSessions.get(k);
  if (!s || s.type !== type) return false;
  s.lastAt = Date.now();
  return true;
}
export function addHouseNet(guildId, userId, type, delta) {
  try {
    if (!Number.isFinite(delta) || delta === 0) return;
    const k = activeKey(guildId, userId);
    const s = activeSessions.get(k);
    if (!s || s.type !== type) return;
    s.houseNet = (s.houseNet || 0) + Math.trunc(delta);
  } catch {}
}
export function addPlayerNetAndGame(guildId, userId, delta) {
  try {
    const k = activeKey(guildId, userId);
    const s = activeSessions.get(k);
    if (!s) return;
    s.games = (s.games || 0) + 1;
    if (Number.isFinite(delta)) s.playerNet = (s.playerNet || 0) + Math.trunc(delta);
  } catch {}
}

function storeInteraction(interaction) {
  try {
    const guildId = interaction?.guild?.id;
    const userId = interaction?.user?.id;
    if (!guildId || !userId) return;
    const session = activeSessions.get(activeKey(guildId, userId));
    if (!session) return;
    session.lastInteraction = interaction;
  } catch {}
}

async function maybeSendCartelNotice(interaction) {
  try {
    const guildId = interaction?.guild?.id;
    const userId = interaction?.user?.id;
    if (!guildId || !userId) return;
    const session = activeSessions.get(activeKey(guildId, userId));
    if (!session?.pendingCartelNotice) return;
    session.pendingCartelNotice = false;
    const message = buildCartelPitchMessage(interaction.guild?.name || null);
    await interaction.followUp({ content: message, ephemeral: true }).catch(err => {
      console.error('Failed to send Semuta cartel follow-up', err);
    });
  } catch (err) {
    console.error('Failed to process Semuta cartel follow-up', err);
  }
}

async function handleInteractionPostResponse(interaction) {
  if (!interaction) return;
  storeInteraction(interaction);
  await maybeSendCartelNotice(interaction);
}

export async function refundChipsStake(guildId, userId, amount, reason = 'game refund') {
  const refund = Math.max(0, Math.trunc(Number(amount) || 0));
  if (refund <= 0) return 0;
  try {
    await transferFromHouseToUser(guildId, userId, refund, reason, null);
    return refund;
  } catch (err) {
    console.error('Failed to refund chips stake', { guildId, userId, refund, reason }, err);
    return 0;
  }
}

function queueCartelPitch(guildId, userId) {
  try {
    const ts = Math.floor(Date.now() / 1000);
    Promise.resolve(markUserFirstGameWin(guildId, userId, ts))
      .then(shouldNotify => {
        if (!shouldNotify) return null;
        const session = activeSessions.get(activeKey(guildId, userId));
        if (!session) return null;
        session.pendingCartelNotice = true;
        return null;
      })
      .catch(err => console.error('Semuta cartel pitch scheduling failed', err));
  } catch (err) {
    console.error('Semuta cartel pitch scheduling failed', err);
  }
}

function buildCartelPitchMessage(guildName = null) {
  const header = `${emoji('semuta_cartel')} **Semuta Cartel Dispatch**`;
  const locationLine = guildName
    ? `Word of your first score in **${guildName}** just hit our comms.`
    : 'Word of your first score on the casino floor just hit our comms.';
  const pitchLine = 'We have a chip-making opportunity that keeps paying even when you walk away from the tables.';
  const callToAction = 'Use `/cartel` to open the Semuta board and let our dealers build passive income for you.';
  return [header, locationLine, pitchLine, callToAction].join('\n');
}

export function recordSessionGame(guildId, userId, deltaChips) {
  try {
    addPlayerNetAndGame(guildId, userId, deltaChips);
    if (Number(deltaChips) > 0) {
      queueCartelPitch(guildId, userId);
    }
  } catch {}
}
export function setActiveMessageRef(guildId, userId, channelId, messageId) {
  try {
    const s = getActiveSession(guildId, userId);
    if (!s) return;
    s.msgChannelId = channelId;
    s.msgId = messageId;
  } catch {}
}
// Send/Update a game message and remember its channel/message id
export async function sendGameMessage(interaction, payload, mode = 'auto') {
  if (mode === 'update' || (mode === 'auto' && interaction.isButton && interaction.isButton())) {
    if (interaction.deferred || interaction.replied) {
      const res = await interaction.editReply(payload);
      await handleInteractionPostResponse(interaction);
      try { setActiveMessageRef(interaction.guild.id, interaction.user.id, res.channelId, res.id); } catch {}
      return res;
    }
    const res = await interaction.update(payload);
    await handleInteractionPostResponse(interaction);
    try { setActiveMessageRef(interaction.guild.id, interaction.user.id, interaction.channelId, interaction.message.id); } catch {}
    return res;
  }
  if (mode === 'followUp') {
    const msg = await interaction.followUp(payload);
    await handleInteractionPostResponse(interaction);
    try { setActiveMessageRef(interaction.guild.id, interaction.user.id, msg.channelId, msg.id); } catch {}
    return msg;
  }
  if (interaction.deferred || interaction.replied) {
    const res = await interaction.editReply(payload);
    await handleInteractionPostResponse(interaction);
    try { setActiveMessageRef(interaction.guild.id, interaction.user.id, res.channelId, res.id); } catch {}
    return res;
  }
  await interaction.reply(payload);
  await handleInteractionPostResponse(interaction);
  try {
    const msg = await interaction.fetchReply();
    setActiveMessageRef(interaction.guild.id, interaction.user.id, msg.channelId, msg.id);
    return msg;
  } catch {}
}

// Format a one-line session summary (games and net)
export function sessionLineFor(guildId, userId) {
  try {
    const s = getActiveSession(guildId, userId);
    if (!s) return null;
    const games = Number(s.games || 0);
    const net = Number(s.playerNet || 0);
    return `Session: Games **${games}** • Net **${chipsAmountSigned(net)}**`;
  } catch { return null; }
}

// UI helper: show current balances and session line
export async function buildPlayerBalanceField(guildId, userId, name = 'Player Balance') {
  const fmt = new Intl.NumberFormat('en-US');
  const { chips, credits } = await getUserBalances(guildId, userId);
  const sess = sessionLineFor(guildId, userId);
  const val = [
    `Chips: **${chipsAmount(chips)}**`,
    `Credits: **${fmt.format(credits)}**`,
    sess ? sess : null
  ].filter(Boolean).join('\n');
  return { name, value: val };
}

export function clearActiveSession(guildId, userId) { activeSessions.delete(activeKey(guildId, userId)); }
// Check if a user’s session for a type exceeded the inactivity timeout
export function hasActiveExpired(guildId, userId, type) {
  const s = getActiveSession(guildId, userId);
  if (!s || s.type !== type) return true;
  return (Date.now() - s.lastAt) > ACTIVE_TIMEOUT_MS;
}

// Build the session end summary embed
export async function buildSessionEndEmbed(guildId, userId, sessionOverride = null) {
  const s = sessionOverride || getActiveSession(guildId, userId) || {};
  const game = s.gameLabel || (s.type ? String(s.type).toUpperCase() : 'Game');
  const e = new EmbedBuilder().setColor(0x2b2d31);
  try {
    const { chips, credits } = await getUserBalances(guildId, userId);
    const fmt = new Intl.NumberFormat('en-US');
    const lines = [
      `Game: ${game}`,
      'Player Balance',
      `Chips: ${fmt.format(chips)}`,
      `Credits: ${fmt.format(credits)}`,
      `Hands(Rounds) Played: ${fmt.format(s.games || 0)}`,
      `Net: ${(s.playerNet||0) >= 0 ? '+' : '-'}${fmt.format(Math.abs(s.playerNet||0))}`
    ];
    e.setDescription(lines.join('\n'));
  } catch {
    e.setDescription(`Game: ${game}`);
  }
  const assetFile = resolveGameThumbnail(s.type, game);
  const asset = assetFile ? applyEmbedThumbnail(e, assetFile) : null;
  return { embed: e, asset };
}

export function expireAtUnix(guildId, userId) {
  try {
    const s = getActiveSession(guildId, userId);
    const last = s?.lastAt || Date.now();
    return Math.floor((last + ACTIVE_TIMEOUT_MS) / 1000);
  } catch {
    return Math.floor((Date.now() + ACTIVE_TIMEOUT_MS) / 1000);
  }
}

// UI helper: relative time to automatic expiration
export function buildTimeoutField(guildId, userId, name = `${emoji('hourglassFlow')} Timeout`) {
  const ts = expireAtUnix(guildId, userId);
  return { name, value: `<t:${ts}:R>` };
}

export async function burnUpToCredits(guildId, userId, stake, reason) {
  try {
    if (!Number.isInteger(stake) || stake <= 0) return 0;
    const { credits } = await getUserBalances(guildId, userId);
    const toBurn = Math.min(stake, credits);
    if (toBurn > 0) await burnCredits(guildId, userId, toBurn, reason, null);
    return toBurn;
  } catch {
    return 0;
  }
}

export async function endActiveSessionForUser(interaction, cause = 'new_command') {
  try {
    const guildId = interaction.guild?.id; if (!guildId) return;
    const userId = interaction.user?.id; if (!userId) return;
    const k = `${guildId}:${userId}`;
    const s = activeSessions.get(k);
    if (!s) return;
    // Update UI to session summary before logging
    await finalizeSessionUIByIds(interaction.client, guildId, userId, s);
    // Clean up per-game state; treat as loss where stakes already moved to house
    if (s.type === 'ridebus') {
      const st = ridebusGames.get(k);
      if (st) { try { await burnUpToCredits(guildId, userId, Number(st.creditsStake) || 0, `ridebus expired (${cause})`); } catch {} }
      if (st?.chipsStake) {
        await refundChipsStake(guildId, userId, st.chipsStake, `ridebus refund (${cause})`);
      }
      const net = (s.houseNet || 0);
      try { await postGameSessionEndByIds(interaction.client, guildId, userId, { game: 'Ride the Bus', houseNet: net }); } catch {}
      ridebusGames.delete(k);
    } else if (s.type === 'blackjack') {
      const st = blackjackGames.get(k);
      if (st) { try { await burnUpToCredits(guildId, userId, Number(st.creditsStake) || 0, `blackjack expired (${cause})`); } catch {} }
      const chipsStake = st && st.split && Array.isArray(st.hands)
        ? (st.hands?.[0]?.chipsStake || 0) + (st.hands?.[1]?.chipsStake || 0)
        : (st?.chipsStake || 0);
      if (chipsStake > 0) {
        await refundChipsStake(guildId, userId, chipsStake, `blackjack refund (${cause})`);
      }
      const net = (s.houseNet || 0);
      try { await postGameSessionEndByIds(interaction.client, guildId, userId, { game: 'Blackjack', houseNet: net }); } catch {}
      blackjackGames.delete(k);
    } else if (s.type === 'roulette') {
      try { await postGameSessionEndByIds(interaction.client, guildId, userId, { game: 'Roulette', houseNet: (s.houseNet || 0) }); } catch {}
      rouletteSessions.delete(k);
    } else if (s.type === 'slots') {
      const ss = slotSessions.get(k);
      const houseNet = (ss && Number.isFinite(ss.houseNet)) ? ss.houseNet : (s.houseNet || 0);
      try { await postGameSessionEndByIds(interaction.client, guildId, userId, { game: 'Slots', houseNet }); } catch {}
      slotSessions.delete(k);
    } else if (s.type === 'dicewar') {
// Shared: Game sessions — track active sessions, UI message refs, timeouts, and summary embeds.
      try { await postGameSessionEndByIds(interaction.client, guildId, userId, { game: 'Dice War', houseNet: (s.houseNet || 0) }); } catch {}
    }
    const current = activeSessions.get(k);
    if (!current || current === s) {
      clearActiveSession(guildId, userId);
    }
  } catch (e) {
    console.error('endActiveSessionForUser error:', e);
  }
}

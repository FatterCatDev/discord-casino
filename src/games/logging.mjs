import { getGuildSettings, getUserBalances, getHouseBalance } from '../db/db.auto.mjs';
import { chipsAmount, chipsAmountSigned } from './format.mjs';
import { buildSessionEndEmbed, activeSessions, ACTIVE_TIMEOUT_MS, burnUpToCredits, refundChipsStake } from './session.mjs';
import { ridebusGames } from './ridebus.mjs';
import { blackjackGames } from './blackjack.mjs';
import { rouletteSessions } from './roulette.mjs';
import { slotSessions } from './slots.mjs';
import { kittenizeTextContent, kittenizeReplyArg } from '../services/persona.mjs';
import { emoji } from '../lib/emojis.mjs';

const PRIMARY_GUILD_ID = (process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || '').trim() || null;

async function sendTextLog(client, channelId, baseMessage, kittenModeEnabled) {
  if (!channelId) return false;
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return false;
    const payload = kittenModeEnabled ? kittenizeTextContent(baseMessage) : baseMessage;
    await ch.send(payload);
    return true;
  } catch (e) {
    console.error('sendTextLog error:', e);
    return false;
  }
}

async function forwardToPrimaryGuild(client, channelProp, baseMessage, originGuildId) {
  if (!PRIMARY_GUILD_ID || PRIMARY_GUILD_ID === originGuildId) return;
  try {
    const primarySettings = await getGuildSettings(PRIMARY_GUILD_ID);
    if (!primarySettings) return;
    const channelId = primarySettings?.[channelProp];
    if (!channelId) return;
    await sendTextLog(client, channelId, baseMessage, primarySettings?.kitten_mode_enabled);
  } catch (e) {
    console.error(`forwardToPrimaryGuild error (${channelProp}):`, e);
  }
}

async function resolveDisplayName(client, guild, guildId, userId) {
  const fallback = `User ${userId}`;
  try {
    if (guild) {
      const cached = guild.members?.cache?.get(userId);
      if (cached) {
        return cached.displayName || cached.user?.globalName || cached.user?.username || fallback;
      }
      const fetched = await guild.members.fetch(userId).catch(() => null);
      if (fetched) {
        return fetched.displayName || fetched.user?.globalName || fetched.user?.username || fallback;
      }
    }
    const resolvedGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
    if (!resolvedGuild) return fallback;
    const cached = resolvedGuild.members?.cache?.get(userId);
    if (cached) return cached.displayName || cached.user?.globalName || cached.user?.username || fallback;
    const fetched = await resolvedGuild.members.fetch(userId).catch(() => null);
    if (fetched) return fetched.displayName || fetched.user?.globalName || fetched.user?.username || fallback;
    return fallback;
  } catch {
    return fallback;
  }
}

export async function postGameLog(interaction, lines) {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) return;
    const settings = await getGuildSettings(guildId);
    const { log_channel_id } = settings || {};
    const shouldForward = PRIMARY_GUILD_ID && PRIMARY_GUILD_ID !== guildId;
    if (!log_channel_id && !shouldForward) return;
    const header = `${emoji('videoGame')} **Game Log** • <t:${Math.floor(Date.now() / 1000)}:f>`;
    const displayName = await resolveDisplayName(interaction.client, interaction.guild, guildId, interaction.user.id);
    const contextGuildName = interaction.guild?.name || guildId;
    const context = `Server: **${contextGuildName}** • Player: **${displayName}**`;
    // const context = `Server: **${interaction.guild.name}** • Player: Sultry Kitten <@${interaction.user.id}>`;
    const body = Array.isArray(lines) ? lines.join('\n') : String(lines);
    const baseMessage = `${header}\n${context}\n${body}`;
    if (log_channel_id) {
      await sendTextLog(interaction.client, log_channel_id, baseMessage, settings?.kitten_mode_enabled);
    }
    await forwardToPrimaryGuild(interaction.client, 'log_channel_id', baseMessage, guildId);
  } catch (e) { console.error('postGameLog error:', e); }
}

export async function postGameSessionEnd(interaction, { game, userId, houseNet }) {
  try {
    const uid = userId || interaction.user?.id;
    const guildId = interaction.guild?.id;
    const { chips } = await getUserBalances(guildId, uid);
    const house = await getHouseBalance(guildId);
    const displayName = await resolveDisplayName(interaction.client, interaction.guild, guildId, uid);
    const lines = [
      `${emoji('videoGame')} **Game Session End**`,
      `Game: **${game}**`,
      `Player: **${displayName}**`,
      // `Player: Sultry Kitten <@${uid}>`,
      `Player Balance: **${chipsAmount(chips)}**`,
      `House Balance: **${chipsAmount(house)}**`,
      `House Net: **${chipsAmountSigned(houseNet || 0)}**`
    ];
    await postGameLog(interaction, lines);
  } catch (e) { console.error('postGameSessionEnd error:', e); }
}

export async function postGameLogByIds(client, guildId, userId, lines) {
  try {
    if (!guildId) return;
    const settings = await getGuildSettings(guildId);
    const { log_channel_id } = settings || {};
    const shouldForward = PRIMARY_GUILD_ID && PRIMARY_GUILD_ID !== guildId;
    if (!log_channel_id && !shouldForward) return;
    let guildName = guildId;
    try { const g = await client.guilds.fetch(guildId); guildName = g?.name || guildName; } catch {}
    const header = `${emoji('videoGame')} **Game Log** • <t:${Math.floor(Date.now() / 1000)}:f>`;
    const displayName = await resolveDisplayName(client, null, guildId, userId);
    const context = `Server: **${guildName}** • Player: **${displayName}**`;
    // const context = `Server: **${guildName}** • Player: Sultry Kitten <@${userId}>`;
    const body = Array.isArray(lines) ? lines.join('\n') : String(lines);
    const baseMessage = `${header}\n${context}\n${body}`;
    if (log_channel_id) {
      await sendTextLog(client, log_channel_id, baseMessage, settings?.kitten_mode_enabled);
    }
    await forwardToPrimaryGuild(client, 'log_channel_id', baseMessage, guildId);
  } catch (e) { console.error('postGameLogByIds error:', e); }
}

export async function postGameSessionEndByIds(client, guildId, userId, { game, houseNet }) {
  try {
    const { chips } = await getUserBalances(guildId, userId);
    const house = await getHouseBalance(guildId);
    const displayName = await resolveDisplayName(client, null, guildId, userId);
    const lines = [
      `${emoji('videoGame')} **Game Session End**`,
      `Game: **${game}**`,
      `Player: **${displayName}**`,
      // `Player: Sultry Kitten <@${userId}>`,
      `Player Balance: **${chipsAmount(chips)}**`,
      `House Balance: **${chipsAmount(house)}**`,
      `House Net: **${chipsAmountSigned(houseNet || 0)}**`
    ];
    await postGameLogByIds(client, guildId, userId, lines);
  } catch (e) { console.error('postGameSessionEndByIds error:', e); }
}

export async function finalizeSessionUIByIds(client, guildId, userId, sessionOverride = null) {
  try {
    const s = sessionOverride || activeSessions.get(`${guildId}:${userId}`);
    if (!s?.msgChannelId || !s?.msgId) return;
    const ch = await client.channels.fetch(s.msgChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    const msg = await ch.messages.fetch(s.msgId).catch(() => null);
    if (!msg) return;
    const { embed, asset } = await buildSessionEndEmbed(guildId, userId, s);
    let payload = { embeds: [embed], components: [] };
    if (asset) payload.files = [asset];
    try {
      const settings = await getGuildSettings(guildId);
      if (settings?.kitten_mode_enabled) {
        payload = kittenizeReplyArg(payload);
      }
    } catch {}
    await msg.edit(payload).catch(() => {});
  } catch (e) { console.error('finalizeSessionUIByIds error:', e); }
}

function parseKey(key) {
  const idx = key.indexOf(':');
  return idx > 0 ? [key.slice(0, idx), key.slice(idx + 1)] : [null, null];
}

export async function sweepExpiredSessions(client) {
  try {
    const now = Date.now();
    for (const [key, s] of Array.from(activeSessions.entries())) {
      if (now - (s.lastAt || 0) <= ACTIVE_TIMEOUT_MS) continue;
      const [guildId, userId] = parseKey(key);
      if (!guildId || !userId) { activeSessions.delete(key); continue; }
      try {
        await finalizeSessionUIByIds(client, guildId, userId, s);
        if (s.type === 'ridebus') {
          const st = ridebusGames.get(key);
          const chipsStake = st?.chipsStake || 0;
          if (st) { try { await burnUpToCredits(guildId, userId, Number(st.creditsStake) || 0, 'ridebus expired (timer)'); } catch {} }
          if (chipsStake > 0) {
            await refundChipsStake(guildId, userId, chipsStake, 'ridebus refund (expired)');
          }
          ridebusGames.delete(key);
          await postGameSessionEndByIds(client, guildId, userId, { game: 'Ride the Bus', houseNet: (s.houseNet || 0) });
        } else if (s.type === 'blackjack') {
          const st = blackjackGames.get(key);
          let chipsStake = 0;
          if (st) {
            if (st.split && Array.isArray(st.hands)) chipsStake = (st.hands?.[0]?.chipsStake || 0) + (st.hands?.[1]?.chipsStake || 0);
            else chipsStake = st.chipsStake || 0;
            try { await burnUpToCredits(guildId, userId, Number(st.creditsStake) || 0, 'blackjack expired (timer)'); } catch {}
          }
          if (chipsStake > 0) {
            await refundChipsStake(guildId, userId, chipsStake, 'blackjack refund (expired)');
          }
          blackjackGames.delete(key);
          await postGameSessionEndByIds(client, guildId, userId, { game: 'Blackjack', houseNet: (s.houseNet || 0) });
        } else if (s.type === 'roulette') {
          rouletteSessions.delete(key);
          await postGameSessionEndByIds(client, guildId, userId, { game: 'Roulette', houseNet: (s.houseNet || 0) });
        } else if (s.type === 'slots') {
          const ss = slotSessions.get(key);
          const houseNet = (ss && Number.isFinite(ss.houseNet)) ? ss.houseNet : 0;
          slotSessions.delete(key);
          await postGameSessionEndByIds(client, guildId, userId, { game: 'Slots', houseNet });
        } else if (s.type === 'dicewar') {
          await postGameSessionEndByIds(client, guildId, userId, { game: 'Dice War', houseNet: (s.houseNet || 0) });
        }
      } catch (e) { console.error('sweep end error:', e); }
      activeSessions.delete(key);
    }
  } catch (e) { console.error('sweepExpiredSessions error:', e); }
}

export async function postCashLog(interaction, lines) {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) return;
    const settings = await getGuildSettings(guildId);
    const { cash_log_channel_id } = settings || {};
    const shouldForward = PRIMARY_GUILD_ID && PRIMARY_GUILD_ID !== guildId;
    if (!cash_log_channel_id && !shouldForward) return;
    const header = `${emoji('cashStack')} **Cash Log** • <t:${Math.floor(Date.now() / 1000)}:f>`;
    const actorName = await resolveDisplayName(interaction.client, interaction.guild, guildId, interaction.user.id);
    const contextGuildName = interaction.guild?.name || guildId;
    const context = `Server: **${contextGuildName}** • Actor: **${actorName}**`;
    // const context = `Server: **${interaction.guild.name}** • Actor: Sultry Kitten <@${interaction.user.id}>`;
    const body = Array.isArray(lines) ? lines.join('\n') : String(lines);
    const baseMessage = `${header}\n${context}\n${body}`;
    if (cash_log_channel_id) {
      await sendTextLog(interaction.client, cash_log_channel_id, baseMessage, settings?.kitten_mode_enabled);
    }
    await forwardToPrimaryGuild(interaction.client, 'cash_log_channel_id', baseMessage, guildId);
  } catch (e) { console.error('postCashLog error:', e); }
}
// Shared: Logging — posts game and cash events, finalizes expired sessions, and sweeps.

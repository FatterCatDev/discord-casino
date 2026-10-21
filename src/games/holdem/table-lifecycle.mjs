import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { postGameLog } from '../logging.mjs';
import { chipsAmount, chipsAmountSigned } from '../format.mjs';
import { emoji } from '../../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../../lib/fundsTip.mjs';
import { holdemTables, tableKey, ensureTableInChannel, emptySeat } from './state.mjs';
import { syncKittenPersona, applyKittenPayload } from './persona.mjs';
import { afterActionMaybeAdvance, doFold } from './betting.mjs';
import { buildTableEmbed, tableButtons, buildTablePayload, buildResultPayload } from './presentation.mjs';
import { updateTableCard, announce } from './messages.mjs';
import { scheduleEmptyClose, scheduleLobbyClose } from './table-maintenance.mjs';
import { armActionTimer, scheduleNextHand } from './hand-lifecycle.mjs';
import { getGuildSettings, reserveHoldemTableNumber, escrowAdd, escrowReturn, getEscrowBalance, getUserBalances, getHouseBalance } from './persistence.mjs';

export async function setTableRake(interaction, percent, cap = null) {
  const state = ensureTableInChannel(interaction.guild.id, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No Hold’em table in this channel.', ephemeral: true });
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const bps = Math.floor(pct * 100);
  // Cap is always the table's Max buy-in
  state.rakeBps = bps;
  state.rakeCap = Math.max(0, Number(state.max) || 0);
  try { await updateTableCard(interaction.client, state); } catch {}
  const fmt = new Intl.NumberFormat('en-US');
  return interaction.reply({ content: `✅ Rake set to **${pct.toFixed(2)}%** (cap = table max buy‑in **${fmt.format(state.max)}**).`, ephemeral: true });
}

export function touchHostActivity(client, state) {
  try { if (!state?.hostId) return; scheduleHostKick(client, state, 10 * 60 * 1000); } catch {}
}

export function assignNewHost(state) {
  try {
    const next = state.seats?.[0]?.userId || null;
    state.hostId = next;
  } catch { state.hostId = null; }
}

export async function kickHostForInactivity(client, state) {
  if (state.closed) return;
  try {
    const hostId = state.hostId; if (!hostId) return;
    const idx = state.seats.findIndex(s => s.userId === hostId);
    if (idx === -1) return;
    // If host is to act, auto-fold them first
    try {
      if (Number.isInteger(state.toAct) && state.seats[state.toAct]?.userId === hostId) {
        await doFold(state);
      }
    } catch {}
    if (state.closed) return;
    // Refund any remaining escrow to host
    try {
      const bal = Number(await getEscrowBalance(state.channelId, hostId) || 0);
      if (state.closed) return;
      if (bal > 0) await escrowReturn(state.channelId, hostId, bal);
    } catch {}
    if (state.closed) return;
    // Remove the seat
    state.seats.splice(idx, 1);
    // Reassign host if possible
    assignNewHost(state);
    // Advance game if needed
    const result = afterActionMaybeAdvance(state);
    if (state.phase === 'COMPLETE' && result) {
      try { await updateTableCard(client, state, buildResultPayload(state, result)); } catch {}
      scheduleNextHand(client, state, result, 10000).catch(() => {});
    } else {
      // If no players left, go to lobby and schedule empty close
      if (state.seats.length === 0) {
        state.phase = 'LOBBY'; state.board = []; state.pot = 0; state.toAct = null;
        await updateTableCard(client, state, buildTablePayload(state, `${emoji('chair')} Waiting for players…`));
        scheduleEmptyClose(client, state);
      } else {
        try { armActionTimer(client, state, 30000); } catch {}
        await updateTableCard(client, state);
      }
    }
    await announce(client, state, `${emoji('noEntry')} Host <@${hostId}> removed due to 10 minutes of inactivity.${state.hostId ? ` New host: <@${state.hostId}>.` : ''}`);
    // Schedule kick timer for new host (if any)
    scheduleHostKick(client, state, 10 * 60 * 1000);
  } catch {}
}

export function scheduleHostKick(client, state, ms = 10 * 60 * 1000) {
  try { if (state.hostKickTimer) { clearTimeout(state.hostKickTimer); state.hostKickTimer = null; } } catch {}
  if (!state?.hostId || state.closed) return;
  state.hostKickDeadline = Date.now() + ms;
  const hostKickTimer = setTimeout(() => {
    if (state.closed || state.hostKickTimer !== hostKickTimer) return;
    return kickHostForInactivity(client, state);
  }, ms);
  state.hostKickTimer = hostKickTimer;
}

export async function hostTable(interaction, ctx, { sb, bb, min, max, cap, rakeBps }) {
  // Require configured casino category to place the temp channel
  const { casino_category_id, holdem_rake_bps } = await getGuildSettings(interaction.guild.id) || {};
  if (!casino_category_id) {
    return interaction.reply({ content: '❌ I need a configured casino category to host Hold’em tables. Ask a server admin to run /setcasinocategory first.', ephemeral: true });
  }
  // Reserve a per-guild table number without scanning all channels.
  let tableNumber = 1;
  try {
    tableNumber = await reserveHoldemTableNumber(interaction.guild.id);
  } catch {}
  const name = `holdem-table-${tableNumber}`;
  // Create the channel
  let tableChannel = null;
  try {
    const everyoneId = interaction.guild.roles.everyone.id;
    const botId = interaction.client.user.id;
    const hostId = interaction.user.id;
    let staffUserIds = [];
    try {
      const adminIds = await ctx.listAdmins();
      const modIds = await ctx.listModerators();
      staffUserIds = Array.from(new Set([...(adminIds || []), ...(modIds || [])].map(String)));
    } catch {}
    const overwrites = [
      { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
      { id: hostId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...staffUserIds
        .filter(id => id && id !== hostId)
        .map(id => ({
          id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages]
        }))
    ];
    tableChannel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: casino_category_id,
      reason: `Hold'em table by <@${interaction.user.id}>`,
      permissionOverwrites: overwrites
    });
  } catch (e) {
    console.error('holdem channel create (with overwrites) error:', e);
    try {
      tableChannel = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: casino_category_id,
        reason: `Hold'em table by <@${interaction.user.id}> (fallback without overwrites)`
      });
    } catch (err) {
      console.error('holdem channel create fallback error:', err);
      return interaction.reply({ content: '❌ Failed to create table channel. I may be missing permissions.', ephemeral: true });
    }
  }

  // Initialize state and register
  const k = tableKey(interaction.guild.id, tableChannel.id);
  const state = {
    id: k,
    guildId: interaction.guild.id,
    channelId: tableChannel.id,
    hostId: interaction.user.id,
    sb, bb, min, max,
    cap: Number.isInteger(cap) && cap > 0 ? cap : 9,
    rakeBps: Number.isFinite(holdem_rake_bps) ? holdem_rake_bps : (rakeBps || 0),
    rakeCap: Math.max(0, Number(max) || 0),
    seats: [],
    buttonIndex: 0,
    handNo: 0,
    deck: [],
    board: [],
    pot: 0,
    toAct: null,
    phase: 'LOBBY',
    needAction: [],
    tempChannel: true,
    houseRakeTotal: 0
    ,originMsgId: null
    ,originMsgChannelId: null
  };
  syncKittenPersona(state, ctx);
  holdemTables.set(k, state);

  // Post table card in the new channel, with host mention above it
  const tableEmbed = buildTableEmbed(state);
  const row = tableButtons(state);
  let sent = null;
  try {
    const payload = applyKittenPayload(state, { content: `Host: <@${interaction.user.id}>`, embeds: [tableEmbed], components: [row] });
    sent = await tableChannel.send(payload);
    state.msgId = sent.id;
    state.msgChannelId = sent.channelId;
  } catch (e) { console.error('send table card error:', e); }

  // Edit the preset message to show summary (creator, channel, config)
  try {
    const fmt = new Intl.NumberFormat('en-US');
    const pct = ((state.rakeBps || 0) / 100).toFixed(2);
    const capTxt = Number(state.rakeCap) > 0 ? ` (cap ${fmt.format(state.rakeCap)})` : '';
    const sum = new EmbedBuilder()
      .setTitle(`${emoji('pokerSpade')}${emoji('pokerHeart')}${emoji('pokerDiamond')}${emoji('pokerClub')} Hold’em Table Created`)
      .setColor(0x57F287)
      .setDescription(`Host: <@${interaction.user.id}>\nChannel: <#${tableChannel.id}>`)
      .addFields(
        { name: 'Blinds', value: `SB **${sb}** • BB **${bb}**`, inline: true },
        { name: 'Buy‑in', value: `Min **${min}** • Max **${max}**`, inline: true },
        { name: 'Rake', value: `${pct}%${capTxt}`, inline: true },
        { name: 'Seats', value: `Cap **${state.cap}**`, inline: true }
      );
    if (interaction.isButton && interaction.isButton()) {
      await interaction.update({ embeds: [sum], components: [] });
      try { state.originMsgId = interaction.message?.id; state.originMsgChannelId = interaction.channelId; } catch {}
    } else if (interaction.isModalSubmit && interaction.isModalSubmit()) {
      // Caller (custom modal handler) will edit the options message; do not reply here
    } else {
      // Fallback (non-button); reply publicly
      await interaction.reply({ embeds: [sum], components: [] });
      try { const msg = await interaction.fetchReply(); state.originMsgId = msg?.id; state.originMsgChannelId = msg?.channelId; } catch {}
    }
  } catch {}

  // Schedule close if no players join in time (2 min)
  try { scheduleEmptyClose(interaction.client, state); } catch {}
  // Schedule host inactivity kick
  try { scheduleHostKick(interaction.client, state); } catch {}
  return state;
}

export async function listTables(interaction, ctx) {
  const lines = [];
  for (const st of holdemTables.values()) {
    if (st.guildId !== interaction.guild.id) continue;
    lines.push(`#${st.channelId === interaction.channelId ? '(here) ' : ''}${st.channelId} — Players: ${st.seats.length} — Blinds ${st.sb}/${st.bb}`);
  }
  return interaction.reply({ content: lines.length ? lines.join('\n') : 'No active Hold’em tables in this server.', ephemeral: true });
}

export async function joinTable(interaction, ctx, buyin) {
  const guildId = interaction.guild.id;
  const state = ensureTableInChannel(guildId, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No Hold’em table in this channel. Use /holdem host.', ephemeral: true });
  syncKittenPersona(state, ctx);
  if (Number(state.cap||0) > 0 && state.seats.length >= Number(state.cap)) {
    return interaction.reply({ content: `❌ Table is full (cap **${state.cap}**).`, ephemeral: true });
  }
  if (state.seats.some(s => s.userId === interaction.user.id)) return interaction.reply({ content: '❌ You are already seated.', ephemeral: true });
  if (!Number.isInteger(buyin) || buyin < state.min || buyin > state.max) {
    return interaction.reply({ content: `❌ Buy-in must be between **${state.min}** and **${state.max}**.`, ephemeral: true });
  }
  // Chips-only buy-in to escrow, then seat the player with stack equal to buy-in.
  try {
    const { chips } = await getUserBalances(guildId, interaction.user.id);
    if ((chips||0) < buyin) {
      const msg = withInsufficientFundsTip('❌ Not enough Chips for that buy-in.', state?.kittenMode === true);
      return interaction.reply({ content: msg, ephemeral: true });
    }
    await escrowAdd(state.channelId, interaction.user.id, buyin);
  } catch {
    const msg = withInsufficientFundsTip('❌ Could not process buy-in (insufficient Chips?).', state?.kittenMode === true);
    return interaction.reply({ content: msg, ephemeral: true });
  }
  const seat = emptySeat(interaction.user.id, buyin);
  seat.buyInTotal = buyin;
  seat.initialBuyIn = buyin;
  seat.joinedAt = Date.now();
  seat.rakeSnapshot = Number(state.houseRakeTotal || 0);
  state.seats.push(seat);
  try { if (state.closeTimer) { clearTimeout(state.closeTimer); state.closeTimer = null; } } catch {}
  if (state.phase === 'CLOSED') { state.phase = 'LOBBY'; }
  // Update main table card if we have it
  await updateTableCard(interaction.client, state);
  // Schedule 10-minute lobby close
  try { scheduleLobbyClose(interaction.client, state); } catch {}
  return interaction.reply({ content: `✅ Seated with **${buyin}**.`, ephemeral: true });
}

export async function leaveTable(interaction, ctx) {
  const guildId = interaction.guild.id;
  const state = ensureTableInChannel(guildId, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No table here.', ephemeral: true });
  syncKittenPersona(state, ctx);
  const idx = state.seats.findIndex(s => s.userId === interaction.user.id);
  if (idx === -1) return interaction.reply({ content: '❌ You are not seated.', ephemeral: true });
  const seat = state.seats[idx];
  // Always refund any remaining escrow to the player and include it in the message
  let refunded = 0;
  try {
    const bal = Number(await getEscrowBalance(state.channelId, interaction.user.id) || 0);
    if (bal > 0) {
      await escrowReturn(state.channelId, interaction.user.id, bal);
      refunded = bal;
    }
  } catch {}
  const totalBuyIn = Number.isFinite(seat?.buyInTotal) ? Math.trunc(seat.buyInTotal) : Number.isFinite(seat?.initialBuyIn) ? Math.trunc(seat.initialBuyIn) : Math.trunc(refunded || seat?.stack || 0);
  const playerNet = Math.trunc(refunded - totalBuyIn);
  const houseNetForSeat = Math.trunc((state.houseRakeTotal || 0) - (seat?.rakeSnapshot || 0));
  let playerBalance = null;
  let houseBalance = null;
  try {
    const { chips } = await getUserBalances(guildId, interaction.user.id);
    playerBalance = Math.trunc(chips || 0);
  } catch {}
  try {
    houseBalance = Math.trunc(await getHouseBalance(guildId));
  } catch {}
  try {
    const tableChannelId = state.msgChannelId || state.channelId;
    const lines = [
      `${emoji('pokerSpade')} **Hold’em Table Leave**`,
      `Table: <#${tableChannelId}>`,
      `Chips Net: **${chipsAmountSigned(playerNet)}**`,
      `House Net: **${chipsAmountSigned(houseNetForSeat)}**`,
      playerBalance !== null ? `Player Balance: **${chipsAmount(playerBalance)}**` : null,
      houseBalance !== null ? `House Balance: **${chipsAmount(houseBalance)}**` : null
    ].filter(Boolean);
    await postGameLog(interaction, lines);
  } catch (e) { console.error('holdem leave log error:', e); }
  state.seats.splice(idx, 1);
  // If <= 1 player left, go back to lobby UI and transfer ownership
  if (state.seats.length <= 1) {
    try { if (state.nextHandTimer) clearTimeout(state.nextHandTimer); if (state.nextHandInterval) clearInterval(state.nextHandInterval); } catch {}
    state.phase = 'LOBBY';
    state.board = [];
    state.pot = 0;
    state.toAct = null;
    state.currentBet = 0;
    state.minRaise = 0;
    state.resultLabel = null;
    state.countdownSec = null;
    if (state.seats.length === 1) state.hostId = state.seats[0].userId;
    const payload = buildTablePayload(state, `${emoji('chair')} Waiting for players…`);
    if (state.seats.length === 0) { try { scheduleEmptyClose(interaction.client, state); } catch {} }
    else { try { scheduleLobbyClose(interaction.client, state); } catch {} }
    const msg = refunded > 0
      ? `${emoji('wave')} You left the table. Refunded **${chipsAmount(refunded)}** chips.`
      : `${emoji('wave')} You left the table.`;
    if (interaction.isButton && interaction.isButton()) {
      await interaction.update(payload);
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    await updateTableCard(interaction.client, state, payload);
    return interaction.reply({ content: msg, ephemeral: true });
  }
  // If no players, schedule close
  if (state.seats.length === 0) { try { scheduleEmptyClose(interaction.client, state); } catch {} }
  const payload = buildTablePayload(state);
  const msg2 = refunded > 0
    ? `${emoji('wave')} You left the table. Refunded **${chipsAmount(refunded)}** chips.`
    : `${emoji('wave')} You left the table.`;
  if (interaction.isButton && interaction.isButton()) {
    await interaction.update(payload);
    return interaction.followUp({ content: msg2, ephemeral: true });
  }
  await updateTableCard(interaction.client, state, payload);
  return interaction.reply({ content: msg2, ephemeral: true });
}

export async function rebuyAtTable(interaction, ctx, amount) {
  const state = ensureTableInChannel(interaction.guild.id, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No table here.', ephemeral: true });
  syncKittenPersona(state, ctx);
  const seat = state.seats.find(s => s.userId === interaction.user.id);
  if (!seat) return interaction.reply({ content: '❌ You are not seated.', ephemeral: true });
  if (!Number.isInteger(amount) || amount <= 0) return interaction.reply({ content: '❌ Rebuy amount must be a positive integer.', ephemeral: true });
  if (amount < state.min) return interaction.reply({ content: `❌ Minimum rebuy is **${state.min}**.`, ephemeral: true });
  const newStack = seat.stack + amount;
  if (newStack > state.max) return interaction.reply({ content: `❌ Rebuy would exceed table max stack (**${state.max}**). Current: **${seat.stack}**.`, ephemeral: true });
  // For prototype: only allow rebuys when not mid-hand
  if (['PREFLOP','FLOP','TURN','RIVER'].includes(state.phase)) {
    return interaction.reply({ content: '❌ You can rebuy only between hands (not during an active hand).', ephemeral: true });
  }
  // Chips-only rebuy into escrow
  try {
    const { chips } = await getUserBalances(interaction.guild.id, interaction.user.id);
    if ((chips || 0) < amount) {
      const msg = withInsufficientFundsTip('❌ Not enough Chips for that rebuy.', state?.kittenMode === true);
      return interaction.reply({ content: msg, ephemeral: true });
    }
    await escrowAdd(state.channelId, interaction.user.id, amount);
  } catch {
    const msg = withInsufficientFundsTip('❌ Could not process rebuy (insufficient Chips?).', state?.kittenMode === true);
    return interaction.reply({ content: msg, ephemeral: true });
  }
  seat.buyInTotal = (seat.buyInTotal || 0) + amount;
  seat.stack = newStack;
  const embed = buildTableEmbed(state);
  const row = tableButtons(state);
  return interaction.reply({ content: `✅ Rebuy added: **+${amount}**. New stack: **${seat.stack}**`, embeds: [embed], components: [row] });
}

import { ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { emoji } from '../../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../../lib/fundsTip.mjs';
import { ensureTableInChannel, emptySeat } from './state.mjs';
import { syncKittenPersona, applyKittenPayload } from './persona.mjs';
import { evaluate7 } from './evaluation.mjs';
import { afterActionMaybeAdvance, doFold, doCheck, doCall, doAllIn, doBetOrRaise } from './betting.mjs';
import { buildTableEmbed, tableButtons, formatCard, buildTablePayload, actionButtonsFor, buildResultPayload } from './presentation.mjs';
import { updateTableCard, deleteNotice } from './messages.mjs';
import { armActionTimer, scheduleNextHand, startHand } from './hand-lifecycle.mjs';
import { touchHostActivity, hostTable, leaveTable } from './table-lifecycle.mjs';
import { escrowAdd, getUserBalances } from './persistence.mjs';

export async function onHoldemButton(interaction, ctx) {
  const parts = interaction.customId.split('|');
  const action = parts[1];
  // Creation buttons do not require an existing state
  if (action === 'create') {
    const preset = parts[2];
    const owner = parts[3];
    if (owner && owner !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the requester can create this table.', ephemeral: true });
    }
    if (preset === 'custom') {
      // Show a modal collecting SB, Min, Max, Cap. BB will be 2×SB.
      const modal = new ModalBuilder().setCustomId(`hold|custom|${interaction.user.id}|${interaction.message.id}`).setTitle('Custom Hold’em Table');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('sb').setLabel('Small Blind (BB = 2×SB)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('min').setLabel('Min Buy-in').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('max').setLabel('Max Buy-in').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cap').setLabel('Seat Cap (2–10, default 9)').setStyle(TextInputStyle.Short).setRequired(false)
        )
      );
      return interaction.showModal(modal);
    }
    let cfg = null;
    if (preset === 'p1') cfg = { sb: 1, bb: 2, min: 10, max: 100, rakeBps: 500 };
    else if (preset === 'p2') cfg = { sb: 5, bb: 10, min: 50, max: 500, rakeBps: 500 };
    else if (preset === 'p3') cfg = { sb: 20, bb: 40, min: 200, max: 2000, rakeBps: 500 };
    else {
      return interaction.reply({ content: '❌ Unknown preset.', ephemeral: true });
    }
    return hostTable(interaction, ctx, cfg);
  }
  const state = ensureTableInChannel(interaction.guild.id, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No table here.', ephemeral: true });
  syncKittenPersona(state, ctx);
  if (action === 'join') {
    // Open a modal to collect buy-in amount, then seat and update the table card
    const modal = new ModalBuilder().setCustomId(`hold|join|${interaction.user.id}`).setTitle('Join Table');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('buyin').setLabel('Buy-in amount').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }
  if (action === 'sitout') {
    const seat = state.seats.find(s => s.userId === interaction.user.id);
    if (!seat) return interaction.reply({ content: '❌ You are not seated.', ephemeral: true });
    seat.sitOut = true; seat.waitForBB = true; seat.missedBlinds = seat.missedBlinds || 0;
    try { await updateTableCard(interaction.client, state); } catch {}
    return interaction.reply({ content: `${emoji('pauseButton')} You will sit out starting next hand. Use Sit-in to return (wait for BB).`, ephemeral: true });
  }
  if (action === 'sitin') {
    const seat = state.seats.find(s => s.userId === interaction.user.id);
    if (!seat) return interaction.reply({ content: '❌ You are not seated.', ephemeral: true });
    seat.sitOut = false; seat.waitForBB = true; seat.missedBlinds = 0;
    try { await updateTableCard(interaction.client, state); } catch {}
    return interaction.reply({ content: `${emoji('playButton')} You will sit in (will be dealt after your BB).`, ephemeral: true });
  }
  if (action === 'leave') {
    try { if (state.hostId && interaction.user.id === state.hostId) touchHostActivity(interaction.client, state); } catch {}
    return leaveTable(interaction, ctx);
  }
  if (action === 'start') {
    const hostId = parts[2];
    if (interaction.user.id !== hostId) return interaction.reply({ content: '❌ Only the host can start.', ephemeral: true });
    try { touchHostActivity(interaction.client, state); } catch {}
    return startHand(interaction, ctx);
  }
  if (action === 'act') {
    const sub = parts[2];
    const userId = parts[3];
    const who = state.seats[state.toAct]?.userId;
    if (!who || userId !== who || interaction.user.id !== who) return interaction.reply({ content: '❌ Not your turn.', ephemeral: true });
    try { if (state.hostId && interaction.user.id === state.hostId) touchHostActivity(interaction.client, state); } catch {}
    // Delete turn notice when the acting player makes a move
    try { if (state.actionUserId && interaction.user.id === state.actionUserId) await deleteNotice(interaction.client, state); } catch {}
    if (sub === 'fold') { await doFold(state); }
    else if (sub === 'check') { await doCheck(state); }
    else if (sub === 'call') { await doCall(state); }
    else if (sub === 'allin') { await doAllIn(state); }
    else if (sub === 'raise') {
      const modal = new ModalBuilder().setCustomId(`hold|bet|${who}`).setTitle('Bet/Raise');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount to put in now').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }
    const result = afterActionMaybeAdvance(state);
    if (state.phase === 'COMPLETE' && result) {
      const res = await interaction.update(buildResultPayload(state, result));
      scheduleNextHand(interaction.client, state, result, 10000).catch(() => {});
      return res;
    }
    try { armActionTimer(interaction.client, state, 30000); } catch {}
    const embed = buildTableEmbed(state);
    const rows = [tableButtons(state)];
    const act = actionButtonsFor(state); if (act) rows.push(act);
    const res = await interaction.update({ embeds: [embed], components: rows });
    return res;
  }
  if (action === 'peek') {
    // Show the clicking player's hole cards ephemerally
    const seat = state.seats.find(s => s.userId === interaction.user.id);
    if (!seat || !seat.inHand || !seat.hole || seat.hole.length < 2) {
      return interaction.reply({ content: '❌ No active hand or you are not seated.', ephemeral: true });
    }
    const c1 = formatCard(seat.hole[0]);
    const c2 = formatCard(seat.hole[1]);
    const e = new EmbedBuilder().setTitle(`${emoji('chipJoker')} Your Hand`).setColor(0x2b2d31)
      .setDescription(`**${c1} ${c2}**`);
    if (state.board && state.board.length) {
      const board = state.board.map(formatCard).join(' ');
      e.addFields({ name: 'Board', value: board });
      try { const best = evaluate7([...(seat.hole||[]), ...(state.board||[])]); if (best?.label) e.setFooter({ text: `Best with board: ${best.label}` }); } catch {}
    }
    return interaction.reply({ embeds: [e], ephemeral: true });
  }
  return interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
}

export async function onHoldemBetModal(interaction, ctx) {
  const state = ensureTableInChannel(interaction.guild.id, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No table here.', ephemeral: true });
  syncKittenPersona(state, ctx);
  const userId = interaction.customId.split('|')[2];
  const who = state.seats[state.toAct]?.userId;
  if (!who || userId !== who || interaction.user.id !== who) return interaction.reply({ content: '❌ Not your turn.', ephemeral: true });
  try { if (state.hostId && interaction.user.id === state.hostId) touchHostActivity(interaction.client, state); } catch {}
  try { if (state.actionUserId && interaction.user.id === state.actionUserId) await deleteNotice(interaction.client, state); } catch {}
  const amtStr = interaction.fields.getTextInputValue('amount');
  const amt = Number(amtStr);
  if (!Number.isInteger(amt) || amt <= 0) return interaction.reply({ content: '❌ Amount must be a positive integer.', ephemeral: true });
  const ok = await doBetOrRaise(state, amt);
  if (!ok) return interaction.reply({ content: '❌ Invalid bet/raise amount for your stack or rules.', ephemeral: true });
  const result = afterActionMaybeAdvance(state);
  if (state.phase === 'COMPLETE' && result) {
    // Edit the existing table card; do not create a new message
    try { await updateTableCard(interaction.client, state, buildResultPayload(state, result)); } catch {}
    scheduleNextHand(interaction.client, state, result, 10000).catch(() => {});
    return interaction.reply({ content: '✅ Settled.', ephemeral: true });
  }
  // Not terminal: update the main table card and arm timer
  try { armActionTimer(interaction.client, state, 30000); } catch {}
  try { await updateTableCard(interaction.client, state, buildTablePayload(state)); } catch {}
  return interaction.reply({ content: '✅ Action applied.', ephemeral: true });
}

export async function onHoldemJoinModal(interaction, ctx) {
  const parts = interaction.customId.split('|');
  const requester = parts[2];
  const guildId = interaction.guild.id;
  const state = ensureTableInChannel(guildId, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No table here.', ephemeral: true });
  syncKittenPersona(state, ctx);
  if (interaction.user.id !== requester) return interaction.reply({ content: '❌ This join prompt is not for you.', ephemeral: true });
  const buyinStr = interaction.fields.getTextInputValue('buyin');
  const buyin = Number(buyinStr);
  if (!Number.isInteger(buyin) || buyin <= 0) return interaction.reply({ content: '❌ Buy-in must be a positive integer.', ephemeral: true });
  if (state.seats.some(s => s.userId === interaction.user.id)) return interaction.reply({ content: '❌ You are already seated.', ephemeral: true });
  if (buyin < state.min || buyin > state.max) {
    return interaction.reply({ content: `❌ Buy-in must be between **${state.min}** and **${state.max}**.`, ephemeral: true });
  }
  // Seat the player with escrowed Chips (pre-check balance)
  try {
    const { chips } = await getUserBalances(guildId, interaction.user.id);
    if ((chips||0) < buyin) {
      const msg = withInsufficientFundsTip('❌ Not enough Chips for that buy-in.', state?.kittenMode === true);
      return interaction.reply({ content: msg, ephemeral: true });
    }
    await escrowAdd(state.channelId, interaction.user.id, buyin);
  } catch (e) {
    const msg = withInsufficientFundsTip('❌ Could not process buy-in (insufficient Chips?).', state?.kittenMode === true);
    return interaction.reply({ content: msg, ephemeral: true });
  }
  const seat = emptySeat(interaction.user.id, buyin);
  seat.buyInTotal = buyin;
  seat.initialBuyIn = buyin;
  seat.joinedAt = Date.now();
  seat.rakeSnapshot = Number(state.houseRakeTotal || 0);
  state.seats.push(seat);
  // Update the main table card
  await updateTableCard(interaction.client, state);
  return interaction.reply({ content: `✅ Seated with **${buyin}**.`, ephemeral: true });
}

export async function onHoldemCustomModal(interaction, ctx) {
  try {
    const parts = interaction.customId.split('|');
    const requester = parts[2];
    const sourceMsgId = parts[3];
    if (interaction.user.id !== requester) {
      return interaction.reply({ content: '❌ This custom setup prompt is not for you.', ephemeral: true });
    }
    // Acknowledge the modal without showing a user-visible message
    try { await interaction.deferReply({ ephemeral: true }); } catch {}
    const sb = Number(interaction.fields.getTextInputValue('sb'));
    const min = Number(interaction.fields.getTextInputValue('min'));
    const max = Number(interaction.fields.getTextInputValue('max'));
    const capStr = interaction.fields.getTextInputValue('cap');
    let cap = Number(capStr);
    if (!Number.isInteger(cap) || cap <= 0) cap = 9;
    if (cap < 2) cap = 2; if (cap > 10) cap = 10;
    if (!Number.isInteger(sb) || sb <= 0) return interaction.reply({ content: '❌ SB must be a positive integer.', ephemeral: true });
    if (!Number.isInteger(min) || min <= 0) return interaction.reply({ content: '❌ Min buy-in must be a positive integer.', ephemeral: true });
    if (!Number.isInteger(max) || max <= 0) return interaction.reply({ content: '❌ Max buy-in must be a positive integer.', ephemeral: true });
    if (max < min) return interaction.reply({ content: '❌ Max buy-in must be greater than or equal to Min.', ephemeral: true });
    const bb = sb * 2;
    // Create the table (hostTable replies ephemerally with summary and creates the new channel)
    const state = await hostTable(interaction, ctx, { sb, bb, min, max, cap, rakeBps: 0 });
    // Edit the original options message to show creation summary
    try {
      const fmt = new Intl.NumberFormat('en-US');
      const pct = ((state.rakeBps || 0) / 100).toFixed(2);
      const capTxt = Number(state.rakeCap) > 0 ? ` (cap ${fmt.format(state.rakeCap)})` : '';
      const sum = new EmbedBuilder()
        .setTitle(`${emoji('pokerSpade')}${emoji('pokerHeart')}${emoji('pokerDiamond')}${emoji('pokerClub')} Hold’em Table Created`)
        .setColor(0x57F287)
        .setDescription(`Host: <@${interaction.user.id}>\nChannel: <#${state.msgChannelId || state.channelId}>`)
        .addFields(
          { name: 'Blinds', value: `SB **${sb}** • BB **${bb}**`, inline: true },
          { name: 'Buy‑in', value: `Min **${min}** • Max **${max}**`, inline: true },
          { name: 'Rake', value: `${pct}%${capTxt}`, inline: true },
          { name: 'Seats', value: `Cap **${state.cap || cap}**`, inline: true }
        );
      const ch = interaction.channel;
      const msg = await ch.messages.fetch(sourceMsgId).catch(() => null);
      if (msg) {
        const payload = applyKittenPayload(state, { embeds: [sum], components: [] });
        await msg.edit(payload);
      }
      try { state.originMsgId = sourceMsgId; state.originMsgChannelId = ch?.id || interaction.channelId; } catch {}
    } catch {}
    // Remove the deferred ephemeral reply so nothing is shown to the user
    try { await interaction.deleteReply().catch(()=>{}); } catch {}
  } catch (e) {
    console.error('onHoldemCustomModal error:', e);
    try { return interaction.reply({ content: '❌ Failed to create table from custom settings.', ephemeral: true }); } catch {}
  }
}

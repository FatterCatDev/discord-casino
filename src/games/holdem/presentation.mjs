import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { emoji } from '../../lib/emojis.mjs';
import { applyEmbedThumbnail, buildAssetAttachment } from '../../lib/assets.mjs';
import { evaluate7 } from './evaluation.mjs';

const HOLDEM_ASSET = 'holdem.png';

function embedColorForPhase(phase) {
  switch (phase) {
    case 'PREFLOP': return 0x2b2d31; // dark
    case 'FLOP':    return 0x3BA55D; // subtle green
    case 'TURN':    return 0x1E90FF; // subtle blue
    case 'RIVER':   return 0xFEE75C; // subtle yellow
    case 'SHOWDOWN':return 0xEB459E; // fuchsia
    default:        return 0x5865F2; // blurple fallback
  }
}

export function buildTableEmbed(state) {
  const suitBanner = `${emoji('pokerSpade')}${emoji('pokerHeart')}${emoji('pokerDiamond')}${emoji('pokerClub')}`;
  const e = new EmbedBuilder()
    .setTitle(`${suitBanner} Texas Hold’em`)
    .setColor(embedColorForPhase(state.phase));

  // Prominent board at the top, with placeholders per street when a hand is active
  let boardLine = '—';
  if (state?.handNo) {
    const board = Array.isArray(state.board) ? state.board : [];
    const shown = board.map(formatCard);
    const placeholders = Array.from({ length: Math.max(0, 5 - shown.length) }, () => emoji('cardBack'));
    boardLine = [...shown, ...placeholders].join('   ');
  }
  e.setDescription(`${emoji('slotsReel')} **Board**\n\n${boardLine}`);

  e.addFields(
    { name: 'Blinds', value: `SB **${state.sb}** • BB **${state.bb}**`, inline: true },
    { name: 'Buy-in', value: `Min **${state.min}** • Max **${state.max}**`, inline: true },
    { name: 'Phase', value: `${state.phase || 'LOBBY'}`, inline: true }
  );
  if (state.rakeBps) e.addFields({ name: 'Rake', value: `${(state.rakeBps||0)/100}%`, inline: true });
  const cap = Number(state.cap || 0) > 0 ? ` • Cap **${state.cap}**` : '';
  e.addFields({ name: 'Seats', value: `Players **${state.seats.length}**${cap}` , inline: true });
  const seated = state.seats.map((s, i) => {
    const tags = [ state.buttonIndex===i ? emoji('radioButton') : null, s.sitOut ? '(sit‑out)' : null ].filter(Boolean).join(' ');
    return `${emoji('chair')} Seat ${i+1}: <@${s.userId}> — **${s.stack}** ${tags}`.trim();
  });
  e.addFields({ name: 'Players', value: seated.length ? seated.join('\n') : '_No players yet_' });
  if (state.handNo) {
    e.addFields({ name: 'Hand', value: `#${state.handNo} • Pot: **${state.pot || 0}**` });
    try {
      const lines = state.seats.map((s,i)=>`${emoji('chair')} Seat ${i+1}${state.buttonIndex===i?` ${emoji('radioButton')}`:''}: <@${s.userId}> — Stack **${s.stack}** • Bet **${s.betRound||0}**${s.folded?' (folded)':''}${s.allIn?' (all-in)':''}`);
      e.addFields({ name: 'Bets', value: lines.join('\n') });
    } catch {}
    // Action/Timer details are posted as a separate notice message, not in the embed
  }
  // Table timeout hint (only in lobby)
  try {
    if (state.phase === 'LOBBY' && state.closeDeadline) {
      const ts = Math.floor(state.closeDeadline / 1000);
      e.addFields({ name: `${emoji('hourglassFlow')} Table Timeout`, value: `<t:${ts}:R>` });
    }
  } catch {}
  e.setFooter({ text: 'Note: Escrow/payouts not yet wired to chips.' });
  applyEmbedThumbnail(e, HOLDEM_ASSET);
  return e;
}

export function tableButtons(state) {
  const canStart = state.seats.length >= 2 && state.hostId;
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder().setCustomId('hold|join').setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hold|leave').setLabel('Leave').setStyle(ButtonStyle.Secondary)
  );
  const activeHand = ['PREFLOP','FLOP','TURN','RIVER'].includes(state.phase);
  if (!activeHand) {
    // Only show Start Hand in lobby to stay within the 5-button limit per row
    row.addComponents(new ButtonBuilder().setCustomId(`hold|start|${state.hostId||''}`).setLabel('Start Hand').setStyle(ButtonStyle.Primary).setDisabled(!canStart));
  } else {
    // During an active hand, show Peek Hand instead of Start Hand
    row.addComponents(new ButtonBuilder().setCustomId('hold|peek').setLabel('Peek Hand').setStyle(ButtonStyle.Secondary));
  }
  // Sit-out / Sit-in toggles (will validate per user on click)
  row.addComponents(new ButtonBuilder().setCustomId('hold|sitout').setLabel('Sit-out').setStyle(ButtonStyle.Secondary));
  row.addComponents(new ButtonBuilder().setCustomId('hold|sitin').setLabel('Sit-in').setStyle(ButtonStyle.Secondary));
  return row;
}

function suitEmoji(s) {
  if (s === '♥') return emoji('pokerHeart');
  if (s === '♦') return emoji('pokerDiamond');
  if (s === '♣') return emoji('pokerClub');
  if (s === '♠') return emoji('pokerSpade');
  return s;
}

export function formatCard(card) {
  if (!card) return '??';
  const suit = card[card.length - 1];
  const rank = card[0];
  const rankDisplay = (rank === 'T') ? '10' : rank;
  return `${rankDisplay}${suitEmoji(suit)}`;
}

export function buildTablePayload(state, content = null) {
  const embed = buildTableEmbed(state);
  const rows = [tableButtons(state)];
  const actRow = actionButtonsFor(state); if (actRow) rows.push(actRow);
  const payload = { embeds: [embed], components: rows };
  if (content) payload.content = content;
  const art = buildAssetAttachment(HOLDEM_ASSET);
  if (art) payload.files = [art];
  return payload;
}

export function buildClosedPayload(mode = 'empty') {
  const desc = mode === 'idle'
    ? 'Table idle for 10 minutes without a hand.'
    : 'No players for 2 minutes.';
  const e = new EmbedBuilder().setTitle(`${emoji('stopSign')} Table closed`).setColor(0x2b2d31).setDescription(desc);
  return { content: '', embeds: [e], components: [] };
}

export function actionButtonsFor(state) {
  if (!Number.isInteger(state.toAct)) return null;
  const idx = state.toAct; const seat = state.seats[idx];
  if (!seat || seat.folded || !seat.inHand) return null;
  const callAmt = Math.max(0, (state.currentBet||0) - (seat.betRound||0));
  const canBetOrRaise = seat.stack > callAmt; // has chips beyond a call (or any chips if check spot)
  const cannotCoverCall = callAmt > 0 && seat.stack < callAmt;
  const row = new ActionRowBuilder();
  row.addComponents(new ButtonBuilder().setCustomId(`hold|act|fold|${seat.userId}`).setLabel('Fold').setStyle(ButtonStyle.Danger));
  if (cannotCoverCall) {
    // Only All-in or Fold are valid options
    if (seat.stack > 0) {
      row.addComponents(new ButtonBuilder().setCustomId(`hold|act|allin|${seat.userId}`).setLabel(`All-in (${seat.stack})`).setStyle(ButtonStyle.Success));
    }
  } else {
    if (callAmt > 0) {
      row.addComponents(new ButtonBuilder().setCustomId(`hold|act|call|${seat.userId}`).setLabel(`Call ${callAmt}`).setStyle(ButtonStyle.Secondary));
    } else {
      row.addComponents(new ButtonBuilder().setCustomId(`hold|act|check|${seat.userId}`).setLabel('Check').setStyle(ButtonStyle.Secondary));
    }
    if (canBetOrRaise) {
      // Unified label for opening/raising action
      row.addComponents(new ButtonBuilder().setCustomId(`hold|act|raise|${seat.userId}`).setLabel('Bet/Raise').setStyle(ButtonStyle.Primary));
    }
    if (seat.stack > 0) {
      row.addComponents(new ButtonBuilder().setCustomId(`hold|act|allin|${seat.userId}`).setLabel('All-in').setStyle(ButtonStyle.Success));
    }
  }
  return row;
}

function rankAbbrev(v) {
  if (v >= 2 && v <= 10) return String(v);
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[v] || String(v);
}

function kickerTextFor(res) {
  try {
    if (!res || !Array.isArray(res.ranks)) return null;
    const r = res.ranks;
    // Category codes: 8 SF, 7 Quads [quad, kick], 6 FH [trips, pair], 5 Flush [r1..r5], 4 Straight [r1..r5], 3 Trips [t, k1, k2], 2 TwoPair [p1,p2,k], 1 Pair [p, k1,k2,k3], 0 High [r1..r5]
    let ks = [];
    if (res.cat === 7) ks = [r[1]]; // one kicker
    else if (res.cat === 3) ks = r.slice(1, 3);
    else if (res.cat === 2) ks = [r[2]];
    else if (res.cat === 1) ks = r.slice(1, 4);
    else if (res.cat === 0 || res.cat === 5) ks = r.slice(1); // show remaining high cards for clarity
    else ks = [];
    if (!ks.length) return null;
    const parts = ks.map(rankAbbrev).join(', ');
    return ks.length === 1 ? `Kicker: ${parts}` : `Kickers: ${parts}`;
  } catch { return null; }
}

function buildResultEmbed(state, result) {
  const e = new EmbedBuilder().setTitle(`${emoji('finishFlag')} Hand Result`).setColor(0xEB459E);
  const boardLine = (state.board && state.board.length) ? state.board.map(formatCard).join('   ') : '—';
  e.setDescription(`${emoji('slotsReel')} **Board**\n\n${boardLine}`);
  // Winners + amounts
  try {
    const fmt = new Intl.NumberFormat('en-US');
    if (Number.isFinite(result?.rake) && result.rake > 0) {
      const capTxt = Number.isFinite(state.rakeCap) && state.rakeCap > 0 ? ` (cap ${fmt.format(state.rakeCap)})` : '';
      const pctTxt = Number.isFinite(state.rakeBps) && state.rakeBps > 0 ? ` at ${(state.rakeBps / 100).toFixed(2)}%` : '';
      e.addFields({ name: 'Rake', value: `**${fmt.format(result.rake)}**${pctTxt}${capTxt}` });
    }
    const lines = (result?.payouts || []).map(p => {
      const seat = state.seats[p.idx];
      const userId = seat?.userId;
      const cards = Array.isArray(seat?.hole) ? seat.hole.map(formatCard).join(' ') : '—';
      // Evaluate this player's best to show kicker details if relevant
      let best = null; try { best = evaluate7([...(seat?.hole||[]), ...(state.board||[])]); } catch {}
      const kick = kickerTextFor(best);
      const bestLabel = best?.label ? ` • ${best.label}${kick ? ` — ${kick}` : ''}` : '';
      return `• <@${userId}> — **+${fmt.format(p.amount)}** — Hand: **${cards}**${bestLabel}`;
    });
    if (lines.length) e.addFields({ name: 'Winners', value: lines.join('\n') });
    // Side pot breakdown (per pot)
    if (Array.isArray(result?.pots) && result.pots.length) {
      result.pots.forEach((pot, i) => {
        const title = i === 0 ? 'Main Pot' : `Side Pot ${i}`;
        const potFmt = fmt.format(pot.amount || 0);
        const winners = (pot.winners || []).map(w => ` <@${state.seats[w.idx]?.userId}> +${fmt.format(w.amount)}`).join('\n') || '_no eligible winners_';
        e.addFields({ name: `${title} — ${potFmt}`, value: winners });
      });
    }
  } catch {}
  if (result?.label) e.addFields({ name: 'Hand', value: result.label });
  return e;
}

export function buildResultPayload(state, result) {
  // Provide a Leave button at results so players can exit before next hand
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hold|leave').setLabel('Leave').setStyle(ButtonStyle.Secondary)
  );
  return { content: '', embeds: [buildResultEmbed(state, result)], components: [row] };
}

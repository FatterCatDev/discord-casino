import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import {
  ensureJobProfile,
  updateJobProfile,
  createJobShift,
  completeJobShift,
  mintChips
} from '../db/db.auto.mjs';
import { getJobStatusForUser, recordShiftCompletion, JOB_SHIFT_STREAK_LIMIT, JOB_SHIFT_RECHARGE_SECONDS } from './status.mjs';
import { getJobById } from './registry.mjs';
import { generateStagesForJob, generateBartenderShift } from './scenarios/index.mjs';
import {
  applyXpGain,
  performanceToBasePay,
  rollTipPercent,
  calculateTipAmount,
  clampPerformance,
  JOB_SHIFT_STAGE_COUNT,
  maxPayForRank,
  maxBasePayForRank,
  JOB_PAYOUT_DIVISOR
} from './progression.mjs';
import { emoji } from '../lib/emojis.mjs';
import { scheduleInteractionAck } from '../lib/interactionAck.mjs';

const sessionsById = new Map();
const sessionsByUser = new Map();

const SHIFT_SESSION_TIMEOUT_SECONDS = 120;
const JOB_SHIFT_BUTTON_ACK_MS = (() => {
  const specific = Number(process.env.JOB_SHIFT_BUTTON_ACK_MS);
  if (Number.isFinite(specific) && specific > 0) return specific;
  const general = Number(process.env.INTERACTION_STALE_MS);
  return Number.isFinite(general) && general > 0 ? general : 2500;
})();

const COLORS = {
  bartender: 0xff9b54,
  dealer: 0x3498db,
  bouncer: 0x9b59b6,
  default: 0x5865f2
};

const JOB_STAGE_IMAGES = {
  bartender: 'jobBarTender.png',
  dealer: 'jobDealer.png',
  bouncer: 'jobBouncer.png',
  default: 'job.png'
};

function resolveJobStageImage(job) {
  const fileName = JOB_STAGE_IMAGES[job?.id] || JOB_STAGE_IMAGES.default;
  if (!fileName) return null;
  try {
    const attachmentPath = fileURLToPath(new URL(`../../Assets/${fileName}`, import.meta.url));
    return {
      name: fileName,
      attachment: attachmentPath
    };
  } catch {
    return null;
  }
}

function userKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function storeJobAutoAck(interaction, cancelFn) {
  if (!interaction || typeof cancelFn !== 'function') return;
  cancelJobAutoAck(interaction);
  interaction.__jobShiftCancelAck = cancelFn;
}

function cancelJobAutoAck(interaction) {
  if (!interaction) return;
  const cancelFn = interaction.__jobShiftCancelAck;
  if (typeof cancelFn === 'function') {
    try { cancelFn(); } catch {}
  }
  interaction.__jobShiftCancelAck = null;
}

function sendShiftUpdate(interaction, ctx, payload) {
  cancelJobAutoAck(interaction);
  if (ctx && typeof ctx.sendGameMessage === 'function') {
    return ctx.sendGameMessage(interaction, payload, 'update');
  }
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.update(payload);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const parts = [];
  const units = [
    { label: 'h', value: 3600 },
    { label: 'm', value: 60 },
    { label: 's', value: 1 }
  ];
  let remaining = total;
  for (const unit of units) {
    if (remaining < unit.value) continue;
    const qty = Math.floor(remaining / unit.value);
    remaining -= qty * unit.value;
    parts.push(`${qty}${unit.label}`);
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(' ') : '0s';
}

function registerSession(session) {
  sessionsById.set(session.sessionId, session);
  sessionsByUser.set(userKey(session.guildId, session.userId), session);
}

function clearSession(session) {
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }
  sessionsById.delete(session.sessionId);
  sessionsByUser.delete(userKey(session.guildId, session.userId));
}

function compareNameSelections(selectedNames = [], correctNames = []) {
  if (selectedNames.length !== correctNames.length) return false;
  const normalize = names => names.map(name => name.trim().toLowerCase()).sort();
  const sel = normalize(selectedNames);
  const exp = normalize(correctNames);
  for (let i = 0; i < sel.length; i += 1) {
    if (sel[i] !== exp[i]) return false;
  }
  return true;
}

function chunkButtons(options, sessionId) {
  const rows = [];
  let current = [];
  for (const opt of options) {
    const button = new ButtonBuilder()
      .setCustomId(`jobshift|${sessionId}|answer|${opt.id}`)
      .setLabel(opt.label)
      .setStyle(ButtonStyle.Primary);
    if (opt.emoji) button.setEmoji(opt.emoji);
    current.push(button);
    if (current.length === 5) {
      rows.push(new ActionRowBuilder().addComponents(current));
      current = [];
    }
  }
  if (current.length) rows.push(new ActionRowBuilder().addComponents(current));
  return rows;
}

function ensureEphemeralPayload(payload) {
  const body = typeof payload === 'string'
    ? { content: payload }
    : { ...(payload || {}) };
  body.ephemeral = true;
  const existingFlags = typeof body.flags === 'number' ? body.flags : 0;
  body.flags = existingFlags | MessageFlags.Ephemeral;
  return body;
}

function replyEphemeral(interaction, payload) {
  cancelJobAutoAck(interaction);
  const body = ensureEphemeralPayload(payload);
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(body);
  }
  return interaction.reply(body);
}

function followUpEphemeral(interaction, payload) {
  cancelJobAutoAck(interaction);
  return interaction.followUp(ensureEphemeralPayload(payload));
}

function normalizeDealerSelection(selection, stage) {
  if (!Array.isArray(selection) || !selection.length) return '';
  const seatSummaries = Array.isArray(stage?.seatSummaries) && stage.seatSummaries.length
    ? stage.seatSummaries
    : [
        { id: 'A', text: 'Seat A' },
        { id: 'B', text: 'Seat B' },
        { id: 'C', text: 'Seat C' }
      ];
  const seatOrder = seatSummaries.map(summary => String(summary.id).toUpperCase());
  const allowed = new Set(seatOrder);
  const filtered = selection
    .map(value => String(value).toUpperCase())
    .filter(value => allowed.has(value));
  if (!filtered.length) return '';
  const unique = Array.from(new Set(filtered));
  unique.sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
  return unique.join('');
}

function renderDealerSelection(selection, stage) {
  if (!Array.isArray(selection) || !selection.length) return 'No selection';
  const seatSummaries = Array.isArray(stage?.seatSummaries) && stage.seatSummaries.length
    ? stage.seatSummaries
    : [
        { id: 'A', text: 'Seat A' },
        { id: 'B', text: 'Seat B' },
        { id: 'C', text: 'Seat C' }
      ];
  const seatMap = new Map(seatSummaries.map(summary => [String(summary.id).toUpperCase(), summary.text]));
  const seatOrder = seatSummaries.map(summary => String(summary.id).toUpperCase());
  const filtered = selection
    .map(value => String(value).toUpperCase())
    .filter(value => seatMap.has(value));
  if (!filtered.length) return 'No selection';
  const unique = Array.from(new Set(filtered));
  unique.sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
  return unique.map(id => seatMap.get(id) ?? `Seat ${id}`).join(', ');
}

function renderDealerAnswer(code, stage) {
  if (!code) return 'No selection';
  const seatSummaries = Array.isArray(stage?.seatSummaries) && stage.seatSummaries.length
    ? stage.seatSummaries
    : [
        { id: 'A', text: 'Seat A' },
        { id: 'B', text: 'Seat B' },
        { id: 'C', text: 'Seat C' }
      ];
  const seatMap = new Map(seatSummaries.map(summary => [String(summary.id).toUpperCase(), summary.text]));
  const seatOrder = seatSummaries.map(summary => String(summary.id).toUpperCase());
  const chars = String(code).toUpperCase().split('').filter(ch => seatMap.has(ch));
  if (!chars.length) return 'No selection';
  const unique = Array.from(new Set(chars));
  unique.sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
  return unique.map(ch => seatMap.get(ch) ?? `Seat ${ch}`).join(', ');
}

function formatSeconds(seconds) {
  return seconds.toFixed(seconds < 10 ? 2 : 1);
}

function calculateDealerScore(elapsedMs) {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 15) return 20;
  if (seconds < 30) return 18;
  if (seconds < 40) return 15;
  const penalty = Math.max(0, seconds - 30);
  return Math.max(0, 15 - penalty);
}

function buildHistoryLines(session) {
  if (!session.history.length) return 'No stages completed yet.';
  return session.history.map(item => {
    const icon = item.status === 'success' ? emoji('check') : emoji('cross');
    let detail = `${icon} Stage ${item.stageNumber}: ${item.title} — ${item.totalScore} pts`;
    if (item.status === 'success') {
      const attemptText = item.attempts === 1 ? 'first try' : item.attempts === 2 ? 'second try' : 'final try';
      const speedText = item.bonus > 0 ? `, +${item.bonus} speed` : '';
      detail += ` (${attemptText}${speedText})`;
    } else {
      detail += ' (timed out)';
    }
    if (item.penalties) {
      detail += ` (penalties -${item.penalties})`;
    }
    return detail;
  }).join('\n');
}

function isBartenderStage(stage, session) {
  return stage?.type === 'bartender' || session?.jobId === 'bartender';
}

function getBartenderData(session) {
  return session?.bartender || null;
}

function getBlankValue(session) {
  const data = getBartenderData(session);
  return data?.blankValue ?? '__blank__';
}

function createStageState(session, stage) {
  const base = {
    startedAtMs: Date.now(),
    attempts: 0,
    attemptsLog: [],
    penalties: 0,
    lastSegmentStart: Date.now(),
    hasTimerStarted: false,
    penaltyHistory: [],
    selectedNames: [],
    selectedHands: []
  };
  if (isBartenderStage(stage, session)) {
    const blank = getBlankValue(session);
    return {
      ...base,
      picks: [blank, blank, blank, blank],
      technique: null,
      lastFeedback: null
    };
  }
  return base;
}

function applyBartenderTimingPenalty(stageState, elapsedMs) {
  if (!stageState) return { penalty: 0, seconds: 0 };
  const seconds = Math.max(0, elapsedMs / 1000);
  let penalty = 0;
  if (seconds > 15) penalty = 5;
  else if (seconds > 7) penalty = 2;
  else if (seconds > 5) penalty = 1;
  if (penalty > 0) {
    stageState.penalties = Math.max(0, (stageState.penalties || 0) + penalty);
    if (!Array.isArray(stageState.penaltyHistory)) stageState.penaltyHistory = [];
    stageState.penaltyHistory.push({ seconds, penalty, at: Date.now() });
  }
  return { penalty, seconds };
}

function registerBartenderAction(stageState) {
  if (!stageState) return { penalty: 0, seconds: 0 };
  const now = Date.now();
  let penaltyResult = { penalty: 0, seconds: 0 };
  if (stageState.hasTimerStarted) {
    const elapsed = now - (stageState.lastSegmentStart || now);
    penaltyResult = applyBartenderTimingPenalty(stageState, elapsed);
  } else {
    stageState.hasTimerStarted = true;
  }
  stageState.lastSegmentStart = now;
  return penaltyResult;
}

function bartenderMenuLines(menu) {
  return menu.map((drink, idx) => {
    const sequence = drink.ingredients.join(' → ');
    const finish = drink.technique.toUpperCase();
    return `${idx + 1}. ${drink.name} (${sequence}) • ${finish}`;
  });
}

function chunkTextLines(lines, limit = 1024) {
  if (!Array.isArray(lines) || !lines.length) return ['—'];
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      if (current) chunks.push(current);
      if (line.length > limit) {
        chunks.push(line.slice(0, limit));
        current = line.slice(limit);
      } else {
        current = line;
      }
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['—'];
}

function formatBartenderBuild(stageState, blankValue) {
  if (!stageState) return '1. —\n2. —\n3. —\n4. —\nTechnique: —';
  const picks = stageState.picks || [];
  const lines = picks.map((value, idx) => {
    const display = !value || value === blankValue ? '—' : value;
    return `${idx + 1}. ${display}`;
  });
  const technique = stageState.technique ? stageState.technique.toUpperCase() : '—';
  lines.push(`Technique: ${technique}`);
  return lines.join('\n');
}

function buildBartenderStageEmbeds(session, stage, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const job = session.job;
  const jobIcon = jobDisplayIcon(job);
  const stageNumber = session.stageIndex + 1;
  const totalStages = session.stages.length;
  const blank = getBlankValue(session);
  const stageState = session.stageState || createStageState(session, stage);
  const menu = getBartenderData(session)?.menu || [];
  const drink = stage.drink ?? {};
  const orderName = drink.name || say('Mystery Order', 'Unknown Order');

  const orderEmbed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${emoji('clipboard')} ${say('Order Ticket', 'Order Ticket')}`)
    .setDescription(`**${orderName}**`);

  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Stage ${stageNumber}/${totalStages}`)
    .setDescription(stage.prompt)
    .addFields(
      {
        name: say('Score So Far', 'Score So Far'),
        value: `${session.totalScore} / 100`
      },
      {
        name: say('Your Build', 'Your Build'),
        value: formatBartenderBuild(stageState, blank)
      }
    );

  const penaltyTotal = Math.max(0, Math.floor(stageState.penalties || 0));
  embed.addFields({
    name: say('Time Penalties', 'Time Penalties'),
    value: penaltyTotal
      ? `${emoji('timer')} -${penaltyTotal} ${penaltyTotal === 1 ? say('point', 'point') : say('points', 'points')}`
      : say('No penalties so far — keep the pace!', 'No penalties yet — keep moving!')
  });

  if (stageState.lastFeedback) {
    embed.addFields({
      name: say('Last Feedback', 'Last Feedback'),
      value: stageState.lastFeedback
    });
  }

  const recipeLines = bartenderMenuLines(menu);
  const menuChunks = chunkTextLines(recipeLines);
  menuChunks.forEach((chunk, idx) => {
    embed.addFields({
      name: idx === 0 ? say('Tonight’s Menu', 'Tonight’s Menu') : say('Menu (cont.)', 'Menu (cont.)'),
      value: chunk
    });
  });

  if (Array.isArray(session.history) && session.history.length) {
    embed.addFields({
      name: say('Stage History', 'Stage History'),
      value: buildHistoryLines(session)
    });
  }

  const art = resolveJobStageImage(job);
  const files = [];
  if (art) {
    embed.setThumbnail(`attachment://${art.name}`);
    files.push({ attachment: art.attachment, name: art.name });
  }

  return { embeds: [orderEmbed, embed], files };
}

function buildBouncerStageEmbeds(session, stage, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const job = session.job;
  const jobIcon = jobDisplayIcon(job);
  const stageNumber = session.stageIndex + 1;
  const totalStages = session.stages.length;
  const promptLines = String(stage.prompt ?? '').split('\n');
  const normalizeBlock = (lines = []) => {
    let start = 0;
    let end = lines.length;
    while (start < end && !String(lines[start]).trim()) start += 1;
    while (end > start && !String(lines[end - 1]).trim()) end -= 1;
    return lines.slice(start, end);
  };
  const lineupIndex = promptLines.findIndex(line => line.trim().toLowerCase() === 'lineup:');
  const questionIndex = promptLines.findIndex(line => {
    const trimmed = line.trim().toLowerCase();
    return /^who gets in\??$/.test(trimmed) || trimmed.startsWith('select the group outcome');
  });
  const splitIdx = questionIndex === -1 ? promptLines.length : questionIndex;
  const checklistLines = normalizeBlock(promptLines.slice(0, lineupIndex >= 0 ? lineupIndex : splitIdx));
  const lineupLines = normalizeBlock(lineupIndex >= 0 ? promptLines.slice(lineupIndex, splitIdx) : []);
  const tailLines = normalizeBlock(promptLines.slice(splitIdx));

  const lineupText = lineupLines.join('\n').trim();
  const checklistText = checklistLines.join('\n').trim();
  const lineupEmbed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${emoji('doorOpen')} ${say('Velvet Rope Lineup', 'Velvet Rope Lineup')}`)
    .setDescription(lineupText.length ? lineupText : say('Lineup details unavailable.', 'Lineup details unavailable.'));

  const descriptionLines = [];
  if (tailLines.length) {
    descriptionLines.push(tailLines.join('\n'));
  }
  descriptionLines.push(say(
    'Tag every approved guest in the dropdown, then press Continue.',
    'Select the guests you’ll admit in the dropdown, then press Continue.'
  ));
  descriptionLines.push(say(
    'Three mistakes end this checkpoint — deny anyone you’re unsure about.',
    'Three mistakes end the checkpoint, so deny any uncertain guests.'
  ));

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Stage ${stageNumber}/${totalStages}`)
    .setDescription(descriptionLines.join('\n\n'));

  const fields = [
    {
      name: say('Checkpoint Checklist', 'Checkpoint Checklist'),
      value: checklistText.length ? checklistText : say('Checklist unavailable.', 'Checklist unavailable.')
    },
    {
      name: say('Score So Far', 'Score So Far'),
      value: `${session.totalScore} / 100`
    },
    {
      name: say('Tips', 'Tips'),
      value: say(
        'Verify age, wardrobe, wristband, and the guest list before you approve anyone.',
        'Double-check age, outfit, wristband, and guest list status before admitting guests.'
      )
    }
  ];

  if (Array.isArray(session.history) && session.history.length) {
    fields.push({
      name: say('Stage History', 'Stage History'),
      value: buildHistoryLines(session)
    });
  }

  mainEmbed.addFields(fields);
  const art = resolveJobStageImage(job);
  const files = [];
  if (art) {
    mainEmbed.setThumbnail(`attachment://${art.name}`);
    files.push({ attachment: art.attachment, name: art.name });
  }
  return { embeds: [lineupEmbed, mainEmbed], files };
}

function buildBartenderIngredientRow(session, slotIndex) {
  const data = getBartenderData(session);
  const blank = getBlankValue(session);
  const stageState = session.stageState || createStageState(session, session.stages[session.stageIndex]);
  const current = stageState.picks?.[slotIndex] ?? blank;
  const options = [
    {
      label: 'Blank',
      description: 'Leave this step empty',
      value: blank,
      default: current === blank
    },
    ...data.ingredients.slice().sort((a, b) => a.localeCompare(b)).map(ingredient => ({
      label: ingredient,
      value: ingredient,
      default: current === ingredient
    }))
  ];
  const select = new StringSelectMenuBuilder()
    .setCustomId(`jobshift|${session.sessionId}|slot|${slotIndex}`)
    .setPlaceholder(`Ingredient ${slotIndex + 1}`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);
  return new ActionRowBuilder().addComponents(select);
}

function buildBartenderControlRow(session, stage) {
  const stageState = session.stageState || createStageState(session, stage);
  const technique = stageState.technique;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jobshift|${session.sessionId}|technique|shake`)
      .setLabel('Shake')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`jobshift|${session.sessionId}|technique|stir`)
      .setLabel('Stir')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`jobshift|${session.sessionId}|cancel`)
      .setLabel('End Shift')
      .setEmoji(emoji('stopSign'))
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildBartenderStageComponents(session, stage) {
  return [
    buildBartenderIngredientRow(session, 0),
    buildBartenderIngredientRow(session, 1),
    buildBartenderIngredientRow(session, 2),
    buildBartenderIngredientRow(session, 3),
    buildBartenderControlRow(session, stage)
  ];
}

function buildDealerSelectRow(session, stage) {
  const stageState = session.stageState || (session.stageState = createStageState(session, stage));
  const seatSummaries = Array.isArray(stage.seatSummaries) && stage.seatSummaries.length
    ? stage.seatSummaries
    : [
        { id: 'A', text: 'Seat A' },
        { id: 'B', text: 'Seat B' },
        { id: 'C', text: 'Seat C' }
      ];
  const seatOrder = seatSummaries.map(summary => String(summary.id).toUpperCase());
  const selected = Array.isArray(stageState.selectedHands)
    ? new Set(stageState.selectedHands.map(value => String(value).toUpperCase()).filter(value => seatOrder.includes(value)))
    : new Set();
  const select = new StringSelectMenuBuilder()
    .setCustomId(`jobshift|${session.sessionId}|select`)
    .setPlaceholder('Select winning seat(s)')
    .setMinValues(1)
    .setMaxValues(seatSummaries.length);
  seatSummaries.forEach(summary => {
    const value = String(summary.id).toUpperCase();
    select.addOptions({
      label: summary.text,
      value,
      default: selected.has(value)
    });
  });
  return new ActionRowBuilder().addComponents(select);
}

function buildDealerIntroRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jobshift|${sessionId}|start`)
      .setLabel('Start Dealing')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`jobshift|${sessionId}|cancel`)
      .setLabel('End Shift')
      .setEmoji(emoji('stopSign'))
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDealerActionRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jobshift|${sessionId}|continue`)
      .setLabel('Continue')
      .setStyle(ButtonStyle.Primary)
  );
}

function evaluateBartenderSubmission(session, stage) {
  const blank = getBlankValue(session);
  const state = session.stageState || createStageState(session, stage);
  const picks = state.picks || [];
  const required = stage.drink.ingredients;
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const blankNormalized = normalize(blank);
  const errors = [];

  for (let i = 0; i < required.length; i += 1) {
    const expected = required[i];
    const received = picks[i];
    if (normalize(expected) !== normalize(received)) {
      errors.push(`Ingredient ${i + 1} should be **${expected}**.`);
    }
  }

  for (let i = required.length; i < picks.length; i += 1) {
    const received = picks[i];
    if (received && normalize(received) !== blankNormalized) {
      errors.push(`Ingredient slot ${i + 1} must remain blank.`);
    }
  }

  if (!state.technique) {
    errors.push('Select whether to shake or stir the drink.');
  } else if (normalize(state.technique) !== normalize(stage.drink.technique)) {
    errors.push(`Finish should be **${stage.drink.technique.toUpperCase()}**.`);
  }

  return {
    success: errors.length === 0,
    message: errors.join(' ')
  };
}

function jobDisplayIcon(job) {
  return job?.emojiKey ? emoji(job.emojiKey) : job?.icon || '';
}

function buildStageEmbeds(session, stage, kittenMode) {
  if (isBartenderStage(stage, session)) {
    return buildBartenderStageEmbeds(session, stage, kittenMode);
  }
  if (session.jobId === 'bouncer') {
    return buildBouncerStageEmbeds(session, stage, kittenMode);
  }
  const job = session.job;
  const stageNumber = session.stageIndex + 1;
  const totalStages = session.stages.length;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const jobIcon = jobDisplayIcon(job);
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const chargesBefore = Math.max(0, Math.min(limit, Number(session.shiftStatusBefore?.shiftsRemaining ?? limit)));
  const chargesAfter = Math.max(0, Math.min(limit, chargesBefore - 1));
  const nextChargeAt = Number(session.shiftStatusBefore?.shiftCooldownExpiresAt ?? session.shiftStatusBefore?.shift_cooldown_expires_at ?? 0);
  const nowTs = nowSeconds();
  const rechargeRemaining = nextChargeAt > nowTs ? nextChargeAt - nowTs : 0;
  const restLines = [
    `${emoji('clipboard')} ${say('Stamina ready:', 'Stamina ready:')} **${chargesBefore}/${limit}**`,
    `${emoji('minus')} ${say('After this shift:', 'After this shift:')} **${chargesAfter}/${limit}**`
  ];
  if (chargesBefore < limit) {
    if (nextChargeAt > 0 && rechargeRemaining > 0) {
      restLines.push(`${emoji('timer')} ${say('Next stamina', 'Next stamina')} <t:${nextChargeAt}:R> (${formatDuration(rechargeRemaining)}).`);
    } else {
      restLines.push(`${emoji('timer')} ${say('Next stamina arriving soon.', 'Next stamina arriving soon.')}`);
    }
  } else {
    restLines.push(`${emoji('sparkles')} ${say('Stamina full — spend one on a shift to start a recharge.', 'Stamina full — spend one on a shift to start a recharge.')}`);
  }
  const restField = {
    name: say('Stamina', 'Stamina'),
    value: restLines.join('\n')
  };
  const descriptionLines = [];
  let boardEmbed = null;

  let dealerStageState = null;
  if (job.id === 'dealer') {
    dealerStageState = ensureStageState(session, stage);
    const promptLines = String(stage.prompt ?? '').split('\n');
    const seatSections = [];
    const additional = [];
    let questionLine = null;
    let boardCards = '';

    for (const rawLine of promptLines) {
      const line = (rawLine || '').trim();
      if (!line) continue;
      if (/^board:/i.test(line)) {
        boardCards = line.slice(line.indexOf(':') + 1).trim();
        continue;
      }
      const seatMatch = line.match(/^Seat ([ABC]):\s*(.*)$/i);
      if (seatMatch) {
        const seatLetter = seatMatch[1].toUpperCase();
        const seatText = seatMatch[2] || '';
        seatSections.push(`**Seat ${seatLetter}:** ${seatText}`);
        continue;
      }
      if (/^who wins\??$/i.test(line)) {
        questionLine = line;
        continue;
      }
      additional.push(line);
    }

    if (additional.length) {
      descriptionLines.push(...additional);
    }
    if (seatSections.length) {
      if (descriptionLines.length) descriptionLines.push('');
      descriptionLines.push(seatSections.join('\n'));
    }
    if (questionLine) {
      descriptionLines.push('');
      descriptionLines.push(`**${questionLine}**`);
    }

    if (boardCards) {
      const boardTitle = say('Main Board', 'Board');
      boardEmbed = new EmbedBuilder()
        .setColor(COLORS[job.id] || COLORS.default)
        .setTitle(`${emoji('boardBanner')} ${boardTitle}`)
        .setDescription(`**${boardCards}**`);
    }
  } else if (stage.prompt) {
    descriptionLines.push(`${stage.prompt}`);
  }

  if (stage.options?.length && job.id !== 'dealer') {
    descriptionLines.push('');
    descriptionLines.push(...stage.options.map(opt => `**${opt.id}.** ${opt.label}`));
  }

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Stage ${stageNumber}/${totalStages}`)
    .setDescription(descriptionLines.join('\n'))
    .setFooter({ text: say('Cancel anytime with End Shift — stamina regenerates every 2h while below cap.', 'Cancel anytime with End Shift — stamina regenerates every 2h while below cap.') });

  const fields = [
    {
      name: say('Score So Far', 'Score So Far'),
      value: `${session.totalScore} / 100`
    },
    {
      name: say('Stage History', 'Stage History'),
      value: buildHistoryLines(session)
    },
    restField
  ].filter(Boolean);

  if (job.id === 'dealer') {
    const attemptsUsed = dealerStageState?.attempts ?? 0;
    const attemptsRemaining = Math.max(0, 3 - attemptsUsed);
    const selectedSeats = Array.isArray(dealerStageState?.selectedHands) && dealerStageState.selectedHands.length
      ? renderDealerSelection(dealerStageState.selectedHands, stage)
      : say('None marked yet.', 'None marked yet.');
    const lastAttempt = dealerStageState?.attemptsLog?.length
      ? dealerStageState.attemptsLog.at(-1)
      : null;
    const statusLines = [
      `${emoji('radioButton')} ${say('Seats marked:', 'Seats marked:')} ${selectedSeats}`,
      `${emoji('timer')} ${say('Attempts left:', 'Attempts left:')} ${attemptsRemaining}`
    ];
    if (lastAttempt) {
      statusLines.push(`${emoji(lastAttempt.correct ? 'check' : 'cross')} ${say('Last submission:', 'Last submission:')} ${lastAttempt.optionId}`);
    }
    fields.push({
      name: say('Stage Status', 'Stage Status'),
      value: statusLines.join('\n')
    });
  } else {
    fields.push({
      name: say('Tips', 'Tips'),
      value: say(
        'First-try clears pay 18 base points (+2 under 6s, +1 under 10s). You get three attempts before the stage busts.',
        'First-try answers earn 18 base points (+2 under 6 seconds, +1 under 10 seconds). Three attempts total before the stage fails.'
      )
    });
  }

  mainEmbed.addFields(fields);
  const art = resolveJobStageImage(job);
  const files = [];
  if (art) {
    mainEmbed.setThumbnail(`attachment://${art.name}`);
    files.push({ attachment: art.attachment, name: art.name });
  }

  const embeds = [];
  if (boardEmbed) embeds.push(boardEmbed);
  embeds.push(mainEmbed);
  return { embeds, files };
}

function buildBartenderIntroEmbed(session, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const job = session.job;
  const jobIcon = jobDisplayIcon(job);
  const menu = session?.bartender?.menu ?? [];
  const firstFeature = menu.length ? menu[0]?.name : say('the feature menu', 'tonight’s feature menu');
  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Prep Brief`)
    .setDescription([
      say('Kitten, let’s warm up the shakers.', 'Time to prep the station.'),
      `${emoji('clipboard')} ${say(
        `Guests will order from ${firstFeature}. Lock in each ingredient exactly as listed — blanks stay blank.`,
        `Guests order from ${firstFeature}. Match every ingredient slot exactly; leave unused slots blank.`
      )}`,
      `${emoji('timer')} ${say(
        'Tap “Open Bar” when you’re ready. Each pour starts the clock — delays over 5s, 7s, and 15s shave 1, 2, then 5 points.',
        'Press “Open Bar” to begin. Every segment over 5s, 7s, and 15s trims 1, 2, then 5 points from your score.'
      )}`,
      `${emoji('warning')} ${say(
        'Shake or stir to finish the drink. You only have three attempts before the guest walks.',
        'Select Shake or Stir to finish. Three attempts max before the order is lost.'
      )}`,
      `${emoji('target')} ${say(
        'Use the ingredient pickers from left to right — blanks are valid if the recipe leaves a slot empty.',
        'Set each ingredient dropdown in order. Choose the blank option when the recipe skips a slot.'
      )}`
    ].join('\n'))
    .addFields(
      {
        name: say('Shift Flow', 'Shift Flow'),
        value: [
          say('- Guests call their drink from the lounge menu.', '- Guests order directly from the lounge menu.'),
          '- Use the ingredient dropdowns in order until every slot matches the recipe.',
          '- Hit Shake or Stir to serve once the build looks right — adjust ingredients before you finish.'
        ].join('\n')
      },
      {
        name: say('Scoring & Penalties', 'Scoring & Penalties'),
        value: [
          say('- Perfect pours start at 20 points; time penalties shave points away.', '- Perfect builds start at 20 points; time penalties reduce the payout.'),
          '- Lingering past 5s/7s/15s on a step deducts 1/2/5 points; incorrect builds only burn attempts.',
          '- You only have three attempts before the drink is lost.'
        ].join('\n')
      }
    );
  return embed;
}

function buildBouncerIntroEmbed(session, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const job = session.job;
  const jobIcon = jobDisplayIcon(job);
  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Briefing`)
    .setDescription([
      say('Ready, Kitten? Tonight’s velvet rope needs your call.', 'Suit up — you’re on door duty.'),
      `${emoji('clipboard')} ${say(
        'Each wave shows a checklist. Verify age, outfit, and wristband before approving anyone.',
        'Every group comes with a checklist. Confirm age, attire, and wristband before letting guests in.'
      )}`,
      `${emoji('target')} ${say(
        'Open the queue to review guests in order. Deny troublemakers, approve matches, and keep the line moving.',
        'Open the queue to inspect guests sequentially. Approve those who match the checklist and leave the rest outside.'
      )}`,
      `${emoji('warning')} ${say(
        'You get three chances per wave — wrong calls cost you the stage.',
        'Only three mistakes per wave before the stage fails, so double-check your picks.'
      )}`,
      `${emoji('doorOpen')} ${say(
        'Use the select menu to tag approved guests, then hit Continue to lock the lineup.',
        'Select every guest you plan to admit, then press Continue to confirm the wave.'
      )}`
    ].join('\n'))
    .addFields(
      {
        name: say('How The Rope Works', 'How The Rope Works'),
        value: [
          say('- Opening the queue shows a fresh group of guests.', '- Opening the queue reveals a new wave of guests.'),
          '- Compare each guest against the age, attire, and wristband checklist.',
          '- Approve only the guests who match every requirement.'
        ].join('\n')
      },
      {
        name: say('Mistakes & Pace', 'Mistakes & Pace'),
        value: [
          '- Three bad calls bust the stage — deny uncertain guests if you are not sure.',
          '- Keep the line moving; quick decisions keep your streak alive.',
          '- You can revisit the select menu before pressing Continue to adjust choices.'
        ].join('\n')
      }
    );
  return embed;
}

function buildDealerIntroEmbed(session, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const job = session.job;
  const jobIcon = jobDisplayIcon(job);
  const descriptionLines = [
    say('Ready to deal, Kitten? Keep it sharp and swift.', 'Ready to deal today? Keep it sharp and swift.'),
    `${emoji('boardBanner')} ${say(
      'Each table shows a board plus three seats. Spot every seat sharing the winning hand.',
      'Each stage shows community cards and three seats. Identify every seat sharing the winning hand.'
    )}`,
    `${emoji('timer')} ${say(
      'Hit “Start Dealing” when you’re ready — the timer fires instantly.',
      'Press “Start Dealing” when you’re ready — the timer starts instantly.'
    )}`
  ];
  const reminders = [
    `${emoji('ballot')} ${say(
      'Use the dropdown to flag every winning seat; you can reopen it until you press Continue.',
      'Use the dropdown to flag every winning seat; you can reopen it until you press Continue.'
    )}`,
    `${emoji('warning')} ${say(
      'Only three attempts per table — miss all three and the house sweeps the pot.',
      'Only three attempts per table — miss all three and the house sweeps the pot.'
    )}`,
    `${emoji('chips')} ${say(
      '<15s:20 pts • <30s:18 • <40s:15 • ≥40s: 45 − time (floored at 0).',
      '<15s:20 pts • <30s:18 • <40s:15 • ≥40s: 45 − time (floored at 0).'
    )}`
  ];
  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Briefing`)
    .setDescription(descriptionLines.join('\n'))
    .addFields({
      name: say('Quick Reminders', 'Quick Reminders'),
      value: reminders.join('\n')
    });
  return embed;
}

function buildBouncerIntroComponents(session) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`jobshift|${session.sessionId}|start`)
        .setLabel('Open Queue')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`jobshift|${session.sessionId}|cancel`)
        .setLabel('End Shift')
        .setEmoji(emoji('stopSign'))
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildBartenderIntroComponents(session) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`jobshift|${session.sessionId}|start`)
        .setLabel('Open Bar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`jobshift|${session.sessionId}|cancel`)
        .setLabel('End Shift')
        .setEmoji(emoji('stopSign'))
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildBouncerStageComponents(session, stage) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`jobshift|${session.sessionId}|approve`)
    .setPlaceholder('Select guests to admit')
    .setMinValues(0)
    .setMaxValues(Math.max(1, Math.min(25, stage.guests.length)))
    .addOptions(stage.guests.map((guest, idx) => ({
      label: guest.name,
      value: guest.name,
      description: `Guest ${idx + 1}`
    })));

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`jobshift|${session.sessionId}|submit`)
        .setLabel('Continue')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`jobshift|${session.sessionId}|cancel`)
        .setLabel('End Shift')
        .setEmoji(emoji('stopSign'))
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildCancelRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jobshift|${sessionId}|cancel`)
      .setLabel('End Shift')
      .setEmoji(emoji('stopSign'))
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildShiftCompleteComponents(session) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`jobstatus|${session.userId}|${session.userId}|start|${session.jobId}`)
        .setLabel('Start Shift Again')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`jobstatus|${session.userId}|${session.userId}|main`)
        .setLabel('Back to Job Status')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildStageComponents(session, stage) {
  if (isBartenderStage(stage, session)) {
    if (session.awaitingStart) {
      return buildBartenderIntroComponents(session);
    }
    return buildBartenderStageComponents(session, stage);
  }
  if (session.jobId === 'bouncer') {
    if (session.awaitingStart) {
      return buildBouncerIntroComponents(session);
    }
    return buildBouncerStageComponents(session, stage);
  }
  if (session.jobId === 'dealer') {
    if (session.awaitingStart) {
      return [buildDealerIntroRow(session.sessionId)];
    }
    return [
      buildDealerSelectRow(session, stage),
      buildDealerActionRow(session.sessionId),
      buildCancelRow(session.sessionId)
    ];
  }
  const rows = chunkButtons(stage.options, session.sessionId);
  rows.push(buildCancelRow(session.sessionId));
  return rows;
}

function buildCooldownMessage(kittenMode, availableAt) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const remain = Math.max(0, availableAt - nowSeconds());
  return [
    `${emoji('hourglassFlow')} ${say('Out of stamina for now, Kitten.', 'You’re out of stamina for now.')}`,
    `${emoji('timer')} ${say('Next stamina', 'Next stamina')} <t:${availableAt}:R> (${formatDuration(remain)}).`,
    `${emoji('repeat')} ${say(`Stamina regenerates one point every ${formatDuration(JOB_SHIFT_RECHARGE_SECONDS)} while you’re below cap.`, `Stamina regenerates one point every ${formatDuration(JOB_SHIFT_RECHARGE_SECONDS)} while you’re below cap.`)}`
  ].join('\n');
}

function buildCooldownError(interaction, kittenMode, availableAt) {
  return replyEphemeral(interaction, {
    content: buildCooldownMessage(kittenMode, availableAt)
  });
}

function buildActiveSessionError(interaction, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  return replyEphemeral(interaction, {
    content: `${emoji('warning')} ${say('You already have a shift in progress, Kitten.', 'You already have an active shift in progress.')}`
  });
}

function buildShiftStatusField(session, status) {
  if (!status) return null;
  const say = (kitten, normal) => (session.kittenMode ? kitten : normal);
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const charges = Math.max(0, Math.min(limit, Number(status.shiftCharges ?? status.shiftsRemaining ?? limit)));
  const nextChargeAt = Number(status.shiftCooldownExpiresAt ?? status.shift_cooldown_expires_at ?? 0);
  const remain = Math.max(0, status.shiftCooldownRemaining ?? (nextChargeAt - nowSeconds()));
  const lines = [
    `${emoji('clipboard')} ${say('Stamina ready:', 'Stamina ready:')} **${charges}/${limit}**`
  ];
  if (charges < limit) {
    if (nextChargeAt > 0 && remain > 0) {
      lines.push(`${emoji('timer')} ${say('Next stamina', 'Next stamina')} <t:${nextChargeAt}:R> (${formatDuration(remain)}).`);
    } else {
      lines.push(`${emoji('timer')} ${say('Next stamina arriving soon.', 'Next stamina arriving soon.')}`);
    }
  } else {
    lines.push(`${emoji('sparkles')} ${say('Stamina full — spend one on a shift to start a recharge.', 'Stamina full — spend one on a shift to start a recharge.')}`);
  }
  return {
    name: say('Stamina', 'Stamina'),
    value: lines.join('\n')
  };
}

function appendHistory(session, record) {
  session.history.push(record);
  // Clamp history to stage count for safety
  if (session.history.length > session.stages.length) {
    session.history = session.history.slice(-session.stages.length);
  }
}

function scheduleSessionTimeout(session) {
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }
  if (!SHIFT_SESSION_TIMEOUT_SECONDS) return;
  if (!Number.isFinite(session.expiresAt)) {
    session.expiresAt = nowSeconds() + SHIFT_SESSION_TIMEOUT_SECONDS;
  }
  const delayMs = Math.max(0, (session.expiresAt * 1000) - Date.now());
  session.timeout = setTimeout(() => {
    expireSession(session.sessionId).catch(err => {
      console.error('job shift expiry error', err);
    });
  }, delayMs);
  if (typeof session.timeout?.unref === 'function') {
    session.timeout.unref();
  }
}

function refreshSessionTimeout(session) {
  session.expiresAt = nowSeconds() + SHIFT_SESSION_TIMEOUT_SECONDS;
  scheduleSessionTimeout(session);
}

async function expireSession(sessionId) {
  const session = sessionsById.get(sessionId);
  if (!session) return;
  if (session.status !== 'ACTIVE') return;
  session.status = 'EXPIRED';
  clearSession(session);

  try {
    const performanceScore = clampScore(session.totalScore);
    const rankBefore = session.profileBefore.rank;
    const xpToNext = session.profileBefore.xpToNext;

    const metadata = buildMetadata(session, {
      performanceScore,
      xpEarned: 0,
      rankBefore,
      rankAfter: rankBefore,
      xpToNext,
      basePay: 0,
      tipPercent: 0,
      tipAmount: 0,
      totalPayout: 0,
      payoutStatus: 'EXPIRED'
    });

    await completeJobShift(session.shiftId, {
      performanceScore,
      basePay: 0,
      tipPercent: 0,
      tipAmount: 0,
      totalPayout: 0,
      resultState: 'EXPIRED',
      metadata
    });

    const shiftStatus = await recordShiftCompletion(session.guildId, session.userId);
    const shiftStatusField = buildShiftStatusField(session, shiftStatus);
    const payoutText = formatPayoutText(session.ctx, session.kittenMode, {
      performanceScore,
      tipPercent: 0,
      maxBasePay: maxBasePayForRank(rankBefore)
    }, { status: 'NO_PAYOUT', basePaid: 0, tipPaid: 0 });

    const say = (kitten, normal) => (session.kittenMode ? kitten : normal);
    const embed = buildCompletionEmbed(session, {
      status: say('Shift Expired, Kitten!', 'Shift Expired'),
      performanceScore,
      xpEarned: 0,
      rankBefore,
      rankAfter: rankBefore,
      xpToNext,
      basePay: 0,
      tipPercent: 0,
      tipAmount: 0,
      totalPayout: 0,
      payoutStatus: 'EXPIRED',
      payoutText,
      shiftStatusField,
      extraNotes: [
        session.kittenMode
          ? `${emoji('warning')} Time’s up — the shift auto-closes after ${SHIFT_SESSION_TIMEOUT_SECONDS / 60} minutes.`
          : `${emoji('warning')} Shift expired after ${SHIFT_SESSION_TIMEOUT_SECONDS / 60} minutes of inactivity.`
      ]
    });

    const expirePayload = { embeds: [embed], components: [] };
    const expireArt = resolveJobStageImage(session.job);
    if (expireArt) {
      embed.setThumbnail(`attachment://${expireArt.name}`);
      expirePayload.files = [{ attachment: expireArt.attachment, name: expireArt.name }];
    }

    if (session.client && session.channelId && session.messageId) {
      try {
        const channel = await session.client.channels.fetch(session.channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(session.messageId).catch(() => null);
          if (message) {
            await message.edit(expirePayload);
          }
        }
      } catch (err) {
        console.error('job shift expiry update message failed', err);
      }
    }
  } catch (err) {
    console.error('job shift expiry finalization failed', err);
  }
}

function buildCompletionEmbed(session, outcome) {
  const say = (kitten, normal) => (session.kittenMode ? kitten : normal);
  const job = session.job;
  const jobIcon = jobDisplayIcon(job);
  const fields = [
    {
      name: say('Performance', 'Performance'),
      value: `${outcome.performanceScore} / 100`
    },
    {
      name: say('XP & Rank', 'XP & Rank'),
      value: say(
        `Gained **${outcome.xpEarned} XP**. Rank ${outcome.rankBefore} → ${outcome.rankAfter} (${outcome.xpToNext} XP to next).`,
        `Earned **${outcome.xpEarned} XP**. Rank ${outcome.rankBefore} → ${outcome.rankAfter} (${outcome.xpToNext} XP to next rank).`
      )
    },
    {
      name: say('Payout', 'Payout'),
      value: outcome.payoutText
    }
  ];
  if (outcome.shiftStatusField) {
    fields.push(outcome.shiftStatusField);
  }
  fields.push({
    name: say('Stage Recap', 'Stage Recap'),
    value: session.history.map(item => {
      const icon = item.status === 'success' ? emoji('check') : emoji('cross');
      return `${icon} Stage ${item.stageNumber}: ${item.title} — ${item.totalScore} pts`;
    }).join('\n') || say('No stages completed.', 'No stages completed.')
  });
  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — ${outcome.status}`)
    .addFields(fields)
    .setFooter({ text: say('Tip payouts use weighted randomness — 0-15% doubled weight.', 'Tip payouts use weighted randomness — 0-15% double weight.') });

  if (outcome.extraNotes?.length) {
    embed.addFields({ name: say('Notes', 'Notes'), value: outcome.extraNotes.join('\n') });
  }

  return embed;
}

function buildMetadata(session, outcome) {
  return {
    jobId: session.jobId,
    stageCount: session.stages.length,
    stages: session.history.map(item => ({
      stageId: item.stageId,
      title: item.title,
      status: item.status,
      attempts: item.attempts,
      baseScore: item.baseScore,
      bonus: item.bonus,
      totalScore: item.totalScore,
      correct: item.correct,
      chosen: item.finalAnswer,
      elapsedMs: item.elapsedMs,
      details: item.details
    })),
    performanceScore: outcome.performanceScore,
    xpEarned: outcome.xpEarned,
    rankBefore: outcome.rankBefore,
    rankAfter: outcome.rankAfter,
    xpToNext: outcome.xpToNext,
    payout: {
      basePay: outcome.basePay,
      tipPercent: outcome.tipPercent,
      tipAmount: outcome.tipAmount,
      totalPayout: outcome.totalPayout,
      status: outcome.payoutStatus
    },
    kittenMode: session.kittenMode,
    startedAt: session.openedAt,
    completedAt: nowSeconds()
  };
}

async function payoutHouse(ctx, guildId, userId, basePay, tipAmount) {
  const remainingBase = Math.max(0, basePay);
  const remainingTip = Math.max(0, tipAmount);
  if (remainingBase === 0 && remainingTip === 0) {
    return { status: 'NO_PAYOUT', basePaid: 0, tipPaid: 0 };
  }

  let status = 'SUCCESS';
  let basePaid = 0;
  let tipPaid = 0;

  const mint = async (amount, reason) => {
    if (!amount) return;
    if (typeof ctx?.mintChips === 'function') {
      return ctx.mintChips(userId, amount, reason, null);
    }
    return mintChips(guildId, userId, amount, reason, null);
  };

  try {
    if (remainingBase > 0) {
      await mint(remainingBase, 'JOB_SHIFT_PAY');
      basePaid = remainingBase;
    }
  } catch (err) {
    console.error('job shift base mint failed', err);
    status = 'ERROR';
    return { status, basePaid: 0, tipPaid: 0, error: err };
  }

  if (remainingTip > 0) {
    try {
      await mint(remainingTip, 'JOB_SHIFT_TIP');
      tipPaid = remainingTip;
    } catch (err) {
      console.error('job shift tip mint failed', err);
      status = 'TIP_SKIPPED';
      tipPaid = 0;
    }
  }

  return { status, basePaid, tipPaid };
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.floor(Number(value) || 0)));
}

function formatPayoutText(ctx, kittenMode, totals, payoutResult) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const fmt = ctx.chipsAmount || (amount => new Intl.NumberFormat('en-US').format(amount));
  if (payoutResult.status === 'ERROR') {
    return say('Unexpected minting error. No chips transferred.', 'Unexpected minting error prevented a payout.');
  }
  const lines = [];
  const hasExplicitCap = totals && Object.prototype.hasOwnProperty.call(totals, 'maxBasePay');
  const rawCap = hasExplicitCap
    ? Number(totals.maxBasePay)
    : Number(totals?.maxPay);
  let baseCap = null;
  if (Number.isFinite(rawCap)) {
    baseCap = hasExplicitCap
      ? Math.max(0, Math.floor(rawCap))
      : Math.max(0, Math.floor(rawCap / JOB_PAYOUT_DIVISOR));
  }
  const capSuffix = baseCap !== null ? ` (cap ${fmt(baseCap)})` : '';
  lines.push(`${emoji('chips')} Base: **${fmt(payoutResult.basePaid)}**${capSuffix}`);
  lines.push(`${emoji('sparkles')} Tip: **${fmt(payoutResult.tipPaid)}** (${totals.tipPercent}%)`);
  lines.push(`${emoji('moneyWings')} Total: **${fmt(payoutResult.basePaid + payoutResult.tipPaid)}**`);
  if (payoutResult.status === 'TIP_SKIPPED') {
    lines.push(say('Tip mint skipped — fluff your staff so they can retry soon.', 'Tip mint failed — logged for review.'));
  }
  return lines.join('\n');
}

async function finalizeShift(interaction, ctx, session) {
  session.status = 'COMPLETED';
  const profileBefore = session.profileBefore;
  const performanceScore = clampScore(session.totalScore);
  const xpEarned = performanceScore;
  const xpResult = applyXpGain(profileBefore, xpEarned);
  const rankBefore = profileBefore.rank;
  const rankAfter = xpResult.rank;
  const xpToNext = xpResult.xpToNext;
  const maxBasePay = maxBasePayForRank(rankBefore);
  const basePay = performanceToBasePay(rankBefore, performanceScore);
  const tipPercent = rollTipPercent({ seed: session.shiftId });
  const tipAmount = calculateTipAmount(basePay, tipPercent);

  const payoutResult = await payoutHouse(ctx, session.guildId, session.userId, basePay, tipAmount);

  await updateJobProfile(session.guildId, session.userId, session.jobId, {
    rank: xpResult.rank,
    totalXp: xpResult.totalXp,
    xpToNext: xpToNext,
    lastShiftAt: session.lastShiftAt || nowSeconds()
  });

  const metadata = buildMetadata(session, {
    performanceScore,
    xpEarned,
    rankBefore,
    rankAfter,
    xpToNext,
    basePay,
    tipPercent,
    tipAmount,
    totalPayout: payoutResult.basePaid + payoutResult.tipPaid,
    payoutStatus: payoutResult.status
  });

  await completeJobShift(session.shiftId, {
    performanceScore,
    basePay: payoutResult.basePaid,
    tipPercent,
    tipAmount: payoutResult.tipPaid,
    totalPayout: payoutResult.basePaid + payoutResult.tipPaid,
    resultState: payoutResult.status === 'SUCCESS' ? 'SUCCESS' : payoutResult.status,
    metadata
  });

  if (typeof ctx?.postCashLog === 'function') {
    const totalPaid = payoutResult.basePaid + payoutResult.tipPaid;
    const jobIcon = jobDisplayIcon(session.job);
    const jobLabel = jobIcon ? `${jobIcon} ${session.job.displayName}` : session.job.displayName;
    const formatAmount = typeof ctx?.chipsAmount === 'function'
      ? amount => ctx.chipsAmount(amount)
      : amount => `${new Intl.NumberFormat('en-US').format(Math.max(0, Number(amount) || 0))} Chips`;
    const statusNotes = {
      SUCCESS: { kitten: '', normal: '' },
      TIP_SKIPPED: {
        kitten: ' — Tip mint hiccup; logging for a retry.',
        normal: ' — Tip mint failed; logged for review.'
      },
      ERROR: {
        kitten: ' — Mint error logged for review.',
        normal: ' — Mint error logged for review.'
      }
    };
    const statusKey = payoutResult.status || 'SUCCESS';
    const statusNote = statusNotes[statusKey] || {
      kitten: ` — Status: ${statusKey}`,
      normal: ` — Status: ${statusKey}`
    };
    const totalLineSuffix = session.kittenMode ? statusNote.kitten : statusNote.normal;
    const logLines = session.kittenMode
      ? [
          `${emoji('briefcase')} **Shift Ledger**`,
          `Role: ${jobLabel}`,
          `Performance: **${performanceScore} / 100**`,
          `Base Tribute: **${formatAmount(payoutResult.basePaid)}**`,
          `Tip Sprinkle (${tipPercent}%): **${formatAmount(payoutResult.tipPaid)}**`,
          `Minted Tribute: **${formatAmount(totalPaid)}**${totalLineSuffix}`
        ]
      : [
          `${emoji('briefcase')} **Job Shift Settled**`,
          `Role: ${jobLabel}`,
          `Performance: **${performanceScore} / 100**`,
          `Base Pay: **${formatAmount(payoutResult.basePaid)}**`,
          `Tip (${tipPercent}%): **${formatAmount(payoutResult.tipPaid)}**`,
          `Chips Minted: **${formatAmount(totalPaid)}**${totalLineSuffix}`
        ];
    try {
      await ctx.postCashLog(interaction, logLines);
    } catch (err) {
      console.error('job shift cash log failed', err);
    }
  }

  const shiftStatus = await recordShiftCompletion(session.guildId, session.userId);
  const shiftStatusField = buildShiftStatusField(session, shiftStatus);

  const payoutText = formatPayoutText(ctx, session.kittenMode, {
    performanceScore,
    tipPercent,
    maxBasePay,
    maxPay: maxPayForRank(rankBefore)
  }, payoutResult);

  const embed = buildCompletionEmbed(session, {
    status: payoutResult.status === 'SUCCESS' ? (session.kittenMode ? 'Shift Complete, Kitten!' : 'Shift Complete!') : 'Shift Complete',
    performanceScore,
    xpEarned,
    rankBefore,
    rankAfter,
    xpToNext,
    basePay: payoutResult.basePaid,
    tipPercent,
    tipAmount: payoutResult.tipPaid,
    totalPayout: payoutResult.basePaid + payoutResult.tipPaid,
    payoutStatus: payoutResult.status,
    shiftStatusField,
    payoutText,
    extraNotes: payoutResult.status === 'TIP_SKIPPED'
      ? [
          session.kittenMode
            ? `${emoji('warning')} Tip mint hiccup — the base pay landed, the tip will be retried soon.`
            : `${emoji('warning')} Tip mint hiccup; the base pay landed, but staff will review the tip.`
        ]
      : payoutResult.status === 'ERROR'
        ? [
            session.kittenMode
              ? `${emoji('warning')} Minting error — no chips moved. Staff has been pinged.`
              : `${emoji('warning')} Minting error prevented a payout. Staff has been notified.`
          ]
      : undefined
  });

  const components = buildShiftCompleteComponents(session);
  const completionPayload = { embeds: [embed], components };
  const completionArt = resolveJobStageImage(session.job);
  if (completionArt) {
    embed.setThumbnail(`attachment://${completionArt.name}`);
    completionPayload.files = [{ attachment: completionArt.attachment, name: completionArt.name }];
  }
  clearSession(session);
  return sendShiftUpdate(interaction, session.ctx || ctx, completionPayload);
}

function stageTimeoutSeconds(attempts) {
  return attempts >= 3 ? 0 : 25;
}

async function cancelSession(session, { editOriginal = false } = {}) {
  const say = (kitten, normal) => (session.kittenMode ? kitten : normal);
  const briefingOnly = session.awaitingStart === true;

  clearSession(session);
  await completeJobShift(session.shiftId, {
    resultState: briefingOnly ? 'BRIEFING_CANCELLED' : 'CANCELLED',
    metadata: buildMetadata(session, {
      performanceScore: session.totalScore,
      xpEarned: 0,
      rankBefore: session.profileBefore.rank,
      rankAfter: session.profileBefore.rank,
      xpToNext: session.profileBefore.xpToNext,
      basePay: 0,
      tipPercent: 0,
      tipAmount: 0,
      totalPayout: 0,
      payoutStatus: briefingOnly ? 'NONE' : 'CANCELLED'
    })
  });
  const profileUpdate = {
    lastShiftAt: session.previousLastShiftAt ?? null,
    rank: session.profileBefore.rank,
    totalXp: session.profileBefore.totalXp,
    xpToNext: session.profileBefore.xpToNext
  };
  if (briefingOnly) {
    const chargesBefore = Math.max(0, Math.min(JOB_SHIFT_STREAK_LIMIT, Number(session.shiftStatusBefore?.shiftsRemaining ?? JOB_SHIFT_STREAK_LIMIT)));
    profileUpdate.shiftsRemaining = chargesBefore;
    profileUpdate.shiftStreakCount = JOB_SHIFT_STREAK_LIMIT - chargesBefore;
  }
  await updateJobProfile(session.guildId, session.userId, session.jobId, profileUpdate);

  const message = briefingOnly
    ? `${emoji('warning')} ${say('Briefing cancelled — shift never started.', 'Briefing cancelled before the shift started.')}`
    : `${emoji('warning')} ${say('Shift cancelled — no penalties applied.', 'Shift cancelled. No XP or chips were awarded.')}`;

  if (editOriginal && session.client && session.channelId && session.messageId) {
    try {
      const channel = await session.client.channels.fetch(session.channelId);
      if (channel && channel.isTextBased()) {
        const msg = await channel.messages.fetch(session.messageId).catch(() => null);
        if (msg) {
          await msg.edit({ content: message, embeds: [], components: [] });
        }
      }
    } catch (err) {
      console.error('job shift cancel message update failed', err);
    }
  }

  return message;
}

function ensureStageState(session, stage) {
  if (!session.stageState) {
    session.stageState = createStageState(session, stage);
  }
  return session.stageState;
}

async function handleCorrect(interaction, ctx, session, stage, stageState) {
  const attempts = stageState.attempts;
  const elapsedMs = Date.now() - stageState.startedAtMs;
  const bartenderStage = isBartenderStage(stage, session);
  const dealerStage = session.jobId === 'dealer';
  const totalStages = Math.max(1, session.stages.length);
  const stageMaxScore = Math.max(1, Math.round(100 / totalStages));
  const scaleScore = value => Math.max(0, Math.round((Number(value) || 0) * stageMaxScore / 20));
  let totalScore;
  let recordDetails = stage.details || null;
  let recordBase = 0;
  let recordBonus = 0;
  if (bartenderStage) {
    const penalties = Math.max(0, Math.floor(stageState.penalties || 0));
    const rawScore = Math.max(0, 20 - penalties);
    totalScore = clampScore(scaleScore(rawScore));
    recordBase = totalScore;
    recordDetails = `Time penalties: -${penalties} pts`;
  } else if (dealerStage) {
    const elapsedSeconds = elapsedMs / 1000;
    const rawScore = calculateDealerScore(elapsedMs);
    totalScore = clampScore(scaleScore(rawScore));
    recordBase = totalScore;
    recordBonus = 0;
    const timeSummary = `Time: ${formatSeconds(elapsedSeconds)}s`;
    if (stage.details) {
      recordDetails = `${stage.details} (${timeSummary})`;
    } else {
      recordDetails = timeSummary;
    }
  } else {
    let baseScore = attempts === 1 ? 18 : attempts === 2 ? 9 : 0;
    let bonus = 0;
    if (baseScore > 0) {
      if (elapsedMs <= 6000) bonus = 2;
      else if (elapsedMs <= 10000) bonus = 1;
    }
    const rawTotal = Math.min(20, baseScore + bonus);
    totalScore = clampScore(scaleScore(rawTotal));
    recordBase = scaleScore(baseScore);
    recordBonus = scaleScore(bonus);
  }
  session.totalScore = clampScore(session.totalScore + totalScore);
  const lastAttempt = stageState.attemptsLog.at(-1);
  const record = {
    stageId: stage.id,
    stageNumber: session.stageIndex + 1,
    title: stage.title,
    status: totalScore > 0 ? 'success' : 'fail',
    attempts,
    baseScore: recordBase,
    bonus: recordBonus,
    totalScore,
    correct: stage.correct,
    finalAnswer: lastAttempt?.optionId ?? stage.correct,
    elapsedMs,
    details: recordDetails
  };
  if (bartenderStage) {
    record.penalties = Math.max(0, Math.floor(stageState.penalties || 0));
  }
  if (session.jobId === 'dealer') {
    record.correct = renderDealerAnswer(stage.correct, stage);
  }
  appendHistory(session, record);
  session.stageState = null;
  session.stageIndex += 1;

  if (session.stageIndex >= session.stages.length) {
    return finalizeShift(interaction, ctx, session);
  }

  const nextStage = session.stages[session.stageIndex];
  session.stageState = createStageState(session, nextStage);
  const { embeds, files } = buildStageEmbeds(session, nextStage, session.kittenMode);
  const payload = { embeds, components: buildStageComponents(session, nextStage) };
  if (files?.length) {
    payload.files = files;
  }
  return sendShiftUpdate(interaction, session.ctx, payload);
}

async function handleIncorrect(interaction, session, stage, stageState) {
  if (stageState.attempts >= 3) {
    const bartenderStage = isBartenderStage(stage, session);
    const record = {
      stageId: stage.id,
      stageNumber: session.stageIndex + 1,
      title: stage.title,
      status: 'fail',
      attempts: stageState.attempts,
      baseScore: 0,
      bonus: 0,
      totalScore: 0,
      correct: stage.correct,
      finalAnswer: stageState.attemptsLog.at(-1)?.optionId,
      elapsedMs: Date.now() - stageState.startedAtMs,
      details: bartenderStage ? `Time penalties: -${Math.max(0, Math.floor(stageState.penalties || 0))} pts` : stage.details || null
    };
    if (bartenderStage) {
      record.penalties = Math.max(0, Math.floor(stageState.penalties || 0));
    }
    if (session.jobId === 'dealer') {
      record.correct = renderDealerAnswer(stage.correct, stage);
    }
    appendHistory(session, record);
    session.stageState = null;
    session.stageIndex += 1;

    if (session.stageIndex >= session.stages.length) {
      return finalizeShift(interaction, session.ctx, session);
    }

    const nextStage = session.stages[session.stageIndex];
    session.stageState = createStageState(session, nextStage);
    const { embeds, files } = buildStageEmbeds(session, nextStage, session.kittenMode);
    const payload = { embeds, components: buildStageComponents(session, nextStage) };
    if (files?.length) {
      payload.files = files;
    }
    return sendShiftUpdate(interaction, session.ctx, payload);
  }

  return replyEphemeral(interaction, {
    content: session.kittenMode
      ? `${emoji('warning')} Not quite, Kitten. Try another pick.`
      : `${emoji('warning')} Not quite. Try another pick.`,
  });
}

export async function handleJobShiftButton(interaction, ctx) {
  const isSelectMenu = typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu();
  const [prefix, sessionId, action, payload] = interaction.customId.split('|');
  if (prefix !== 'jobshift') return false;
  const cancelAutoAck = scheduleInteractionAck(interaction, { timeout: JOB_SHIFT_BUTTON_ACK_MS, mode: 'update' });
  storeJobAutoAck(interaction, cancelAutoAck);
  const session = sessionsById.get(sessionId);
  if (!session) {
    await replyEphemeral(interaction, { content: `${emoji('warning')} Shift session expired.` });
    return true;
  }
  if (interaction.user.id !== session.userId) {
    await replyEphemeral(interaction, { content: `${emoji('warning')} Only the assigned staff member can respond to this shift.` });
    return true;
  }
  if (session.status !== 'ACTIVE') {
    await replyEphemeral(interaction, { content: `${emoji('warning')} This shift is already wrapped.` });
    return true;
  }

  const stage = session.stages[session.stageIndex];
  if (!stage) {
    await replyEphemeral(interaction, { content: `${emoji('warning')} Stage not found for this shift.` });
    return true;
  }

  if (action === 'start') {
    if (!session.awaitingStart) {
      await replyEphemeral(interaction, { content: `${emoji('info')} Shift already underway.` });
      return true;
    }
    session.awaitingStart = false;
    session.stageState = createStageState(session, stage);
    refreshSessionTimeout(session);
    const { embeds, files } = buildStageEmbeds(session, stage, session.kittenMode);
    const components = buildStageComponents(session, stage);
    const updatePayload = { embeds, components };
    if (files?.length) {
      updatePayload.files = files;
    }
    return sendShiftUpdate(interaction, session.ctx || ctx, updatePayload);
  }

  if (session.awaitingStart) {
    const startPrompt = session.jobId === 'bouncer'
      ? 'Press “Open Queue” to begin this shift.'
      : session.jobId === 'dealer'
        ? 'Press “Start Dealing” to begin this shift.'
        : session.jobId === 'bartender'
          ? 'Press “Open Bar” to begin this shift.'
          : 'Press “Start” to begin this shift.';
    await replyEphemeral(interaction, { content: `${emoji('info')} ${startPrompt}` });
    return true;
  }

  refreshSessionTimeout(session);
  const stageState = ensureStageState(session, stage);

  if (isSelectMenu) {
    if (session.jobId === 'dealer' && action === 'select') {
      const seatOrder = Array.isArray(stage.seatSummaries) && stage.seatSummaries.length
        ? stage.seatSummaries.map(summary => String(summary.id).toUpperCase())
        : ['A', 'B', 'C'];
      const allowed = new Set(seatOrder);
      const values = Array.isArray(interaction.values) ? interaction.values : [];
      const unique = Array.from(new Set(values.map(value => String(value).toUpperCase()).filter(value => allowed.has(value))));
      unique.sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
      stageState.selectedHands = unique;
      cancelJobAutoAck(interaction);
      await interaction.deferUpdate();
      return true;
    }
    if (session.jobId === 'bouncer' && action === 'approve') {
      stageState.selectedNames = Array.isArray(interaction.values) ? interaction.values : [];
      cancelJobAutoAck(interaction);
      await interaction.deferUpdate();
      return true;
    }
    if (!isBartenderStage(stage, session) || action !== 'slot') {
      cancelJobAutoAck(interaction);
      return false;
    }
    const slotIndex = Number(payload);
    const blank = getBlankValue(session);
    const value = interaction.values?.[0] ?? blank;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 3) {
      await replyEphemeral(interaction, { content: `${emoji('warning')} Invalid ingredient slot.` });
      return true;
    }
    registerBartenderAction(stageState);
    stageState.picks[slotIndex] = value || blank;
    stageState.lastFeedback = null;
    const { embeds, files } = buildStageEmbeds(session, stage, session.kittenMode);
    const components = buildStageComponents(session, stage);
    const updatePayload = { embeds, components };
    if (files?.length) {
      updatePayload.files = files;
    }
    return sendShiftUpdate(interaction, session.ctx || ctx, updatePayload);
  }

  if (action === 'submit' && session.jobId === 'bouncer') {
    const selected = Array.isArray(stageState.selectedNames) ? stageState.selectedNames : [];
    const uniqueSelected = Array.from(new Set(selected));
    stageState.attempts += 1;
    stageState.attemptsLog.push({
      optionId: uniqueSelected.join(',') || 'DENY ALL',
      correct: false,
      at: Date.now()
    });

    const correctNames = Array.isArray(stage.correctNames) ? stage.correctNames : [];
    const success = compareNameSelections(uniqueSelected, correctNames);
    if (success) {
      stageState.attemptsLog[stageState.attemptsLog.length - 1].correct = true;
      return handleCorrect(interaction, ctx, session, stage, stageState);
    }
    return handleIncorrect(interaction, session, stage, stageState);
  }

  if (action === 'continue' && session.jobId === 'dealer') {
    const selected = Array.isArray(stageState.selectedHands) ? stageState.selectedHands : [];
    if (!selected.length) {
      await replyEphemeral(interaction, { content: `${emoji('warning')} Choose at least one seat before continuing.` });
      return true;
    }
    const normalized = normalizeDealerSelection(selected, stage);
    if (!normalized) {
      await replyEphemeral(interaction, { content: `${emoji('warning')} Invalid seat selection. Try again.` });
      return true;
    }
    const attemptLabel = renderDealerSelection(selected, stage);
    stageState.attempts += 1;
    stageState.attemptsLog.push({
      optionId: attemptLabel,
      correct: normalized === stage.correct,
      at: Date.now()
    });
    if (normalized === stage.correct) {
      return handleCorrect(interaction, ctx, session, stage, stageState);
    }
    return handleIncorrect(interaction, session, stage, stageState);
  }

  if (action === 'technique' && isBartenderStage(stage, session)) {
    if (payload !== 'shake' && payload !== 'stir') {
      await replyEphemeral(interaction, { content: `${emoji('warning')} Unknown technique option.` });
      return true;
    }
    registerBartenderAction(stageState);
    stageState.hasTimerStarted = false;
    stageState.technique = payload;
    stageState.attempts += 1;
    const result = evaluateBartenderSubmission(session, stage);
    const blank = getBlankValue(session);
    const picksSummary = stageState.picks
      .map((value, idx) => {
        if (!value || value === blank) return '—';
        return value;
      })
      .slice(0, 4)
      .join(' → ');
    stageState.attemptsLog.push({
      optionId: `${picksSummary} | ${stageState.technique ? stageState.technique.toUpperCase() : '?'}`,
      correct: result.success,
      at: Date.now()
    });

    if (result.success) {
      stageState.lastFeedback = null;
      return handleCorrect(interaction, ctx, session, stage, stageState);
    }

    stageState.lastFeedback = result.message || `${emoji('warning')} That build isn’t right yet.`;

    if (stageState.attempts >= 3) {
      await handleIncorrect(interaction, session, stage, stageState);
      if (result.message) {
        await followUpEphemeral(interaction, { content: result.message });
      }
      return true;
    }

    await replyEphemeral(interaction, { content: result.message || `${emoji('warning')} Not quite right.` });
    const { embeds, files } = buildStageEmbeds(session, stage, session.kittenMode);
    const components = buildStageComponents(session, stage);
    const editPayload = { embeds, components };
    if (files?.length) {
      editPayload.files = files;
    }
    await interaction.message.edit(editPayload);
    return true;
  }

  if (action === 'cancel') {
    const message = await cancelSession(session);
    await sendShiftUpdate(interaction, session.ctx || ctx, {
      content: message,
      embeds: [],
      components: []
    });
    return true;
  }

  if (action === 'answer') {
    const optionId = payload;
    stageState.attempts += 1;
    stageState.attemptsLog.push({ optionId, correct: optionId === stage.correct, at: Date.now() });

    if (optionId === stage.correct) {
      return handleCorrect(interaction, ctx, session, stage, stageState);
    }
    return handleIncorrect(interaction, session, stage, stageState);
  }

  cancelJobAutoAck(interaction);
  return false;
}

export async function startJobShift(interaction, ctx, jobInput) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const isComponentInteraction = typeof interaction.isMessageComponent === 'function'
    ? interaction.isMessageComponent()
    : false;
  const jobId = String(jobInput || '').trim().toLowerCase();
  if (!jobId) {
    return replyEphemeral(interaction, {
      content: `${emoji('question')} ${say('Tell me which job you want, Kitten — try `/job start dealer`.', 'Choose a job with `/job start <job>` to begin.')}`
    });
  }

  const job = getJobById(jobId);
  if (!job) {
    return replyEphemeral(interaction, {
      content: `${emoji('question')} ${say('I don’t recognize that job badge yet.', 'Unknown job option.')}`
    });
  }

  const status = await getJobStatusForUser(guildId, userId);
  const charges = Number(status?.shiftCharges ?? status?.shiftsRemaining ?? JOB_SHIFT_STREAK_LIMIT);
  if (charges <= 0) {
    const availableAt = Number(status?.shiftCooldownExpiresAt ?? status?.shift_cooldown_expires_at ?? 0) || (nowSeconds() + JOB_SHIFT_RECHARGE_SECONDS);
    return buildCooldownError(interaction, kittenMode, availableAt);
  }

  const existing = sessionsByUser.get(userKey(guildId, userId));
  if (existing) {
    return buildActiveSessionError(interaction, kittenMode);
  }

  const profile = await ensureJobProfile(guildId, userId, jobId);
  const now = nowSeconds();

  let stages;
  let bartenderData = null;

  if (jobId === 'bartender') {
    const plan = generateBartenderShift(JOB_SHIFT_STAGE_COUNT);
    bartenderData = {
      menu: plan.menu,
      ingredients: plan.ingredients,
      blankValue: plan.blankValue
    };
    stages = plan.stages;
  } else {
    stages = generateStagesForJob(jobId, JOB_SHIFT_STAGE_COUNT).map(stage => ({
      ...stage,
      options: stage.options.map(opt => ({
        id: String(opt.id),
        label: opt.label,
        emoji: opt.emoji || null
      })),
      correct: String(stage.correct)
    }));
  }

  const shift = await createJobShift(guildId, userId, jobId, {
    metadata: { jobId, stageIds: stages.map(s => s.id) }
  });

  await updateJobProfile(guildId, userId, jobId, {
    lastShiftAt: now,
    rank: profile.rank,
    totalXp: profile.totalXp,
    xpToNext: profile.xpToNext
  });

  const session = {
    sessionId: crypto.randomUUID(),
    shiftId: shift.id,
    guildId,
    userId,
    jobId,
    job,
    bartender: bartenderData,
    profileBefore: profile,
    previousLastShiftAt: profile.lastShiftAt ?? null,
    lastShiftAt: now,
    openedAt: now,
    kittenMode,
    shiftStatusBefore: {
      shiftsRemaining: charges,
      shiftCharges: charges,
      shiftCooldownExpiresAt: Number(status?.shiftCooldownExpiresAt ?? status?.shift_cooldown_expires_at ?? 0)
    },
    totalScore: 0,
    stageIndex: 0,
    stages,
    stageState: null,
    awaitingStart: jobId === 'bouncer' || jobId === 'dealer' || jobId === 'bartender',
    history: [],
    status: 'ACTIVE',
    ctx,
    expiresAt: now + SHIFT_SESSION_TIMEOUT_SECONDS,
    timeout: null,
    client: interaction.client,
    channelId: interaction.channelId,
    messageId: null
  };
  if (isComponentInteraction && interaction.message) {
    session.messageId = interaction.message.id;
    session.channelId = interaction.message.channelId ?? session.channelId;
  }

  registerSession(session);
  refreshSessionTimeout(session);

  const respond = async payload => {
    let success = true;
    let message = null;
    try {
      if (isComponentInteraction) {
        await interaction.update(payload);
        message = interaction.message ?? null;
      } else if (interaction.deferred || interaction.replied) {
        message = await interaction.editReply(payload);
      } else {
        await interaction.reply(payload);
      }
      if (!message) {
        if (isComponentInteraction) {
          message = interaction.message ?? null;
        } else {
          try {
            message = await interaction.fetchReply();
          } catch {
            message = null;
          }
        }
      }
    } catch (err) {
      console.error('job shift initial response failed', err);
       success = false;
    }
    if (message) {
      session.messageId = message.id;
      session.channelId = message.channelId ?? session.channelId;
    }
    return success;
  };

  if (session.awaitingStart) {
    if (session.jobId === 'bouncer') {
      const introEmbed = buildBouncerIntroEmbed(session, kittenMode);
      const introComponents = buildBouncerIntroComponents(session);
      const preview = resolveJobStageImage(session.job);
      const payload = preview
        ? {
            embeds: [introEmbed],
            components: introComponents,
            files: [{ attachment: preview.attachment, name: preview.name }]
          }
        : { embeds: [introEmbed], components: introComponents };
      if (preview) {
        introEmbed.setThumbnail(`attachment://${preview.name}`);
      }
      return await respond(payload);
    }
    if (session.jobId === 'dealer') {
      const introEmbed = buildDealerIntroEmbed(session, kittenMode);
      const introComponents = [buildDealerIntroRow(session.sessionId)];
      const preview = resolveJobStageImage(session.job);
      const payload = preview
        ? {
            embeds: [introEmbed],
            components: introComponents,
            files: [{ attachment: preview.attachment, name: preview.name }]
          }
        : { embeds: [introEmbed], components: introComponents };
      if (preview) {
        introEmbed.setThumbnail(`attachment://${preview.name}`);
      }
      return await respond(payload);
    }
    if (session.jobId === 'bartender') {
      const introEmbed = buildBartenderIntroEmbed(session, kittenMode);
      const introComponents = buildBartenderIntroComponents(session);
      const preview = resolveJobStageImage(session.job);
      const payload = preview
        ? {
            embeds: [introEmbed],
            components: introComponents,
            files: [{ attachment: preview.attachment, name: preview.name }]
          }
        : { embeds: [introEmbed], components: introComponents };
      if (preview) {
        introEmbed.setThumbnail(`attachment://${preview.name}`);
      }
      return await respond(payload);
    }
  }

  const currentStage = stages[0];
  session.stageState = createStageState(session, currentStage);
  const { embeds, files } = buildStageEmbeds(session, currentStage, kittenMode);
  const components = buildStageComponents(session, currentStage);

  const payload = { embeds, components };
  if (files?.length) {
    payload.files = files;
  }

  return await respond(payload);
}

export async function cancelActiveShiftForUser(guildId, userId) {
  const session = sessionsByUser.get(userKey(guildId, userId));
  if (!session) {
    return { cancelled: false, reason: 'NO_SESSION' };
  }
  const message = await cancelSession(session, { editOriginal: true });
  return { cancelled: true, message };
}

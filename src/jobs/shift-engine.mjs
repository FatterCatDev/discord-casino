import crypto from 'node:crypto';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import {
  ensureJobProfile,
  updateJobProfile,
  createJobShift,
  completeJobShift
} from '../db/db.auto.mjs';
import { getJobStatusForUser, recordShiftCompletion, JOB_SHIFT_STREAK_LIMIT, JOB_SHIFT_STREAK_COOLDOWN_SECONDS } from './status.mjs';
import { getJobById } from './registry.mjs';
import { generateStagesForJob, generateBartenderShift } from './scenarios/index.mjs';
import {
  applyXpGain,
  performanceToBasePay,
  rollTipPercent,
  calculateTipAmount,
  clampPerformance,
  JOB_SHIFT_STAGE_COUNT,
  maxPayForRank
} from './progression.mjs';
import { emoji } from '../lib/emojis.mjs';

const sessionsById = new Map();
const sessionsByUser = new Map();

const SHIFT_SESSION_TIMEOUT_SECONDS = 120;

const COLORS = {
  bartender: 0xff9b54,
  dealer: 0x3498db,
  bouncer: 0x9b59b6,
  default: 0x5865f2
};

function userKey(guildId, userId) {
  return `${guildId}:${userId}`;
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
  const body = ensureEphemeralPayload(payload);
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(body);
  }
  return interaction.reply(body);
}

function followUpEphemeral(interaction, payload) {
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
  if (seconds > 7) penalty = 5;
  else if (seconds > 5) penalty = 2;
  else if (seconds > 3) penalty = 1;
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
  const menuChunks = chunkTextLines(bartenderMenuLines(menu));
  const drink = stage.drink ?? {};
  const ingredientLines = Array.isArray(drink.ingredients)
    ? drink.ingredients.map((item, idx) => `${idx + 1}. ${item}`)
    : [];
  const techniqueLabel = (drink.technique || '').toUpperCase();

  const orderLines = [
    `**${drink.name || say('Mystery Order', 'Unknown Order')}**`,
    ''
  ];
  if (ingredientLines.length) {
    orderLines.push(...ingredientLines);
    orderLines.push('');
  }
  orderLines.push(`${say('Finish', 'Finish')}: **${techniqueLabel || '—'}**`);

  const orderEmbed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${emoji('clipboard')} ${say('Order Ticket', 'Order Ticket')}`)
    .setDescription(orderLines.join('\n'));

  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Stage ${stageNumber}/${totalStages}`)
    .setDescription([
      stage.prompt,
      '',
      say('Select each ingredient in order, Kitten, then finish with the right move.', 'Pick each ingredient in order, then choose the correct finish.')
    ].join('\n'))
    .addFields(
      {
        name: say('Score So Far', 'Score So Far'),
        value: `${session.totalScore} / 100`
      },
      {
        name: say('Your Build', 'Your Build'),
        value: formatBartenderBuild(stageState, blank)
      },
      {
        name: say('Stage History', 'Stage History'),
        value: buildHistoryLines(session)
      }
    );

  const limit = JOB_SHIFT_STREAK_LIMIT;
  const beforeRemaining = Number(session.shiftStatusBefore?.shiftsRemaining ?? limit);
  const afterRemaining = Math.max(0, beforeRemaining - 1);
  const streakAfter = Math.min(limit, Number(session.shiftStatusBefore?.streakCount ?? 0) + 1);
  embed.addFields({
    name: say('Rest Tracker', 'Rest Tracker'),
    value: say(
      `After this run you’ll have **${afterRemaining}** ${afterRemaining === 1 ? 'shift' : 'shifts'} before cooldown.`,
      `After this run you’ll have **${afterRemaining}** ${afterRemaining === 1 ? 'shift' : 'shifts'} before the ${formatDuration(JOB_SHIFT_STREAK_COOLDOWN_SECONDS)} rest (${streakAfter}/${limit} this burst).`
    )
  });

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

  menuChunks.forEach((chunk, idx) => {
    embed.addFields({
      name: idx === 0 ? say('Tonight’s Menu', 'Tonight’s Menu') : say('Menu (cont.)', 'Menu (cont.)'),
      value: chunk
    });
  });

  return [orderEmbed, embed];
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
  const errors = [];

  for (let i = 0; i < required.length; i += 1) {
    const expected = required[i];
    const received = picks[i];
    if (expected !== received) {
      errors.push(`Ingredient ${i + 1} should be **${expected}**.`);
    }
  }

  for (let i = required.length; i < picks.length; i += 1) {
    const received = picks[i];
    if (received && received !== blank) {
      errors.push(`Ingredient slot ${i + 1} must remain blank.`);
    }
  }

  if (!state.technique) {
    errors.push('Select whether to shake or stir the drink.');
  } else if (state.technique !== stage.drink.technique) {
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
  const job = session.job;
  const stageNumber = session.stageIndex + 1;
  const totalStages = session.stages.length;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const jobIcon = jobDisplayIcon(job);
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const beforeRemaining = Number(session.shiftStatusBefore?.shiftsRemaining ?? limit);
  const afterRemaining = Math.max(0, beforeRemaining - 1);
  const streakAfter = Math.min(limit, Number(session.shiftStatusBefore?.streakCount ?? 0) + 1);
  const restField = {
    name: say('Rest Tracker', 'Rest Tracker'),
    value: say(
      `After this run you’ll have **${afterRemaining}** ${afterRemaining === 1 ? 'shift' : 'shifts'} before cooldown.`,
      `After this run you’ll have **${afterRemaining}** ${afterRemaining === 1 ? 'shift' : 'shifts'} before the ${formatDuration(JOB_SHIFT_STREAK_COOLDOWN_SECONDS)} rest (${streakAfter}/${limit} in this cycle).`
    )
  };
  const descriptionLines = [];
  let boardEmbed = null;

  if (job.id === 'dealer') {
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
  if (job.id === 'dealer') {
    descriptionLines.push('');
    descriptionLines.push('Select all winning seat(s) from the dropdown, then press Continue.');
    descriptionLines.push('Finish under 15s for 20 pts, under 30s for 18 pts, under 40s for 15 pts. Any slower pays (45 − your time) with zero at 45s.');
  }

  const mainEmbed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Stage ${stageNumber}/${totalStages}`)
    .setDescription(descriptionLines.join('\n'))
    .setFooter({ text: say('Cancel anytime with End Shift - rest after five shifts (6h cooldown)', 'Cancel anytime with End Shift - rest after five shifts (6h cooldown)') });

  const fields = [
    {
      name: say('Score So Far', 'Score So Far'),
      value: `${session.totalScore} / 100`
    },
    {
      name: say('Stage History', 'Stage History'),
      value: buildHistoryLines(session)
    },
    restField,
    {
      name: say('Tips', 'Tips'),
      value: job.id === 'dealer'
        ? say(
          'Pick every winning seat fast: <15s pays 20 pts, <30s pays 18 pts, <40s pays 15 pts — beyond that you earn 45 - time (40s = 5 pts). Three attempts max.',
          'Select every winning seat quickly: under 15s is 20 pts, under 30s is 18 pts, under 40s is 15 pts, then the payout becomes 45 minus your time (floor 0). Only three submissions per table.'
        )
        : say(
          'First-try clears pay 18 base points (+2 under 6s, +1 under 10s). You get three attempts before the stage busts.',
          'First-try answers earn 18 base points (+2 under 6 seconds, +1 under 10 seconds). Three attempts total before the stage fails.'
        )
    }
  ].filter(Boolean);

  mainEmbed.addFields(fields);
  const embeds = [];
  if (boardEmbed) embeds.push(boardEmbed);
  embeds.push(mainEmbed);
  return embeds;
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
        'Tap “Open Bar” when you’re ready. Each pour starts the clock — slow builds add penalties.',
        'Press “Open Bar” to begin. Every action starts the timer and time penalties add up.'
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
          '- Slow segments add time penalties — incorrect builds simply consume attempts.',
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
  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Briefing`)
    .setDescription([
      say('Ready to deal, Kitten?', 'Ready to deal today?'),
      `${emoji('boardBanner')} ${say(
        'Each table reveals a board plus three seats. Identify the seat(s) with the best poker hand.',
        'Every stage shows community cards and three players. Figure out which seat(s) hold the top hand.'
      )}`,
      `${emoji('timer')} ${say(
        'Tap “Start Dealing” to reveal Stage 1 — your timer starts immediately.',
        'Press “Start Dealing” to open Stage 1. The timer starts right away, so scan fast.'
      )}`,
      `${emoji('target')} ${say(
        'Use the dropdown to mark every winning seat. Submit within 15 seconds for full payout — under 30s still pays 18 pts, under 40s pays 15 pts, then the bank pays 45 minus your time.',
        'Select every winning seat from the dropdown. Finishing under 15s pays 20 points, under 30s pays 18, under 40s pays 15, and beyond that the pot equals 45 minus your time (seconds).'
      )}`,
      `${emoji('doorOpen')} ${say(
        'Press Continue to lock in your seats. You can revisit the dropdown until you submit.',
        'Confirm your picks with Continue — you may reopen the dropdown until you submit.'
      )}`,
      `${emoji('warning')} ${say(
        'You still only get three attempts — bust the table and you lose the pot.',
        'You have three attempts per table. Blow them all and the table busts.'
      )}`
    ].join('\n'))
    .addFields(
      {
        name: say('How To Deal', 'How To Deal'),
        value: [
          '- Study the community board and each seat’s hole cards.',
          '- Determine the best poker hand, considering splits and kickers.',
          '- Select every seat sharing the top hand before you press Continue.'
        ].join('\n')
      },
      {
        name: say('Scoring Tiers', 'Scoring Tiers'),
        value: [
          '- <15s: 20 pts | <30s: 18 pts | <40s: 15 pts.',
          '- ≥40s: payout = 45 − time (40s = 5 pts, 45s = 0).',
          '- Three incorrect submissions bust the table.'
        ].join('\n')
      }
    );
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
    .setMaxValues(Math.min(4, stage.guests.length))
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
    `${emoji('hourglassFlow')} ${say(`Cooldown triggered — ${JOB_SHIFT_STREAK_LIMIT} shifts back-to-back is the max, Kitten.`, `Cooldown triggered — ${JOB_SHIFT_STREAK_LIMIT} shifts back-to-back hits the limit.`)}`,
    `${emoji('timer')} ${say('Next shift window opens', 'Next shift window opens')} <t:${availableAt}:R> (${formatDuration(remain)}).`,
    `${emoji('repeat')} ${say(`Cooldown length: ${formatDuration(JOB_SHIFT_STREAK_COOLDOWN_SECONDS)}.`, `Cooldown lasts ${formatDuration(JOB_SHIFT_STREAK_COOLDOWN_SECONDS)}.`)}`
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
  if (status.onShiftCooldown) {
    const expiresAt = Number(status.shiftCooldownExpiresAt ?? status.shift_cooldown_expires_at ?? 0);
    const remain = Math.max(0, status.shiftCooldownRemaining ?? (expiresAt - nowSeconds()));
    return {
      name: say('Rest Status', 'Rest Status'),
      value: `${emoji('hourglassFlow')} ${say('Cooldown active — lounge until the timer clears.', 'Cooldown active until the timer clears.')} ${say('Back on duty', 'Next shift')} <t:${expiresAt}:R> (${formatDuration(remain)}).`
    };
  }
  const streak = Number(status.shiftStreakCount ?? status.shift_streak_count ?? 0);
  const remaining = Number(status.shiftsRemaining ?? Math.max(0, limit - streak));
  const word = remaining === 1 ? say('shift', 'shift') : say('shifts', 'shifts');
  return {
    name: say('Rest Status', 'Rest Status'),
    value: `${emoji('clipboard')} ${say('Shifts before rest:', 'Shifts before rest:')} **${remaining}** ${word} (${streak}/${limit} used).`
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
      maxPay: maxPayForRank(rankBefore)
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

    if (session.client && session.channelId && session.messageId) {
      try {
        const channel = await session.client.channels.fetch(session.channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(session.messageId).catch(() => null);
          if (message) {
            await message.edit({ embeds: [embed], components: [] });
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
  let remainingBase = Math.max(0, basePay);
  let remainingTip = Math.max(0, tipAmount);
  if (remainingBase === 0 && remainingTip === 0) {
    return { status: 'NO_PAYOUT', basePaid: 0, tipPaid: 0 };
  }

  let status = 'SUCCESS';
  let basePaid = 0;
  let tipPaid = 0;

  try {
    if (remainingBase > 0) {
      await ctx.transferFromHouseToUser(userId, remainingBase, 'JOB_SHIFT_PAY', null);
      basePaid = remainingBase;
    }
  } catch (err) {
    status = err?.message === 'INSUFFICIENT_HOUSE' ? 'HOUSE_INSUFFICIENT' : 'ERROR';
    return { status, basePaid: 0, tipPaid: 0, error: err };
  }

  if (remainingTip > 0) {
    try {
      await ctx.transferFromHouseToUser(userId, remainingTip, 'JOB_SHIFT_TIP', null);
      tipPaid = remainingTip;
    } catch (err) {
      status = err?.message === 'INSUFFICIENT_HOUSE' ? 'TIP_SKIPPED' : 'ERROR';
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
  if (payoutResult.status === 'HOUSE_INSUFFICIENT') {
    return say(
      `House bank is low — no chips paid this time (score ${totals.performanceScore}).`,
      `House bank couldn’t cover the payout. No chips were paid this run.`
    );
  }
  if (payoutResult.status === 'ERROR') {
    return say('Unexpected payout error. No chips transferred.', 'Unexpected payout error prevented a payout.');
  }
  const lines = [];
  lines.push(`${emoji('chips')} Base: **${fmt(payoutResult.basePaid)}** (cap ${fmt(totals.maxPay)})`);
  lines.push(`${emoji('sparkles')} Tip: **${fmt(payoutResult.tipPaid)}** (${totals.tipPercent}%)`);
  lines.push(`${emoji('moneyWings')} Total: **${fmt(payoutResult.basePaid + payoutResult.tipPaid)}**`);
  if (payoutResult.status === 'TIP_SKIPPED') {
    lines.push(say('Tip skipped — house balance dipped mid-transfer.', 'Tip skipped — house balance dipped mid-transfer.'));
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
  const maxPay = maxPayForRank(rankBefore);
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

  const shiftStatus = await recordShiftCompletion(session.guildId, session.userId);
  const shiftStatusField = buildShiftStatusField(session, shiftStatus);

  const payoutText = formatPayoutText(ctx, session.kittenMode, {
    performanceScore,
    tipPercent,
    maxPay
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
    extraNotes: payoutResult.status === 'HOUSE_INSUFFICIENT'
      ? [
          session.kittenMode
            ? `${emoji('warning')} House bank ran low. Try again once the vault is topped off.`
            : `${emoji('warning')} House balance dropped below the payout. Ask an admin to top it off.`
        ]
      : undefined
  });

  clearSession(session);
  return interaction.update({ embeds: [embed], components: [] });
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
    profileUpdate.shiftsRemaining = Number(session.shiftStatusBefore?.shiftsRemaining ?? JOB_SHIFT_STREAK_LIMIT);
    profileUpdate.shiftStreakCount = Number(session.shiftStatusBefore?.streakCount ?? session.shiftStatusBefore?.shiftCount ?? 0);
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
  let totalScore;
  let recordDetails = stage.details || null;
  let recordBase = 0;
  let recordBonus = 0;
  if (bartenderStage) {
    const penalties = Math.max(0, Math.floor(stageState.penalties || 0));
    totalScore = Math.max(0, 20 - penalties);
    recordBase = totalScore;
    recordDetails = `Time penalties: -${penalties} pts`;
  } else if (dealerStage) {
    const elapsedSeconds = elapsedMs / 1000;
    totalScore = calculateDealerScore(elapsedMs);
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
    totalScore = Math.min(20, baseScore + bonus);
    recordBase = baseScore;
    recordBonus = bonus;
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
  const embeds = buildStageEmbeds(session, nextStage, session.kittenMode);
  return interaction.update({ embeds, components: buildStageComponents(session, nextStage) });
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
    const embeds = buildStageEmbeds(session, nextStage, session.kittenMode);
    return interaction.update({ embeds, components: buildStageComponents(session, nextStage) });
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
    const embeds = buildStageEmbeds(session, stage, session.kittenMode);
    const components = buildStageComponents(session, stage);
    return interaction.update({ embeds, components });
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
      await interaction.deferUpdate();
      return true;
    }
    if (session.jobId === 'bouncer' && action === 'approve') {
      stageState.selectedNames = Array.isArray(interaction.values) ? interaction.values : [];
      await interaction.deferUpdate();
      return true;
    }
    if (!isBartenderStage(stage, session) || action !== 'slot') {
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
    const embeds = buildStageEmbeds(session, stage, session.kittenMode);
    const components = buildStageComponents(session, stage);
    return interaction.update({ embeds, components });
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
    const embeds = buildStageEmbeds(session, stage, session.kittenMode);
    const components = buildStageComponents(session, stage);
    await interaction.message.edit({ embeds, components });
    return true;
  }

  if (action === 'cancel') {
    const message = await cancelSession(session);
    await interaction.update({
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

  return false;
}

export async function startJobShift(interaction, ctx, jobInput) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
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
  if (status?.onShiftCooldown) {
    const availableAt = Number(status.shiftCooldownExpiresAt ?? status.shift_cooldown_expires_at ?? 0) || (nowSeconds() + JOB_SHIFT_STREAK_COOLDOWN_SECONDS);
    return buildCooldownError(interaction, kittenMode, availableAt);
  }

  const remaining = Number(status?.shiftsRemaining ?? (JOB_SHIFT_STREAK_LIMIT - (status?.shiftStreakCount ?? 0)));
  if (remaining <= 0) {
    const availableAt = Number(status?.shiftCooldownExpiresAt ?? status?.shift_cooldown_expires_at ?? 0) || (nowSeconds() + JOB_SHIFT_STREAK_COOLDOWN_SECONDS);
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
      shiftsRemaining: remaining,
      streakCount: Number(status?.shiftStreakCount ?? status?.shift_streak_count ?? 0)
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

  registerSession(session);
  refreshSessionTimeout(session);

  const respond = async payload => {
    let success = true;
    let message = null;
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(payload);
      }
      try {
        message = await interaction.fetchReply();
      } catch (err) {
        // Ephemeral messages cannot be fetched; that’s fine.
        message = null;
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
      return await respond({ embeds: [introEmbed], components: introComponents });
    }
    if (session.jobId === 'dealer') {
      const introEmbed = buildDealerIntroEmbed(session, kittenMode);
      const introComponents = [buildDealerIntroRow(session.sessionId)];
      return await respond({ embeds: [introEmbed], components: introComponents });
    }
    if (session.jobId === 'bartender') {
      const introEmbed = buildBartenderIntroEmbed(session, kittenMode);
      const introComponents = buildBartenderIntroComponents(session);
      return await respond({ embeds: [introEmbed], components: introComponents });
    }
  }

  const currentStage = stages[0];
  session.stageState = createStageState(session, currentStage);
  const embeds = buildStageEmbeds(session, currentStage, kittenMode);
  const components = buildStageComponents(session, currentStage);

  return await respond({ embeds, components });
}

export async function cancelActiveShiftForUser(guildId, userId) {
  const session = sessionsByUser.get(userKey(guildId, userId));
  if (!session) {
    return { cancelled: false, reason: 'NO_SESSION' };
  }
  const message = await cancelSession(session, { editOriginal: true });
  return { cancelled: true, message };
}

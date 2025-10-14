import crypto from 'node:crypto';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  ensureJobProfile,
  updateJobProfile,
  createJobShift,
  completeJobShift
} from '../db/db.auto.mjs';
import { getJobStatusForUser, recordShiftCompletion, JOB_SHIFT_STREAK_LIMIT, JOB_SHIFT_STREAK_COOLDOWN_SECONDS } from './status.mjs';
import { getJobById } from './registry.mjs';
import { generateStagesForJob } from './scenarios/index.mjs';
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

function buildHistoryLines(session) {
  if (!session.history.length) return 'No stages completed yet.';
  return session.history.map(item => {
    const icon = item.status === 'success' ? '✅' : '❌';
    let detail = `${icon} Stage ${item.stageNumber}: ${item.title} — ${item.totalScore} pts`;
    if (item.status === 'success') {
      const attemptText = item.attempts === 1 ? 'first try' : item.attempts === 2 ? 'second try' : 'final try';
      const speedText = item.bonus > 0 ? `, +${item.bonus} speed` : '';
      detail += ` (${attemptText}${speedText})`;
    } else {
      detail += ' (timed out)';
    }
    return detail;
  }).join('\n');
}

function jobDisplayIcon(job) {
  return job?.emojiKey ? emoji(job.emojiKey) : job?.icon || '';
}

function buildStageEmbed(session, stage, kittenMode) {
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
  const embed = new EmbedBuilder()
    .setColor(COLORS[job.id] || COLORS.default)
    .setTitle(`${jobIcon} ${job.displayName} Shift — Stage ${stageNumber}/${totalStages}`)
    .setDescription([
      `${stage.prompt}`,
      '',
      ...stage.options.map(opt => `**${opt.id}.** ${opt.label}`)
    ].join('\n'))
    .addFields(
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
        value: say(
          'Perfect first taps earn 18 base points (+2 speed bonus under 6s). You have three tries before the stage busts.',
          'First-try answers earn 18 base points (+2 speed bonus under 6s). Three attempts max before the stage busts.'
        )
      }
    )
    .setFooter({ text: say('Cancel anytime with End Shift - rest after five shifts (6h cooldown)', 'Cancel anytime with End Shift - rest after five shifts (6h cooldown)') });
  return embed;
}

function buildCancelRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jobshift|${sessionId}|cancel`)
      .setLabel('End Shift')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildStageComponents(session, stage) {
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
  return interaction.reply({
    content: buildCooldownMessage(kittenMode, availableAt),
    ephemeral: true
  });
}

function buildActiveSessionError(interaction, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  return interaction.reply({
    content: `${emoji('warning')} ${say('You already have a shift in progress, Kitten.', 'You already have an active shift in progress.')}`,
    ephemeral: true
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
  if (!SHIFT_SESSION_TIMEOUT_SECONDS) return;
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
      const icon = item.status === 'success' ? '✅' : '❌';
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

function ensureStageState(session) {
  if (!session.stageState) {
    session.stageState = {
      startedAtMs: Date.now(),
      attempts: 0,
      attemptsLog: []
    };
  }
  return session.stageState;
}

async function handleCorrect(interaction, ctx, session, stage, stageState) {
  const attempts = stageState.attempts;
  let baseScore = attempts === 1 ? 18 : attempts === 2 ? 9 : 0;
  const elapsedMs = Date.now() - stageState.startedAtMs;
  let bonus = 0;
  if (baseScore > 0) {
    if (elapsedMs <= 6000) bonus = 2;
    else if (elapsedMs <= 10000) bonus = 1;
  }
  const totalScore = Math.min(20, baseScore + bonus);
  session.totalScore = clampScore(session.totalScore + totalScore);
  const record = {
    stageId: stage.id,
    stageNumber: session.stageIndex + 1,
    title: stage.title,
    status: baseScore > 0 ? 'success' : 'fail',
    attempts,
    baseScore,
    bonus,
    totalScore,
    correct: stage.correct,
    finalAnswer: stage.correct,
    elapsedMs,
    details: stage.details || null
  };
  appendHistory(session, record);
  session.stageState = null;
  session.stageIndex += 1;

  if (session.stageIndex >= session.stages.length) {
    return finalizeShift(interaction, ctx, session);
  }

  const nextStage = session.stages[session.stageIndex];
  session.stageState = { startedAtMs: Date.now(), attempts: 0, attemptsLog: [] };
  const embed = buildStageEmbed(session, nextStage, session.kittenMode);
  return interaction.update({ embeds: [embed], components: buildStageComponents(session, nextStage) });
}

async function handleIncorrect(interaction, session, stage, stageState) {
  if (stageState.attempts >= 3) {
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
      details: stage.details || null
    };
    appendHistory(session, record);
    session.stageState = null;
    session.stageIndex += 1;

    if (session.stageIndex >= session.stages.length) {
      return finalizeShift(interaction, session.ctx, session);
    }

    const nextStage = session.stages[session.stageIndex];
    session.stageState = { startedAtMs: Date.now(), attempts: 0, attemptsLog: [] };
    const embed = buildStageEmbed(session, nextStage, session.kittenMode);
    return interaction.update({ embeds: [embed], components: buildStageComponents(session, nextStage) });
  }

  return interaction.reply({
    content: session.kittenMode
      ? `${emoji('warning')} Not quite, Kitten. Try another button.`
      : `${emoji('warning')} Not quite. Take another shot.`,
    ephemeral: true
  });
}

export async function handleJobShiftButton(interaction, ctx) {
  const [prefix, sessionId, action, payload] = interaction.customId.split('|');
  if (prefix !== 'jobshift') return false;
  const session = sessionsById.get(sessionId);
  if (!session) {
    await interaction.reply({ content: `${emoji('warning')} Shift session expired.`, ephemeral: true });
    return true;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({ content: `${emoji('warning')} Only the assigned staff member can respond to this shift.`, ephemeral: true });
    return true;
  }
  if (session.status !== 'ACTIVE') {
    await interaction.reply({ content: `${emoji('warning')} This shift is already wrapped.`, ephemeral: true });
    return true;
  }

  if (action === 'cancel') {
    clearSession(session);
    await completeJobShift(session.shiftId, {
      resultState: 'CANCELLED',
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
        payoutStatus: 'CANCELLED'
      })
    });
    await updateJobProfile(session.guildId, session.userId, session.jobId, {
      lastShiftAt: session.previousLastShiftAt ?? null,
      rank: session.profileBefore.rank,
      totalXp: session.profileBefore.totalXp,
      xpToNext: session.profileBefore.xpToNext
    });
    const say = (kitten, normal) => (session.kittenMode ? kitten : normal);
    await interaction.update({
      content: `${emoji('warning')} ${say('Shift cancelled — no penalties applied.', 'Shift cancelled. No XP or chips were awarded.')}`,
      embeds: [],
      components: []
    });
    return true;
  }

  if (action === 'answer') {
    const stage = session.stages[session.stageIndex];
    if (!stage) {
      await interaction.reply({ content: `${emoji('warning')} No stage found for this shift.`, ephemeral: true });
      return true;
    }
    const optionId = payload;
    const stageState = ensureStageState(session);
    stageState.attempts += 1;
    stageState.attemptsLog.push({ optionId, correct: optionId === stage.correct, at: Date.now() });

    if (optionId === stage.correct) {
      return handleCorrect(interaction, ctx, session, stage, stageState);
    }
    if (stageState.attempts >= 3) {
      return handleIncorrect(interaction, session, stage, stageState);
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
    return interaction.reply({
      content: `${emoji('question')} ${say('Tell me which job you want, Kitten — try `/job start dealer`.', 'Choose a job with `/job start <job>` to begin.')}`,
      ephemeral: true
    });
  }

  const job = getJobById(jobId);
  if (!job) {
    return interaction.reply({
      content: `${emoji('question')} ${say('I don’t recognize that job badge yet.', 'Unknown job option.')}`,
      ephemeral: true
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

  const stages = generateStagesForJob(jobId, JOB_SHIFT_STAGE_COUNT).map(stage => ({
    ...stage,
    options: stage.options.map(opt => ({
      id: String(opt.id),
      label: opt.label,
      emoji: opt.emoji || null
    }))
  }));

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
    stageState: { startedAtMs: Date.now(), attempts: 0, attemptsLog: [] },
    history: [],
    status: 'ACTIVE',
    ctx
  };

  registerSession(session);

  const currentStage = stages[0];
  const embed = buildStageEmbed(session, currentStage, kittenMode);
  const components = buildStageComponents(session, currentStage);

  await interaction.reply({ embeds: [embed], components });
  return true;
}

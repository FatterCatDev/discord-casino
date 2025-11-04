import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { listJobs, getJobById } from '../jobs/registry.mjs';
import { emoji } from '../lib/emojis.mjs';
import { getJobStatusForUser, JOB_SHIFT_STREAK_LIMIT, JOB_SHIFT_RECHARGE_SECONDS } from '../jobs/status.mjs';
import {
  ensureJobProfile,
  listJobProfilesForUser,
  listJobShiftsForUser,
  updateJobProfile,
  setJobStatus
} from '../db/db.auto.mjs';
import { rankTitle } from '../jobs/ranks.mjs';
import { xpToNextForRank, maxBasePayForRank } from '../jobs/progression.mjs';
import { startJobShift, cancelActiveShiftForUser } from '../jobs/shift-engine.mjs';

const JOB_STATUS_COLORS = {
  bartender: 0xff9b54,
  dealer: 0x3498db,
  bouncer: 0x9b59b6,
  default: 0x5865f2
};

const JOB_STATUS_IMAGES = {
  main: 'job.png',
  bartender: 'jobBarTender.png',
  dealer: 'jobDealer.png',
  bouncer: 'jobBouncer.png'
};

function buildSay(kittenMode) {
  return (kittenText, normalText) => (kittenMode ? kittenText : normalText);
}

function formatDuration(totalSeconds) {
  let remaining = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const units = [
    { label: 'd', value: 86400 },
    { label: 'h', value: 3600 },
    { label: 'm', value: 60 },
    { label: 's', value: 1 }
  ];
  const parts = [];
  for (const unit of units) {
    if (remaining < unit.value) continue;
    const count = Math.floor(remaining / unit.value);
    remaining -= count * unit.value;
    parts.push(`${count}${unit.label}`);
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(' ') : '0s';
}

function jobDisplayIcon(job) {
  return job?.emojiKey ? emoji(job.emojiKey) : job?.icon || '';
}

function jobAssetPath(fileName) {
  if (!fileName) return null;
  try {
    return fileURLToPath(new URL(`../../Assets/${fileName}`, import.meta.url));
  } catch {
    return null;
  }
}

function formatStaminaRemaining(status, say) {
  if (!status) return say('Tracker warming up.', 'Stamina tracker warming up.');
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const charges = Number(status.shiftCharges ?? status.shiftsRemaining ?? limit);
  const staminaWord = charges === 1 ? say('stamina point', 'stamina point') : say('stamina points', 'stamina points');
  return say(
    `**${charges}/${limit}** ${staminaWord} ready for shifts.`,
    `**${charges}/${limit}** ${staminaWord} ready for shifts.`
  );
}

function formatStaminaCooldownStatus(status, nowSeconds, say) {
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const charges = Number(status?.shiftCharges ?? status?.shiftsRemaining ?? limit);
  const nextChargeAt = Number(status?.shiftCooldownExpiresAt ?? status?.shift_cooldown_expires_at ?? 0);
  const remaining = Math.max(0, nextChargeAt - nowSeconds);
  if (charges >= limit) {
    return say(
      `Stamina full — spend one on a shift to start a ${formatDuration(JOB_SHIFT_RECHARGE_SECONDS)} recharge.`,
      `Stamina full — spend one on a shift to trigger the ${formatDuration(JOB_SHIFT_RECHARGE_SECONDS)} recharge.`
    );
  }
  if (remaining <= 0 || !nextChargeAt) {
    return say('Next stamina arriving shortly.', 'Next stamina arriving shortly.');
  }
  return say(
    `Next stamina point for shifts <t:${nextChargeAt}:R> (${formatDuration(remaining)}).`,
    `Next stamina point for shifts <t:${nextChargeAt}:R> (${formatDuration(remaining)}).`
  );
}

function profileSummaryLines(job, profile, say) {
  const rank = profile?.rank || 1;
  const totalXp = profile?.totalXp ?? profile?.total_xp ?? 0;
  const xpToNext = profile?.xpToNext ?? profile?.xp_to_next ?? 100;
  const lastShift = profile?.lastShiftAt ?? profile?.last_shift_at ?? null;
  const rankName = rankTitle(rank);
  const lines = [];
  lines.push(`${emoji('star')} Rank **${rank} · ${rankName}**`);
  lines.push(`${emoji('books')} Total XP: **${totalXp}**`);
  lines.push(rank >= 10
    ? `${emoji('sparkles')} Max rank reached`
    : `${emoji('target')} XP to next: **${xpToNext}**`);
  lines.push(lastShift
    ? `${emoji('hourglassFlow')} Last shift <t:${lastShift}:R>`
    : `${emoji('seedling')} No shifts logged yet`);
  return lines.join('\n');
}

function buildPayTableLines(profile) {
  const currentRank = Math.max(1, Math.min(10, Number(profile?.rank ?? 1) || 1));
  const chipsIcon = emoji('chips');
  const formatter = new Intl.NumberFormat('en-US');
  return Array.from({ length: 10 }, (_, idx) => {
    const rank = idx + 1;
    const rankLabel = rank === currentRank ? `**Rank ${rank}**` : `Rank ${rank}`;
    const payAmount = formatter.format(maxBasePayForRank(rank));
    return `${rankLabel} — ${chipsIcon} ${payAmount}`;
  });
}

export async function fetchProfiles(guildId, userId) {
  const existing = await listJobProfilesForUser(guildId, userId);
  const map = new Map(existing.map(p => [p.jobId || p.job_id, p]));
  for (const job of listJobs()) {
    if (!map.has(job.id)) {
      const profile = await ensureJobProfile(guildId, userId, job.id);
      map.set(job.id, profile);
    }
  }
  return map;
}

function normalizeShiftJobId(shift) {
  const value = shift?.jobId ?? shift?.job_id ?? '';
  return String(value || '').trim().toLowerCase();
}

function formatRecentShiftLines(shifts, say, { limit = 5, jobId = null } = {}) {
  const targetJob = jobId ? String(jobId).trim().toLowerCase() : null;
  const source = Array.isArray(shifts) ? shifts : [];
  const filtered = targetJob
    ? source.filter(shift => normalizeShiftJobId(shift) === targetJob)
    : source;
  if (!filtered.length) {
    return [`• ${say('No shifts recorded yet.', 'No shifts recorded yet.')}`];
  }
  return filtered.slice(0, limit).map(shift => {
    const job = getJobById(normalizeShiftJobId(shift));
    const icon = jobDisplayIcon(job);
    const label = job ? `${icon ? `${icon} ` : ''}${job.displayName}` : (shift.jobId || shift.job_id || 'Unknown Job');
    const performance = shift.performanceScore ?? shift.performance_score ?? 0;
    const result = (shift.resultState || shift.result_state || 'PENDING').toUpperCase();
    const finished = shift.completedAt ?? shift.completed_at ?? null;
    const when = finished ? `<t:${finished}:R>` : say('In progress', 'In progress');
    return `• ${label} — ${performance} pts (${result}) • ${when}`;
  });
}

function buildJobStatusMainEmbed(kittenMode, status, shifts, nowSeconds, userId) {
  const say = buildSay(kittenMode);
  const lines = [
    `Inspecting: <@${userId}>`,
    `Stamina: ${formatStaminaRemaining(status, say)}`,
    `Stamina Recharge: ${formatStaminaCooldownStatus(status, nowSeconds, say)}`,
    '',
    'Recent Shifts:'
  ];
  const recentLines = formatRecentShiftLines(shifts, say, { limit: 5 });
  return new EmbedBuilder()
    .setColor(JOB_STATUS_COLORS.default)
    .setTitle(say('Job Status', 'Job Status'))
    .setDescription([...lines, ...recentLines].join('\n'));
}

function buildJobStatusJobEmbed(kittenMode, status, profile, job, shifts, nowSeconds, userId) {
  const say = buildSay(kittenMode);
  const description = [say(job.tagline?.kitten ?? job.tagline?.normal ?? job.displayName, job.tagline?.normal ?? job.displayName)];
  if (job.fantasy) {
    description.push(job.fantasy);
  }
  const embed = new EmbedBuilder()
    .setColor(JOB_STATUS_COLORS[job.id] || JOB_STATUS_COLORS.default)
    .setTitle(`${jobDisplayIcon(job)} ${job.displayName} — ${say('Job Status', 'Job Status')}`)
    .setDescription(description.join('\n'))
    .addFields(
      {
        name: say('Inspecting', 'Inspecting'),
        value: `<@${userId}>`,
        inline: true
      },
      {
        name: say('Stamina', 'Stamina'),
        value: formatStaminaRemaining(status, say),
        inline: true
      },
      {
        name: say('Recharge', 'Recharge'),
        value: formatStaminaCooldownStatus(status, nowSeconds, say),
        inline: true
      },
      {
        name: say('Progress', 'Progress'),
        value: profileSummaryLines(job, profile, say)
      }
    );

  embed.addFields({
    name: say('Pay Table', 'Pay Table'),
    value: buildPayTableLines(profile).join('\n')
  });
  return embed;
}

function chunkButtons(buttons) {
  const rows = [];
  let bucket = [];
  for (const button of buttons) {
    bucket.push(button);
    if (bucket.length === 5) {
      rows.push(new ActionRowBuilder().addComponents(...bucket));
      bucket = [];
    }
  }
  if (bucket.length) {
    rows.push(new ActionRowBuilder().addComponents(...bucket));
  }
  return rows;
}

function buildJobStatusComponents(userId, selectedJobId = null, kittenMode = false, viewerId = null) {
  const buttons = [];
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`jobstatus|${userId}|${viewerId ?? userId}|main`)
      .setLabel('Main')
      .setStyle(selectedJobId ? ButtonStyle.Secondary : ButtonStyle.Primary)
  );
  for (const job of listJobs()) {
    const isActive = job.id === selectedJobId;
    const button = new ButtonBuilder()
      .setCustomId(`jobstatus|${userId}|${viewerId ?? userId}|job|${job.id}`)
      .setLabel(job.displayName)
      .setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary);
    if (job.emojiKey) {
      button.setEmoji(emoji(job.emojiKey));
    }
    buttons.push(button);
  }
  const rows = chunkButtons(buttons);
  if (selectedJobId && (!viewerId || viewerId === userId)) {
    const say = buildSay(kittenMode);
    const startButton = new ButtonBuilder()
      .setCustomId(`jobstatus|${userId}|${viewerId ?? userId}|start|${selectedJobId}`)
      .setLabel(say('Start Shift', 'Start Shift'))
      .setStyle(ButtonStyle.Success);
    rows.push(new ActionRowBuilder().addComponents(startButton));
  }
  return rows;
}

export function buildJobStatusPayload({
  kittenMode,
  status,
  profiles,
  shifts,
  userId,
  nowSeconds,
  jobId = null,
  viewerId = null
}) {
  const normalizedJobId = jobId ? String(jobId).trim().toLowerCase() : null;
  const job = normalizedJobId ? getJobById(normalizedJobId) : null;
  const profile = job ? profiles?.get(job.id) ?? null : null;
  const embed = job
    ? buildJobStatusJobEmbed(kittenMode, status, profile, job, shifts, nowSeconds, userId)
    : buildJobStatusMainEmbed(kittenMode, status, shifts, nowSeconds, userId);
  const components = buildJobStatusComponents(userId, job?.id ?? null, kittenMode, viewerId);
  const imageKey = job ? (JOB_STATUS_IMAGES[job.id] || JOB_STATUS_IMAGES.main) : JOB_STATUS_IMAGES.main;
  const files = [];
  const asset = jobAssetPath(imageKey);
  if (asset && imageKey) {
    embed.setThumbnail(`attachment://${imageKey}`);
    files.push({ attachment: asset, name: imageKey });
  }
  const payload = { embeds: [embed], components };
  if (files.length) {
    payload.files = files;
  }
  return payload;
}

export default async function handleJob(interaction, ctx) {
  const guildId = interaction.guildId;
  const userId = interaction.user?.id;
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = buildSay(kittenMode);

  const userOption = typeof interaction.options?.getUser === 'function'
    ? interaction.options.getUser('user')
    : null;

  let action = interaction.options?.getString?.('action') || null;
  if (action) {
    action = action.toLowerCase();
  } else {
    try {
      const sub = interaction.options.getSubcommand(false);
      action = sub ? sub.toLowerCase() : null;
    } catch {
      action = null;
    }
  }
  if (!action || action === 'overview' || action === 'main') {
    action = 'status';
  }

  if (!guildId) {
    return interaction.reply({
      content: say('Jobs only exist inside the casino, Kitten.', 'Jobs are only available inside a server.'),
      ephemeral: true
    });
  }

  if (!userId) {
    return interaction.reply({
      content: say('I need to know who is clocking in, Kitten.', 'Unable to resolve your user ID.'),
      ephemeral: true
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const selfStatus = await getJobStatusForUser(guildId, userId);

  if (action === 'status') {
    const targetId = userOption?.id ?? userId;
    const targetStatus = targetId === userId
      ? selfStatus
      : await getJobStatusForUser(guildId, targetId);
    const profiles = await fetchProfiles(guildId, targetId);
    const shifts = await listJobShiftsForUser(guildId, targetId, 6);
    const payload = buildJobStatusPayload({
      kittenMode,
      status: targetStatus,
      profiles,
      shifts,
      userId: targetId,
      nowSeconds: now,
      viewerId: userId
    });
    if (targetId === userId) {
      return interaction.reply({ ...payload });
    }
    return interaction.reply({ ...payload, ephemeral: true });
  }

  if (action === 'cancel') {
    const result = await cancelActiveShiftForUser(guildId, userId);
    if (!result.cancelled) {
      return interaction.reply({
        content: `${emoji('info')} ${say('No active shifts to cancel right now, Kitten.', 'You have no active job shifts to cancel.')}`,
        ephemeral: true
      });
    }
    return interaction.reply({ content: result.message, ephemeral: true });
  }

  if (action === 'start') {
    const jobId = interaction.options.getString('job');
    if (!jobId) {
      return interaction.reply({
        content: `${emoji('question')} ${say('Name the job you want to run, Kitten.', 'Pick a job to start a shift.')}`,
        ephemeral: true
      });
    }
    const started = await startJobShift(interaction, ctx, jobId);
    if (!started) {
      const payload = { content: `${emoji('warning')} ${say('Something went wrong starting that shift.', 'Couldn’t start the shift. Try again shortly.')}` };
      if (interaction.replied || interaction.deferred) {
        return interaction.editReply(payload);
      }
      return interaction.reply(payload);
    }
    return;
  }

  if (action === 'reset') {
    if (!(await ctx.isAdmin(interaction))) {
      return interaction.reply({
        content: `${emoji('warning')} ${say('Only my headliners can use this reset lever, Kitten.', 'Only administrators can run this reset.')}`,
        ephemeral: true
      });
    }

    const targetId = (interaction.options.getUser('user') ?? interaction.user).id;
    const targetMention = `<@${targetId}>`;
    const forSelf = targetId === userId;

    const profiles = await fetchProfiles(guildId, targetId);
    await setJobStatus(guildId, targetId, {
      job_switch_available_at: 0,
      cooldown_reason: null,
      earned_today: 0,
      cap_reset_at: null,
      shift_streak_count: JOB_SHIFT_STREAK_LIMIT,
      shift_cooldown_expires_at: 0
    });

    const updates = [];
    for (const [jobId] of profiles.entries()) {
      updates.push(updateJobProfile(guildId, targetId, jobId, { lastShiftAt: null }));
    }
    await Promise.all(updates);

    return interaction.reply({
      content: forSelf
        ? `${emoji('hammerWrench')} ${say('Stamina fully restored. You can run five back-to-back shifts right now, Kitten.', 'Stamina refilled. You can run five shifts before the next rest period.')}`
        : `${emoji('hammerWrench')} ${say(`Stamina topped off for ${targetMention}. They can run five fresh shifts in a row.`, `Stamina refilled for ${targetMention}. They can run five shifts before the next rest.`)}`,
      ephemeral: true
    });
  }

  if (action === 'resetstats') {
    if (!(await ctx.isAdmin(interaction))) {
      return interaction.reply({
        content: `${emoji('warning')} ${say('Only my headliners can reset stats, Kitten.', 'Only administrators can reset job stats.')}`,
        ephemeral: true
      });
    }

    const targetId = (interaction.options.getUser('user') ?? interaction.user).id;
    const targetMention = `<@${targetId}>`;
    const forSelf = targetId === userId;

    const profiles = await fetchProfiles(guildId, targetId);
    const updates = [];
    const baseXpToNext = xpToNextForRank(1);

    for (const [jobId] of profiles.entries()) {
      updates.push(updateJobProfile(guildId, targetId, jobId, {
        rank: 1,
        totalXp: 0,
        xpToNext: baseXpToNext,
        lastShiftAt: null
      }));
    }

    await setJobStatus(guildId, targetId, {
      active_job: 'none',
      job_switch_available_at: 0,
      cooldown_reason: null,
      daily_earning_cap: null,
      earned_today: 0,
      cap_reset_at: null,
      shift_streak_count: JOB_SHIFT_STREAK_LIMIT,
      shift_cooldown_expires_at: 0
    });

    await Promise.all(updates);

    const jobCount = profiles.size || listJobs().length;
    return interaction.reply({
      content: forSelf
        ? `${emoji('sparkles')} ${say(`Fresh slate! Ranks, XP, and shift timers reset across ${jobCount} jobs — stamina fully recharged.`, `Stats reset. Your ranks, XP, and shift timers across ${jobCount} jobs are back to defaults with full stamina.`)}`
        : `${emoji('sparkles')} ${say(`Reset ranks, XP, and shift timers for ${targetMention} across ${jobCount} jobs — stamina fully recharged.`, `Stats reset for ${targetMention} across ${jobCount} jobs — shift timers cleared and stamina recharged.`)}`,
      ephemeral: true
    });
  }

  if (action === 'stats') {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const targetId = target.id;
    const targetStatus = await getJobStatusForUser(guildId, targetId);
    const profiles = await fetchProfiles(guildId, targetId);
    const shifts = await listJobShiftsForUser(guildId, targetId, 6);
    const payload = buildJobStatusPayload({
      kittenMode,
      status: targetStatus,
      profiles,
      shifts,
      userId: targetId,
      nowSeconds: now,
      viewerId: userId
    });
    return interaction.reply(payload);
  }

  return interaction.reply({
    content: `${emoji('warning')} ${say('That job action isn’t recognized yet, Kitten.', 'Unknown job action.')}`,
    ephemeral: true
  });
}

import { EmbedBuilder } from 'discord.js';
import { listJobs, getJobById } from '../jobs/registry.mjs';
import { emoji } from '../lib/emojis.mjs';
import { getJobStatusForUser, JOB_SHIFT_STREAK_LIMIT, JOB_SHIFT_STREAK_COOLDOWN_SECONDS } from '../jobs/status.mjs';
import {
  ensureJobProfile,
  listJobProfilesForUser,
  listJobShiftsForUser,
  updateJobProfile,
  setJobStatus
} from '../db/db.auto.mjs';
import { rankTitle } from '../jobs/ranks.mjs';
import { xpToNextForRank } from '../jobs/progression.mjs';
import { startJobShift } from '../jobs/shift-engine.mjs';

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

function formatShiftsRemaining(status, say) {
  if (!status) return say('Tracker warming up.', 'Shift tracker warming up.');
  if (status.onShiftCooldown) {
    return say('None — cooldown in effect.', 'On cooldown — 0 shifts available.');
  }
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const streak = Number(status.shiftStreakCount ?? status.shift_streak_count ?? 0);
  const remaining = Number(status.shiftsRemaining ?? Math.max(0, limit - streak));
  const word = remaining === 1 ? say('shift', 'shift') : say('shifts', 'shifts');
  return say(
    `**${remaining}** ${word} left (streak ${streak}/${limit}).`,
    `**${remaining}** ${word} left (streak ${streak}/${limit}).`
  );
}

function formatCooldownStatus(status, nowSeconds, say) {
  const limit = JOB_SHIFT_STREAK_LIMIT;
  const expiresAt = Number(status?.shiftCooldownExpiresAt ?? status?.shift_cooldown_expires_at ?? 0);
  const remaining = Math.max(0, expiresAt - nowSeconds);
  if (!status?.onShiftCooldown || remaining <= 0) {
    return say(
      `Rest triggers after ${limit} shifts — cooldown lasts ${formatDuration(JOB_SHIFT_STREAK_COOLDOWN_SECONDS)}.`,
      `Rest triggers after ${limit} shifts — cooldown lasts ${formatDuration(JOB_SHIFT_STREAK_COOLDOWN_SECONDS)}.`
    );
  }
  return say(
    `Back on the floor <t:${expiresAt}:R> (${formatDuration(remaining)}).`,
    `Next shift window <t:${expiresAt}:R> (${formatDuration(remaining)}).`
  );
}

function buildShiftStatusLines(status, say, nowSeconds) {
  if (status?.onShiftCooldown) {
    return [
      `${emoji('hourglassFlow')} ${say('Cooldown active — lounge for a bit, Kitten.', 'Cooldown active — take a breather.')}`,
      `${emoji('timer')} ${formatCooldownStatus(status, nowSeconds, say)}`
    ];
  }
  return [
    `${emoji('clipboard')} ${say('Shifts before rest:', 'Shifts before rest:')} ${formatShiftsRemaining(status, say)}`,
    `${emoji('timer')} ${formatCooldownStatus(status, nowSeconds, say)}`
  ];
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

async function fetchProfiles(guildId, userId) {
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

function buildOverviewEmbed(kittenMode, status, profiles, nowSeconds) {
  const say = buildSay(kittenMode);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(say('Kitten Career Board', 'Casino Job Board'))
    .setDescription([
      say('Each shift is a five-stage gauntlet with XP, rank, and chip payouts on the line.', 'Each shift runs five stages with XP, rank, and chip payouts on the line.'),
      `${emoji('sparkles')} ${say('Use `/job start <job>` to clock in anywhere.', 'Use `/job start <job>` to clock in for any role.')}`,
      ...buildShiftStatusLines(status, say, nowSeconds)
    ].join('\n'));

  for (const job of listJobs()) {
    const profile = profiles.get(job.id);
    const icon = jobDisplayIcon(job);
    embed.addFields({
      name: `${icon} ${job.displayName}`,
      value: `${say(job.tagline.kitten, job.tagline.normal)}
${job.fantasy}
${profileSummaryLines(job, profile, say)}`
    });
  }

  return embed;
}

function buildTransferResponse(result, kittenMode, nowSeconds) {
  const say = buildSay(kittenMode);
  const status = result.status;
  const job = status.jobDefinition;
  const previous = result.previousJob;
  const cooldownRemaining = Math.max(0, status.job_switch_available_at - nowSeconds);
  const lines = [];
  if (job) {
        const icon = jobDisplayIcon(job);
        lines.push(`${emoji('check')} ${say(`You’re clocked in as ${job.displayName}, Kitten.`, `Active job set to ${job.displayName}.`)} ${icon}`.trim());
  } else {
    lines.push(`${emoji('check')} ${say('Shift rotation cleared — you’re off-duty for now, Kitten.', 'Shift rotation cleared — you’re off-duty for now.')}`);
  }
  if (previous && job) {
    lines.push(`${emoji('repeat')} ${say(`Swapped from ${previous.displayName}.`, `Swapped from ${previous.displayName}.`)}`);
  } else if (previous && !job) {
    lines.push(`${emoji('repeat')} ${say(`You stepped away from ${previous.displayName}.`, `You stepped away from ${previous.displayName}.`)}`);
  }
  if (cooldownRemaining > 0) {
    lines.push(`${emoji('timer')} ${say('Next transfer available', 'Next transfer available')} <t:${status.job_switch_available_at}:R> (${formatDuration(cooldownRemaining)}).`);
  } else {
    lines.push(`${emoji('sparkles')} ${say('Transfer window is open if you change your mind.', 'Transfer window is open if you change your mind.')}`);
  }
  return lines.join('\n');
}

function buildStatsEmbed(kittenMode, status, profiles, recentShifts, nowSeconds) {
  const say = buildSay(kittenMode);
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(say('Shift dossier', 'Shift dossier'))
    .addFields(
      {
        name: say('Active Job', 'Active Job'),
        value: summarizeActiveJob(status, say),
        inline: true
      },
      {
        name: say('Transfer Cooldown', 'Transfer Cooldown'),
        value: formatTransferStatus(status, nowSeconds, say),
        inline: true
      }
    );

  for (const job of listJobs()) {
    const profile = profiles.get(job.id);
    const icon = jobDisplayIcon(job);
    embed.addFields({
      name: `${icon} ${job.displayName}`,
      value: profileSummaryLines(job, profile, say)
    });
  }

  if (recentShifts.length) {
    const lines = recentShifts.map(shift => {
      const job = getJobById(shift.jobId || shift.job_id);
      const icon = jobDisplayIcon(job);
      const label = job ? `${icon} ${job.displayName}` : shift.jobId;
      const performance = shift.performanceScore ?? shift.performance_score ?? 0;
      const total = shift.totalPayout ?? shift.total_payout ?? 0;
      const result = (shift.resultState || shift.result_state || 'PENDING').toUpperCase();
      const finished = shift.completedAt ?? shift.completed_at;
      const when = finished ? `<t:${finished}:R>` : 'in progress';
      return `${label} — ${performance} pts, ${total} chips (${result}) • ${when}`;
    }).slice(0, 6);
    embed.addFields({
      name: say('Recent Shifts', 'Recent Shifts'),
      value: lines.join('\n')
    });
  } else {
    embed.addFields({
      name: say('Recent Shifts', 'Recent Shifts'),
      value: say('No shifts recorded yet. Start one with `/job start`.', 'No shifts recorded yet. Use `/job start` to begin.')
    });
  }

  return embed;
}

export default async function handleJob(interaction, ctx) {
  const guildId = interaction.guildId;
  const userId = interaction.user?.id;
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = buildSay(kittenMode);

  let subcommand = 'overview';
  try {
    subcommand = interaction.options.getSubcommand(false) ?? 'overview';
  } catch {
    subcommand = 'overview';
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
  const status = await getJobStatusForUser(guildId, userId);

  if (subcommand === 'overview') {
    const profiles = await fetchProfiles(guildId, userId);
    const embed = buildOverviewEmbed(kittenMode, status, profiles, now);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (subcommand === 'transfer') {
    const jobId = interaction.options.getString('job', true);
    try {
      const result = await transferJob(guildId, userId, jobId);
      const text = buildTransferResponse(result, kittenMode, now);
      return interaction.reply({ content: text, ephemeral: true });
    } catch (err) {
      if (err?.code === 'JOB_SWITCH_COOLDOWN') {
        const remaining = Math.max(0, Number(err.remainingSeconds || 0));
        const availableAt = Number(err.availableAt || 0);
        return interaction.reply({
          content: [
            `${emoji('hourglassFlow')} ${say('Not so fast, Kitten—the transfer cooldown is still ticking.', 'Hold up—the transfer cooldown is still ticking.')}`,
            `${emoji('timer')} ${say(`Ready <t:${availableAt}:R> (${formatDuration(remaining)}).`, `Ready <t:${availableAt}:R> (${formatDuration(remaining)}).`)}`
          ].join('\n'),
          ephemeral: true
        });
      }
      if (err?.code === 'JOB_UNCHANGED') {
        return interaction.reply({
          content: `${emoji('info')} ${say('You’re already on that shift, Kitten.', 'You already have that job active.')}`,
          ephemeral: true
        });
      }
      if (err?.code === 'JOB_UNKNOWN') {
        return interaction.reply({ content: `${emoji('question')} ${say('I don’t recognize that job badge yet.', 'Unknown job option.')}`, ephemeral: true });
      }
      console.error('job transfer failed:', err);
      return interaction.reply({ content: `${emoji('warning')} ${say('Something went sideways updating your job.', 'Something went wrong updating your job.')}`, ephemeral: true });
    }
  }

  if (subcommand === 'start') {
    if (!status.hasActiveJob || !status.jobDefinition) {
      return interaction.reply({
        content: `${emoji('info')} ${say('Pick a job with `/job transfer` before clocking in, Kitten.', 'Pick a job with `/job transfer` before starting a shift.')}`,
        ephemeral: true
      });
    }
    return startJobShift(interaction, ctx);
  }

  if (subcommand === 'reset') {
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
      cap_reset_at: null
    });

    const updates = [];
    for (const [jobId] of profiles.entries()) {
      updates.push(updateJobProfile(guildId, targetId, jobId, { lastShiftAt: null }));
    }
    await Promise.all(updates);

    return interaction.reply({
      content: forSelf
        ? `${emoji('hammerWrench')} ${say('Cooldowns scrubbed clean. You can swap roles and start shifts immediately, Kitten.', 'Cooldowns cleared. You can transfer jobs and start shifts immediately.')}`
        : `${emoji('hammerWrench')} ${say(`Cooldowns scrubbed for ${targetMention}. They can swap roles and start shifts right away.`, `Cooldowns cleared for ${targetMention}. They can transfer jobs and start shifts immediately.`)}`,
      ephemeral: true
    });
  }

  if (subcommand === 'resetstats') {
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
      cap_reset_at: null
    });

    await Promise.all(updates);

    const jobCount = profiles.size || listJobs().length;
    return interaction.reply({
      content: forSelf
        ? `${emoji('sparkles')} ${say(`Fresh slate! Ranks and XP reset across ${jobCount} jobs.`, `Stats reset. Your ranks and XP across ${jobCount} jobs are back to defaults.`)}`
        : `${emoji('sparkles')} ${say(`Reset ranks and XP for ${targetMention} across ${jobCount} jobs.`, `Stats reset for ${targetMention} across ${jobCount} jobs.`)}`,
      ephemeral: true
    });
  }

  if (subcommand === 'stats') {
    const profiles = await fetchProfiles(guildId, userId);
    const shifts = await listJobShiftsForUser(guildId, userId, 6);
    const embed = buildStatsEmbed(kittenMode, status, profiles, shifts, now);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return interaction.reply({
    content: `${emoji('warning')} ${say('That job action isn’t recognized yet, Kitten.', 'Unknown job subcommand.')}`,
    ephemeral: true
  });
}

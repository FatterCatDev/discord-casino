import { EmbedBuilder } from 'discord.js';
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
import { xpToNextForRank } from '../jobs/progression.mjs';
import { startJobShift, cancelActiveShiftForUser } from '../jobs/shift-engine.mjs';

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

function buildStaminaStatusLines(status, say, nowSeconds) {
  const lines = [];
  lines.push(`${emoji('clipboard')} ${say('Stamina available:', 'Stamina available:')} ${formatStaminaRemaining(status, say)}`);
  lines.push(`${emoji('timer')} ${formatStaminaCooldownStatus(status, nowSeconds, say)}`);
  return lines;
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
      say('Each shift is a five-stage gauntlet with XP, rank, and chip payouts on the line. Stamina refills over time, so pace your runs.', 'Each shift runs five stages with XP, rank, and chip payouts on the line. Stamina refills on a timer, so pace your runs.'),
      `${emoji('sparkles')} ${say('Use `/job start <job>` to clock in anywhere.', 'Use `/job start <job>` to clock in for any role.')}`,
      ...buildStaminaStatusLines(status, say, nowSeconds)
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

function buildStatsEmbed(kittenMode, status, profiles, recentShifts, nowSeconds, targetUser = null) {
  const say = buildSay(kittenMode);
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(say('Shift dossier', 'Shift dossier'))
    .setDescription(targetUser ? `${emoji('busts')} Inspecting: <@${targetUser.id}>` : null)
    .addFields(
      {
        name: say('Stamina', 'Stamina'),
        value: formatStaminaRemaining(status, say),
        inline: true
      },
      {
        name: say('Stamina Recharge', 'Stamina Recharge'),
        value: formatStaminaCooldownStatus(status, nowSeconds, say),
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
      value: say('No shifts recorded yet. Start one with `/job start <job>`.', 'No shifts recorded yet. Use `/job start <job>` to begin.')
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

  if (subcommand === 'cancel') {
    const result = await cancelActiveShiftForUser(guildId, userId);
    if (!result.cancelled) {
      return interaction.reply({
        content: `${emoji('info')} ${say('No active shifts to cancel right now, Kitten.', 'You have no active job shifts to cancel.')}`,
        ephemeral: true
      });
    }
    return interaction.reply({ content: result.message, ephemeral: true });
  }

  if (subcommand === 'start') {
    const jobId = interaction.options.getString('job', true);
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
      cap_reset_at: null,
      shift_streak_count: 0,
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
      cap_reset_at: null,
      shift_streak_count: 0,
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

  if (subcommand === 'stats') {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const targetId = target.id;
    const targetStatus = await getJobStatusForUser(guildId, targetId);
    const profiles = await fetchProfiles(guildId, targetId);
    const shifts = await listJobShiftsForUser(guildId, targetId, 6);
    const embed = buildStatsEmbed(kittenMode, targetStatus, profiles, shifts, now, target);
    return interaction.reply({ embeds: [embed] });
  }

  return interaction.reply({
    content: `${emoji('warning')} ${say('That job action isn’t recognized yet, Kitten.', 'Unknown job subcommand.')}`,
    ephemeral: true
  });
}

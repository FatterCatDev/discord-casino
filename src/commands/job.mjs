import { EmbedBuilder } from 'discord.js';
import { listJobs } from '../jobs/registry.mjs';
import { emoji } from '../lib/emojis.mjs';
import { getJobStatusForUser, transferJob, JOB_SWITCH_COOLDOWN_SECONDS } from '../jobs/status.mjs';

function buildSay(kittenMode) {
  return (kittenText, normalText) => (kittenMode ? kittenText : normalText);
}

function formatDuration(totalSeconds) {
  let remaining = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (!Number.isFinite(remaining)) remaining = 0;
  const units = [
    { label: 'd', value: 86400 },
    { label: 'h', value: 3600 },
    { label: 'm', value: 60 },
    { label: 's', value: 1 }
  ];
  const parts = [];
  for (const unit of units) {
    if (remaining < unit.value) {
      if (!parts.length && unit.value === 1) parts.push(`0${unit.label}`);
      continue;
    }
    const count = Math.floor(remaining / unit.value);
    parts.push(`${count}${unit.label}`);
    remaining -= count * unit.value;
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(' ') : '0s';
}

function summarizeActiveJob(status, say) {
  if (status?.hasActiveJob && status.jobDefinition) {
    return `${status.jobDefinition.icon} **${status.jobDefinition.displayName}**`;
  }
  return say('No job selected yet.', 'No active job selected.');
}

function formatTransferStatus(status, nowSeconds, say) {
  const cooldownSeconds = Math.max(0, (status?.job_switch_available_at || 0) - nowSeconds);
  if (cooldownSeconds <= 0) {
    const cooldownText = formatDuration(JOB_SWITCH_COOLDOWN_SECONDS);
    return say(
      `Transfer window open — swapping starts a ${cooldownText} cooldown.`,
      `Transfer window open — swapping starts a ${cooldownText} cooldown.`
    );
  }
  const readyAt = status.job_switch_available_at;
  return say(
    `Cooldown active — ready <t:${readyAt}:R> (${formatDuration(cooldownSeconds)}).`,
    `Cooldown active — ready <t:${readyAt}:R> (${formatDuration(cooldownSeconds)}).`
  );
}

function buildJobHighlights(job) {
  return job.highlights.map(line => `• ${line}`).join('\n');
}

function buildJobsOverviewEmbed(kittenMode, status, nowSeconds) {
  const say = buildSay(kittenMode);
  const jobs = listJobs();
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(say('Kitten Career Board', 'Casino Job Board'))
    .setDescription([
      say(
        'Each shift is a five-stage gauntlet with XP, pay, and tip rolls tied to performance.',
        'Each shift runs five stages with performance-based pay and tip rolls.'
      ),
      `${emoji('clipboard')} ${say('Active job:', 'Active job:')} ${summarizeActiveJob(status, say)}`,
      `${emoji('hourglassFlow')} ${formatTransferStatus(status, nowSeconds, say)}`
    ].join('\n'))
    .setFooter({
      text: say(
        'Climb the 10-rank ladder and unlock tip bonuses as the system comes online.',
        'Climb the 10-rank ladder and unlock tip bonuses as the system comes online.'
      )
    });

  for (const job of jobs) {
    const tagline = say(job.tagline.kitten, job.tagline.normal);
    embed.addFields({
      name: `${job.icon} ${job.displayName}`,
      value: `${tagline}\n${job.fantasy}\n${buildJobHighlights(job)}`
    });
  }

  return embed;
}

function buildRoadmapLines(kittenMode) {
  const say = buildSay(kittenMode);
  return [
    `${emoji('scroll')} ${say('Schema migrations for job profiles and shift logs are up next.', 'Schema migrations for job profiles and shift logs are next.')}`,
    `${emoji('sparkles')} ${say('Per-job state machines and interaction handlers are in active development.', 'Per-job state machines and interaction handlers are in active development.')}`,
    `${emoji('rocket')} ${say('Payout math, tips, and ledger hooks follow the shift engine.', 'Payout math, tip rolls, and ledger integration follow the shift engine.')}`
  ].join('\n');
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

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (subcommand === 'overview') {
    const status = await getJobStatusForUser(guildId, userId);
    const embed = buildJobsOverviewEmbed(kittenMode, status, nowSeconds);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (subcommand === 'transfer') {
    const targetJobId = interaction.options.getString('job', true);
    try {
      const result = await transferJob(guildId, userId, targetJobId);
      const status = result.status;
      const job = status.jobDefinition;
      const previous = result.previousJob;
      const cooldownRemaining = Math.max(0, status.job_switch_available_at - nowSeconds);
      const lines = [];
      if (job) {
        lines.push(`${emoji('check')} ${say(`You’re clocked in as ${job.displayName}, Kitten.`, `Active job set to ${job.displayName}.`)} ${job.icon}`.trimEnd());
      } else {
        lines.push(`${emoji('check')} ${say('Shift rotation cleared — you’re off-duty for now, Kitten.', 'Shift rotation cleared — you’re off-duty for now.')}`);
      }
      if (previous && job) {
        lines.push(`${emoji('repeat')} ${say(`Swapped from ${previous.displayName}.`, `Swapped from ${previous.displayName}.`)}`);
      } else if (previous && !job) {
        lines.push(`${emoji('repeat')} ${say(`You stepped away from ${previous.displayName}.`, `You stepped away from ${previous.displayName}.`)}`);
      }
      if (cooldownRemaining > 0) {
        lines.push(`${emoji('hourglassFlow')} ${say('Next transfer available', 'Next transfer available')} <t:${status.job_switch_available_at}:R> (${formatDuration(cooldownRemaining)}).`);
      } else {
        lines.push(`${emoji('sparkles')} ${say('Transfer window is open if you change your mind.', 'Transfer window is open if you change your mind.')}`);
      }
      lines.push(buildRoadmapLines(kittenMode));
      return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    } catch (err) {
      if (err?.code === 'JOB_SWITCH_COOLDOWN') {
        const remaining = Math.max(0, Number(err.remainingSeconds || 0));
        const availableAt = Number(err.availableAt || 0);
        return interaction.reply({
          content: [
            `${emoji('hourglassFlow')} ${say('Not so fast, Kitten—the transfer cooldown is still ticking.', 'Hold up—the transfer cooldown is still ticking.')}`,
            `${emoji('timer')} ${say(`Ready <t:${availableAt}:R> (${formatDuration(remaining)}).`, `Ready <t:${availableAt}:R> (${formatDuration(remaining)}).`)}`,
            buildRoadmapLines(kittenMode)
          ].join('\n'),
          ephemeral: true
        });
      }
      if (err?.code === 'JOB_UNCHANGED') {
        return interaction.reply({
          content: [
            `${emoji('info')} ${say('You’re already on that shift, Kitten.', 'You already have that job active.')}`,
            buildRoadmapLines(kittenMode)
          ].join('\n'),
          ephemeral: true
        });
      }
      if (err?.code === 'JOB_UNKNOWN') {
        return interaction.reply({
          content: `${emoji('question')} ${say('I don’t recognize that job badge yet.', 'Unknown job option.')}`,
          ephemeral: true
        });
      }
      console.error('job transfer failed:', err);
      return interaction.reply({
        content: `${emoji('warning')} ${say('Something went sideways updating your job.', 'Something went wrong updating your job.')}`,
        ephemeral: true
      });
    }
  }

  if (subcommand === 'start') {
    const status = await getJobStatusForUser(guildId, userId);
    if (!status.hasActiveJob || !status.jobDefinition) {
      return interaction.reply({
        content: [
          `${emoji('info')} ${say('Pick a job with `/job transfer` before clocking in, Kitten.', 'Pick a job with `/job transfer` before starting a shift.')}`,
          buildRoadmapLines(kittenMode)
        ].join('\n'),
        ephemeral: true
      });
    }
    const job = status.jobDefinition;
    return interaction.reply({
      content: [
        `${job.icon} ${say(`Shift prep underway for the ${job.displayName} role.`, `Shift prep underway for the ${job.displayName} role.`)}`,
        `${emoji('sparkles')} ${say('Five-stage interactive runs are almost here—this command will launch them soon.', 'Five-stage interactive runs are nearly ready; this command will launch them soon.')}`,
        `${emoji('clipboard')} ${say('Highlights:', 'Highlights:')}\n${buildJobHighlights(job)}`,
        buildRoadmapLines(kittenMode)
      ].join('\n'),
      ephemeral: true
    });
  }

  if (subcommand === 'stats') {
    const status = await getJobStatusForUser(guildId, userId);
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
        },
        {
          name: say('Daily Earnings', 'Daily Earnings'),
          value: say('Tracking begins once shifts go live.', 'Tracking will begin once shift runs go live.'),
          inline: true
        }
      )
      .setFooter({
        text: say(
          'XP, tips, and ledger stats wire in with the shift engine.',
          'XP, tips, and ledger stats connect once the shift engine ships.'
        )
      });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return interaction.reply({
    content: [
      `${emoji('warning')} ${say('That job action isn’t ready yet, Kitten.', 'Unknown job subcommand.')}`,
      buildRoadmapLines(kittenMode)
    ].join('\n'),
    ephemeral: true
  });
}

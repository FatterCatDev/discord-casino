import { EmbedBuilder } from 'discord.js';
import { listJobs } from '../jobs/registry.mjs';
import { emoji } from '../lib/emojis.mjs';

function buildSay(kittenMode) {
  return (kittenText, normalText) => (kittenMode ? kittenText : normalText);
}

function buildJobsOverviewEmbed(kittenMode) {
  const say = buildSay(kittenMode);
  const jobs = listJobs();
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(say('Kitten Career Board', 'Casino Job Board'))
    .setDescription(say(
      'Pick a specialty, Kitten. Each shift is a five-stage gauntlet that pays out based on your performance score and tips.',
      'Preview the upcoming five-stage job shifts. Each run pays chips based on performance plus a tip roll.'
    ))
    .setFooter({ text: say('One shift every 8 hours • Rank up to Master • Max pay 100,000 chips', 'One shift every 8 hours • Rank ladder to Master • Max pay 100,000 chips') });

  for (const job of jobs) {
    const tagline = say(job.tagline.kitten, job.tagline.normal);
    const highlights = job.highlights.map(line => `• ${line}`).join('\n');
    embed.addFields({
      name: `${job.icon} ${job.displayName}`,
      value: `${tagline}\n${job.fantasy}\n${highlights}`
    });
  }

  return embed;
}

function buildRoadmapLines(kittenMode) {
  const say = buildSay(kittenMode);
  return [
    `${emoji('hourglassFlow')} ${say('Clock-in system under construction — profiles, cooldowns, and payouts are next.', 'Clock-in system in progress — job profiles, cooldown timers, and payouts are next up.')}`,
    `${emoji('scroll')} ${say('Data tables: `job_profiles`, `job_status`, `job_shifts` are being wired for both SQLite and Postgres.', 'Backing tables `job_profiles`, `job_status`, and `job_shifts` land with the migration suite (SQLite/Postgres).')}`,
    `${emoji('sparkles')} ${say('Shift scripts get their own interaction handlers so each role can stage bespoke events.', 'Shift flows will sit in `src/interactions/jobs/` with per-role state machines and scripted events.')}`
  ].join('\n');
}

export default async function handleJob(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = buildSay(kittenMode);
  let subcommand = 'overview';
  try {
    subcommand = interaction.options.getSubcommand(false) ?? 'overview';
  } catch {
    subcommand = 'overview';
  }

  if (subcommand === 'overview') {
    const embed = buildJobsOverviewEmbed(kittenMode);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  if (subcommand === 'start') {
    return interaction.reply({
      content: [
        `${emoji('construction')} ${say('Shifts aren’t live just yet, Kitten.', 'Shifts are still under construction.')}`,
        `${emoji('clipboard')} ${say('Next steps: finish migrations, seed job profiles, and wire the Rush Service / Best Hand / Queue Control engines.', 'Next steps: finish migrations, seed job profiles, and wire the Rush Service, Best Hand Call, and Queue Control engines.')}`,
        buildRoadmapLines(kittenMode)
      ].join('\n'),
      ephemeral: true
    });
  }

  if (subcommand === 'transfer') {
    return interaction.reply({
      content: [
        `${emoji('inbox')} ${say('Job transfers will unlock after profiles land.', 'Job transfers unlock once profiles are online.')}`,
        `${emoji('hourglass')} ${say('Expect a 24h cooldown after switching — we’ll surface the countdown right here.', 'Expect a 24-hour cooldown once switching ships — this reply will show the countdown soon.')}`,
        buildRoadmapLines(kittenMode)
      ].join('\n'),
      ephemeral: true
    });
  }

  if (subcommand === 'stats') {
    return interaction.reply({
      content: [
        `${emoji('chartUp')} ${say('Shift stats will track lifetime XP, tips, and top performances per job.', 'Shift stats will showcase lifetime XP, tip totals, and best performances per job.')}`,
        `${emoji('timer')} ${say('We’ll also surface your next shift window and daily cap once the persistence layer is ready.', 'Look for next-shift timers and daily cap status once persistence is wired.')}`,
        buildRoadmapLines(kittenMode)
      ].join('\n'),
      ephemeral: true
    });
  }

  return interaction.reply({
    content: say('I don’t recognize that job action yet, Kitten.', 'Unknown job subcommand.'),
    ephemeral: true
  });
}

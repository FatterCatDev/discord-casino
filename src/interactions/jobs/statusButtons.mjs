import { emoji } from '../../lib/emojis.mjs';
import { getJobStatusForUser } from '../../jobs/status.mjs';
import { listJobShiftsForUser } from '../../db/db.auto.mjs';
import { startJobShift } from '../../jobs/shift-engine.mjs';
import { fetchProfiles, buildJobStatusPayload } from '../../commands/job.mjs';

export default async function handleJobStatusButtons(interaction, ctx) {
  const parts = interaction.customId.split('|');
  if (parts[0] !== 'jobstatus') return false;

  const targetId = parts[1] ?? null;
  const viewerId = parts[2] ?? interaction.user.id;
  const action = parts[3] ?? 'main';
  const payload = parts[4] ?? null;

  if (!targetId) {
    await interaction.reply({ content: `${emoji('warning')} Missing job context.`, ephemeral: true }).catch(() => {});
    return true;
  }

  if (interaction.user.id !== viewerId) {
    await interaction.reply({
      content: `${emoji('warning')} Only <@${viewerId}> can use this job panel.`,
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: `${emoji('warning')} Job status is only available inside a server.`,
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  if (action === 'start') {
    if (interaction.user.id !== targetId) {
      await interaction.reply({
        content: `${emoji('warning')} Only <@${targetId}> can start shifts from this panel.`,
        ephemeral: true
      }).catch(() => {});
      return true;
    }
    if (!payload) {
      await interaction.reply({
        content: `${emoji('question')} Choose a job before starting a shift.`,
        ephemeral: true
      }).catch(() => {});
      return true;
    }
    return startJobShift(interaction, ctx, payload);
  }

  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function'
    ? await ctx.isKittenModeEnabled()
    : false;

  const status = await getJobStatusForUser(guildId, targetId);
  const profiles = await fetchProfiles(guildId, targetId);
  const shifts = await listJobShiftsForUser(guildId, targetId, 6);

  const viewJobId = action === 'job' ? payload : null;
  const payloadData = buildJobStatusPayload({
    kittenMode,
    status,
    profiles,
    shifts,
    userId: targetId,
    nowSeconds: Math.floor(Date.now() / 1000),
    jobId: viewJobId,
    viewerId
  });

  try {
    await interaction.update(payloadData);
  } catch (err) {
    if (err?.code === 10062) {
      console.warn('job status button interaction token expired', err);
      return true;
    }
    console.error('job status button update failed', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `${emoji('warning')} Unable to update that job page right now.`,
        ephemeral: true
      }).catch(() => {});
    }
  }
  return true;
}

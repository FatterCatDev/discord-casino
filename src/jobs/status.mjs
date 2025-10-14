import { getJobStatus as getJobStatusDb, setJobStatus as setJobStatusDb } from '../db/db.auto.mjs';
import { getJobById } from './registry.mjs';

export const JOB_SWITCH_COOLDOWN_SECONDS = 60 * 60 * 24; // 24 hours

function attachDetails(status) {
  const job = status && status.active_job ? getJobById(status.active_job) : null;
  return {
    ...status,
    jobDefinition: job || null,
    hasActiveJob: !!job
  };
}

export async function getJobStatusForUser(guildId, userId) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const raw = await getJobStatusDb(guildId, userId);
  return attachDetails(raw);
}

export async function transferJob(guildId, userId, jobId, { now = Date.now() } = {}) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const status = await getJobStatusForUser(guildId, userId);
  const normalizedId = jobId ? String(jobId).toLowerCase() : 'none';
  const nextJob = normalizedId === 'none' ? null : getJobById(normalizedId);
  if (normalizedId !== 'none' && !nextJob) {
    const err = new Error(`Unknown job: ${normalizedId}`);
    err.code = 'JOB_UNKNOWN';
    throw err;
  }

  const nowSeconds = Math.floor(now / 1000);
  if (status.active_job === normalizedId) {
    const err = new Error('Job already active');
    err.code = 'JOB_UNCHANGED';
    err.status = status;
    throw err;
  }

  if (status.job_switch_available_at > nowSeconds) {
    const err = new Error('Job switch still on cooldown');
    err.code = 'JOB_SWITCH_COOLDOWN';
    err.remainingSeconds = status.job_switch_available_at - nowSeconds;
    err.availableAt = status.job_switch_available_at;
    throw err;
  }

  const hadJob = status.active_job && status.active_job !== 'none';
  const applyCooldown = hadJob && status.active_job !== normalizedId;
  const nextAvailableAt = applyCooldown ? nowSeconds + JOB_SWITCH_COOLDOWN_SECONDS : nowSeconds;
  const update = {
    active_job: normalizedId,
    job_switch_available_at: nextAvailableAt,
    earned_today: 0,
    cooldown_reason: applyCooldown ? 'TRANSFER_COOLDOWN' : null
  };

  const updated = await setJobStatusDb(guildId, userId, update);
  return {
    status: attachDetails(updated),
    previousJob: status.jobDefinition || null
  };
}

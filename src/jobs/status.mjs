import { getJobStatus as getJobStatusDb, setJobStatus as setJobStatusDb } from '../db/db.auto.mjs';

export const JOB_SHIFT_STREAK_LIMIT = 5;
export const JOB_SHIFT_STREAK_COOLDOWN_SECONDS = 6 * 60 * 60; // 6 hours

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function attachDetails(status, nowSeconds) {
  const shiftCooldownExpiresAt = normalizeNumber(status?.shift_cooldown_expires_at, 0);
  const shiftStreakCount = normalizeNumber(status?.shift_streak_count, 0);
  const remaining = Math.max(0, shiftCooldownExpiresAt - nowSeconds);
  const onShiftCooldown = remaining > 0;
  const shiftsRemaining = onShiftCooldown
    ? 0
    : Math.max(0, JOB_SHIFT_STREAK_LIMIT - shiftStreakCount);
  return {
    ...status,
    jobDefinition: null,
    hasActiveJob: false,
    shiftCooldownExpiresAt,
    shiftCooldownRemaining: remaining,
    shiftStreakCount,
    onShiftCooldown,
    shiftsRemaining
  };
}

function shouldClearShiftCooldown(status, nowSeconds) {
  if (!status) return false;
  const expiresAt = normalizeNumber(status.shift_cooldown_expires_at, 0);
  if (expiresAt === 0) return false;
  if (expiresAt > nowSeconds) return false;
  const reason = status.cooldown_reason || '';
  return reason.toUpperCase().startsWith('SHIFT_STREAK');
}

export async function getJobStatusForUser(guildId, userId, { now = Date.now() } = {}) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const nowSeconds = Math.floor(now / 1000);
  let raw = await getJobStatusDb(guildId, userId);
  if (shouldClearShiftCooldown(raw, nowSeconds)) {
    raw = await setJobStatusDb(guildId, userId, {
      shift_cooldown_expires_at: 0,
      cooldown_reason: null
    });
  }
  return attachDetails(raw, nowSeconds);
}

export async function recordShiftCompletion(guildId, userId, { now = Date.now() } = {}) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const nowSeconds = Math.floor(now / 1000);
  const current = await getJobStatusDb(guildId, userId);
  const cooldownExpiresAt = normalizeNumber(current.shift_cooldown_expires_at, 0);
  const cooldownActive = cooldownExpiresAt > nowSeconds;
  let streakCount = normalizeNumber(current.shift_streak_count, 0);
  let updates = {};
  const wasShiftCooldown = (current.cooldown_reason || '').toUpperCase().startsWith('SHIFT_STREAK');

  if (!cooldownActive && cooldownExpiresAt > 0) {
    updates.shift_cooldown_expires_at = 0;
  }

  if (!cooldownActive) {
    streakCount += 1;
    if (streakCount >= JOB_SHIFT_STREAK_LIMIT) {
      updates = {
        ...updates,
        shift_streak_count: 0,
        shift_cooldown_expires_at: nowSeconds + JOB_SHIFT_STREAK_COOLDOWN_SECONDS,
        cooldown_reason: 'SHIFT_STREAK_COOLDOWN'
      };
    } else {
      updates = {
        ...updates,
        shift_streak_count: streakCount
      };
      if (wasShiftCooldown) {
        updates.cooldown_reason = null;
      }
    }
  } else {
    // Should not normally happen, but keep streak count capped.
    updates.shift_streak_count = Math.min(streakCount, JOB_SHIFT_STREAK_LIMIT);
  }

  const updated = await setJobStatusDb(guildId, userId, updates);
  return attachDetails(updated, nowSeconds);
}

export async function clearShiftCooldown(guildId, userId) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const updated = await setJobStatusDb(guildId, userId, {
    shift_streak_count: 0,
    shift_cooldown_expires_at: 0,
    cooldown_reason: null
  });
  const nowSeconds = Math.floor(Date.now() / 1000);
  return attachDetails(updated, nowSeconds);
}

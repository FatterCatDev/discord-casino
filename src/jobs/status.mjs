import { getJobStatus as getJobStatusDb, setJobStatus as setJobStatusDb } from '../db/db.auto.mjs';

export const JOB_SHIFT_STREAK_LIMIT = 5;
export const JOB_SHIFT_RECHARGE_SECONDS = 2 * 60 * 60; // 2 hours per charge
export const JOB_SHIFT_STREAK_COOLDOWN_SECONDS = JOB_SHIFT_RECHARGE_SECONDS; // backwards compatibility

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function clampCharges(value) {
  if (!Number.isFinite(value)) return JOB_SHIFT_STREAK_LIMIT;
  return Math.max(0, Math.min(JOB_SHIFT_STREAK_LIMIT, Math.trunc(value)));
}

async function ensureStatusRecord(guildId, userId, status, nowSeconds) {
  if (!status) {
    return setJobStatusDb(guildId, userId, {
      shift_streak_count: JOB_SHIFT_STREAK_LIMIT,
      shift_cooldown_expires_at: 0,
      cooldown_reason: null
    });
  }

  const storedCharges = clampCharges(normalizeNumber(status.shift_streak_count, JOB_SHIFT_STREAK_LIMIT));
  let charges = storedCharges;
  let nextRechargeAt = normalizeNumber(status.shift_cooldown_expires_at, 0);
  const reason = (status.cooldown_reason || '').toUpperCase();
  const updates = {};
  let changed = false;

  if (charges <= 0 && nextRechargeAt === 0 && !reason) {
    charges = JOB_SHIFT_STREAK_LIMIT;
    updates.shift_streak_count = charges;
    updates.shift_cooldown_expires_at = 0;
    updates.cooldown_reason = null;
    changed = true;
  }

  if (reason.startsWith('SHIFT_STREAK')) {
    updates.cooldown_reason = null;
    changed = true;
    if (charges < JOB_SHIFT_STREAK_LIMIT) {
      nextRechargeAt = 0;
    }
  }

  if (charges >= JOB_SHIFT_STREAK_LIMIT) {
    charges = JOB_SHIFT_STREAK_LIMIT;
    if (status.shift_streak_count !== charges) {
      updates.shift_streak_count = charges;
      changed = true;
    }
    if (nextRechargeAt !== 0 || status.cooldown_reason) {
      updates.shift_cooldown_expires_at = 0;
      updates.cooldown_reason = null;
      changed = true;
    }
  } else {
    if (nextRechargeAt === 0) {
      nextRechargeAt = nowSeconds + JOB_SHIFT_RECHARGE_SECONDS;
      updates.shift_cooldown_expires_at = nextRechargeAt;
      updates.cooldown_reason = 'SHIFT_CHARGE_RECHARGE';
      changed = true;
    } else if (nextRechargeAt <= nowSeconds) {
      const elapsed = nowSeconds - nextRechargeAt;
      const intervals = 1 + Math.floor(elapsed / JOB_SHIFT_RECHARGE_SECONDS);
      charges = Math.min(JOB_SHIFT_STREAK_LIMIT, charges + intervals);
      updates.shift_streak_count = charges;
      if (charges >= JOB_SHIFT_STREAK_LIMIT) {
        nextRechargeAt = 0;
        updates.shift_cooldown_expires_at = 0;
        updates.cooldown_reason = null;
      } else {
        const remainder = elapsed % JOB_SHIFT_RECHARGE_SECONDS;
        nextRechargeAt = nowSeconds - remainder + JOB_SHIFT_RECHARGE_SECONDS;
        updates.shift_cooldown_expires_at = nextRechargeAt;
        updates.cooldown_reason = 'SHIFT_CHARGE_RECHARGE';
      }
      changed = true;
    }
  }

  if (charges !== storedCharges) {
    updates.shift_streak_count = charges;
    changed = true;
  }

  if (changed) {
    const merged = await setJobStatusDb(guildId, userId, updates);
    return merged;
  }

  return status;
}

function attachDetails(status, nowSeconds) {
  const charges = clampCharges(normalizeNumber(status?.shift_streak_count, JOB_SHIFT_STREAK_LIMIT));
  const nextRechargeAt = normalizeNumber(status?.shift_cooldown_expires_at, 0);
  const remainingSeconds = nextRechargeAt > nowSeconds ? nextRechargeAt - nowSeconds : 0;
  const chargesUsed = JOB_SHIFT_STREAK_LIMIT - charges;
  return {
    ...status,
    jobDefinition: null,
    hasActiveJob: false,
    shiftCooldownExpiresAt: nextRechargeAt,
    shiftCooldownRemaining: remainingSeconds,
    shiftStreakCount: chargesUsed,
    shiftCharges: charges,
    onShiftCooldown: charges < JOB_SHIFT_STREAK_LIMIT,
    shiftsRemaining: charges
  };
}

export async function getJobStatusForUser(guildId, userId, { now = Date.now() } = {}) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const nowSeconds = Math.floor(now / 1000);
  let raw = await getJobStatusDb(guildId, userId);
  raw = await ensureStatusRecord(guildId, userId, raw, nowSeconds);
  return attachDetails(raw, nowSeconds);
}

export async function recordShiftCompletion(guildId, userId, { now = Date.now() } = {}) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const nowSeconds = Math.floor(now / 1000);
  let current = await getJobStatusDb(guildId, userId);
  current = await ensureStatusRecord(guildId, userId, current, nowSeconds);

  let charges = clampCharges(normalizeNumber(current.shift_streak_count, JOB_SHIFT_STREAK_LIMIT));
  let nextRechargeAt = normalizeNumber(current.shift_cooldown_expires_at, 0);

  if (charges > 0) charges -= 1;
  const updates = {
    shift_streak_count: charges
  };

  if (charges >= JOB_SHIFT_STREAK_LIMIT) {
    updates.shift_cooldown_expires_at = 0;
    updates.cooldown_reason = null;
  } else {
    if (nextRechargeAt === 0 || nextRechargeAt <= nowSeconds) {
      nextRechargeAt = nowSeconds + JOB_SHIFT_RECHARGE_SECONDS;
    }
    updates.shift_cooldown_expires_at = nextRechargeAt;
    updates.cooldown_reason = 'SHIFT_CHARGE_RECHARGE';
  }

  const updated = await setJobStatusDb(guildId, userId, updates);
  const normalized = await ensureStatusRecord(guildId, userId, updated, nowSeconds);
  return attachDetails(normalized, nowSeconds);
}

export async function clearShiftCooldown(guildId, userId) {
  if (!guildId) throw new Error('JOB_STATUS_REQUIRES_GUILD');
  if (!userId) throw new Error('JOB_STATUS_REQUIRES_USER');
  const updated = await setJobStatusDb(guildId, userId, {
    shift_streak_count: JOB_SHIFT_STREAK_LIMIT,
    shift_cooldown_expires_at: 0,
    cooldown_reason: null
  });
  const nowSeconds = Math.floor(Date.now() / 1000);
  return attachDetails(updated, nowSeconds);
}

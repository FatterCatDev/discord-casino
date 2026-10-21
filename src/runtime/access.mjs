import { getModerators, getAdmins } from '../db/db.auto.mjs';
import { OWNER_USER_IDS } from './config.mjs';
import { getAccessListCached } from './caches.mjs';

const OWNER_USER_SET = new Set(OWNER_USER_IDS);

export function hasOwnerOverride(userId) {
  return !!(userId && OWNER_USER_SET.has(String(userId)));
}

export async function adminsForGuild(guildId) {
  return getAccessListCached(guildId, 'admins', getAdmins);
}

export async function moderatorsForGuild(guildId) {
  return getAccessListCached(guildId, 'moderators', getModerators);
}

export async function hasAdminAccess(guildId, userId) {
  if (!userId) return false;
  if (hasOwnerOverride(userId)) return true;
  const admins = await adminsForGuild(guildId);
  return admins.includes(String(userId));
}

export async function hasModeratorAccess(guildId, userId) {
  if (!userId) return false;
  if (hasOwnerOverride(userId)) return true;
  const [admins, moderators] = await Promise.all([
    adminsForGuild(guildId),
    moderatorsForGuild(guildId)
  ]);
  if (admins.includes(String(userId))) return true;
  return moderators.includes(String(userId));
}

export async function isAdmin(interaction) {
  try {
    const guildId = interaction.guild?.id || null;
    const userId = interaction.user?.id || null;
    return await hasAdminAccess(guildId, userId);
  } catch {
    return false;
  }
}

export async function isModerator(interaction) {
  try {
    const guildId = interaction.guild?.id || null;
    const userId = interaction.user?.id || null;
    return await hasModeratorAccess(guildId, userId);
  } catch {
    return false;
  }
}

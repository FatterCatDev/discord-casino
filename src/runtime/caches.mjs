import { getGuildSettings } from '../db/db.auto.mjs';
import {
  GUILD_SETTINGS_TTL_MS,
  ACCESS_LIST_TTL_MS,
  GUILD_SETTINGS_CACHE_MAX,
  ACCESS_LIST_CACHE_MAX
} from './config.mjs';
import { setTimedCache, enforceMapCapacity, getTimedCache } from './cache-primitives.mjs';

const guildSettingsCache = new Map();

const accessListCache = new Map();

function accessCacheKey(guildId, roleType) {
  return `${guildId || 'global'}:${roleType}`;
}

export async function getGuildSettingsCached(guildId) {
  if (!guildId) return null;
  const cached = getTimedCache(guildSettingsCache, guildId);
  if (cached) return cached;
  const settings = await getGuildSettings(guildId);
  setTimedCache(guildSettingsCache, guildId, settings, GUILD_SETTINGS_TTL_MS);
  enforceMapCapacity(guildSettingsCache, GUILD_SETTINGS_CACHE_MAX);
  return settings;
}

export function invalidateGuildSettingsCache(guildId) {
  if (!guildId) return;
  guildSettingsCache.delete(guildId);
}

export function invalidateAccessCache(guildId) {
  accessListCache.delete(accessCacheKey(guildId, 'admins'));
  accessListCache.delete(accessCacheKey(guildId, 'moderators'));
}

export async function getAccessListCached(guildId, roleType, loader) {
  const key = accessCacheKey(guildId, roleType);
  const cached = getTimedCache(accessListCache, key);
  if (cached) return cached;
  const ids = await loader(guildId);
  const normalized = Array.from(new Set((ids || []).map(id => String(id))));
  setTimedCache(accessListCache, key, normalized, ACCESS_LIST_TTL_MS);
  enforceMapCapacity(accessListCache, ACCESS_LIST_CACHE_MAX);
  return normalized;
}

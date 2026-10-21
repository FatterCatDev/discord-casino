import { getUserNewsSettings, markUserNewsDelivered } from '../db/db.auto.mjs';
import { getActiveNews, newsDigest } from '../services/news.mjs';
import { NEWS_COOLDOWN_SECONDS, ACTIVE_NEWS_TTL_MS, USER_NEWS_STATE_MAX } from './config.mjs';
import { enforceMapCapacity } from './cache-primitives.mjs';

const userNewsState = new Map();

let activeNewsCache = { value: null, digest: null, expiresAt: 0 };

async function getActiveNewsCached() {
  if (Date.now() < activeNewsCache.expiresAt) {
    return activeNewsCache.value;
  }
  const active = await getActiveNews();
  activeNewsCache = {
    value: active,
    digest: newsDigest(active) || null,
    expiresAt: Date.now() + ACTIVE_NEWS_TTL_MS
  };
  return active;
}

export function clearUserNewsState(userId) {
  if (!userId) return;
  userNewsState.delete(String(userId));
}

function getUserNewsState(userId) {
  const key = String(userId || '').trim();
  if (!key) return null;
  const entry = userNewsState.get(key);
  if (!entry) return null;
  userNewsState.delete(key);
  userNewsState.set(key, entry);
  return entry;
}

function setUserNewsState(userId, state) {
  const key = String(userId || '').trim();
  if (!key) return;
  userNewsState.delete(key);
  userNewsState.set(key, state);
  enforceMapCapacity(userNewsState, USER_NEWS_STATE_MAX);
}

export async function maybeSendNewsReminder(interaction) {
  try {
    if (!interaction || typeof interaction.isChatInputCommand !== 'function') return;
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'news') return;
    if (typeof interaction.inGuild === 'function' && !interaction.inGuild()) return;
    const userId = interaction.user?.id;
    if (!userId) return;
    const active = await getActiveNewsCached();
    if (!active || !active.body) return;
    const digest = activeNewsCache.digest || newsDigest(active) || null;
    const nowSec = Math.floor(Date.now() / 1000);
    const cachedState = getUserNewsState(userId);
    if (cachedState?.optOut) return;
    if (cachedState && cachedState.skipUntilSec > nowSec && cachedState.digest === digest) return;

    const settings = await getUserNewsSettings(userId);
    if (settings?.newsOptIn === false) {
      setUserNewsState(userId, { optOut: true, digest: null, skipUntilSec: 0 });
      return;
    }
    const lastSentRaw = settings?.lastDeliveredAt;
    const lastSentSec = Number.isFinite(Number(lastSentRaw))
      ? Math.trunc(Number(lastSentRaw))
      : 0;
    const lastDigest = settings?.lastDigest || null;
    const seenRecently = lastSentSec > 0 && (nowSec - lastSentSec) < NEWS_COOLDOWN_SECONDS;
    if (seenRecently && (!digest || lastDigest === digest)) {
      setUserNewsState(userId, {
        optOut: false,
        digest,
        skipUntilSec: lastSentSec + NEWS_COOLDOWN_SECONDS
      });
      return;
    }
    if (!(interaction.deferred || interaction.replied)) return;
    if (interaction.deferred && !interaction.replied) {
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    const rangeLabel = active.endDate
      ? `${active.startDate} → ${active.endDate}`
      : active.startDate;
    const header = active.title ? `📰 **${active.title}**` : '📰 **Casino News**';
    const lines = [
      header,
      rangeLabel ? `Dates: ${rangeLabel}` : null,
      '',
      active.body,
      '',
      'Use `/news enabled:false` to pause these updates.'
    ].filter(Boolean);

    let delivered = false;
    try {
      await interaction.followUp({
        content: lines.join('\n'),
        ephemeral: true
      });
      delivered = true;
    } catch (err) {
      if (err?.code !== 40060) throw err;
    }

    if (delivered) {
      await markUserNewsDelivered(userId, digest, nowSec);
      setUserNewsState(userId, {
        optOut: false,
        digest,
        skipUntilSec: nowSec + NEWS_COOLDOWN_SECONDS
      });
    }
  } catch (err) {
    console.error('Failed to send news reminder', err);
  }
}

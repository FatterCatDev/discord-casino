import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const NEWS_FILE_PATH = process.env.NEWS_FILE_PATH
  ? path.resolve(process.env.NEWS_FILE_PATH)
  : path.resolve(process.cwd(), 'news.md');

let cache = {
  mtimeMs: 0,
  entries: [],
  checksum: null,
  lastLoadError: null
};

function parseMetadataBlock(block) {
  const meta = {};
  const lines = block.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    meta[key] = value;
  }
  return meta;
}

function parseDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const iso = `${trimmed}T00:00:00Z`;
  const parsed = Date.parse(iso);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Date.parse(trimmed);
  return Number.isFinite(fallback) ? fallback : null;
}

function expandEndDateMs(endValue) {
  if (!endValue) return null;
  const endStart = parseDate(endValue);
  if (!Number.isFinite(endStart)) return null;
  const day = 24 * 60 * 60 * 1000;
  return endStart + day - 1; // inclusive through the end date
}

function buildDigest({ start, end, title, body }) {
  return crypto
    .createHash('sha1')
    .update(String(start || ''))
    .update('\n')
    .update(String(end || ''))
    .update('\n')
    .update(String(title || ''))
    .update('\n')
    .update(String(body || ''))
    .digest('hex');
}

function parseNewsContent(source) {
  if (!source || !source.trim()) {
    return { entries: [], checksum: null };
  }
  const normalized = source.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const entries = [];
  let idx = 0;
  while (idx < lines.length) {
    while (idx < lines.length && !lines[idx].trim()) idx++;
    if (idx >= lines.length) break;
    if (lines[idx].trim() !== '---') {
      idx++;
      continue;
    }
    idx++; // skip opening ---
    const metaLines = [];
    while (idx < lines.length && lines[idx].trim() !== '---') {
      metaLines.push(lines[idx]);
      idx++;
    }
    if (idx >= lines.length) break; // malformed block without closing ---
    idx++; // skip closing ---
    const bodyLines = [];
    while (idx < lines.length && lines[idx].trim() !== '---') {
      bodyLines.push(lines[idx]);
      idx++;
    }
    const meta = parseMetadataBlock(metaLines.join('\n'));
    const startMs = parseDate(meta.start);
    if (!Number.isFinite(startMs)) continue;
    const endMs = expandEndDateMs(meta.end);
    const body = bodyLines.join('\n').trim();
    const digest = buildDigest({
      start: meta.start,
      end: meta.end,
      title: meta.title,
      body
    });
    entries.push({
      digest,
      title: meta.title || null,
      body,
      startDate: meta.start,
      endDate: meta.end || null,
      startMs,
      endMs
    });
  }
  entries.sort((a, b) => b.startMs - a.startMs);
  const checksum = crypto.createHash('sha1').update(normalized).digest('hex');
  return { entries, checksum };
}

async function loadNewsFile() {
  try {
    const stats = await stat(NEWS_FILE_PATH);
    if (!stats.isFile()) {
      cache = { mtimeMs: 0, entries: [], checksum: null, lastLoadError: null };
      return cache;
    }
    if (!cache.entries || stats.mtimeMs !== cache.mtimeMs) {
      const content = await readFile(NEWS_FILE_PATH, 'utf8');
      const parsed = parseNewsContent(content);
      cache = {
        mtimeMs: stats.mtimeMs,
        entries: parsed.entries,
        checksum: parsed.checksum,
        lastLoadError: null
      };
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      if (cache.lastLoadError !== err?.message) {
        console.error('Failed to read news.md:', err);
      }
      cache.lastLoadError = err?.message || 'unknown';
    } else {
      cache.lastLoadError = null;
    }
    cache.entries = [];
    cache.checksum = null;
    cache.mtimeMs = 0;
  }
  return cache;
}

export async function getAllNewsEntries() {
  const { entries } = await loadNewsFile();
  return entries.slice();
}

export async function getActiveNews(now = new Date()) {
  const { entries } = await loadNewsFile();
  if (!entries.length) return null;
  const timestamp = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const active = entries.filter(entry => {
    if (timestamp < entry.startMs) return false;
    if (Number.isFinite(entry.endMs) && entry.endMs !== null && timestamp > entry.endMs) return false;
    return true;
  });
  if (!active.length) return null;
  active.sort((a, b) => {
    if (a.startMs === b.startMs) return (b.endMs || Infinity) - (a.endMs || Infinity);
    return b.startMs - a.startMs;
  });
  return active[0];
}

export function newsDigest(entry) {
  if (!entry) return null;
  return entry.digest || null;
}

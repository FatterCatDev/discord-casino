import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { randomUUID } from 'node:crypto';

const sessions = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const PAGE_SIZE = 10;
const MAX_PAGES = 10;

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - (session.updatedAt || session.createdAt || 0) > TTL_MS) {
      sessions.delete(id);
    }
  }
}

function getSession(id) {
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  const now = Date.now();
  if (now - (session.updatedAt || session.createdAt || 0) > TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function renderFromSession(sessionId, session, requestedPage = 0) {
  if (!session) return null;
  const { title, lines, pageSize, totalPages, leadingLines } = session;
  const page = Math.max(0, Math.min(requestedPage, totalPages - 1));

  const start = page * pageSize;
  const slice = lines.slice(start, start + pageSize);
  const viewLines = slice.length ? slice : ['No players ranked on this page yet.'];
  const header = `${title} — Page ${page + 1}/${totalPages}`;
  const core = `**${header}**\n${viewLines.join('\n')}`;
  const prefix = (leadingLines || []).filter(Boolean);
  const content = prefix.length ? `${prefix.join('\n')}\n\n${core}` : core;

  const firstBtn = new ButtonBuilder()
    .setCustomId(`leader|${sessionId}|first`)
    .setEmoji('⏮️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);
  const prevBtn = new ButtonBuilder()
    .setCustomId(`leader|${sessionId}|prev`)
    .setEmoji('◀️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);
  const pageIndicator = new ButtonBuilder()
    .setCustomId(`leader|${sessionId}|noop`)
    .setLabel(`Page ${page + 1}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`leader|${sessionId}|next`)
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);
  const lastBtn = new ButtonBuilder()
    .setCustomId(`leader|${sessionId}|last`)
    .setEmoji('⏭️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const row = new ActionRowBuilder().addComponents(firstBtn, prevBtn, pageIndicator, nextBtn, lastBtn);

  session.page = page;
  session.updatedAt = Date.now();

  return { content, components: [row] };
}

export function createLeaderboardSession({ title, lines, leadingLines = [], meta = null }) {
  cleanupSessions();
  const normalizedLines = Array.isArray(lines) ? [...lines] : [];
  const normalizedLeading = Array.isArray(leadingLines) ? leadingLines.filter(Boolean) : [];
  const totalPages = Math.max(
    1,
    Math.min(MAX_PAGES, Math.ceil(normalizedLines.length / PAGE_SIZE) || 1)
  );
  const id = randomUUID();
  sessions.set(id, {
    id,
    title: title || 'Leaderboard',
    lines: normalizedLines,
    pageSize: PAGE_SIZE,
    totalPages,
    page: 0,
    leadingLines: normalizedLeading,
    meta: meta || null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return id;
}

export function renderLeaderboardPage(sessionId, requestedPage = 0) {
  const session = getSession(sessionId);
  if (!session) return null;
  return renderFromSession(sessionId, session, requestedPage);
}

export function renderLeaderboardCurrent(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  const page = typeof session.page === 'number' ? session.page : 0;
  return renderFromSession(sessionId, session, page);
}

export function advanceLeaderboardSession(sessionId, action) {
  const session = getSession(sessionId);
  if (!session) return null;
  let target = typeof session.page === 'number' ? session.page : 0;
  switch (action) {
    case 'first':
      target = 0;
      break;
    case 'prev':
      target = Math.max(0, target - 1);
      break;
    case 'next':
      target = Math.min(session.totalPages - 1, target + 1);
      break;
    case 'last':
      target = session.totalPages - 1;
      break;
    default:
      if (action.startsWith('goto:')) {
        const parsed = Number.parseInt(action.split(':')[1], 10);
        if (!Number.isNaN(parsed)) {
          target = Math.max(0, Math.min(session.totalPages - 1, parsed - 1));
        }
      }
      break;
  }
  return renderFromSession(sessionId, session, target);
}

export function getLeaderboardSessionMeta(sessionId) {
  const session = getSession(sessionId);
  return session?.meta || null;
}

export function updateLeaderboardSessionMeta(sessionId, meta) {
  const session = getSession(sessionId);
  if (!session) return false;
  session.meta = meta || null;
  session.updatedAt = Date.now();
  sessions.set(sessionId, session);
  return true;
}

export function clearLeaderboardSession(sessionId) {
  sessions.delete(sessionId);
}

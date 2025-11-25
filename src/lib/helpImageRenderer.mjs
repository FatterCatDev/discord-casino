import path from 'node:path';
import { access } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const TOP_PADDING = 72;
const SIDE_PADDING = 92;
const BOTTOM_PADDING = 72;
const CONTENT_HEIGHT = CANVAS_HEIGHT - TOP_PADDING - BOTTOM_PADDING;

const GROUP_HEADER_HEIGHT = 42;
const GROUP_HEADER_SPACER = 12;
const GROUP_GAP = 28;
const ITEM_GAP = 28;
const ICON_SIZE = 58;
const ICON_AREA = ICON_SIZE + 42;
const CARD_RADIUS = 24;

const HEADER_FONT = '600 34px "DejaVu Sans", "Segoe UI", sans-serif';
const COMMAND_FONT = '600 30px "DejaVu Sans", "Segoe UI", sans-serif';
const DESC_FONT = '400 26px "DejaVu Sans", "Segoe UI", sans-serif';
const EMOJI_FONT = '400 42px "DejaVu Sans", "Segoe UI Emoji", sans-serif';
const LINE_HEIGHT = 34;
const PAGE_BADGE_FONT = '600 30px "DejaVu Sans", "Segoe UI", sans-serif';

const measureCanvas = createCanvas(2, 2);
const measureCtx = measureCanvas.getContext('2d');
measureCtx.textBaseline = 'top';

const CUSTOM_EMOJI_DIR = path.resolve(process.cwd(), 'Assets', 'custom_emojis');
const emojiImageCache = new Map();

async function loadEmojiImage(name) {
  if (!name) return null;
  if (emojiImageCache.has(name)) return emojiImageCache.get(name);

  const filePath = path.join(CUSTOM_EMOJI_DIR, `${name}.png`);
  try {
    await access(filePath);
    const image = await loadImage(filePath);
    emojiImageCache.set(name, image);
    return image;
  } catch {
    emojiImageCache.set(name, null);
    return null;
  }
}

function parseCustomEmoji(value) {
  if (typeof value !== 'string') return null;
  const match = /^<a?:([\w]+):\d+>$/.exec(value.trim());
  return match ? match[1] : null;
}

function wrapText(text, maxWidth, font) {
  if (!text) return [''];
  measureCtx.font = font;
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    const metrics = measureCtx.measureText(candidate);
    if (metrics.width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (!current) {
      lines.push(...splitWord(word, maxWidth));
      continue;
    }
    pushCurrent();
    lines.push(...splitWord(word, maxWidth));
  }
  pushCurrent();
  return lines.length ? lines : [''];
}

function splitWord(word, maxWidth) {
  const chars = [...word];
  let buffer = '';
  const out = [];
  for (const ch of chars) {
    const candidate = buffer + ch;
    if (measureCtx.measureText(candidate).width <= maxWidth) {
      buffer = candidate;
    } else {
      if (buffer) out.push(buffer);
      buffer = ch;
    }
  }
  if (buffer) out.push(buffer);
  return out.length ? out : [word];
}

function buildLayout(section, width = CANVAS_WIDTH) {
  const textWidth = width - (SIDE_PADDING * 2) - ICON_AREA;
  const layoutGroups = [];
  const groups = Array.isArray(section?.groups) ? section.groups : [];

  for (const group of groups) {
    const layoutItems = [];
    const layoutGroup = {
      label: group.label || '',
      items: layoutItems
    };
    layoutGroups.push(layoutGroup);

    const sourceItems = (group.items && group.items.length)
      ? group.items
      : [{ cmd: '', desc: '_none_', emoji: null, isPlaceholder: true }];

    for (const item of sourceItems) {
      const descriptionLines = wrapText(item.desc || '', textWidth, DESC_FONT);
      const blockHeight = LINE_HEIGHT + (descriptionLines.length * LINE_HEIGHT) + 32;
      layoutItems.push({
        cmd: item.cmd || '',
        emoji: item.emoji || '',
        descriptionLines,
        height: blockHeight
      });
    }
  }

  return { groups: layoutGroups };
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a0835');
  gradient.addColorStop(0.45, '#2c114b');
  gradient.addColorStop(1, '#3f175d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#f7e4b5';
  ctx.translate(-width * 0.2, height * 0.18);
  ctx.rotate(-0.22);
  ctx.fillRect(0, 0, width * 1.4, height * 0.18);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffdca5';
  ctx.translate(width * 0.25, height * 0.6);
  ctx.rotate(0.3);
  ctx.fillRect(0, 0, width, height * 0.16);
  ctx.restore();

  const glow = ctx.createRadialGradient(
    width * 0.78,
    height * 0.22,
    40,
    width * 0.78,
    height * 0.22,
    Math.max(width, height)
  );
  glow.addColorStop(0, 'rgba(255, 225, 180, 0.6)');
  glow.addColorStop(1, 'rgba(255, 225, 180, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawRoundedRect(ctx, x, y, width, height, radius = CARD_RADIUS) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function drawItem(ctx, item, yPosition, width) {
  const cardX = SIDE_PADDING - 26;
  const cardWidth = width - (cardX * 2);
  const cardHeight = item.height;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24;
  drawRoundedRect(ctx, cardX, yPosition - 10, cardWidth, cardHeight, CARD_RADIUS);
  ctx.fillStyle = 'rgba(18, 7, 30, 0.92)';
  ctx.fill();
  const cardEdge = ctx.createLinearGradient(cardX, yPosition - 10, cardX + cardWidth, yPosition + cardHeight);
  cardEdge.addColorStop(0, 'rgba(255, 228, 177, 0.6)');
  cardEdge.addColorStop(1, 'rgba(255, 197, 126, 0.35)');
  ctx.strokeStyle = cardEdge;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const emojiName = parseCustomEmoji(item.emoji);
  const emojiY = yPosition - 6;
  if (emojiName) {
    const emojiImage = await loadEmojiImage(emojiName);
    if (emojiImage) {
      ctx.drawImage(emojiImage, SIDE_PADDING, emojiY, ICON_SIZE, ICON_SIZE);
    } else if (item.emoji) {
      ctx.font = EMOJI_FONT;
      ctx.fillStyle = '#fff1c7';
      ctx.fillText(item.emoji, SIDE_PADDING, emojiY);
    }
  } else if (item.emoji) {
    ctx.font = EMOJI_FONT;
    ctx.fillStyle = '#fff1c7';
    ctx.fillText(item.emoji, SIDE_PADDING, emojiY);
  }

  const textX = SIDE_PADDING + ICON_AREA;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6;
  ctx.font = COMMAND_FONT;
  ctx.fillStyle = '#fff5d5';
  ctx.fillText(item.cmd, textX, yPosition);

  ctx.font = DESC_FONT;
  ctx.fillStyle = '#fffaf2';
  let cursor = yPosition + LINE_HEIGHT;
  for (const line of item.descriptionLines) {
    ctx.fillText(line, textX, cursor);
    cursor += LINE_HEIGHT;
  }
  ctx.restore();

  return yPosition + item.height;
}

function drawPageIndicator(ctx, width, height, pageNumber, pageCount) {
  if (!pageNumber || !pageCount) return;
  const text = `${pageNumber}/${pageCount}`;
  ctx.save();
  ctx.font = PAGE_BADGE_FONT;
  ctx.fillStyle = 'rgba(255, 246, 214, 0.9)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, width - SIDE_PADDING, height - 32);
  ctx.restore();
}

function createEmptyPage() {
  return { groups: [], height: 0 };
}

export function paginateHelpSection(section) {
  const layout = buildLayout(section);
  const pages = [];
  let page = createEmptyPage();
  let activeGroupLabel = null;
  let activeGroupRef = null;

  const flushPage = () => {
    if (activeGroupRef) {
      activeGroupRef = null;
      activeGroupLabel = null;
    }
    if (page.groups.length) {
      pages.push(page);
    }
    page = createEmptyPage();
  };

  for (const group of layout.groups) {
    let pending = [...group.items];
    while (pending.length) {
      const item = pending[0];
      const isFinalItem = pending.length === 1;
      const headerCost = (activeGroupLabel === group.label)
        ? 0
        : (GROUP_HEADER_HEIGHT + GROUP_HEADER_SPACER);
      const footerCost = isFinalItem ? GROUP_GAP : 0;
      const needed = headerCost + item.height + ITEM_GAP + footerCost;
      if (page.groups.length && page.height + needed > CONTENT_HEIGHT) {
        flushPage();
        activeGroupRef = null;
        activeGroupLabel = null;
        continue;
      }

      if (!activeGroupRef || activeGroupLabel !== group.label) {
        activeGroupRef = { label: group.label, items: [] };
        activeGroupLabel = group.label;
        page.groups.push(activeGroupRef);
        page.height += GROUP_HEADER_HEIGHT + GROUP_HEADER_SPACER;
      }

      activeGroupRef.items.push(item);
      page.height += item.height + ITEM_GAP;
      pending.shift();

      if (isFinalItem) {
        page.height += GROUP_GAP;
        activeGroupRef = null;
        activeGroupLabel = null;
      }
    }
  }

  flushPage();
  return pages.length ? pages : [createEmptyPage()];
}

export async function renderHelpSectionImage(section, opts = {}) {
  const width = opts.width ?? CANVAS_WIDTH;
  const height = opts.height ?? CANVAS_HEIGHT;
  const groups = Array.isArray(opts.groups) && opts.groups.length
    ? opts.groups
    : buildLayout(section, width).groups;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';
  ctx.textBaseline = 'top';

  drawBackground(ctx, width, height);

  let cursorY = TOP_PADDING;
  for (const group of groups) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 8;
    ctx.font = HEADER_FONT;
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(group.label, SIDE_PADDING, cursorY);
    ctx.restore();
    cursorY += GROUP_HEADER_HEIGHT + GROUP_HEADER_SPACER;

    for (const item of group.items) {
      cursorY = await drawItem(ctx, item, cursorY, width);
      cursorY += ITEM_GAP;
    }

    cursorY += GROUP_GAP;
  }

  drawPageIndicator(ctx, width, height, opts.pageNumber, opts.pageCount);
  return canvas.toBuffer('image/png');
}

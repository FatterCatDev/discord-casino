import path from 'node:path';
import { access } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const CANVAS_WIDTH = 1024;
const MIN_CANVAS_HEIGHT = 560;
const TOP_PADDING = 68;
const SIDE_PADDING = 78;
const BOTTOM_PADDING = 64;
const GROUP_GAP = 26;
const GROUP_HEADER_HEIGHT = 38;
const ITEM_GAP = 24;
const ICON_SIZE = 46;
const ICON_AREA = ICON_SIZE + 32;
const CARD_RADIUS = 22;

const HEADER_FONT = '600 30px "DejaVu Sans", "Segoe UI", sans-serif';
const COMMAND_FONT = '600 26px "DejaVu Sans", "Segoe UI", sans-serif';
const DESC_FONT = '400 22px "DejaVu Sans", "Segoe UI", sans-serif';
const EMOJI_FONT = '400 34px "DejaVu Sans", "Segoe UI Emoji", sans-serif';
const LINE_HEIGHT = 28;

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

function buildLayout(section, width) {
  const textWidth = width - (SIDE_PADDING * 2) - ICON_AREA;
  let height = TOP_PADDING;
  const layoutGroups = [];

  const groups = Array.isArray(section?.groups) ? section.groups : [];
  for (const group of groups) {
    const layoutItems = [];
    const groupData = {
      label: group.label || '',
      items: layoutItems
    };
    layoutGroups.push(groupData);
    height += GROUP_HEADER_HEIGHT + GROUP_GAP;

    const sourceItems = (group.items && group.items.length)
      ? group.items
      : [{ cmd: '', desc: '_none_', emoji: null, isPlaceholder: true }];

    for (const item of sourceItems) {
      const descriptionLines = wrapText(item.desc || '', textWidth, DESC_FONT);
      const blockHeight = (LINE_HEIGHT + ITEM_GAP) + (descriptionLines.length * LINE_HEIGHT);
      layoutItems.push({
        cmd: item.cmd || '',
        emoji: item.emoji || '',
        descriptionLines,
        height: blockHeight
      });
      height += blockHeight;
    }

    height += GROUP_GAP;
  }

  return {
    height: Math.max(MIN_CANVAS_HEIGHT, height + BOTTOM_PADDING),
    groups: layoutGroups
  };
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a0f33');
  gradient.addColorStop(0.45, '#2f1252');
  gradient.addColorStop(1, '#4c1b5f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#f2d88c';
  ctx.translate(-width * 0.2, height * 0.2);
  ctx.rotate(-0.25);
  ctx.fillRect(0, 0, width * 1.5, height * 0.2);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#f7e2a6';
  ctx.translate(width * 0.25, height * 0.55);
  ctx.rotate(0.3);
  ctx.fillRect(0, 0, width, height * 0.15);
  ctx.restore();

  const glow = ctx.createRadialGradient(
    width * 0.75,
    height * 0.25,
    50,
    width * 0.75,
    height * 0.25,
    Math.max(width, height)
  );
  glow.addColorStop(0, 'rgba(255, 220, 166, 0.55)');
  glow.addColorStop(1, 'rgba(255, 220, 166, 0)');
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
  const cardX = SIDE_PADDING - 28;
  const cardWidth = width - (cardX * 2);
  drawRoundedRect(ctx, cardX, yPosition - 12, cardWidth, item.height, CARD_RADIUS);
  ctx.fillStyle = 'rgba(5, 3, 8, 0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 140, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const emojiName = parseCustomEmoji(item.emoji);
  const emojiY = yPosition - 6;
  if (emojiName) {
    const emojiImage = await loadEmojiImage(emojiName);
    if (emojiImage) {
      ctx.drawImage(emojiImage, SIDE_PADDING, emojiY, ICON_SIZE, ICON_SIZE);
    } else if (item.emoji) {
      ctx.font = EMOJI_FONT;
      ctx.fillStyle = '#fceccb';
      ctx.fillText(item.emoji, SIDE_PADDING, emojiY);
    }
  } else if (item.emoji) {
    ctx.font = EMOJI_FONT;
    ctx.fillStyle = '#fceccb';
    ctx.fillText(item.emoji, SIDE_PADDING, emojiY);
  }

  const textX = SIDE_PADDING + ICON_AREA;
  ctx.font = COMMAND_FONT;
  ctx.fillStyle = '#ffe9b3';
  ctx.fillText(item.cmd, textX, yPosition);

  ctx.font = DESC_FONT;
  ctx.fillStyle = '#f6f0ff';
  let cursor = yPosition + LINE_HEIGHT;
  for (const line of item.descriptionLines) {
    ctx.fillText(line, textX, cursor);
    cursor += LINE_HEIGHT;
  }

  return yPosition + item.height;
}

export async function renderHelpSectionImage(section, opts = {}) {
  const width = opts.width ?? CANVAS_WIDTH;
  const { height, groups } = buildLayout(section, width);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';
  ctx.textBaseline = 'top';

  drawBackground(ctx, width, height);

  let cursorY = TOP_PADDING;
  for (const group of groups) {
    ctx.font = HEADER_FONT;
    ctx.fillStyle = '#ffd884';
    ctx.fillText(group.label, SIDE_PADDING, cursorY);
    cursorY += GROUP_HEADER_HEIGHT;

    cursorY += 6;
    for (const item of group.items) {
      cursorY = await drawItem(ctx, item, cursorY, width);
      cursorY += ITEM_GAP;
    }
    cursorY += GROUP_GAP;
  }

  return canvas.toBuffer('image/png');
}

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

const HEADER_FONT = '600 32px "DejaVu Sans", "Segoe UI", sans-serif';
const COMMAND_FONT = '600 28px "DejaVu Sans", "Segoe UI", sans-serif';
const DESC_FONT = '400 24px "DejaVu Sans", "Segoe UI", sans-serif';
const EMOJI_FONT = '400 42px "DejaVu Sans", "Segoe UI Emoji", sans-serif';
const LINE_HEIGHT = 32;
const PAGE_BADGE_FONT = '600 30px "DejaVu Sans", "Segoe UI", sans-serif';
const UNICODE_EMOJI_PATTERN = '\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?)*';
const INLINE_EMOJI_REGEX = new RegExp(`<a?:[\\w]+:\\d+>|${UNICODE_EMOJI_PATTERN}`, 'gu');

const measureCanvas = createCanvas(2, 2);
const measureCtx = measureCanvas.getContext('2d');
measureCtx.textBaseline = 'top';

const CUSTOM_EMOJI_DIR = path.resolve(process.cwd(), 'Assets', 'custom_emojis');
const emojiImageCache = new Map();
const unicodeEmojiCache = new Map();
const BACKGROUND_ICON_PATH = path.resolve(process.cwd(), 'Assets', 'semuta_casino_icon.png');
let backgroundIconPromise = null;

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

function loadBackgroundIcon() {
  if (backgroundIconPromise) return backgroundIconPromise;
  backgroundIconPromise = loadImage(BACKGROUND_ICON_PATH).catch(() => null);
  return backgroundIconPromise;
}

function parseCustomEmoji(value) {
  if (typeof value !== 'string') return null;
  const match = /^<a?:([\w]+):\d+>$/.exec(value.trim());
  return match ? match[1] : null;
}

function toUnicodeCodePoints(str) {
  return Array.from(str).map(char => char.codePointAt(0).toString(16));
}

async function loadUnicodeEmojiImage(symbol) {
  if (typeof symbol !== 'string' || !symbol.trim()) return null;
  if (unicodeEmojiCache.has(symbol)) return unicodeEmojiCache.get(symbol);
  const codePoints = toUnicodeCodePoints(symbol.trim());
  if (!codePoints.length) return null;
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codePoints.join('-')}.png`;
  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load emoji from ${url}`);
      const arrayBuffer = await res.arrayBuffer();
      return loadImage(Buffer.from(arrayBuffer));
    })
    .catch(() => null);
  unicodeEmojiCache.set(symbol, promise);
  return promise;
}

async function resolveEmojiImage(value) {
  const customName = parseCustomEmoji(value);
  if (customName) return loadEmojiImage(customName);
  return loadUnicodeEmojiImage(value);
}

function splitInlineEmojiText(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text) return [{ type: 'text', value: '' }];
  const tokens = [];
  INLINE_EMOJI_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = INLINE_EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'emoji', value: match[0] });
    lastIndex = INLINE_EMOJI_REGEX.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return tokens.length ? tokens : [{ type: 'text', value: text }];
}

function parseFontSizePx(font) {
  if (typeof font !== 'string') return 24;
  const match = font.match(/(\d+(?:\.\d+)?)px/i);
  return match ? Number(match[1]) : 24;
}

async function drawInlineEmojiText(ctx, text, opts = {}) {
  const {
    x = 0,
    y = 0,
    font = DESC_FONT,
    color = '#fff',
    textBaseline = 'top',
    emojiSize: sizeOverride,
    emojiGap = 6,
    emojiYOffset = 0
  } = opts;

  const tokens = splitInlineEmojiText(text);
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = textBaseline;

  const defaultSize = parseFontSizePx(font);
  const emojiSize = typeof sizeOverride === 'number' ? sizeOverride : defaultSize;
  let cursorX = x;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'emoji') {
      const image = await resolveEmojiImage(token.value);
      if (image) {
        const naturalWidth = image.width || emojiSize;
        const naturalHeight = image.height || emojiSize;
        const ratio = Math.min(emojiSize / naturalWidth, emojiSize / naturalHeight);
        const drawWidth = naturalWidth * ratio;
        const drawHeight = naturalHeight * ratio;
        const offsetY = y + emojiYOffset;
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.drawImage(image, cursorX, offsetY, drawWidth, drawHeight);
        ctx.restore();
        cursorX += drawWidth;
        const next = tokens[i + 1];
        const nextHasLeadingSpace = next && next.type === 'text' && /^\s/.test(next.value);
        if (next && !nextHasLeadingSpace) {
          cursorX += emojiGap;
        }
        continue;
      }
    }
    if (!token.value) continue;
    ctx.fillText(token.value, cursorX, y);
    cursorX += ctx.measureText(token.value).width;
  }
  ctx.restore();
  return cursorX - x;
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
  const captureSplitWord = (word) => {
    const segments = splitWord(word, maxWidth);
    if (!segments.length) return;
    const trailing = segments.pop();
    if (segments.length) lines.push(...segments);
    current = trailing ?? '';
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
      captureSplitWord(word);
      continue;
    }
    pushCurrent();
    captureSplitWord(word);
  }
  pushCurrent();
  tidyWidows(lines);
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

function tidyWidows(lines) {
  if (!Array.isArray(lines)) return;
  for (let i = 1; i < lines.length; i++) {
    const current = lines[i].trim();
    if (!current) continue;
    const currentWords = current.split(/\s+/);
    if (currentWords.length !== 1) continue;

    const prevIndex = i - 1;
    if (prevIndex < 0) continue;
    const prevLine = lines[prevIndex];
    if (!prevLine || !prevLine.trim()) continue;
    const prevWords = prevLine.trim().split(/\s+/);
    if (prevWords.length <= 1) continue;

    const moved = prevWords.pop();
    lines[prevIndex] = prevWords.join(' ');
    const combined = `${moved} ${currentWords[0]}`.trim();
    lines[i] = combined;
  }
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
      const blockHeight = LINE_HEIGHT + (descriptionLines.length * LINE_HEIGHT) + 24;
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

function drawBackground(ctx, width, height, backgroundIcon) {
  ctx.fillStyle = '#1a0634';
  ctx.fillRect(0, 0, width, height);

  if (backgroundIcon) {
    const maxWidth = width * 0.75;
    const maxHeight = height * 0.75;
    const scale = Math.min(
      maxWidth / (backgroundIcon.width || maxWidth),
      maxHeight / (backgroundIcon.height || maxHeight)
    );
    const drawWidth = (backgroundIcon.width || maxWidth) * scale;
    const drawHeight = (backgroundIcon.height || maxHeight) * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.drawImage(backgroundIcon, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  }

  // Gold trims around the canvas
  const outerTrim = ctx.createLinearGradient(0, 0, width, height);
  outerTrim.addColorStop(0, '#fbe19d');
  outerTrim.addColorStop(1, '#d28f2d');
  ctx.strokeStyle = outerTrim;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, width - 14, height - 14);

  const innerTrim = ctx.createLinearGradient(0, height, width, 0);
  innerTrim.addColorStop(0, '#f8d672');
  innerTrim.addColorStop(1, '#f6e8b1');
  ctx.strokeStyle = innerTrim;
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
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

  const emojiY = yPosition - 6;
  const emojiImage = await resolveEmojiImage(item.emoji);
  if (emojiImage) {
    const naturalWidth = emojiImage.width || ICON_SIZE;
    const naturalHeight = emojiImage.height || ICON_SIZE;
    const ratio = Math.min(ICON_SIZE / naturalWidth, ICON_SIZE / naturalHeight);
    const drawWidth = naturalWidth * ratio;
    const drawHeight = naturalHeight * ratio;
    const offsetX = SIDE_PADDING + (ICON_SIZE - drawWidth) / 2;
    const offsetY = emojiY + (ICON_SIZE - drawHeight) / 2;
    ctx.drawImage(emojiImage, offsetX, offsetY, drawWidth, drawHeight);
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
  const backgroundIcon = await loadBackgroundIcon();
  const groups = Array.isArray(opts.groups) && opts.groups.length
    ? opts.groups
    : buildLayout(section, width).groups;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';
  ctx.textBaseline = 'top';

  drawBackground(ctx, width, height, backgroundIcon);

  let cursorY = TOP_PADDING;
  for (const group of groups) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 8;
    await drawInlineEmojiText(ctx, group.label, {
      x: SIDE_PADDING,
      y: cursorY,
      font: HEADER_FONT,
      color: '#ffe6a8',
      textBaseline: 'top'
    });
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

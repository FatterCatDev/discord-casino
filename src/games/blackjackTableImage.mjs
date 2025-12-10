import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const BORDER_MARGIN = 54;
const CARD_WIDTH = 170;
const CARD_HEIGHT = 240;
const CARD_GAP = 28;
const ROW_GAP = 190;
const DEALER_ROW_Y = 140;
const PLAYER_START_Y = 520;
const LABEL_FONT = '600 44px "DejaVu Sans", "Segoe UI", sans-serif';
const SUB_FONT = '400 28px "DejaVu Sans", "Segoe UI", sans-serif';
const BACKGROUND_COLOR = '#120428';

const CARD_ASSET_DIR = path.resolve(process.cwd(), 'Assets', 'custom_emojis', 'Cards');
const BACKGROUND_ICON_PATH = path.resolve(process.cwd(), 'Assets', 'semuta_casino_icon.png');

const rankMap = {
  A: 'ace',
  K: 'king',
  Q: 'queen',
  J: 'jack'
};

const suitMap = {
  C: 'clubs',
  D: 'diamonds',
  H: 'hearts',
  S: 'spades'
};

const cardImageCache = new Map();
let backgroundIconPromise = null;

function computeHandValue(cards = []) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (!card) continue;
    if (card.r === 'A') {
      aces += 1;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(card.r)) {
      total += 10;
    } else {
      total += Number(card.r || 0);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

function formatHandLabel(base, value, revealed = true) {
  if (!revealed || !value) return base;
  const suffix = value.soft ? `${value.total} (soft)` : `${value.total}`;
  return `${base} — ${suffix}`;
}

async function loadBackgroundIcon() {
  if (backgroundIconPromise) return backgroundIconPromise;
  backgroundIconPromise = loadImage(BACKGROUND_ICON_PATH).catch(() => null);
  return backgroundIconPromise;
}

async function loadCardAsset(name) {
  if (!name) return null;
  if (cardImageCache.has(name)) return cardImageCache.get(name);
  const filePath = path.join(CARD_ASSET_DIR, `${name}.png`);
  try {
    const image = await loadImage(filePath);
    cardImageCache.set(name, image);
    return image;
  } catch {
    cardImageCache.set(name, null);
    return null;
  }
}

async function resolveCardImage(card, hidden = false) {
  if (hidden) return loadCardAsset('card_back');
  if (!card) return null;
  const rankKey = rankMap[card.r] || String(card.r || '').toLowerCase();
  const suitKey = suitMap[card.s] || '';
  if (!rankKey || !suitKey) return null;
  return loadCardAsset(`${rankKey}_${suitKey}`);
}

function drawBackground(ctx, icon) {
  const width = ctx.canvas?.width ?? CANVAS_WIDTH;
  const height = ctx.canvas?.height ?? CANVAS_HEIGHT;
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  if (icon) {
    const maxWidth = width * 0.7;
    const maxHeight = height * 0.7;
    const scale = Math.min(
      maxWidth / (icon.width || maxWidth),
      maxHeight / (icon.height || maxHeight)
    );
    const drawWidth = (icon.width || maxWidth) * scale;
    const drawHeight = (icon.height || maxHeight) * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.drawImage(icon, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  }

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

function describeRule(table) {
  if (table === 'HIGH') return 'Rule: H17 (Dealer hits soft 17)';
  return 'Rule: S17 (Dealer stands on soft 17)';
}

function drawRuleText(ctx, table) {
  const text = describeRule(table);
  ctx.save();
  ctx.font = SUB_FONT;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, CANVAS_WIDTH - BORDER_MARGIN, BORDER_MARGIN - 10);
  ctx.restore();
}

async function drawCardsRow(ctx, cards = [], options = {}) {
  const {
    y = 0,
    label = '',
    highlight = false,
    revealStates = [],
    labelIcon = null
  } = options;
  if (label) {
    ctx.save();
    ctx.font = LABEL_FONT;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const textY = y - 60;
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const iconImage = labelIcon?.image || null;
    const iconSize = Number(labelIcon?.size) || 0;
    const iconGap = iconImage ? (labelIcon?.gap ?? 18) : 0;
    const totalWidth = textWidth + (iconImage ? iconSize + iconGap : 0);
    let cursorX = (CANVAS_WIDTH - totalWidth) / 2;
    if (iconImage && iconSize > 0) {
      const iconY = textY - 6;
      ctx.drawImage(iconImage, cursorX, iconY, iconSize, iconSize);
      cursorX += iconSize + iconGap;
    }
    ctx.fillText(label, cursorX, textY);
    ctx.restore();
  }

  const cardCount = cards.length;
  const maxWidth = CANVAS_WIDTH - BORDER_MARGIN * 2;
  const fullWidth = cardCount * CARD_WIDTH + Math.max(0, cardCount - 1) * CARD_GAP;
  const scale = fullWidth > maxWidth ? (maxWidth / fullWidth) : 1;
  const scaledCardWidth = CARD_WIDTH * scale;
  const scaledCardHeight = CARD_HEIGHT * scale;
  const scaledGap = CARD_GAP * scale;
  const totalWidth = cardCount * scaledCardWidth + Math.max(0, cardCount - 1) * scaledGap;
  let startX = (CANVAS_WIDTH - totalWidth) / 2;
  if (highlight) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(BORDER_MARGIN, y - 20, CANVAS_WIDTH - BORDER_MARGIN * 2, scaledCardHeight + 40);
    ctx.restore();
  }
  if (cardCount === 0) {
    ctx.save();
    ctx.font = SUB_FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('No cards yet', CANVAS_WIDTH / 2, y + CARD_HEIGHT / 2 - 14);
    ctx.restore();
    return;
  }

  for (let i = 0; i < cards.length; i++) {
    const hidden = revealStates[i] === false;
    const image = await resolveCardImage(cards[i], hidden);
    if (image) {
      const ratio = Math.min(
        scaledCardWidth / (image.width || scaledCardWidth),
        scaledCardHeight / (image.height || scaledCardHeight)
      );
      const drawWidth = (image.width || scaledCardWidth) * ratio;
      const drawHeight = (image.height || scaledCardHeight) * ratio;
      const offsetX = startX + (scaledCardWidth - drawWidth) / 2;
      const offsetY = y + (scaledCardHeight - drawHeight) / 2;
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      ctx.save();
      ctx.fillStyle = '#2c2c2c';
      ctx.fillRect(startX, y, scaledCardWidth, scaledCardHeight);
      ctx.restore();
    }
    startX += scaledCardWidth + scaledGap;
  }
}

function buildPlayerRows(state) {
  const rows = [];
  if (state?.split && Array.isArray(state?.hands)) {
    state.hands.forEach((hand, idx) => {
      const cards = Array.isArray(hand?.cards) ? hand.cards : [];
      const value = computeHandValue(cards);
      const labelBase = idx === 0 ? 'Player Hand A' : 'Player Hand B';
      const label = formatHandLabel(
        labelBase,
        value,
        true
      );
      rows.push({
        cards,
        label,
        highlight: state.active === idx
      });
    });
    return rows;
  }
  const cards = Array.isArray(state?.player) ? state.player : [];
  const value = computeHandValue(cards);
  rows.push({
    cards,
    label: formatHandLabel('Player Hand', value, true),
    highlight: true
  });
  return rows;
}

export async function renderBlackjackTableImage(state = {}) {
  const playerRows = buildPlayerRows(state);
  const rowGap = playerRows.length > 1 ? (CARD_HEIGHT + 120) : ROW_GAP;
  const additionalRows = Math.max(0, playerRows.length - 1);
  const lastRowBottom = PLAYER_START_Y + additionalRows * rowGap + CARD_HEIGHT + 80;
  const canvasHeight = Math.max(CANVAS_HEIGHT, lastRowBottom + BORDER_MARGIN);
  const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';
  ctx.textBaseline = 'top';

  const [backgroundIcon] = await Promise.all([loadBackgroundIcon()]);
  drawBackground(ctx, backgroundIcon);
  drawRuleText(ctx, state?.table);

  const dealerCards = Array.isArray(state?.dealer) ? state.dealer : [];
  const dealerRevealStates = dealerCards.map((_, idx) => (state?.revealed ? true : idx === 0));
  const dealerValue = state?.revealed ? computeHandValue(dealerCards) : null;
  const dealerLabel = formatHandLabel('Dealer', dealerValue, Boolean(state?.revealed));
  await drawCardsRow(ctx, dealerCards, {
    y: DEALER_ROW_Y,
    label: dealerLabel,
    revealStates: dealerRevealStates
  });

  for (let i = 0; i < playerRows.length; i++) {
    const row = playerRows[i];
    await drawCardsRow(ctx, row.cards, {
      y: PLAYER_START_Y + i * rowGap,
      label: row.label,
      highlight: row.highlight,
      labelIcon: row.highlight && backgroundIcon ? { image: backgroundIcon, size: 58, gap: 20 } : null
    });
  }

  return canvas.toBuffer('image/png');
}

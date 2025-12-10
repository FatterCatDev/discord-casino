import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const SIDE_PADDING = 80;
const BORDER_MARGIN = 54;
const BACKGROUND_ICON_PATH = path.resolve(process.cwd(), 'Assets', 'semuta_casino_icon.png');
const SEMUTA_TILE_PATH = path.resolve(process.cwd(), 'Assets', 'custom_emojis', 'semuta.png');

let backgroundIconPromise = null;
let semutaTilePromise = null;

function loadBackgroundIcon() {
  if (backgroundIconPromise) return backgroundIconPromise;
  backgroundIconPromise = loadImage(BACKGROUND_ICON_PATH).catch(() => null);
  return backgroundIconPromise;
}

function loadSemutaTile() {
  if (semutaTilePromise) return semutaTilePromise;
  semutaTilePromise = loadImage(SEMUTA_TILE_PATH).catch(() => null);
  return semutaTilePromise;
}

function drawBackground(ctx, width, height, icon) {
  ctx.fillStyle = '#1a0634';
  ctx.fillRect(0, 0, width, height);

  if (icon) {
    const maxWidth = width * 0.75;
    const maxHeight = height * 0.75;
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

function gaussianRandom(mean = 0.5, deviation = 0.18) {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const gaussian = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const value = mean + gaussian * deviation;
  return Math.min(0.98, Math.max(0.02, value));
}

function buildPileEntries(tileCount) {
  const entries = [];
  for (let i = 0; i < tileCount; i++) {
    const depth = Math.random();
    const scale = 0.05 + Math.random() * 0.04;
    const rotation = (Math.random() - 0.5) * Math.PI;
    const horizontalOffset = gaussianRandom(0.5, 0.22);
    const verticalOffset = gaussianRandom(0.5, 0.22);
    entries.push({ depth, scale, rotation, horizontalOffset, verticalOffset });
  }
  entries.sort((a, b) => a.verticalOffset - b.verticalOffset);
  return entries;
}

function drawSemutaPile(ctx, tile, tileCount) {
  if (!tile || tileCount <= 0) return;
  const entries = buildPileEntries(tileCount);
  const areaX = BORDER_MARGIN;
  const areaY = BORDER_MARGIN;
  const areaWidth = CANVAS_WIDTH - BORDER_MARGIN * 2;
  const areaHeight = CANVAS_HEIGHT - BORDER_MARGIN * 2;

  for (const entry of entries) {
    const width = Math.max(24, tile.width * entry.scale);
    const height = Math.max(24, tile.height * entry.scale);
    const x = areaX + (areaWidth - width) * entry.horizontalOffset;
    const y = areaY + (areaHeight - height) * entry.verticalOffset;

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(entry.rotation);
    ctx.drawImage(tile, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}

export async function renderWarehouseImage({ warehouseGrams = 0 } = {}) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';
  ctx.textBaseline = 'top';

  const [backgroundIcon, tileImage] = await Promise.all([
    loadBackgroundIcon(),
    loadSemutaTile()
  ]);
  drawBackground(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, backgroundIcon);

  const normalizedGrams = Math.max(0, Number(warehouseGrams || 0));
  if (tileImage && normalizedGrams > 0) {
    let tileCount = Math.floor(normalizedGrams / 100);
    if (tileCount === 0) tileCount = 1;
    tileCount = Math.min(500, tileCount);
    drawSemutaPile(ctx, tileImage, tileCount);
  }

  return canvas.toBuffer('image/png');
}

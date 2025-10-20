import { fileURLToPath } from 'node:url';

function resolveAssetPath(fileName) {
  if (!fileName) return null;
  try {
    return fileURLToPath(new URL(`../../Assets/${fileName}`, import.meta.url));
  } catch {
    return null;
  }
}

function normalizeKey(value) {
  if (!value) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const GAME_THUMBNAILS = {
  blackjack: 'blackJack.png',
  ridebus: 'rideBus.png',
  ridethebus: 'rideBus.png',
  roulette: 'roulette.png',
  slots: 'slots.png',
  slot: 'slots.png',
  dicewar: 'diceWars.png',
  dicewars: 'diceWars.png',
  horserace: 'horseRace.png',
  holdem: 'holdem.png',
  texasholdem: 'holdem.png',
  poker: 'holdem.png'
};

export function buildAssetAttachment(fileName) {
  const attachment = resolveAssetPath(fileName);
  if (!attachment) return null;
  return { name: fileName, attachment };
}

export function applyEmbedThumbnail(embed, fileName) {
  if (!embed || typeof embed.setThumbnail !== 'function') return null;
  const asset = buildAssetAttachment(fileName);
  if (!asset) return null;
  embed.setThumbnail(`attachment://${asset.name}`);
  return asset;
}

export function buildAssetEmbedPayload(embed, fileName, components) {
  const payload = { embeds: [embed] };
  if (components !== undefined) payload.components = components;
  const art = applyEmbedThumbnail(embed, fileName);
  if (art) payload.files = [art];
  return payload;
}

export function resolveGameThumbnail(type, label) {
  const typeKey = normalizeKey(type);
  if (typeKey && GAME_THUMBNAILS[typeKey]) return GAME_THUMBNAILS[typeKey];
  const labelKey = normalizeKey(label);
  if (labelKey) {
    for (const [key, file] of Object.entries(GAME_THUMBNAILS)) {
      if (labelKey.includes(key)) return file;
    }
  }
  return null;
}

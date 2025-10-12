export const EMOJI = {
  // Core gameplay
  horseRace: '🏇',
  trophy: '🏆',
  finishFlag: '🏁',
  videoGame: '🎮',
  kittenFace: '😼',
  target: '🎯',
  slots: '🎰',
  dice: '🎲',
  roulette: '🎡',
  bus: '🚌',
  joystick: '🕹',
  chipCard: '🂠',
  chipAce: '🂡',
  chipJoker: '🃏',
  pokerSpade: '♠️',
  pokerClub: '♣️',
  pokerHeart: '♥️',
  pokerDiamond: '♦️',
  diceWar: '⚔️',
  holdem: '♠️',
  slotsReel: '🎴',

  // Economy
  moneyBag: '💰',
  currencyExchange: '💱',
  creditCard: '💳',
  cashStack: '💵',
  moneyWings: '💸',
  coin: '🪙',
  vault: '🏦',
  briefcase: '💼',
  receipt: '🧾',
  coinStack: '🪙',
  plus: '➕',
  minus: '➖',

  // Rewards & events
  gift: '🎁',
  partyPopper: '🎉',
  ticket: '🎟',
  sparkles: '✨',
  balloon: '🎈',
  slider: '🎚',

  // Status & alerts
  check: '✅',
  cross: '❌',
  warning: '⚠️',
  info: '❓',
  fire: '🔥',
  lock: '🔐',
  bell: '🔔',
  link: '🔗',
  repeat: '🔁',
  stopSign: '🛑',
  policeLight: '🚨',
  noEntry: '🚫',
  hourglass: '⌛',

  // Controls & setup
  gear: '⚙️',
  hammerWrench: '🛠',
  shield: '🛡',
  key: '🗝',
  folder: '📂',
  clipboard: '📝',
  scroll: '📜',
  books: '📚',
  chartUp: '📊',
  chartDown: '📉',
  satellite: '📡',
  megaphone: '📣',
  inbox: '📨',
  mailbox: '📬',
  requestEnvelope: '✉️',
  map: '🗺',
  ballot: '🗳',
  announcementChannel: '📣',

  // People & persona
  wave: '👋',
  okHand: '👌',
  crown: '👑',
  busts: '👥',
  tuxedo: '🤵',
  princess: '👸',
  man: '👨',
  proprietor: '👑',
  winkCat: '😼',
  smile: '🙂',
  sad: '😢',
  pray: '🙏',
  robot: '🤖',
  thinking: '🤔',
  kiss: '💋',
  loveLetter: '💌',
  lightBulb: '💡',
  gem: '💎',
  heartHands: '🫶',

  // Environment & misc
  rocket: '🚀',
  trafficLight: '🚦',
  construction: '🏗',
  parthenon: '🏛',
  house: '🏠',
  runner: '🏃',
  spark: '⚡',
  star: '🌟',
  globe: '🌐',
  palm: '🌴',
  seedling: '🌱',
  wheat: '🌾',
  bug: '🐛',

  // Horse race markers
  squareRed: '🟥',
  squareGreen: '🟩',
  squareYellow: '🟨',
  squareBlue: '🟦',
  squarePurple: '🟪',
  horse: '🐎'
};

export function emoji(name) {
  const value = EMOJI[name];
  if (!value) throw new Error(`Unknown emoji requested: ${name}`);
  return value;
}

export const HORSE_COLOR_EMOJIS = [
  EMOJI.squareRed,
  EMOJI.squareGreen,
  EMOJI.squareYellow,
  EMOJI.squareBlue,
  EMOJI.squarePurple
];

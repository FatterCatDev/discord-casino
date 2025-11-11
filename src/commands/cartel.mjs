import crypto from 'node:crypto';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import { emoji } from '../lib/emojis.mjs';
import {
  getCartelOverview,
  calculateSemutaMarketPrices,
  cartelCollect,
  cartelAbandon,
  listUserDealers,
  hireCartelDealer,
  payCartelDealerUpkeep,
  fireCartelDealer,
  fireAllCartelDealers,
  CartelError,
  formatSemuta,
  buildRankTableEmbed,
  dealerCapForRank,
  calculateDealerUpkeepChipsPerHour,
  dealerUpkeepPercentForTier,
  dealerPayoutForMg,
  collectDealerChips,
  cartelReserveStashForSale,
  cartelRefundStashForSale,
  cartelPayoutReservedSale,
  createShareMarketOrder,
  listShareMarketOrders,
  listShareMarketOrdersForUser,
  cancelShareMarketOrder,
  executeMarketBuy,
  executeMarketSell
} from '../cartel/service.mjs';
import {
  CARTEL_DEFAULT_SHARE_PRICE,
  CARTEL_BASE_PRICE_PER_GRAM,
  CARTEL_WAREHOUSE_FEE_BPS,
  CARTEL_MIN_TICK_SECONDS,
  CARTEL_MAX_RANK,
  CARTEL_DEALER_TIERS,
  CARTEL_DEALER_NAME_POOL,
  CARTEL_DEFAULT_XP_PER_GRAM_SOLD,
  MG_PER_GRAM,
  SEMUTA_CARTEL_USER_ID
} from '../cartel/constants.mjs';
import { xpToNextForRank } from '../cartel/progression.mjs';

const gramsFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const xpFormatter = new Intl.NumberFormat('en-US');
const CARTEL_LOG_CHANNEL_ID = process.env.CARTEL_LOG_CHANNEL_ID || '1413043107137585242';
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const SELL_MINIGAME_TICKS = 20;
const SELL_MINIGAME_ROWS = 5;
const SELL_MINIGAME_LANES = 3;
const SELL_MINIGAME_INTERVAL_MS = 1000;
const SELL_MINIGAME_PLAYER_EMOJI = '🏃';
const SELL_MINIGAME_POLICE_EMOJI = '🚓';
const SELL_MINIGAME_POTHOLE_EMOJI = '🕳️';
const SELL_MINIGAME_EMPTY_EMOJI = '       ';
const SELL_MINIGAME_SESSIONS = new Map();
const SELL_MINIGAME_MOVE_LEFT_ID = 'cartel|sell|minigame|move|left';
const SELL_MINIGAME_MOVE_RIGHT_ID = 'cartel|sell|minigame|move|right';
const CARTEL_REFRESH_CUSTOM_ID = 'cartel|refresh';
const CARTEL_RANKS_CUSTOM_ID = 'cartel|ranks';
const CARTEL_OVERVIEW_CUSTOM_ID = 'cartel|overview';
const CARTEL_SHARES_VIEW_ID = 'cartel|shares|view';
const CARTEL_SHARE_MARKET_BUY_VIEW_ID = 'cartel|shares|view|buy';
const CARTEL_SHARE_MARKET_SELL_VIEW_ID = 'cartel|shares|view|sell';
const CARTEL_SHARE_MARKET_POSTS_VIEW_ID = 'cartel|shares|view|posts';
const CARTEL_SHARE_ORDER_SELECT_ID = 'cartel|shares|posts|select';
const CARTEL_MARKET_BUY_SELECT_ID = 'cartel|shares|market|buy|select';
const CARTEL_MARKET_SELL_SELECT_ID = 'cartel|shares|market|sell|select';
const CARTEL_MARKET_BUY_CONFIRM_ID = 'cartel|shares|market|buy|confirm';
const CARTEL_MARKET_SELL_CONFIRM_ID = 'cartel|shares|market|sell|confirm';
const CARTEL_MARKET_BUY_MODAL_ID = 'cartel|shares|market|buy|modal';
const CARTEL_MARKET_SELL_MODAL_ID = 'cartel|shares|market|sell|modal';
const CARTEL_MARKET_MODAL_AMOUNT_INPUT_ID = 'cartel|shares|market|amount';
const CARTEL_DEALERS_LIST_VIEW_ID = 'cartel|dealers|view|list';
const CARTEL_DEALERS_HIRE_VIEW_ID = 'cartel|dealers|view|hire';
const CARTEL_DEALERS_UPKEEP_VIEW_ID = 'cartel|dealers|view|upkeep';
const CARTEL_DEALERS_HIRE_TIER_PREFIX = 'cartel|dealers|hire|tier|';
const CARTEL_DEALERS_UPKEEP_PREFIX = 'cartel|dealers|upkeep|';
const CARTEL_DEALERS_FIRE_PREFIX = 'cartel|dealers|fire|dealer|';
const CARTEL_DEALERS_FIRE_ALL_ID = 'cartel|dealers|fire_all';
const CARTEL_DEALERS_UPKEEP_MODAL_PREFIX = 'cartel|dealers|upkeep_modal|';
const CARTEL_DEALERS_UPKEEP_MODAL_INPUT_ID = 'chips';
const CARTEL_DEALERS_COLLECT_ID = 'cartel|dealers|collect';
const CARTEL_SELL_BUTTON_ID = 'cartel|sell|prompt';
const CARTEL_SELL_MODAL_ID = 'cartel|sell|modal';
const CARTEL_SELL_MODAL_INPUT_ID = 'cartel|sell|amount';
const CARTEL_COLLECT_BUTTON_ID = 'cartel|collect|prompt';
const CARTEL_COLLECT_MODAL_ID = 'cartel|collect|modal';
const CARTEL_COLLECT_MODAL_INPUT_ID = 'cartel|collect|amount';
const CARTEL_GUIDE_BUTTON_ID = 'cartel|guide';
const CARTEL_SHARE_ORDER_SELL_BUTTON_ID = 'cartel|shares|order|sell';
const CARTEL_SHARE_ORDER_BUY_BUTTON_ID = 'cartel|shares|order|buy';
const CARTEL_SHARE_ORDER_MODAL_ID = 'cartel|shares|order|modal';
const CARTEL_SHARE_ORDER_MODAL_SHARES_INPUT = 'cartel|shares|order|shares';
const CARTEL_SHARE_ORDER_MODAL_PRICE_INPUT = 'cartel|shares|order|price';
const CARTEL_SHARE_ORDER_CANCEL_BUTTON_ID = 'cartel|shares|order|cancel';
const DEALER_NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const dealerRecruitmentNameCache = new Map();
const SEMUTA_IMAGE_NAME = 'semuta_cartel.png';
const SEMUTA_IMAGE_PATH = `Assets/${SEMUTA_IMAGE_NAME}`;
const DEALERS_IMAGE_NAME = 'dealers.png';
const DEALERS_IMAGE_PATH = `Assets/${DEALERS_IMAGE_NAME}`;
const marketOrderSnapshots = new Map();

function snapshotKeyForUser(guildId, userId) {
  if (!guildId || !userId) return null;
  return `${guildId}:${userId}`;
}

function removeOrderFromSnapshot(guildId, userId, orderId) {
  const key = snapshotKeyForUser(guildId, userId);
  if (!key) return;
  const snapshot = marketOrderSnapshots.get(key);
  if (!snapshot) return;
  snapshot.delete(orderId);
  if (!snapshot.size) {
    marketOrderSnapshots.delete(key);
  }
}

function seedSnapshotWithOrder(guildId, userId, order) {
  const key = snapshotKeyForUser(guildId, userId);
  if (!key || !order?.order_id) return;
  const snapshot = marketOrderSnapshots.get(key) || new Map();
  snapshot.set(order.order_id, {
    shares: Math.max(0, Number(order?.shares || 0)),
    side: order.side || 'SELL',
    price: Math.max(1, Number(order?.price_per_share || 0))
  });
  marketOrderSnapshots.set(key, snapshot);
}

function buildSemutaImageAttachment() {
  return { attachment: SEMUTA_IMAGE_PATH, name: SEMUTA_IMAGE_NAME };
}

function buildDealersImageAttachment() {
  return { attachment: DEALERS_IMAGE_PATH, name: DEALERS_IMAGE_NAME };
}

function replyingToOwnMessage(interaction) {
  const botId = interaction?.client?.user?.id;
  if (!botId) return false;
  const authorId = interaction?.message?.author?.id || interaction?.message?.interaction?.user?.id || null;
  return !!authorId && authorId === botId;
}

function withAutoEphemeral(interaction, payload = {}) {
  if (replyingToOwnMessage(interaction)) {
    return { ...payload, ephemeral: true };
  }
  return payload;
}

function detectCartelPanelView(message) {
  const rawTitle = message?.embeds?.[0]?.title || '';
  const title = typeof rawTitle === 'string' ? rawTitle.toLowerCase() : '';
  if (title.includes('share market — buy')) return 'shares:buy';
  if (title.includes('share market — sell')) return 'shares:sell';
  if (title.includes('share market — posts')) return 'shares:posts';
  if (title.includes('share market') || title.includes('cartel shares')) return 'shares';
  return 'overview';
}

function extractShareMarketMode(token) {
  if (!token || typeof token !== 'string') return null;
  if (!token.startsWith('shares')) return null;
  const [, detail] = token.split(':');
  if (detail === 'buy' || detail === 'sell' || detail === 'posts') return detail;
  return 'splash';
}

async function buildOverviewPayload(interaction, ctx) {
  const chipsFmt = getChipsFormatter(ctx);
  const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
  return {
    embeds: [buildOverviewEmbed(overview, chipsFmt)],
    components: buildOverviewComponents('overview'),
    files: [buildSemutaImageAttachment()]
  };
}

async function buildSharesPayload(interaction, ctx, mode = 'splash', viewOptions = {}) {
  const chipsFmt = getChipsFormatter(ctx);
  const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
  const { selectedOrderId = null, page = 1 } = viewOptions || {};
  const guildId = interaction.guild?.id || null;
  const userId = interaction.user?.id || null;
  const normalizedPage = Math.max(1, Number.isFinite(Number(page)) ? Number(page) : 1);
  let embed;
  const componentOptions = { selectedOrderId, mode, page: normalizedPage };
  let playerOrders = [];
  const semutaPrices = calculateSemutaMarketPrices(overview?.pool?.total_shares || overview?.totals?.shares || 0);
  if (mode === 'buy') {
    const orders = guildId ? await listShareMarketOrders(guildId, 'SELL', 250) : [];
    const decorated = decorateShareMarketOrders('SELL', orders, semutaPrices.sellPrice);
    const sorted = sortShareMarketOrders(decorated, 'buy');
    const { pageSlice, pageInfo } = paginateShareMarketOrders(sorted, normalizedPage);
    embed = buildShareMarketOrderEmbed('buy', overview, pageSlice, chipsFmt, pageInfo);
    componentOptions.pageInfo = pageInfo;
    componentOptions.orders = pageSlice;
  } else if (mode === 'sell') {
    const orders = guildId ? await listShareMarketOrders(guildId, 'BUY', 250) : [];
    const decorated = decorateShareMarketOrders('BUY', orders, semutaPrices.buyPrice);
    const sorted = sortShareMarketOrders(decorated, 'sell');
    const { pageSlice, pageInfo } = paginateShareMarketOrders(sorted, normalizedPage);
    embed = buildShareMarketOrderEmbed('sell', overview, pageSlice, chipsFmt, pageInfo);
    componentOptions.pageInfo = pageInfo;
    componentOptions.orders = pageSlice;
  } else if (mode === 'posts') {
    const expiredOrders = [];
    playerOrders = guildId && userId
      ? await listShareMarketOrdersForUser(guildId, userId, 25, { expiredOrders })
      : [];
    componentOptions.playerOrders = playerOrders;
    componentOptions.expiredOrders = expiredOrders;
    embed = buildShareMarketPostsEmbed(overview, playerOrders, chipsFmt);
  } else {
    embed = buildCartelSharesEmbed(overview, chipsFmt);
  }
  return {
    payload: {
      embeds: [embed],
      components: buildShareMarketComponents(mode, componentOptions),
      files: [buildSemutaImageAttachment()]
    },
    context: {
      mode,
      page: normalizedPage,
      selectedOrderId,
      playerOrders,
      expiredOrders: componentOptions.expiredOrders || []
    }
  };
}

async function applyOverviewToMessage(target, payload) {
  if (!target || typeof target.edit !== 'function') return null;
  try {
    return await target.edit(payload);
  } catch (err) {
    console.error('Failed to edit overview message', err);
    return null;
  }
}

function sanitizeDealerNamesMap(names = null) {
  if (!names) return null;
  const mapped = {};
  for (const tier of CARTEL_DEALER_TIERS) {
    const value = names[tier.id];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        mapped[tier.id] = trimmed;
      }
    }
  }
  return Object.keys(mapped).length ? mapped : null;
}

function storeDealerRecruitNames(messageId, names) {
  if (!messageId) return;
  const sanitized = sanitizeDealerNamesMap(names);
  const existing = dealerRecruitmentNameCache.get(messageId);
  if (existing?.timeout) {
    clearTimeout(existing.timeout);
  }
  if (!sanitized) {
    dealerRecruitmentNameCache.delete(messageId);
    return;
  }
  const timeout = setTimeout(() => {
    dealerRecruitmentNameCache.delete(messageId);
  }, DEALER_NAME_CACHE_TTL_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  dealerRecruitmentNameCache.set(messageId, { names: sanitized, timeout });
}

function getDealerRecruitNames(messageId) {
  if (!messageId) return null;
  const entry = dealerRecruitmentNameCache.get(messageId);
  if (!entry) return null;
  return { ...entry.names };
}

function updateDealerRecruitName(messageId, tierId, name) {
  if (!messageId || !tierId || !name) return;
  const trimmed = trimDealerName(name);
  if (!trimmed) return;
  const next = getDealerRecruitNames(messageId) || {};
  next[tierId] = trimmed;
  storeDealerRecruitNames(messageId, next);
}

async function fetchMessageById(interaction, messageId) {
  if (!messageId || messageId === '0') return null;
  const current = interaction?.message;
  if (current && current.id === messageId) return current;
  try {
    if (interaction?.channel?.messages?.fetch) {
      return await interaction.channel.messages.fetch(messageId);
    }
  } catch (err) {
    console.error(`Failed to fetch message ${messageId} for cartel refresh`, err);
  }
  return null;
}

function formatPlayerLabel(user) {
  if (!user) return 'Unknown player';
  return user.globalName || user.username || user.tag || user.id;
}

async function logCartelActivity(interaction, activity) {
  if (!CARTEL_LOG_CHANNEL_ID || !interaction?.client) return;
  try {
    const channel = await interaction.client.channels.fetch(CARTEL_LOG_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const guildLabel = interaction.guild?.name || interaction.guild?.id || 'Unknown guild';
    const payload = [
      `Play: ${formatPlayerLabel(interaction.user)}`,
      `Guild: ${guildLabel}`,
      `Activity: ${activity}`
    ].join('\n');
    await channel.send(payload);
  } catch (err) {
    console.error('logCartelActivity error', err);
  }
}

function getChipsFormatter(ctx) {
  if (typeof ctx?.chipsAmount === 'function') {
    return (amount) => {
      try {
        return ctx.chipsAmount(amount);
      } catch (err) {
        console.warn('chipsAmount formatter failed; falling back to raw chips string.', err);
        return `${amount} chips`;
      }
    };
  }
  return (amount) => `${amount} chips`;
}

function handleCartelFailure(interaction, error) {
  if (error instanceof CartelError) {
    const message = error.message || 'Action failed.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: `⚠️ ${message}` });
    }
      return interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${message}` }));
  }
  console.error('Cartel command failed', error);
  const content = '⚠️ Something went wrong running that cartel command. Please try again in a moment.';
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content });
  }
  return interaction.reply(withAutoEphemeral(interaction, { content }));
}

async function notifyCartelButtonError(interaction, error) {
  if (error instanceof CartelError) {
    return interaction.followUp(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` }));
  }
  console.error('Cartel dealer action failed', error);
  return interaction.followUp(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong running that cartel action. Please try again in a moment.' }));
}

const CARTEL_FOREIGN_PANEL_MESSAGE = '🚫 That cartel panel belongs to someone else. Run `/cartel` to open your own view.';

async function resolveCartelPanelOwner(interaction, sourceMessageId = null) {
  if (!interaction) return null;
  if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
    return interaction.user?.id || null;
  }
  const messageOwner = interaction?.message?.interaction?.user?.id;
  if (messageOwner) return messageOwner;
  if (sourceMessageId && sourceMessageId !== '0') {
    const target = await fetchMessageById(interaction, sourceMessageId);
    if (target?.interaction?.user?.id) {
      return target.interaction.user.id;
    }
  }
  return interaction.user?.id || null;
}

async function ensureCartelAccess(interaction, _ctx, options = {}) {
  const ownerId = await resolveCartelPanelOwner(interaction, options?.sourceMessageId || null);
  if (!ownerId || ownerId === interaction.user?.id) {
    return true;
  }
  const payload = { content: CARTEL_FOREIGN_PANEL_MESSAGE, ephemeral: true };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else if (typeof interaction.reply === 'function') {
      await interaction.reply(payload);
    }
  } catch {}
  return false;
}

async function ensureShareMarketAccess(_interaction, _ctx) {
  return true;
}

function formatPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  return `${percentFormatter.format(value * 100)}%`;
}

function buildRankProgressLine(investor) {
  const rank = Math.max(1, Number(investor?.rank || 1));
  const storedXp = Math.max(0, Math.floor(Number(investor?.rank_xp || 0)));
  const xpNeeded = xpToNextForRank(rank);
  if (rank >= CARTEL_MAX_RANK || xpNeeded <= 0) {
    return `${emoji('sparkles')} Rank ${rank} (MAX Rank)`;
  }
  const remaining = Math.max(0, xpNeeded - storedXp);
  return `${emoji('sparkles')} Rank ${rank} — ${xpFormatter.format(remaining)} XP to Rank ${rank + 1} (${xpFormatter.format(storedXp)} XP stored)`;
}

function formatTickDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'tick';
  if (seconds % SECONDS_PER_DAY === 0) {
    return `${seconds / SECONDS_PER_DAY}d`;
  }
  if (seconds % SECONDS_PER_HOUR === 0) {
    return `${seconds / SECONDS_PER_HOUR}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function formatPercentDisplay(value) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  return `${percentFormatter.format(value * 100)}%`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (total >= SECONDS_PER_DAY) {
    const days = Math.floor(total / SECONDS_PER_DAY);
    const hours = Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }
  if (total >= SECONDS_PER_HOUR) {
    const hours = Math.floor(total / SECONDS_PER_HOUR);
    const minutes = Math.floor((total % SECONDS_PER_HOUR) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const minutes = Math.max(1, Math.floor(total / 60));
  return `${minutes}m`;
}

function joinSections(lines = []) {
  return lines
    .filter(line => {
      if (line == null) return false;
      if (typeof line === 'string') return line.trim().length > 0;
      return Boolean(line);
    })
    .join('\n');
}

const SECTION_DIVIDER_LINE = '────────────';

function dividerField() {
  return { name: '\u200b', value: SECTION_DIVIDER_LINE };
}

function withSectionDividers(fields = []) {
  const cleaned = fields.filter(field => field && typeof field === 'object');
  if (cleaned.length <= 1) return cleaned;
  const result = [];
  cleaned.forEach((field, idx) => {
    if (idx > 0) result.push(dividerField());
    result.push(field);
  });
  return result;
}

function buildOverviewEmbed(overview, chipsFmt) {
  const { investor, metrics } = overview;
  const hourlyValue = metrics.hourlyGrams * CARTEL_BASE_PRICE_PER_GRAM;
  const dailyValue = metrics.dailyGrams * CARTEL_BASE_PRICE_PER_GRAM;
  const tickSeconds = CARTEL_MIN_TICK_SECONDS;
  const tickDurationLabel = formatTickDuration(tickSeconds);
  const tickGramsValue = metrics.hourlyGrams * (tickSeconds / SECONDS_PER_HOUR);
  const rankLine = buildRankProgressLine(investor);
  const zeroSharesPrompt = Number(investor?.shares || 0) <= 0
    ? `${emoji('info')} You have no Semuta shares yet. Click **Cartel Shares** below to buy some.`
    : null;
  const descriptionParts = [
    rankLine,
    `${emoji('semuta')} Semuta is a pile of pale blue crystals that the cartel refines for passive chip income.`,
    zeroSharesPrompt
  ].filter(Boolean);
  const description = descriptionParts.join('\n\n');
  const fields = [
    {
      name: 'Inventory',
      value: joinSections([
        `${emoji('semuta')} Stash: **${gramsFormatter.format(metrics.stashGrams)}g of Semuta** / ${gramsFormatter.format(metrics.stashCapGrams)}g of Semuta cap`,
        `${emoji('vault')} Warehouse (overflow): **${gramsFormatter.format(metrics.warehouseGrams)}g of Semuta**`
      ])
    },
    {
      name: 'Production Estimates',
      value: joinSections([
        `${emoji('hourglass')} Tick (~${tickDurationLabel}): **${gramsFormatter.format(tickGramsValue)}g of Semuta**`,
        `${emoji('alarmClock')} Hourly: **${gramsFormatter.format(metrics.hourlyGrams)}g of Semuta** (~${chipsFmt(Math.round(hourlyValue))})`,
        `${emoji('calendar')} Daily: **${gramsFormatter.format(metrics.dailyGrams)}g of Semuta** (~${chipsFmt(Math.round(dailyValue))})`
      ])
    }
  ];

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${emoji('semuta_cartel')} Semuta Cartel Overview`)
    .setThumbnail(`attachment://${SEMUTA_IMAGE_NAME}`)
    .setDescription(description)
    .addFields(...withSectionDividers(fields))
    .setFooter({ text: 'Grow your Semuta stash, then sell the pale blue crystals for passive chips.' });
}

function buildCartelSharesEmbed(overview, chipsFmt, { maintenance = false, includeSnapshot = true } = {}) {
  const { investor, metrics, totals, pool, nextTickAt } = overview;
  const sharePrice = Math.max(
    1,
    Math.floor(Number(metrics?.sharePrice || pool?.share_price || CARTEL_DEFAULT_SHARE_PRICE))
  );
  const perShareRate = gramsFormatter.format(mgToGrams(metrics?.perShareRateMg || 0));
  const nextTickLine = nextTickAt
    ? `<t:${nextTickAt}:R>`
    : 'Pending first production tick';
  const descriptionParts = ['Monitor your holdings and the cartel pool before buying or selling shares.'];
  if (maintenance) {
    descriptionParts.push(`${emoji('warning')} Share Market is in maintenance and limited to admins for now.`);
  }
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle(`${emoji('semuta_cartel')} Semuta Cartel Share Market`)
    .setThumbnail(`attachment://${SEMUTA_IMAGE_NAME}`)
    .setDescription(descriptionParts.join('\n\n'))
    .setFooter({ text: 'Buy shares to grow production or sell shares to cash out chips.' });
  if (includeSnapshot) {
    const holdingsField = {
      name: 'Player Holdings',
      value: joinSections([
        `${emoji('cashStack')} Shares: **${Number(investor?.shares || 0).toLocaleString('en-US')}**`,
        `${emoji('pie')} Pool share: **${formatPercent(metrics.sharePercent)}**`,
        `${emoji('hourglass')} Per-share output: **${perShareRate}g of Semuta/hr**`
      ])
    };
    const poolField = {
      name: 'Cartel Pool',
      value: joinSections([
        `${emoji('chipCard')} Share price: **${chipsFmt(sharePrice)}**`,
        `${emoji('busts')} Investors: **${totals.investors}**`,
        `${emoji('chipCard')} Shares outstanding: **${Number(pool?.total_shares || 0).toLocaleString('en-US')}**`,
        `${emoji('hourglassFlow')} Next tick: ${nextTickLine}`,
        `${emoji('balanceScale')} Warehouse fee: **${(CARTEL_WAREHOUSE_FEE_BPS / 100).toFixed(2)}%**`
      ])
    };
    embed.addFields(...withSectionDividers([holdingsField, poolField]));
  }
  return embed;
}

function buildShareMarketComponents(mode = 'splash', options = {}) {
  const playerOrders = Array.isArray(options?.playerOrders) ? options.playerOrders : [];
  const selectedOrderIdRaw = typeof options?.selectedOrderId === 'string' ? options.selectedOrderId : null;
  const pageInfo = options?.pageInfo || null;
  const ordersForPage = Array.isArray(options?.orders) ? options.orders : [];
  const currentPage = pageInfo?.current || Number(options?.page || 1) || 1;
  const buyNavStyle = mode === 'buy' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const sellNavStyle = mode === 'sell' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const postsNavStyle = mode === 'posts' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const rows = [];

  const navRow = new ActionRowBuilder();
  if (mode === 'splash') {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(CARTEL_OVERVIEW_CUSTOM_ID)
        .setLabel('Return to Overview')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(CARTEL_SHARES_VIEW_ID)
        .setLabel('Splash')
        .setEmoji('📈')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(CARTEL_SHARE_MARKET_BUY_VIEW_ID)
      .setLabel('Buy')
      .setEmoji('🛒')
      .setStyle(buyNavStyle),
    new ButtonBuilder()
      .setCustomId(CARTEL_SHARE_MARKET_SELL_VIEW_ID)
      .setLabel('Sell')
      .setEmoji('💱')
      .setStyle(sellNavStyle),
    new ButtonBuilder()
      .setCustomId(CARTEL_SHARE_MARKET_POSTS_VIEW_ID)
      .setLabel('Posts')
      .setEmoji('📮')
      .setStyle(postsNavStyle),
    new ButtonBuilder()
      .setCustomId(CARTEL_DEALERS_LIST_VIEW_ID)
      .setLabel('Dealers')
      .setEmoji('🧑‍🤝‍🧑')
      .setStyle(ButtonStyle.Primary)
  );
  rows.push(navRow);

  if (mode !== 'splash') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CARTEL_SHARE_ORDER_SELL_BUTTON_ID)
          .setLabel('Post Sell Order')
          .setEmoji('📢')
          .setStyle(mode === 'buy' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CARTEL_SHARE_ORDER_BUY_BUTTON_ID)
          .setLabel('Post Buy Order')
          .setEmoji('🛒')
          .setStyle(mode === 'sell' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CARTEL_GUIDE_BUTTON_ID)
          .setLabel('Guide')
          .setEmoji('📘')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  if ((mode === 'buy' || mode === 'sell') && pageInfo && pageInfo.total > 1) {
    const prevPage = Math.max(1, pageInfo.current - 1);
    const nextPage = Math.min(pageInfo.total, pageInfo.current + 1);
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cartel|shares|view|${mode}|page|${prevPage}`)
          .setLabel('Prev')
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageInfo.current <= 1),
        new ButtonBuilder()
          .setCustomId(`cartel|shares|view|${mode}|page|${nextPage}`)
          .setLabel('Next')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageInfo.current >= pageInfo.total)
      )
    );
  }

  if ((mode === 'buy' || mode === 'sell') && ordersForPage.length) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(
        mode === 'buy'
          ? `${CARTEL_MARKET_BUY_SELECT_ID}|${currentPage}`
          : `${CARTEL_MARKET_SELL_SELECT_ID}|${currentPage}`
      )
      .setPlaceholder('Select an order')
      .setMinValues(1)
      .setMaxValues(1);
    const currentOrderIds = new Set(ordersForPage.map(order => order?.order_id));
    const effectiveSelectedId = currentOrderIds.has(selectedOrderIdRaw) ? selectedOrderIdRaw : null;
    const optionBuilders = ordersForPage.slice(0, 25).map(order => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(buildMarketOrderOptionLabel(order))
        .setValue(order.order_id)
        .setDescription(buildMarketOrderOptionDescription(order));
      if (order.order_id === effectiveSelectedId) option.setDefault(true);
      return option;
    });
    if (optionBuilders.length) {
      selectMenu.addOptions(optionBuilders);
      rows.push(new ActionRowBuilder().addComponents(selectMenu));
      const confirmId = mode === 'buy'
        ? `${CARTEL_MARKET_BUY_CONFIRM_ID}|${effectiveSelectedId || '0'}|${currentPage}`
        : `${CARTEL_MARKET_SELL_CONFIRM_ID}|${effectiveSelectedId || '0'}|${currentPage}`;
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(confirmId)
            .setLabel(mode === 'buy' ? 'Enter Shares to Buy' : 'Enter Shares to Sell')
            .setEmoji('✅')
            .setStyle(mode === 'buy' ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(!effectiveSelectedId)
        )
      );
    }
  }

  if (mode === 'posts' && playerOrders.length) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(CARTEL_SHARE_ORDER_SELECT_ID)
      .setPlaceholder('Select one of your orders')
      .setMinValues(1)
      .setMaxValues(1);
    const optionBuilders = playerOrders.slice(0, 25).map(order => {
      const shareCount = Math.max(0, Number(order?.shares || 0));
      const shareLabel = `${shareCount.toLocaleString('en-US')} ${shareCount === 1 ? 'share' : 'shares'}`;
      const priceLabel = Math.max(1, Math.floor(Number(order?.price_per_share || 0))).toLocaleString('en-US');
      const sideLabel = String(order?.side).toUpperCase() === 'BUY' ? 'Buy' : 'Sell';
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`${sideLabel} ${shareLabel}`)
        .setValue(order.order_id)
        .setDescription(`@ ${priceLabel} chips · ${order?.created_at ? formatRelativeTs(order.created_at) : 'posted now'}`);
      if (order.order_id === selectedOrderIdRaw) option.setDefault(true);
      return option;
    });
    if (optionBuilders.length) {
      selectMenu.addOptions(optionBuilders);
      rows.push(new ActionRowBuilder().addComponents(selectMenu));
      const cancelTarget = selectedOrderIdRaw || '0';
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${CARTEL_SHARE_ORDER_CANCEL_BUTTON_ID}|${cancelTarget}`)
            .setLabel('Cancel Order')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(cancelTarget === '0')
        )
      );
    }
  }

  return rows;
}

function buildShareMarketOrderEmbed(mode, overview, orders, chipsFmt, pageInfo = null) {
  const isBuyView = mode === 'buy';
  const pageLabel = pageInfo && pageInfo.total > 1
    ? ` — Page ${pageInfo.current}/${pageInfo.total}`
    : '';
  const baseDescription = isBuyView
    ? 'Browse live sell posts from other players or rely on the Semuta Cartel’s infinite inventory.'
    : 'Review open buy posts from other players ready to pay chips for your shares.';
  const pageDescription = pageInfo && pageInfo.total > 1
    ? `Page ${pageInfo.current} of ${pageInfo.total} — showing ${orders.length} of ${pageInfo.totalItems.toLocaleString('en-US')} posts.`
    : null;
  const embed = buildCartelSharesEmbed(overview, chipsFmt, { maintenance: false, includeSnapshot: false })
    .setTitle(`${emoji('semuta_cartel')} Semuta Cartel Share Market — ${isBuyView ? 'Buy' : 'Sell'}${pageLabel}`)
    .setDescription([baseDescription, pageDescription].filter(Boolean).join('\n\n'));
  if (pageInfo) {
    embed.setFooter({ text: `Showing ${orders.length} of ${pageInfo.totalItems} posts · Page ${pageInfo.current}/${pageInfo.total}` });
  }
  embed.addFields(...withSectionDividers([
    {
      name: `${emoji('clipboard')} ${isBuyView ? 'Sell Posts' : 'Buy Posts'}`,
      value: formatShareMarketOrdersList(orders, chipsFmt)
    }
  ]));
  return embed;
}

function buildShareMarketPostsEmbed(overview, orders, chipsFmt) {
  const embed = buildCartelSharesEmbed(overview, chipsFmt, { maintenance: false, includeSnapshot: false })
    .setTitle(`${emoji('semuta_cartel')} Semuta Cartel Share Market — Posts`)
    .setDescription('Track your own market posts or create a new listing in seconds.');
  const buyOrders = (orders || []).filter(order => String(order?.side).toUpperCase() === 'BUY');
  const sellOrders = (orders || []).filter(order => String(order?.side).toUpperCase() !== 'BUY');
  embed.addFields(...withSectionDividers([
    {
      name: `${emoji('chipCard')} Your Buy Orders`,
      value: formatPlayerMarketOrdersList(buyOrders, chipsFmt, '_No buy orders yet._')
    },
    {
      name: `${emoji('receipt')} Your Sell Orders`,
      value: formatPlayerMarketOrdersList(sellOrders, chipsFmt, '_No sell orders yet._')
    }
  ]));
  return embed;
}

function decorateShareMarketOrders(side, orders = [], semutaPrice = 100) {
  const sanitized = Array.isArray(orders) ? orders.filter(Boolean) : [];
  return [buildSemutaMarketOrder(side, semutaPrice), ...sanitized];
}

function sortShareMarketOrders(orders = [], mode = 'buy') {
  const normalizedMode = mode === 'sell' ? 'sell' : 'buy';
  const sorted = [...orders];
  sorted.sort((a, b) => {
    const priceA = Number(a?.price_per_share || 0);
    const priceB = Number(b?.price_per_share || 0);
    const createdA = Number(a?.created_at || 0);
    const createdB = Number(b?.created_at || 0);
    if (normalizedMode === 'buy') {
      if (priceA !== priceB) return priceA - priceB;
      return createdA - createdB;
    }
    if (priceA !== priceB) return priceB - priceA;
    return createdA - createdB;
  });
  return sorted;
}

function paginateShareMarketOrders(orders = [], requestedPage = 1, pageSize = 25) {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 25));
  const totalItems = orders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const current = Math.min(Math.max(1, Math.floor(Number(requestedPage) || 1)), totalPages);
  const start = (current - 1) * safePageSize;
  const pageSlice = orders.slice(start, start + safePageSize);
  return {
    pageSlice,
    pageInfo: {
      current,
      total: totalPages,
      totalItems,
      pageSize: safePageSize
    }
  };
}

function buildSemutaMarketOrder(side, semutaPrice) {
  const normalizedSide = String(side || 'SELL').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  const price = Math.max(1, Math.floor(Number(semutaPrice || 0)));
  return {
    order_id: `${normalizedSide.toLowerCase()}_${SEMUTA_CARTEL_USER_ID}`,
    guild_id: null,
    user_id: SEMUTA_CARTEL_USER_ID,
    side: normalizedSide,
    shares: Number.POSITIVE_INFINITY,
    price_per_share: price,
    status: 'OPEN',
    created_at: null,
    infinite: true
  };
}

function formatShareMarketOrdersList(orders = [], chipsFmt) {
  if (!orders.length) return '_No posts yet._';
  const lines = orders
    .map(order => formatShareMarketOrderLine(order, chipsFmt))
    .filter(Boolean);
  if (!lines.length) return '_No posts yet._';
  const onlySemuta = orders.every(order => order?.user_id === SEMUTA_CARTEL_USER_ID);
  const output = lines.join('\n');
  if (onlySemuta) {
    return `${output}\n${emoji('sparkles')} No player posts yet—use **Post Order** below to create one.`;
  }
  return output;
}

function buildMarketOrderOptionLabel(order) {
  const sideLabel = String(order?.side).toUpperCase() === 'BUY' ? 'Buy' : 'Sell';
  const shareLabel = order?.infinite
    ? '∞ shares'
    : `${Math.max(0, Number(order?.shares || 0)).toLocaleString('en-US')} shares`;
  const priceLabel = Math.max(1, Math.floor(Number(order?.price_per_share || 0))).toLocaleString('en-US');
  return `${sideLabel} ${shareLabel} @ ${priceLabel}`;
}

function buildMarketOrderOptionDescription(order) {
  const ownerLabel = order?.user_id === SEMUTA_CARTEL_USER_ID
    ? 'Semuta Cartel'
    : order?.user_id
      ? `Order by ${shortUserId(order.user_id)}`
      : 'Order';
  const posted = order?.user_id === SEMUTA_CARTEL_USER_ID
    ? 'always available'
    : order?.created_at
      ? formatRelativeTs(order.created_at)
      : 'just now';
  return `${ownerLabel} · ${posted}`;
}

function shortUserId(userId) {
  const value = String(userId || '');
  if (!value) return 'Unknown';
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

function formatShareMarketOrderLine(order, chipsFmt) {
  const sideLabel = String(order?.side).toUpperCase() === 'BUY' ? 'Buying' : 'Selling';
  const userLabel = order?.user_id === SEMUTA_CARTEL_USER_ID
    ? `${emoji('semuta_cartel')} Semuta Cartel`
    : `<@${order?.user_id}>`;
  const shareCount = Math.max(0, Number(order?.shares || 0));
  const shareLabel = order?.infinite
    ? '∞ shares'
    : `${shareCount.toLocaleString('en-US')} ${shareCount === 1 ? 'share' : 'shares'}`;
  const price = Math.max(1, Math.floor(Number(order?.price_per_share || 0)));
  const posted = order?.created_at ? ` · ${formatRelativeTs(order.created_at)}` : '';
  return `${emoji('chipCard')} ${userLabel} — ${sideLabel} ${shareLabel} @ ${chipsFmt(price)} per share${posted}`;
}

function shortOrderId(orderId) {
  const value = String(orderId || '');
  if (!value) return 'unknown';
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

function formatPlayerMarketOrdersList(orders = [], chipsFmt, fallbackMessage = '_None yet._') {
  if (!orders.length) return fallbackMessage;
  const lines = orders
    .slice(0, 5)
    .map(order => {
      const shareCount = Math.max(0, Number(order?.shares || 0));
      const price = Math.max(1, Math.floor(Number(order?.price_per_share || 0)));
      const posted = order?.created_at ? formatRelativeTs(order.created_at) : 'just now';
      const shareLabel = `${shareCount.toLocaleString('en-US')} ${shareCount === 1 ? 'share' : 'shares'}`;
      return `${emoji('chipCard')} ${shareLabel} @ ${chipsFmt(price)} — posted ${posted}`;
    })
    .filter(Boolean);
  return lines.length ? lines.join('\n') : fallbackMessage;
}

async function maybeNotifyOrderFills(interaction, ctx, playerOrders = [], expiredOrderIds = []) {
  const guildId = interaction.guild?.id;
  const userId = interaction.user?.id;
  const snapshotKey = snapshotKeyForUser(guildId, userId);
  if (!snapshotKey) return;
  const previous = marketOrderSnapshots.get(snapshotKey) || new Map();
  const current = new Map();
  for (const order of playerOrders) {
    if (!order?.order_id) continue;
    current.set(order.order_id, {
      shares: Math.max(0, Number(order?.shares || 0)),
      side: order.side || 'SELL',
      price: Math.max(1, Number(order?.price_per_share || 0))
    });
  }
  const expiredSet = new Set(expiredOrderIds || []);
  const updates = [];
  for (const [orderId, prevEntry] of previous.entries()) {
    if (expiredSet.has(orderId)) {
      previous.delete(orderId);
      continue;
    }
    const currentEntry = current.get(orderId);
    if (!currentEntry) {
      updates.push({
        type: 'closed',
        orderId,
        side: prevEntry.side,
        price: prevEntry.price,
        delta: prevEntry.shares
      });
      continue;
    }
    if (currentEntry.shares < prevEntry.shares) {
      updates.push({
        type: 'partial',
        orderId,
        side: currentEntry.side,
        price: currentEntry.price,
        delta: prevEntry.shares - currentEntry.shares,
        remaining: currentEntry.shares
      });
    }
  }
  // replace snapshot with current values
  if (current.size) {
    const nextSnapshot = new Map();
    for (const [orderId, entry] of current.entries()) {
      nextSnapshot.set(orderId, { ...entry });
    }
    marketOrderSnapshots.set(snapshotKey, nextSnapshot);
  } else {
    marketOrderSnapshots.delete(snapshotKey);
  }
  if (!updates.length) return;
  const chipsFmt = getChipsFormatter(ctx);
  const lines = updates.map(update => {
    const normalizedSide = String(update.side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const sideLabel = normalizedSide === 'BUY' ? 'Buy' : 'Sell';
    const chipsDelta = update.delta * update.price * (normalizedSide === 'SELL' ? 1 : -1);
    const sharesDelta = normalizedSide === 'SELL' ? -update.delta : update.delta;
    const chipsString = `${chipsDelta >= 0 ? '+' : '-'}${chipsFmt(Math.abs(chipsDelta))}`;
    const sharesString = `${sharesDelta >= 0 ? '+' : '-'}${Math.abs(sharesDelta).toLocaleString('en-US')} shares`;
    if (update.type === 'partial') {
      return `• ${sideLabel} order (${shortOrderId(update.orderId)}) filled **${update.delta.toLocaleString('en-US')}** shares @ ${chipsFmt(update.price)} (${chipsString}, ${sharesString}) — ${update.remaining.toLocaleString('en-US')} remaining.`;
    }
    return `• ${sideLabel} order (${shortOrderId(update.orderId)}) filled completely @ ${chipsFmt(update.price)} (${chipsString}, ${sharesString}).`;
  });
  const content = `${emoji('info')} Order updates since your last visit:\n${lines.join('\n')}`;
  await interaction.followUp(withAutoEphemeral(interaction, { content })).catch(() => {});
}

function buildOverviewComponents(mode = 'overview') {
  const primary = new ButtonBuilder()
    .setCustomId(CARTEL_REFRESH_CUSTOM_ID)
    .setLabel('Refresh')
    .setEmoji('🔁')
    .setStyle(ButtonStyle.Secondary);
  const secondary = new ButtonBuilder()
    .setCustomId(mode === 'overview' ? CARTEL_RANKS_CUSTOM_ID : CARTEL_OVERVIEW_CUSTOM_ID)
    .setLabel(mode === 'overview' ? 'Rank XP Table' : 'Return to Overview')
    .setEmoji(mode === 'overview' ? '📊' : '↩️')
    .setStyle(ButtonStyle.Secondary);
  const rows = [new ActionRowBuilder().addComponents(primary, secondary)];
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CARTEL_SHARES_VIEW_ID)
      .setLabel('Cartel Shares')
      .setEmoji('📈')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CARTEL_DEALERS_LIST_VIEW_ID)
      .setLabel('Dealers')
      .setEmoji('🧑‍🤝‍🧑')
      .setStyle(ButtonStyle.Primary)
  );
  rows.push(navRow);
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CARTEL_SELL_BUTTON_ID)
        .setLabel('Sell Stash')
        .setEmoji('📉')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CARTEL_COLLECT_BUTTON_ID)
        .setLabel('Collect Warehouse')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CARTEL_GUIDE_BUTTON_ID)
        .setLabel('Guide')
        .setEmoji('📘')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return rows;
}

function buildCartelGuideEmbed(overview = null, chipsFmt = amount => `${amount} chips`) {
  const sharePrice = Math.max(
    1,
    Math.floor(Number(overview?.metrics?.sharePrice || overview?.pool?.share_price || CARTEL_DEFAULT_SHARE_PRICE))
  );
  const shareRateGramPerHour = gramsFormatter.format(mgToGrams(overview?.metrics?.perShareRateMg || 0));
  const xpRate = Math.max(0, Number(overview?.metrics?.xpPerGram ?? CARTEL_DEFAULT_XP_PER_GRAM_SOLD));
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${emoji('books')} Semuta Loot Guide`)
    .setThumbnail(`attachment://${SEMUTA_IMAGE_NAME}`)
    .setDescription('How to convert pale blue Semuta into steady chip loot—follow this lightweight loop.');
  const fields = [
    {
      name: `${emoji('chipCard')} Economy Snapshot`,
      value: joinSections([
        `${emoji('cashStack')} Share price: **${chipsFmt(sharePrice)}** · Customer rate: **${CARTEL_BASE_PRICE_PER_GRAM} chips/g**`,
        `${emoji('semuta')} Share rate: **${shareRateGramPerHour}g of Semuta / share / hr**`,
        `${emoji('spark')} XP gain = Semuta sold × **${xpRate.toLocaleString('en-US', { maximumFractionDigits: 2 })} XP/g**.`,
        `${emoji('hourglass')} Production per tick = share rate × total shares × your pool share % × tick length.`
      ])
    },
    {
      name: `${emoji('sparkles')} Bootstrapping`,
      value: joinSections([
        `${emoji('cashStack')} Invest chips through the **Buy Shares** button on the Cartel Shares screen to buy Semuta shares and raise your hourly output.`,
        `${emoji('semuta')} Keep stash space clear—overflow rolls into the warehouse with a small fee, but every gram still pays.`,
        `${emoji('medalGold')} Rank up by collecting and selling; higher ranks unlock more dealer slots and stash cap.`
      ])
    },
    {
      name: `${emoji('hourglassFlow')} Daily Loot Loop`,
      value: joinSections([
        `1. **Sell Stash** to turn ready grams of Semuta into chips (enter a number or type ALL).`,
        `2. **Collect Warehouse** when overflow stacks up so none of your Semuta sits idle.`,
        `3. **Hire Dealers** on the List tab and keep their upkeep timers paid so they auto-sell stash for you.`,
        `4. **Collect Chips** from dealers to scoop passive payouts plus cartel XP.`
      ])
    },
    {
      name: `${emoji('spark')} Quick Tips`,
      value: joinSections([
        `${emoji('alarmClock')} Production ticks roughly every few minutes—use **Refresh** to see the latest Semuta stash math.`,
        `${emoji('hammerWrench')} Admins can tune share price, rate, and XP live with \`/setcartelshare\`, \`/setcartelrate\`, and \`/setcartelxp\`.`,
        `${emoji('package')} Warehouse fees are minor, but stash space is free. Sell regularly to keep the blue crystals flowing.`
      ])
    }
  ];
  embed.addFields(...withSectionDividers(fields));
  embed.setFooter({ text: 'Use the buttons below to jump straight into each action.' });
  return embed;
}

function safeGetString(options, name) {
  if (!options?.getString) return null;
  try {
    return options.getString(name);
  } catch {
    return null;
  }
}

function shortDealerId(dealerId) {
  const str = String(dealerId || '');
  return str ? str.slice(0, 8) : 'unknown';
}

function formatRelativeTs(ts) {
  if (!ts) return 'n/a';
  return `<t:${Math.floor(Number(ts))}:R>`;
}

function mgToGrams(mg) {
  return Number(mg || 0) / MG_PER_GRAM;
}

function gramsToMg(grams) {
  const value = Number(grams);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.floor(value * MG_PER_GRAM));
}

function trimDealerName(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function collectDealerNameReservations(dealers = []) {
  const names = new Set();
  for (const dealer of dealers || []) {
    const trimmed = trimDealerName(dealer?.display_name);
    if (trimmed) names.add(trimmed);
  }
  return names;
}

function randomDealerName(tierId) {
  const pool = CARTEL_DEALER_NAME_POOL[tierId] || [];
  if (!pool.length) return `Tier ${tierId} Contact`;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

function nextDealerBoardName(tierId, exclude = null, avoidNames = null) {
  const pool = CARTEL_DEALER_NAME_POOL[tierId] || [];
  if (!pool.length) return `Tier ${tierId} Contact`;
  if (pool.length === 1) {
    const single = pool[0];
    if (avoidNames && avoidNames.has(single) && pool.length > 1) {
      const fallback = pool.find(name => !avoidNames.has(name));
      if (fallback) return fallback;
    }
    return single;
  }
  let candidate = randomDealerName(tierId);
  let attempts = 0;
  const shouldAvoid = (name) => {
    if (exclude && name === exclude) return true;
    if (avoidNames && avoidNames.has(name)) return true;
    return false;
  };
  while (shouldAvoid(candidate) && attempts < pool.length * 3) {
    candidate = randomDealerName(tierId);
    attempts += 1;
  }
  if (shouldAvoid(candidate)) {
    const fallback = pool.find(name => !shouldAvoid(name));
    if (fallback) return fallback;
  }
  return candidate;
}

function ensureDealerBoardName(names, tierId, avoidNames = null) {
  if (!names) return nextDealerBoardName(tierId, null, avoidNames);
  const existing = names[tierId];
  const trimmed = trimDealerName(existing);
  if (trimmed && !(avoidNames && avoidNames.has(trimmed))) return trimmed;
  const generated = nextDealerBoardName(tierId, trimmed || null, avoidNames);
  names[tierId] = generated;
  return generated;
}

function dealerTierEmoji(tierId) {
  switch (Number(tierId)) {
    case 0:
      return emoji('lookout');
    case 1:
      return emoji('street_runner');
    case 2:
      return emoji('courier');
    case 3:
      return emoji('distributor');
    case 4:
      return emoji('rount_boss');
    case 5:
      return emoji('kingpin');
    default:
      return emoji('briefcase');
  }
}

function buildDealerProspectEmbed(
  investor,
  chipsFmt,
  { cachedNames = null, dealerCount = 0, dealerCap = null, takenNames = null } = {}
) {
  const playerRank = Math.max(1, Number(investor?.rank || 1));
  const workingNames = cachedNames ? { ...cachedNames } : {};
  const reservedNames = new Set();
  if (takenNames) {
    for (const name of takenNames) {
      const trimmed = trimDealerName(name);
      if (trimmed) reservedNames.add(trimmed);
    }
  }
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`${emoji('newspaper')} Dealer Recruitment Board`)
    .setThumbnail(`attachment://${DEALERS_IMAGE_NAME}`)
    .setDescription('Meet the five Semuta distributors. Use the buttons below to recruit them once you hit the required rank.');
  const fields = [];
  const capKnown = Number.isFinite(dealerCap);
  if (capKnown) {
    const capReached = dealerCount >= dealerCap;
    const capLine = `${dealerCount} / ${dealerCap} slots used${capReached ? ` — ${emoji('warning')} Cap reached` : ''}`;
    fields.push({
      name: `${emoji('clipboard')} Dealer Slots`,
      value: capLine
    });
  } else {
    const line = dealerCount > 0
      ? `${dealerCount} active ${dealerCount === 1 ? 'dealer' : 'dealers'}`
      : 'No active dealers yet.';
    fields.push({
      name: `${emoji('clipboard')} Dealer Slots`,
      value: line
    });
  }
  for (const tier of CARTEL_DEALER_TIERS) {
    const multiplier = (Number(tier.priceMultiplierBps || 10_000) / 10_000).toFixed(2);
    const locked = playerRank < tier.requiredRank;
    const contactName = ensureDealerBoardName(workingNames, tier.id, reservedNames);
    reservedNames.add(contactName);
    const upkeepRate = Math.max(0, calculateDealerUpkeepChipsPerHour({
      tier: tier.id,
      hourly_sell_cap_mg: tier.hourlySellCapMg,
      price_multiplier_bps: tier.priceMultiplierBps
    }));
    const upkeepPercent = dealerUpkeepPercentForTier(tier.id);
    const lines = [
      `${emoji('medalGold')} Required Rank: **${tier.requiredRank}**`,
      `${emoji('cashStack')} Hire Cost: **${chipsFmt(tier.hireCost)}**`,
      `${emoji('receipt')} Upkeep: ${formatPercentDisplay(upkeepPercent)} of sales (~${chipsFmt(Math.round(upkeepRate))}/hr)`,
      `${emoji('alarmClock')} Capacity: **${tier.hourlySellCapGrams}g of Semuta/hr** @ ${multiplier}×`,
      locked
        ? `${emoji('lock')} Reach Rank ${tier.requiredRank} to unlock this dealer.`
        : `${emoji('whiteCheck')} Ready to hire now.`
    ];
    const value = locked ? lines.map(line => `> ${line}`).join('\n>\n') : joinSections(lines);
    const tierEmoji = dealerTierEmoji(tier.id);
    fields.push({
      name: `${locked ? emoji('lock') : tierEmoji} ${tier.name} — “${contactName}”`,
      value
    });
  }
  if (fields.length) {
    embed.addFields(...withSectionDividers(fields));
  }
  return { embed, names: workingNames };
}

function buildOwnedDealersEmbed(dealers, chipsFmt) {
  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle(`${emoji('dealers')} Your Cartel Dealers`)
    .setThumbnail(`attachment://${DEALERS_IMAGE_NAME}`);
  if (!dealers.length) {
    embed.setDescription('No dealers on payroll yet. Tap **Hire** below to bring someone onboard.');
    return embed;
  }
  const totalPending = dealers.reduce((sum, dealer) => sum + Number(dealer?.pending_chips || 0), 0);
  if (totalPending > 0) {
    embed.setDescription(`${emoji('cashStack')} Pending chips: **${chipsFmt(totalPending)}**`);
  }
  const fields = [];
  for (const dealer of dealers) {
    const tierName = dealer.tierInfo?.name || `Tier ${dealer.tier}`;
    const contactName = typeof dealer.display_name === 'string' && dealer.display_name.trim()
      ? dealer.display_name.trim()
      : null;
    const tierEmoji = dealerTierEmoji(dealer.tier);
    const multiplier = (Number(dealer.price_multiplier_bps || 10_000) / 10_000).toFixed(2);
    const upkeepRate = Math.max(0, calculateDealerUpkeepChipsPerHour(dealer));
    const upkeepPercent = dealerUpkeepPercentForTier(dealer.tier);
    const statusIcon = dealer.status === 'ACTIVE'
      ? `${emoji('whiteCheck')} Active`
      : dealer.status === 'PAUSED'
        ? `${emoji('pauseButton')} Paused`
        : dealer.status;
    const headerParts = [`${tierName}`];
    if (contactName) headerParts.push(`“${contactName}”`);
    headerParts.push(`ID \`${shortDealerId(dealer.dealer_id)}\``);
    fields.push({
      name: `${tierEmoji} ${headerParts.join(' • ')}`,
      value: joinSections([
        `${statusIcon}`,
        `${emoji('alarmClock')} ${gramsFormatter.format(mgToGrams(dealer.hourly_sell_cap_mg))}g of Semuta/hr @ ${multiplier}×`,
        `${emoji('cashStack')} Upkeep: ${formatPercentDisplay(upkeepPercent)} (~${chipsFmt(Math.round(upkeepRate))}/hr)`,
        `${emoji('calendar')} Paid through: ${formatRelativeTs(dealer.upkeep_due_at)}`,
        `${emoji('semuta')} Lifetime sold: ${gramsFormatter.format(mgToGrams(dealer.lifetime_sold_mg))}g of Semuta · ${chipsFmt(dealerPayoutForMg(dealer.lifetime_sold_mg, dealer.price_multiplier_bps))}`,
        `${emoji('cashStack')} Pending payout: ${chipsFmt(Number(dealer.pending_chips || 0))}`,
        `${emoji('spark')} Last sale: ${dealer.last_sold_at ? formatRelativeTs(dealer.last_sold_at) : 'never'}`
      ])
    });
  }
  if (fields.length) {
    embed.addFields(...withSectionDividers(fields));
  }
  return embed;
}

function buildDealerUpkeepEmbed(dealers, chipsFmt) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`${emoji('alarmClock')} Dealer Upkeep`)
    .setThumbnail(`attachment://${DEALERS_IMAGE_NAME}`)
    .setFooter({ text: 'Enter the chips you want to spend when paying upkeep—more chips buys more time.' });
  if (!dealers.length) {
    embed.setDescription('No dealers to maintain yet. Hire someone first, then return here to keep their routes funded.');
    return embed;
  }
  const now = Math.floor(Date.now() / 1000);
  const fields = [];
  for (const dealer of dealers) {
    const tierName = dealer.tierInfo?.name || `Tier ${dealer.tier}`;
    const contactName = typeof dealer.display_name === 'string' && dealer.display_name.trim()
      ? dealer.display_name.trim()
      : null;
    const tierEmoji = dealerTierEmoji(dealer.tier);
    const dueAt = Number(dealer.upkeep_due_at || 0);
    const overdue = dueAt > 0 && dueAt <= now;
    const upkeepRate = Math.max(0, calculateDealerUpkeepChipsPerHour(dealer));
    const upkeepPercent = dealerUpkeepPercentForTier(dealer.tier);
    const headerParts = [`${tierName}`];
    if (contactName) headerParts.push(`“${contactName}”`);
    headerParts.push(`ID \`${shortDealerId(dealer.dealer_id)}\``);
    fields.push({
      name: `${tierEmoji} ${headerParts.join(' • ')}`,
      value: joinSections([
        `${emoji('briefcase')} Rate: ${formatPercentDisplay(upkeepPercent)} (~${chipsFmt(Math.round(upkeepRate))}/hr)`,
        `${emoji('alarmClock')} ${dueAt ? `Due ${formatRelativeTs(dueAt)}` : 'Upkeep timer not set'}`,
        overdue
          ? `${emoji('warning')} Payment overdue — press the button below to settle now.`
          : `${emoji('whiteCheck')} Route is paid up.`
      ])
    });
  }
  if (fields.length) {
    embed.addFields(...withSectionDividers(fields));
  }
  return embed;
}

function buildDealerNavComponents(activeView, extraRows = []) {
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CARTEL_DEALERS_LIST_VIEW_ID)
      .setLabel('List')
      .setStyle(activeView === 'list' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CARTEL_DEALERS_HIRE_VIEW_ID)
      .setLabel('Hire')
      .setStyle(activeView === 'hire' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CARTEL_DEALERS_UPKEEP_VIEW_ID)
      .setLabel('Upkeep')
      .setStyle(activeView === 'upkeep' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CARTEL_OVERVIEW_CUSTOM_ID)
      .setLabel('Overview')
      .setStyle(ButtonStyle.Secondary)
  );
  const rows = [navRow, ...(extraRows || [])];
  return rows.slice(0, 5);
}

function buildDealerCollectRows(totalPendingChips = 0, chipsFmt) {
  const formatted = Number(totalPendingChips || 0).toLocaleString('en-US');
  const label = totalPendingChips > 0 ? `Collect Chips (${formatted})` : 'Collect Chips';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CARTEL_DEALERS_COLLECT_ID)
      .setLabel(label)
      .setStyle(ButtonStyle.Success)
      .setDisabled(totalPendingChips <= 0)
  );
  return [row];
}

function buildDealerHireRows(playerRank, dealerCount = 0, dealerCap = null) {
  const rows = [];
  let currentRow = new ActionRowBuilder();
  const capReached = Number.isFinite(dealerCap) && dealerCount >= dealerCap;
  for (const tier of CARTEL_DEALER_TIERS) {
    const locked = Number(playerRank || 1) < Number(tier.requiredRank);
    const disabled = locked || capReached;
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${CARTEL_DEALERS_HIRE_TIER_PREFIX}${tier.id}`)
        .setLabel(`Tier ${tier.id}`)
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(disabled)
    );
  }
  if (currentRow.components.length) {
    rows.push(currentRow);
  }
  return rows.slice(0, 4);
}

function buildDealerUpkeepRows(dealers) {
  if (!dealers.length) return [];
  const rows = [];
  let currentRow = new ActionRowBuilder();
  for (const dealer of dealers) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      if (rows.length >= 4) break;
      currentRow = new ActionRowBuilder();
    }
    const dueAt = Number(dealer.upkeep_due_at || 0);
    const overdue = dueAt > 0 && dueAt <= Math.floor(Date.now() / 1000);
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${CARTEL_DEALERS_UPKEEP_PREFIX}${dealer.dealer_id}`)
        .setLabel(shortDealerId(dealer.dealer_id))
        .setStyle(overdue ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setEmoji(overdue ? emoji('warning') : emoji('banknotes'))
    );
  }
  if (currentRow.components.length && rows.length < 4) {
    rows.push(currentRow);
  }
  return rows;
}

function buildDealerFireRows(dealers) {
  if (!dealers.length) return [];
  const rows = [];
  let currentRow = new ActionRowBuilder();
  for (const dealer of dealers) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      if (rows.length >= 4) break;
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${CARTEL_DEALERS_FIRE_PREFIX}${dealer.dealer_id}`)
        .setLabel(shortDealerId(dealer.dealer_id))
        .setStyle(ButtonStyle.Danger)
        .setEmoji(emoji('fire'))
    );
  }
  if (currentRow.components.length && rows.length < 4) {
    rows.push(currentRow);
  }
  return rows;
}

function buildDealerFireAllRow(dealers) {
  if (!dealers.length) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CARTEL_DEALERS_FIRE_ALL_ID)
        .setLabel('Fire All Dealers')
        .setEmoji(emoji('fire'))
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildDealerViewPayload(view, { overview, dealers, chipsFmt, cachedNames }) {
  const investor = overview?.investor;
  const normalizedView = view === 'hire' || view === 'upkeep' ? view : 'list';
  const baseNames = cachedNames ? { ...cachedNames } : {};
  const dealerCount = Array.isArray(dealers) ? dealers.length : 0;
  const dealerCap = investor ? dealerCapForRank(investor.rank) : null;
  const pendingChipsTotal = Array.isArray(dealers) ? dealers.reduce((sum, dealer) => sum + Number(dealer?.pending_chips || 0), 0) : 0;
  const collectRows = buildDealerCollectRows(pendingChipsTotal, chipsFmt);
  const takenNames = collectDealerNameReservations(dealers);
  if (normalizedView === 'hire') {
    const { embed: prospectEmbed, names } = buildDealerProspectEmbed(investor, chipsFmt, {
      cachedNames: baseNames,
      dealerCount,
      dealerCap,
      takenNames
    });
    const extraRows = [
      ...collectRows,
      ...buildDealerHireRows(investor?.rank, dealerCount, dealerCap)
    ];
    return {
      payload: {
        embeds: [prospectEmbed],
        components: buildDealerNavComponents('hire', extraRows),
        files: [buildDealersImageAttachment()]
      },
      recruitNames: names
    };
  }
  if (normalizedView === 'upkeep') {
    const extraRows = [
      ...collectRows,
      ...buildDealerUpkeepRows(dealers)
    ];
    const namesToKeep = Object.keys(baseNames).length ? baseNames : null;
    return {
      payload: {
        embeds: [buildDealerUpkeepEmbed(dealers, chipsFmt)],
        components: buildDealerNavComponents('upkeep', extraRows),
        files: [buildDealersImageAttachment()]
      },
      recruitNames: namesToKeep
    };
  }
  const names = Object.keys(baseNames).length ? baseNames : null;
  const extraRows = [
    ...collectRows,
    ...buildDealerFireAllRow(dealers),
    ...buildDealerFireRows(dealers)
  ];
  return {
    payload: {
      embeds: [
        buildOwnedDealersEmbed(dealers, chipsFmt)
      ],
      components: buildDealerNavComponents('list', extraRows),
      files: [buildDealersImageAttachment()]
    },
    recruitNames: names
  };
}

async function renderDealerView(interaction, ctx, view = 'list', { targetMessage = null } = {}) {
  const chipsFmt = getChipsFormatter(ctx);
  const guildId = interaction.guild?.id;
  const userId = interaction.user?.id;
  const messageId = interaction.message?.id || targetMessage?.id || null;
  const cachedNames = messageId ? getDealerRecruitNames(messageId) : null;
  const [overview, dealers] = await Promise.all([
    getCartelOverview(guildId, userId),
    listUserDealers(guildId, userId)
  ]);
  const { payload, recruitNames } = buildDealerViewPayload(view, { overview, dealers, chipsFmt, cachedNames });
  let response = null;
  if (targetMessage && typeof targetMessage.edit === 'function') {
    response = await targetMessage.edit(payload).catch(err => {
      console.error('dealer view message edit failed', err);
      return null;
    });
  }
  if (!response) {
    response = await interaction.editReply(payload);
  }
  const nextMessageId = response?.id || messageId;
  if (nextMessageId) {
    const namesToStore = recruitNames ?? cachedNames ?? null;
    storeDealerRecruitNames(nextMessageId, namesToStore);
  }
  return response;
}

export default async function handleCartel(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
  } catch {}

  try {
    const payload = await buildOverviewPayload(interaction, ctx);
    await interaction.editReply(payload);
  } catch (error) {
    return handleCartelFailure(interaction, error);
  }
}

export async function handleCartelOverviewRefresh(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}

  try {
    const payload = await buildOverviewPayload(interaction, ctx);
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Cartel refresh button failed', error);
    const content = '⚠️ Failed to refresh the cartel overview. Please try again.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [], embeds: [] }).catch(() => {});
    } else {
      await interaction.reply(withAutoEphemeral(interaction, { content })).catch(() => {});
    }
  }
}

export async function handleCartelRankTable(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
    const highlightRank = overview?.investor?.rank ? Number(overview.investor.rank) : 1;
    const embed = buildRankTableEmbed(highlightRank).setThumbnail(`attachment://${SEMUTA_IMAGE_NAME}`);
    const components = buildOverviewComponents('rank');
    await interaction.editReply({ embeds: [embed], components, files: [buildSemutaImageAttachment()] });
  } catch (error) {
    console.error('Cartel rank table button failed', error);
    const content = '⚠️ Failed to show the rank table. Please try again.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [], embeds: [] }).catch(() => {});
    } else {
      await interaction.reply(withAutoEphemeral(interaction, { content })).catch(() => {});
    }
  }
}

export async function handleCartelGuide(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    const chipsFmt = getChipsFormatter(ctx);
    const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
    const payload = {
      embeds: [buildCartelGuideEmbed(overview, chipsFmt)],
      components: buildOverviewComponents('guide'),
      files: [buildSemutaImageAttachment()]
    };
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Cartel guide button failed', error);
    const content = '⚠️ Failed to load the cartel guide. Please try again.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [], embeds: [] }).catch(() => {});
    } else {
      await interaction.reply(withAutoEphemeral(interaction, { content })).catch(() => {});
    }
  }
}

export async function handleCartelSharesView(interaction, ctx, mode = 'splash', options = {}) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    const { payload, context } = await buildSharesPayload(interaction, ctx, mode, options);
    await interaction.editReply(payload);
    if (mode === 'posts') {
      await maybeNotifyOrderFills(interaction, ctx, context?.playerOrders || [], context?.expiredOrders || []);
    }
  } catch (error) {
    console.error('Cartel shares view button failed', error);
    const content = '⚠️ Failed to load the cartel shares view. Please try again.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [], embeds: [] }).catch(() => {});
    } else {
      await interaction.reply(withAutoEphemeral(interaction, { content })).catch(() => {});
    }
  }
}

export async function handleCartelDealersView(interaction, ctx, view = 'list') {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    await renderDealerView(interaction, ctx, view);
  } catch (error) {
    console.error('Cartel dealer view update failed', error);
    await interaction.followUp(withAutoEphemeral(interaction, { content: '⚠️ Failed to load dealers. Please try again.' })).catch(() => {});
  }
}

export async function handleCartelDealerHireTier(interaction, ctx, tierId) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    const tierNumber = Number(tierId);
    const messageId = interaction.message?.id || null;
    const cachedNames = messageId ? getDealerRecruitNames(messageId) : null;
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;
    const existingDealers = await listUserDealers(guildId, userId);
    const reservedNames = collectDealerNameReservations(existingDealers);
    let contactName = trimDealerName(cachedNames?.[tierNumber]);
    if (!contactName) {
      contactName = nextDealerBoardName(tierNumber, null, reservedNames);
      updateDealerRecruitName(messageId, tierNumber, contactName);
    }
    const dealer = await hireCartelDealer(
      guildId,
      userId,
      tierNumber,
      null,
      contactName
    );
    const updatedReservedNames = new Set(reservedNames);
    const hiredName = trimDealerName(dealer?.display_name);
    if (hiredName) {
      updatedReservedNames.add(hiredName);
    } else {
      updatedReservedNames.add(contactName);
    }
    const newBoardName = nextDealerBoardName(tierNumber, hiredName || contactName, updatedReservedNames);
    updateDealerRecruitName(messageId, tierNumber, newBoardName);
    await renderDealerView(interaction, ctx, 'hire');
    const tierName = dealer?.tierInfo?.name || `Tier ${dealer?.tier || '?'}`;
    const due = dealer?.upkeep_due_at ? formatRelativeTs(dealer.upkeep_due_at) : 'soon';
    const contactLabel = dealer?.display_name ? ` “${dealer.display_name}”` : '';
    await interaction.followUp(withAutoEphemeral(interaction, {
      content: `${emoji('briefcase')} Hired a **${tierName}**${contactLabel} (ID \`${shortDealerId(dealer.dealer_id)}\`). Next upkeep due ${due}.`
    })).catch(() => {});
    await logCartelActivity(
      interaction,
      `Hired ${tierName}${contactLabel} dealer (ID ${shortDealerId(dealer.dealer_id)}).`
    );
  } catch (error) {
    if (error instanceof CartelError) {
      await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
      return;
    }
    console.error('Cartel upkeep modal failed', error);
    await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong while paying upkeep. Please try again.' })).catch(() => {});
  }
}

export async function handleCartelDealerUpkeep(interaction, ctx, dealerId) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    const dealers = await listUserDealers(interaction.guild?.id, interaction.user.id);
    const dealer = dealers.find(d => d.dealer_id === dealerId);
    if (!dealer) {
      throw new CartelError('CARTEL_DEALER_NOT_FOUND', 'Dealer not found.');
    }
    const upkeepRate = Math.max(0, calculateDealerUpkeepChipsPerHour(dealer));
    const upkeepPercent = dealerUpkeepPercentForTier(dealer.tier);
    const modal = new ModalBuilder()
      .setCustomId(`${CARTEL_DEALERS_UPKEEP_MODAL_PREFIX}${dealerId}`)
      .setTitle('Buy Dealer Upkeep Time');
    const input = new TextInputBuilder()
      .setCustomId(CARTEL_DEALERS_UPKEEP_MODAL_INPUT_ID)
      .setLabel('Chips to spend on upkeep')
      .setRequired(true)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`~${Math.round(Math.max(1, upkeepRate))} chips buys 1h (${formatPercentDisplay(upkeepPercent)})`);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  } catch (error) {
    await notifyCartelButtonError(interaction, error);
  }
}

export async function handleCartelDealerFire(interaction, ctx, dealerId) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    const dealer = await fireCartelDealer(interaction.guild?.id, interaction.user.id, dealerId);
    await renderDealerView(interaction, ctx, 'list');
    const tierName = dealer?.tierInfo?.name || `Tier ${dealer?.tier || '?'}`;
    const contactLabel = dealer?.display_name ? ` “${dealer.display_name}”` : '';
    await interaction.followUp(withAutoEphemeral(interaction, {
      content: `${emoji('fire')} Fired **${tierName}**${contactLabel} (ID \`${shortDealerId(dealerId)}\`).`
    })).catch(() => {});
    await logCartelActivity(
      interaction,
      `Fired ${tierName}${contactLabel} dealer (ID ${shortDealerId(dealerId)}).`
    );
  } catch (error) {
    await notifyCartelButtonError(interaction, error);
  }
}

export async function handleCartelDealerFireAll(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    const result = await fireAllCartelDealers(interaction.guild?.id, interaction.user.id);
    await renderDealerView(interaction, ctx, 'list');
    await interaction.followUp(withAutoEphemeral(interaction, {
      content: `${emoji('fire')} Fired **${result.count}** dealer${result.count === 1 ? '' : 's'}.`
    })).catch(() => {});
    await logCartelActivity(
      interaction,
      `Fired all dealers (${result.count}).`
    );
  } catch (error) {
    await notifyCartelButtonError(interaction, error);
  }
}

export async function handleCartelDealerCollect(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch {}
  try {
    const result = await collectDealerChips(interaction.guild?.id, interaction.user.id);
    const chipsFmt = getChipsFormatter(ctx);
    const parts = [
      `${emoji('cashStack')} Collected **${chipsFmt(result.totalChips)}** from **${result.dealersCollected}** dealer${result.dealersCollected === 1 ? '' : 's'}.`
    ];
    if (result.totalGrams > 0) {
      parts.push(`Sold ${gramsFormatter.format(result.totalGrams)}g of Semuta.`);
    }
    if (result.xpGain > 0) {
      parts.push(`Gained ${result.xpGain.toLocaleString('en-US')} XP.`);
    }
    const message = parts.join(' ');
    await interaction.editReply({ content: message });
    await logCartelActivity(
      interaction,
      `Collected ${chipsFmt(result.totalChips)} from ${result.dealersCollected} dealers (XP +${(result.xpGain || 0).toLocaleString('en-US')}).`
    );
    await renderDealerView(interaction, ctx, 'list', { targetMessage: interaction.message });
  } catch (error) {
    if (error instanceof CartelError) {
      await interaction.editReply({ content: `⚠️ ${error.message || 'Action failed.'}` }).catch(() => {});
      return;
    }
    console.error('Cartel dealer collect failed', error);
    await interaction.editReply({ content: '⚠️ Failed to collect dealer chips. Please try again.' }).catch(() => {});
  }
}

export async function handleCartelDealerUpkeepModal(interaction, ctx, dealerId) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    const chipsFmt = getChipsFormatter(ctx);
    const value = interaction.fields.getTextInputValue(CARTEL_DEALERS_UPKEEP_MODAL_INPUT_ID);
    const chips = Math.floor(Number(value.replace(/[,\s]/g, '')));
    const result = await payCartelDealerUpkeep(interaction.guild?.id, interaction.user.id, dealerId, chips);
    const tierName = result?.tierInfo?.name || `Tier ${result?.tier || '?'}`;
    const contactLabel = result?.display_name ? ` “${result.display_name}”` : '';
    const seconds = Number(result?.secondsPurchased || 0);
    const due = result?.upkeep_due_at ? formatRelativeTs(result.upkeep_due_at) : 'soon';
    const duration = seconds > 0 ? formatDuration(seconds) : null;
    if (interaction.message) {
      try {
        await renderDealerView(interaction, ctx, 'upkeep', { targetMessage: interaction.message });
      } catch (refreshErr) {
        console.error('Failed to refresh dealer view after upkeep modal', refreshErr);
      }
    }
    await interaction.reply(withAutoEphemeral(interaction, {
      content: `${emoji('moneyBag')} Paid **${chipsFmt(result.chipsSpent || chips)}** to fund **${tierName}**${contactLabel} for ${duration || 'more time'}. Next payment due ${due}.`
    }));
    await logCartelActivity(
      interaction,
      `Bought ${duration || 'upkeep'} for dealer ${shortDealerId(dealerId)} (${tierName}${contactLabel}) with ${chipsFmt(result.chipsSpent || chips)}.`
    );
    return;
  } catch (error) {
    if (error instanceof CartelError) {
      await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
      return;
    }
    console.error('Cartel upkeep modal failed', error);
    await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong while paying upkeep. Please try again.' })).catch(() => {});
  }
}

export async function handleCartelShareOrderPrompt(interaction, ctx, side) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  const normalizedSide = String(side || 'SELL').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  const messageId = interaction.message?.id || '0';
  const panelView = detectCartelPanelView(interaction.message);
  const modal = new ModalBuilder()
    .setCustomId(`${CARTEL_SHARE_ORDER_MODAL_ID}|${normalizedSide}|${messageId}|${panelView}`)
    .setTitle(normalizedSide === 'BUY' ? 'Post Buy Order' : 'Post Sell Order');
  const sharesInput = new TextInputBuilder()
    .setCustomId(CARTEL_SHARE_ORDER_MODAL_SHARES_INPUT)
    .setLabel('Shares')
    .setPlaceholder('Enter shares (e.g. 100)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const priceInput = new TextInputBuilder()
    .setCustomId(CARTEL_SHARE_ORDER_MODAL_PRICE_INPUT)
    .setLabel('Price per share (chips)')
    .setPlaceholder(normalizedSide === 'BUY' ? 'How much will you pay per share?' : 'What price per share?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(sharesInput),
    new ActionRowBuilder().addComponents(priceInput)
  );
  await interaction.showModal(modal);
}

export async function handleCartelShareOrderModal(interaction, ctx, side, messageId, viewToken = 'shares') {
  const allowed = await ensureCartelAccess(interaction, ctx, { sourceMessageId: messageId });
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  const normalizedSide = String(side || 'SELL').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  const chipsFmt = getChipsFormatter(ctx);
  try {
    const sharesRaw = (interaction.fields.getTextInputValue(CARTEL_SHARE_ORDER_MODAL_SHARES_INPUT) || '').trim();
    const priceRaw = (interaction.fields.getTextInputValue(CARTEL_SHARE_ORDER_MODAL_PRICE_INPUT) || '').trim();
    if (!sharesRaw) {
      throw new CartelError('CARTEL_MARKET_SHARES_REQUIRED', 'Enter how many shares this order covers.');
    }
    if (!priceRaw) {
      throw new CartelError('CARTEL_MARKET_PRICE_REQUIRED', 'Enter the price per share in chips.');
    }
    const shares = Math.floor(Number(sharesRaw.replace(/[,\s]/g, '')));
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new CartelError('CARTEL_MARKET_SHARES_REQUIRED', 'Enter at least 1 share.');
    }
    const price = Math.floor(Number(priceRaw.replace(/[,\s]/g, '')));
    if (!Number.isFinite(price) || price <= 0) {
      throw new CartelError('CARTEL_MARKET_PRICE_REQUIRED', 'Enter a positive chip price per share.');
    }
    await interaction.deferReply({ ephemeral: true });
    const result = await createShareMarketOrder(interaction.guild?.id, interaction.user.id, normalizedSide, shares, price);
    seedSnapshotWithOrder(interaction.guild?.id, interaction.user.id, result);
    const shareMode = extractShareMarketMode(viewToken) || (viewToken === 'shares' ? 'splash' : null);
    const viewData = shareMode
      ? await buildSharesPayload(interaction, ctx, shareMode, shareMode === 'posts' ? { selectedOrderId: result.order_id } : {})
      : null;
    const payload = viewData ? viewData.payload : await buildOverviewPayload(interaction, ctx);
    const sharesLabel = shares.toLocaleString('en-US');
    const actionVerb = normalizedSide === 'BUY' ? 'buy' : 'sell';
    const confirmation = `${emoji('clipboard')} Posted an order to **${actionVerb} ${sharesLabel}** shares at **${chipsFmt(price)}** per share.`;
    await interaction.editReply({ content: confirmation });
    if (messageId && messageId !== '0') {
      const targetMessage = await fetchMessageById(interaction, messageId);
      if (targetMessage) {
        await applyOverviewToMessage(targetMessage, payload);
      }
    }
    await logCartelActivity(
      interaction,
      `Posted ${normalizedSide} order for ${sharesLabel} shares @ ${chipsFmt(price)} per share.`
    );
    if (shareMode === 'posts') {
      await maybeNotifyOrderFills(interaction, ctx, viewData?.context?.playerOrders || [], viewData?.context?.expiredOrders || []);
    }
  } catch (error) {
    if (interaction.deferred || interaction.replied) {
      const content = error instanceof CartelError
        ? `⚠️ ${error.message || 'Action failed.'}`
        : '⚠️ Something went wrong while posting that order. Please try again.';
      await interaction.editReply({ content }).catch(() => {});
    } else if (error instanceof CartelError) {
      await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
    } else {
      console.error('Cartel share order modal failed', error);
      await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong while posting that order. Please try again.' })).catch(() => {});
    }
  }
}

export async function handleCartelShareOrderSelect(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  const selectedOrderId = Array.isArray(interaction.values) ? interaction.values[0] : null;
  try {
    await interaction.deferUpdate();
  } catch {}
  try {
    const { payload, context } = await buildSharesPayload(interaction, ctx, 'posts', { selectedOrderId });
    await interaction.editReply(payload);
    await maybeNotifyOrderFills(interaction, ctx, context?.playerOrders || [], context?.expiredOrders || []);
  } catch (error) {
    console.error('Cartel share order select failed', error);
    await interaction.followUp(withAutoEphemeral(interaction, { content: '⚠️ Failed to update that selection. Please try again.' })).catch(() => {});
  }
}

export async function handleCartelShareOrderCancel(interaction, ctx, orderId) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  if (!orderId || orderId === '0') {
    await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Select one of your orders first.' })).catch(() => {});
    return;
  }
  const chipsFmt = getChipsFormatter(ctx);
  try {
    const guildId = interaction.guild?.id;
    const userId = interaction.user?.id;
    removeOrderFromSnapshot(guildId, userId, orderId);
    await interaction.deferUpdate();
  } catch {}
  try {
    const cancelled = await cancelShareMarketOrder(interaction.guild?.id, interaction.user.id, orderId);
    const { payload, context } = await buildSharesPayload(interaction, ctx, 'posts');
    await interaction.editReply(payload);
    const sideLabel = String(cancelled?.side).toUpperCase() === 'BUY' ? 'buy' : 'sell';
    const sharesLabel = Number(cancelled?.shares || 0).toLocaleString('en-US');
    const priceLabel = chipsFmt(Math.max(1, Number(cancelled?.price_per_share || 0)));
    await interaction.followUp(withAutoEphemeral(interaction, {
      content: `${emoji('clipboard')} Cancelled your ${sideLabel} order for **${sharesLabel}** shares at **${priceLabel}** per share.`
    })).catch(() => {});
    await logCartelActivity(
      interaction,
      `Cancelled ${sideLabel} order for ${sharesLabel} shares @ ${priceLabel} per share.`
    );
    await maybeNotifyOrderFills(interaction, ctx, context?.playerOrders || [], context?.expiredOrders || []);
  } catch (error) {
    if (error instanceof CartelError) {
      await interaction.followUp(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
    } else {
      console.error('Cartel share order cancel failed', error);
      await interaction.followUp(withAutoEphemeral(interaction, { content: '⚠️ Failed to cancel that order. Please try again.' })).catch(() => {});
    }
  }
}

export async function handleCartelMarketSelect(interaction, ctx, mode, page) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  const selectedOrderId = Array.isArray(interaction.values) ? interaction.values[0] : null;
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  try {
    await interaction.deferUpdate();
  } catch {}
  try {
    const { payload } = await buildSharesPayload(interaction, ctx, mode, { page: normalizedPage, selectedOrderId });
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Cartel market select failed', error);
    await interaction.followUp(withAutoEphemeral(interaction, { content: '⚠️ Failed to update that selection. Please try again.' })).catch(() => {});
  }
}

export async function handleCartelMarketConfirm(interaction, ctx, mode, orderId, page) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  if (!orderId || orderId === '0') {
    await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Select an order first.' })).catch(() => {});
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`${mode === 'buy' ? CARTEL_MARKET_BUY_MODAL_ID : CARTEL_MARKET_SELL_MODAL_ID}|${orderId}|${page || 1}`)
    .setTitle(mode === 'buy' ? 'Confirm Market Buy' : 'Confirm Market Sell');
  const input = new TextInputBuilder()
    .setCustomId(CARTEL_MARKET_MODAL_AMOUNT_INPUT_ID)
    .setLabel('Shares to trade')
    .setPlaceholder('Enter number of shares')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleCartelMarketModal(interaction, ctx, mode, orderId, page) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const shareAllowed = await ensureShareMarketAccess(interaction, ctx);
  if (!shareAllowed) return;
  const chipsFmt = getChipsFormatter(ctx);
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  try {
    const rawValue = (interaction.fields.getTextInputValue(CARTEL_MARKET_MODAL_AMOUNT_INPUT_ID) || '').trim();
    const shares = Math.floor(Number(rawValue.replace(/[,\s]/g, '')));
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new CartelError('CARTEL_MARKET_AMOUNT_REQUIRED', 'Enter at least 1 share.');
    }
    await interaction.deferReply({ ephemeral: true });
    const result = mode === 'buy'
      ? await executeMarketBuy(interaction.guild?.id, interaction.user.id, orderId, shares)
      : await executeMarketSell(interaction.guild?.id, interaction.user.id, orderId, shares);
    const { payload } = await buildSharesPayload(interaction, ctx, mode, { page: normalizedPage });
    const message = mode === 'buy'
      ? `${emoji('cashStack')} Bought **${result.sharesFilled.toLocaleString('en-US')}** shares @ **${chipsFmt(result.pricePerShare)}** (${chipsFmt(result.chips)} total).`
      : `${emoji('cashStack')} Sold **${result.sharesFilled.toLocaleString('en-US')}** shares @ **${chipsFmt(result.pricePerShare)}** (${chipsFmt(result.chips)} received).`;
    await interaction.editReply({ content: message });
    await logCartelActivity(
      interaction,
      `${mode === 'buy' ? 'Bought' : 'Sold'} ${result.sharesFilled.toLocaleString('en-US')} shares @ ${chipsFmt(result.pricePerShare)} via market order.`
    );
  } catch (error) {
    if (error instanceof CartelError) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `⚠️ ${error.message || 'Action failed.'}` }).catch(() => {});
      } else {
        await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
      }
      return;
    }
    console.error('Cartel market modal failed', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '⚠️ Failed to process that market order. Please try again.' }).catch(() => {});
    } else {
      await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Failed to process that market order. Please try again.' })).catch(() => {});
    }
  }
}

export async function handleCartelSellPrompt(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const messageId = interaction.message?.id || '0';
  const modal = new ModalBuilder()
    .setCustomId(`${CARTEL_SELL_MODAL_ID}|${messageId}`)
    .setTitle('Sell Semuta');
  const input = new TextInputBuilder()
    .setCustomId(CARTEL_SELL_MODAL_INPUT_ID)
    .setLabel('Grams of Semuta to sell')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter grams of Semuta (e.g. 25) or type ALL')
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleCartelSellModal(interaction, ctx, messageId) {
  const allowed = await ensureCartelAccess(interaction, ctx, { sourceMessageId: messageId });
  if (!allowed) return;
  const chipsFmt = getChipsFormatter(ctx);
  let cachedOverview = null;
  const guildId = interaction.guild?.id;
  let mgToSell = 0;
  let reservationCompleted = false;
  let miniGameStarted = false;
  try {
    const rawValue = (interaction.fields.getTextInputValue(CARTEL_SELL_MODAL_INPUT_ID) || '').trim();
    if (!rawValue) {
      throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter grams of Semuta to sell or type ALL.');
    }
    let grams;
    if (rawValue.toLowerCase() === 'all') {
      cachedOverview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
      grams = Math.floor(Number(cachedOverview?.metrics?.stashGrams || 0));
      if (grams <= 0) {
        throw new CartelError('CARTEL_NOT_ENOUGH_STASH', 'You have no Semuta in your stash to sell.');
      }
    } else {
      grams = Number(rawValue.replace(/[\,\s]/g, ''));
      if (!Number.isFinite(grams) || grams <= 0) {
        throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter at least 1 gram of Semuta to sell.');
      }
    }
    const playerOverview = cachedOverview || await getCartelOverview(guildId, interaction.user.id);
    const stashMg = Number(playerOverview?.investor?.stash_mg || 0);
    mgToSell = gramsToMg(grams);
    if (stashMg < mgToSell) {
      throw new CartelError('CARTEL_NOT_ENOUGH_STASH', 'You do not have that much Semuta in your stash.');
    }
    await cartelReserveStashForSale(guildId, interaction.user.id, mgToSell);
    reservationCompleted = true;
    await interaction.deferReply({ ephemeral: true });
    await startSellMiniGame(interaction, ctx, {
      guildId,
      userId: interaction.user.id,
      sourceMessageId: messageId,
      mgToSell,
      gramsRequested: grams,
      chipsFmt
    });
    miniGameStarted = true;
  } catch (error) {
    if (reservationCompleted && !miniGameStarted && mgToSell > 0) {
      await cartelRefundStashForSale(guildId, interaction.user.id, mgToSell).catch(() => {});
    }
    if (interaction.deferred || interaction.replied) {
      const content = error instanceof CartelError
        ? `⚠️ ${error.message || 'Action failed.'}`
        : '⚠️ Something went wrong while selling. Please try again.';
      await interaction.editReply({ content }).catch(() => {});
    } else if (error instanceof CartelError) {
      await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
    } else {
      console.error('Cartel sell modal failed', error);
      await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong while selling. Please try again.' })).catch(() => {});
    }
  }
}

export async function handleCartelCollectPrompt(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const messageId = interaction.message?.id || '0';
  const modal = new ModalBuilder()
    .setCustomId(`${CARTEL_COLLECT_MODAL_ID}|${messageId}`)
    .setTitle('Collect Semuta');
  const input = new TextInputBuilder()
    .setCustomId(CARTEL_COLLECT_MODAL_INPUT_ID)
    .setLabel('Grams of Semuta to collect')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter grams of Semuta (e.g. 50) or type ALL')
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleCartelCollectModal(interaction, ctx, messageId) {
  const allowed = await ensureCartelAccess(interaction, ctx, { sourceMessageId: messageId });
  if (!allowed) return;
  const chipsFmt = getChipsFormatter(ctx);
  try {
    const rawValue = (interaction.fields.getTextInputValue(CARTEL_COLLECT_MODAL_INPUT_ID) || '').trim();
    if (!rawValue) {
      throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter grams of Semuta to collect or type ALL.');
    }
    let grams;
    if (rawValue.toLowerCase() === 'all') {
      const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
      grams = Math.floor(Number(overview?.metrics?.warehouseGrams || 0));
      if (grams <= 0) {
        throw new CartelError('CARTEL_NOT_ENOUGH_WAREHOUSE', 'You do not have any Semuta in the warehouse to collect.');
      }
    } else {
      grams = Number(rawValue.replace(/[\,\s]/g, ''));
      if (!Number.isFinite(grams) || grams <= 0) {
        throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter at least 1 gram of Semuta to collect.');
      }
    }
    await interaction.deferReply();
    const result = await cartelCollect(interaction.guild?.id, interaction.user.id, grams);
    const overflowLine = result.overflowReturnedGrams > 0
      ? ` Overflow ${gramsFormatter.format(result.overflowReturnedGrams)}g of Semuta returned to warehouse.`
      : '';
    await interaction.editReply({
      content: `${emoji('package')} Collected **${gramsFormatter.format(result.collectedGrams)}g** of Semuta (fee **${chipsFmt(result.fee)}**).${overflowLine}`
    });
    if (messageId && messageId !== '0') {
      const targetMessage = await fetchMessageById(interaction, messageId);
      if (targetMessage) {
        const overviewPayload = await buildOverviewPayload(interaction, ctx);
        await applyOverviewToMessage(targetMessage, overviewPayload);
      }
    }
    await logCartelActivity(
      interaction,
      `Collected ${gramsFormatter.format(result.collectedGrams)}g of Semuta from warehouse (fee ${chipsFmt(result.fee)}).${overflowLine}`
    );
  } catch (error) {
    if (interaction.deferred || interaction.replied) {
      const content = error instanceof CartelError
        ? `⚠️ ${error.message || 'Action failed.'}`
        : '⚠️ Something went wrong while collecting. Please try again.';
      await interaction.editReply({ content }).catch(() => {});
    } else if (error instanceof CartelError) {
      await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
    } else {
      console.error('Cartel collect modal failed', error);
      await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong while collecting. Please try again.' })).catch(() => {});
    }
  }
}

function buildSellMiniGameComponents(session, disabled = false) {
  const left = new ButtonBuilder()
    .setCustomId(`${SELL_MINIGAME_MOVE_LEFT_ID}|${session.sessionId}`)
    .setEmoji('⬅️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  const right = new ButtonBuilder()
    .setCustomId(`${SELL_MINIGAME_MOVE_RIGHT_ID}|${session.sessionId}`)
    .setEmoji('➡️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  return [new ActionRowBuilder().addComponents(left, right)];
}

function renderSellMiniGameBoard(session) {
  const rows = Array.from({ length: SELL_MINIGAME_ROWS }, () => Array(SELL_MINIGAME_LANES).fill(SELL_MINIGAME_EMPTY_EMOJI));
  for (const obstacle of session.obstacles) {
    if (obstacle.row >= 0 && obstacle.row < SELL_MINIGAME_ROWS) {
      const emojiChar = obstacle.type === 'POLICE' ? SELL_MINIGAME_POLICE_EMOJI : SELL_MINIGAME_POTHOLE_EMOJI;
      rows[obstacle.row][obstacle.lane] = emojiChar;
    }
  }
  rows[SELL_MINIGAME_ROWS - 1][session.playerLane] = SELL_MINIGAME_PLAYER_EMOJI;
  return rows.map(row => row.join(' ')).join('\n');
}

function buildSellMiniGameEmbed(session, { gameOver = false, resultTitle = null, resultDescription = null } = {}) {
  const gramsReady = gramsFormatter.format(mgToGrams(Math.max(0, session.mgRemaining)));
  const board = renderSellMiniGameBoard(session);
  const boardDisplay = board.replace(/ {2,}/g, spaces => spaces.split('').join('\u200B'));
  const description = gameOver
    ? (resultDescription || session.lastEvent || 'Route closed.')
    : `${SELL_MINIGAME_PLAYER_EMOJI} Use the buttons below to dodge ${SELL_MINIGAME_POLICE_EMOJI}/${SELL_MINIGAME_POTHOLE_EMOJI} for ${SELL_MINIGAME_TICKS} ticks.`;
  const embed = new EmbedBuilder()
    .setColor(gameOver ? 0x1abc9c : 0xf39c12)
    .setTitle(resultTitle || `${emoji('semuta_cartel')} Sell Run`)
    .setDescription(description)
    .addFields(
      {
        name: 'Route',
        value: boardDisplay
      },
      {
        name: 'Status',
        value: joinSections([
          `Tick: **${session.tick}/${session.totalTicks}**`,
          `${emoji('semuta')} Semuta ready: **${gramsReady}g**`,
          `${emoji('warning')} Pothole hits: **${session.halvedHits}**`
        ])
      },
      {
        name: 'Legend',
        value: `${SELL_MINIGAME_PLAYER_EMOJI} You · ${SELL_MINIGAME_POLICE_EMOJI} Police (lose all) · ${SELL_MINIGAME_POTHOLE_EMOJI} Pothole (halve stash)`
      }
    );
  if (session.lastEvent && !gameOver) {
    embed.addFields({ name: 'Last Event', value: session.lastEvent });
  }
  return embed;
}

async function startSellMiniGame(interaction, ctx, { guildId, userId, sourceMessageId, mgToSell, gramsRequested, chipsFmt }) {
  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    interaction,
    ctx,
    guildId,
    userId,
    sourceMessageId,
    mgInitial: mgToSell,
    mgRemaining: mgToSell,
    gramsRequested,
    playerLane: 1,
    obstacles: [],
    tick: 0,
    totalTicks: SELL_MINIGAME_TICKS,
    busted: false,
    halvedHits: 0,
    lastEvent: null,
    timer: null,
    chipsFmt,
    ended: false,
    lastObstacleSpawnTick: null,
    reservationActive: true
  };
  SELL_MINIGAME_SESSIONS.set(sessionId, session);
  try {
    await interaction.editReply({
      content: null,
      embeds: [buildSellMiniGameEmbed(session)],
      components: buildSellMiniGameComponents(session)
    });
    const replyMessage = await interaction.fetchReply().catch(() => null);
    session.messageId = replyMessage?.id || null;
    scheduleSellMiniGameTick(session);
  } catch (err) {
    SELL_MINIGAME_SESSIONS.delete(sessionId);
    throw err;
  }
}

function scheduleSellMiniGameTick(session) {
  if (session.timer) {
    clearInterval(session.timer);
  }
  session.timer = setInterval(() => {
    advanceSellMiniGameTick(session).catch(err => {
      console.error('Sell mini-game tick failed', err);
      finishSellMiniGame(session, { outcome: 'error', error: err }).catch(() => {});
    });
  }, SELL_MINIGAME_INTERVAL_MS);
  if (typeof session.timer.unref === 'function') {
    session.timer.unref();
  }
}

async function advanceSellMiniGameTick(session) {
  if (session.ended) return;
  if (session.isTickProcessing) return;
  session.isTickProcessing = true;
  try {
    session.tick += 1;
    for (const obstacle of session.obstacles) {
      obstacle.row += 1;
    }
    const collisions = session.obstacles.filter(obstacle => obstacle.row >= SELL_MINIGAME_ROWS - 1 && obstacle.lane === session.playerLane);
    for (const obstacle of collisions) {
      const result = handleSellMiniGameCollision(session, obstacle);
      if (result === 'police') {
        await finishSellMiniGame(session, { outcome: 'police' });
        return;
      }
      if (result === 'empty') {
        await finishSellMiniGame(session, { outcome: 'empty' });
        return;
      }
    }
    session.obstacles = session.obstacles.filter(obstacle => obstacle.row < SELL_MINIGAME_ROWS - 1 || obstacle.lane !== session.playerLane);
    session.obstacles = session.obstacles.filter(obstacle => obstacle.row < SELL_MINIGAME_ROWS);
    if (session.tick > 1 && shouldSpawnSellMiniGameObstacles(session)) {
      spawnSellMiniGameObstacles(session);
      session.lastObstacleSpawnTick = session.tick;
    }
    await updateSellMiniGameMessage(session);
    if (session.tick >= session.totalTicks) {
      await finishSellMiniGame(session, { outcome: 'success' });
    }
  } finally {
    session.isTickProcessing = false;
  }
}

function spawnSellMiniGameObstacles(session) {
  const availableLanes = [0, 1, 2];
  shuffleArray(availableLanes);
  const spawnCount = Math.floor(Math.random() * 2) + 1;
  const lanesToUse = availableLanes.slice(0, Math.min(spawnCount, availableLanes.length - 1));
  if (!lanesToUse.includes(session.playerLane) && lanesToUse.length < availableLanes.length - 1) {
    lanesToUse.push(availableLanes.find(lane => lane !== session.playerLane && !lanesToUse.includes(lane)));
  }
  const finalLanes = new Set(lanesToUse.slice(0, Math.min(2, lanesToUse.length)));
  for (const lane of finalLanes) {
    const type = Math.random() < 0.35 ? 'POLICE' : 'POTHOLE';
    session.obstacles.push({ lane, row: 0, type });
  }
}

function shouldSpawnSellMiniGameObstacles(session) {
  if (session.lastObstacleSpawnTick == null) return true;
  return (session.tick - session.lastObstacleSpawnTick) >= 3;
}

function handleSellMiniGameCollision(session, obstacle) {
  if (obstacle.type === 'POLICE') {
    session.busted = true;
    session.lastEvent = `${SELL_MINIGAME_POLICE_EMOJI} ${emoji('policeLight')} The law caught you!`;
    return 'police';
  }
  session.mgRemaining = Math.max(0, Math.floor(session.mgRemaining / 2));
  session.halvedHits += 1;
  session.lastEvent = `${SELL_MINIGAME_POTHOLE_EMOJI} Hit a pothole! Shipment halved.`;
  if (session.mgRemaining <= 0) {
    return 'empty';
  }
  return 'pothole';
}

async function updateSellMiniGameMessage(session, { gameOver = false, resultTitle = null, resultDescription = null, disableControls = false } = {}) {
  if (!session.interaction) return;
  try {
    await session.interaction.editReply({
      embeds: [buildSellMiniGameEmbed(session, { gameOver, resultTitle, resultDescription })],
      components: buildSellMiniGameComponents(session, disableControls)
    });
  } catch (err) {
    console.error('Failed to update sell mini-game message', err);
  }
}

function forfeitSellMiniGameShipment(session) {
  if (!session) return;
  session.reservationActive = false;
  session.mgRemaining = 0;
}

async function refundSellMiniGameShipment(session, amountMg) {
  if (!session) return;
  const mgSource = amountMg ?? session.mgRemaining ?? 0;
  const mgToRefund = Math.max(0, Math.floor(Number(mgSource)));
  if (mgToRefund <= 0) {
    session.reservationActive = false;
    session.mgRemaining = 0;
    return;
  }
  try {
    await cartelRefundStashForSale(session.guildId, session.userId, mgToRefund);
  } catch (err) {
    console.error('Failed to refund sell mini-game stash', err);
  } finally {
    session.reservationActive = false;
    session.mgRemaining = Math.max(0, session.mgRemaining - mgToRefund);
  }
}

async function finishSellMiniGame(session, { outcome, error = null }) {
  if (session.ended) return;
  session.ended = true;
  if (session.timer) {
    clearInterval(session.timer);
    session.timer = null;
  }
  SELL_MINIGAME_SESSIONS.delete(session.sessionId);
  if (outcome === 'police') {
    forfeitSellMiniGameShipment(session);
    await updateSellMiniGameMessage(session, {
      gameOver: true,
      resultTitle: `${SELL_MINIGAME_POLICE_EMOJI} Busted!`,
      resultDescription: 'The police seized your shipment. No sale completed.',
      disableControls: true
    });
    return;
  }
  if (outcome === 'empty') {
    forfeitSellMiniGameShipment(session);
    await updateSellMiniGameMessage(session, {
      gameOver: true,
      resultTitle: `${SELL_MINIGAME_POTHOLE_EMOJI} Shipment Ruined`,
      resultDescription: 'Repeated potholes destroyed your Semuta. Nothing left to sell.',
      disableControls: true
    });
    return;
  }
  if (outcome === 'error') {
    await refundSellMiniGameShipment(session);
    await updateSellMiniGameMessage(session, {
      gameOver: true,
      resultTitle: `${emoji('warning')} Sell Run Failed`,
      resultDescription: 'Something went wrong during the sell mini-game. Please try again soon.',
      disableControls: true
    });
    return;
  }
  const gramsToSell = mgToGrams(session.mgRemaining);
  if (gramsToSell <= 0) {
    forfeitSellMiniGameShipment(session);
    await updateSellMiniGameMessage(session, {
      gameOver: true,
      resultTitle: `${emoji('warning')} No Semuta Sold`,
      resultDescription: 'There was no Semuta remaining to sell.',
      disableControls: true
    });
    return;
  }
  try {
    const result = await cartelPayoutReservedSale(session.guildId, session.userId, session.mgRemaining);
    forfeitSellMiniGameShipment(session);
    const content = `${emoji('moneyBag')} Sold **${gramsFormatter.format(result.gramsSold)}g** of Semuta for **${session.chipsFmt(result.payout)}** after surviving the route.`;
    await session.interaction.editReply({
      content,
      embeds: [buildSellMiniGameEmbed(session, {
        gameOver: true,
        resultTitle: `${emoji('whiteCheck')} Delivery Complete`,
        resultDescription: 'Nice driving—the shipment made it through!'
      })],
      components: buildSellMiniGameComponents(session, true)
    });
    await logCartelActivity(
      session.interaction,
      `Sold ${gramsFormatter.format(result.gramsSold)}g of Semuta for ${session.chipsFmt(result.payout)} after the mini-game.`
    );
    if (session.sourceMessageId && session.sourceMessageId !== '0') {
      const targetMessage = await fetchMessageById(session.interaction, session.sourceMessageId);
      if (targetMessage) {
        const overviewPayload = await buildOverviewPayload(session.interaction, session.ctx);
        await applyOverviewToMessage(targetMessage, overviewPayload);
      }
    }
  } catch (err) {
    await refundSellMiniGameShipment(session);
    const content = err instanceof CartelError
      ? `⚠️ ${err.message || 'Action failed after the mini-game.'}`
      : '⚠️ Something went wrong while finalizing the sale.';
    console.error('Sell mini-game finalize failed', err);
    await session.interaction.editReply({
      content,
      embeds: [buildSellMiniGameEmbed(session, {
        gameOver: true,
        resultTitle: `${emoji('warning')} Sale Failed`,
        resultDescription: 'The run ended, but the sale could not be completed.'
      })],
      components: buildSellMiniGameComponents(session, true)
    });
  }
}

export async function handleCartelSellMiniGameMove(interaction, ctx, direction, sessionId) {
  const session = SELL_MINIGAME_SESSIONS.get(sessionId);
  if (!session) {
    await interaction.reply({ content: 'That sell run has already ended.', ephemeral: true }).catch(() => {});
    return;
  }
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  if (session.ended) {
    await interaction.reply({ content: 'This sell run is over.', ephemeral: true }).catch(() => {});
    return;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  if (direction === 'left') {
    session.playerLane = Math.max(0, session.playerLane - 1);
  } else if (direction === 'right') {
    session.playerLane = Math.min(SELL_MINIGAME_LANES - 1, session.playerLane + 1);
  }
  await updateSellMiniGameMessage(session);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

import crypto from 'node:crypto';
import { EmbedBuilder } from 'discord.js';
import { emoji } from '../lib/emojis.mjs';
import { chipsAmount } from '../games/format.mjs';
import {
  getCartelPool,
  listCartelInvestors,
  getCartelInvestor,
  cartelAddShares,
  cartelRemoveShares,
  cartelSetHoldings,
  cartelSetRankAndXp,
  cartelAdjustSaleMultiplier,
  cartelApplyProduction,
  cartelUpdatePoolTick,
  recordCartelTransaction,
  cartelCreateDealer,
  listCartelDealers,
  listCartelDealersForUser,
  getCartelDealer,
  cartelSetDealerStatus,
  cartelSetDealerUpkeep,
  cartelRecordDealerSale,
  cartelDeleteDealer,
  cartelDeleteDealersForUser,
  takeFromUserToHouse,
  transferFromHouseToUser,
  setCartelSharePrice as setCartelSharePriceDb,
  cartelResetInvestor,
  setCartelShareRate as setCartelShareRateDb,
  setCartelXpPerGram as setCartelXpPerGramDb,
  cartelAddDealerPending,
  cartelClearDealerPending,
  listCartelGuildIds,
  createCartelMarketOrder as createCartelMarketOrderDb,
  listCartelMarketOrders as listCartelMarketOrdersDb,
  listCartelMarketOrdersForUser as listCartelMarketOrdersForUserDb,
  getCartelMarketOrder as getCartelMarketOrderDb,
  setCartelMarketOrderStatus as setCartelMarketOrderStatusDb,
  setCartelMarketOrderShares as setCartelMarketOrderSharesDb,
  getCartelOrderSnapshot as getCartelOrderSnapshotDb,
  setCartelOrderSnapshot as setCartelOrderSnapshotDb,
  deleteCartelOrderSnapshot as deleteCartelOrderSnapshotDb
} from '../db/db.auto.mjs';
import {
  MG_PER_GRAM,
  CARTEL_DEFAULT_SHARE_PRICE,
  CARTEL_DEFAULT_SHARE_RATE_GRAMS_PER_HOUR,
  CARTEL_BASE_PRICE_PER_GRAM,
  CARTEL_WAREHOUSE_FEE_BPS,
  CARTEL_MIN_TICK_SECONDS,
  CARTEL_TICK_INTERVAL_MS,
  CARTEL_XP_PER_GRAM_PRODUCED,
  CARTEL_DEFAULT_XP_PER_GRAM_SOLD,
  CARTEL_MAX_RANK,
  CARTEL_DEALER_TIERS,
  CARTEL_DEALER_TIERS_BY_ID,
  CARTEL_DEALER_UPKEEP_PERCENT_BY_TIER,
  SEMUTA_CARTEL_USER_ID
} from './constants.mjs';
import { stashCapForRank, stashCapMgForRank, applyRankProgress, rankXpTable } from './progression.mjs';

export class CartelError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.code = code;
    this.extra = extra;
  }
}

const PROD_WEIGHT_BASE = 10_000;
const DEALER_PRICE_SCALE = 10_000;
const CHIP_VALUE_UNIT = MG_PER_GRAM * DEALER_PRICE_SCALE;
const SECONDS_PER_HOUR = 3600;
const DEFAULT_SHARE_RATE_MG_PER_HOUR = Math.max(1, Math.round(CARTEL_DEFAULT_SHARE_RATE_GRAMS_PER_HOUR * MG_PER_GRAM));
const SHARE_MARKET_MAX_SHARES = 1_000_000;
const SHARE_MARKET_MAX_PRICE = 1_000_000;
const SHARE_MARKET_LIST_LIMIT = 10;
const SHARE_MARKET_USER_LIMIT = 25;
const ORDER_EXPIRATION_SECONDS = 14 * 24 * 60 * 60;
function isSemutaSellOrder(orderId) {
  return typeof orderId === 'string' && orderId.startsWith('sell_SEMUTA_CARTEL');
}

function isSemutaBuyOrder(orderId) {
  return typeof orderId === 'string' && orderId.startsWith('buy_SEMUTA_CARTEL');
}

export function calculateSemutaMarketPrices(totalShares) {
  const shares = Math.max(0, Number(totalShares || 0));
  const dynamic = shares * 0.1;
  const sellPrice = Math.max(1, Math.floor(100 + dynamic));
  const buyPrice = Math.max(1, Math.floor(sellPrice / 2));
  return { sellPrice, buyPrice };
}

async function getSemutaMarketPrices(guildId) {
  const pool = await getCartelPool(guildId);
  return calculateSemutaMarketPrices(pool?.total_shares || 0);
}

function isSemutaMarketOrder(order) {
  if (!order) return false;
  if (order.user_id === SEMUTA_CARTEL_USER_ID) return true;
  return isSemutaSellOrder(order.order_id) || isSemutaBuyOrder(order.order_id);
}

function isMarketOrderExpired(order, now = Math.floor(Date.now() / 1000)) {
  if (!order || isSemutaMarketOrder(order)) return false;
  const createdAt = Number(order.created_at || 0);
  if (!createdAt) return false;
  return now - createdAt > ORDER_EXPIRATION_SECONDS;
}

async function ensureOrderNotExpired(order) {
  if (!order) return order;
  const now = Math.floor(Date.now() / 1000);
  if (isMarketOrderExpired(order, now)) {
    await setCartelMarketOrderStatusDb(order.order_id, 'EXPIRED');
    throw new CartelError('CARTEL_MARKET_ORDER_EXPIRED', 'That market order has expired.');
  }
  return order;
}

async function pruneExpiredMarketOrders(rows = [], options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const fresh = [];
  const expiredCollector = Array.isArray(options?.expiredOrders) ? options.expiredOrders : null;
  for (const order of rows || []) {
    if (!order) continue;
    if (isMarketOrderExpired(order, now)) {
      await setCartelMarketOrderStatusDb(order.order_id, 'EXPIRED');
      if (expiredCollector) expiredCollector.push(order.order_id);
      continue;
    }
    fresh.push(order);
  }
  return fresh;
}

function gramsToMg(grams) {
  const value = Number(grams);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.floor(value * MG_PER_GRAM));
}

function mgToGrams(mg) {
  return Number(mg || 0) / MG_PER_GRAM;
}

function saleMultiplierBpsForInvestor(investor) {
  return Math.max(0, Number(investor?.sale_multiplier_bps || 0));
}

function applySaleMultiplierToChips(baseChips, investorOrBps) {
  const chips = Math.max(0, Math.floor(Number(baseChips || 0)));
  const multiplierBps = typeof investorOrBps === 'number'
    ? Math.max(0, Math.floor(Number(investorOrBps || 0)))
    : saleMultiplierBpsForInvestor(investorOrBps);
  if (multiplierBps <= 0 || chips <= 0) {
    return { total: chips, bonus: 0, multiplierBps };
  }
  const bonus = Math.floor((chips * multiplierBps) / 10_000);
  return { total: chips + bonus, bonus, multiplierBps };
}

function combineDealerAndSaleMultiplier(dealerMultiplierBps, saleMultiplierBps) {
  const dealerBps = Math.max(1, Math.floor(Number(dealerMultiplierBps || DEALER_PRICE_SCALE)));
  const bonusBps = Math.max(0, Math.floor(Number(saleMultiplierBps || 0)));
  return Math.floor((dealerBps * (10_000 + bonusBps)) / 10_000);
}

function warehouseExportBonusBps(mgAmount) {
  const mg = Math.max(0, Math.floor(Number(mgAmount || 0)));
  if (mg <= 0) return 0;
  const mgPerThousandGrams = MG_PER_GRAM * 1000;
  const units = Math.floor(mg / mgPerThousandGrams);
  if (units <= 0) return 0;
  return units * 100;
}

function sharePriceFromPool(pool) {
  return Math.max(1, Math.floor(Number(pool?.share_price || CARTEL_DEFAULT_SHARE_PRICE)));
}

function shareRateMgPerHour(pool) {
  const stored = Number(pool?.share_rate_mg_per_hour);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.floor(stored);
  }
  return DEFAULT_SHARE_RATE_MG_PER_HOUR;
}

function xpPerGramSold(pool) {
  const stored = Number(pool?.xp_per_gram_sold);
  if (Number.isFinite(stored) && stored >= 0) {
    return stored;
  }
  return CARTEL_DEFAULT_XP_PER_GRAM_SOLD;
}

export function formatSemuta(mg, { maximumFractionDigits = 2 } = {}) {
  const grams = mgToGrams(mg);
  return grams.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function baseRateMgPerHour(totalWeight = 0, pool = null) {
  const weight = Math.max(0, Number(totalWeight || 0));
  if (weight <= 0) return 0;
  return Math.floor(weight * shareRateMgPerHour(pool));
}

function computeInvestorWeight(investor, totalShares) {
  const shares = Math.max(0, Number(investor?.shares || 0));
  if (shares <= 0) return 0;
  const denominator = Math.max(shares, Number(totalShares || 0));
  const sharePercent = denominator > 0 ? shares / denominator : 0;
  const rank = Math.max(1, Number(investor?.rank || 1));
  const multiplier = (1 + sharePercent) * rank;
  return Math.floor(shares * multiplier);
}

function nextTickAt(pool) {
  if (!pool?.last_tick_at) return null;
  return Number(pool.last_tick_at) + CARTEL_MIN_TICK_SECONDS;
}

async function loadCartelState(guildId) {
  const pool = await getCartelPool(guildId);
  const investors = await listCartelInvestors(guildId);
  const totalShares = investors.reduce((sum, inv) => sum + Math.max(0, Number(inv?.shares || 0)), 0);
  const activeInvestors = investors
    .filter(inv => Number(inv?.shares || 0) > 0)
    .map(inv => ({ ...inv, weight: computeInvestorWeight(inv, totalShares) }))
    .filter(inv => inv.weight > 0);
  const totalWeight = activeInvestors.reduce((sum, inv) => sum + inv.weight, 0);
  const totalStashMg = investors.reduce((sum, inv) => sum + Number(inv?.stash_mg || 0), 0);
  const totalWarehouseMg = investors.reduce((sum, inv) => sum + Number(inv?.warehouse_mg || 0), 0);
  return {
    pool,
    investors,
    activeInvestors,
    totalWeight,
    totals: {
      stashMg: totalStashMg,
      warehouseMg: totalWarehouseMg,
      investors: investors.length,
      shares: totalShares
    }
  };
}

async function applyXpGain(guildId, investor, xpGain) {
  if (!xpGain) return { rank: investor.rank, rankXp: investor.rank_xp };
  const result = applyRankProgress(investor.rank, investor.rank_xp, xpGain);
  if (result.rank !== investor.rank || result.rankXp !== investor.rank_xp) {
    await cartelSetRankAndXp(guildId, investor.user_id, result.rank, result.rankXp);
  }
  return result;
}

function ensurePositiveAmount(value, code, message) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CartelError(code, message);
  }
}

function normalizeMarketSide(side) {
  return String(side || 'SELL').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
}

function isDbError(err, code) {
  if (!err) return false;
  const text = String(err.message || '').toUpperCase();
  return text.includes(code);
}

function dealerTierOrThrow(tierId) {
  const tier = CARTEL_DEALER_TIERS_BY_ID[Number(tierId)];
  if (!tier) throw new CartelError('CARTEL_INVALID_TIER', 'Choose a valid dealer tier.');
  return tier;
}

export function dealerUpkeepPercentForTier(tierId) {
  const percent = CARTEL_DEALER_UPKEEP_PERCENT_BY_TIER[Number(tierId)] ?? CARTEL_DEALER_UPKEEP_PERCENT_BY_TIER[1];
  return Math.max(0, Number(percent || 0));
}

export function calculateDealerHourlyRevenue(dealer) {
  const hourlyCapMg = Math.max(0, Number(dealer?.hourly_sell_cap_mg || 0));
  if (hourlyCapMg <= 0) return 0;
  const multiplierBps = Math.max(1, Number(dealer?.price_multiplier_bps || DEALER_PRICE_SCALE));
  const numerator = hourlyCapMg * CARTEL_BASE_PRICE_PER_GRAM * multiplierBps;
  const revenue = numerator / (MG_PER_GRAM * DEALER_PRICE_SCALE);
  return revenue;
}

export function calculateDealerUpkeepChipsPerHour(dealer) {
  const revenue = calculateDealerHourlyRevenue(dealer);
  const percent = dealerUpkeepPercentForTier(dealer?.tier);
  return revenue * percent;
}

function calculateDealerSecondsPurchased(dealer, chipAmount) {
  const chipsPerHour = calculateDealerUpkeepChipsPerHour(dealer);
  if (chipsPerHour <= 0) return 0;
  const seconds = Math.floor((Number(chipAmount) * SECONDS_PER_HOUR) / chipsPerHour);
  return Math.max(0, seconds);
}

function minimumUpkeepChips(dealer) {
  const chipsPerHour = calculateDealerUpkeepChipsPerHour(dealer);
  if (chipsPerHour <= 0) return 0;
  return Math.max(1, Math.ceil(chipsPerHour / SECONDS_PER_HOUR));
}

export function dealerCapForRank(rank) {
  const normalized = Math.max(1, Number(rank || 1));
  return Math.max(2, normalized + 1);
}

export function dealerPayoutForMg(mg, multiplierBps) {
  const multiplier = Math.max(1, Number(multiplierBps || DEALER_PRICE_SCALE));
  const numerator = Math.floor(mg) * CARTEL_BASE_PRICE_PER_GRAM * multiplier;
  return Math.floor(numerator / (MG_PER_GRAM * DEALER_PRICE_SCALE));
}

export async function getCartelOverview(guildId, userId) {
  const state = await loadCartelState(guildId);
  const pool = state.pool;
  let investor = await getCartelInvestor(guildId, userId);
  investor = await autoRankIfNeeded(guildId, investor);
  const shareCount = Math.max(0, Number(investor?.shares || 0));
  const totalShares = Math.max(0, Number(state.totals?.shares || 0));
  const sharePercent = totalShares > 0 && shareCount > 0 ? shareCount / totalShares : 0;
  const perShareRateMg = shareRateMgPerHour(pool);
  const rankMultiplier = Math.max(1, Number(investor?.rank || 1));
  const shareMultiplier = (1 + sharePercent) * rankMultiplier;
  const hourlyMg = Math.floor(shareCount * perShareRateMg * shareMultiplier);
  const hourlyGrams = mgToGrams(hourlyMg);
  const dailyGrams = hourlyGrams * 24;
  const stashCapGrams = stashCapForRank(investor.rank);
  const sharePrice = sharePriceFromPool(pool);
  const stashGrams = mgToGrams(investor.stash_mg);
  const warehouseGrams = mgToGrams(investor.warehouse_mg);
  const saleMultiplierBps = saleMultiplierBpsForInvestor(investor);
  const saleMultiplierPercent = saleMultiplierBps / 100;
  const nextTick = nextTickAt(pool);
  return {
    pool,
    investor,
    totals: state.totals,
    metrics: {
      hourlyGrams,
      dailyGrams,
      stashCapGrams,
      stashGrams,
      warehouseGrams,
      sharePercent,
      activeInvestors: state.activeInvestors.length,
      totalWeight: totalShares,
      sharePrice,
      perShareRateMg,
      xpPerGram: xpPerGramSold(pool),
      rankMultiplier,
      shareMultiplier,
      saleMultiplierBps,
      saleMultiplierPercent
    },
    nextTickAt: nextTick
  };
}

export async function getCartelSharePrice(guildId) {
  const pool = await getCartelPool(guildId);
  return sharePriceFromPool(pool);
}

export async function updateCartelSharePrice(guildId, sharePrice) {
  const pool = await setCartelSharePriceDb(guildId, sharePrice);
  return {
    pool,
    sharePrice: sharePriceFromPool(pool)
  };
}

export async function resetCartelPlayer(guildId, userId) {
  return cartelResetInvestor(guildId, userId);
}

export async function updateCartelShareRate(guildId, gramsPerHour) {
  const numeric = Number(gramsPerHour || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new CartelError('CARTEL_RATE_INVALID', 'Provide a positive grams-per-hour of Semuta value.');
  }
  const mgPerHour = Math.max(1, Math.round(numeric * MG_PER_GRAM));
  const pool = await setCartelShareRateDb(guildId, mgPerHour);
  return {
    pool,
    shareRateMgPerHour: shareRateMgPerHour(pool)
  };
}

export async function updateCartelXpPerGram(guildId, xpPerGram) {
  const gid = resolveGuildId(guildId);
  const rate = Math.max(0, Number(xpPerGram || 0));
  const pool = await setCartelXpPerGramDb(gid, rate);
  return {
    pool,
    xpPerGram: xpPerGramSold(pool)
  };
}

export async function cartelInvest(guildId, userId, chipAmount) {
  const pool = await getCartelPool(guildId);
  const sharePrice = sharePriceFromPool(pool);
  const amount = Math.floor(Number(chipAmount || 0));
  if (!Number.isInteger(amount) || amount < sharePrice) {
    throw new CartelError('CARTEL_INVEST_MIN', `Invest at least ${chipsAmount(sharePrice)} chips.`);
  }
  const shares = Math.floor(amount / sharePrice);
  if (shares <= 0) throw new CartelError('CARTEL_INVEST_MIN', `Invest in multiples of ${chipsAmount(sharePrice)} chips.`);
  const spend = shares * sharePrice;
  try {
    await takeFromUserToHouse(guildId, userId, spend, 'cartel investment');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_USER')) {
      throw new CartelError('CARTEL_NO_CHIPS', 'You do not have enough chips to invest that amount.');
    }
    throw err;
  }
  await cartelAddShares(guildId, userId, shares);
  await recordCartelTransaction(guildId, userId, 'INVEST', spend, 0, { shares });
  const remainder = amount - spend;
  return { shares, spend, remainder, sharePrice };
}

export async function cartelSellShares(guildId, userId, shareAmount) {
  const sharesToSell = Math.floor(Number(shareAmount || 0));
  ensurePositiveAmount(sharesToSell, 'CARTEL_SHARE_AMOUNT_REQUIRED', 'Enter at least 1 share to sell.');
  const pool = await getCartelPool(guildId);
  const sharePrice = sharePriceFromPool(pool);
  let investor = await getCartelInvestor(guildId, userId);
  investor = await autoRankIfNeeded(guildId, investor);
  const ownedShares = Math.max(0, Number(investor?.shares || 0));
  if (ownedShares < sharesToSell) {
    throw new CartelError('CARTEL_NOT_ENOUGH_SHARES', 'You do not have that many shares.');
  }
  const payout = sharesToSell * sharePrice;
  try {
    await cartelRemoveShares(guildId, userId, sharesToSell);
  } catch (err) {
    if (String(err?.message || err) === 'CARTEL_NOT_ENOUGH_SHARES') {
      throw new CartelError('CARTEL_NOT_ENOUGH_SHARES', 'You do not have that many shares.');
    }
    throw err;
  }
  try {
    await transferFromHouseToUser(guildId, userId, payout, 'cartel share sale');
  } catch (err) {
    await cartelAddShares(guildId, userId, sharesToSell).catch(() => {});
    if (isDbError(err, 'INSUFFICIENT_HOUSE')) {
      throw new CartelError('CARTEL_HOUSE_EMPTY', 'The house bank is too low to buy back shares. Try again soon.');
    }
    throw err;
  }
  await recordCartelTransaction(guildId, userId, 'DIVEST', payout, 0, { shares: sharesToSell, sharePrice });
  return { sharesSold: sharesToSell, payout, sharePrice };
}

export async function createShareMarketOrder(guildId, userId, side, shareAmount, pricePerShare) {
  const normalizedSide = normalizeMarketSide(side);
  const shares = Math.floor(Number(shareAmount || 0));
  ensurePositiveAmount(shares, 'CARTEL_MARKET_SHARES_REQUIRED', 'Enter at least 1 share.');
  if (shares > SHARE_MARKET_MAX_SHARES) {
    throw new CartelError(
      'CARTEL_MARKET_SHARE_LIMIT',
      `Limit orders to ${SHARE_MARKET_MAX_SHARES.toLocaleString('en-US')} shares or fewer.`
    );
  }
  const price = Math.floor(Number(pricePerShare || 0));
  ensurePositiveAmount(price, 'CARTEL_MARKET_PRICE_REQUIRED', 'Enter a positive chip price per share.');
  if (price > SHARE_MARKET_MAX_PRICE) {
    throw new CartelError(
      'CARTEL_MARKET_PRICE_LIMIT',
      `Limit price per share to ${chipsAmount(SHARE_MARKET_MAX_PRICE)} chips or fewer.`
    );
  }
  return createCartelMarketOrderDb(guildId, userId, normalizedSide, shares, price);
}

export async function listShareMarketOrders(guildId, side, limit = SHARE_MARKET_LIST_LIMIT) {
  const normalizedSide = normalizeMarketSide(side);
  const cappedLimit = Math.max(1, Math.min(SHARE_MARKET_LIST_LIMIT, Math.floor(Number(limit || SHARE_MARKET_LIST_LIMIT))));
  const rows = await listCartelMarketOrdersDb(guildId, normalizedSide, cappedLimit);
  return pruneExpiredMarketOrders(rows);
}

export async function listShareMarketOrdersForUser(guildId, userId, limit = SHARE_MARKET_USER_LIMIT, options = {}) {
  const cappedLimit = Math.max(1, Math.min(SHARE_MARKET_USER_LIMIT, Math.floor(Number(limit || SHARE_MARKET_USER_LIMIT))));
  const rows = await listCartelMarketOrdersForUserDb(guildId, userId, cappedLimit);
  return pruneExpiredMarketOrders(rows, options);
}

export async function getCartelOrderSnapshot(guildId, userId) {
  return getCartelOrderSnapshotDb(guildId, userId);
}

export async function setCartelOrderSnapshot(guildId, userId, snapshot) {
  return setCartelOrderSnapshotDb(guildId, userId, snapshot);
}

export async function deleteCartelOrderSnapshot(guildId, userId) {
  return deleteCartelOrderSnapshotDb(guildId, userId);
}

export async function cancelShareMarketOrder(guildId, userId, orderId) {
  if (!orderId) {
    throw new CartelError('CARTEL_MARKET_SELECTION_REQUIRED', 'Select one of your market orders first.');
  }
  let order = await getCartelMarketOrderDb(orderId);
  order = await ensureOrderNotExpired(order);
  if (!order) {
    throw new CartelError('CARTEL_MARKET_ORDER_NOT_FOUND', 'That market order no longer exists.');
  }
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || order.user_id !== normalizedUserId) {
    throw new CartelError('CARTEL_MARKET_ORDER_NOT_OWNER', 'You can only cancel your own market orders.');
  }
  if (order.status !== 'OPEN') {
    throw new CartelError('CARTEL_MARKET_ORDER_CLOSED', 'That market order is already closed.');
  }
  await setCartelMarketOrderStatusDb(orderId, 'CANCELLED');
  return getCartelMarketOrderDb(orderId);
}

export async function executeMarketBuy(guildId, buyerId, orderId, shareAmount) {
  const normalizedShares = Math.max(1, Math.floor(Number(shareAmount || 0)));
  ensurePositiveAmount(normalizedShares, 'CARTEL_MARKET_AMOUNT_REQUIRED', 'Enter at least 1 share.');
  if (isSemutaSellOrder(orderId)) {
    return processSemutaMarketPurchase(guildId, buyerId, normalizedShares);
  }
  let order = await getCartelMarketOrderDb(orderId);
  order = await ensureOrderNotExpired(order);
  if (!order || order.status !== 'OPEN' || String(order.side).toUpperCase() !== 'SELL') {
    throw new CartelError('CARTEL_MARKET_ORDER_NOT_FOUND', 'That sell order is no longer available.');
  }
  return fulfillSellOrderWithBuyer(guildId, buyerId, order, normalizedShares);
}

export async function executeMarketSell(guildId, sellerId, orderId, shareAmount) {
  const normalizedShares = Math.max(1, Math.floor(Number(shareAmount || 0)));
  ensurePositiveAmount(normalizedShares, 'CARTEL_MARKET_AMOUNT_REQUIRED', 'Enter at least 1 share.');
  if (isSemutaBuyOrder(orderId)) {
    return processSemutaMarketSale(guildId, sellerId, normalizedShares);
  }
  let order = await getCartelMarketOrderDb(orderId);
  order = await ensureOrderNotExpired(order);
  if (!order || order.status !== 'OPEN' || String(order.side).toUpperCase() !== 'BUY') {
    throw new CartelError('CARTEL_MARKET_ORDER_NOT_FOUND', 'That buy order is no longer available.');
  }
  return fulfillBuyOrderWithSeller(guildId, sellerId, order, normalizedShares);
}

async function fulfillSellOrderWithBuyer(guildId, buyerId, order, shareAmount) {
  const sellerId = order.user_id;
  if (buyerId === sellerId) {
    throw new CartelError('CARTEL_MARKET_SELF', 'You cannot fill your own sell order.');
  }
  const availableShares = Math.max(0, Number(order.shares || 0));
  if (shareAmount > availableShares) {
    throw new CartelError(
      'CARTEL_MARKET_LIMIT',
      `That order only has ${availableShares.toLocaleString('en-US')} shares remaining.`
    );
  }
  const seller = await getCartelInvestor(guildId, sellerId);
  const sellerShares = Math.max(0, Number(seller?.shares || 0));
  if (sellerShares < shareAmount) {
    await setCartelMarketOrderStatusDb(order.order_id, 'CANCELLED');
    throw new CartelError('CARTEL_MARKET_ORDER_STALE', 'Seller no longer has enough shares. Order cancelled.');
  }
  const totalCost = shareAmount * Math.max(1, Number(order.price_per_share || 0));
  try {
    await takeFromUserToHouse(guildId, buyerId, totalCost, 'cartel market buy');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_USER')) {
      throw new CartelError('CARTEL_MARKET_NO_CHIPS', 'You do not have enough chips to buy that order.');
    }
    throw err;
  }
  await transferFromHouseToUser(guildId, sellerId, totalCost, 'cartel market sale payout');
  await cartelRemoveShares(guildId, sellerId, shareAmount);
  await cartelAddShares(guildId, buyerId, shareAmount);
  const remainingShares = availableShares - shareAmount;
  await setCartelMarketOrderSharesDb(order.order_id, remainingShares, remainingShares > 0 ? 'OPEN' : 'FILLED');
  await recordCartelTransaction(guildId, buyerId, 'MARKET_BUY', totalCost, 0, {
    orderId: order.order_id,
    shares: shareAmount,
    pricePerShare: order.price_per_share,
    sellerId
  });
  await recordCartelTransaction(guildId, sellerId, 'MARKET_SELL', totalCost, 0, {
    orderId: order.order_id,
    shares: shareAmount,
    pricePerShare: order.price_per_share,
    buyerId
  });
  return {
    direction: 'buy',
    sharesFilled: shareAmount,
    pricePerShare: order.price_per_share,
    chips: totalCost,
    counterpartyId: sellerId,
    orderId: order.order_id,
    semuta: false
  };
}

async function fulfillBuyOrderWithSeller(guildId, sellerId, order, shareAmount) {
  const buyerId = order.user_id;
  if (buyerId === sellerId) {
    throw new CartelError('CARTEL_MARKET_SELF', 'You cannot fill your own buy order.');
  }
  const availableShares = Math.max(0, Number(order.shares || 0));
  if (shareAmount > availableShares) {
    throw new CartelError(
      'CARTEL_MARKET_LIMIT',
      `That order only has ${availableShares.toLocaleString('en-US')} shares remaining.`
    );
  }
  const seller = await getCartelInvestor(guildId, sellerId);
  const sellerShares = Math.max(0, Number(seller?.shares || 0));
  if (sellerShares < shareAmount) {
    throw new CartelError('CARTEL_NOT_ENOUGH_SHARES', 'You do not have enough shares to sell that amount.');
  }
  const totalCost = shareAmount * Math.max(1, Number(order.price_per_share || 0));
  try {
    await takeFromUserToHouse(guildId, buyerId, totalCost, 'cartel market buy fill');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_USER')) {
      await setCartelMarketOrderStatusDb(order.order_id, 'CANCELLED');
      throw new CartelError('CARTEL_MARKET_ORDER_STALE', 'Buyer no longer has chips. Order cancelled.');
    }
    throw err;
  }
  await transferFromHouseToUser(guildId, sellerId, totalCost, 'cartel market sell payout');
  await cartelRemoveShares(guildId, sellerId, shareAmount);
  await cartelAddShares(guildId, buyerId, shareAmount);
  const remainingShares = availableShares - shareAmount;
  await setCartelMarketOrderSharesDb(order.order_id, remainingShares, remainingShares > 0 ? 'OPEN' : 'FILLED');
  await recordCartelTransaction(guildId, buyerId, 'MARKET_BUY', totalCost, 0, {
    orderId: order.order_id,
    shares: shareAmount,
    pricePerShare: order.price_per_share,
    sellerId
  });
  await recordCartelTransaction(guildId, sellerId, 'MARKET_SELL', totalCost, 0, {
    orderId: order.order_id,
    shares: shareAmount,
    pricePerShare: order.price_per_share,
    buyerId
  });
  return {
    direction: 'sell',
    sharesFilled: shareAmount,
    pricePerShare: order.price_per_share,
    chips: totalCost,
    counterpartyId: buyerId,
    orderId: order.order_id,
    semuta: false
  };
}

async function processSemutaMarketPurchase(guildId, buyerId, shareAmount) {
  const prices = await getSemutaMarketPrices(guildId);
  const sellPrice = prices.sellPrice;
  const totalCost = shareAmount * sellPrice;
  try {
    await takeFromUserToHouse(guildId, buyerId, totalCost, 'semuta cartel market buy');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_USER')) {
      throw new CartelError('CARTEL_MARKET_NO_CHIPS', 'You do not have enough chips to buy that order.');
    }
    throw err;
  }
  await cartelAddShares(guildId, buyerId, shareAmount);
  await recordCartelTransaction(guildId, buyerId, 'MARKET_BUY', totalCost, 0, {
    orderId: 'sell_SEMUTA_CARTEL',
    shares: shareAmount,
    pricePerShare: sellPrice,
    sellerId: SEMUTA_CARTEL_USER_ID
  });
  return {
    direction: 'buy',
    sharesFilled: shareAmount,
    pricePerShare: sellPrice,
    chips: totalCost,
    counterpartyId: SEMUTA_CARTEL_USER_ID,
    orderId: 'sell_SEMUTA_CARTEL',
    semuta: true
  };
}

async function processSemutaMarketSale(guildId, sellerId, shareAmount) {
  const seller = await getCartelInvestor(guildId, sellerId);
  const sellerShares = Math.max(0, Number(seller?.shares || 0));
  if (sellerShares < shareAmount) {
    throw new CartelError('CARTEL_NOT_ENOUGH_SHARES', 'You do not have enough shares to sell that amount.');
  }
  const prices = await getSemutaMarketPrices(guildId);
  const buyPrice = prices.buyPrice;
  const payout = shareAmount * buyPrice;
  try {
    await transferFromHouseToUser(guildId, sellerId, payout, 'semuta cartel market sell');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_HOUSE')) {
      throw new CartelError('CARTEL_HOUSE_EMPTY', 'The house bank is too low to buy more shares right now.');
    }
    throw err;
  }
  await cartelRemoveShares(guildId, sellerId, shareAmount);
  await recordCartelTransaction(guildId, sellerId, 'MARKET_SELL', payout, 0, {
    orderId: 'buy_SEMUTA_CARTEL',
    shares: shareAmount,
    pricePerShare: buyPrice,
    buyerId: SEMUTA_CARTEL_USER_ID
  });
  return {
    direction: 'sell',
    sharesFilled: shareAmount,
    pricePerShare: buyPrice,
    chips: payout,
    counterpartyId: SEMUTA_CARTEL_USER_ID,
    orderId: 'buy_SEMUTA_CARTEL',
    semuta: true
  };
}

export async function cartelSell(guildId, userId, grams) {
  const mgToSell = gramsToMg(grams);
  ensurePositiveAmount(mgToSell, 'CARTEL_AMOUNT_REQUIRED', 'Enter at least 1g to sell.');
  const pool = await getCartelPool(guildId);
  let investor = await getCartelInvestor(guildId, userId);
  investor = await autoRankIfNeeded(guildId, investor);
  const currentStash = Number(investor?.stash_mg || 0);
  if (currentStash < mgToSell) {
    throw new CartelError('CARTEL_NOT_ENOUGH_STASH', 'You do not have that much Semuta in your stash.');
  }
  const basePayout = Math.floor((mgToSell / MG_PER_GRAM) * CARTEL_BASE_PRICE_PER_GRAM);
  const payoutInfo = applySaleMultiplierToChips(basePayout, investor);
  const payout = payoutInfo.total;
  const newStash = currentStash - mgToSell;
  const warehouse = Number(investor?.warehouse_mg || 0);
  await cartelSetHoldings(guildId, userId, newStash, warehouse);
  try {
    await transferFromHouseToUser(guildId, userId, payout, 'cartel sale');
  } catch (err) {
    await cartelSetHoldings(guildId, userId, currentStash, warehouse);
    if (isDbError(err, 'INSUFFICIENT_HOUSE')) {
      throw new CartelError('CARTEL_HOUSE_EMPTY', 'The house bank is too low to cover that sale. Try again soon.');
    }
    throw err;
  }
  const gramsSold = mgToGrams(mgToSell);
  const xpRate = xpPerGramSold(pool);
  const xpGain = Math.floor(gramsSold * xpRate);
  const rankState = await applyXpGain(guildId, investor, xpGain);
  await recordCartelTransaction(guildId, userId, 'SELL', payout, mgToSell, {
    grams: gramsSold,
    pricePerGram: CARTEL_BASE_PRICE_PER_GRAM,
    saleMultiplierBps: payoutInfo.multiplierBps
  });
  return {
    gramsSold,
    payout,
    rank: rankState.rank,
    rankXp: rankState.rankXp
  };
}

export async function cartelReserveStashForSale(guildId, userId, mgAmount) {
  const mgToReserve = Math.floor(Number(mgAmount || 0));
  ensurePositiveAmount(mgToReserve, 'CARTEL_AMOUNT_REQUIRED', 'Enter at least 1g to sell.');
  const investor = await getCartelInvestor(guildId, userId);
  const currentStash = Number(investor?.stash_mg || 0);
  if (currentStash < mgToReserve) {
    throw new CartelError('CARTEL_NOT_ENOUGH_STASH', 'You do not have that much Semuta in your stash.');
  }
  const newStash = currentStash - mgToReserve;
  const warehouse = Number(investor?.warehouse_mg || 0);
  await cartelSetHoldings(guildId, userId, newStash, warehouse);
  return { reservedMg: mgToReserve };
}

export async function cartelRefundStashForSale(guildId, userId, mgAmount) {
  const mgToRefund = Math.floor(Number(mgAmount || 0));
  if (mgToRefund <= 0) return { refundedMg: 0, overflowMg: 0 };
  let investor = await getCartelInvestor(guildId, userId);
  investor = await autoRankIfNeeded(guildId, investor);
  const currentStash = Number(investor?.stash_mg || 0);
  const warehouse = Number(investor?.warehouse_mg || 0);
  const capMg = stashCapMgForRank(investor.rank);
  let newStash = currentStash + mgToRefund;
  let overflowMg = 0;
  if (capMg > 0 && newStash > capMg) {
    overflowMg = newStash - capMg;
    newStash = capMg;
  }
  const newWarehouse = warehouse + overflowMg;
  await cartelSetHoldings(guildId, userId, newStash, newWarehouse);
  return { refundedMg: mgToRefund - overflowMg, overflowMg };
}

export async function cartelPayoutReservedSale(guildId, userId, mgAmount) {
  const mgToPayout = Math.floor(Number(mgAmount || 0));
  ensurePositiveAmount(mgToPayout, 'CARTEL_AMOUNT_REQUIRED', 'Enter at least 1g to sell.');
  const pool = await getCartelPool(guildId);
  let investor = await getCartelInvestor(guildId, userId);
  investor = await autoRankIfNeeded(guildId, investor);
  const basePayout = Math.floor((mgToPayout / MG_PER_GRAM) * CARTEL_BASE_PRICE_PER_GRAM);
  const payoutInfo = applySaleMultiplierToChips(basePayout, investor);
  const payout = payoutInfo.total;
  try {
    await transferFromHouseToUser(guildId, userId, payout, 'cartel sale (mini-game)');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_HOUSE')) {
      throw new CartelError('CARTEL_HOUSE_EMPTY', 'The house bank is too low to cover that sale. Try again soon.');
    }
    throw err;
  }
  const gramsSold = mgToGrams(mgToPayout);
  const xpRate = xpPerGramSold(pool);
  const xpGain = Math.floor(gramsSold * xpRate);
  const rankState = await applyXpGain(guildId, investor, xpGain);
  await recordCartelTransaction(guildId, userId, 'SELL', payout, mgToPayout, {
    grams: gramsSold,
    pricePerGram: CARTEL_BASE_PRICE_PER_GRAM,
    mode: 'MINIGAME',
    saleMultiplierBps: payoutInfo.multiplierBps
  });
  return {
    gramsSold,
    payout,
    rank: rankState.rank,
    rankXp: rankState.rankXp
  };
}

export async function cartelCollect(guildId, userId, grams) {
  const mgRequested = gramsToMg(grams);
  ensurePositiveAmount(mgRequested, 'CARTEL_AMOUNT_REQUIRED', 'Enter at least 1g to collect.');
  const investor = await getCartelInvestor(guildId, userId);
  const currentWarehouse = Number(investor?.warehouse_mg || 0);
  if (currentWarehouse < mgRequested) {
    throw new CartelError('CARTEL_NOT_ENOUGH_WAREHOUSE', 'You do not have that much Semuta in storage.');
  }
  const gramsRequested = mgToGrams(mgRequested);
  const collectValueChips = gramsRequested * CARTEL_BASE_PRICE_PER_GRAM;
  let fee = Math.ceil((collectValueChips * CARTEL_WAREHOUSE_FEE_BPS) / 10_000);
  if (fee < 0) fee = 0;
  if (fee > 0) {
    try {
      await takeFromUserToHouse(guildId, userId, fee, 'cartel warehouse fee');
    } catch (err) {
      if (isDbError(err, 'INSUFFICIENT_USER')) {
        throw new CartelError('CARTEL_NO_CHIPS', 'You do not have enough chips to pay the collection fee.');
      }
      throw err;
    }
  }
  const stashCapMg = stashCapMgForRank(investor.rank);
  const currentStash = Number(investor?.stash_mg || 0);
  const targetStash = currentStash + mgRequested;
  let finalStash = targetStash;
  let overflow = 0;
  if (targetStash > stashCapMg) {
    overflow = targetStash - stashCapMg;
    finalStash = stashCapMg;
  }
  const newWarehouse = currentWarehouse - mgRequested + overflow;
  await cartelSetHoldings(guildId, userId, finalStash, newWarehouse);
  await recordCartelTransaction(guildId, userId, 'COLLECT_FEE', fee, mgRequested, { grams: gramsRequested, overflow: mgToGrams(overflow) });
  return {
    collectedGrams: gramsRequested - mgToGrams(overflow),
    overflowReturnedGrams: mgToGrams(overflow),
    fee
  };
}

export async function cartelAbandon(guildId, userId, grams) {
  const mgToBurn = gramsToMg(grams);
  ensurePositiveAmount(mgToBurn, 'CARTEL_AMOUNT_REQUIRED', 'Enter at least 1g to abandon.');
  const investor = await getCartelInvestor(guildId, userId);
  const currentWarehouse = Number(investor?.warehouse_mg || 0);
  if (currentWarehouse < mgToBurn) {
    throw new CartelError('CARTEL_NOT_ENOUGH_WAREHOUSE', 'Not enough Semuta in the warehouse.');
  }
  const newWarehouse = currentWarehouse - mgToBurn;
  await cartelSetHoldings(guildId, userId, Number(investor?.stash_mg || 0), newWarehouse);
  await recordCartelTransaction(guildId, userId, 'WAREHOUSE_BURN', 0, mgToBurn, { grams: mgToGrams(mgToBurn) });
  return { burnedGrams: mgToGrams(mgToBurn) };
}

export async function cartelExportWarehouse(guildId, userId, mgAmount = null) {
  const investor = await getCartelInvestor(guildId, userId);
  const currentWarehouse = Number(investor?.warehouse_mg || 0);
  if (currentWarehouse <= 0) {
    throw new CartelError('CARTEL_NOT_ENOUGH_WAREHOUSE', 'Not enough Semuta in the warehouse.');
  }
  let mgToExport = mgAmount == null ? currentWarehouse : Math.max(0, Math.floor(Number(mgAmount)));
  if (mgToExport <= 0) {
    throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter at least 1,000g of Semuta to export.');
  }
  if (mgToExport > currentWarehouse) {
    throw new CartelError('CARTEL_NOT_ENOUGH_WAREHOUSE', 'You do not have that much Semuta in storage.');
  }
  const currentStash = Number(investor?.stash_mg || 0);
  const newWarehouse = currentWarehouse - mgToExport;
  await cartelSetHoldings(guildId, userId, currentStash, newWarehouse);
  const bonusBps = warehouseExportBonusBps(mgToExport);
  const updatedInvestor = bonusBps > 0
    ? await cartelAdjustSaleMultiplier(guildId, userId, bonusBps)
    : investor;
  const totalMultiplierBps = saleMultiplierBpsForInvestor(updatedInvestor);
  const exportedGrams = mgToGrams(mgToExport);
  await recordCartelTransaction(guildId, userId, 'WAREHOUSE_EXPORT', 0, mgToExport, {
    grams: exportedGrams,
    multiplierBpsGained: bonusBps,
    multiplierBpsTotal: totalMultiplierBps
  });
  return {
    exportedMg: mgToExport,
    exportedGrams,
    bonusBps,
    totalMultiplierBps
  };
}

export async function runDealerAutoSales(
  guildId,
  nowSeconds = Math.floor(Date.now() / 1000),
  deltaSeconds = CARTEL_MIN_TICK_SECONDS
) {
  const dealers = await listCartelDealers(guildId);
  if (!dealers.length) return { processed: 0, sales: 0 };
  const investors = await listCartelInvestors(guildId);
  const investorMap = new Map(investors.map(inv => [inv.user_id, { ...inv }]));
  let sales = 0;
  const intervalSeconds = Math.max(1, Math.floor(Number(deltaSeconds) || CARTEL_MIN_TICK_SECONDS));
  for (const dealer of dealers) {
    if (dealer.status !== 'ACTIVE') continue;
    const investor = investorMap.get(dealer.user_id);
    if (!investor) continue;
    if (dealer.upkeep_due_at && nowSeconds >= dealer.upkeep_due_at) {
      const autoAmount = Math.max(1, Math.round(calculateDealerUpkeepChipsPerHour(dealer)));
      const autoSeconds = calculateDealerSecondsPurchased(dealer, autoAmount);
      if (autoSeconds <= 0) {
        await cartelSetDealerStatus(guildId, dealer.dealer_id, 'PAUSED');
        dealer.status = 'PAUSED';
        continue;
      }
      try {
        await takeFromUserToHouse(guildId, dealer.user_id, autoAmount, 'cartel dealer upkeep (auto)');
        const nextDue = nowSeconds + Math.max(60, autoSeconds);
        await cartelSetDealerUpkeep(guildId, dealer.dealer_id, nextDue, 'ACTIVE');
        dealer.upkeep_due_at = nextDue;
        await recordCartelTransaction(guildId, dealer.user_id, 'DEALER_UPKEEP_AUTO', autoAmount, 0, { dealerId: dealer.dealer_id, secondsPurchased: autoSeconds });
      } catch (err) {
        if (isDbError(err, 'INSUFFICIENT_USER')) {
          await cartelSetDealerStatus(guildId, dealer.dealer_id, 'PAUSED');
          dealer.status = 'PAUSED';
          continue;
        }
        throw err;
      }
    }
    if (dealer.status !== 'ACTIVE') continue;
    const stashMg = Math.max(0, Number(investor.stash_mg || 0));
    if (stashMg <= 0) continue;
    const hourlyCapMg = Math.max(0, Number(dealer.hourly_sell_cap_mg || 0));
    const tickQuotaMg = Math.floor((hourlyCapMg * intervalSeconds) / 3600);
    if (tickQuotaMg <= 0) continue;
    const mgToSell = Math.min(stashMg, tickQuotaMg);
    if (mgToSell <= 0) {
      // Nothing left to move this tick; try again on the next pass.
      continue;
    }
    const dealerMultiplierBps = Math.max(1, Number(dealer.price_multiplier_bps || DEALER_PRICE_SCALE));
    const saleMultiplierBps = saleMultiplierBpsForInvestor(investor);
    const remainderUnits = Math.max(0, Math.floor(Number(dealer.chip_remainder_units || 0)));
    const effectiveMultiplierBps = combineDealerAndSaleMultiplier(dealerMultiplierBps, saleMultiplierBps);
    const saleValueUnits = Math.floor(mgToSell) * CARTEL_BASE_PRICE_PER_GRAM * effectiveMultiplierBps;
    const totalValueUnits = remainderUnits + saleValueUnits;
    const payout = Math.floor(totalValueUnits / CHIP_VALUE_UNIT);
    const nextRemainderUnits = totalValueUnits - payout * CHIP_VALUE_UNIT;
    const newStash = stashMg - mgToSell;
    investor.stash_mg = newStash;
    await cartelSetHoldings(guildId, dealer.user_id, newStash, Number(investor.warehouse_mg || 0));
    await cartelRecordDealerSale(guildId, dealer.dealer_id, mgToSell, nowSeconds, nextRemainderUnits);
    dealer.last_sold_at = nowSeconds;
    dealer.lifetime_sold_mg += mgToSell;
    dealer.chip_remainder_units = nextRemainderUnits;
    cartelAddDealerPending(guildId, dealer.dealer_id, payout, mgToSell);
    dealer.pending_chips = Number(dealer.pending_chips || 0) + payout;
    dealer.pending_mg = Number(dealer.pending_mg || 0) + mgToSell;
    await recordCartelTransaction(guildId, dealer.user_id, 'DEALER_SALE_PENDING', payout, mgToSell, { dealerId: dealer.dealer_id });
    sales += 1;
  }
  return { processed: dealers.length, sales };
}

export async function collectDealerChips(guildId, userId) {
  const dealers = await listCartelDealersForUser(guildId, userId);
  if (!dealers.length) {
    throw new CartelError('CARTEL_NO_DEALER_CHIPS', 'You have no dealers with pending chips.');
  }
  const pendingEntries = dealers
    .map(dealer => ({
      dealer_id: dealer.dealer_id,
      pending_chips: Math.max(0, Number(dealer.pending_chips || 0)),
      pending_mg: Math.max(0, Number(dealer.pending_mg || 0))
    }))
    .filter(entry => entry.pending_chips > 0);
  const totalChips = pendingEntries.reduce((sum, entry) => sum + entry.pending_chips, 0);
  const totalMg = pendingEntries.reduce((sum, entry) => sum + entry.pending_mg, 0);
  if (totalChips <= 0) {
    throw new CartelError('CARTEL_NO_DEALER_CHIPS', 'Your dealers have no chips ready to collect.');
  }
  try {
    await transferFromHouseToUser(guildId, userId, totalChips, 'cartel dealer collect');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_HOUSE')) {
      throw new CartelError('CARTEL_HOUSE_EMPTY', 'The house is too low to cover that payout. Try again soon.');
    }
    throw err;
  }
  await cartelClearDealerPending(guildId, pendingEntries);
  const pool = await getCartelPool(guildId);
  const totalGrams = mgToGrams(totalMg);
  const xpRate = xpPerGramSold(pool);
  const xpGain = Math.floor(totalGrams * xpRate);
  let rankState = null;
  if (xpGain > 0) {
    let investor = await getCartelInvestor(guildId, userId);
    investor = await autoRankIfNeeded(guildId, investor);
    rankState = await applyXpGain(guildId, investor, xpGain);
  }
  await recordCartelTransaction(guildId, userId, 'DEALER_COLLECT', totalChips, totalMg, { dealers: pendingEntries.length });
  return {
    totalChips,
    totalGrams,
    xpGain,
    dealersCollected: pendingEntries.length,
    rank: rankState?.rank,
    rankXp: rankState?.rankXp
  };
}

export async function listUserDealers(guildId, userId) {
  const dealers = await listCartelDealersForUser(guildId, userId);
  return dealers.map(dealer => ({
    ...dealer,
    tierInfo: CARTEL_DEALER_TIERS_BY_ID[dealer.tier] || null
  }));
}

export async function hireCartelDealer(guildId, userId, tierId, trait = null, displayName = null) {
  let investor = await getCartelInvestor(guildId, userId);
  investor = await autoRankIfNeeded(guildId, investor);
  if (!investor) throw new CartelError('CARTEL_PROFILE_MISSING', 'Start investing in the cartel before hiring dealers.');
  const tier = dealerTierOrThrow(tierId);
  if (investor.rank < tier.requiredRank) {
    throw new CartelError('CARTEL_RANK_TOO_LOW', `Rank ${tier.requiredRank} is required for a ${tier.name}.`);
  }
  const dealerCap = dealerCapForRank(investor.rank);
  const existingDealers = await listCartelDealersForUser(guildId, userId);
  if (existingDealers.length >= dealerCap) {
    throw new CartelError(
      'CARTEL_DEALER_CAP',
      `Rank ${investor.rank} investors can manage at most ${dealerCap} dealers. Rank up to unlock more slots.`
    );
  }
  const hireCost = tier.hireCost;
  try {
    await takeFromUserToHouse(guildId, userId, hireCost, `cartel dealer hire (${tier.name})`);
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_USER')) {
      throw new CartelError('CARTEL_NO_CHIPS', 'You do not have enough chips to hire that dealer.');
    }
    throw err;
  }
  const dealerId = crypto.randomUUID();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const upkeepPerHour = Math.round(calculateDealerUpkeepChipsPerHour({
    tier: tier.id,
    hourly_sell_cap_mg: tier.hourlySellCapMg,
    price_multiplier_bps: tier.priceMultiplierBps
  }));
  const dealer = await cartelCreateDealer(guildId, dealerId, userId, {
    tier: tier.id,
    trait: trait || null,
    display_name: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null,
    status: 'ACTIVE',
    hourly_sell_cap_mg: tier.hourlySellCapMg,
    price_multiplier_bps: tier.priceMultiplierBps,
    upkeep_cost: upkeepPerHour,
    upkeep_interval_seconds: tier.upkeepIntervalSeconds,
    upkeep_due_at: nowSeconds + tier.upkeepIntervalSeconds
  });
  await recordCartelTransaction(guildId, userId, 'DEALER_HIRE', hireCost, 0, {
    dealerId,
    tier: tier.id,
    name: tier.name,
    contactName: dealer.display_name || null
  });
  return { ...dealer, tierInfo: tier };
}

export async function payCartelDealerUpkeep(guildId, userId, dealerId, chipAmount) {
  const dealer = await getCartelDealer(guildId, dealerId);
  if (!dealer || dealer.user_id !== String(userId)) {
    throw new CartelError('CARTEL_DEALER_NOT_FOUND', 'Dealer not found.');
  }
  const chips = Math.floor(Number(chipAmount || 0));
  if (!Number.isFinite(chips) || chips <= 0) {
    throw new CartelError('CARTEL_UPKEEP_AMOUNT_REQUIRED', 'Enter the chips you want to spend on upkeep.');
  }
  const secondsPurchased = calculateDealerSecondsPurchased(dealer, chips);
  if (secondsPurchased <= 0) {
    const minChips = minimumUpkeepChips(dealer);
    throw new CartelError('CARTEL_UPKEEP_TOO_LOW', `Spend at least ${chipsAmount(minChips)} chips to buy any time for this dealer.`);
  }
  try {
    await takeFromUserToHouse(guildId, userId, chips, 'cartel dealer upkeep');
  } catch (err) {
    if (isDbError(err, 'INSUFFICIENT_USER')) {
      throw new CartelError('CARTEL_NO_CHIPS', 'You do not have enough chips for that upkeep payment.');
    }
    throw err;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const currentDue = Number(dealer.upkeep_due_at || 0);
  const baseDue = currentDue > nowSeconds ? currentDue : nowSeconds;
  const nextDue = baseDue + secondsPurchased;
  await recordCartelTransaction(guildId, userId, 'DEALER_UPKEEP', chips, 0, { dealerId, secondsPurchased });
  const updated = await cartelSetDealerUpkeep(guildId, dealerId, nextDue, 'ACTIVE');
  return {
    ...updated,
    tierInfo: CARTEL_DEALER_TIERS_BY_ID[updated?.tier] || null,
    secondsPurchased,
    chipsSpent: chips
  };
}

export async function fireCartelDealer(guildId, userId, dealerId) {
  if (!dealerId) {
    throw new CartelError('CARTEL_DEALER_NOT_FOUND', 'Dealer not found.');
  }
  const dealer = await getCartelDealer(guildId, dealerId);
  if (!dealer || dealer.user_id !== String(userId)) {
    throw new CartelError('CARTEL_DEALER_NOT_FOUND', 'Dealer not found.');
  }
  await cartelDeleteDealer(guildId, dealerId);
  await recordCartelTransaction(guildId, userId, 'DEALER_FIRE', 0, 0, {
    dealerId,
    tier: dealer.tier,
    contactName: dealer.display_name || null
  });
  return {
    ...dealer,
    tierInfo: CARTEL_DEALER_TIERS_BY_ID[dealer.tier] || null
  };
}

export async function fireAllCartelDealers(guildId, userId) {
  const dealers = await listCartelDealersForUser(guildId, userId);
  if (!dealers.length) {
    throw new CartelError('CARTEL_NO_DEALERS', 'You have no dealers to fire.');
  }
  await cartelDeleteDealersForUser(guildId, userId);
  await recordCartelTransaction(guildId, userId, 'DEALER_FIRE_ALL', 0, 0, {
    count: dealers.length
  });
  return {
    count: dealers.length,
    dealers: dealers.map(dealer => ({
      ...dealer,
      tierInfo: CARTEL_DEALER_TIERS_BY_ID[dealer.tier] || null
    }))
  };
}

async function runCartelProductionTickForGuild(guildId, nowMs = Date.now()) {
  const state = await loadCartelState(guildId);
  const pool = state.pool;
  const nowSeconds = Math.floor(nowMs / 1000);
  const lastTick = Number(pool?.last_tick_at || 0);
  if (lastTick && nowSeconds - lastTick < CARTEL_MIN_TICK_SECONDS) {
    return { skipped: 'interval' };
  }
  if (!state.activeInvestors.length || state.totalWeight <= 0) {
    await cartelUpdatePoolTick(guildId, nowSeconds, pool?.carryover_mg || 0);
    return { skipped: 'no_investors' };
  }
  const totalWeight = state.totalWeight;
  const rateMg = baseRateMgPerHour(totalWeight, pool);
  const deltaSeconds = lastTick ? Math.max(0, nowSeconds - lastTick) : CARTEL_MIN_TICK_SECONDS;
  const producedMg = Math.floor((rateMg * deltaSeconds) / 3600);
  let availableMg = producedMg + Number(pool?.carryover_mg || 0);
  if (availableMg <= 0) {
    await cartelUpdatePoolTick(guildId, nowSeconds, 0);
    return { skipped: 'no_output' };
  }
  const allocations = [];
  let assigned = 0;
  const investors = state.activeInvestors;
  investors.forEach((inv, idx) => {
    let mgShare = Math.floor((availableMg * inv.weight) / totalWeight);
    if (idx === investors.length - 1) {
      mgShare = Math.max(0, availableMg - assigned);
    }
    assigned += mgShare;
    const currentStash = Number(inv?.stash_mg || 0);
    const capMg = stashCapMgForRank(inv.rank);
    let newStash = currentStash + mgShare;
    let overflow = 0;
    if (newStash > capMg) {
      overflow = newStash - capMg;
      newStash = capMg;
    }
    const newWarehouse = Number(inv?.warehouse_mg || 0) + overflow;
    const gramsProduced = mgToGrams(mgShare);
    const xpGain = Math.floor(gramsProduced * CARTEL_XP_PER_GRAM_PRODUCED);
    const rankState = applyRankProgress(inv.rank, inv.rank_xp, xpGain);
    allocations.push({
      userId: inv.user_id,
      stashMg: newStash,
      warehouseMg: newWarehouse,
      rank: rankState.rank,
      rankXp: rankState.rankXp
    });
  });
  const leftover = Math.max(0, availableMg - assigned);
  await cartelApplyProduction(guildId, allocations, { lastTickAt: nowSeconds, carryoverMg: leftover });
  const dealerResult = await runDealerAutoSales(guildId, nowSeconds, deltaSeconds);
  return {
    processed: allocations.length,
    producedMg: assigned,
    leftoverMg: leftover,
    deltaSeconds,
    dealerSales: dealerResult?.sales || 0
  };
}

export async function runCartelProductionTick(guildId = null, nowMs = Date.now()) {
  if (!guildId) {
    const guildIds = await listCartelGuildIds();
    if (!guildIds.length) {
      return { skipped: 'no_guilds' };
    }
    const results = [];
    for (const gid of guildIds) {
      try {
        const res = await runCartelProductionTickForGuild(gid, nowMs);
        results.push({ guildId: gid, ...res });
      } catch (err) {
        console.error('Cartel worker tick failed for guild', gid, err);
      }
    }
    return { guildsProcessed: results.length, results };
  }
  return runCartelProductionTickForGuild(guildId, nowMs);
}

export function startCartelWorker(guildId = null) {
  const interval = CARTEL_TICK_INTERVAL_MS;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runCartelProductionTick(guildId);
    } catch (err) {
      console.error('Cartel worker tick failed', err);
    } finally {
      running = false;
    }
  };
  run().catch(() => {});
  return setInterval(run, interval);
}

export function buildRankTableEmbed(highlightRank = null) {
  const table = rankXpTable();
  const fmt = new Intl.NumberFormat('en-US');
  const embed = new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(`${emoji('sparkles')} Cartel Rank XP`);
  const lines = table.map(entry => {
    const xpToNext = Math.max(0, Number(entry.xpToNext || 0));
    const xpToReach = Math.max(0, Number(entry.xpToReach || 0));
    const stashCap = fmt.format(entry.stashCap);
    const xpNeededText = xpToNext > 0
      ? `${fmt.format(xpToNext)} XP to Rank ${entry.rank + 1} (total ${fmt.format(xpToReach)} XP)`
      : 'MAX Rank';
    const baseLine = `**Rank ${entry.rank}** — ${xpNeededText}, Stash Cap: ${stashCap}g`;
    if (highlightRank && entry.rank === Number(highlightRank)) {
      return `> ${emoji('sparkles')} ${baseLine}`;
    }
    return baseLine;
  });
  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: 'Your current rank is highlighted.' });
  return embed;
}
async function autoRankIfNeeded(guildId, investor) {
  if (!investor) return null;
  const currentRank = Number(investor.rank ?? investor.rank ?? 1);
  const currentXp = Number(investor.rank_xp ?? investor.rankXp ?? 0);
  const result = applyRankProgress(currentRank, currentXp, 0);
  if (result.rank !== currentRank || result.rankXp !== currentXp) {
    await cartelSetRankAndXp(guildId, investor.user_id, result.rank, result.rankXp);
    return { ...investor, rank: result.rank, rank_xp: result.rankXp };
  }
  return investor;
}

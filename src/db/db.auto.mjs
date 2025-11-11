// Environment-driven DB selector: Postgres (Cloud SQL) or SQLite
import 'dotenv/config';

const usePg = (process.env.DB_DRIVER || '').toLowerCase() === 'pg' || !!process.env.DATABASE_URL;
const impl = usePg
  ? await import('./db.pg.mjs')
  : await import('./db.mjs'); // SQLite default

// Utility to map function names safely (fallbacks for minor naming drifts)
function pick(name, ...alts) {
  for (const k of [name, ...alts]) {
    if (impl[k]) return impl[k];
  }
  return undefined;
}

// --- Common exports used across the app ---
export const getModerators = pick('getModerators');
export const addModerator = pick('addModerator');
export const removeModerator = pick('removeModerator');
export const getAdmins = pick('getAdmins');
export const addAdmin = pick('addAdmin');
export const removeAdmin = pick('removeAdmin');
export const getLastDailySpinAt = pick('getLastDailySpinAt');
export const setLastDailySpinNow = pick('setLastDailySpinNow');

export const getGuildSettings = pick('getGuildSettings');
export const setGameLogChannel = pick('setGameLogChannel');
export const setCashLogChannel = pick('setCashLogChannel');
export const setRequestChannel = pick('setRequestChannel');
export const setUpdateChannel = pick('setUpdateChannel');
export const setRequestTimer = pick('setRequestTimer');
export const setMaxRidebusBet = pick('setMaxRidebusBet');
export const setDefaultHoldemRake = pick('setDefaultHoldemRake');
export const setCasinoCategory = pick('setCasinoCategory');
export const setKittenMode = pick('setKittenMode');
export const isKittenModeEnabled = pick('isKittenModeEnabled');

// API keys: normalize naming differences between adapters
const _lookupApiKey = pick('lookupApiKey', 'getApiKey');
export async function lookupApiKey(token) { return _lookupApiKey(token); }
const _createApiKey = pick('createApiKey', 'insertApiKey');
export async function createApiKey({ token, guildId, scopes }) { return _createApiKey.length === 3 ? _createApiKey(token, guildId, scopes || '') : _createApiKey({ token, guildId, scopes }); }
export const deleteApiKey = pick('deleteApiKey');
export const listApiKeys = pick('listApiKeys');

// Active requests
export const getActiveRequest = pick('getActiveRequest');
export const createActiveRequest = pick('createActiveRequest');
export const updateActiveRequestStatus = pick('updateActiveRequestStatus');
export const clearActiveRequest = pick('clearActiveRequest');
export const getLastRequestAt = pick('getLastRequestAt');
export const setLastRequestNow = pick('setLastRequestNow');

// Users & house
export const getUserBalances = pick('getUserBalances');
export const getTopUsers = pick('getTopUsers');
export const getHouseBalance = pick('getHouseBalance');
export const getCasinoNetworth = pick('getCasinoNetworth');
export const getGlobalPlayerCount = pick('getGlobalPlayerCount');
export const listAllUserIds = pick('listAllUserIds');
export const setBotStatusSnapshot = pick('setBotStatusSnapshot');
export const getBotStatusSnapshot = pick('getBotStatusSnapshot');
export const getUserNewsSettings = pick('getUserNewsSettings');
export const setUserNewsOptIn = pick('setUserNewsOptIn');
export const markUserNewsDelivered = pick('markUserNewsDelivered');
export const markUserFirstGameWin = pick('markUserFirstGameWin');
export const addToHouse = pick('addToHouse');
export const removeFromHouse = pick('removeFromHouse');
export const transferFromHouseToUser = pick('transferFromHouseToUser');
export const takeFromUserToHouse = pick('takeFromUserToHouse');
export const burnFromUser = pick('burnFromUser');
export const mintChips = pick('mintChips');
export const getUserOnboardingStatus = pick('getUserOnboardingStatus');
export const grantUserOnboardingBonus = pick('grantUserOnboardingBonus');
export const markUserOnboardingAcknowledged = pick('markUserOnboardingAcknowledged');
export const recordUserInteraction = pick('recordUserInteraction');
export const getUserInteractionStats = pick('getUserInteractionStats');
export const markUserInteractionReviewPrompt = pick('markUserInteractionReviewPrompt');
export const recordVoteReward = pick('recordVoteReward');
export const getPendingVoteRewards = pick('getPendingVoteRewards');
export const redeemVoteRewards = pick('redeemVoteRewards');
export const listUsersWithPendingVoteRewards = pick('listUsersWithPendingVoteRewards');
export const grantCredits = pick('grantCredits');
export const burnCredits = pick('burnCredits');
export const gameLoseWithCredits = pick('gameLoseWithCredits');
export const gameWinWithCredits = pick('gameWinWithCredits');
export const eraseUserData = pick('eraseUserData');

// Jobs
export const ensureJobProfile = pick('ensureJobProfile');
export const getJobProfile = pick('getJobProfile');
export const listJobProfilesForUser = pick('listJobProfilesForUser');
export const updateJobProfile = pick('updateJobProfile');
export const getJobStatus = pick('getJobStatus');
export const setJobStatus = pick('setJobStatus');
export const createJobShift = pick('createJobShift');
export const completeJobShift = pick('completeJobShift');
export const getJobShiftById = pick('getJobShiftById');
export const listJobShiftsForUser = pick('listJobShiftsForUser');

// Cartel passive system
export const getCartelPool = pick('getCartelPool');
export const listCartelGuildIds = pick('listCartelGuildIds');
export const setCartelSharePrice = pick('setCartelSharePrice');
export const setCartelShareRate = pick('setCartelShareRate');
export const listCartelInvestors = pick('listCartelInvestors');
export const getCartelInvestor = pick('getCartelInvestor');
export const cartelAddShares = pick('cartelAddShares');
export const cartelRemoveShares = pick('cartelRemoveShares');
export const cartelSetHoldings = pick('cartelSetHoldings');
export const cartelSetRankAndXp = pick('cartelSetRankAndXp');
export const cartelSetAutoSellRule = pick('cartelSetAutoSellRule');
export const cartelResetInvestor = pick('cartelResetInvestor');
export const cartelApplyProduction = pick('cartelApplyProduction');
export const cartelUpdatePoolTick = pick('cartelUpdatePoolTick');
export const recordCartelTransaction = pick('recordCartelTransaction');
export const createCartelMarketOrder = pick('createCartelMarketOrder');
export const listCartelMarketOrders = pick('listCartelMarketOrders');
export const listCartelMarketOrdersForUser = pick('listCartelMarketOrdersForUser');
export const getCartelMarketOrder = pick('getCartelMarketOrder');
export const setCartelMarketOrderStatus = pick('setCartelMarketOrderStatus');
export const setCartelMarketOrderShares = pick('setCartelMarketOrderShares');
export const cartelCreateDealer = pick('cartelCreateDealer');
export const listCartelDealers = pick('listCartelDealers');
export const listCartelDealersForUser = pick('listCartelDealersForUser');
export const getCartelDealer = pick('getCartelDealer');
export const cartelSetDealerStatus = pick('cartelSetDealerStatus');
export const cartelSetDealerUpkeep = pick('cartelSetDealerUpkeep');
export const cartelRecordDealerSale = pick('cartelRecordDealerSale');
export const cartelDeleteDealer = pick('cartelDeleteDealer');
export const cartelDeleteDealersForUser = pick('cartelDeleteDealersForUser');
export const cartelAddDealerPending = pick('cartelAddDealerPending');
export const cartelClearDealerPending = pick('cartelClearDealerPending');
export const setCartelXpPerGram = pick('setCartelXpPerGram');

// Hold'em escrow and hands
export const ensureHoldemTable = pick('ensureHoldemTable');
export const createHoldemHand = pick('createHoldemHand');
export const getEscrowBalance = pick('getEscrowBalance');
export const escrowAdd = pick('escrowAdd');
export const escrowReturn = pick('escrowReturn');
export const escrowCommit = pick('escrowCommit');
export const settleRake = pick('settleRake');
export const finalizeHoldemHand = pick('finalizeHoldemHand');
export const listEscrowForTable = pick('listEscrowForTable');

// In SQLite, escrowCreditMany is an alias of escrowPayoutMany; normalize here
const _escrowCreditMany = pick('escrowCreditMany', 'escrowPayoutMany');
export async function escrowCreditMany(tableId, payouts) { return _escrowCreditMany(tableId, payouts); }

// Maintenance
export const resetAllBalances = pick('resetAllBalances');

// Helpful to know what backend is active
export const __DB_DRIVER = usePg ? 'pg' : 'sqlite';

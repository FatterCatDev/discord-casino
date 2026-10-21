import {
  slotSessions,
  buildSlotsPaytableEmbed as buildSlotsPaytableEmbedMod,
  runSlotsSpin as runSlotsSpinMod,
  SLOTS_LINES as SLOTS_LINESMod
} from '../games/slots.mjs';
import {
  rouletteSessions,
  rouletteSummaryEmbed as rouletteSummaryEmbedMod,
  rouletteTypeSelectRow as rouletteTypeSelectRowMod,
  startRouletteSession as startRouletteSessionMod,
  spinRoulette as spinRouletteMod,
  rouletteWins as rouletteWinsMod,
  roulettePayoutMult as roulettePayoutMultMod
} from '../games/roulette.mjs';
import {
  ridebusGames,
  startRideBus as startRideBusMod,
  wagerAt as wagerAtMod,
  embedForState as embedForStateMod,
  rowButtons as rowButtonsMod,
  playAgainRow as playAgainRowMod,
  cardList as cardListMod
} from '../games/ridebus.mjs';
import { show as showCard, color as colorCard, val as valCard } from '../games/cards.mjs';
import {
  bjEmbed as bjEmbedMod,
  bjPlayAgainRow as bjPlayAgainRowMod,
  startBlackjack as startBlackjackMod,
  blackjackGames,
  bjHandValue as bjHandValueMod,
  cardValueForSplit as cardValueForSplitMod,
  canAffordExtra as canAffordExtraMod
} from '../games/blackjack.mjs';
import {
  getUserBalances,
  transferFromHouseToUser,
  mintChips,
  getHouseBalance,
  takeFromUserToHouse,
  burnCredits
} from '../db/db.auto.mjs';
import { formatChips, chipsAmount } from '../games/format.mjs';
import {
  activeSessions,
  getActiveSession,
  setActiveSession,
  touchActiveSession,
  addHouseNet,
  recordSessionGame,
  sendGameMessage,
  buildPlayerBalanceField,
  clearActiveSession,
  hasActiveExpired,
  keyFor,
  burnUpToCredits,
  endActiveSessionForUser,
  buildTimeoutField
} from '../games/session.mjs';
import { postGameSessionEnd as postGameSessionEndMod, postCashLog as postCashLogMod } from '../games/logging.mjs';
import { kittenizeTextContent, kittenizeReplyArg } from '../services/persona.mjs';
import { BOT_VERSION, pushUpdateAnnouncement } from '../services/updates.mjs';
import { OWNER_USER_IDS } from './config.mjs';
import { getGuildSettingsCached } from './caches.mjs';
import { hasOwnerOverride, adminsForGuild, moderatorsForGuild, isAdmin, isModerator } from './access.mjs';

export function createCommandContext(client) {
  function buildCommandContext(interaction, extras = {}) {
    const guildId = interaction?.guild?.id || null;
    let kittenModeFlag = typeof extras.kittenMode === 'boolean' ? extras.kittenMode : null;
    const sessionCleanupPromise = extras?.sessionCleanupPromise || null;
    const waitForSessionCleanup = async () => {
      if (!sessionCleanupPromise) return;
      await sessionCleanupPromise;
    };

    const ensureKittenMode = async () => {
      if (typeof kittenModeFlag === 'boolean') return kittenModeFlag;
      if (!guildId) return false;
      try {
        const settings = await getGuildSettingsCached(guildId);
        kittenModeFlag = !!(settings && settings.kitten_mode_enabled);
        return kittenModeFlag;
      } catch {
        return false;
      }
    };

    const kittenizeIfNeeded = (value) => {
      if (kittenModeFlag === true) return kittenizeTextContent(value);
      return value;
    };

    const kittenizePayloadIfNeeded = (payload) => {
      if (kittenModeFlag === true) return kittenizeReplyArg(payload);
      return payload;
    };

    const kittenizeLines = (lines) => {
      if (!kittenModeFlag) return lines;
      if (Array.isArray(lines)) return lines.map(item => kittenizeReplyArg(item));
      return kittenizeReplyArg(lines);
    };

    const wrappedPostCashLog = async (interaction, lines) => {
      const ensure = await ensureKittenMode();
      const payload = ensure ? kittenizeLines(lines) : lines;
      return postCashLogMod(interaction, payload);
    };

    const wrappedSendGameMessage = async (interaction, payload, mode = 'auto') => {
      const ensure = await ensureKittenMode();
      const transformed = ensure ? kittenizePayloadIfNeeded(payload) : payload;
      return sendGameMessage(interaction, transformed, mode);
    };

    return {
      isModerator,
      isAdmin,
      listModerators: () => moderatorsForGuild(guildId),
      listAdmins: () => adminsForGuild(guildId),
      hasOwnerOverride,
      ownerUserIds: OWNER_USER_IDS,
      chipsAmount,
      formatChips,
      postCashLog: wrappedPostCashLog,
      // DB helpers
      getUserBalances: (userId) => getUserBalances(guildId, userId),
      burnCredits: (userId, amount, reason, adminId) => burnCredits(guildId, userId, amount, reason, adminId),
      getHouseBalance: () => getHouseBalance(guildId),
      mintChips: (userId, amount, reason, adminId) => mintChips(guildId, userId, amount, reason, adminId),
      transferFromHouseToUser: (userId, amount, reason, adminId) => transferFromHouseToUser(guildId, userId, amount, reason, adminId),
      takeFromUserToHouse: (userId, amount, reason, adminId) => takeFromUserToHouse(guildId, userId, amount, reason, adminId),
      // Session helpers and state
      keyFor,
      getActiveSession,
      setActiveSession,
      touchActiveSession,
      hasActiveExpired,
      clearActiveSession,
      activeSessions,
      // Game state maps
      ridebusGames,
      blackjackGames,
      rouletteSessions,
      slotSessions,
      // Message helpers
      sendGameMessage: wrappedSendGameMessage,
      // Shared UI builders
      rowButtons: (ids, opts = {}) => rowButtonsMod(ids, { ...opts, kittenMode: (opts?.kittenMode ?? kittenModeFlag) === true }),
      embedForState: async (state, opts = {}) => {
        const km = (opts?.kittenMode !== undefined)
          ? opts.kittenMode
          : (state?.kittenMode !== undefined
              ? state.kittenMode
              : await ensureKittenMode());
        return embedForStateMod(state, { ...opts, kittenMode: km === true });
      },
      playAgainRow: (bet, userId, opts = {}) => playAgainRowMod(bet, userId, { ...opts, kittenMode: (opts?.kittenMode ?? kittenModeFlag) === true }),
      buildPlayerBalanceField,
      buildTimeoutField,
      bjEmbed: bjEmbedMod,
      bjPlayAgainRow: bjPlayAgainRowMod,
      bjHandValue: bjHandValueMod,
      cardValueForSplit: cardValueForSplitMod,
      canAffordExtra: (userId, amount) => canAffordExtraMod(guildId, userId, amount),
      rouletteSummaryEmbed: rouletteSummaryEmbedMod,
      rouletteTypeSelectRow: rouletteTypeSelectRowMod,
      buildSlotsPaytableEmbed: buildSlotsPaytableEmbedMod,
      // Game engines/helpers
      wagerAt: wagerAtMod,
      show: showCard,
      cardList: cardListMod,
      color: colorCard,
      val: valCard,
      spinRoulette: spinRouletteMod,
      rouletteWins: rouletteWinsMod,
      roulettePayoutMult: roulettePayoutMultMod,
      SLOTS_LINES: SLOTS_LINESMod,
      // Logging
      postGameSessionEnd: postGameSessionEndMod,
      addHouseNet,
      recordSessionGame,
      burnUpToCredits: (userId, stake, reason) => burnUpToCredits(guildId, userId, stake, reason),
      endActiveSessionForUser,
      awaitSessionCleanup: waitForSessionCleanup,
      startRideBus: async (interaction, bet) => {
        return startRideBusMod(interaction, bet, {
          kittenMode: await ensureKittenMode(),
          kittenizeText: kittenizeIfNeeded,
          kittenizePayload: kittenizePayloadIfNeeded
        });
      },
      startBlackjack: async (interaction, table, bet) => {
        return startBlackjackMod(interaction, table, bet);
      },
      runSlotsSpin: async (interaction, bet, key) => {
        return runSlotsSpinMod(interaction, bet, key);
      },
      startRouletteSession: async (interaction) => {
        return startRouletteSessionMod(interaction);
      },
      guildId,
      kittenModeEnabled: kittenModeFlag,
      isKittenModeEnabled: ensureKittenMode,
      kittenizeText: kittenizeIfNeeded,
      kittenizePayload: kittenizePayloadIfNeeded,
      pushUpdateAnnouncement: (details = {}) => {
        if (!guildId) throw new Error('UPDATE_PUSH_REQUIRES_GUILD');
        return pushUpdateAnnouncement(client, guildId, details);
      },
      botVersion: BOT_VERSION
    };
  }
  return buildCommandContext;
}


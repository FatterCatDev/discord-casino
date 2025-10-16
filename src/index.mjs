import { Client, GatewayIntentBits, Events, EmbedBuilder, MessageFlags, AuditLogEvent } from 'discord.js';
import { slotSessions, buildSlotsPaytableEmbed as buildSlotsPaytableEmbedMod, runSlotsSpin as runSlotsSpinMod, SLOTS_LINES as SLOTS_LINESMod } from './games/slots.mjs';
import { rouletteSessions, rouletteSummaryEmbed as rouletteSummaryEmbedMod, rouletteTypeSelectRow as rouletteTypeSelectRowMod, startRouletteSession as startRouletteSessionMod, spinRoulette as spinRouletteMod, rouletteWins as rouletteWinsMod, roulettePayoutMult as roulettePayoutMultMod } from './games/roulette.mjs';
import { ridebusGames, startRideBus as startRideBusMod, wagerAt as wagerAtMod } from './games/ridebus.mjs';
import { embedForState as embedForStateMod, rowButtons as rowButtonsMod, playAgainRow as playAgainRowMod, cardList as cardListMod } from './games/ridebus.mjs';
import { show as showCard, color as colorCard, val as valCard } from './games/cards.mjs';
import { bjEmbed as bjEmbedMod, bjPlayAgainRow as bjPlayAgainRowMod, startBlackjack as startBlackjackMod } from './games/blackjack.mjs';
import { blackjackGames } from './games/blackjack.mjs';
import 'dotenv/config';
import {
  getUserBalances,
  transferFromHouseToUser,
  getHouseBalance,
  getModerators,
  getAdmins,
  takeFromUserToHouse,
  burnCredits
} from './db/db.auto.mjs';
import { formatChips, chipsAmount } from './games/format.mjs';
import {
  autoRedeemPendingVoteRewards,
  describeBreakdown
} from './services/votes.mjs';
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
} from './games/session.mjs';
import { postGameSessionEnd as postGameSessionEndMod, sweepExpiredSessions as sweepExpiredSessionsMod, postCashLog as postCashLogMod } from './games/logging.mjs';
import { getGuildSettings, listEscrowForTable, escrowReturn } from './db/db.auto.mjs';
import { holdemTables } from './games/holdem.mjs';
import { bjHandValue as bjHandValueMod, cardValueForSplit as cardValueForSplitMod, canAffordExtra as canAffordExtraMod } from './games/blackjack.mjs';
import { kittenizeTextContent, kittenizeReplyArg } from './services/persona.mjs';
import { BOT_VERSION, pushUpdateAnnouncement } from './services/updates.mjs';
import { emoji } from './lib/emojis.mjs';

// Slash command handlers (modularized)
import cmdPing from './commands/ping.mjs';
import cmdStatus from './commands/status.mjs';
import cmdBalance from './commands/balance.mjs';
import cmdJob from './commands/job.mjs';
import cmdHouseBalance from './commands/housebalance.mjs';
import cmdHouseAdd from './commands/houseadd.mjs';
import cmdGiveChips from './commands/givechips.mjs';
import cmdHouseRemove from './commands/houseremove.mjs';
import cmdBuyIn from './commands/buyin.mjs';
import cmdTakeChips from './commands/takechips.mjs';
import cmdCashOut from './commands/cashout.mjs';
import cmdLeaderboard from './commands/leaderboard.mjs';
import cmdGiveCredits from './commands/givecredits.mjs';
import cmdTakeCredits from './commands/takecredits.mjs';
import cmdSetGameLogChannel from './commands/setgamelogchannel.mjs';
import cmdSetCashLog from './commands/setcashlog.mjs';
import cmdSetRequestChannel from './commands/setrequestchannel.mjs';
import cmdSetUpdateChannel from './commands/setupdatech.mjs';
import cmdRequestTimer from './commands/requesttimer.mjs';
import cmdRequest from './commands/request.mjs';
import cmdHelp from './commands/help.mjs';
import cmdAddMod from './commands/addmod.mjs';
import cmdRemoveMod from './commands/removemod.mjs';
import cmdAddAdmin from './commands/addadmin.mjs';
import cmdRemoveAdmin from './commands/removeadmin.mjs';
import cmdStaffList from './commands/stafflist.mjs';
import cmdDailySpin from './commands/dailyspin.mjs';
import cmdRideBus from './commands/ridebus.mjs';
import cmdBlackjack from './commands/blackjack.mjs';
import cmdSlots from './commands/slots.mjs';
import cmdRoulette from './commands/roulette.mjs';
import cmdHoldem from './commands/holdem.mjs';
import cmdDiceWar from './commands/dicewar.mjs';
import cmdHorseRace from './commands/horserace.mjs';
import cmdSetRake from './commands/setrake.mjs';
import cmdSetMaxBet from './commands/setmaxbet.mjs';
import cmdResetAllBalance from './commands/resetallbalance.mjs';
import cmdSetCasinoCategory from './commands/setcasinocategory.mjs';
import cmdKittenMode from './commands/kittenmode.mjs';
import cmdVote from './commands/vote.mjs';

// Interaction handlers
import onHelpSelect from './interactions/helpSelect.mjs';
import onRequestButtons from './interactions/requestButtons.mjs';
import onRequestRejectModal from './interactions/requestRejectModal.mjs';

const OWNER_USER_IDS = Array.from(new Set([
  '94915805375889408',
  ...(process.env.OWNER_USER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
]));


// Session tracking (in-memory per bot runtime)
// NOTE: We surface current session stats from activeSessions (below).
const sessionStats = new Map(); // key: `${guildId}:${userId}` -> { games: number, net: number }

function sessionKey(guildId, userId) { return `${guildId}:${userId}`; }
function getSessionStats(guildId, userId) {
  const k = sessionKey(guildId, userId);
  if (!sessionStats.has(k)) sessionStats.set(k, { games: 0, net: 0 });
  return sessionStats.get(k);
}

const RESPONSE_PATCHED = Symbol('responsePatched');
let voteRewardProcessing = false;

process.on('unhandledRejection', (reason) => {
  if (reason && typeof reason === 'object' && 'code' in reason && Number(reason.code) === 10062) {
    console.warn('Ignored expired interaction (code 10062)');
    return;
  }
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

function normalizeEphemeralOption(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'ephemeral')) return payload;

  const cloned = { ...payload };
  const { ephemeral } = cloned;
  delete cloned.ephemeral;

  if (ephemeral) {
    const currentFlags = typeof cloned.flags === 'number' ? cloned.flags : 0;
    cloned.flags = currentFlags | MessageFlags.Ephemeral;
  }
  return cloned;
}

function patchInteractionResponseMethods(interaction) {
  if (!interaction || interaction[RESPONSE_PATCHED]) return;
  const methods = ['reply', 'editReply', 'followUp', 'update', 'deferReply', 'deferUpdate'];
  for (const method of methods) {
    if (typeof interaction[method] !== 'function') continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = (...args) => {
      if (args.length > 0) {
        const next = normalizeEphemeralOption(args[0]);
        if (next !== args[0]) args[0] = next;
      }
      return original(...args);
    };
  }
  interaction[RESPONSE_PATCHED] = true;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});
client.botVersion = BOT_VERSION;
client.pushUpdateAnnouncement = (guildId, details = {}) => pushUpdateAnnouncement(client, guildId, details);

const OWNER_USER_SET = new Set(OWNER_USER_IDS);

async function findBotInviter(guild) {
  if (!guild || !guild.client?.user) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entry = logs.entries.find(logEntry => logEntry.target?.id === guild.client.user.id);
    if (entry?.executor) {
      try {
        return await guild.client.users.fetch(entry.executor.id);
      } catch {
        return entry.executor;
      }
    }
  } catch (err) {
    console.warn(`Could not resolve bot inviter for guild ${guild?.id}`, err);
  }
  return null;
}

function buildGuildWelcomeMessage(inviter, guild) {
  const displayName = inviter?.globalName || inviter?.username || 'there';
  const guildName = guild?.name ? ` to ${guild.name}` : '';
  return [
    `Hey ${displayName}! Thanks for inviting Casino Bot${guildName}.`,
    '',
    'Casino Bot runs a single global economy shared across every server, so balances, jobs, and ledgers follow players everywhere.',
    '',
    'Quick setup checklist:',
    '1. Run `/setcasinocategory category:<#Category>` so all games live in a dedicated channel group.',
    '2. Confirm the bot can Send Messages, Embed Links, Manage Channels, and Read Message History in that category.',
    '3. (Optional) Point the log channels if you want detailed embeds elsewhere:',
    '   - `/setgamelogchannel channel:<#channel>` for game summaries',
    '   - `/setcashlog channel:<#channel>` for chip and cash ledger updates',
    '   - `/setrequestchannel channel:<#channel>` for buy-in and cash-out tickets',
    '   - `/setupdatech channel:<#channel>` for release announcements',
    '4. Moderator and admin access is managed by the development team to protect the shared economy—reach out if you need roster changes.',
    '5. Use `/help` any time for the full command list and extra guidance.',
    '',
    'Once those are set, your players can jump straight into `/slots`, `/blackjack`, `/roulette`, and more. Have fun!'
  ].join('\n');
}

function hasOwnerOverride(userId) {
  return !!(userId && OWNER_USER_SET.has(String(userId)));
}

async function adminsForGuild(guildId) {
  const ids = await getAdmins(guildId);
  return ids.map(id => String(id));
}

async function moderatorsForGuild(guildId) {
  const ids = await getModerators(guildId);
  return ids.map(id => String(id));
}

async function hasAdminAccess(guildId, userId) {
  if (!userId) return false;
  if (hasOwnerOverride(userId)) return true;
  if (!guildId) return false;
  const admins = await adminsForGuild(guildId);
  return admins.includes(String(userId));
}

async function hasModeratorAccess(guildId, userId) {
  if (!userId) return false;
  if (await hasAdminAccess(guildId, userId)) return true;
  if (!guildId) return false;
  const moderators = await moderatorsForGuild(guildId);
  return moderators.includes(String(userId));
}

async function isAdmin(interaction) {
  try {
    const guildId = interaction.guild?.id || null;
    const userId = interaction.user?.id || null;
    return await hasAdminAccess(guildId, userId);
  } catch {
    return false;
  }
}

async function isModerator(interaction) {
  try {
    const guildId = interaction.guild?.id || null;
    const userId = interaction.user?.id || null;
    return await hasModeratorAccess(guildId, userId);
  } catch {
    return false;
  }
}

client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  // Periodically sweep inactive game sessions and finalize them
  setInterval(() => { sweepExpiredSessionsMod(client).catch(() => {}); }, 15 * 1000);
  // On startup, sweep orphan Hold'em table channels under the casino category
  (async () => {
    try {
      for (const [guildId] of client.guilds.cache) {
        const settings = await getGuildSettings(guildId);
        const catId = settings?.casino_category_id;
        if (!catId) continue;
        const guild = await client.guilds.fetch(guildId).catch(()=>null);
        if (!guild) continue;
        const channels = await guild.channels.fetch().catch(()=>null);
        if (!channels) continue;
        const activeIds = new Set(Array.from(holdemTables.values()).map(st => st.channelId));
        for (const ch of channels.values()) {
          if (!ch || !ch.isTextBased?.() || ch.parentId !== catId) continue;
          if (!/^holdem-table-\d+$/.test(ch.name)) continue;
          if (activeIds.has(ch.id)) continue; // tracked table, skip
          try {
            const escrows = await listEscrowForTable(ch.id) || [];
            for (const row of escrows) {
              try { if ((row.balance||0) > 0) await escrowReturn(ch.id, row.user_id, row.balance||0); } catch {}
            }
          } catch {}
          try { if (ch.deletable) await ch.delete('Cleanup orphan Hold’em table'); } catch {}
        }
      }
    } catch {}
  })();

  const intervalMs = Math.max(5_000, Number(process.env.VOTE_REWARD_AUTO_INTERVAL_MS || 15_000));
  const sweepVoteRewards = async () => {
    if (voteRewardProcessing) return;
    voteRewardProcessing = true;
    try {
      const results = await autoRedeemPendingVoteRewards();
      for (const entry of results) {
        if (!entry || entry.error || !(entry.claimedTotal > 0)) {
          if (entry?.error) {
            console.error('Auto vote reward redeem failed for', entry.userId, entry.error);
          }
          continue;
        }
        try {
          const user = await client.users.fetch(entry.userId);
          const amount = formatChips(entry.claimedTotal || 0);
          const breakdownText = describeBreakdown(entry.breakdown || []);
          const sources = breakdownText || 'your recent votes';
          const message = `${emoji('partyPopper')} Thanks for voting (${sources})! I just credited **${amount}** to your chips.`;
          await user.send(message);
        } catch (err) {
          console.error('Failed to DM vote reward notice', entry.userId, err);
        }
      }
    } catch (err) {
      console.error('Failed to auto redeem vote rewards', err);
    } finally {
      voteRewardProcessing = false;
    }
  };

  sweepVoteRewards().catch(() => {});
  setInterval(() => { sweepVoteRewards().catch(() => {}); }, intervalMs);

});

client.on(Events.GuildCreate, async (guild) => {
  try {
    const inviter = await findBotInviter(guild);
    if (!inviter) {
      console.warn(`Skipping welcome DM: no inviter found for guild ${guild?.id}`);
      return;
    }
    const message = buildGuildWelcomeMessage(inviter, guild);
    await inviter.send({ content: message });
    const identifier = inviter.tag || inviter.username || inviter.id;
    console.log(`Sent setup DM to ${identifier} for guild ${guild?.id}`);
  } catch (err) {
    console.error(`Failed to send welcome DM for guild ${guild?.id}`, err);
  }
});

// Command registry and context for modular handlers
const KITTEN_PATCHED = Symbol('kittenModePatched');

function applyKittenModeToInteraction(interaction) {
  if (!interaction || interaction[KITTEN_PATCHED]) return;
  const methods = ['reply', 'editReply', 'followUp', 'update'];
  for (const method of methods) {
    if (typeof interaction[method] !== 'function') continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = (...args) => {
      if (args.length > 0) {
        args[0] = kittenizeReplyArg(args[0]);
      }
      return original(...args);
    };
  }
  interaction[KITTEN_PATCHED] = true;
}

function buildCommandContext(interaction, extras = {}) {
  const guildId = interaction?.guild?.id || null;
  let kittenModeFlag = typeof extras.kittenMode === 'boolean' ? extras.kittenMode : null;

  const ensureKittenMode = async () => {
    if (typeof kittenModeFlag === 'boolean') return kittenModeFlag;
    if (!guildId) return false;
    try {
      const settings = await getGuildSettings(guildId);
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
    startRideBus: async (interaction, bet) => startRideBusMod(interaction, bet, {
      kittenMode: await ensureKittenMode(),
      kittenizeText: kittenizeIfNeeded,
      kittenizePayload: kittenizePayloadIfNeeded
    }),
    startBlackjack: (interaction, table, bet) => startBlackjackMod(interaction, table, bet),
    runSlotsSpin: (interaction, bet, key) => runSlotsSpinMod(interaction, bet, key),
    startRouletteSession: async (interaction) => startRouletteSessionMod(interaction),
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

const commandHandlers = {
  ping: cmdPing,
  status: cmdStatus,
  balance: cmdBalance,
  job: cmdJob,
  housebalance: cmdHouseBalance,
  houseadd: cmdHouseAdd,
  givechips: cmdGiveChips,
  houseremove: cmdHouseRemove,
  buyin: cmdBuyIn,
  takechips: cmdTakeChips,
  cashout: cmdCashOut,
  leaderboard: cmdLeaderboard,
  givecredits: cmdGiveCredits,
  takecredits: cmdTakeCredits,
  setgamelogchannel: cmdSetGameLogChannel,
  setcashlog: cmdSetCashLog,
  setrequestchannel: cmdSetRequestChannel,
  setupdatech: cmdSetUpdateChannel,
  requesttimer: cmdRequestTimer,
  request: cmdRequest,
  help: cmdHelp,
  addmod: cmdAddMod,
  removemod: cmdRemoveMod,
  addadmin: cmdAddAdmin,
  removeadmin: cmdRemoveAdmin,
  dailyspin: cmdDailySpin,
  stafflist: cmdStaffList,
  ridebus: cmdRideBus,
  blackjack: cmdBlackjack,
  slots: cmdSlots,
  roulette: cmdRoulette,
  holdem: cmdHoldem,
  dicewar: cmdDiceWar,
  horserace: cmdHorseRace,
  setrake: cmdSetRake,
  setmaxbet: cmdSetMaxBet,
  resetallbalance: cmdResetAllBalance,
  setcasinocategory: cmdSetCasinoCategory,
  kittenmode: cmdKittenMode,
  vote: cmdVote
};

client.on(Events.InteractionCreate, async interaction => {
  try {
    patchInteractionResponseMethods(interaction);
    const guildId = interaction.guild?.id || null;
    let kittenModeEnabled = false;
    if (guildId) {
      try {
        const settings = await getGuildSettings(guildId);
        kittenModeEnabled = !!(settings && settings.kitten_mode_enabled);
      } catch (err) {
        console.error('Failed to read kitten mode setting:', err);
      }
    }
    if (kittenModeEnabled) applyKittenModeToInteraction(interaction);
    const ctxExtras = { kittenMode: kittenModeEnabled };

    // ========== SLASH COMMANDS ==========
      if (interaction.isChatInputCommand()) {
      // End any existing active game session when a new command is run.
      // Don't await this cleanup so the slash command can acknowledge within Discord's 3s window.
      endActiveSessionForUser(interaction, 'new_command').catch(err => {
        console.error('endActiveSessionForUser (command) error:', err);
      });

      // Modular command dispatch
      const handler = commandHandlers[interaction.commandName];
      if (typeof handler === 'function') {
        const ctx = buildCommandContext(interaction, ctxExtras);
        return handler(interaction, ctx);
      }
      // Fallback if no handler registered
      return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });

      }
    // ========== BUTTONS ==========
    else if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('jobshift|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/jobs/shiftButtons.mjs');
      return mod.default(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('rb|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/ridebusButtons.mjs');
      return mod.default(interaction, ctx);
    }
    // Blackjack buttons
    else if (interaction.isButton() && interaction.customId.startsWith('bj|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/blackjackButtons.mjs');
      return mod.default(interaction, ctx);
    }
    // Slots buttons
    else if (interaction.isButton() && interaction.customId.startsWith('slots|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/slotsButtons.mjs');
      return mod.default(interaction, ctx);
    }
    // Dice War buttons
    else if (interaction.isButton() && interaction.customId.startsWith('dice|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/diceWarButtons.mjs');
      return mod.default(interaction, ctx);
    }
    // Roulette buttons
    else if (interaction.isButton() && interaction.customId.startsWith('rou|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/rouletteButtons.mjs');
      return mod.default(interaction, ctx);
    }

    // Horse race buttons
    else if (interaction.isButton() && interaction.customId.startsWith('horse|')) {
      const mod = await import('./interactions/horseRaceButtons.mjs');
      return mod.default(interaction);
    }

    // Hold'em buttons
    else if (interaction.isButton() && interaction.customId.startsWith('hold|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/holdemButtons.mjs');
      return mod.default(interaction, ctx);
    }

    // Request buttons
    else if (interaction.isButton() && interaction.customId.startsWith('req|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRequestButtons(interaction, ctx);
    }

    // Leaderboard buttons
    else if (interaction.isButton() && interaction.customId.startsWith('leader|')) {
      const mod = await import('./interactions/leaderboardButtons.mjs');
      return mod.default(interaction);
    }

    // Roulette select menus
    else if (interaction.isStringSelectMenu() && interaction.customId === 'rou|type') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/rouletteTypeSelect.mjs');
      return mod.default(interaction, ctx);
    }

    // Help select menu
    else if (interaction.isStringSelectMenu() && interaction.customId === 'help|section') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHelpSelect(interaction, ctx);
    }

    // Request reject modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('req|rejmodal|')) {
      if (!(await isModerator(interaction))) return interaction.reply({ content: '❌ Moderators only.', ephemeral: true });
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRequestRejectModal(interaction, ctx);
    }

    // Roulette modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('rou|modal|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/rouletteModal.mjs');
      return mod.default(interaction, ctx);
    }

    // Hold'em bet modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('hold|bet|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/holdemBetModal.mjs');
      return mod.default(interaction, ctx);
    }
    // Hold'em join modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('hold|join|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/holdemJoinModal.mjs');
      return mod.default(interaction, ctx);
    }
    // Hold'em custom table modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('hold|custom|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      const mod = await import('./interactions/holdemCustomModal.mjs');
      return mod.default(interaction, ctx);
    }

    else if (interaction.isModalSubmit() && interaction.customId.startsWith('horse|betmodal|')) {
      const mod = await import('./interactions/horseRaceBetModal.mjs');
      return mod.default(interaction);
    }

    // ignore other interaction types
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && Number(err.code) === 10062) {
      console.warn('Skipped error response for expired interaction (code 10062)');
      return;
    }
    console.error(err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ Unexpected error.', ephemeral: true }).catch(()=>{});
      } else {
        await interaction.reply({ content: '❌ Unexpected error.', ephemeral: true }).catch(()=>{});
      }
    } catch (followErr) {
      console.error('Failed to send error response:', followErr);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
// Bot Entrypoint — registers handlers, builds context, sweeps sessions, and logs in.

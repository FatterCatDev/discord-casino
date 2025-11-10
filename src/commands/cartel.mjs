import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { emoji } from '../lib/emojis.mjs';
import {
  getCartelOverview,
  getCartelSharePrice,
  cartelInvest,
  cartelSell,
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
  collectDealerChips
} from '../cartel/service.mjs';
import {
  CARTEL_DEFAULT_SHARE_PRICE,
  CARTEL_BASE_PRICE_PER_GRAM,
  CARTEL_WAREHOUSE_FEE_BPS,
  CARTEL_MIN_TICK_SECONDS,
  CARTEL_MAX_RANK,
  CARTEL_DEALER_TIERS,
  CARTEL_DEALER_NAME_POOL
} from '../cartel/constants.mjs';
import { xpToNextForRank } from '../cartel/progression.mjs';

const gramsFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const xpFormatter = new Intl.NumberFormat('en-US');
const CARTEL_LOG_CHANNEL_ID = process.env.CARTEL_LOG_CHANNEL_ID || '1413043107137585242';
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const CARTEL_REFRESH_CUSTOM_ID = 'cartel|refresh';
const CARTEL_RANKS_CUSTOM_ID = 'cartel|ranks';
const CARTEL_OVERVIEW_CUSTOM_ID = 'cartel|overview';
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
const CARTEL_INVEST_BUTTON_ID = 'cartel|invest';
const CARTEL_INVEST_MODAL_ID = 'cartel|invest|modal';
const CARTEL_INVEST_MODAL_INPUT_ID = 'cartel|invest|chips';
const CARTEL_SELL_BUTTON_ID = 'cartel|sell|prompt';
const CARTEL_SELL_MODAL_ID = 'cartel|sell|modal';
const CARTEL_SELL_MODAL_INPUT_ID = 'cartel|sell|amount';
const CARTEL_COLLECT_BUTTON_ID = 'cartel|collect|prompt';
const CARTEL_COLLECT_MODAL_ID = 'cartel|collect|modal';
const CARTEL_COLLECT_MODAL_INPUT_ID = 'cartel|collect|amount';
const CARTEL_GUIDE_BUTTON_ID = 'cartel|guide';
const DEALER_NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const dealerRecruitmentNameCache = new Map();
const SEMUTA_IMAGE_NAME = 'semuta_cartel.png';
const SEMUTA_IMAGE_PATH = `Assets/${SEMUTA_IMAGE_NAME}`;
const DEALERS_IMAGE_NAME = 'dealers.png';
const DEALERS_IMAGE_PATH = `Assets/${DEALERS_IMAGE_NAME}`;

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

async function buildOverviewPayload(interaction, ctx) {
  const chipsFmt = getChipsFormatter(ctx);
  const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
  return {
    embeds: [buildOverviewEmbed(overview, chipsFmt)],
    components: buildOverviewComponents('overview'),
    files: [buildSemutaImageAttachment()]
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
  const display = user.tag || user.globalName || user.username || user.id;
  return `${display} (<@${user.id}>)`;
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

async function ensureCartelAccess() {
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

 

function buildOverviewEmbed(overview, chipsFmt) {
  const { investor, metrics, totals, pool, nextTickAt } = overview;
  const xpRate = Math.max(0, Number(metrics?.xpPerGram ?? 0));
  const hourlyValue = metrics.hourlyGrams * CARTEL_BASE_PRICE_PER_GRAM;
  const dailyValue = metrics.dailyGrams * CARTEL_BASE_PRICE_PER_GRAM;
  const tickSeconds = CARTEL_MIN_TICK_SECONDS;
  const tickDurationLabel = formatTickDuration(tickSeconds);
  const tickGramsValue = metrics.hourlyGrams * (tickSeconds / SECONDS_PER_HOUR);
  const nextTickLine = nextTickAt
    ? `<t:${nextTickAt}:R>`
    : 'Pending first production tick';
  const sharePrice = Math.max(1, Math.floor(Number(metrics?.sharePrice || pool?.share_price || CARTEL_DEFAULT_SHARE_PRICE)));
  const shareRateGramPerHour = gramsFormatter.format(mgToGrams(metrics?.perShareRateMg || 0));
  const description = [
    `${emoji('semuta_cartel')} Semuta is a pile of pale blue crystals that the cartel refines for passive chip income.`,
    `${emoji('cashStack')} Share price: **${chipsFmt(sharePrice)}** · Customer rate: **${CARTEL_BASE_PRICE_PER_GRAM} chips/g**`,
    `${emoji('semuta')} Share rate: **${shareRateGramPerHour}g of Semuta / share / hr**`,
    `${emoji('spark')} XP gain = Semuta sold × **${xpRate.toLocaleString('en-US', { maximumFractionDigits: 2 })} XP/g**.`,
    `${emoji('hourglass')} Production per tick = share rate × total shares × your pool share % × tick length.`
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${emoji('semuta_cartel')} Semuta Cartel Overview`)
    .setThumbnail(`attachment://${SEMUTA_IMAGE_NAME}`)
    .setDescription(description)
    .addFields(
      {
        name: 'Your Holdings',
        value: [
          `${emoji('cashStack')} Shares: **${Number(investor?.shares || 0).toLocaleString('en-US')}**`,
          `${emoji('semuta')} Stash: **${gramsFormatter.format(metrics.stashGrams)}g of Semuta** / ${gramsFormatter.format(metrics.stashCapGrams)}g of Semuta cap`,
          `${emoji('vault')} Warehouse (overflow): **${gramsFormatter.format(metrics.warehouseGrams)}g of Semuta**`,
          buildRankProgressLine(investor)
        ].join('\n')
      },
      {
        name: 'Production Estimates',
        value: [
          `${emoji('hourglass')} Tick (~${tickDurationLabel}): **${gramsFormatter.format(tickGramsValue)}g of Semuta**`,
          `${emoji('alarmClock')} Hourly: **${gramsFormatter.format(metrics.hourlyGrams)}g of Semuta** (~${chipsFmt(Math.round(hourlyValue))})`,
          `${emoji('calendar')} Daily: **${gramsFormatter.format(metrics.dailyGrams)}g of Semuta** (~${chipsFmt(Math.round(dailyValue))})`,
          `${emoji('pie')} Pool share: **${formatPercent(metrics.sharePercent)}**`
        ].join('\n')
      },
      {
        name: 'Cartel Pool',
        value: [
          `${emoji('busts')} Investors: **${totals.investors}**`,
          `${emoji('chipCard')} Shares outstanding: **${Number(pool?.total_shares || 0).toLocaleString('en-US')}**`,
          `${emoji('hourglassFlow')} Next tick: ${nextTickLine}`,
          `${emoji('balanceScale')} Warehouse fee: **${(CARTEL_WAREHOUSE_FEE_BPS / 100).toFixed(2)}%**`
        ].join('\n')
      }
    )
    .setFooter({ text: 'Grow your Semuta stash, then sell the pale blue crystals for passive chips.' });
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
      .setCustomId(CARTEL_DEALERS_LIST_VIEW_ID)
      .setLabel('Dealers')
      .setEmoji('🧑‍🤝‍🧑')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CARTEL_INVEST_BUTTON_ID)
      .setLabel('Invest Chips')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Success)
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

function buildCartelGuideEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${emoji('books')} Semuta Loot Guide`)
    .setThumbnail(`attachment://${SEMUTA_IMAGE_NAME}`)
    .setDescription('How to convert pale blue Semuta into steady chip loot—follow this lightweight loop.');
  embed.addFields(
    {
      name: `${emoji('sparkles')} Bootstrapping`,
      value: [
        `${emoji('cashStack')} Invest chips through the **Invest** button to buy Semuta shares and raise your hourly output.`,
        `${emoji('semuta')} Keep stash space clear—overflow rolls into the warehouse with a small fee, but every gram still pays.`,
        `${emoji('medalGold')} Rank up by collecting and selling; higher ranks unlock more dealer slots and stash cap.`
      ].join('\n')
    },
    {
      name: `${emoji('hourglassFlow')} Daily Loot Loop`,
      value: [
        `1. **Sell Stash** to turn ready grams of Semuta into chips (enter a number or type ALL).`,
        `2. **Collect Warehouse** when overflow stacks up so none of your Semuta sits idle.`,
        `3. **Hire Dealers** on the List tab and keep their upkeep timers paid so they auto-sell stash for you.`,
        `4. **Collect Chips** from dealers to scoop passive payouts plus cartel XP.`
      ].join('\n')
    },
    {
      name: `${emoji('spark')} Quick Tips`,
      value: [
        `${emoji('alarmClock')} Production ticks roughly every few minutes—use **Refresh** to see the latest Semuta stash math.`,
        `${emoji('hammerWrench')} Admins can tune share price, rate, and XP live with \`/setcartelshare\`, \`/setcartelrate\`, and \`/setcartelxp\`.`,
        `${emoji('package')} Warehouse fees are minor, but stash space is free. Sell regularly to keep the blue crystals flowing.`
      ].join('\n')
    }
  );
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
  return Number(mg || 0) / 1000;
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
  const capKnown = Number.isFinite(dealerCap);
  if (capKnown) {
    const capReached = dealerCount >= dealerCap;
    const capLine = `${dealerCount} / ${dealerCap} slots used${capReached ? ` — ${emoji('warning')} Cap reached` : ''}`;
    embed.addFields({
      name: `${emoji('clipboard')} Dealer Slots`,
      value: capLine
    });
  } else {
    const line = dealerCount > 0
      ? `${dealerCount} active ${dealerCount === 1 ? 'dealer' : 'dealers'}`
      : 'No active dealers yet.';
    embed.addFields({
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
    const value = locked ? lines.map(line => `> ${line}`).join('\n') : lines.join('\n');
    const tierEmoji = dealerTierEmoji(tier.id);
    embed.addFields({
      name: `${locked ? emoji('lock') : tierEmoji} ${tier.name} — “${contactName}”`,
      value
    });
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
    embed.addFields({
      name: `${tierEmoji} ${headerParts.join(' • ')}`,
      value: [
        `${statusIcon}`,
        `${emoji('alarmClock')} ${gramsFormatter.format(mgToGrams(dealer.hourly_sell_cap_mg))}g of Semuta/hr @ ${multiplier}×`,
        `${emoji('cashStack')} Upkeep: ${formatPercentDisplay(upkeepPercent)} (~${chipsFmt(Math.round(upkeepRate))}/hr)`,
        `${emoji('calendar')} Paid through: ${formatRelativeTs(dealer.upkeep_due_at)}`,
        `${emoji('semuta')} Lifetime sold: ${gramsFormatter.format(mgToGrams(dealer.lifetime_sold_mg))}g of Semuta · ${chipsFmt(dealerPayoutForMg(dealer.lifetime_sold_mg, dealer.price_multiplier_bps))}`,
        `${emoji('cashStack')} Pending payout: ${chipsFmt(Number(dealer.pending_chips || 0))}`,
        `${emoji('spark')} Last sale: ${dealer.last_sold_at ? formatRelativeTs(dealer.last_sold_at) : 'never'}`
      ].join('\n')
    });
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
    embed.addFields({
      name: `${tierEmoji} ${headerParts.join(' • ')}`,
      value: [
        `${emoji('briefcase')} Rate: ${formatPercentDisplay(upkeepPercent)} (~${chipsFmt(Math.round(upkeepRate))}/hr)`,
        `${emoji('alarmClock')} ${dueAt ? `Due ${formatRelativeTs(dueAt)}` : 'Upkeep timer not set'}`,
        overdue
          ? `${emoji('warning')} Payment overdue — press the button below to settle now.`
          : `${emoji('whiteCheck')} Route is paid up.`
      ].join('\n')
    });
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
    const payload = {
      embeds: [buildCartelGuideEmbed()],
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

export async function handleCartelInvestButton(interaction, ctx) {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  let sharePriceHint = CARTEL_DEFAULT_SHARE_PRICE;
  const guildId = interaction.guild?.id;
  if (guildId) {
    try {
      const latest = await getCartelSharePrice(guildId);
      if (Number.isFinite(latest) && latest > 0) {
        sharePriceHint = Math.floor(Number(latest));
      }
    } catch (err) {
      console.error('Failed to fetch cartel share price for invest modal', err);
    }
  }
  const messageId = interaction.message?.id || '0';
  const modal = new ModalBuilder()
    .setCustomId(`${CARTEL_INVEST_MODAL_ID}|${messageId}`)
    .setTitle('Invest in the Semuta Cartel');
  const input = new TextInputBuilder()
    .setCustomId(CARTEL_INVEST_MODAL_INPUT_ID)
    .setLabel('Chips to invest')
    .setPlaceholder(`Share price is ${sharePriceHint} chips`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
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

export async function handleCartelInvestModal(interaction, ctx, sourceMessageId = '0') {
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  try {
    const chipsFmt = getChipsFormatter(ctx);
    const rawValue = interaction.fields.getTextInputValue(CARTEL_INVEST_MODAL_INPUT_ID);
    const numeric = Math.floor(Number((rawValue || '').replace(/[,\s]/g, '')));
    await interaction.deferReply();
    const result = await cartelInvest(interaction.guild?.id, interaction.user.id, numeric);
    const message = result.remainder > 0
      ? `${emoji('cashStack')} Bought **${result.shares.toLocaleString('en-US')}** shares for **${chipsFmt(result.spend)}**. ${result.remainder} chips were too small for another share and remain in your wallet.`
      : `${emoji('cashStack')} Bought **${result.shares.toLocaleString('en-US')}** shares for **${chipsFmt(result.spend)}**.`;
    const remainderNote = result.remainder > 0
      ? ` (remainder ${result.remainder.toLocaleString('en-US')} chips)`
      : '';
    await logCartelActivity(
      interaction,
      `Invested ${result.shares.toLocaleString('en-US')} shares for ${chipsFmt(result.spend)}${remainderNote}.`
    );
    const overviewPayload = await buildOverviewPayload(interaction, ctx);
    await interaction.editReply({ content: message, ...overviewPayload });
    if (sourceMessageId && sourceMessageId !== '0') {
      const targetMessage = await fetchMessageById(interaction, sourceMessageId);
      if (targetMessage) {
        await applyOverviewToMessage(targetMessage, overviewPayload);
      }
    }
  } catch (error) {
    if (interaction.deferred || interaction.replied) {
      const content = error instanceof CartelError
        ? `⚠️ ${error.message || 'Action failed.'}`
        : '⚠️ Something went wrong while investing. Please try again.';
      await interaction.editReply({ content }).catch(() => {});
    } else if (error instanceof CartelError) {
      await interaction.reply(withAutoEphemeral(interaction, { content: `⚠️ ${error.message || 'Action failed.'}` })).catch(() => {});
    } else {
      console.error('Cartel invest modal failed', error);
      await interaction.reply(withAutoEphemeral(interaction, { content: '⚠️ Something went wrong while investing. Please try again.' })).catch(() => {});
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
  const allowed = await ensureCartelAccess(interaction, ctx);
  if (!allowed) return;
  const chipsFmt = getChipsFormatter(ctx);
  try {
    const rawValue = (interaction.fields.getTextInputValue(CARTEL_SELL_MODAL_INPUT_ID) || '').trim();
    if (!rawValue) {
      throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter grams of Semuta to sell or type ALL.');
    }
    let grams;
    if (rawValue.toLowerCase() === 'all') {
      const overview = await getCartelOverview(interaction.guild?.id, interaction.user.id);
      grams = Math.floor(Number(overview?.metrics?.stashGrams || 0));
      if (grams <= 0) {
        throw new CartelError('CARTEL_NOT_ENOUGH_STASH', 'You have no Semuta in your stash to sell.');
      }
    } else {
      grams = Number(rawValue.replace(/[\,\s]/g, ''));
      if (!Number.isFinite(grams) || grams <= 0) {
        throw new CartelError('CARTEL_AMOUNT_REQUIRED', 'Enter at least 1 gram of Semuta to sell.');
      }
    }
    await interaction.deferReply();
    const result = await cartelSell(interaction.guild?.id, interaction.user.id, grams);
    const content = `${emoji('moneyBag')} Sold **${gramsFormatter.format(result.gramsSold)}g** of Semuta for **${chipsFmt(result.payout)}**.`;
    await interaction.editReply({ content });
    if (messageId && messageId !== '0') {
      const targetMessage = await fetchMessageById(interaction, messageId);
      if (targetMessage) {
        const overviewPayload = await buildOverviewPayload(interaction, ctx);
        await applyOverviewToMessage(targetMessage, overviewPayload);
      }
    }
    await logCartelActivity(
      interaction,
      `Sold ${gramsFormatter.format(result.gramsSold)}g of Semuta for ${chipsFmt(result.payout)}.`
    );
  } catch (error) {
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
  const allowed = await ensureCartelAccess(interaction, ctx);
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

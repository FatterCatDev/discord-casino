import { EmbedBuilder } from 'discord.js';
import { getGuildSettings, getUserBalances, getHouseBalance, takeFromUserToHouse, transferFromHouseToUser, burnCredits } from '../db/db.auto.mjs';
import { chipsAmount } from '../games/format.mjs';
import { emoji } from '../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../lib/fundsTip.mjs';
import { scheduleInteractionAck } from '../lib/interactionAck.mjs';
import { formatCasinoCategory } from '../lib/casinoCategory.mjs';
import { applyEmbedThumbnail, buildAssetAttachment } from '../lib/assets.mjs';

const DICEWAR_ACK_TIMEOUT_MS = (() => {
  const specific = Number(process.env.DICEWAR_INTERACTION_ACK_MS);
  if (Number.isFinite(specific) && specific > 0) return specific;
  const general = Number(process.env.INTERACTION_STALE_MS);
  return Number.isFinite(general) && general > 0 ? general : 2500;
})();
const DICE_WAR_ASSET = 'diceWars.png';

async function inCasinoCategory(interaction, kittenMode) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  try {
    if (!interaction.guild) {
      return {
        ok: false,
        reason: say('❌ Roll with me inside a server, Kitten.', '❌ Dice War is only available inside servers.')
      };
    }
    const { casino_category_id } = await getGuildSettings(interaction.guild.id) || {};
    if (!casino_category_id) return { ok: true };
    const ch = interaction.channel;
    let catId = null;
    try {
      if (typeof ch?.isThread === 'function' && ch.isThread()) catId = ch.parent?.parentId || null;
      else catId = ch?.parentId || null;
    } catch {}
    if (!catId || catId !== casino_category_id) {
      const { label: categoryLabel, exampleChannelMention } = await formatCasinoCategory(interaction, casino_category_id);
      const kittenHint = exampleChannelMention
        ? ` Run it in ${exampleChannelMention} inside that lounge for me.`
        : ' Run it in one of the text lounges there for me.';
      const neutralHint = exampleChannelMention
        ? ` Try ${exampleChannelMention} inside that category.`
        : ' Choose any casino text channel inside that category.';
      return {
        ok: false,
        reason: say(
          `❌ Bring me to ${categoryLabel} before we clash dice, Kitten.${kittenHint}`,
          `❌ Run this in one of the text channels inside ${categoryLabel}.${neutralHint}`
        )
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: say('❌ I couldn’t verify the casino category, Kitten.', '❌ Unable to verify channel category.') };
  }
}

export async function playDiceWar(interaction, ctx, bet) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const isButton = typeof interaction?.isButton === 'function' && interaction.isButton();
  const cancelAutoAck = scheduleInteractionAck(interaction, { timeout: DICEWAR_ACK_TIMEOUT_MS, mode: isButton ? 'update' : 'reply' });
  let deferred = false;
  const deferInteractionOnce = async () => {
    if (!deferred && !interaction.deferred && !interaction.replied) {
      cancelAutoAck();
      const deferFn = isButton ? interaction.deferUpdate : interaction.deferReply;
      if (typeof deferFn === 'function') {
        await deferFn.call(interaction).catch(() => {});
      }
      deferred = true;
    }
  };
  const respondEphemeral = async (payload = {}) => {
    cancelAutoAck();
    const base = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? { ...payload } : { content: String(payload || '') };
    if (!Object.prototype.hasOwnProperty.call(base, 'ephemeral')) base.ephemeral = true;
    if (interaction.deferred || interaction.replied || deferred) {
      if (typeof interaction.followUp === 'function') {
        return interaction.followUp(base);
      }
      const clone = { ...base };
      delete clone.ephemeral;
      if (typeof interaction.editReply === 'function') {
        return interaction.editReply(clone);
      }
      return interaction.reply(clone);
    }
    return interaction.reply(base);
  };
  if (!interaction.guild) {
    return respondEphemeral({ content: say('❌ Roll with me inside a server, Kitten.', '❌ Dice War is only available inside servers.') });
  }
  const guildId = interaction.guild.id;
  const loc = await inCasinoCategory(interaction, kittenMode);
  if (!loc.ok) return respondEphemeral({ content: loc.reason });
  if (!Number.isInteger(bet) || bet <= 0) {
    return respondEphemeral({ content: say('❌ Wager a positive integer for me, Kitten.', '❌ Bet must be a positive integer.') });
  }

  // Require funds to cover the base bet only
  const { chips, credits } = await getUserBalances(guildId, interaction.user.id);
  const total = (chips || 0) + (credits || 0);
  if (total < bet) {
    const base = say(`❌ You need at least **${chipsAmount(bet)}** in Chips+Credits to tantalize me, Kitten.`, `❌ You need at least **${chipsAmount(bet)}** in Chips+Credits.`);
    return respondEphemeral({ content: withInsufficientFundsTip(base, kittenMode) });
  }

  // Roll dice
  const rollDie = () => 1 + Math.floor(Math.random() * 6);
  const p1 = rollDie(), p2 = rollDie();
  const h1 = rollDie(), h2 = rollDie();
  const playerTotal = p1 + p2;
  const houseTotal = h1 + h2;
  const playerDoubles = (p1 === p2);

  // House cover check: must cover returning chipStake and winnings
  // Credits-first staking: cover from Credits first, then Chips
  const creditStake = Math.min(bet, credits);
  const chipStake = bet - creditStake;
  // Worst-case payout occurs when player wins and has doubles: requires house to return chipStake + 2×bet
  const coverNeeded = chipStake + (2 * bet);
  const cover = await getHouseBalance(guildId);
  if (cover < coverNeeded) {
    return respondEphemeral({ content: say(`❌ The house can’t cover that potential payout, Kitten. Needed cover: **${chipsAmount(coverNeeded)}**.`, `❌ House cannot cover potential payout. Needed cover: **${chipsAmount(coverNeeded)}**.`) });
  }

  // Take chip stake from user to house
  if (chipStake > 0) {
    await deferInteractionOnce();
    try {
      await takeFromUserToHouse(guildId, interaction.user.id, chipStake, 'dice war buy-in (chips)', interaction.user.id);
    }
    catch {
      return respondEphemeral({ content: say('❌ I couldn’t collect your chip stake, Kitten.', '❌ Could not process buy-in.') });
    }
  }

  let outcome = '';
  let payout = 0;
  const playerWins = playerTotal > houseTotal;
  const doubleWin = playerWins && playerDoubles; // doubles only double when the player wins
  let creditsBurned = 0;
  if (playerWins) {
    const winAmount = bet * (doubleWin ? 2 : 1);
    payout = chipStake + winAmount; // return chipStake + winnings
    await deferInteractionOnce();
    try {
      await transferFromHouseToUser(guildId, interaction.user.id, payout, 'dice war win', null);
    }
    catch {
      return respondEphemeral({ content: say('⚠️ I couldn’t send your winnings this time, Kitten.', '⚠️ Payout failed.') });
    }
    outcome = say(
      `✅ You win **${chipsAmount(winAmount)}**, Kitten${doubleWin ? ' (doubles doubled pot)' : ''}`,
      `✅ You win **${chipsAmount(winAmount)}**${doubleWin ? ' (doubles doubled pot)' : ''}`
    );
  } else {
    // tie or house higher => house wins; burn credits portion if any
    if (creditStake > 0) {
      try {
        await burnCredits(guildId, interaction.user.id, creditStake, 'dice war loss', null);
        creditsBurned = creditStake;
      } catch {}
    }
    outcome = say('❌ The house wins this round, Kitten.', '❌ House wins');
    if (creditsBurned > 0) {
      const burnedLine = say(
        `\nCredits burned: **${new Intl.NumberFormat('en-US').format(creditsBurned)}**`,
        `\nCredits burned: **${new Intl.NumberFormat('en-US').format(creditsBurned)}**`
      );
      outcome += burnedLine;
    }
  }

  const e = new EmbedBuilder()
    .setTitle(say(`${emoji('dice')} Dice War with Mistress Kitten`, `${emoji('dice')} Dice War`))
    .setColor(playerTotal > houseTotal ? 0x57F287 : 0xED4245)
    .addFields(
      { name: say('Your Roll, Kitten', 'Your Roll'), value: `${emoji('dice')} ${p1} + ${p2} = **${playerTotal}**${playerDoubles ? ' (doubles)' : ''}`, inline: true },
      { name: 'House Roll', value: `${emoji('dice')} ${h1} + ${h2} = **${houseTotal}**`, inline: true },
      { name: say('Your Wager', 'Bet'), value: `**${chipsAmount(bet)}**`, inline: true },
      { name: say('Result, Sweetheart', 'Result'), value: outcome, inline: false }
    );
  try { e.addFields(ctx.buildPlayerBalanceField(interaction.guild.id, interaction.user.id)); } catch {}
  try { e.addFields(ctx.buildTimeoutField(interaction.guild.id, interaction.user.id)); } catch {}
  applyEmbedThumbnail(e, DICE_WAR_ASSET);

  // Session tracking
  try {
    ctx.setActiveSession(interaction.guild.id, interaction.user.id, 'dicewar', kittenMode ? 'Dice War (Kitten)' : 'Dice War');
    const houseNet = playerWins ? -(bet * (doubleWin ? 2 : 1)) : chipStake;
    ctx.addHouseNet(interaction.guild.id, interaction.user.id, 'dicewar', houseNet);
    // Player net for record (doesn't include returning chip stake)
    const playerNet = playerWins
      ? (bet * (doubleWin ? 2 : 1))
      : -(chipStake + creditsBurned);
    ctx.recordSessionGame(interaction.guild.id, interaction.user.id, playerNet);
    ctx.touchActiveSession(interaction.guild.id, interaction.user.id, 'dicewar');
  } catch {}

  // Play again button
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const again = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dice|again|${bet}|${interaction.user.id}`).setLabel(say('Play Again, Kitten', 'Play Again')).setEmoji('🎲').setStyle(ButtonStyle.Secondary)
  );

  await deferInteractionOnce();
  cancelAutoAck();
  const payload = { embeds: [e], components: [again] };
  const art = buildAssetAttachment(DICE_WAR_ASSET);
  if (art) payload.files = [art];
  const mode = isButton ? 'update' : 'auto';
  return ctx.sendGameMessage(interaction, payload, mode);
}

export default async function handleDiceWar(interaction, ctx) {
  const bet = interaction.options.getInteger('bet');
  return playDiceWar(interaction, ctx, bet);
}
// Slash Command: /dicewar — roll 2d6 vs House with Credits-first staking

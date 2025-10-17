import { EmbedBuilder } from 'discord.js';
import { getGuildSettings, getUserBalances, getHouseBalance, takeFromUserToHouse, transferFromHouseToUser, burnCredits } from '../db/db.auto.mjs';
import { chipsAmount } from '../games/format.mjs';
import { emoji } from '../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../lib/fundsTip.mjs';

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
      return { ok: false, reason: say('❌ Bring me to the casino category before we clash dice, Kitten.', '❌ Use this in the configured casino category.') };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: say('❌ I couldn’t verify the casino category, Kitten.', '❌ Unable to verify channel category.') };
  }
}

export async function playDiceWar(interaction, ctx, bet) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!interaction.guild) {
    const payload = { content: say('❌ Roll with me inside a server, Kitten.', '❌ Dice War is only available inside servers.'), ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        if (typeof interaction.followUp === 'function') return interaction.followUp(payload);
        return interaction.reply(payload);
      }
      return interaction.reply(payload);
    } catch {
      return;
    }
  }
  const guildId = interaction.guild.id;
  const loc = await inCasinoCategory(interaction, kittenMode);
  if (!loc.ok) return interaction.reply({ content: loc.reason, ephemeral: true });
  if (!Number.isInteger(bet) || bet <= 0) {
    return interaction.reply({ content: say('❌ Wager a positive integer for me, Kitten.', '❌ Bet must be a positive integer.'), ephemeral: true });
  }

  // Require funds to cover the base bet only
  const { chips, credits } = await getUserBalances(guildId, interaction.user.id);
  const total = (chips || 0) + (credits || 0);
  if (total < bet) {
    const base = say(`❌ You need at least **${chipsAmount(bet)}** in Chips+Credits to tantalize me, Kitten.`, `❌ You need at least **${chipsAmount(bet)}** in Chips+Credits.`);
    return interaction.reply({ content: withInsufficientFundsTip(base, kittenMode), ephemeral: true });
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
    return interaction.reply({ content: say(`❌ The house can’t cover that potential payout, Kitten. Needed cover: **${chipsAmount(coverNeeded)}**.`, `❌ House cannot cover potential payout. Needed cover: **${chipsAmount(coverNeeded)}**.`), ephemeral: true });
  }

  // Take chip stake from user to house
  if (chipStake > 0) {
    try { await takeFromUserToHouse(guildId, interaction.user.id, chipStake, 'dice war buy-in (chips)', interaction.user.id); }
    catch { return interaction.reply({ content: say('❌ I couldn’t collect your chip stake, Kitten.', '❌ Could not process buy-in.'), ephemeral: true }); }
  }

  let outcome = '';
  let payout = 0;
  const playerWins = playerTotal > houseTotal;
  const doubleWin = playerWins && playerDoubles; // doubles only double when the player wins
  let creditsBurned = 0;
  if (playerWins) {
    const winAmount = bet * (doubleWin ? 2 : 1);
    payout = chipStake + winAmount; // return chipStake + winnings
    try { await transferFromHouseToUser(guildId, interaction.user.id, payout, 'dice war win', null); }
    catch { return interaction.reply({ content: say('⚠️ I couldn’t send your winnings this time, Kitten.', '⚠️ Payout failed.'), ephemeral: true }); }
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

  return ctx.sendGameMessage(interaction, { embeds: [e], components: [again] });
}

export default async function handleDiceWar(interaction, ctx) {
  const bet = interaction.options.getInteger('bet');
  return playDiceWar(interaction, ctx, bet);
}
// Slash Command: /dicewar — roll 2d6 vs House with Credits-first staking

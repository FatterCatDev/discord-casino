import { emoji } from '../lib/emojis.mjs';

const BEG_PLACES = [
  'the neon-soaked slots hallway',
  'the velvet rope outside the VIP cage',
  'a cracked marble fountain by the cashier',
  'the staff entrance behind the poker pit',
  'a flickering keno lounge doorway',
  'the rain-slick sidewalk outside the casino',
  'a smoky baccarat side table',
  'the high roller valet stand',
  'the deserted sportsbook mezzanine',
  'a forgotten barstool near the roulette pit'
];

const BEG_STYLES = [
  'their trembling ballad about losing the rent on double zero',
  'their cardboard sign begging for “one more ante”',
  'their dramatic bow with an empty martini glass',
  'their juggling routine with busted chip racks',
  'their whispered tale of a cursed blackjack shoe',
  'their solemn oath to pay it back after the next spin',
  'their heartfelt ode to every dealer on the floor',
  'their improvised tap dance in scuffed dress shoes',
  'their exaggerated sob story about a jealous slot machine',
  'their polite curtsey while flashing a faded lucky chip'
];

const DONATION_RESPONSES = [
  'a retired pit boss, moved by {STYLE}, flicked them a tidy stack of chips',
  'an amused tourist, charmed by {STYLE}, pressed a voucher into their palm',
  'a cocktail server, pitying {STYLE}, slipped spare chips under their napkin',
  'a valet captain, impressed with {STYLE}, transferred a tip straight to their hand',
  'a blackjack dealer, hearing {STYLE}, palmed them a comp slip worth chips',
  'a security guard, softened by {STYLE}, shoved a handful of chips toward them before anyone noticed',
  'a fellow degenerate, relating to {STYLE}, dumped leftover chips into their empty cup',
  'a floor manager, entertained by {STYLE}, issued an emergency “pity payout”',
  'a generous whale, captivated by {STYLE}, tossed a gleaming chip stack into their lap',
  'a rookie gambler, inspired by {STYLE}, emptied their pockets of every stray chip'
];

const COOLDOWN_SECONDS = 7;
const COOLDOWN_MS = COOLDOWN_SECONDS * 1000;
const begCooldowns = new Map();

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function formatDonation(template, style) {
  return template.replaceAll('{STYLE}', style);
}

function rollReward() {
  const roll = Math.random();
  if (roll < 0.90) return randomInt(5, 10);
  if (roll < 0.99) return randomInt(11, 50);
  return randomInt(100, 150);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pruneCooldowns(now) {
  for (const [userId, expiresAt] of begCooldowns) {
    if (expiresAt <= now) begCooldowns.delete(userId);
  }
}

export default async function handleBeg(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const userId = interaction.user?.id;
  if (!userId) {
    return interaction.reply({
      content: say('❌ I need to know which Kitten is pleading.', '❌ Unable to identify you.')
    });
  }

  const now = Date.now();
  pruneCooldowns(now);
  const cooldownUntil = begCooldowns.get(userId) || 0;
  if (cooldownUntil > now) {
    const remainingSeconds = Math.ceil((cooldownUntil - now) / 1000);
    return interaction.reply({
      content: say(
        `${emoji('hourglass')} Catch your breath, Kitten. Try again in **${remainingSeconds}s**.`,
        `${emoji('hourglass')} Please wait **${remainingSeconds}s** before begging again.`
      )
    });
  }

  const place = pickRandom(BEG_PLACES);
  const style = pickRandom(BEG_STYLES);
  const donation = formatDonation(pickRandom(DONATION_RESPONSES), style);
  const playerTag = `<@${userId}>`;
  const narration = `${playerTag} was begging at ${place}, and ${donation}.`;

  const reward = rollReward();
  try {
    const { chips } = await ctx.mintChips(userId, reward, `beg reward at ${place}`, interaction.client?.user?.id || null);
    begCooldowns.set(userId, now + COOLDOWN_MS);
    const narrationLine = say(narration, narration);
    const rewardLine = say(
      `${emoji('gift')} I tipped **${ctx.chipsAmount(reward)}** for that performance — your balance now sparkles at **${ctx.chipsAmount(chips)}**.`,
      `${emoji('gift')} You received **${ctx.chipsAmount(reward)}** chips. New balance: **${ctx.chipsAmount(chips)}**.`
    );
    return interaction.reply({
      content: `${narrationLine}\n${rewardLine}`
    });
  } catch (err) {
    console.error('beg command mint failed', err);
    return interaction.reply({
      content: say(
        '❌ My narration tripped before the chips landed. Try again shortly, Kitten.',
        '❌ Something went wrong while granting chips. Please try again.'
      )
    });
  }
}

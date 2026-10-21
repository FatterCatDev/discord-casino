import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getUserOnboardingStatus, grantUserOnboardingBonus, markUserOnboardingAcknowledged } from '../db/db.auto.mjs';
import { chipsAmount } from '../games/format.mjs';
import { WELCOME_BONUS_AMOUNT, WELCOME_ACK_CUSTOM_ID, ONBOARDING_ACK_CACHE_MAX } from './config.mjs';

const onboardingAcknowledgedUsers = new Set();

function onboardingCacheKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function rememberOnboardingAcknowledged(guildId, userId) {
  const key = onboardingCacheKey(guildId, userId);
  if (onboardingAcknowledgedUsers.size >= ONBOARDING_ACK_CACHE_MAX) {
    const oldest = onboardingAcknowledgedUsers.values().next().value;
    if (oldest) onboardingAcknowledgedUsers.delete(oldest);
  }
  onboardingAcknowledgedUsers.add(key);
}

function buildWelcomePromptEmbed({ status = null, bonusJustGranted = false, bonusError = null } = {}) {
  const chipsText = chipsAmount(WELCOME_BONUS_AMOUNT);
  const hasBonus = (status?.chipsGranted ?? 0) >= WELCOME_BONUS_AMOUNT;
  let statusLine;
  if (bonusError) {
    statusLine = `⚠️ I tried to add **${chipsText}** to your chips but hit a snag. Please ping a moderator so we can fix it right away.`;
  } else if (bonusJustGranted) {
    statusLine = `✅ I just added **${chipsText}** to your balance to get you started.`;
  } else if (hasBonus) {
    statusLine = `✅ You already have **${chipsText}** waiting in your pocket—nice!`;
  } else {
    statusLine = `✅ I’ll add **${chipsText}** as soon as this welcome message sticks.`;
  }
  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('Welcome to Casino Bot')
    .setDescription([
      'Casino Bot shares a single chip balance across every server, so what you earn here travels with you.',
      '',
      statusLine,
      '',
      'Here are two quick ways to dive in:'
    ].join('\n'))
    .addFields(
      {
        name: 'ℹ️ Quick Commands',
        value: 'Use `/help` for the full guide and `/balance` to check your chips any time.'
      },
      {
        name: '🎰 Casino Games',
        value: 'Spin `/slots`, challenge `/blackjack`, or bet big in `/roulette` for instant thrills.'
      },
      {
        name: '💼 Job System',
        value: 'Run `/job` to choose a career, clock shifts with your stamina, and build reliable income alongside your wagers.'
      }
    )
    .setFooter({ text: 'Hit Okay when you’re ready to jump in.' });
}

function buildWelcomePromptComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(WELCOME_ACK_CUSTOM_ID)
        .setLabel('Okay')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function buildWelcomeAcknowledgedEmbed({ status, alreadyClaimed }) {
  const chipsText = chipsAmount(WELCOME_BONUS_AMOUNT);
  const hasBonus = (status?.chipsGranted ?? 0) >= WELCOME_BONUS_AMOUNT;
  if (alreadyClaimed) {
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Welcome back!')
      .setDescription('You already claimed the welcome bonus—good luck out there!');
  }
  if (hasBonus) {
    return new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('All set!')
      .setDescription(`You’re stocked with **${chipsText}** to start. Try \`/help\` for tips or \`/balance\` to see your chips any time.`);
  }
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Heads up!')
    .setDescription('I still owe you the welcome chips—let a moderator know so we can sort it out for you.');
}

export async function maybePromptNewPlayer(interaction) {
  const guildId = interaction.guild?.id || null;
  const userId = interaction.user?.id || null;
  if (!guildId || !userId) return false;
  if (onboardingAcknowledgedUsers.has(onboardingCacheKey(guildId, userId))) return false;
  let status = null;
  try {
    status = await getUserOnboardingStatus(guildId, userId);
    if (status?.acknowledgedAt) {
      rememberOnboardingAcknowledged(guildId, userId);
      return false;
    }
  } catch (err) {
    console.error(`Failed to read onboarding status for ${userId} in ${guildId}`, err);
    return false;
  }

  let bonusJustGranted = false;
  let grantError = null;
  try {
    const alreadyGranted = (status?.chipsGranted ?? 0) >= WELCOME_BONUS_AMOUNT;
    if (!alreadyGranted) {
      const result = await grantUserOnboardingBonus(guildId, userId, WELCOME_BONUS_AMOUNT, 'welcome bonus');
      bonusJustGranted = result?.granted === true;
      status = result?.status || await getUserOnboardingStatus(guildId, userId);
    }
  } catch (err) {
    grantError = err;
    console.error(`Failed to grant welcome bonus for ${userId} in ${guildId}`, err);
    try {
      status = status || await getUserOnboardingStatus(guildId, userId);
    } catch {}
  }

  if (status?.acknowledgedAt) return false;

  const payload = {
    embeds: [buildWelcomePromptEmbed({ status, bonusJustGranted, bonusError: grantError })],
    components: buildWelcomePromptComponents(),
    ephemeral: true
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
    return true;
  } catch (err) {
    console.error(`Failed to send welcome prompt for ${userId} in ${guildId}`, err);
    return false;
  }
}

export async function handleWelcomeAcknowledgement(interaction) {
  const guildId = interaction.guild?.id || null;
  const userId = interaction.user?.id || null;
  if (!guildId || !userId) {
    return interaction.reply({ content: '⚠️ This bonus is only available inside a server.', ephemeral: true }).catch(() => {});
  }
  try {
    const existingStatus = await getUserOnboardingStatus(guildId, userId);
    const alreadyClaimed = !!(existingStatus && existingStatus.acknowledgedAt);
    const ackResult = await markUserOnboardingAcknowledged(guildId, userId);
    let status = ackResult?.status || existingStatus;
    if (!status) {
      try { status = await getUserOnboardingStatus(guildId, userId); } catch {}
    }
    const acknowledgedNow = ackResult?.acknowledged === true;
    const embed = buildWelcomeAcknowledgedEmbed({
      status,
      alreadyClaimed: !acknowledgedNow && (alreadyClaimed || !!(status && status.acknowledgedAt))
    });
    if (acknowledgedNow || (status && status.acknowledgedAt)) {
      rememberOnboardingAcknowledged(guildId, userId);
    }
    try {
      await interaction.update({ embeds: [embed], components: [] });
    } catch (updateErr) {
      console.warn('welcome ack update failed, falling back to reply', updateErr);
      await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
    }
    return;
  } catch (err) {
    console.error(`Failed to acknowledge welcome bonus for ${userId} in ${guildId}`, err);
    return interaction.reply({ content: '❌ I hit an error while confirming that bonus. Please try again in a moment.', ephemeral: true }).catch(() => {});
  }
}

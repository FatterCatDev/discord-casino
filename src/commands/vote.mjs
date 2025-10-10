import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getVoteSites, getVoteSummary, describeBreakdown } from '../services/votes.mjs';

function chunk(array, size = 5) {
  const groups = [];
  for (let i = 0; i < array.length; i += size) {
    groups.push(array.slice(i, i + size));
  }
  return groups;
}

export function buildVoteResponse({ ctx, kittenMode, summary, sites, statusMessage = null }) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const embed = new EmbedBuilder()
    .setTitle(say('🗳️ Vote for Me, Kitten', '🗳️ Vote & Earn Chips'))
    .setColor(kittenMode ? 0xff9fd6 : 0x5865f2);

  const intro = say(
    'Cast your vote every 12 hours and I will tuck more chips into your stash once Top.gg whispers back. Claim them here when you are done.',
    'Vote every 12 hours to earn bonus chips. After the site confirms your vote, come back here to claim the reward.'
  );

  const siteLines = (sites && sites.length)
    ? sites.map(site => {
        const rewardBits = [];
        if (site.supportsReward && site.baseReward) {
          rewardBits.push(ctx.chipsAmount(site.baseReward));
          if (site.weekendMultiplier && site.weekendMultiplier > 1) {
            rewardBits.push(`×${site.weekendMultiplier} weekends`);
          }
        }
        const suffix = rewardBits.length ? ` — ${rewardBits.join(' · ')}` : '';
        return `${site.emoji || '🔗'} [${site.label}](${site.url})${suffix}`;
      })
    : [say('No vote link is configured yet. Ask an admin to set TOPGG_VOTE_URL.', 'No vote links are configured yet. Set TOPGG_VOTE_URL to share your voting link.')];

  embed.setDescription([intro, '', ...siteLines].join('\n'));

  const totalPending = Number(summary?.totalPendingAmount || 0);
  const breakdownText = describeBreakdown(summary?.breakdown || []);
  if (totalPending > 0) {
    embed.addFields({
      name: say('💰 Pending Treats', '💰 Pending Rewards'),
      value: say(
        `You have **${ctx.chipsAmount(totalPending)}** waiting${breakdownText ? ` (${breakdownText})` : ''}. Press **Claim** to add them to your balance.`,
        `You have **${ctx.chipsAmount(totalPending)}** waiting${breakdownText ? ` (${breakdownText})` : ''}. Press **Claim** to bring them into your bankroll.`
      )
    });
  } else {
    embed.addFields({
      name: say('💰 Pending Treats', '💰 Pending Rewards'),
      value: say(
        'No treats are ready yet. Vote using the buttons below, then return here to claim them. 💕',
        'No rewards are ready yet. Use the buttons below to vote, then come back to claim your chips.'
      )
    });
  }

  embed.setFooter({
    text: say('Votes reset every 12 hours. Weekend votes on Top.gg pay double.', 'Votes reset every 12 hours. Weekend votes on Top.gg pay extra.')
  });

  const components = [];
  const linkGroups = chunk((sites || []).filter(site => site?.url), 5);
  for (const group of linkGroups) {
    if (!group.length) continue;
    const row = new ActionRowBuilder();
    for (const site of group) {
      const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(site.label)
        .setURL(site.url);
      if (site.emoji) {
        button.setEmoji(site.emoji);
      }
      row.addComponents(button);
    }
    components.push(row);
  }

  const claimButton = new ButtonBuilder()
    .setCustomId('vote|claim')
    .setLabel(say('Claim my chips', 'Claim rewards'))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(totalPending <= 0);
  components.push(new ActionRowBuilder().addComponents(claimButton));

  const response = { embeds: [embed], components };
  if (statusMessage) response.content = statusMessage;
  return response;
}

export default async function handleVote(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const userId = interaction.user?.id;
  if (!userId) {
    return interaction.reply({ content: say('❌ I cannot see who is voting for me, Kitten.', '❌ Unable to identify you.'), ephemeral: true });
  }

  const summary = await getVoteSummary(userId);
  const sites = getVoteSites();
  const payload = buildVoteResponse({ ctx, kittenMode, summary, sites });
  const reply = { ...payload, ephemeral: true };
  if (!payload.content) delete reply.content;
  return interaction.reply(reply);
}


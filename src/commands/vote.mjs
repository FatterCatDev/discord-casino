import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getVoteSites, getVoteSummary, describeBreakdown, VOTE_COOLDOWN_SECONDS } from '../services/votes.mjs';
import { emoji } from '../lib/emojis.mjs';

function chunk(array, size = 5) {
  const groups = [];
  for (let i = 0; i < array.length; i += size) {
    groups.push(array.slice(i, i + size));
  }
  return groups;
}

function getSourceCooldown(summary, sourceId) {
  const cooldown = summary?.cooldowns?.[sourceId];
  if (!cooldown) {
    return { active: false, expiresAt: null, remainingSeconds: 0 };
  }
  return {
    active: Boolean(cooldown.active),
    expiresAt: cooldown.expiresAt || null,
    remainingSeconds: Number(cooldown.remainingSeconds || 0)
  };
}

export function buildVoteResponse({ ctx, kittenMode, summary, sites }) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const embed = new EmbedBuilder()
    .setTitle(say(`${emoji('ballot')} Vote for Me, Kitten`, `${emoji('ballot')} Vote & Earn Chips`))
    .setColor(kittenMode ? 0xff9fd6 : 0x5865f2);

  const intro = say(
    `Cast your vote every 12 hours and I will slide the chips right into your stash the moment Top.gg whispers back. Watch your DMs for the details. ${emoji('kiss')}`,
    'Vote every 12 hours to earn bonus chips. As soon as Top.gg confirms it, I’ll credit you automatically and send a DM with the receipt.'
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
  const recentClaimedRewards = Array.isArray(summary?.recentClaimedRewards) ? summary.recentClaimedRewards : [];
  const latestClaimedReward = recentClaimedRewards[0] || null;
  const latestClaimedAmount = Number(latestClaimedReward?.reward_amount || 0);
  const latestClaimedSource = latestClaimedReward?.source ? describeBreakdown([{ source: latestClaimedReward.source, count: 1 }]) : 'your latest vote';
  if (totalPending > 0) {
    embed.addFields({
      name: say(`${emoji('hourglass')} In Flight`, `${emoji('hourglass')} In Flight`),
      value: say(
        `Top.gg just pinged but I have not finished spoiling you yet. Expect **${ctx.chipsAmount(totalPending)}** to land any moment now.${breakdownText ? ` (${breakdownText})` : ''}`,
        `Top.gg has pinged us, but the chips are still processing: **${ctx.chipsAmount(totalPending)}**${breakdownText ? ` (${breakdownText})` : ''}. I’ll DM you as soon as they drop.`
      )
    });
  } else if (latestClaimedReward?.dm_failed_at) {
    embed.addFields({
      name: say(`${emoji('loveLetter')} Delivery`, `${emoji('loveLetter')} Delivery`),
      value: say(
        `I already tucked **${ctx.chipsAmount(latestClaimedAmount)}** from ${latestClaimedSource} into your stash, but Discord would not let my receipt DM through. Your reward still landed.`,
        `Your latest vote reward of **${ctx.chipsAmount(latestClaimedAmount)}** from ${latestClaimedSource} was credited, but I could not deliver the confirmation DM. Your chips still landed.`
      )
    });
  } else if (latestClaimedReward?.claimed_at) {
    embed.addFields({
      name: say(`${emoji('loveLetter')} Delivery`, `${emoji('loveLetter')} Delivery`),
      value: say(
        `Your latest vote reward of **${ctx.chipsAmount(latestClaimedAmount)}** from ${latestClaimedSource} has already been credited. If my DM receipt did not show up, your chips still landed.`,
        `Your latest vote reward of **${ctx.chipsAmount(latestClaimedAmount)}** from ${latestClaimedSource} has already been credited. If the DM receipt did not show up, your chips still landed.`
      )
    });
  } else {
    embed.addFields({
      name: say(`${emoji('loveLetter')} Delivery`, `${emoji('loveLetter')} Delivery`),
      value: say(
        'Rewards are credited automatically — keep an eye on my DMs after each vote.',
        'Rewards are credited automatically. Watch your DMs for the confirmation after every vote.'
      )
    });
  }

  const topggCooldown = getSourceCooldown(summary, 'topgg');
  const dblCooldown = getSourceCooldown(summary, 'dbl');
  if (topggCooldown.active || dblCooldown.active) {
    const lines = [];
    if (topggCooldown.active && topggCooldown.expiresAt) {
      lines.push(`- Top.gg: <t:${topggCooldown.expiresAt}:R>`);
    }
    if (dblCooldown.active && dblCooldown.expiresAt) {
      lines.push(`- DiscordBotList.com: <t:${dblCooldown.expiresAt}:R>`);
    }
    embed.addFields({
      name: say(`${emoji('hourglass')} Vote Cooldown`, `${emoji('hourglass')} Vote Cooldown`),
      value: say(
        `You already spoiled me with a vote. Site timers:\n${lines.join('\n')}\n${emoji('kiss')}`,
        `Your next vote windows by site:\n${lines.join('\n')}\nEach site resets every ${Math.round(VOTE_COOLDOWN_SECONDS / 3600)} hours.`
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
      const siteCooldown = getSourceCooldown(summary, String(site?.id || ''));
      const isOnCooldown = siteCooldown.active;
      const button = new ButtonBuilder()
        .setLabel(site.label)
        .setURL(site.url)
        .setStyle(ButtonStyle.Link);
      if (site.emoji) {
        button.setEmoji(site.emoji);
      }
      // Link buttons cannot be disabled via setDisabled, so we indicate cooldown in the label
      if (isOnCooldown) {
        button.setLabel(`${site.label} (on cooldown)`);
      }
      row.addComponents(button);
    }
    components.push(row);
  }

  return { embeds: [embed], components };
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
  return interaction.reply({ ...payload, ephemeral: true });
}

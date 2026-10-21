import { markVoteRewardDmStatus } from '../db/db.auto.mjs';
import { chipsAmount } from '../games/format.mjs';
import { describeBreakdown } from '../services/votes.mjs';
import { emoji } from '../lib/emojis.mjs';
import { VOTE_REWARD_DM_CONCURRENCY } from './config.mjs';

async function sendVoteRewardDm(client, entry) {
  const user = await client.users.fetch(entry.userId);
  const amount = chipsAmount(entry.claimedTotal || 0);
  const breakdownText = describeBreakdown(entry.breakdown || []);
  const sources = breakdownText || 'your recent votes';
  const message = `${emoji('partyPopper')} Thanks for voting (${sources})! I just credited **${amount}** to your chips.`;
  await user.send(message);
}

async function updateVoteRewardDmDeliveryStatus(entry, { sent, error = null } = {}) {
  const voteRewardIds = Array.isArray(entry?.claimedRewards)
    ? entry.claimedRewards
        .map(reward => Number(reward?.id))
        .filter(id => Number.isInteger(id) && id > 0)
    : [];
  if (!voteRewardIds.length) return;
  try {
    await markVoteRewardDmStatus(voteRewardIds, {
      sent,
      timestamp: Math.floor(Date.now() / 1000),
      error: error?.message || error || null,
    });
  } catch (statusErr) {
    console.error('Failed to persist vote reward DM delivery status', entry?.userId, statusErr);
  }
}

export async function deliverVoteRewardDms(client, entries, concurrency = VOTE_REWARD_DM_CONCURRENCY) {
  const queue = Array.isArray(entries) ? entries : [];
  if (!queue.length) return;
  const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), queue.length);
  let cursor = 0;
  const nextEntry = () => {
    if (cursor >= queue.length) return null;
    const current = queue[cursor];
    cursor += 1;
    return current;
  };

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const entry = nextEntry();
      if (!entry) return;
      try {
        await sendVoteRewardDm(client, entry);
        await updateVoteRewardDmDeliveryStatus(entry, { sent: true });
      } catch (err) {
        await updateVoteRewardDmDeliveryStatus(entry, { sent: false, error: err });
        console.error('Failed to DM vote reward notice', entry.userId, err);
      }
    }
  });

  await Promise.all(workers);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVoteResponse } from '../src/commands/vote.mjs';

function buildCtx() {
  return {
    chipsAmount(amount) {
      return `${Number(amount).toLocaleString()} chips`;
    },
  };
}

test('behavior: vote response shows credited fallback when latest reward DM failed', async () => {
  const payload = buildVoteResponse({
    ctx: buildCtx(),
    kittenMode: false,
    sites: [],
    summary: {
      totalPendingAmount: 0,
      breakdown: [],
      recentClaimedRewards: [
        {
          source: 'topgg',
          reward_amount: 400,
          claimed_at: 1776531278,
          dm_failed_at: 1776531280,
        },
      ],
    },
  });

  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.fields[0].name.includes('Delivery'), true);
  assert.match(embed.fields[0].value, /400 chips/);
  assert.match(embed.fields[0].value, /could not deliver the confirmation DM/);
  assert.match(embed.fields[0].value, /chips still landed/);
});

test('behavior: vote response shows in-flight status for pending rewards', async () => {
  const payload = buildVoteResponse({
    ctx: buildCtx(),
    kittenMode: false,
    sites: [],
    summary: {
      totalPendingAmount: 1000,
      breakdown: [{ source: 'topgg', count: 1, total: 1000 }],
      recentClaimedRewards: [],
    },
  });

  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.fields[0].name.includes('In Flight'), true);
  assert.match(embed.fields[0].value, /1,000 chips/);
  assert.match(embed.fields[0].value, /I’ll DM you as soon as they drop/);
});
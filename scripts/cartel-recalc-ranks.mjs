#!/usr/bin/env node
import 'dotenv/config';
import {
  listCartelGuildIds,
  listCartelInvestors,
  cartelSetRankAndXp
} from '../src/db/db.auto.mjs';
import { xpToNextForRank } from '../src/cartel/progression.mjs';
import { CARTEL_MAX_RANK } from '../src/cartel/constants.mjs';

// Historic XP requirements (Rank 1→2 .. Rank 9→10) from the pre-curve patch.
const LEGACY_XP_TO_NEXT = [196, 391, 783, 1566, 3131, 6262, 12524, 25049, 50098];

function legacyTotalXp(rank, rankXp) {
  const safeRank = Math.max(1, Number(rank) || 1);
  const remainder = Math.max(0, Number(rankXp) || 0);
  let total = remainder;
  for (let idx = 1; idx < safeRank; idx += 1) {
    const legacy = LEGACY_XP_TO_NEXT[idx - 1] || 0;
    total += legacy;
  }
  return total;
}

function projectToNewCurve(totalXp) {
  let rank = 1;
  let xpRemainder = Math.max(0, Math.floor(Number(totalXp) || 0));
  while (rank < CARTEL_MAX_RANK) {
    const needed = xpToNextForRank(rank);
    if (needed <= 0 || xpRemainder < needed) break;
    xpRemainder -= needed;
    rank += 1;
  }
  if (rank >= CARTEL_MAX_RANK) {
    rank = CARTEL_MAX_RANK;
    xpRemainder = 0;
  }
  return { rank, rankXp: xpRemainder };
}

async function reconcileRanks() {
  const guildIds = await listCartelGuildIds();
  if (!guildIds.length) {
    console.log('No cartel-enabled guilds found.');
    return;
  }

  let totalInvestors = 0;
  let updatedInvestors = 0;

  for (const guildId of guildIds) {
    const investors = await listCartelInvestors(guildId);
    if (!investors?.length) continue;

    for (const investor of investors) {
      totalInvestors += 1;
      const currentRank = Number(investor.rank || 1);
      const currentRankXp = Number(investor.rank_xp || 0);
      const totalXp = legacyTotalXp(currentRank, currentRankXp);
      const projected = projectToNewCurve(totalXp);

      if (projected.rank === currentRank && projected.rankXp === currentRankXp) {
        continue;
      }

      await cartelSetRankAndXp(guildId, investor.user_id, projected.rank, projected.rankXp);
      updatedInvestors += 1;
      console.log(
        `[${guildId}] ${investor.user_id}: ${currentRank} (${currentRankXp} XP) -> ${projected.rank} (${projected.rankXp} XP)`
      );
    }
  }

  console.log(`Processed ${totalInvestors} investors; updated ${updatedInvestors}.`);
}

reconcileRanks().catch(err => {
  console.error('Cartel rank reconciliation failed:', err);
  process.exitCode = 1;
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../src/cartel/service.mjs';
import {
  CARTEL_RAID_THRESHOLDS,
  CARTEL_RAID_FINE_MULTIPLIER,
  CARTEL_WAREHOUSE_HEAT_PER_GRAM,
  MG_PER_GRAM
} from '../src/cartel/constants.mjs';

function warehouseMgForHeat(heat) {
  const grams = Math.ceil(Number(heat || 0) / CARTEL_WAREHOUSE_HEAT_PER_GRAM);
  return Math.max(0, grams * MG_PER_GRAM);
}

test('unit: heat calculation boundary values', () => {
  const lowBoundaryHeat = __test__.calculateWarehouseHeat({ warehouse_mg: warehouseMgForHeat(CARTEL_RAID_THRESHOLDS.LOW.heat) });
  const medBoundaryHeat = __test__.calculateWarehouseHeat({ warehouse_mg: warehouseMgForHeat(CARTEL_RAID_THRESHOLDS.MED.heat) });
  const highBoundaryHeat = __test__.calculateWarehouseHeat({ warehouse_mg: warehouseMgForHeat(CARTEL_RAID_THRESHOLDS.HIGH.heat) });
  const extremeBoundaryHeat = __test__.calculateWarehouseHeat({ warehouse_mg: warehouseMgForHeat(CARTEL_RAID_THRESHOLDS.EXTREME.heat) });

  assert.equal(__test__.calculateWarehouseHeat({ warehouse_mg: 0 }), 0);
  assert.equal(__test__.calculateWarehouseHeat({ warehouse_mg: -5000 }), 0);
  assert.ok(lowBoundaryHeat >= CARTEL_RAID_THRESHOLDS.LOW.heat);
  assert.ok(medBoundaryHeat >= CARTEL_RAID_THRESHOLDS.MED.heat);
  assert.ok(highBoundaryHeat >= CARTEL_RAID_THRESHOLDS.HIGH.heat);
  assert.ok(extremeBoundaryHeat >= CARTEL_RAID_THRESHOLDS.EXTREME.heat);
});

test('unit: tier mapping and d20 threshold behavior', () => {
  const lowTier = __test__.raidTierForHeat(CARTEL_RAID_THRESHOLDS.LOW.heat);
  const medTier = __test__.raidTierForHeat(CARTEL_RAID_THRESHOLDS.MED.heat);
  const highTier = __test__.raidTierForHeat(CARTEL_RAID_THRESHOLDS.HIGH.heat);
  const extremeTier = __test__.raidTierForHeat(CARTEL_RAID_THRESHOLDS.EXTREME.heat);

  assert.equal(lowTier.name, 'LOW');
  assert.equal(medTier.name, 'MED');
  assert.equal(highTier.name, 'HIGH');
  assert.equal(extremeTier.name, 'EXTREME');

  const lowHeatInvestor = { warehouse_mg: warehouseMgForHeat(CARTEL_RAID_THRESHOLDS.LOW.heat) };
  const lowTriggered = __test__.rollRaidIfNeeded(lowHeatInvestor, (() => {
    let i = 0;
    const seq = [0.01, 0.2];
    return () => seq[i++] ?? 1;
  })());
  const lowNotTriggered = __test__.rollRaidIfNeeded(lowHeatInvestor, (() => {
    let i = 0;
    const seq = [0.2, 0.2];
    return () => seq[i++] ?? 1;
  })());

  assert.equal(lowTriggered.triggered, true);
  assert.equal(lowNotTriggered.triggered, false);
});

test('unit: 50 percent success branch behavior', () => {
  const extremeInvestor = { warehouse_mg: warehouseMgForHeat(CARTEL_RAID_THRESHOLDS.EXTREME.heat) };

  const successResult = __test__.rollRaidIfNeeded(extremeInvestor, (() => {
    let i = 0;
    const seq = [0.5, 0.49];
    return () => seq[i++] ?? 1;
  })());

  const failResult = __test__.rollRaidIfNeeded(extremeInvestor, (() => {
    let i = 0;
    const seq = [0.5, 0.5];
    return () => seq[i++] ?? 1;
  })());

  assert.equal(successResult.triggered, true);
  assert.equal(successResult.success, true);
  assert.equal(failResult.triggered, true);
  assert.equal(failResult.success, false);
});

test('unit: raid scope for collect action includes warehouse and collected semuta', async () => {
  let capturedRequest = null;
  const summary = await __test__.resolveWarehouseRaidAfterAction(
    'g1',
    'u1',
    'collect',
    { warehouse_mg: 20_000, stash_mg: 8_000 },
    { warehouseMg: 15_000, collectedMg: 7_000 },
    {
      rollRaid: () => ({ triggered: true, success: true, heat: 100, roll: 3, tier: 'MED', triggerThreshold: 7 }),
      applyRaidOutcome: async (_guildId, _userId, request) => {
        capturedRequest = request;
        return {
          confiscatedWarehouseMg: 15_000,
          confiscatedCollectedMg: 7_000,
          confiscatedTotalMg: 22_000,
          fineChipsCharged: 132,
          fineChipsPaid: 132
        };
      },
      logRaidResolution: () => {}
    }
  );

  assert.equal(capturedRequest.confiscatedWarehouseMg, 15_000);
  assert.equal(capturedRequest.confiscatedStashMg, 7_000);
  assert.equal(capturedRequest.finePerGram, CARTEL_RAID_FINE_MULTIPLIER);
  assert.equal(summary.confiscatedWarehouseMg, 15_000);
  assert.equal(summary.confiscatedCollectedMg, 7_000);
});

test('unit: raid scope for burn and export uses full pre-action warehouse and excludes collected semuta', async () => {
  const calls = [];
  const options = {
    rollRaid: () => ({ triggered: true, success: true, heat: 100, roll: 2, tier: 'MED', triggerThreshold: 7 }),
    applyRaidOutcome: async (_guildId, _userId, request) => {
      calls.push(request);
      return {
        confiscatedWarehouseMg: request.confiscatedWarehouseMg,
        confiscatedCollectedMg: request.confiscatedStashMg,
        confiscatedTotalMg: request.confiscatedWarehouseMg + request.confiscatedStashMg,
        fineChipsCharged: 0,
        fineChipsPaid: 0
      };
    },
    logRaidResolution: () => {}
  };

  await __test__.resolveWarehouseRaidAfterAction(
    'g1',
    'u1',
    'burn',
    { warehouse_mg: 11_000, stash_mg: 5_000 },
    { warehouseMg: 11_000, collectedMg: 4_000 },
    options
  );

  await __test__.resolveWarehouseRaidAfterAction(
    'g1',
    'u1',
    'export',
    { warehouse_mg: 10_000, stash_mg: 3_000 },
    { warehouseMg: 10_000, collectedMg: 3_000 },
    options
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].confiscatedWarehouseMg, 11_000);
  assert.equal(calls[0].confiscatedStashMg, 0);
  assert.equal(calls[1].confiscatedWarehouseMg, 10_000);
  assert.equal(calls[1].confiscatedStashMg, 0);
});

test('unit: confiscation and fine transaction payload behavior supports partial fine payment', async () => {
  let capturedRequest = null;
  const summary = await __test__.resolveWarehouseRaidAfterAction(
    'g1',
    'u1',
    'collect',
    { warehouse_mg: 20_000, stash_mg: 5_000 },
    { warehouseMg: 10_000, collectedMg: 5_000 },
    {
      rollRaid: () => ({ triggered: true, success: true, heat: 250, roll: 1, tier: 'HIGH', triggerThreshold: 13 }),
      applyRaidOutcome: async (_guildId, _userId, request) => {
        capturedRequest = request;
        return {
          confiscatedWarehouseMg: 10_000,
          confiscatedCollectedMg: 5_000,
          confiscatedTotalMg: 15_000,
          fineChipsCharged: 90,
          fineChipsPaid: 40
        };
      },
      logRaidResolution: () => {}
    }
  );

  assert.equal(capturedRequest.confiscatedWarehouseMg, 10_000);
  assert.equal(capturedRequest.confiscatedStashMg, 5_000);
  assert.equal(summary.fineChipsCharged, 90);
  assert.equal(summary.fineChipsPaid, 40);
  assert.equal(summary.confiscatedTotalMg, 15_000);
});

test('integration: raid resolver flow with and without raid trigger', async () => {
  let applyCalls = 0;

  const noRaid = await __test__.resolveWarehouseRaidAfterAction(
    'g1',
    'u1',
    'collect',
    { warehouse_mg: 20_000, stash_mg: 6_000 },
    { warehouseMg: 12_000, collectedMg: 4_000 },
    {
      rollRaid: () => ({ triggered: false, success: false, heat: 40, roll: 19, tier: null, triggerThreshold: 0 }),
      applyRaidOutcome: async () => {
        applyCalls += 1;
        return {
          confiscatedWarehouseMg: 0,
          confiscatedCollectedMg: 0,
          confiscatedTotalMg: 0,
          fineChipsCharged: 0,
          fineChipsPaid: 0
        };
      },
      logRaidResolution: () => {}
    }
  );

  const withRaid = await __test__.resolveWarehouseRaidAfterAction(
    'g1',
    'u1',
    'collect',
    { warehouse_mg: 20_000, stash_mg: 6_000 },
    { warehouseMg: 12_000, collectedMg: 4_000 },
    {
      rollRaid: () => ({ triggered: true, success: true, heat: 300, roll: 2, tier: 'HIGH', triggerThreshold: 13 }),
      applyRaidOutcome: async () => {
        applyCalls += 1;
        return {
          confiscatedWarehouseMg: 12_000,
          confiscatedCollectedMg: 4_000,
          confiscatedTotalMg: 16_000,
          fineChipsCharged: 96,
          fineChipsPaid: 96
        };
      },
      logRaidResolution: () => {}
    }
  );

  assert.equal(noRaid.triggered, false);
  assert.equal(noRaid.success, false);
  assert.equal(noRaid.confiscatedTotalMg, 0);
  assert.equal(withRaid.triggered, true);
  assert.equal(withRaid.success, true);
  assert.equal(withRaid.confiscatedTotalMg, 16_000);
  assert.equal(withRaid.fineChipsPaid, 96);
  assert.equal(applyCalls, 1);
});

test('unit: cartel overview investor fallback avoids null rank crash', () => {
  const investor = __test__.coerceOverviewInvestor('guild-1', '1083290728693768192', null);

  assert.equal(investor.guild_id, 'guild-1');
  assert.equal(investor.user_id, '1083290728693768192');
  assert.equal(investor.rank, 1);
  assert.equal(investor.rank_xp, 0);
  assert.equal(investor.shares, 0);
  assert.equal(investor.stash_mg, 0);
  assert.equal(investor.warehouse_mg, 0);
});

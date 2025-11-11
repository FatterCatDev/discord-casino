export const MG_PER_GRAM = 1000;

const SHARE_PRICE_DEFAULT = Math.max(1, Number(process.env.CARTEL_SHARE_PRICE || 100));
export const CARTEL_DEFAULT_SHARE_PRICE = SHARE_PRICE_DEFAULT;
export const CARTEL_SHARE_PRICE = SHARE_PRICE_DEFAULT;
export const CARTEL_DEFAULT_SHARE_RATE_GRAMS_PER_HOUR = Math.max(0.001, Number(process.env.CARTEL_SHARE_RATE_GRAMS_PER_HOUR || 0.10));
export const CARTEL_BASE_PRICE_PER_GRAM = Math.max(1, Number(process.env.CARTEL_BASE_PRICE_PER_GRAM || 3));
export const CARTEL_WAREHOUSE_FEE_BPS = Math.max(0, Number(process.env.CARTEL_WAREHOUSE_FEE_BPS || 6000));
export const CARTEL_PRODUCTION_BONUS_BPS_PER_RANK = Number(process.env.CARTEL_PRODUCTION_BONUS_BPS_PER_RANK || 200);
export const CARTEL_MIN_TICK_SECONDS = Math.max(30, Number(process.env.CARTEL_MIN_TICK_SECONDS || 300));
export const CARTEL_TICK_INTERVAL_MS = Math.max(10_000, Number(process.env.CARTEL_TICK_INTERVAL_MS || 60_000));
export const CARTEL_DEFAULT_BASE_RATE_GRAMS_PER_HOUR = Math.max(1, Number(process.env.CARTEL_BASE_RATE_GRAMS_PER_HOUR || 180));
export const CARTEL_XP_PER_GRAM_PRODUCED = Math.max(0, Number(process.env.CARTEL_XP_PER_GRAM_PRODUCED || 1));
export const CARTEL_DEFAULT_XP_PER_GRAM_SOLD = Math.max(0, Number(process.env.CARTEL_XP_PER_GRAM_SOLD || 2));
export const CARTEL_MAX_RANK = 10;
export const SEMUTA_CARTEL_USER_ID = 'SEMUTA_CARTEL';

export const CARTEL_DEALER_TIERS = [
  { id: 0, name: 'Lookout', requiredRank: 1, hireCost: 1_000, upkeepCost: 50, hourlySellCapGrams: 5, priceMultiplierBps: 8_000 },
  { id: 1, name: 'Street Runner', requiredRank: 2, hireCost: 5_000, upkeepCost: 250, hourlySellCapGrams: 10, priceMultiplierBps: 10_000 },
  { id: 2, name: 'Courier', requiredRank: 4, hireCost: 15_000, upkeepCost: 600, hourlySellCapGrams: 30, priceMultiplierBps: 10_500 },
  { id: 3, name: 'Distributor', requiredRank: 6, hireCost: 45_000, upkeepCost: 1_500, hourlySellCapGrams: 80, priceMultiplierBps: 11_000 },
  { id: 4, name: 'Route Boss', requiredRank: 8, hireCost: 120_000, upkeepCost: 3_500, hourlySellCapGrams: 180, priceMultiplierBps: 11_800 },
  { id: 5, name: 'Kingpin', requiredRank: 10, hireCost: 300_000, upkeepCost: 8_000, hourlySellCapGrams: 400, priceMultiplierBps: 12_500 }
].map(def => ({
  ...def,
  hourlySellCapMg: def.hourlySellCapGrams * MG_PER_GRAM,
  upkeepIntervalSeconds: 3600
}));

export const CARTEL_DEALER_TIERS_BY_ID = Object.fromEntries(
  CARTEL_DEALER_TIERS.map(tier => [tier.id, tier])
);

export const CARTEL_DEALER_UPKEEP_PERCENT_BY_TIER = Object.freeze({
  0: 0.50,
  1: 0.50,
  2: 0.3825,
  3: 0.265,
  4: 0.1475,
  5: 0.03
});

export const CARTEL_DEALER_NAME_POOL = Object.freeze({
  0: ['Pip Calder', 'Nix Halley', 'Sia Voss', 'Timo Lark', 'Jori Wren', 'Mave Russo', 'Koa Talos', 'Iri Penn', 'Dex Romi', 'Tali Kade', 'Rue Sorel'],
  1: ['Lexa Finch', 'Nova Pierce', 'Kade Mercer', 'Vera Locke', 'Jax Wilder', 'Mira Sloan', 'Tess Arden', 'Milo Crane', 'Rin Calder', 'Bex Rowan', 'Ivy March'],
  2: ['Cal Reyes', 'Sable Quinn', 'Noor Talbot', 'Ezra Shaw', 'Lena Crowe', 'Odin Vale', 'Juno Voss', 'Talon Pryce', 'Keira Mott', 'Briar Kline', 'Cato Mercer'],
  3: ['Rhea Calder', 'Marco Ives', 'Nolan Creed', 'Iris Calderon', 'Vale Porter', 'Harlow Vance', 'Soren Vale', 'Nyra Holt', 'Ember Shaw', 'Cassian Drew', 'Lira Beckett'],
  4: ['Selene Pryce', 'Atlas Monroe', 'Zara Bishop', 'Dante Collins', 'Rowan Hale', 'Cass Nova', 'Gideon Rook', 'Vesper Lang', 'Mara Quill', 'Daxon Pierce', 'Ren Hollis'],
  5: ['Aurora Nyx', 'Magnus Kade', 'Octavia Wren', 'Silas Dray', 'Lyra Keane', 'Corvin Slate', 'Seren Vale', 'Kael Sunder', 'Isolde Crane', 'Theron Black', 'Nyx Alecto']
});

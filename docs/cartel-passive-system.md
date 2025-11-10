# 🧪 Cartel Passive Income System

Passive income pillar where players bankroll a cartel to manufacture **Semuta**—a pile of pale blue crystals measured in grams of Semuta—then launder the product back into chips. Everything happens automatically on a scheduled worker; players only decide when to invest, upgrade, sell, or assign dealers.

---

## Player Flow Overview
1. **Invest in the Cartel** – `/cartel invest amount:<chips>` converts chips into cartel shares. Shares boost the cartel’s global production capacity and the investor’s personal production weight.
2. **Accrue Semuta** – Every tick (suggest hourly) the cartel distributes newly produced grams of Semuta to investors, scaled by their share of the pool plus personal multipliers. Overflow beyond the stash cap automatically routes into a taxable warehouse buffer that you later empty with `/cartel collect` (fee applied) or abandon (permanent burn) if you prefer not to pay.
3. **Hire/Manage Dealers** – Dealers auto-sell Semuta at configured thresholds. Higher-level dealers move more product per tick and command better prices but demand upkeep.
4. **Sell to Casino Customers** – Players can manually `/cartel sell amount:<grams>` (grams of Semuta) or let dealers handle it. Sales pay chips at the current market price.
5. **Climb Cartel Ranks** – Total grams of Semuta produced + sold unlock higher ranks, raising stash caps, unlocking premium dealers, and enabling new distribution routes.

---

## Production Model
- **Global Pool:** Keep a single `cartel_pool` record that tracks total shares bought and the base grams of Semuta generated per tick. Limited-time events or admin boosts can temporarily modify the base rate.
- **Per-Player Fields:** `shares`, `stash_grams`, `warehouse_grams`, `production_multiplier`, `last_tick_at`, and `rank`.
- **Hourly Settlement Worker:**
  1. Determine total grams of Semuta = `base_rate × global_modifiers`. Global modifiers include time-limited events and admin-tuned boosts.
  2. Each investor receives `total_semuta_grams × (player_weight / total_weight)` where `player_weight = shares × (1 + personal_multiplier + dealer_bonus)`.
  3. Apply **stash cap**: overflow always spills into a taxable warehouse buffer that stores excess Semuta until the player either runs `/cartel collect` (paying the fee) or abandons it for a permanent burn. Nothing burns automatically without confirmation.
- **Diminishing Returns:** Increase share price or reduce marginal production once a player exceeds weekly production thresholds to keep whales from owning the entire loop.

---

## Selling Mechanics
- **Base Price:** Flat chip rate per gram of Semuta set to **3 chips** by default (configurable via env/admin command if balancing requires).
- **Manual Sales:** `/cartel sell amount:<grams>` validates stash, converts grams of Semuta into chips, and logs a transaction. Add `/cartel sell all` convenience.
- **Auto-Sell Rules:** Stored on the player profile (e.g., “sell 25% whenever stash > 500g”). Dealers execute these rules first every tick before manual stash is shown.
- **Warehouse Spillover:** When stash > cap, extra grams of Semuta move into `warehouse_grams`. These grams cannot be sold until the player pays the collection fee via `/cartel collect`, which transfers a chosen amount back into the active stash (or directly into a dealer buffer if desired). Players may also choose `/cartel abandon amount:<grams>` to permanently burn overflow without paying the fee.
- **Bust Chance:** Optional per-sale RNG tied to risky dealer traits or global events; busts confiscate the sold grams of Semuta and trigger flavor text but should be rare.

---

## Dealer System
- **Acquisition:** `/cartel dealers` (Hire tab) consumes chips upfront. Unlocks gated by rank milestones (e.g., Rank 3 for Tier 2 dealers).
- **Operation:** Each dealer records:
  - `level` (1–5) defining hourly sell volume, price multiplier, and upkeep.
  - `trait` for flavor/risk (Clean Mule, Flashy Pusher, Risky Runner).
  - `status` (active, busted, paused).
  - `upkeep_due_at`; missed upkeep pauses activity and reduces loyalty (higher restart fee).
- **Sales Pipeline:** On each tick, dealers:
  1. Pull Semuta from the owner’s stash or dedicated dealer buffer.
  2. Sell up to their max grams of Semuta per tick.
  3. Apply price multiplier (e.g., Level 1 = 1.0×, Level 5 = 1.25×).
- **Bust Events:** Traits influence bust probability. On bust, dealer is seized for a cooldown; player chooses to pay a fine (chip sink) to recover sooner.

### Dealer Tier Reference
| Tier | Unlock Rank | Hire Cost | Upkeep (per hr) | Sell Cap (g Semuta/hr) | Price Multiplier | Bust Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 – Street Runner | Rank 2 | 5,000 chips | 250 chips | 10 | 1.00× | Low |
| 2 – Courier | Rank 4 | 15,000 | 600 | 30 | 1.05× | Low |
| 3 – Distributor | Rank 6 | 45,000 | 1,500 | 80 | 1.10× | Medium |
| 4 – Route Boss | Rank 8 | 120,000 | 3,500 | 180 | 1.18× | Medium |
| 5 – Kingpin | Rank 10 | 300,000 | 8,000 | 400 | 1.25× | High (mitigate via bribes) |

*(Values illustrative; tune against economy telemetry.)*

---

## Rank & Progression
- **Rank XP:** Earned from Semuta produced + sold (e.g., 1 rank XP per gram of Semuta produced, 2 XP per gram of Semuta sold). Selling incentivised over hoarding.
- **Rank Benefits:** 
  - Higher stash cap (Rank 1: 100g → Rank 10: 2,500g).
  - Production multipliers (e.g., +2% per rank).
  - Unlocks for dealers, warehouse modules, and passive “distribution routes” that buff specific dealer traits.
- **XP Curve:** Rank ups follow an exponential track (Rank 2 unlocks at ~250 XP; Rank 9→10 requires 100,000 XP) so long-term players have clear stretch goals.

| Rank | XP to Next | Stash Cap (g) |
| --- | --- | --- |
| 1 → 2 | 200 | 100 |
| 2 → 3 | 486 | 175 |
| 3 → 4 | 1,181 | 275 |
| 4 → 5 | 2,869 | 400 |
| 5 → 6 | 6,971 | 600 |
| 6 → 7 | 16,938 | 850 |
| 7 → 8 | 41,156 | 1,150 |
| 8 → 9 | 100,000 | 1,550 |
| 9 → 10 | MAX | 2,500 |
- **Prestige Option:** Optional rebirth resetting rank for cosmetic title + permanent production boost to keep vets engaged.

---

## Risk & World Events
- **Police Crackdown:** Triggered when cartel sales exceed a quota or via admin action. Reduces sale price by 20% and halves dealer output for 2 ticks unless players contribute chips to a community bribe goal.
- **Supply Surplus:** Boosts production 50% for a day but increases bust chance for risky dealers. Encourages coordinated selling afterwards.
- **Dealer Crackdown:** Targets a random dealer tier; all dealers of that tier suffer +15% bust chance temporarily.
- **Admin Hooks:** `/cartel event start type:<id>` to force events or set temporary production/sale modifiers for live ops.

---

## Economy Guardrails
- **House Liquidity Check:** Before paying chip proceeds, ensure `house_balance - pending_payouts > floor`. If not, automatically haircut sale payouts (e.g., max 50% of requested grams of Semuta) and surface a warning embed.
- **Global Soft Caps:** Once total cartel production for the week exceeds a configured ceiling, reduce base price or production until reset.
- **Personal Cooldown:** After selling above a high threshold in 24h, impose a short cooldown or reduced price to avoid instant cash-outs.
- **Audit Logging:** Every invest, production tick, dealer sale, and event writes to `cartel_transactions` for moderators.

---

## Slash Command Surface
| Command | Purpose |
| --- | --- |
| `/cartel overview [user]` | Shows investment summary, stash, dealers, and next production tick. |
| `/cartel invest amount:<chips>` | Buy cartel shares; embed reports new production weight. |
| `/cartel sell amount:<grams>` / `all` | Convert grams of Semuta to chips at the current price. |
| `/cartel collect amount:<grams>` / `all` | Pay the warehouse fee to move overflow grams of Semuta back into the active stash (or straight into dealer buffers). |
| `/cartel abandon amount:<grams>` / `all` | Confirm a permanent burn of warehouse overflow (grams of Semuta) to avoid collection fees. |
| `/cartel dealers` | Opens the dealer recruitment board with List / Hire / Upkeep buttons. |
| `/cartel upgrades` | Manage rank-based upgrades (stash expansions, distribution routes). |
| `/cartel admin ...` | Staff utilities: adjust rates, trigger events, wipe busted dealers, run diagnostics. |

UX tip: embed should highlight grams of Semuta ready to sell, projected hourly income, and warnings (stash near cap, warehouse backlog awaiting collect, unpaid upkeep, paused dealers).

---

## Data Model Sketch
- **cartel_pool**  
  `id`, `total_shares`, `base_rate`, `last_tick_at`, `event_state`.
- **cartel_investors**  
  `user_id`, `shares`, `rank`, `rank_xp`, `stash_grams`, `warehouse_grams`, `stash_cap`, `production_multiplier`, `auto_sell_rule`, `last_tick_at`.
- **cartel_dealers**  
  `dealer_id`, `user_id`, `tier`, `trait`, `status`, `sell_cap`, `price_multiplier`, `upkeep_due_at`, `bust_until`, `lifetime_sold`.
- **cartel_events**  
  `event_id`, `type`, `state`, `ends_at`, `metadata`.
- **cartel_transactions**  
  `tx_id`, `user_id`, `type` (`INVEST`, `SELL`, `COLLECT_FEE`, `WAREHOUSE_BURN`, `DEALER_UPKEEP`, `EVENT_FINE`), `amount_chips`, `amount_grams`, `created_at`.
- **cartel_metrics (optional)** for aggregations (daily production, payouts).

---

## Implementation Phases
1. **Economy Design Finalization** – Lock share pricing curve, base production, stash caps, sale price, and guardrails with spreadsheets/sims.
2. **Database + Models** – Create tables, migrations, and ORM helpers for pool, investors, dealers, events, and logs.
3. **Settlement Worker** – Scheduled job to (a) run production tick, (b) route overflow into warehouses, (c) process dealer auto-sells/upkeep, (d) apply event modifiers, (e) queue chip transfers.
4. **Slash Commands & Embeds** – Build `/cartel overview`, invest, sell, dealer management, and admin commands with clear status messaging.
5. **Event & Risk Layer** – Implement global events, dealer bust logic, and community bribe goals.
6. **Telemetry & Balancing** – Add metrics (prometheus/log channel) for grams of Semuta produced, chips paid, dealer uptime. Iterate on rates before full release.
7. **QA & Launch Playbook** – Unit tests for settlement math, integration tests for commands, dry-run in staging guild, then ship with admin knobs ready.

---

## Balancing Considerations
- Target Semuta-to-chip ROI to sit slightly below optimal active play so passive investors still play games.
- Monitor House reserve impact; enforce real-time throttles if payouts threaten liquidity.
- Keep upkeep meaningful so abandoned dealers don’t supply infinite chips.
- Use rotating events to create shared narrative moments that motivate guild-wide cooperation.

This document outlines the mechanical blueprint; next steps are economy tuning, UI mockups, and technical decomposition into services/commands.

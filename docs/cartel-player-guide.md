# 🔥 Semuta Cartel Play Guide

Semuta Cartel is the passive-income backbone of Discord Casino. Every `/cartel` run opens a control panel where you turn chips into cartel shares, refine pale-blue **Semuta**, and sell it back to the casino for steady payouts. This guide keeps things player-focused—nothing in here requires admin or mod powers. 💪

## ⚡ Core Loop (TL;DR)
- 🛰️ Run `/cartel` inside your casino channel to open the live panel, then tap **Refresh** anytime you need the newest numbers.
- 💎 Grab **Cartel Shares** to boost your hourly Semuta production; more shares = bigger cut of each tick.
- 📉 Use **Sell Stash** to convert grams of Semuta into chips and **Collect Warehouse** only when overflow stacks up.
- 🧑‍🤝‍🧑 Hire dealers from the **Dealers** view so they auto-sell for you, keep upkeep timers green, and scoop their payouts with **Collect Chips**.
- 📊 Tap **Rank XP Table** to see how close you are to the next rank; selling Semuta or cashing out dealer chips gives cartel XP.

## 💎 Shares & Production
- 📈 **Share price & rate** – Shares start around <:chips:1427947979758637096>100 chips each and each share refines roughly 0.10 g of Semuta per hour before bonuses. Prices crawl up as the guild-wide pool grows, so the sooner you buy, the cheaper your stake.
- 🔁 **Ticks run at least every ~5 minutes**. Each tick adds Semuta to your stash based on your share count, rank multiplier, and pool percentage. Hit **Refresh** to pull the latest tick math.
- 🔍 **Cartel Shares view** – Buttons inside this view let you:
  - **Buy**: Browse sell posts from other players or grab the built-in `Semuta Cartel` listing for instant shares at the current sell price.
  - **Sell**: Pick a buy post or use the infinite `Semuta Cartel` bid (pays roughly half the sell price) to liquidate shares fast.
  - **Posts**: Review every buy/sell order you created, then cancel or repost as needed.
- 🧠 **Order tips** – Orders auto-expire after 14 days, and each post caps at 1,000,000 shares / <:chips:1427947979758637096>1,000,000 chips. Use the **Post Buy Order** or **Post Sell Order** buttons to set your own price targets when the market is quiet.

## 📦 Stash, Warehouse & Fees
- 🧊 **Stash cap** – Each rank unlocks more free storage (Rank 1 = 100 g, Rank 10 = 2,500 g). Keep the stash below cap so production never pauses.
- 📦 **Warehouse overflow** – Extra Semuta above the cap flows into a warehouse buffer. It never disappears, but pulling it back with **Collect Warehouse** charges a 60 % fee on the chip value and requires chips in your wallet to pay that fee. Use it as an emergency safety net—not primary storage.
- ♻️ **Best practices**
  - Sell a chunk whenever the stash meter nears the cap.
  - Level up ranks to widen the cap and unlock more dealer slots.
  - If you don’t want to pay the warehouse fee yet, just leave overflow parked until you’re ready (dealers can’t touch warehouse stock).

## 💥 Selling Semuta
- 🕹️ **Sell Stash mini-game** – Enter a gram amount (or type `ALL`), then survive a 20‑tick lane-dodging mini-game. `🚓` police end the run with zero payout, while `🕳️` potholes halve what’s left. Make it to the end to sell at the base market rate (<:chips:1427947979758637096>3 chips per gram by default).
- 🧾 **Receipt** – Successful runs show the grams sold, chips earned, and update the overview embed automatically. Failed runs refund whatever Semuta never left your stash.
- 🪙 **Warehouse pulls** – Only stash grams can be sold. If overflow is locked away, tap **Collect Warehouse**, pay the fee, and the chosen amount slides back into the stash so you can sell it or feed your dealers.

## 🤝 Dealer Network
- 🗂️ **Tabs** – Inside **Dealers**, use the `List`, `Hire`, and `Upkeep` tabs to see payroll, scout new hires, or settle timers. The green **Collect Chips** button lights up whenever pending sales are waiting.
- 🧑‍💼 **Hiring** – Each dealer gets a codename, hourly sell cap, price multiplier, and upkeep percentage. Your dealer cap is `rank + 1` (minimum 2), so ranking up literally expands your crew.
- ⏰ **Upkeep** – Dealers auto-attempt to pull the recommended upkeep from your chips when their timer expires. If you don’t have enough, they pause instead of quitting—pay the overdue timer to resume runs.
- 💰 **Payouts & XP** – Dealers sell straight from your stash. When you press **Collect Chips** you get the chips plus cartel XP for every gram they moved.

| Tier | Unlock Rank | Hire Cost | Upkeep/hr | Sell Cap (g/hr) | Price Boost |
| --- | --- | --- | --- | --- | --- |
| 🔭 Lookout | 1 | <:chips:1427947979758637096>1,000 chips | <:chips:1427947979758637096>50 chips | 5 | 0.80× |
| 🛴 Street Runner | 2 | <:chips:1427947979758637096>5,000 chips | <:chips:1427947979758637096>250 chips | 10 | 1.00× |
| 🚚 Courier | 4 | <:chips:1427947979758637096>15,000 chips | <:chips:1427947979758637096>600 chips | 30 | 1.05× |
| 📦 Distributor | 6 | <:chips:1427947979758637096>45,000 chips | <:chips:1427947979758637096>1,500 chips | 80 | 1.10× |
| 🛰️ Route Boss | 8 | <:chips:1427947979758637096>120,000 chips | <:chips:1427947979758637096>3,500 chips | 180 | 1.18× |
| 👑 Kingpin | 10 | <:chips:1427947979758637096>300,000 chips | <:chips:1427947979758637096>8,000 chips | 400 | 1.25× |

> 💡 Dealers need Semuta in your stash to stay busy. If the stash hits zero, they idle until you restock.

## 📈 Share Market Moves
- 🛒 **Buy tab** – Select a sell listing, hit **Enter Shares to Buy**, confirm how many shares you want, and the bot pulls the chips plus adds the shares instantly.
- 💱 **Sell tab** – Select a buy listing, confirm the share count, and you’ll get chips at that order’s price while the shares disappear from your wallet.
- 📮 **Posts tab** – Shows every open order you posted. Select one to highlight it, then tap **Cancel Order** if you want your chips or shares released back to you.
- 🧮 **Price logic** – The built-in `Semuta Cartel` listing sells to you at ~<:chips:1427947979758637096>`100 + (total shares × 0.001)` chips each and buys back at roughly half that. Guild demand pushes the player market above or below that anchor, so flipping shares is a real play.

## 🏅 Rank & XP Progression
- ✨ **XP sources** – Selling stash manually or collecting dealer chips grants XP equal to grams sold × the current XP-per-gram rate (defaults to 2 XP/g). You’ll see XP popups in the follow-up message whenever progress lands.
- 📊 **Rank XP Table button** – Shows the exact XP needed for every rank and highlights your current tier. Quick reference: Rank 1 → 2 needs 150 XP, Rank 5 caps your stash at 600 g, and Rank 10 tops out at 2,500 g.
- 🧱 **Why rank matters** – Higher ranks increase stash cap, add more dealer slots, and multiply production (rank is part of the weight formula the worker uses each tick). Keep the grind going even if you’re AFK by letting dealers sell around the clock.

## 🗓️ Daily & Weekly Checklist
- 📥 Run `/cartel`, **Refresh**, and skim the overview every time you log in.
- 💸 Buy shares whenever you have idle chips so your hourly grams keep climbing.
- 🚚 Queue at least one manual **Sell Stash** per day to keep cash flowing—and to enjoy the mini-game bragging rights.
- 🧑‍🤝‍🧑 Check the **Dealers → Upkeep** tab; pay anything turning red and fire underperformers to free slots.
- 🪙 Collect dealer chips, then immediately reinvest a portion into more shares or upkeep.
- 🏆 Peek at **Rank XP Table** before logging off so you know how much Semuta to move tomorrow.

Keep this loop humming and you’ll turn the Semuta Cartel into a fully automated chip printer—no admin toggles required. Happy hustling! 😎

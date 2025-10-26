# Semuta Casino Games & Jobs Guide

Semuta Casino packs the Discord Casino Bot with fast-paced minigames, global leaderboards, and a progression system that follows you across every server. Use this guide to learn how each game works, how to launch it, and what to expect from the three shift-based jobs.

## Getting Set Up
- Ask your server’s staff to configure a dedicated casino category with `/setcasinocategory`. Game commands only run inside channels or threads under that category.
- Bets pull from **Credits first** and then Chips. Credits burn on losses; House-paid Chips land in your wallet on wins.
- Sessions expire after two minutes of inactivity. When that happens, the bot resolves the game automatically and posts a summary.
- Before you play, check `/balance`, grab your `/dailyspin`, and peek at `/leaderboard` to see how you rank.

## Table & Arcade Games

### Ride the Bus
- **Command:** `/ridebus bet:<amount>`
- **Goal:** Clear four rounds of higher/lower and red/black guesses to multiply your stake up to 10×.
- **How it works:** Each “Quarter” asks you to predict the next card. Survive to Q4 to claim the top payout; you can cash out safely after Q3 for a smaller win.
- **Key rules:** The bot verifies the House vault before the run so there is always enough cover. Per-guild max bet defaults to 1,000 and can be changed with `/setmaxbet`. Inactivity for two minutes forfeits the run.

### Blackjack
- **Command:** `/blackjack table:<Low|High> bet:<amount>`
- **Goal:** Beat the dealer without busting using classic blackjack mechanics.
- **How it works:** Choose the `LOW` table (bets ≤99, dealer stands on 17) or `HIGH` table (bets ≥100, dealer hits soft 17). You can `Hit`, `Stand`, `Double`, and `Split` when the hand allows. Pairs trigger split prompts if you have enough balance.
- **Key rules:** Coverage checks ensure the House can pay potential double/split exposure. Natural blackjacks pay 3:2. Inactivity closes the hand and resolves the bet.

### Slots
- **Command:** `/slots bet:<amount>`
- **Goal:** Spin a 5×3, 20-line video slot and line up symbols for chip payouts.
- **How it works:** Your stake divides across 20 fixed lines. Tap “Spin Again” to re-roll instantly or open “Pay Table” to see symbol values.
- **Key rules:** Stakes spend Credits first; payouts always arrive as Chips. Results round down to whole credits before converting. Sessions end after two idle minutes.

### Roulette (American)
- **Command:** `/roulette`
- **Goal:** Place inside and outside bets, spin the wheel, and collect up to 35:1 payouts.
- **How it works:** Use the interactive embed to stack chips on red/black, odd/even, dozens, columns, streets, corners, or zero selections. Confirm the board to spin.
- **Key rules:** Multiple bets share the same drop. Bets exceeding House coverage are rejected automatically. Results embed shows spin outcome, per-bet win/loss, and net change.

### Dice War
- **Command:** `/dicewar bet:<amount>`
- **Goal:** Roll higher than the House on 2d6; doubles on a win pay double.
- **How it works:** You and the House roll pairs of dice. Play again with the same stake by pressing the “Play Again” button while the session is active.
- **Key rules:** Ties go to the House. Sessions auto-close after two idle minutes and the summary records total wins, losses, and net chips.

### Horse Race
- **Command:** `/horserace bet:<amount> horse:<1-5>` (options appear when the host launches the race)
- **Goal:** Pick the horse that crosses the finish line first in a ten-stage sprint.
- **How it works:** Five horses draw names from a 20-runner stable. Each stage updates the track embed and opens a 2.5-second window to swap picks (fees scale with the stage number). Staff or the race host starts the countdown from the setup embed.
- **Key rules:** Winners earn a 4× payout; losers burn their stake. Coverage checks ensure the House can pay before betting opens. The summary card highlights winning odds, swap fees, and net changes.

### Texas Hold’em
- **Command:** `/holdem preset:<table>` (hosts) followed by seating and in-table buttons for players
- **Goal:** Run a full Texas Hold’em table with friends using Discord-native controls.
- **How it works:** The host chooses a preset that includes buy-in, blinds, and rake. The bot creates a temporary `#holdem-table-N` channel inside the casino category, posts the table card, and deals private hole cards via DMs. Players join seats, post blinds, and use buttons for bet, call, raise, check, or fold actions. The bot manages side pots, all-ins, burn-and-turn, and winner determination.
- **Key rules:** Turn timers warn players before auto-folding inactive seats. Hosts can kick AFK players. Rake defaults per guild via `/setrake`. Channels auto-close when empty or idle. Coverage checks verify the House bank before buy-ins.

## Job System

### Global Job Overview
- **Command hub:** `/job`
- **Purpose:** Earn steady chips and XP through single-stage minigames that persist across every server using the bot.
- **Stamina:** You start with five charges. Each shift consumes one charge; charges regenerate every two hours while under the cap. `/job reset` (admin) can refill you for events.
- **Ranks & XP:** Each job tracks ranks 1–10 with XP thresholds. Higher ranks raise base payouts and tip ceilings.
- **Rewards:** After each shift you receive base pay, bonus tips (0–20%), and XP. The bot logs settlements to the configured cash log if enabled.
- **Session flow:** Launch a shift from the `/job` panel or `/job start job:<id>`, complete the single scenario, and review the completion embed for score, earnings, and stamina. Inactivity ends the shift and records an incomplete run.

### Bartender
- **Launch command:** `/job start job:bartender`
- **Minigame:** Build cocktails by selecting the correct ingredients and finishing technique (shake or stir) before time penalties stack.
- **Scoring:** Each order is worth up to 100 performance points (scaled from 20). Penalties trigger at 5 s (−1), 7 s (−2), and 15 s (−5). Three mistakes zero the run.
- **Tips to win:** Read the recipe embed carefully, keep a steady pace, and aim for perfect builds to maximise tip potential.

### Card Dealer
- **Launch command:** `/job start job:dealer`
- **Minigame:** Evaluate three player hands against a community board and choose the winner or call a split.
- **Scoring:** Answer quickly for bonus points—under 15 s earns the full value, 15–30 s drops to 18, 30–40 s to 15, and it scales down afterward. You have up to three attempts before the shift busts.
- **Tips to win:** Memorise hand rankings, weigh kickers, and double-check splits to avoid penalties.

### Bouncer
- **Launch command:** `/job start job:bouncer`
- **Minigame:** Review a guest checklist (age, dress code, wristband, guest list) and accept or reject the right patrons using a multi-select prompt.
- **Scoring:** Three mistakes end the shift; accuracy and speed boost the final performance score.
- **Tips to win:** Cross-reference every requirement, especially wristbands and dress codes, before making a call.

## Helpful Commands & Resources
- `/job stats [user]` shows your ranks, recent shifts, and stamina.
- `/request type:buyin amount:<chips>` or `/request type:cashout amount:<chips>` handles big economy moves with staff oversight.
- `/housebalance` lets moderators confirm the shared vault has enough cover before events.
- `/setmaxbet`, `/setrake`, and `/requesttimer` help staff tune risk and pacing.

Use this guide as a reference whenever you host events, onboard new players, or plan seasonal casino nights. The Discord Casino Bot keeps the action synchronised everywhere—just mind your stamina, keep an eye on the timer, and let Semuta Casino handle the rest.

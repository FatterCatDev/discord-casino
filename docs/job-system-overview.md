# 💼 Casino Job System Overview

The job system lets every player earn chips and experience (XP) through skill-based shifts that persist across **every Discord server** running Semuta Casino. Your progress, stamina, and rewards are global, so the bartending streak you start in one guild continues wherever you clock in next.

---

## Why Run Shifts?

- **Reliable income:** Shifts pay chips in addition to standard games, scaling with your rank and performance grade.
- **Progression:** Each run grants XP, pushing you through ten ranks per job. Higher ranks unlock larger base payouts.
- **Global identity:** Stamina, cooldowns, and ranks are shared—your `/job` profile is the same in every guild.
- **Variety:** Three launch roles (Bartender, Dealer, Bouncer) offer distinct minigames with unique scoring rules.

---

## Core Concepts

| Concept | Details |
| --- | --- |
| **Stamina** | You start with **5 charges**. Each shift consumes one. Charges regenerate every 2 hours while below cap. `/job reset` (admin) instantly refills to five. |
| **Stamina Cooldown** | When charges drop below five, a regen timer starts. `/job` shows remaining time and <t:…:R> tags. |
| **Shift** | A five-stage minigame tailored to your job. Complete all stages for max XP and chips; failure still grants partial info but reduces score. |
| **Performance Score** | 0–100 points calculated from accuracy, speed, and penalties. Determines XP + base pay. |
| **Rank & XP** | Every job tracks rank 1–10. XP to next rank decreases as you earn; promotions increase max base pay. |
| **Tips** | Random bonus (0–20%) rolled at settlement. Higher performance improves average payouts. |

---

## `/job` Command Suite

| Command | Use Case |
| --- | --- |
| `/job` or `/job overview` | Opens the **Job Status Panel**. Browse stamina, recent shifts, per-job cards, and launch buttons. |
| `/job start job:<id>` | Begin a shift for `bartender`, `dealer`, or `bouncer`. Also accessible via the panel’s **Start Shift** button. |
| `/job cancel` | Abort your active shift. No XP or chips, but the session closes cleanly. |
| `/job stats [user]` | View detailed stats (stamina, ranks, recent runs) for yourself or another user (ephemeral if inspecting someone else). |
| `/job reset user:<@User>` *(admin)* | Instantly refills a player’s stamina to 5 charges and clears cooldown timers. Useful for events or mistakes. |
| `/job resetstats user:<@User>` *(admin)* | Resets a player’s ranks, XP, and stamina across all jobs. Use for rerolls or disciplinary wipes. |

All `/job` subcommands accept a `user` option to target another player when you have permission.

---

## Job Status Panel Walkthrough

1. **Main Tab:**
   - Global stamina snapshot (`ready`, `next charge`, `cooldown reason`).
   - Recent shifts list with job icon, score, state, and completion timestamp.
2. **Role Tabs (Bartender/Dealer/Bouncer):**
   - Flavor text + fantasy summary.
   - Progress card showing rank, total XP, XP to next rank, and last shift.
   - Role highlights and recent shifts filtered to that job.
   - `Start Shift` button when viewing your own profile.
3. **Visuals:**
   - Embedded artwork (thumbnails) swap to match the selected job.
   - Buttons persist at the bottom for quick tab switching.

The panel is interactive: selecting different buttons triggers instant updates without rerunning the command.

---

## Job Minigames

### 🍸 Bartender
- Build drinks by selecting ingredients and finishing technique (Shake/Stir).
- Every action starts a timer; penalties apply at **5 s (−1)**, **7 s (−2)**, **15 s (−5)**.
- Three attempts per order. Correct builds earn up to 20 pts minus penalties.

### ♠️ Card Dealer
- Evaluate three seats against a community board and choose the winner (or split).
- Speed bonus: <15 s = 20 pts, <30 s = 18 pts, <40 s = 15 pts; longer times reduce score linearly.
- Three attempts per table before the stage busts.

### 🚪 Bouncer
- Review guest checklist (age, dress code, wristband, guest list) and approve/deny the right patrons.
- Select all valid guests with the dropdown. Three mistakes end the stage.
- Feedback recap highlights where you succeeded or missed requirements.

---

## Rewards & Settlement

1. **XP Calculation:** Performance score is applied through `applyXpGain`, granting rank ups when thresholds are passed.
2. **Base Pay:** Tied to current rank and performance (capped per rank). Higher ranks unlock bigger guarantees.
3. **Tips:** Random 0–20% bonus (weighted towards lower values) using shift-specific seed for fairness.
4. **House Transfer:** On completion, chips move from the house bank to the player. If the house lacks funds, payouts downgrade and players see a warning.
5. **Logs:** If configured, `/job` settlements post to the casino cash log for staff auditing.

Incomplete or cancelled shifts still record metadata to the ledger (e.g., `CANCELLED`, `EXPIRED`).

---

## Best Practices

- **Pace yourself:** Watch the stamina meter before launching marathon sessions. The panel shows cooldown return times.
- **Stay accurate:** Each job allows three attempts per stage; rushing misclicks eats attempts faster than waiting a second.
- **Coordinate events:** Admins can use `/job reset` to top off participants before contests or double-pay nights.
- **Check the panel first:** `/job` gives immediate context—no need to remember your current cooldown or last shift.

---

### Quick Start for Players
1. Run `/job` and tap the role you want.
2. Hit **Start Shift** from the panel or use `/job start job:<id>`.
3. Complete all five stages, watching the embed for instructions and feedback.
4. Review the completion embed for XP, payout, and stamina updates.
5. Rinse and repeat when stamina regenerates—or ask an admin for a reset.

### Admin Checklist
- Ensure the house bank has enough chips for payouts (`/housebalance`).
- Use `/job reset` sparingly to avoid skewing leaderboards.
- Monitor the cash log to confirm payouts and spot edge cases.

Semuta Casino’s job system is built to feel like a persistent career. Master each role, climb the ranks, and keep the casino floor buzzing night after night.

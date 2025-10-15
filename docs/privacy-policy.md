# Semuta Casino Bot – Privacy Policy

_Last updated: October 15, 2025_

Semuta Casino (“the Bot”) is a Discord application that tracks virtual casino gameplay. This Privacy Policy explains what data we collect, how we use it, and the choices available to you.

## 1. Data We Collect
When you use the Bot, we store the following information:
- **Discord identifiers**: user IDs, guild IDs, and usernames at the time of the interaction.
- **Economy records**: chip and credit balances, transaction history, buy-in/cash-out requests, and house ledger movements.
- **Gameplay data**: active session metadata, job progress, shift history, and minigame results required to settle wagers.
- **Request workflow data**: request status, moderator actions, and erasure ticket notes (used solely to validate the request).
- **Vote reward metadata**: vote source, reward amounts, timestamps, and external webhook IDs.
- **Timestamps & technical logs**: message IDs, interaction IDs, and error logs needed to operate and debug the Bot.

We do **not** collect email addresses, passwords, IP addresses, or payment details.

## 2. How We Use the Data
We process stored data to:
- Run the shared casino economy, compute payouts, and maintain leaderboards.
- Verify house coverage for games and prevent abuse or duplicate requests.
- Provide audit trails for moderators (e.g. cash logs, balance adjustments).
- Redeem external vote rewards.
- Respond to support, compliance, and erasure requests.
- Improve stability, investigate bugs, and secure the service.

## 3. Legal Basis
We rely on your consent and your continued use of the Bot to process data. If you do not agree with this policy, cease using the Bot and request data erasure.

## 4. Data Sharing & Disclosure
- We do not sell or rent user data.
- Data is stored locally on the bot host or the project database (SQLite or Postgres). Access is restricted to project maintainers.
- We may disclose limited data if required by law, to respond to valid legal requests, or to enforce our Terms of Service.
- Aggregated, non-identifiable statistics may be published (e.g. total chips in circulation).

## 5. Retention
- Gameplay and economy data are retained while you participate in guilds that use the Bot.
- If you submit an approved erasure request, the Bot deletes wallet records, transaction history, job progress, vote entries, request logs, and moderator/admin assignments for your user ID.
- Residual system logs or backups may persist briefly for security and integrity purposes; they are purged on a rolling basis.

## 6. Your Choices & Rights
- **Data access**: Use `/balance`, `/job`, `/leaderboard`, or log channels to review your balances and activity. You may contact a moderator or the economy owner for additional confirmation.
- **Data erasure**: Submit `/request type:Erase Account Data notes:<reason>` to start a deletion ticket. Staff will verify your identity before removal.
- **Corrections**: If data is inaccurate (e.g. due to a bug), notify a moderator; they may adjust balances or reverse sessions.
- **Opt-out**: Stop using the Bot and request erasure to remove your data.

## 7. Security
- Databases run in WAL mode (SQLite) or hosted Postgres with access control. Files are stored in secured directories on the host machine.
- Access is limited to the project maintainers; credentials are stored in environment variables rather than source control.
- Despite our efforts, no system is fully secure. Report suspected vulnerabilities to the maintainers immediately.

## 8. Children’s Privacy
The Bot is intended for users aged 18 and older. If we learn that someone under 18 is using the Bot, we may suspend their access and advise moderators to remove them.

## 9. Changes to this Policy
We may update this Privacy Policy when systems or legal requirements change. Material updates will be announced via the Bot’s update channel or project repository.

## 10. Contact
For privacy questions or requests, submit `/request type:Erase Account Data` with details or contact the economy owner (Discord ID `94915805375889408`).

By using Semuta Casino you acknowledge this Privacy Policy and consent to the described processing of your data.

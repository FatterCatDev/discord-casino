# Semuta Casino Bot – Privacy Policy

_Last updated: October 22, 2025_

Semuta Casino (“the Bot”) is a Discord application that tracks virtual casino gameplay. This Privacy Policy explains what data we collect, how we use it, and the choices available to you.

**At a glance:** we store your Discord IDs, cross-guild wallet balances, gameplay history, vote rewards, staff request tickets, and technical logs so the casino economy works. Submit `/request type:Erase Account Data notes:<reason>` to have that information purged.

## 1. Data We Collect
We store information in the categories below whenever you interact with the Bot:
- **Identity & guild metadata:** Discord user IDs, guild IDs, usernames, and discriminator data captured at the time of an interaction. We do not collect email addresses, passwords, phone numbers, IP addresses, or payment details.
- **Economy & reward records:** chip and credit balances, transaction history, buy-in and cash-out requests, House ledger adjustments, vote reward entries (including external vote IDs and webhook payload metadata), and daily spin timestamps.
- **Gameplay & progression data:** session state, game results, streak counts, job progress (stamina, ranks, shift history, performance scores), leaderboard positions, and moderation decisions tied to your account.
- **Request workflow data:** `/request` ticket contents, attachments, moderator actions, verification notes, and request timestamps for buy-ins, cash-outs, or privacy requests.
- **Technical & safety logs:** interaction IDs, message IDs, command payloads, error traces, and security events used to operate, troubleshoot, and secure the Bot. Some commands may send DMs; we log the fact that a DM was sent, not its contents.

Information you provide to moderators outside the Bot (for example, screenshots in a Discord ticket) is governed by that server’s policies; it is not automatically ingested unless staff record it in a `/request`.

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
- Data is stored in the hosted Postgres database or encrypted application storage. Access is restricted to project maintainers.
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

### Requesting Data Removal
1. Run `/request type:Erase Account Data notes:<reason>` in any guild that hosts the Bot. Include enough detail for moderators to verify your identity (for example, confirming your Discord tag or recent activity).
2. A moderator will review the ticket, confirm ownership, and approve or deny the request. They may contact you for additional verification.
3. Once approved, the Bot deletes wallet balances, transactions, job progress, vote reward entries, request history, and staff role assignments tied to your Discord ID. Anonymous aggregate stats (for example, total chips in circulation) may be retained for operational reporting.
4. You will receive confirmation in the request channel when the purge completes.

## 7. Security
- The Postgres database enforces TLS connections, role-based access, and encrypted disks. Files are stored in secured directories on the host machine.
- Access is limited to the project maintainers; credentials are stored in environment variables rather than source control.
- Despite our efforts, no system is fully secure. Report suspected vulnerabilities to the maintainers immediately.

## 8. Children’s Privacy
The Bot is intended for users aged 18 and older. If we learn that someone under 18 is using the Bot, we may suspend their access and advise moderators to remove them.

## 9. Changes to this Policy
We may update this Privacy Policy when systems or legal requirements change. Material updates will be announced via the Bot’s update channel or project repository.

## 10. Contact
For privacy questions or requests, submit `/request type:Erase Account Data` with details or contact the economy owner (Discord ID `94915805375889408` or @fattercatdev).

By using Semuta Casino you acknowledge this Privacy Policy and consent to the described processing of your data.

# Pending Update

version: 1.3.2

## Changes

- Changed warehouse raid timing to run the raid check before warehouse actions complete (`collect`, `burn`, `export`).
- Added atomic raid settlement in the storage layer so confiscation, fine payment, and raid transaction logging happen in one transaction.
- Added in-channel raid flavor embeds with action context, roll/tier details, raided player identity, and confiscation/fine outcomes.
- Added warehouse heat bar and heat tier indicators to both cartel overview and warehouse views.
- Expanded raid logic and regression coverage (heat boundaries, tier mapping, trigger/success behavior, scoped confiscation, and partial fine handling).
- Improved service stability by adding missing guild-id resolution used by cartel raid-related flows.

## Short Notes

- Raids now resolve earlier in warehouse action flow for clearer, more predictable outcomes.
- Raid penalties are processed atomically and logged consistently for auditability.
- Cartel UI now surfaces warehouse heat visually, making raid risk easier to read.
- Raid messaging now includes richer flavor and concrete outcome details in-channel.

## Bug Fixes

- Fixed a runtime crash from missing guild-id resolution in cartel service raid-related paths.
- Fixed inconsistent raid settlement behavior by moving confiscation and fine handling into a single transactional DB operation.


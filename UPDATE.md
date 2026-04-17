# Pending Update

version: 1.3.2

## Changes

- Changed warehouse raid timing to run the raid check before warehouse actions complete (`collect`, `burn`, `export`).
- Added atomic raid settlement in the storage layer so confiscation, fine payment, and raid transaction logging happen in one transaction.
- Added in-channel raid flavor embeds with action context, roll/tier details, raided player identity, and confiscation/fine outcomes.
- Added warehouse heat bar and heat tier indicators to both cartel overview and warehouse views.
- Replaced dealer list fire/pause buttons with a two-dropdown control flow: Fire Dealers and Pause Dealers selects with a single Confirm button.
- Dropdowns default to None and include an All option when more than two dealers are employed.
- Added per-message selection state cache so both dropdown choices persist until Confirm is pressed.
- Added dealer pause service actions with audit transaction logging for single and bulk dealer pauses.
- Updated interaction routing and regression coverage for dropdown-based dealer management.
- Expanded raid logic and regression coverage (heat boundaries, tier mapping, trigger/success behavior, scoped confiscation, and partial fine handling).
- Improved service stability by adding missing guild-id resolution used by cartel raid-related flows.

## Short Notes

- Raids now resolve earlier in warehouse action flow for clearer, more predictable outcomes.
- Raid penalties are processed atomically and logged consistently for auditability.
- Cartel UI now surfaces warehouse heat visually, making raid risk easier to read.
- Raid messaging now includes richer flavor and concrete outcome details in-channel.
- Dealer management now uses two dropdowns (Fire Dealers, Pause Dealers) with a Confirm button, replacing the previous per-dealer button rows.
- Both dropdowns include an All option when more than two dealers are present, and default to None until a selection is made.

## Bug Fixes

- Fixed a runtime crash from missing guild-id resolution in cartel service raid-related paths.
- Fixed inconsistent raid settlement behavior by moving confiscation and fine handling into a single transactional DB operation.


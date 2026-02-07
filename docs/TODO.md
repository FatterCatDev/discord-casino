# TODO

- Add warehouse Semuta expiration mechanics.
- When warehouse holdings pass a threshold, enable periodic police raids.
- Raid chance is driven by a `heat` value (higher heat → higher chance).
- On a successful raid, all warehouse Semuta is confiscated and the player is fined `grams_lost * 6` chips.
- On each `/cartel` use, roll a d20 to determine if a raid is triggered based on `heat` tier.
- Low heat: raid triggers on a natural 20.
- Medium heat: raid triggers on 14 or higher.
- High heat: raid triggers on 8 or higher.
- On fire: raid always triggers.
- If a raid triggers, it succeeds 50% of the time.
- When a raid triggers, notify the player that police are coming.
- Execute the raid only after the player completes one of: Collect Warehouse, Burn Warehouse, Export Warehouse.
- Raid scope on Collect: include warehouse contents plus the amount being collected.
- Raid scope on Burn/Export: include only Semuta remaining in the warehouse after the action.

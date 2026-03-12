# TODO

- Add warehouse Semuta expiration mechanics.
- When warehouse holdings pass a threshold, enable periodic police raids.(made it so that each gram adds a decimal amount of heat)
- Raid chance is driven by a `heat` value (higher heat → higher chance).(did that)
- On a successful raid, all warehouse Semuta is confiscated and the player is fined `grams_lost * 6` chips.(did that too)
- On each `/cartel` use, roll a d20 to determine if a raid is triggered based on `heat` tier.(did that ,heat amount ya might wanna check)
- Low heat: raid triggers on a natural 20.(ig i did that)
- Medium heat: raid triggers on 14 or higher.(did)
- High heat: raid triggers on 8 or higher.(did)
- On fire: raid always triggers.(did)
- If a raid triggers, it succeeds 50% of the time.(i didnt understand the code for this, hopefully the one i put in works)
- When a raid triggers, notify the player that police are coming.
- Execute the raid only after the player completes one of: Collect Warehouse, Burn Warehouse, Export Warehouse.(added code, please test for bugs)
- Raid scope on Collect: include warehouse contents plus the amount being collected.
- Raid scope on Burn/Export: include only Semuta remaining in the warehouse after the action.
(just a note, i dont have any way to test if these features are working or not, bc i dont have access to the bot to test it out, so you might wanna double check)
(so the ones i havent done are :
                                semuta expiration mechanics(i think, im not sure bc the code got kinda muddled up in between)
                                notification of the player that 'its the sound of da police' (please make the notification that exact message please bc idk how to do that)
                                raid scope)
  (just take a note, im dumb and new to being a dev so if it doesnt work, ye its bc im not good at ts)

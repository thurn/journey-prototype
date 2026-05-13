# `commit_now_future_payoff` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `commit_now_future_payoff`
- Stages: early, mid, late
- Seeds: `audit:commit_now_future_payoff:<stage>:01` through `audit:commit_now_future_payoff:<stage>:10`
- Command template: `npm run journey -- --seed audit:commit_now_future_payoff:<stage>:NN --stage <stage> --shape commit_now_future_payoff --debug --show-deck --no-color`

## Findings

### Victory hooks hide the two-battle expiry in player text

Severity: high

Seed: `audit:commit_now_future_payoff:early:01`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:early:01 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: battle essence rewards are reduced by 40% for the next 2 battles. After your next victory, apply Golden to 3 random cards with an energy-generation ability.
2. Commit now: lose 1 omen. After your next victory, gain a copy of 'Clam Shell'.
3. Commit now: transform a chosen dreamsign into a random dreamsign. After your next victory, add Reclaim 2 to 3 random cards.

Seed: `audit:commit_now_future_payoff:mid:01`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:01 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: lose 80 essence. After your next victory, gain a copy of one of your Dreamsigns chosen at random.
2. Commit now: gain 2 'Betrayal'. After your next victory, draft 1 of 4 Fast cards and apply Golden to it.
3. Commit now: gain 2 'Silence' for the next 2 battles. After your next victory, apply Golden to 2 chosen cards with an 'abandon' ability.

Seed: `audit:commit_now_future_payoff:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:10 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: lose 1 omen. After your next victory, gain essence up to your maximum.
2. Commit now: lose 60 essence. After your next victory, draft 1 of 4 Survivors and gain 3 copies of it.
3. Commit now: gain 1 random bane. After your next victory, gain a random Dreamsign.

Issue:
The visible Journey text reads as a standing promise for the next victory. Debug output for each victory hook says the hook lasts for the next 2 battles and is discarded with no reward if the player does not win during that window. That expiry is strategically central to this shape: the player is paying a cost now for a future payoff, and the risk of missing the payoff determines whether the commitment is acceptable.

Recommendation:
Render victory-triggered delayed hooks with the expiry in the option text, such as `If you win within the next 2 battles, ...`. Keep the trigger, window, and payoff in the same sentence or clause so the commitment contract is readable without debug output.

### Multi-action payoffs lose their delayed timing after the first sentence

Severity: medium

Seed: `audit:commit_now_future_payoff:mid:05`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:05 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: purge a chosen card with a 'judgment' ability. After your next victory, gain a copy of one of your Dreamsigns of your choice.
2. Commit now: shuffle 2 'Stillborn Tide' into your dreamwell for the next 2 battles. After your next victory, gain essence up to your maximum.
3. Commit now: lose 30-70 essence (random roll). After your next victory, draft 1 of 4 Characters and apply Scarlet to it. Transform a chosen card with a 'judgment' ability into 'Peak Plunder'.

Seed: `audit:commit_now_future_payoff:late:04`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:04 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: purge a random card with a 'discard' ability. At the next dreamscape, legendary cards cost 2 less for the next 3 battles.
2. Commit now: remove the transfiguration from 'Dreamscatter'. At the next dreamscape, take any number of cards with an energy-generation ability from 3 choices. Apply a random transfiguration to 1 random card.
3. Commit now: lose 1 omen. At the next dreamscape, gain essence up to your maximum.

Seed: `audit:commit_now_future_payoff:late:06`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:06 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 3 'Paralysis'. At the next dreamscape, choose 1 of 2 Dreamsigns to gain.
2. Commit now: remove the transfiguration from 'Arc Gate Opening'. At the next dreamscape, gain a copy of one of your Dreamsigns chosen at random.
3. Commit now: remove the transfigurations from 3 random Fast cards. At the next dreamscape, your starting dreamwell card is 'Lantern'. Duplicate 2 random Spirit Animals.

Issue:
Rows with two payoff operations put only the first sentence under the delayed timing phrase. The second sentence reads like a separate immediate instruction even though debug output includes it in the delayed scene. This makes the future payoff harder to parse and weakens the shape's central "commit now, collect later" contract.

Recommendation:
When a delayed payoff contains multiple operations, render the timing once over the full payoff, for example `After your next victory, draft 1 of 4 Characters, apply Scarlet to it, and transform a chosen card with a 'judgment' ability into 'Peak Plunder'.`

### Target-dependent commitments lack visible target context

Severity: medium

Seed: `audit:commit_now_future_payoff:early:03`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:early:03 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: lose 1 omen. At the next dreamscape, cards with a 'judgment' ability cost 2 less for the next 3 battles.
2. Commit now: remove the transfiguration from 'Across the Void'. At the next dreamscape, gain a copy of 'Gray Feather'.
3. Commit now: gain 2 random banes. At the next dreamscape, transform a chosen Dreamsign into 'Witch Coin'. Purge up to 3 chosen starter cards.

Seed: `audit:commit_now_future_payoff:early:05`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:early:05 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 1 random bane. After your next victory, cards with a transfiguration cost 2 less for the next 3 battles.
2. Commit now: remove the transfigurations from 3 random cards with a 'judgment' ability. After your next victory, gain 3 omens.
3. Commit now: lose 1 omen. After your next victory, purge all starter cards.

Seed: `audit:commit_now_future_payoff:late:06`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:06 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 3 'Paralysis'. At the next dreamscape, choose 1 of 2 Dreamsigns to gain.
2. Commit now: remove the transfiguration from 'Arc Gate Opening'. At the next dreamscape, gain a copy of one of your Dreamsigns chosen at random.
3. Commit now: remove the transfigurations from 3 random Fast cards. At the next dreamscape, your starting dreamwell card is 'Lantern'. Duplicate 2 random Spirit Animals.

Issue:
The shown deck lists card names but does not show transfiguration state, ability tags, or how many eligible targets exist. These commitments can therefore read as free, invalid, or impossible to value from the player-facing output. The debug valuation prices each row as a real cost, so a row can become a solved pick if the visible context does not prove the cost matters.

Recommendation:
Gate transfiguration-removal commitments on visible eligible targets, or include enough target context in the generated output to show the cost is material. For random multi-target removals, render the eligible count when the count is strategically relevant.

### Balance outliers create solved choices

Severity: medium

Seed: `audit:commit_now_future_payoff:early:02`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:early:02 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: your starting dreamwell card is 'Hollow Refrain' for the next 3 battles. At the next dreamscape, gain a copy of 'Philosopher's Stone'. Debug net: +150.
2. Commit now: battle essence rewards are reduced by 50% for the next battle. At the next dreamscape, purge all starter cards. Debug net: +215.
3. Commit now: gain 1 'Doubt' for the next 1 battle. At the next dreamscape, draft 1 of 4 Event cards and gain 2 copies of it. Debug net: +91.5.

Seed: `audit:commit_now_future_payoff:mid:02`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:02 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 3 'Oblivion'. After your next victory, choose 1 of 2 Dreamsigns to gain. Debug net: +70.
2. Commit now: gain 3 random banes. After your next victory, gain 140-200 essence (random roll). Debug net: +80.
3. Commit now: purge a random Fast card. After your next victory, gain a copy of one of your Dreamsigns of your choice. Debug net: +216.

Seed: `audit:commit_now_future_payoff:late:09`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:09 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: remove the transfiguration from 'Passage Through Oblivion'. After two battles, draft 1 of 4 cards with an energy-generation ability. Debug net: +54.
2. Commit now: transform 'Harvester of Despair' into a random card from the pool. After two battles, set essence to 125% of your maximum essence. Debug net: +205.
3. Commit now: transform a chosen dreamsign into a random dreamsign. After two battles, gain 110 essence. Debug net: +78.

Issue:
Several offers contain one row with much stronger debug value and an easier-to-accept cost than the rest of the menu. The player-facing choice becomes a valuation exercise instead of a strategic commitment, especially when the dominant row also has a clearer or less punishing cost than rows with Banes, omen loss, or multi-battle dreamwell penalties.

Recommendation:
For this shape, constrain rows within a tighter net-value band after delayed-hook risk is applied. When a payoff has premium agency, such as copying a chosen Dreamsign or exceeding maximum essence, pair it with a visibly premium commitment cost.

### Commitments and payoffs often lack thematic or mechanical coherence

Severity: medium

Seed: `audit:commit_now_future_payoff:early:07`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:early:07 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 2 'Paralysis' for the next 2 battles. After your next victory, create 3 duplicates of 'Ringwatcher'.
2. Commit now: purge 'Parchment'. After your next victory, draft 1 of 4 Spirit Animals and gain 3 copies of it.
3. Commit now: gain 1 'Despair'. After your next victory, add a Duplication site to the resolving dreamscape.

Seed: `audit:commit_now_future_payoff:mid:08`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:08 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: purge a chosen Dreamsign. At the next dreamscape, apply a random transfiguration to each starter card.
2. Commit now: purge 'Crimson Pilgrimage'. At the next dreamscape, shuffle 3 'Harmony' copies into your dreamwell.
3. Commit now: gain 1 'Nightmare'. At the next dreamscape, draft 1 of 4 cards with a 'dissolve' ability.

Seed: `audit:commit_now_future_payoff:late:02`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:02 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: purge a chosen card with spark 1 or less. At the next dreamscape, gain 30-120 essence (random roll).
2. Commit now: transform 'Dreadcall Warden' into a random card from the pool. At the next dreamscape, gain a random Dreamsign.
3. Commit now: purge 'Glow Pouch'. At the next dreamscape, draft 1 of 4 Spirit Animals.

Issue:
Many rows pair an arbitrary immediate sacrifice with an unrelated future reward. As a player, the rows read like independent cost and reward fragments joined by timing text. The shape becomes more replayable and memorable when the present commitment creates a recognizable bargain, such as risking Dreamsign strength for a future Dreamsign payoff or accepting battle weakness for a battle-earned reward.

Recommendation:
Prefer domain-aware pairings for this shape: Dreamsign commitments should bias toward Dreamsign payoffs, dreamwell commitments toward dreamwell or card-flow payoffs, and battle penalties toward victory-triggered rewards. Keep fully random pairings as a lower-weight fallback.

### Object wording and capitalization are inconsistent

Severity: low

Seed: `audit:commit_now_future_payoff:early:10`  
Stage: `early`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:early:10 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: lose 1 omen. After two battles, apply random transfigurations to 3 random starter cards.
2. Commit now: purge a random Starter card. After two battles, gain 'Pyramid Relic'.
3. Commit now: purge all duplicate cards from your deck. After two battles, add an Essence site to the resolving dreamscape.

Seed: `audit:commit_now_future_payoff:mid:04`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:04 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 1 random bane. After two battles, draft 1 of 4 cards with cost 2 or less and gain 2 copies of it.
2. Commit now: remove the transfiguration from 1 random Character. After two battles, gain 'Red Cheese'.
3. Commit now: gain 1 'Lethargy' for the next 3 battles. After two battles, gain 2 omens.

Seed: `audit:commit_now_future_payoff:mid:08`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:08 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: purge a chosen Dreamsign. At the next dreamscape, apply a random transfiguration to each starter card.
2. Commit now: purge 'Crimson Pilgrimage'. At the next dreamscape, shuffle 3 'Harmony' copies into your dreamwell.
3. Commit now: gain 1 'Nightmare'. At the next dreamscape, draft 1 of 4 cards with a 'dissolve' ability.

Seed: `audit:commit_now_future_payoff:late:07`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:07 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: transform a chosen dreamsign into a random dreamsign. After two battles, gain a copy of one of your Dreamsigns of your choice.
2. Commit now: lose 1 omen. After two battles, duplicate 3 random Characters.
3. Commit now: purge 'Poison Bottle'. After two battles, choose 1 of 2 Dreamsigns to gain.

Issue:
The output alternates between `Dreamsign` and `dreamsign`, uses `Starter` and `starter`, and sometimes renders Dreamsign rewards as `gain '<name>'` while other rows use `gain a copy of '<name>'`. `shuffle 3 'Harmony' copies` is understandable but awkward beside the clearer `shuffle 2 'Stillborn Tide' into your dreamwell` wording.

Recommendation:
Normalize object nouns and reward templates: use `Dreamsign`, `starter card`, `gain a copy of '<Dreamsign>'`, and `shuffle 3 copies of '<card>' into your dreamwell`. Keep ability names in the project's established style for player-facing card text.

### Reward pool repetition weakens replayability

Severity: low

Seed: `audit:commit_now_future_payoff:mid:02`  
Stage: `mid`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:mid:02 --stage mid --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: gain 3 'Oblivion'. After your next victory, choose 1 of 2 Dreamsigns to gain.
2. Commit now: gain 3 random banes. After your next victory, gain 140-200 essence (random roll).
3. Commit now: purge a random Fast card. After your next victory, gain a copy of one of your Dreamsigns of your choice.

Seed: `audit:commit_now_future_payoff:late:01`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:01 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: lose 75 essence. After two battles, gain a copy of one of your Dreamsigns of your choice.
2. Commit now: gain 2 'Doubt' for the next 2 battles. After two battles, apply Golden to 3 chosen cards with a 'dissolve' ability.
3. Commit now: gain 1 random bane. After two battles, draft 1 of 4 cards with a 'materialized' ability.

Seed: `audit:commit_now_future_payoff:late:07`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:07 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: transform a chosen dreamsign into a random dreamsign. After two battles, gain a copy of one of your Dreamsigns of your choice.
2. Commit now: lose 1 omen. After two battles, duplicate 3 random Characters.
3. Commit now: purge 'Poison Bottle'. After two battles, choose 1 of 2 Dreamsigns to gain.

Seed: `audit:commit_now_future_payoff:late:10`  
Stage: `late`  
Replay:  
`npm run journey -- --seed audit:commit_now_future_payoff:late:10 --stage late --shape commit_now_future_payoff --debug --show-deck --no-color`

Generated options:

1. Commit now: lose 1 omen. After your next victory, gain essence up to your maximum.
2. Commit now: lose 60 essence. After your next victory, draft 1 of 4 Survivors and gain 3 copies of it.
3. Commit now: gain 1 random bane. After your next victory, gain a random Dreamsign.

Issue:
Dreamsign gain, Dreamsign choice, and active-Dreamsign copy rewards appear frequently across mid and late samples. These are valid rewards, but the repetition makes the shape feel like the same future payoff with shuffled costs rather than a broad catalog of delayed bargains.

Recommendation:
Broaden the delayed payoff mix with more route, deck-construction, battle-modifier, shop, and dreamwell rewards at comparable value bands. Weight repeated Dreamsign acquisition lower once an offer already contains a Dreamsign payoff.

## Passing Observations

- All 30 forced-shape samples generated successfully.
- Every sample produced three options with an immediate commitment and a delayed payoff.
- The debug metadata consistently exposed trigger type, duration, expiry, and converted-value estimates for each delayed hook.
- The sampled trigger mix covered next victory, next dreamscape, and after-two-battles hooks.

## Verification

Verification command:

`npm run journey -- --seed audit:commit_now_future_payoff:early:01 --stage early --shape commit_now_future_payoff --debug --show-deck --no-color`

Result: succeeded with exit code 0.

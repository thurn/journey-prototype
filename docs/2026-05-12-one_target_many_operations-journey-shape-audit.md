# `one_target_many_operations` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `one_target_many_operations`
- Stages: early, mid, late
- Seeds: `audit:one_target_many_operations:<stage>:01` through `audit:one_target_many_operations:<stage>:10`
- Command template: `npm run journey -- --seed audit:one_target_many_operations:<stage>:NN --stage <stage> --shape one_target_many_operations --debug --show-deck --no-color`

## Findings

### Zero-Cost Operation Sets Create Forced Choices

Severity: high

Seed: `audit:one_target_many_operations:early:09`
Stage: `early`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:early:09 --stage early --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Create 2 duplicates of 'Cindermarch'`
2. `* Gain a temporary copy of 'Cindermarch' for the next 3 battles`
3. `* Apply Scarlet to 'Cindermarch'`

Seed: `audit:one_target_many_operations:mid:09`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:09 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Gain 'Rift Pilgrim'`
2. `* Create 3 duplicates of 'Rift Pilgrim'`
3. `* Gain a temporary copy of 'Rift Pilgrim' for the next 3 battles`

Seed: `audit:one_target_many_operations:mid:08`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:08 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Apply Scarlet to 1 chosen Warrior`
2. `* Take any number of Warriors from 5 choices`
3. `* Warriors cost 2 less for the next 3 battles`

Issue:

The offer presents all options with zero visible cost, but one option frequently carries two to four times the debug net value of the alternatives. The player has little reason to take a temporary copy, a single transfiguration, or a type modifier when the same offer also grants multiple permanent cards or a broad "take any number" reward.

Recommendation:

Build `one_target_many_operations` operation groups from value-compatible operations for the selected target and stage. Add visible costs, caps, or narrower targets to high-output operations such as multi-duplicate and take-any-number rewards, and reject zero-cost offers whose highest expected value is more than roughly 50% above the lowest option unless the lower-value option has a clear contextual advantage.

### Deck-Card Rewards Use The Wrong Acquisition Verb

Severity: high

Seed: `random:929df556-067e-408b-a2a6-ea4a9de1432a`
Stage: `early`
Replay:
`npm run journey -- --seed random:929df556-067e-408b-a2a6-ea4a9de1432a --stage early --shape one_target_many_operations --debug --show-deck --no-color`

Steps to reproduce:

1. Run the replay command from the repository root.
2. Confirm the generated deck contains `Runebound Champion`.
3. Read the three `one_target_many_operations` options.

Generated options:

1. `* Change 'Runebound Champion' to become a Warrior`
2. `* Apply Viridian to 'Runebound Champion'`
3. `* Gain 'Runebound Champion'`

Issue:

`one_target_many_operations` chooses a shared target from the current deck. The option text should treat that target as an existing deck card. `Gain 'Runebound Champion'` reads as though the card is outside the deck and being newly acquired.

Recommendation:

Render deck-card acquisition in this shape as duplication. The option should say `Duplicate 'Runebound Champion'` when the selected target is already in the deck. Audit `random_rewards` and `random_trades` for any shared reward path that chooses a deck card and renders it as `Gain`.

### Temporary Named-Card Copies Are Dominated By Permanent Copies

Severity: high

Seed: `random:e334de9a-d7b0-4ab6-a194-2087241b1493`
Stage: `early`
Replay:
`npm run journey -- --seed random:e334de9a-d7b0-4ab6-a194-2087241b1493 --stage early --shape one_target_many_operations --debug --show-deck --no-color`

Steps to reproduce:

1. Run the replay command from the repository root.
2. Read the three `one_target_many_operations` options.
3. Compare the permanent card acquisition option against the temporary copy option.

Generated options:

1. `* Gain 'Dimensional Pathfinder'`
2. `* Gain a temporary copy of 'Dimensional Pathfinder' for the next 3 battles`
3. `* Apply Viridian to 'Dimensional Pathfinder'`

Issue:

The temporary copy option is strictly worse than the permanent acquisition option when both target the same named card and neither has a visible cost.

Recommendation:

Delete temporary named-card copy operations from `one_target_many_operations` offers that can also include permanent named-card duplication. Use temporary copies only in shapes where timing, cost, or risk makes the temporary reward a meaningful trade. Audit `random_rewards` and `random_trades` for any shared reward set that can offer a temporary copy beside a permanent copy of the same named card.

### Late Single-Card Offers Are Too Small

Severity: medium

Seed: `audit:one_target_many_operations:late:03`
Stage: `late`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:late:03 --stage late --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Gain a temporary copy of 'Voidsire' for the next 3 battles`
2. `* Your opening hand contains 'Voidsire' for the next 3 battles`
3. `* Change 'Voidsire' to become a Spirit Animal`

Seed: `audit:one_target_many_operations:late:06`
Stage: `late`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:late:06 --stage late --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Add Reclaim 2 to 'Mother of Flames'`
2. `* Change 'Mother of Flames' to become a Warrior`
3. `* Apply Golden to 'Mother of Flames'`

Seed: `audit:one_target_many_operations:late:10`
Stage: `late`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:late:10 --stage late --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Gain a temporary copy of 'Ruptured Dynamo' for the next 3 battles`
2. `* Add Reclaim 2 to 'Ruptured Dynamo'`
3. `* Apply Prismatic to 'Ruptured Dynamo'`

Issue:

Late-stage offers at 400/500 essence frequently center on one card and include effects valued around 24 to 40 converted essence. These read like early maintenance or light refinement rewards, especially when one option is only a creature-type change with no visible synergy in the shown deck or active Dreamsigns.

Recommendation:

Gate late-stage single-card targets behind stronger operations, higher-card-count variants, rare/high-impact targets, or contextual synergy checks. Type-change options should appear in late offers when the deck, active Dreamsigns, or generated rule text makes the new type immediately meaningful.

### Starter Options Need Explicit Targets

Severity: medium

Seed: `audit:one_target_many_operations:mid:04`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:04 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Transform it into 'Forsaken Skyline'`
2. `* Replace it with 1 of 4 drafted cards`
3. `* Apply random transfigurations to 1 chosen Starter card`

Seed: `audit:one_target_many_operations:mid:05`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:05 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Purge up to 2 chosen Starter cards`
2. `* Apply random transfigurations to 2 chosen Starter cards`
3. `* Transform it into 'Ripple of Defiance'`

Issue:

The root menu uses "it" without an antecedent. The debug symmetry contract identifies the shared target as `starter:chosen`, but the player-facing option should be understandable without debug metadata.

Recommendation:

Render starter operations with an explicit noun phrase in every root option, such as "Transform a chosen Starter card into ..." and "Replace a chosen Starter card with ...". Keep the target wording consistent across all options in the same offer.

### Delete Generated-Object Menus From This Shape

Severity: high

Seed: `audit:one_target_many_operations:mid:01`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:01 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Steps to reproduce:

1. Run the replay command from the repository root.
2. Read the generated-object offer that creates a manifest-local object.
3. Confirm the offer describes a manifest-local Dreamsign rather than an existing canonical Dreamsign.

Seed: `audit:one_target_many_operations:mid:07`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:07 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Steps to reproduce:

1. Run the replay command from the repository root.
2. Read the generated-object offer that creates a manifest-local object.
3. Confirm the offer describes a manifest-local status rather than an existing canonical Dreamsign or card.

Issue:

`one_target_many_operations` should not call the generic generated-object menu pipeline. The shape is built around one existing target with several operations. Manifest-local generated objects create new Dreamsign/status designs inside the Journey pipeline and break that shape contract.

Recommendation:

Delete generated-object menu substitution from `one_target_many_operations`. Delete generated Dreamsign definition builders and generated Dreamsign debug variants from the Journey pipeline. Delete the player-facing generated-object transform text path from Journey output. Keep Dreamsign Journey rewards pointed at existing canonical Dreamsigns.

### Generated Object Debug Contracts Point At Different Offers

Severity: medium

Seed: `audit:one_target_many_operations:mid:01`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:01 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Create and gain {manifest-local object}. Manifest-local object: For the next 3 battles, the first time you gain an omen each battle, Foresee 2.`
2. `* ! [generated-object transform option for manifest-local object]`
3. `* ! Gain {manifest-local object} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. Manifest-local object: For the next 3 battles, the first time you gain an omen each battle, Foresee 2.`

Debug metadata:

`shared_axis_rotated_attribute: shared target=route_site:Dreamsign Draft; varied operation; options 1,2,3. shared=route_site:Dreamsign Draft varied=add_site_to_dreamscape,add_site_to_next_dreamscape,boost_site_appearance_chance`

Seed: `audit:one_target_many_operations:mid:07`
Stage: `mid`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:mid:07 --stage mid --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Create and gain {manifest-local object}. Manifest-local object: Until the next Shop, the first card you buy gains Reclaim 1. If it is {Veil Shatter}, it also gains Fast.`
2. `* ! [generated-object transform option for manifest-local object]`
3. `* ! Gain {manifest-local object} temporarily, then return it at the next Dream Journey site or trade it for 120 essence after using it once. Manifest-local object: Until the next Shop, the first card you buy gains Reclaim 1. If it is {Veil Shatter}, it also gains Fast.`

Debug metadata:

`shared_axis_rotated_attribute: shared target=card:a5275ef5-2896-4a0a-89de-96b241e05472; varied operation; options 1,2,3. shared=card:a5275ef5-2896-4a0a-89de-96b241e05472 varied=opening_hand_grant_for_X_battles,temporary_card_copy_for_X_battles,gain_named_card`

Issue:

The rendered generated-object offer and operation table target the generated object, but the symmetry contract describes unrelated site or card operations. Debug output should make the final accepted offer reproducible and auditable.

Recommendation:

Record the shared-axis symmetry contract after generated-object operations are finalized, or validate the contract against the accepted root options before emitting debug output. The contract should identify the generated object as the shared target and the create, transform, and temporary/trade operations as the varied operations.

### Operation Labels Need Sentence-Case Cleanup

Severity: low

Seed: `audit:one_target_many_operations:early:01`
Stage: `early`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:early:01 --stage early --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* cards with cost 2 or less cost 2 less for the next 3 battles`
2. `* Transform up to 2 chosen cards with cost 2 or less into random cards with cost 2 or less`
3. `* Draft 1 of 4 cards with cost 2 or less`

Seed: `audit:one_target_many_operations:late:01`
Stage: `late`
Replay:
`npm run journey -- --seed audit:one_target_many_operations:late:01 --stage late --shape one_target_many_operations --debug --show-deck --no-color`

Generated options:

1. `* Draft 1 of 4 cards with a 'materialized' ability`
2. `* Apply Magenta to 1 chosen card with a 'materialized' ability`
3. `* cards with a 'materialized' ability cost 2 less for the next 3 battles`

Issue:

Some root options begin with a lowercase noun phrase. These options are mechanically understandable, but they read less polished than the surrounding generated choices.

Recommendation:

Normalize rendered root option labels to sentence case after operation text is assembled, with predicate phrases such as "Cards with cost 2 or less ..." and "Cards with a 'materialized' ability ...".

## Passing Observations

- All 30 replay commands completed successfully.
- Every sampled offer rendered exactly three root options.
- The shape consistently used a shared target with varied operations, which gives the player an immediately legible comparison frame when the option text names the target clearly.
- Site-routing offers were tactically understandable in the sampled output, especially when they contrasted next-dreamscape, current-dreamscape, and future-appearance rewards.

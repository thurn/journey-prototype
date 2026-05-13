# `resolved_random_series` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck --no-color`.

## Method

- Shape: `resolved_random_series`
- Stages: early, mid, late
- Seeds: `audit:resolved_random_series:<stage>:01` through `audit:resolved_random_series:<stage>:10`
- Command template: `npm run journey -- --seed audit:resolved_random_series:<stage>:NN --stage <stage> --shape resolved_random_series --debug --show-deck --no-color`

## Findings

### Resolved Series Contains Fresh Randomness

Severity: high

Seeds: `audit:resolved_random_series:early:03`, `audit:resolved_random_series:mid:03`, `audit:resolved_random_series:late:01`, `audit:resolved_random_series:late:09`

Replay:
`npm run journey -- --seed audit:resolved_random_series:early:03 --stage early --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: transform a chosen Spirit Animal into 'A New Adventure', then gain 30-70 essence (random roll). Gain a random Dreamsign for the next 3 battles, then gain 'Silver Key'.
2. Resolve the shown reward series: apply Viridian to 'Runebound Champion', then duplicate 2 chosen cards, then add a Transfiguration site to the next dreamscape you visit.

Replay:
`npm run journey -- --seed audit:resolved_random_series:mid:03 --stage mid --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: your next 3 shop rerolls are free, then increase your maximum essence by 125, then gain a copy of one of your Dreamsigns chosen at random.
2. Resolve the shown reward series: gain 195 essence, then 30% higher chance to see Essence sites in the next 3 dreamscapes you visit, then apply Golden to 3 chosen cards with an energy-generation ability.

Replay:
`npm run journey -- --seed audit:resolved_random_series:late:01 --stage late --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: transform a chosen Dreamsign into 'Charm Bracelet', then transform a chosen Warrior into 'Arcing Revenant', then gain 1 random Fast card. Create 3 duplicates of 'Wasteland Tamer'.
2. Resolve the shown reward series: purge all bane cards, then change 3 random cards to have fast, then duplicate 1 chosen card.

Replay:
`npm run journey -- --seed audit:resolved_random_series:late:09 --stage late --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: transform a chosen Dreamsign into 'Flaming Button', then shop essence costs are permanently reduced by 50%, then add Reclaim 1 to 2 random cards.
2. Resolve the shown reward series: draft 1 of 4 Characters and gain 2 copies of it, then draw 4 cards from your deck and duplicate one of them of your choice, then take any number of Warriors from 3 choices.

Issue:
The debug metadata says each option is a precommitted "Resolved random series", but the player-facing text still contains unresolved rolls and random selectors. The player cannot see the committed card, Dreamsign, roll value, or target set for these effects. This weakens the shape identity and makes the choice harder to evaluate.

Recommendation:
Resolve random rewards before rendering this shape. Show the selected Dreamsign, card, essence value, transfiguration, and affected cards when the random outcome is already committed. Keep random language only for effects that intentionally resolve later and mark those effects with a distinct shape or timing.

### Free Reward Bundles Create Dominated Choices

Severity: high

Seeds: `audit:resolved_random_series:early:05`, `audit:resolved_random_series:mid:01`, `audit:resolved_random_series:late:10`

Replay:
`npm run journey -- --seed audit:resolved_random_series:early:05 --stage early --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: apply Golden to 3 chosen cards with an energy-generation ability, then gain 'Dreamcatcher', then 20% higher chance to see Transfiguration sites in the next 3 dreamscapes you visit.
2. Resolve the shown reward series: your next 3 shop purchases cost 1 fewer omen, then apply Golden to 'Wildflower Colossus', then add Reclaim 2 to 'Nocturne Strummer'.

Replay:
`npm run journey -- --seed audit:resolved_random_series:mid:01 --stage mid --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: gain a random Dreamsign, then create 2 duplicates of 'Luminous Ascent', then duplicate 3 chosen cards.
2. Resolve the shown reward series: gain 95 essence, then transform 'Twilight Suppressor' into 'Overstory Explorer', then add Reclaim 2 to 'Fenlight Expedition'.

Replay:
`npm run journey -- --seed audit:resolved_random_series:late:10 --stage late --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: gain a temporary copy of 'Breach Artist' for the next 3 battles, then gain 3 omens, then choose 1 of 2 Dreamsigns to gain.
2. Resolve the shown reward series: event cards cost 1 less for the next 3 battles, then shuffle 3 'Insight' copies into your dreamwell. Your opening hand contains 'Gleam Below' for the next 3 battles, then add Reclaim 2 to 1 random card.

Issue:
The scored operations have zero cost, zero burden, and zero uncertainty for both options. When one bundle has a much higher net value and broader applicability, the offer becomes a comparison of free upside rather than a strategic decision. Examples include early 05 at +261 versus +147, mid 01 at +292 versus +175, and late 10 at +310 versus +187.

Recommendation:
Balance the two bundles around comparable total value or add real tradeoffs such as omens, essence, deck commitment, temporary burdens, or narrower targeting. The shape should present two attractive reward sequences with different strategic hooks, not one clearly larger free package.

### Series Steps Can Consume Their Own Targets

Severity: medium

Seed: `audit:resolved_random_series:mid:08`
Stage: `mid`

Replay:
`npm run journey -- --seed audit:resolved_random_series:mid:08 --stage mid --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: add a Transfiguration site to this dreamscape, then add a Dreamsign Draft site to the next dreamscape you visit, then purge up to 3 chosen cards with a 'judgment' ability.
2. Resolve the shown reward series: draft 1 of 4 cards with a 'dissolve' ability and apply Prismatic to it, then purge all starter cards, then apply Prismatic to all Starter cards.

Issue:
Option 2 asks the player to purge all starter cards and then apply Prismatic to all Starter cards. The second effect depends on a card set that the prior effect can empty, so the sequence reads as internally self-defeating.

Recommendation:
Validate each series after ordering its steps. A later step should have a live target after earlier steps resolve, or the render should combine the operations into a coherent single instruction.

### Site Replacement Effects Lack Visible Site Preconditions

Severity: medium

Seeds: `audit:resolved_random_series:late:02`, `audit:resolved_random_series:late:05`

Replay:
`npm run journey -- --seed audit:resolved_random_series:late:02 --stage late --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: draft 1 of 4 Survivors, then transform a chosen Dreamsign into 'Candle'. Your next 3 shop purchases cost 1 fewer omen, then your opening hand contains 'Wake the Fallen' for the next 3 battles.
2. Resolve the shown reward series: apply Golden to 3 chosen cards with cost 2 or less, then gain a random Dreamsign, then replace a Dreamsign Offering site in this dreamscape with a Transfiguration site.

Replay:
`npm run journey -- --seed audit:resolved_random_series:late:05 --stage late --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: add a Duplication site to the next dreamscape you visit, then replace a Duplication site in this dreamscape with a Shop site, then transform a chosen Dreamsign into 'Witch Coin'.
2. Resolve the shown reward series: your opening hand contains 'Dreamvale Monarch' for the next 3 battles, then add Reclaim 1 to 'Dimensional Pathfinder', then draft 1 of 4 Event cards.

Issue:
The output does not show the current dreamscape site list, and these replacement effects require a specific existing site. Late 05 also adds a Duplication site to the next dreamscape before replacing a Duplication site in this dreamscape, which reads like a mismatched precondition.

Recommendation:
Use replacement effects only when the required current dreamscape site is visible and known to exist. Prefer "add a site" effects when the current-site precondition is not part of the shown context.

### Sentence Boundaries Interrupt Series Grammar

Severity: low

Seeds: `audit:resolved_random_series:early:03`, `audit:resolved_random_series:early:06`, `audit:resolved_random_series:late:02`

Replay:
`npm run journey -- --seed audit:resolved_random_series:early:06 --stage early --shape resolved_random_series --debug --show-deck --no-color`

Generated options:

1. Resolve the shown reward series: take any number of cards with an 'abandon' ability from 3 choices, then purge up to 1 chosen starter card, then your opening hand contains 'Worlds Await' for the next 3 battles.
2. Resolve the shown reward series: change 'The Festering Mass' to become a Warrior. Gain 60 essence, then add Reclaim 2 to 3 random cards, then gain 'Blight Weaver'.

Issue:
Some series use periods inside the generated list while continuing with "then". This makes one option look like multiple separate instructions and weakens readability.

Recommendation:
Render every step in a resolved series with consistent separators. Use one sentence for a short three-step chain, or render each committed step as a bullet when the chain contains complex subclauses.

## Passing Observations

- All 30 commands completed successfully.
- The debug view consistently reports `random_commit` topology, two precommitted random envelopes, and accepted repair status.
- Deck and active Dreamsign context are present for every sample, which makes card-specific and Dreamsign-specific effects auditable.
- Many targeted card effects select cards that appear in the shown deck, such as `Wildflower Colossus`, `Dreadwood Emissary`, `Dreamvale Monarch`, and `Dimensional Pathfinder`.

# `reveal_choice_menu` Journey Shape Audit

Generated 10 early, 10 mid, and 10 late journeys with `--debug --show-deck`.

## Method

- Shape: `reveal_choice_menu`
- Stages: early, mid, late
- Seeds: `audit:reveal_choice_menu:<stage>:01` through `audit:reveal_choice_menu:<stage>:10`
- Command template: `npm run journey -- --seed audit:reveal_choice_menu:<stage>:NN --stage <stage> --shape reveal_choice_menu --debug --show-deck --no-color`

## Findings

### Burdened Random Reveal Is Dominated By Hidden Random Draw

Severity: high

Seeds: `audit:reveal_choice_menu:mid:02`, `audit:reveal_choice_menu:late:05`, `audit:reveal_choice_menu:early:05`

Replay:
`npm run journey -- --seed audit:reveal_choice_menu:mid:02 --stage mid --shape reveal_choice_menu --debug --show-deck --no-color`

Generated options:

1. Reveal 4 rewards (gain {Poppy Flower}; gain 180 essence; purge a random Despair; gain 1 Doubt). Choose one revealed reward.
2. Reveal 5 rewards. Choose one random revealed reward (precommitted: gain {Poppy Flower}) and gain 2 {Paralysis}.
3. Gain one random reward from the visible pool.

Debug value:

- Option 2: effect +72, burden -290, uncertainty -16, net -234.
- Option 3: effect +72, burden 0, uncertainty -14, net +58.

Additional examples:

- `audit:reveal_choice_menu:late:05`: option 2 net -210, option 3 net +52.
- `audit:reveal_choice_menu:early:05`: option 2 net -127, option 3 net +45.

Issue:
Option 2 and option 3 use the same visible reward pool average, but option 2 adds a Bane burden and a larger uncertainty penalty. This makes option 3 strictly stronger in the debug valuation whenever the same pool is used. The extra reveal count on option 2 does not produce a strategic advantage because the text also discloses the precommitted result, so the player sees a known reward with an added Bane next to a cleaner random draw from the same pool.

Recommendation:
Give the burdened random reveal a real compensating advantage. Viable shapes include a larger premium-only pool for option 2, a higher committed reward floor, a choice among random-revealed rewards, or a reduced Bane profile tied to the committed reward value. Add a focused test that compares option 2 and option 3 values across the audited seeds and fails when option 2 is strictly dominated in the same offer.

### Visible Pool Choice Does Not Show The Visible Pool

Severity: high

Seeds: `audit:reveal_choice_menu:late:09`, `audit:reveal_choice_menu:early:01`, `audit:reveal_choice_menu:mid:07`

Replay:
`npm run journey -- --seed audit:reveal_choice_menu:late:09 --stage late --shape reveal_choice_menu --debug --show-deck --no-color`

Generated options:

1. Reveal 3 rewards (gain 1 random events; gain 1 Envy; gain 120 essence). Choose one revealed reward.
2. Reveal 7 rewards. Choose one random revealed reward (precommitted: draft 1 of 4 cards with multiple abilities. Gain 4 omens) and gain 1 {Betrayal}.
3. Gain one random reward from the visible pool.

Issue:
Option 3 depends on a visible pool, but the player-facing Dream Journey text does not list that pool. The debug metadata contains the pool, and option 1 lists a partial reveal, but the root option text leaves option 3 without enough information to evaluate the random draw. This is especially important in late examples where the pool can include high-impact outcomes such as `gain 4 omens` or transformed drafts that are not visible in option 3.

Recommendation:
Display the visible pool in the player-facing text for option 3, or introduce a shared pool line before the options that all three options reference. Keep the copy compact by naming the pool once, then using "from those rewards" in option text.

### Bane Gains Are Presented As Rewards

Severity: medium

Seeds: `audit:reveal_choice_menu:early:02`, `audit:reveal_choice_menu:early:09`, `audit:reveal_choice_menu:late:10`

Replay:
`npm run journey -- --seed audit:reveal_choice_menu:early:02 --stage early --shape reveal_choice_menu --debug --show-deck --no-color`

Generated options:

1. Reveal 2 rewards (gain 1 Burden; purge a random Despair). Choose one revealed reward.
2. Reveal 4 rewards. Choose one random revealed reward (precommitted: gain 1 random eligible cards) and gain 1 {Burden}.
3. Gain one random reward from the visible pool.

Additional examples:

- `audit:reveal_choice_menu:early:09`: option 1 reveals `gain 1 Envy` as one of two rewards.
- `audit:reveal_choice_menu:late:10`: option 1 reveals `gain 1 Despair` as one of five rewards, and option 2 is precommitted to `gain 1 Despair` while adding `gain 1 {Betrayal}`.

Issue:
The shape labels every revealed entry as a reward even when an entry is a Bane gain. This makes costs read as prizes and weakens downside clarity. It also creates strange choices such as choosing between gaining a Bane and purging a Bane.

Recommendation:
Filter standalone Bane gains out of the reward-facing reveal pool, or label mixed entries as "outcomes" when the pool includes downsides. If Bane gains intentionally appear in this shape, pair them with an explicit upside in the same entry so the revealed item reads as a risky reward instead of a direct penalty.

### Precommitted Random Copy Is Internally Contradictory

Severity: medium

Seeds: `audit:reveal_choice_menu:early:01`, `audit:reveal_choice_menu:mid:05`, `audit:reveal_choice_menu:late:02`

Replay:
`npm run journey -- --seed audit:reveal_choice_menu:early:01 --stage early --shape reveal_choice_menu --debug --show-deck --no-color`

Generated options:

1. Reveal 3 rewards (purge a random Oblivion; gain 180 essence; gain {Dragon Egg}). Choose one revealed reward.
2. Reveal 4 rewards. Choose one random revealed reward (precommitted: gain {Dragon Egg}) and gain 1 {Paranoia}.
3. Gain one random reward from the visible pool.

Issue:
Option 2 says the player chooses one random revealed reward, then immediately shows the precommitted reward. Once the committed reward is shown in the option text, the player experiences this as a known reward plus a Bane, not a random choice. The text also says "choose one random revealed reward", which reads like the player chooses and the system chooses at the same time.

Recommendation:
Choose one presentation. For a visible precommit, use direct copy such as "Take the precommitted revealed reward: gain {Dragon Egg}, then gain 1 {Paranoia}." For a random reveal, keep the committed reward hidden from player-facing text and show only the full visible pool.

### Repeated Menu Structure Limits Replay Variety

Severity: low

Seeds: all audited seeds

Replay:
`npm run journey -- --seed audit:reveal_choice_menu:late:01 --stage late --shape reveal_choice_menu --debug --show-deck --no-color`

Generated options:

1. Reveal N rewards (...). Choose one revealed reward.
2. Reveal N rewards. Choose one random revealed reward (precommitted: ...) and gain N {Bane}.
3. Gain one random reward from the visible pool.

Issue:
Every generated journey uses the same three-option structure with the same strategic roles. Stage changes adjust deck context, pool size, and Bane count, but the decision pattern remains stable: choose from a small listed set, take a burdened known random outcome, or take an unlabeled random pool draw. The shape has low replay variety because the tactical question is almost always solved by the same comparison.

Recommendation:
Add at least one shape-local variant for each stage band. Examples include early menus that compare reveal depth against immediate essence, mid menus that let the player lock one reward and reroll the rest, and late menus that trade a large visible pool for a named future burden.

## Passing Observations

- All 30 forced generations completed successfully.
- The grammar is generally readable, with correct use of Dream Journey vocabulary such as essence, omens, Banes, Dreamsigns, cards, and stages.
- The shape writes structured random and reveal envelopes for all three options, and debug reachability reports `normal_generation` with `structured_manifest_operations`.
- Stage fit is partly present: late samples use larger visible pools than early samples, and mid/late samples can carry larger Bane counts.
- The focused test replays the audited seed set and checks the shape-local visible reward pool contract.

## Verification

Sanity replay command:

`npm run journey -- --seed audit:reveal_choice_menu:early:01 --stage early --shape reveal_choice_menu --debug --show-deck --no-color`

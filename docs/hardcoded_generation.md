# Hardcoded Generation

Hardcoded generation is the failure mode where a Journey output is built by
choosing a specific scenario, predicate, cost, effect, target, duration, or
numeric quantity even though the same design intent could have been expressed as
a small generator with bounded variation.

The problem is not that every authored value is bad. Journey Shapes need
authored topology, recognizable option structure, and value constraints. The
problem appears when the implementation freezes the parts that players expect
to vary. For example:

> Apply {Viridian Transfiguration} to 3 random Starter cards.

That string has at least four generatable axes:

- the card modifier could be sampled from the transfiguration or card-operation
  catalog;
- the target count could vary by value band and stage;
- the selector could be Starter cards, Event cards, low-cost cards, Banes,
  draft-pool cards, or another legal predicate;
- the selection mode could be chosen, visible random, hidden random, all
  matching, or up to N matching cards.

Hardcoding all four axes creates an event-shaped constant. It may still be
legal and readable, but it spends generator surface area on one authored case
instead of a family of nearby cases.

## Codebase Examples

These examples illustrate the same underlying smell: a specific value is
embedded where a reusable generator could own the axis.

1. Route edit menus are built from named variants with exact route edits, such
   as replacing Draft with Purge, Transfiguration, or Dreamsign Offering in
   [`routeEditCatalog.ts`](../src/journey/fillers/routeEditCatalog.ts#L435).
   The topology is useful, but the site-type pairings and scopes could be
   generated from route-edit compatibility rules.

   ```ts
   {
     variantId: "shared-current-draft-replacement",
     sharedProperty: "current_dreamscape replace_site from Draft",
     specs: [
       { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Purge" },
       { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Transfiguration" },
       { operation: "replace_site", routeScope: "current_dreamscape", fromSite: "Draft", toSite: "Dreamsign Offering" },
     ],
   }
   ```

2. Reveal-choice random menus fix several quantities and outcomes: pool size
   five, reveal count three, and a one-Nightmare burden on one branch in
   [`randomPayloads.ts`](../src/journey/fillers/randomPayloads.ts#L349) and
   [`randomPayloads.ts`](../src/journey/fillers/randomPayloads.ts#L511). These
   should be value-band parameters rather than recipe constants.

   ```ts
   const wheel = visibleWheelPool({
     ...args,
     size: 5,
   });
   const candidates = wheel.candidates;
   const revealCount = Math.min(3, candidates.length);
   const nightmare = baneBurden("Nightmare", 1);

   option({
     number: 2,
     text: `Reveal ${candidates.length} rewards. Choose one random revealed reward (precommitted: ${lowerFirst(randomRevealed.text).replace(/\.$/u, "")}) and gain 1 {Nightmare}.`,
     effects: [{ kind: "random_reward", table: "visible_reveal_pool" }],
     burdens: [nightmare],
     burden: valueBaneBurden({ baneName: "Nightmare", count: 1 }),
   });
   ```

3. Compound payload families such as `scissor_saint`, `molting_archive`, and
    `withered_orchard` hardcode named cards, Dreamsigns, transfigurations,
    resource amounts, and burden triggers in
    [`shared.ts`](../src/journey/fillers/shared.ts#L3388). These are close to
    authored events; they would become more procedural if the named objects were
    selected through typed roles such as sacrifice target, premium Dreamsign
    reward, follow-up card transform, or reward-reduction burden.

    ```ts
    compoundOption(
      1,
      contract,
      [
        cardSacrificeComponent({
          context: args.context,
          cardName: "Nocturne Strummer",
        }),
        namedDreamsignRewardComponent({
          context: args.context,
          dreamsignName: "Charm Bracelet",
          value: 400,
        }),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        dreamsignSacrificeComponent({
          context: args.context,
          dreamsignName: "Black Cat",
        }),
        transfigurationRewardComponent("Golden", 420),
      ],
    ),
    ```

## Avoidance Strategies

Treat every Journey recipe as a bundle of axes. Before writing the string or
payload, name what could vary: operation family, target predicate, target count,
selection mode, resource kind, amount band, timing, duration, trigger, burden,
reward, visibility policy, and named-object role.

Move those axes into small catalog entries or generators. A good entry says
"starter cleanup reward" or "delayed hook with named object trigger"; it should
not usually say "purge exactly one Starter" or "play this card four times for
120 essence" unless it is an intentional fixture.

Generate within contracts, not from a global bucket. Shape topology should stay
authored, while predicates, values, targets, and payloads are sampled from legal
families that know their stage, value band, and compatibility rules.

Make numeric constants explain themselves. If a count, percentage, amount, or
duration is fixed, prefer a named value band or helper that can later expand.
For example, "standard small omen payout" is easier to generalize than the
literal number `2` embedded in one hook.

Use fingerprints and tests to catch collapsed diversity. Batch generation should
show variation in semantic axes, not only in card names or resource amounts. A
shape that repeatedly emits the same predicate, same count, same timing, and
same operation should be treated as suspect even if all manifests validate.

During review, ask: "Could this have been a family?" If the answer is yes, the
hardcoded value needs a reason. Good reasons include a first implementation
behind a clear TODO or a deliberately authored unique event. Without one of
those reasons, prefer generation.

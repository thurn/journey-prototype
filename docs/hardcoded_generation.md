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

No unresolved examples are currently listed here. Run a fresh codebase audit
before treating this section as exhaustive.

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

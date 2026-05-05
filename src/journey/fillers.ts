import type { ContentBundle } from "../content/model.js";
import type { JourneyContext } from "../quest/context.js";
import {
  BANE_NAMES,
  resolveCardTargets,
  resolveDreamsignTargets,
  STANDARD_TRANSFIGURATIONS,
} from "./effects.js";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  ManifestReferences,
  PickBehavior,
  PrecommittedOutcomes,
  SequenceState,
} from "./manifest.js";
import { MANIFEST_SCHEMA_VERSION } from "./manifest.js";
import { getShapeDefinition, type JourneyShapeId } from "./shapes.js";
import { symbolsForOption } from "./symbols.js";
import { evaluateOptionValue, type ValueBreakdown } from "./value.js";
import { shuffleDeterministic, type DrawContext } from "../util/rng.js";

type BuildArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  journeyId: string;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  selectedTags: string[];
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  previousPick?: JourneyManifest["debug"]["previousPick"];
};

type OptionArgs = {
  number: number;
  text: string;
  costs?: unknown[];
  effects?: unknown[];
  burdens?: unknown[];
  targets?: unknown[];
  triggers?: unknown[];
  routeEffects?: unknown[];
  cost?: number;
  effect?: number;
  burden?: number;
  uncertainty?: number;
  pickBehavior?: PickBehavior;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en-US"));
}

function option(args: OptionArgs): JourneyOption {
  const built: JourneyOption = {
    number: args.number,
    symbols: [],
    text: args.text,
    costs: args.costs ?? [],
    effects: args.effects ?? [],
    burdens: args.burdens ?? [],
    targets: args.targets ?? [],
    triggers: args.triggers ?? [],
    routeEffects: args.routeEffects ?? [],
    costConvertedEssence: args.cost ?? 0,
    effectConvertedEssence: args.effect ?? 0,
    burdenConvertedEssence: args.burden ?? 0,
    uncertaintyConvertedEssence: args.uncertainty ?? 0,
    netConvertedEssence:
      (args.effect ?? 0) - (args.cost ?? 0) + (args.burden ?? 0) + (args.uncertainty ?? 0),
    pickBehavior: args.pickBehavior ?? "record_and_generate_next",
  };

  return {
    ...built,
    symbols: symbolsForOption(built),
  };
}

function selectedCardTargets(context: JourneyContext, drawContext: DrawContext) {
  const selected = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
    tideOverlap: "selected",
  });
  const fallback = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:cards",
    selected.length > 0 ? selected : fallback,
  );
}

function selectedDreamsignTargets(context: JourneyContext, drawContext: DrawContext) {
  const selected = resolveDreamsignTargets(context.content, context.state.quest, {
    source: "pool",
    tideOverlap: "selected",
  });
  const fallback = resolveDreamsignTargets(context.content, context.state.quest, {
    source: "pool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:dreamsigns",
    selected.length > 0 ? selected : fallback,
  );
}

function target(kind: "card" | "dreamsign", description: string, predicate: unknown) {
  return {
    kind,
    description,
    predicate,
    required: true,
  };
}

function cost(kind: "essence" | "omens", amount: number) {
  return {
    kind,
    amount,
    timing: "immediate",
  };
}

function gainEssence(amount: number) {
  return {
    kind: "gain_essence",
    amount,
  };
}

function gainOmen(amount: number) {
  return {
    kind: "gain_omens",
    amount,
  };
}

function draftCards(choiceCount: number) {
  return {
    kind: "card_draft",
    takeCount: 1,
    choiceCount,
    predicate: { source: "draftPool", tideOverlap: "selected" },
  };
}

function dreamsignDraft(choiceCount: number) {
  return {
    kind: "dreamsign_draft",
    choiceCount,
    predicate: { source: "pool", tideOverlap: "selected" },
  };
}

function starterCleanup(count: number) {
  return {
    kind: "starter_cleanup",
    count,
    predicate: { source: "deck", starter: true },
  };
}

function nightmare(count: number) {
  return {
    kind: "bane_gain",
    baneName: "Nightmare",
    count,
  };
}

function referencesFor(content: ContentBundle, cardIds: readonly string[], dreamsignIds: readonly string[]): ManifestReferences {
  const dreamcallerIds = content.dreamcallers.map((dreamcaller) => dreamcaller.id);

  return {
    cardIds: uniqueSorted(cardIds),
    dreamsignIds: uniqueSorted(dreamsignIds),
    dreamcallerIds: uniqueSorted(dreamcallerIds),
    baneNames: ["Nightmare"],
  };
}

function commonPositiveOptions(context: JourneyContext): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "Gain 45 essence.",
      effects: [gainEssence(45)],
      effect: 45,
    }),
    option({
      number: 2,
      text: "Draft 1 of 6 selected-tide cards.",
      effects: [draftCards(6)],
      targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
      effect: 80,
    }),
    option({
      number: 3,
      text: "Choose one of 3 selected-tide Dreamsigns.",
      effects: [dreamsignDraft(3)],
      targets: [target("dreamsign", "selected-tide Dreamsigns", { source: "pool", tideOverlap: "selected" })],
      effect: 120,
    }),
  ].slice(0, context.state.quest.dreamsignPoolIds.length > 0 ? 3 : 2);
}

function paidDraft(number: number, price: number, choices: number): JourneyOption {
  return option({
    number,
    text: `Pay ${price} essence. Draft 1 of ${choices} selected-tide cards.`,
    costs: [cost("essence", price)],
    effects: [draftCards(choices)],
    targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
    cost: price,
    effect: 75 + choices * 4,
  });
}

function routeEdit(number: number, future = false): JourneyOption {
  const timing = future ? "in the next dreamscape" : "in the current dreamscape";

  return option({
    number,
    text: `Replace a Shop site ${timing} with a Purge site.`,
    routeEffects: [
      {
        kind: future ? "future_route_replacement" : "current_route_replacement",
        fromSite: "Shop",
        toSite: "Purge",
        timing: future ? "next dreamscape" : "current dreamscape",
      },
    ],
    effect: future ? 50 : 95,
  });
}

function sequenceMenu(context: JourneyContext): JourneyOption[] {
  return [
    option({
      number: 1,
      text: "Continue: pay 30 essence. Gain 70 essence.",
      costs: [cost("essence", Math.min(30, context.state.quest.resources.essence))],
      effects: [gainEssence(70)],
      cost: Math.min(30, context.state.quest.resources.essence),
      effect: 70,
      uncertainty: -8,
      pickBehavior: "advance_sequence",
    }),
    option({
      number: 2,
      text: "Stop and keep the committed reward.",
      effect: 20,
      pickBehavior: "complete_sequence",
    }),
  ];
}

function fillOptions(shapeId: JourneyShapeId, context: JourneyContext): {
  options: JourneyOption[];
  sequence?: SequenceState;
  precommitted: PrecommittedOutcomes;
} {
  const payablePrice = Math.min(30, context.state.quest.resources.essence);

  switch (shapeId) {
    case "random_allocation":
      return { options: commonPositiveOptions(context), precommitted: {} };
    case "same_cost_different_rewards":
      return {
        options: [paidDraft(1, payablePrice, 4), paidDraft(2, payablePrice, 6), paidDraft(3, payablePrice, 8)],
        precommitted: {},
      };
    case "same_reward_different_costs":
      return {
        options: [
          paidDraft(1, Math.min(20, context.state.quest.resources.essence), 4),
          option({
            number: 2,
            text: `Pay ${payablePrice} essence. Draft 1 of 4 selected-tide cards. Gain 1 omen.`,
            costs: [cost("essence", payablePrice)],
            effects: [draftCards(4), gainOmen(1)],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            cost: payablePrice,
            effect: 140,
          }),
        ],
        precommitted: {},
      };
    case "service_menu":
      return {
        options: [
          option({
            number: 1,
            text: "Purge up to 1 chosen Starter card.",
            effects: [starterCleanup(1)],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85,
          }),
          paidDraft(2, Math.min(25, context.state.quest.resources.essence), 6),
          option({
            number: 3,
            text: "Choose one of 3 selected-tide Dreamsigns.",
            effects: [dreamsignDraft(3)],
            targets: [target("dreamsign", "selected-tide Dreamsigns", { source: "pool", tideOverlap: "selected" })],
            effect: 120,
          }),
        ],
        precommitted: {},
      };
    case "shop_row":
      return {
        options: [paidDraft(1, 45, 6), paidDraft(2, 65, 8)],
        precommitted: {},
      };
    case "curated_reward_trio":
      return { options: commonPositiveOptions(context), precommitted: {} };
    case "heterogeneous_pair":
      return {
        options: [commonPositiveOptions(context)[0]!, commonPositiveOptions(context)[2]!].map((item, index) => ({
          ...item,
          number: index + 1,
        })),
        precommitted: {},
      };
    case "one_target_many_operations":
      return {
        options: [
          option({
            number: 1,
            text: "Apply Viridian to a chosen selected-tide card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: "Add Fast to a chosen selected-tide card.",
            effects: [{ kind: "card_rewrite", keyword: "Fast" }],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            effect: 70,
          }),
        ],
        precommitted: {},
      };
    case "staged_assembly":
    case "take_up_to_n":
    case "repeat_to_scale":
    case "push_your_luck":
    case "sequential_offers":
    case "escalating_search":
      return {
        options: sequenceMenu(context),
        sequence: { step: 1, status: "active", maxSteps: 2 },
        precommitted: { sequenceMenus: { step2: sequenceMenu(context) } },
      };
    case "mirrored_operations":
      return {
        options: [
          option({
            number: 1,
            text: "Apply Bronze to a chosen selected-tide card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Bronze" }],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: "Apply Viridian to a chosen selected-tide card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
        ],
        precommitted: {},
      };
    case "one_operation_many_targets":
      return {
        options: [
          option({
            number: 1,
            text: "Apply Viridian to a chosen selected-tide card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: "Apply Viridian to a chosen Starter card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85,
          }),
        ],
        precommitted: {},
      };
    case "choose_your_loss":
      return {
        options: [
          option({
            number: 1,
            text: "Pay 25 essence.",
            costs: [cost("essence", Math.min(25, context.state.quest.resources.essence))],
            cost: Math.min(25, context.state.quest.resources.essence),
          }),
          option({
            number: 2,
            text: "Lose 1 omen.",
            costs: [cost("omens", Math.min(1, context.state.quest.resources.omens))],
            cost: Math.min(1, context.state.quest.resources.omens) * 65,
          }),
          option({
            number: 3,
            text: "Gain 1 Nightmare.",
            burdens: [nightmare(1)],
            burden: -125,
          }),
        ],
        precommitted: {},
      };
    case "single_reward":
      return { options: [commonPositiveOptions(context)[0]!], precommitted: {} };
    case "single_offer":
      return {
        options: [
          paidDraft(1, payablePrice, 8),
          option({ number: 2, text: "Leave with no effect.", pickBehavior: "leave" }),
        ],
        precommitted: {},
      };
    case "risk_or_skip":
      return {
        options: [
          option({
            number: 1,
            text: "Gain 160 essence. Gain 1 Nightmare.",
            effects: [gainEssence(160)],
            burdens: [nightmare(1)],
            effect: 160,
            burden: -125,
            uncertainty: -10,
          }),
          option({ number: 2, text: "Leave with no effect.", pickBehavior: "leave" }),
        ],
        precommitted: { random: [{ kind: "visible_downside", baneName: "Nightmare", count: 1 }] },
      };
    case "single_wager":
      return {
        options: [
          option({
            number: 1,
            text: "Pay 30 essence. Resolve the precommitted wager reward.",
            costs: [cost("essence", payablePrice)],
            effects: [{ kind: "random_reward", table: "precommitted" }],
            cost: payablePrice,
            effect: 80,
            uncertainty: -12,
          }),
        ],
        precommitted: { random: [{ kind: "gain_essence", amount: 110 }] },
      };
    case "now_vs_later":
      return {
        options: [
          option({ number: 1, text: "Gain 45 essence.", effects: [gainEssence(45)], effect: 45 }),
          option({
            number: 2,
            text: "After next victory, gain 90 essence.",
            triggers: [{ kind: "after_next_victory" }],
            effects: [gainEssence(90)],
            effect: 67,
            uncertainty: -8,
          }),
        ],
        precommitted: { delayed: [{ trigger: "after next victory", reward: gainEssence(90) }] },
      };
    case "reward_after_trigger":
      return {
        options: [
          option({
            number: 1,
            text: "After next battle, choose one of 3 selected-tide Dreamsigns.",
            triggers: [{ kind: "after_next_battle" }],
            effects: [dreamsignDraft(3)],
            targets: [target("dreamsign", "selected-tide Dreamsigns", { source: "pool", tideOverlap: "selected" })],
            effect: 90,
            uncertainty: -8,
          }),
        ],
        precommitted: { delayed: [{ trigger: "after next battle", reward: dreamsignDraft(3) }] },
      };
    case "paired_return":
      return {
        options: [
          option({
            number: 1,
            text: "Commit a return hook. After next victory, gain 70 essence.",
            triggers: [{ kind: "after_next_victory" }],
            effects: [gainEssence(70)],
            effect: 52,
            uncertainty: -8,
          }),
        ],
        precommitted: {
          delayed: [{ trigger: "after next victory", reward: gainEssence(70) }],
          pairedReturn: [{ anchor: "root choice", reward: gainEssence(70) }],
        },
      };
    case "timed_window_menu":
      return {
        options: [
          option({
            number: 1,
            text: "For the next battle, add Fast to a chosen selected-tide card.",
            effects: [{ kind: "card_rewrite", keyword: "Fast", duration: "next battle" }],
            targets: [target("card", "selected-tide draft cards", { source: "draftPool", tideOverlap: "selected" })],
            effect: 70,
            uncertainty: -5,
          }),
          option({
            number: 2,
            text: "For the next battle, gain 1 omen.",
            effects: [gainOmen(1)],
            effect: 65,
            uncertainty: -5,
          }),
        ],
        precommitted: {},
      };
    case "take_any_number":
      return {
        options: [
          option({ number: 1, text: "Take: gain 25 essence.", effects: [gainEssence(25)], effect: 25 }),
          option({ number: 2, text: "Take: gain 1 omen.", effects: [gainOmen(1)], effect: 65 }),
          option({
            number: 3,
            text: "Take: purge up to 1 chosen Starter card.",
            effects: [starterCleanup(1)],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85,
          }),
        ],
        precommitted: {},
      };
    case "resolved_random_series":
      return {
        options: [
          option({
            number: 1,
            text: "Resolve a precommitted series of three rewards.",
            effects: [{ kind: "random_series", count: 3 }],
            effect: 105,
            uncertainty: -12,
          }),
        ],
        precommitted: { random: [gainEssence(25), gainOmen(1), draftCards(4)] },
      };
    case "single_random_outcome":
      return {
        options: [
          option({
            number: 1,
            text: "Resolve one precommitted reward.",
            effects: [{ kind: "random_reward", table: "precommitted" }],
            effect: 70,
            uncertainty: -12,
          }),
        ],
        precommitted: { random: [gainEssence(70)] },
      };
    case "commit_now_future_payoff":
      return {
        options: [
          option({
            number: 1,
            text: "Commit now. At the next dreamscape, gain 130 essence.",
            triggers: [{ kind: "next_dreamscape" }],
            effects: [gainEssence(130)],
            effect: 104,
            uncertainty: -8,
          }),
        ],
        precommitted: { delayed: [{ trigger: "next dreamscape", reward: gainEssence(130) }] },
      };
    case "alter_dreamscapes":
      return {
        options: [routeEdit(1, false), routeEdit(2, true)],
        precommitted: {
          routeEdits: [
            { kind: "current_route_replacement", fromSite: "Shop", toSite: "Purge" },
            { kind: "future_route_replacement", fromSite: "Shop", toSite: "Purge" },
          ],
        },
      };
  }
}

export function buildConservativeJourneyForShape(args: BuildArgs): JourneyManifest {
  const selectedCards = selectedCardTargets(args.context, args.drawContext).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(args.context, args.drawContext).slice(0, 3);
  const shape = getShapeDefinition(args.shapeId);
  const filled = fillOptions(args.shapeId, args.context);
  const options = filled.options.slice(0, shape.rootOptionCount.max);
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    journeyId: args.journeyId,
    seed: args.context.state.quest.seed,
    rootJourneyIndex: args.context.state.generator.rootJourneyIndex,
    shapeId: args.shapeId,
    stage: args.stage,
    dreamscape: args.context.state.quest.resources.dreamscape,
    selectedTags: args.selectedTags,
    options,
    ...(filled.sequence ? { sequence: filled.sequence } : {}),
    precommitted: filled.precommitted,
    debug: {
      shapeScores: args.shapeScores,
      selectedShapeId: args.shapeId,
      selectedTags: args.selectedTags,
      optionValues,
      repairs: [],
      ...(args.previousPick ? { previousPick: args.previousPick } : {}),
    },
    references: referencesFor(
      args.context.content,
      selectedCards.map((card) => card.id),
      selectedDreamsigns.map((dreamsign) => dreamsign.id),
    ),
  };
}

export const FALLBACK_SHAPE_IDS = Object.freeze([
  "curated_reward_trio",
  "single_reward",
  "service_menu",
] as const satisfies readonly JourneyShapeId[]);

export function fallbackShapeIds(): readonly JourneyShapeId[] {
  return FALLBACK_SHAPE_IDS;
}

export function allowedGeneratedVocabulary() {
  return {
    banes: [...BANE_NAMES],
    transfigurations: [...STANDARD_TRANSFIGURATIONS],
  };
}

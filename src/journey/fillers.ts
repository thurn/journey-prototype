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
import {
  commonEssenceRewardAmount,
  evaluateOptionValue,
  LOSS_CHOICE_VALUE_CONSTANTS,
  valueBaneGain,
  valueCardDraft,
  valueDreamsignDraft,
  valueEssenceGain,
  valueOmenGain,
  valueOmenLoss,
  type ValueBreakdown,
} from "./value.js";
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

const CARD_POOL_TARGET_DESCRIPTION = "eligible draft cards";
const DREAMSIGN_POOL_TARGET_DESCRIPTION = "eligible Dreamsigns";

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

function cardDraftText(choiceCount: number, takeCount = 1): string {
  return `Draft ${takeCount} of ${choiceCount} cards.`;
}

function dreamsignDraftText(choiceCount: number): string {
  return `Choose 1 of ${choiceCount} Dreamsigns.`;
}

function chosenCardText(): string {
  return "a chosen card";
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

function comparableEssenceLossAmount(comparisonLosses: readonly number[], availableEssence: number): number | null {
  const magnitudes = comparisonLosses
    .map((loss) => Math.abs(loss))
    .filter((loss) => loss >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude)
    .sort((left, right) => left - right);

  if (magnitudes.length === 0) {
    return null;
  }

  const lowest = magnitudes[0]!;
  const highest = magnitudes[magnitudes.length - 1]!;
  const target = Math.round(((lowest + highest) / 2) / 5) * 5;
  const payable = Math.min(target, availableEssence);

  return payable >= LOSS_CHOICE_VALUE_CONSTANTS.minimumComparableMagnitude ? payable : null;
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
  const essenceAmount = commonEssenceRewardAmount(context);
  const cardDraft = draftCards(6);
  const dreamsignChoice = dreamsignDraft(3);

  return [
    option({
      number: 1,
      text: `Gain ${essenceAmount} essence.`,
      effects: [gainEssence(essenceAmount)],
      effect: valueEssenceGain(essenceAmount, context),
    }),
    option({
      number: 2,
      text: cardDraftText(6),
      effects: [cardDraft],
      targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
      effect: valueCardDraft(cardDraft),
    }),
    option({
      number: 3,
      text: dreamsignDraftText(3),
      effects: [dreamsignChoice],
      targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, { source: "pool", tideOverlap: "selected" })],
      effect: valueDreamsignDraft(dreamsignChoice, context),
    }),
  ].slice(0, context.state.quest.dreamsignPoolIds.length > 0 ? 3 : 2);
}

function paidDraft(number: number, price: number, choices: number): JourneyOption {
  const cardDraft = draftCards(choices);

  return option({
    number,
    text: `Pay ${price} essence. ${cardDraftText(choices)}`,
    costs: [cost("essence", price)],
    effects: [cardDraft],
    targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
    cost: price,
    effect: valueCardDraft(cardDraft),
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
        source: "simulated_manifest_only",
      },
    ],
    effect: future ? 50 : 95,
  });
}

function sequenceRewardText(shapeId: JourneyShapeId, step: number): string {
  if (shapeId === "push_your_luck") {
    return step === 1
      ? "Push once: resolve the precommitted safe reward, then choose whether to push again."
      : "Final push: resolve the precommitted high reward and its bounded downside.";
  }

  if (shapeId === "sequential_offers") {
    return step === 1
      ? "Accept offer 1: pay 20 essence. Draft 1 of 4 cards, then see the final offer."
      : "Accept final offer: pay 35 essence. Draft 1 of 8 cards.";
  }

  if (shapeId === "escalating_search") {
    return step === 1
      ? "Search layer 1: pay 15 essence. Gain 40 essence, then reveal the deeper layer."
      : "Search layer 2: pay 35 essence. Draft 1 of 8 cards and gain 1 omen.";
  }

  if (shapeId === "repeat_to_scale") {
    return step === 1
      ? "Invest once: pay 20 essence. Commit a 55 essence payout, then choose whether to scale it."
      : "Scale the payout: pay 35 essence. Commit a 120 essence payout.";
  }

  if (shapeId === "take_any_number") {
    return step === 1
      ? "Take cache reward 1: pay 15 essence. Gain 1 omen, then choose whether to take the final reward."
      : "Take final cache reward: purge up to 1 chosen Starter card and gain 1 Nightmare.";
  }

  return step === 1
    ? "Take reward 1: gain 35 essence, then choose whether to take the final reward."
    : "Take final reward: gain 65 essence and gain 1 Nightmare.";
}

function sequenceContinueOption(shapeId: JourneyShapeId, context: JourneyContext, step: number): JourneyOption {
  const finalStep = step >= 2;
  const pickBehavior: PickBehavior = finalStep ? "complete_sequence" : "advance_sequence";

  if (shapeId === "push_your_luck") {
    return option({
      number: 1,
      text: sequenceRewardText(shapeId, step),
      effects: step === 1
        ? [gainEssence(50), { kind: "random_reward", table: "precommitted", step }]
        : [gainEssence(135), { kind: "random_downside", table: "precommitted", step }],
      burdens: step === 2 ? [nightmare(1)] : [],
      effect: step === 1 ? 50 : 135,
      burden: step === 2 ? -125 : 0,
      uncertainty: step === 1 ? -10 : -25,
      pickBehavior,
    });
  }

  if (shapeId === "sequential_offers") {
    const price = Math.min(step === 1 ? 20 : 35, context.state.quest.resources.essence);
    const cardDraft = draftCards(step === 1 ? 4 : 8);

    return option({
      number: 1,
      text: sequenceRewardText(shapeId, step),
      costs: [cost("essence", price)],
      effects: [cardDraft],
      targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
      cost: price,
      effect: valueCardDraft(cardDraft),
      pickBehavior,
    });
  }

  if (shapeId === "escalating_search") {
    const price = Math.min(step === 1 ? 15 : 35, context.state.quest.resources.essence);
    const cardDraft = draftCards(8);

    return option({
      number: 1,
      text: sequenceRewardText(shapeId, step),
      costs: [cost("essence", price)],
      effects: step === 1 ? [gainEssence(40)] : [cardDraft, gainOmen(1)],
      targets: step === 2
        ? [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })]
        : [],
      cost: price,
      effect: step === 1 ? valueEssenceGain(40, context) : valueCardDraft(cardDraft) + valueOmenGain(1),
      uncertainty: step === 2 ? -10 : 0,
      pickBehavior,
    });
  }

  if (shapeId === "repeat_to_scale") {
    const price = Math.min(step === 1 ? 20 : 35, context.state.quest.resources.essence);

    return option({
      number: 1,
      text: sequenceRewardText(shapeId, step),
      costs: [cost("essence", price)],
      effects: [gainEssence(step === 1 ? 55 : 120)],
      cost: price,
      effect: step === 1 ? 55 : 120,
      pickBehavior,
    });
  }

  if (shapeId === "take_any_number") {
    const price = Math.min(15, context.state.quest.resources.essence);

    return option({
      number: 1,
      text: sequenceRewardText(shapeId, step),
      costs: step === 1 ? [cost("essence", price)] : [],
      effects: step === 1 ? [gainOmen(1)] : [starterCleanup(1)],
      burdens: step === 2 ? [nightmare(1)] : [],
      targets: step === 2
        ? [target("card", "Starter cards in deck", { source: "deck", starter: true })]
        : [],
      cost: step === 1 ? price : 0,
      effect: step === 1 ? valueOmenGain(1) : 85,
      burden: step === 2 ? -125 : 0,
      pickBehavior,
    });
  }

  return option({
    number: 1,
    text: sequenceRewardText(shapeId, step),
    effects: step === 1 ? [gainEssence(35)] : [gainEssence(65)],
    burdens: step === 2 ? [nightmare(1)] : [],
    effect: step === 1 ? 35 : 65,
    burden: step === 2 ? -125 : 0,
    pickBehavior,
  });
}

function sequenceStopOption(shapeId: JourneyShapeId, step: number): JourneyOption {
  const text = step === 1
    ? "End the sequence now and convert the unclaimed follow-up into 15 essence."
    : "End the sequence and keep all committed step rewards.";
  const leave = shapeId === "escalating_search" && step === 1;

  return option({
    number: 2,
    text: leave
      ? "Leave the search before going deeper and keep the mapped exit reward."
      : text,
    effects: [gainEssence(step === 1 ? 15 : 25)],
    effect: step === 1 ? 15 : 25,
    pickBehavior: leave ? "leave" : "complete_sequence",
  });
}

function sequenceMenu(shapeId: JourneyShapeId, context: JourneyContext, step: number): JourneyOption[] {
  return [
    sequenceContinueOption(shapeId, context, step),
    sequenceStopOption(shapeId, step),
  ];
}

function sequencePrecommits(shapeId: JourneyShapeId, context: JourneyContext): PrecommittedOutcomes {
  const precommitted: PrecommittedOutcomes = {
    sequenceMenus: {
      step1: sequenceMenu(shapeId, context, 1),
      step2: sequenceMenu(shapeId, context, 2),
    },
  };

  if (shapeId === "push_your_luck") {
    precommitted.random = [
      { step: 1, kind: "visible_reward", outcome: gainEssence(50), bounded: true },
      { step: 2, kind: "visible_downside", outcome: nightmare(1), bounded: true },
    ];
  }

  return precommitted;
}

function fillOptions(shapeId: JourneyShapeId, context: JourneyContext): {
  options: JourneyOption[];
  sequence?: SequenceState;
  precommitted: PrecommittedOutcomes;
} {
  const payablePrice = Math.min(30, context.state.quest.resources.essence);
  const premiumPrice = Math.min(45, context.state.quest.resources.essence);

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
            text: `Pay ${payablePrice} essence. Draft 1 of 4 cards. Gain 1 omen.`,
            costs: [cost("essence", payablePrice)],
            effects: [draftCards(4), gainOmen(1)],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            cost: payablePrice,
            effect: valueCardDraft(draftCards(4)) + valueOmenGain(1),
          }),
          option({
            number: 3,
            text: `Pay ${premiumPrice} essence. Draft 1 of 6 cards. Gain 1 omen.`,
            costs: [cost("essence", premiumPrice)],
            effects: [draftCards(6), gainOmen(1)],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            cost: premiumPrice,
            effect: valueCardDraft(draftCards(6)) + valueOmenGain(1),
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
            text: dreamsignDraftText(3),
            effects: [dreamsignDraft(3)],
            targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, { source: "pool", tideOverlap: "selected" })],
            effect: valueDreamsignDraft(dreamsignDraft(3), context),
          }),
        ],
        precommitted: {},
      };
    case "shop_row":
      return {
        options: [paidDraft(1, 45, 6), paidDraft(2, 65, 8), paidDraft(3, 85, 10)],
        precommitted: {},
      };
    case "curated_reward_trio":
      return { options: commonPositiveOptions(context), precommitted: {} };
    case "heterogeneous_pair": {
      const positiveOptions = commonPositiveOptions(context);
      const options = positiveOptions.length >= 3
        ? [positiveOptions[0]!, positiveOptions[2]!]
        : positiveOptions.slice(0, 2);

      return {
        options: options.map((item, index) => ({
          ...item,
          number: index + 1,
        })),
        precommitted: {},
      };
    }
    case "one_target_many_operations":
      return {
        options: [
          option({
            number: 1,
            text: `Apply Viridian to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: `Add Fast to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Fast" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 70,
          }),
          option({
            number: 3,
            text: `Add Reclaim 1 to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Reclaim", amount: 1 }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 75,
          }),
        ],
        precommitted: {},
      };
    case "take_any_number":
    case "repeat_to_scale":
    case "push_your_luck":
    case "sequential_offers":
    case "escalating_search":
      return {
        options: sequenceMenu(shapeId, context, 1),
        sequence: { step: 1, status: "active", maxSteps: 2 },
        precommitted: sequencePrecommits(shapeId, context),
      };
    case "mirrored_operations":
      return {
        options: [
          option({
            number: 1,
            text: `Apply Bronze to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Bronze" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: `Apply Viridian to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 3,
            text: `Apply Golden to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Golden" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
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
            text: `Apply Viridian to ${chosenCardText()}.`,
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
            effect: 85,
          }),
          option({
            number: 2,
            text: "Apply Viridian to a chosen Starter card.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "Starter cards in deck", { source: "deck", starter: true })],
            effect: 85,
          }),
          option({
            number: 3,
            text: "Apply Viridian to a chosen card in your deck.",
            effects: [{ kind: "transfiguration", transfigurationName: "Viridian" }],
            targets: [target("card", "cards in deck", { source: "deck" })],
            effect: 85,
          }),
        ],
        precommitted: {},
      };
    case "choose_your_loss":
      {
        const omenLoss = valueOmenLoss(1);
        const nightmareLoss = valueBaneGain("Nightmare", 1);
        const essenceLoss = comparableEssenceLossAmount(
          [
            ...(context.state.quest.resources.omens >= 1 ? [omenLoss] : []),
            nightmareLoss,
          ],
          context.state.quest.resources.essence,
        );
        const options: JourneyOption[] = [];

        if (essenceLoss !== null) {
          options.push(option({
            number: options.length + 1,
            text: `Pay ${essenceLoss} essence.`,
            costs: [cost("essence", essenceLoss)],
            cost: essenceLoss,
          }));
        }

        if (context.state.quest.resources.omens >= 1) {
          options.push(option({
            number: options.length + 1,
            text: "Lose 1 omen.",
            costs: [cost("omens", 1)],
            cost: Math.abs(omenLoss),
          }));
        }

        options.push(option({
          number: options.length + 1,
          text: "Gain 1 Nightmare.",
          burdens: [nightmare(1)],
          burden: nightmareLoss,
        }));

        return {
          options,
          precommitted: {},
        };
      }
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
            text: `After next battle, ${dreamsignDraftText(3).replace(/^Choose/u, "choose")}`,
            triggers: [{ kind: "after_next_battle" }],
            effects: [dreamsignDraft(3)],
            targets: [target("dreamsign", DREAMSIGN_POOL_TARGET_DESCRIPTION, { source: "pool", tideOverlap: "selected" })],
            effect: Math.round(valueDreamsignDraft(dreamsignDraft(3), context) * 0.75),
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
            text: `For the next battle, add Fast to ${chosenCardText()}.`,
            effects: [{ kind: "card_rewrite", keyword: "Fast", duration: "next battle" }],
            targets: [target("card", CARD_POOL_TARGET_DESCRIPTION, { source: "draftPool", tideOverlap: "selected" })],
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
            {
              kind: "current_route_replacement",
              fromSite: "Shop",
              toSite: "Purge",
              timing: "current dreamscape",
              source: "simulated_manifest_only",
            },
            {
              kind: "future_route_replacement",
              fromSite: "Shop",
              toSite: "Purge",
              timing: "next dreamscape",
              source: "simulated_manifest_only",
            },
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

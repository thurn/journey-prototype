import type { JourneyContext } from "../../../quest/context.js";
import {
  shuffleDeterministic,
  weightedChoice,
  type DrawContext,
} from "../../../util/rng.js";
import {
  ALLOWED_TRANSFIGURATIONS,
  resolveCardTargets,
} from "../../effects.js";
import { statusPayload } from "../../fillers/environmentPayloads.js";
import {
  cardExactTarget,
  cardQualityValue,
  namedCardPayload,
  selectContentBackedCard,
} from "../../fillers/namedCardPayloads.js";
import {
  dreamsignExactTarget,
  namedDreamsignPayload,
  selectContentBackedDreamsign,
} from "../../fillers/dreamsignPayloads.js";
import {
  firstRouteEditReward,
  routeEditRewards,
} from "../../fillers/routeEditCatalog.js";
import {
  CARD_DRAFT_PROFILES,
  cardDraftText,
  costSlots,
  draftCards,
  gainEssence,
  gainOmen,
  pickSequentialVariant,
  randomCardGain,
  randomCardGainText,
  starterCleanup,
  target,
  type CardDraftProfile,
  type FillPlanVisibleObject,
  type ResolvedShapeFill,
  type ResolvedShapeFillOption,
} from "../../fillers/shared.js";
import {
  DREAMSIGN_VALUE_CONSTANTS,
  valueCardDraft,
  valueDreamsignOperation,
  valueOmenGain,
  valueRandomCardGain,
  valueStarterCleanup,
  valueStatusRuleMutation,
  valueUsefulNonStarterCardSacrifice,
} from "../../value.js";
import type { JourneyStage } from "../../manifest.js";
import { getShapeDefinition, type JourneyShapeId } from "../../shapes.js";

export type CompoundCompositionRole =
  | "primary_reward"
  | "cost"
  | "burden"
  | "route_side_effect"
  | "delayed_side_effect"
  | "follow_up_operation";

export type CompoundValueBand = "minor" | "standard" | "premium";

export type CompoundCompositionContract = {
  shapeId: JourneyShapeId;
  allowCosts?: boolean;
  allowBurdens?: boolean;
  allowRouteSideEffects?: boolean;
  allowDelayedSideEffects?: boolean;
  allowFollowUpOperations?: boolean;
  allowRouteOnlyReward?: boolean;
  minimumUpside: number;
  valueBands: readonly CompoundValueBand[];
  allowedTargetKinds?: readonly FillPlanVisibleObject["objectKind"][];
};

export type CompoundPayloadComponent = {
  role: CompoundCompositionRole;
  key: string;
  family: string;
  text: string;
  value: number;
  valueBand: CompoundValueBand;
  polarity: "positive" | "negative" | "mixed";
  costs?: readonly unknown[];
  effects?: readonly unknown[];
  burdens?: readonly unknown[];
  targets?: readonly unknown[];
  triggers?: readonly unknown[];
  routeEffects?: readonly unknown[];
  targetKinds?: readonly FillPlanVisibleObject["objectKind"][];
  uncertainty?: number;
};

type RewardReductionTrigger = "battle" | "essence_site";

type RewardReductionStatusDuration = Parameters<
  typeof statusPayload
>[0]["duration"];

type RewardReductionDuration = {
  label: string;
  statusDuration: RewardReductionStatusDuration;
};

const REWARD_REDUCTION_DURATIONS: Record<
  RewardReductionTrigger,
  readonly RewardReductionDuration[]
> = {
  battle: [
    { label: "next 2 battles", statusDuration: "next_2_battles" },
    { label: "next 3 battles", statusDuration: "next_3_battles" },
    { label: "next 4 battles", statusDuration: "next_4_battles" },
  ],
  essence_site: [
    { label: "next 2 dreamscapes", statusDuration: "next_2_dreamscapes" },
    { label: "next 3 dreamscapes", statusDuration: "next_3_dreamscapes" },
    { label: "next 4 dreamscapes", statusDuration: "next_4_dreamscapes" },
  ],
};

function rewardReductionDuration(
  drawContext: DrawContext,
  label: string,
  trigger: RewardReductionTrigger,
): RewardReductionDuration {
  return pickSequentialVariant(
    drawContext,
    `${label}:${trigger}:duration`,
    REWARD_REDUCTION_DURATIONS[trigger],
  );
}

function stageFromContext(context: JourneyContext): JourneyStage {
  const dreamscape = context.state.quest.resources.dreamscape;

  if (dreamscape <= 1) {
    return "early";
  }

  return dreamscape <= 3 ? "mid" : "late";
}

function componentValue<T extends Record<string, unknown>>(
  payload: T,
  value: number,
): T & { componentConvertedEssence: number } {
  return {
    ...payload,
    componentConvertedEssence: value,
  };
}

function compoundValueBand(value: number): CompoundValueBand {
  const magnitude = Math.abs(value);

  if (magnitude >= 300) {
    return "premium";
  }

  if (magnitude >= 100) {
    return "standard";
  }

  return "minor";
}

function targetKindsCompatible(
  contract: CompoundCompositionContract,
  components: readonly CompoundPayloadComponent[],
): boolean {
  if (!contract.allowedTargetKinds) {
    return true;
  }

  return components
    .flatMap((component) => component.targetKinds ?? [])
    .every((targetKind) => contract.allowedTargetKinds!.includes(targetKind));
}

function roleAllowed(
  contract: CompoundCompositionContract,
  role: CompoundCompositionRole,
): boolean {
  switch (role) {
    case "primary_reward":
      return true;
    case "cost":
      return contract.allowCosts === true;
    case "burden":
      return contract.allowBurdens === true;
    case "route_side_effect":
      return contract.allowRouteSideEffects === true;
    case "delayed_side_effect":
      return contract.allowDelayedSideEffects === true;
    case "follow_up_operation":
      return contract.allowFollowUpOperations === true;
  }
}

export function composeCompoundPayloadOption(args: {
  number: number;
  contract: CompoundCompositionContract;
  components: readonly CompoundPayloadComponent[];
}): ResolvedShapeFillOption | undefined {
  const primary = args.components.find((component) =>
    component.role === "primary_reward"
  );
  const activeComponents = args.components.filter((component) =>
    component.value !== 0 ||
    (component.effects?.length ?? 0) > 0 ||
    (component.burdens?.length ?? 0) > 0 ||
    (component.costs?.length ?? 0) > 0 ||
    (component.routeEffects?.length ?? 0) > 0
  );

  if (!primary || primary.value < args.contract.minimumUpside) {
    return undefined;
  }

  if (
    !args.contract.valueBands.includes(primary.valueBand) ||
    !activeComponents.every((component) => roleAllowed(args.contract, component.role)) ||
    !targetKindsCompatible(args.contract, activeComponents)
  ) {
    return undefined;
  }

  const hasRouteOnlyReward =
    (primary.routeEffects?.length ?? 0) > 0 &&
    (primary.effects?.length ?? 0) === 0;
  const downside = activeComponents.filter((component) =>
    component.role === "cost" || component.role === "burden"
  );

  if (hasRouteOnlyReward && args.contract.allowRouteOnlyReward !== true) {
    return undefined;
  }

  if (downside.length > 0 && primary.value < args.contract.minimumUpside) {
    return undefined;
  }

  const orderedComponents = [
    ...activeComponents.filter((component) =>
      component.role === "cost" || component.role === "burden"
    ),
    ...activeComponents.filter((component) =>
      component.role === "primary_reward" ||
      component.role === "route_side_effect" ||
      component.role === "follow_up_operation" ||
      component.role === "delayed_side_effect"
    ),
  ];

  return {
    number: args.number,
    textParts: orderedComponents.map((component) => ({
      source: component.role === "cost"
        ? "cost"
        : component.role === "burden"
          ? "burden"
          : component.role === "delayed_side_effect"
            ? "timing"
            : "reward",
      text: component.text,
    })),
    payloadSpecs: orderedComponents.map((component) => ({
      role: component.role === "cost"
        ? "cost"
        : component.role === "burden"
          ? "burden"
          : component.role === "route_side_effect"
            ? "route"
            : component.role === "delayed_side_effect"
              ? "trigger"
              : "reward",
      key: component.key,
      family: component.family,
      payloads: [
        ...(component.costs ?? []),
        ...(component.effects ?? []),
        ...(component.burdens ?? []),
        ...(component.triggers ?? []),
        ...(component.routeEffects ?? []),
      ],
    })),
    costs: activeComponents.flatMap((component) => component.costs ?? []),
    effects: activeComponents.flatMap((component) => component.effects ?? []),
    burdens: activeComponents.flatMap((component) => component.burdens ?? []),
    targetSelectors: activeComponents.flatMap((component) =>
      component.targets ?? []
    ),
    triggers: activeComponents.flatMap((component) => component.triggers ?? []),
    routeEffects: activeComponents.flatMap((component) =>
      component.routeEffects ?? []
    ),
    valueEstimate: {
      cost: activeComponents
        .filter((component) => component.role === "cost")
        .reduce((total, component) => total + Math.abs(component.value), 0),
      effect: activeComponents
        .filter((component) =>
          component.role === "primary_reward" ||
          component.role === "route_side_effect" ||
          component.role === "follow_up_operation"
        )
        .reduce((total, component) => total + component.value, 0),
      burden: activeComponents
        .filter((component) => component.role === "burden")
        .reduce((total, component) => total + component.value, 0),
      uncertainty: activeComponents.reduce(
        (total, component) => total + (component.uncertainty ?? 0),
        0,
      ),
    },
  };
}

function exactCardByName(
  context: JourneyContext,
  name: string,
) {
  return context.content.cards.find((card) => card.name === name);
}

function exactDreamsignByName(
  context: JourneyContext,
  name: string,
) {
  return context.content.dreamsigns.find((dreamsign) => dreamsign.name === name);
}

function namedDreamsignRewardComponent(args: {
  context: JourneyContext;
  dreamsignName?: string;
  drawContext?: DrawContext;
  label?: string;
  stage?: JourneyStage;
  value?: number;
}): CompoundPayloadComponent | undefined {
  const dreamsign = args.dreamsignName
    ? exactDreamsignByName(args.context, args.dreamsignName)
    : args.drawContext && args.label && args.stage
      ? selectContentBackedDreamsign({
          context: args.context,
          drawContext: args.drawContext,
          label: args.label,
          stage: args.stage,
          sources: ["catalog"],
        })?.dreamsign
      : undefined;

  if (!dreamsign) {
    return undefined;
  }

  const value = args.value ?? DREAMSIGN_VALUE_CONSTANTS.namedGain;

  return {
    role: "primary_reward",
    key: `compound:named-dreamsign:${dreamsign.id}`,
    family: "named_dreamsign_reward",
    text: `Gain {${dreamsign.name}}.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [
      componentValue(
        namedDreamsignPayload(
          {
            kind: "dreamsign_gain",
            dreamsign,
            source: "catalog",
            extra: { compoundComponentRole: "primary_reward" },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    targetKinds: ["dreamsign"],
  };
}

function namedCardRewardComponent(args: {
  context: JourneyContext;
  cardName?: string;
  predicate?: Parameters<typeof selectContentBackedCard>[0]["predicate"];
  text?: string;
}): CompoundPayloadComponent | undefined {
  const selected = args.cardName
    ? exactCardByName(args.context, args.cardName)
    : undefined;
  const card = selected ??
    selectContentBackedCard({
      context: args.context,
      drawContext: {
        seed: args.context.state.quest.seed,
        contentVersion: args.context.contentVersion,
        rootJourneyIndex: args.context.state.generator.rootJourneyIndex,
      },
      label: "compound:named-card-reward",
      stage: stageFromContext(args.context),
      sources: ["catalog"],
      predicate: args.predicate,
    })?.card;

  if (!card) {
    return undefined;
  }

  const value = Math.max(320, cardQualityValue(card));

  return {
    role: "primary_reward",
    key: `compound:named-card:${card.id}`,
    family: "named_card_reward",
    text: args.text ?? `Gain {${card.name}}.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [
      componentValue(
        namedCardPayload(
          {
            kind: "card_gain",
            result: card,
            source: "catalog",
            extra: { compoundComponentRole: "primary_reward" },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [cardExactTarget(card, "catalog")],
    targetKinds: ["card"],
  };
}

function cardDraftRewardComponent(
  context: JourneyContext,
  profile: CardDraftProfile,
): CompoundPayloadComponent {
  const draft = draftCards(profile);
  const value = Math.max(400, valueCardDraft(draft));

  return {
    role: "primary_reward",
    key: `compound:card-draft:${profile.label}`,
    family: "card_draft_reward",
    text: cardDraftText(profile),
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [componentValue(draft, value)],
    targets: [target("card", profile.targetDescription, draft.predicate)],
    targetKinds: ["card"],
  };
}

function transfigurationRewardComponent(
  transfigurationName: string,
  value = 220,
): CompoundPayloadComponent {
  return {
    role: "primary_reward",
    key: `compound:transfiguration:${transfigurationName}`,
    family: "card_transfiguration_reward",
    text: `Apply {${transfigurationName} Transfiguration} to a chosen card.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [
      componentValue(
        {
          kind: "transfiguration",
          transfigurationName,
          scope: "chosen_card",
          compoundComponentRole: "primary_reward",
        },
        value,
      ),
    ],
    targets: [target("card", "a chosen card in deck", { source: "deck" })],
    targetKinds: ["card"],
  };
}

function cardSacrificeComponent(args: {
  context: JourneyContext;
  cardName?: string;
  randomCharacter?: boolean;
}): CompoundPayloadComponent | undefined {
  const card = args.cardName ? exactCardByName(args.context, args.cardName) : undefined;
  const payload = card
    ? namedCardPayload(
        {
          kind: "card_purge",
          target: card,
          source: "deck",
          extra: {
            purgeMode: "exact_named",
            cardOperationFamily: "purge",
            compoundComponentRole: "burden",
          },
        },
        args.context,
      )
    : {
        kind: "card_purge",
        purgeMode: "random",
        selection: "hidden_random",
        predicate: {
          source: "deck",
          ...(args.randomCharacter === true ? { cardType: "Character" } : {}),
        },
        cardOperationFamily: "purge",
        compoundComponentRole: "burden",
      };
  const value = valueUsefulNonStarterCardSacrifice(1);

  return {
    role: "burden",
    key: card ? `compound:card-sacrifice:${card.id}` : "compound:card-sacrifice:random-character",
    family: "card_sacrifice",
    text: card ? `Purge {${card.name}}.` : "Purge a random character.",
    value,
    valueBand: compoundValueBand(value),
    polarity: "negative",
    burdens: [componentValue(payload, value)],
    targets: card
      ? [cardExactTarget(card, "deck", `${card.name} in your deck`)]
      : [
          target(
            "card",
            "random Character cards in deck",
            { source: "deck", cardType: "Character" },
            { selection: "hidden_random" },
          ),
        ],
    targetKinds: ["card"],
    uncertainty: args.randomCharacter === true ? -10 : undefined,
  };
}

function dreamsignSacrificeComponent(args: {
  context: JourneyContext;
  dreamsignName?: string;
  drawContext?: DrawContext;
  label?: string;
  stage?: JourneyStage;
}): CompoundPayloadComponent | undefined {
  const dreamsign = args.dreamsignName
    ? exactDreamsignByName(args.context, args.dreamsignName)
    : args.drawContext && args.label && args.stage
      ? selectContentBackedDreamsign({
          context: args.context,
          drawContext: args.drawContext,
          label: args.label,
          stage: args.stage,
          sources: ["catalog"],
        })?.dreamsign
      : undefined;

  if (!dreamsign) {
    return undefined;
  }

  const value = DREAMSIGN_VALUE_CONSTANTS.loss;

  return {
    role: "burden",
    key: `compound:dreamsign-sacrifice:${dreamsign.id}`,
    family: "dreamsign_sacrifice",
    text: `Purge {${dreamsign.name}}.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "negative",
    burdens: [
      componentValue(
        namedDreamsignPayload(
          {
            kind: "dreamsign_purge",
            dreamsign,
            source: "catalog",
            extra: {
              dreamsignOperationFamily: "purge",
              compoundComponentRole: "burden",
            },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    targetKinds: ["dreamsign"],
  };
}

function rewardReductionBurdenComponent(args: {
  trigger: RewardReductionTrigger;
  amount: number;
  duration: RewardReductionDuration;
}): CompoundPayloadComponent {
  const isBattle = args.trigger === "battle";
  const value = valueStatusRuleMutation(
    isBattle ? "battle_reward_reduction" : "essence_site_reward_reduction",
  );

  return {
    role: "burden",
    key: `compound:reward-reduction:${args.trigger}:${args.amount}`,
    family: "reward_reduction_burden",
    text: isBattle
      ? `For the ${args.duration.label}, Battle rewards offer ${args.amount} fewer card choice${args.amount === 1 ? "" : "s"}.`
      : `For the ${args.duration.label}, Essence sites yield ${args.amount} less essence.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "negative",
    burdens: [
      componentValue(
        statusPayload({
          kind: "status_reward_reduction",
          statusName: isBattle ? "Withered Orchard" : "Dry Orchard",
          statusScope: "reward",
          duration: args.duration.statusDuration,
          ruleMutationKind: isBattle
            ? "battle_reward_reduction"
            : "essence_site_reward_reduction",
          polarity: "negative",
          rewardTrigger: args.trigger,
          replacedRewardKind: isBattle
            ? "battle_rewards"
            : "essence_site_rewards",
          resource: isBattle ? undefined : "essence",
          amount: args.amount,
        }),
        value,
      ),
    ],
    targetKinds: ["generated_object"],
  };
}

function randomCardGainRewardComponent(
  profile: CardDraftProfile,
  count: number,
): CompoundPayloadComponent {
  const payload = randomCardGain(profile, count);
  const value = Math.max(420, valueRandomCardGain(payload));

  return {
    role: "primary_reward",
    key: `compound:random-card-gain:${profile.label}:${count}`,
    family: "random_card_gain_reward",
    text: randomCardGainText(profile, count),
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [componentValue(payload, value)],
    targets: [target("card", profile.targetDescription, payload.predicate)],
    targetKinds: ["card"],
    uncertainty: -10,
  };
}

function transformCardToRandomRewardComponent(args: {
  context: JourneyContext;
  drawContext?: DrawContext;
  label?: string;
  cardName?: string;
  reward: CompoundPayloadComponent;
}): CompoundPayloadComponent | undefined {
  const deckCandidates = resolveCardTargets(
    args.context.content,
    args.context.state.quest,
    { source: "deck" },
  );
  const preferredDeckCandidates = deckCandidates.filter(
    (candidate) => candidate.rarity !== "Starter",
  );
  const card = args.cardName
    ? exactCardByName(args.context, args.cardName)
    : args.drawContext && args.label
      ? shuffleDeterministic(
          args.drawContext,
          `${args.label}:transform-card-target`,
          preferredDeckCandidates.length > 0
            ? preferredDeckCandidates
            : deckCandidates,
        )[0]
      : undefined;

  if (!card) {
    return undefined;
  }

  const value = 105;

  return {
    role: "follow_up_operation",
    key: `compound:card-transform-random:${card.id}`,
    family: "transform_plus_reward",
    text: `Transform {${card.name}} into a random card.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "mixed",
    effects: [
      componentValue(
        namedCardPayload(
          {
            kind: "card_transform",
            target: card,
            source: "deck",
            extra: {
              resultSelection: "hidden_random",
              resultPredicate: { source: "catalog" },
              cardOperationFamily: "transform",
              compoundComponentRole: "follow_up_operation",
            },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [cardExactTarget(card, "deck", `${card.name} in your deck`)],
    targetKinds: ["card", ...(args.reward.targetKinds ?? [])],
    uncertainty: -10,
  };
}

function transformDreamsignToRandomRewardComponent(args: {
  context: JourneyContext;
  dreamsignName?: string;
  drawContext?: DrawContext;
  label?: string;
  stage?: JourneyStage;
}): CompoundPayloadComponent | undefined {
  const dreamsign = args.dreamsignName
    ? exactDreamsignByName(args.context, args.dreamsignName)
    : args.drawContext && args.label && args.stage
      ? selectContentBackedDreamsign({
          context: args.context,
          drawContext: args.drawContext,
          label: args.label,
          stage: args.stage,
          sources: ["catalog"],
        })?.dreamsign
      : undefined;

  if (!dreamsign) {
    return undefined;
  }

  const value = Math.max(
    250,
    valueDreamsignOperation("transform", { random: true }),
  );

  return {
    role: "primary_reward",
    key: `compound:dreamsign-transform-random:${dreamsign.id}`,
    family: "transform_plus_reward",
    text: `Transform {${dreamsign.name}} into a random Dreamsign.`,
    value,
    valueBand: compoundValueBand(value),
    polarity: "mixed",
    effects: [
      componentValue(
        namedDreamsignPayload(
          {
            kind: "dreamsign_transform",
            dreamsign,
            source: "catalog",
            extra: {
              resultSelection: "hidden_random",
              resultPredicate: { source: "catalog" },
              dreamsignOperationFamily: "transform",
              compoundComponentRole: "primary_reward",
            },
          },
          args.context,
        ),
        value,
      ),
    ],
    targets: [dreamsignExactTarget(dreamsign, "catalog")],
    targetKinds: ["dreamsign"],
    uncertainty: -10,
  };
}

function resourceRewardFollowUp(amount: number): CompoundPayloadComponent {
  return {
    role: "follow_up_operation",
    key: `compound:essence-follow-up:${amount}`,
    family: "resource_follow_up_reward",
    text: `Gain ${amount} essence.`,
    value: amount,
    valueBand: compoundValueBand(amount),
    polarity: "positive",
    effects: [componentValue(gainEssence(amount), amount)],
  };
}

function starterCleanupRewardComponent(stage: JourneyStage): CompoundPayloadComponent {
  const cleanup = starterCleanup(1);
  const value = Math.max(320, valueStarterCleanup({ count: 1, stage }));

  return {
    role: "primary_reward",
    key: "compound:starter-cleanup",
    family: "starter_cleanup_reward",
    text: "Purge up to 1 chosen Starter card.",
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    effects: [componentValue(cleanup, value)],
    targets: [
      target("card", "Starter cards in deck", {
        source: "deck",
        starter: true,
      }),
    ],
    targetKinds: ["card"],
  };
}

function routeSideEffectComponent(args: {
  drawContext: DrawContext;
  label: string;
  maxEffect?: number;
}): CompoundPayloadComponent {
  const boundedRewards = args.maxEffect === undefined
    ? []
    : routeEditRewards({
        drawContext: args.drawContext,
        label: `${args.label}:bounded`,
        count: 16,
        operationKinds: ["add_site"],
        scopes: ["current_dreamscape"],
        polarities: ["positive"],
      }).filter((reward) => reward.effect <= args.maxEffect!);
  const routeReward = boundedRewards[0] ?? firstRouteEditReward({
    drawContext: args.drawContext,
    label: args.label,
    operationKinds: ["add_site"],
    polarities: ["positive"],
  });
  const value = routeReward.effect;

  return {
    role: "route_side_effect",
    key: `compound:route-side-effect:${routeReward.key}`,
    family: "route_side_effect",
    text: routeReward.text,
    value,
    valueBand: compoundValueBand(value),
    polarity: "positive",
    routeEffects: [componentValue(routeReward.payload, value)],
    targetKinds: ["route_site"],
  };
}

// Reserved for future compound families that emit a delayed side effect.
// Currently unused; preserved verbatim from the legacy central definition.
function delayedSideEffectComponent(): CompoundPayloadComponent {
  return {
    role: "delayed_side_effect",
    key: "compound:delayed-side-effect:omen",
    family: "delayed_side_effect",
    text: "After next victory, gain 1 omen.",
    value: 40,
    valueBand: "minor",
    polarity: "positive",
    triggers: [
      {
        kind: "after_next_victory",
        compoundComponentRole: "delayed_side_effect",
      },
    ],
    effects: [componentValue(gainOmen(1), valueOmenGain(1))],
    uncertainty: -8,
  };
}

function compoundContract(shapeId: JourneyShapeId): CompoundCompositionContract {
  const definition = getShapeDefinition(shapeId);

  return {
    shapeId,
    allowCosts: true,
    allowBurdens: true,
    allowRouteSideEffects: definition.allowsRouteSideEffects,
    allowDelayedSideEffects: true,
    allowFollowUpOperations: true,
    allowRouteOnlyReward: shapeId === "alter_dreamscapes",
    minimumUpside: 140,
    valueBands: ["standard", "premium"],
    allowedTargetKinds: ["card", "dreamsign", "route_site", "generated_object"],
  };
}

function compoundOption(
  number: number,
  contract: CompoundCompositionContract,
  components: readonly (CompoundPayloadComponent | undefined)[],
): ResolvedShapeFillOption | undefined {
  if (components.some((component) => component === undefined)) {
    return undefined;
  }

  return composeCompoundPayloadOption({
    number,
    contract,
    components: components as readonly CompoundPayloadComponent[],
  });
}

function scissorSaintCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const transfigurationName = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:scissor-saint:transfiguration`,
    ALLOWED_TRANSFIGURATIONS,
  );
  const options = [
    compoundOption(
      1,
      contract,
      [
        cardSacrificeComponent({
          context: args.context,
          randomCharacter: true,
        }),
        namedDreamsignRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:scissor-saint:premium-dreamsign`,
          stage: args.stage,
          value: 400,
        }),
      ],
    ),
    compoundOption(
      2,
      contract,
      [
        cardSacrificeComponent({
          context: args.context,
          randomCharacter: true,
        }),
        cardDraftRewardComponent(args.context, CARD_DRAFT_PROFILES.survivors),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        dreamsignSacrificeComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:scissor-saint:sacrificed-dreamsign`,
          stage: args.stage,
        }),
        transfigurationRewardComponent(transfigurationName, 420),
      ],
    ),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:scissor_saint",
    options: options as ResolvedShapeFillOption[],
  };
}

function moltingArchiveCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const followUpAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:molting-archive:follow-up-essence`,
    [75, 90, 105],
  );
  const gingerRoot = namedDreamsignRewardComponent({
    context: args.context,
    drawContext: args.drawContext,
    label: `${args.shapeId}:molting-archive:dreamsign-reward`,
    stage: args.stage,
    value: 320,
  });
  const options = [
    compoundOption(
      1,
      contract,
      [
        transformDreamsignToRandomRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:molting-archive:dreamsign-transform`,
          stage: args.stage,
        }),
        resourceRewardFollowUp(followUpAmount),
      ],
    ),
    compoundOption(
      2,
      contract,
      [
        gingerRoot,
        transformCardToRandomRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:molting-archive:card-transform`,
          reward: gingerRoot ?? {
            role: "primary_reward",
            key: "missing",
            family: "missing",
            text: "",
            value: 0,
            valueBand: "minor",
            polarity: "positive",
          },
        }),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        cardSacrificeComponent({ context: args.context }),
        randomCardGainRewardComponent(CARD_DRAFT_PROFILES.energyGenerationCards, 3),
      ],
    ),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:molting_archive",
    options: options as ResolvedShapeFillOption[],
  };
}

function witheredOrchardCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  stage: JourneyStage;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const battleRewardReductionAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:withered-orchard:battle-reduction`,
    [1, 1, 2],
  );
  const essenceRewardReductionAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:withered-orchard:essence-reduction`,
    [20, 30, 40],
  );
  const starterCleanupReductionAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:withered-orchard:starter-cleanup-reduction`,
    [15, 20, 25],
  );
  const battleRewardReductionDuration = rewardReductionDuration(
    args.drawContext,
    `${args.shapeId}:withered-orchard:battle-reduction`,
    "battle",
  );
  const essenceRewardReductionDuration = rewardReductionDuration(
    args.drawContext,
    `${args.shapeId}:withered-orchard:essence-reduction`,
    "essence_site",
  );
  const starterCleanupReductionDuration = rewardReductionDuration(
    args.drawContext,
    `${args.shapeId}:withered-orchard:starter-cleanup-reduction`,
    "essence_site",
  );
  const options = [
    compoundOption(
      1,
      contract,
      [
        rewardReductionBurdenComponent({
          trigger: "battle",
          amount: battleRewardReductionAmount,
          duration: battleRewardReductionDuration,
        }),
        namedDreamsignRewardComponent({
          context: args.context,
          drawContext: args.drawContext,
          label: `${args.shapeId}:withered-orchard:dreamsign-reward`,
          stage: args.stage,
          value: 320,
        }),
      ],
    ),
    compoundOption(
      2,
      contract,
      [
        rewardReductionBurdenComponent({
          trigger: "essence_site",
          amount: essenceRewardReductionAmount,
          duration: essenceRewardReductionDuration,
        }),
        namedCardRewardComponent({
          context: args.context,
          predicate: { rarity: "Legendary" },
          text: "Gain a Legendary card.",
        }),
      ],
    ),
    compoundOption(
      3,
      contract,
      [
        rewardReductionBurdenComponent({
          trigger: "essence_site",
          amount: starterCleanupReductionAmount,
          duration: starterCleanupReductionDuration,
        }),
        starterCleanupRewardComponent(args.stage),
      ],
    ),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:withered_orchard",
    options: options as ResolvedShapeFillOption[],
  };
}

function mixedServiceCompoundFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  shapeId: JourneyShapeId;
}): ResolvedShapeFill | undefined {
  const contract = compoundContract(args.shapeId);
  const sharedCost = costSlots(
    args.context,
    args.drawContext,
    `${args.shapeId}:compound-mixed-cost`,
  ).find((slot) => slot.key === "low-essence") ??
    costSlots(
      args.context,
      args.drawContext,
      `${args.shapeId}:compound-mixed-cost`,
    ).find((slot) => (slot.cost ?? 0) > 0);
  const reward = namedDreamsignRewardComponent({
    context: args.context,
    drawContext: args.drawContext,
    label: `${args.shapeId}:compound-mixed-dreamsign`,
    stage: stageFromContext(args.context),
    value: 320,
  });
  const followUpAmount = pickSequentialVariant(
    args.drawContext,
    `${args.shapeId}:compound-mixed-follow-up-essence`,
    [55, 65, 75],
  );
  const costComponent: CompoundPayloadComponent | undefined = sharedCost
    ? {
        role: "cost",
        key: `compound:cost:${sharedCost.key}`,
        family: "resource_cost",
        text: sharedCost.prefix,
        value: Math.abs(sharedCost.cost ?? 0),
        valueBand: compoundValueBand(sharedCost.cost ?? 0),
        polarity: "negative",
        costs: sharedCost.costs?.map((entry) =>
          componentValue(entry as Record<string, unknown>, Math.abs(sharedCost.cost ?? 0))
        ),
      }
    : undefined;
  const options = [
    compoundOption(1, contract, [costComponent, reward]),
    compoundOption(2, contract, [
      reward,
      routeSideEffectComponent({
        drawContext: args.drawContext,
        label: `${args.shapeId}:compound-route`,
        maxEffect: 75,
      }),
    ]),
    compoundOption(3, contract, [
      reward,
      resourceRewardFollowUp(followUpAmount),
    ]),
  ];

  if (options.some((entry) => entry === undefined)) {
    return undefined;
  }

  return {
    fillKind: "compound_payload:mixed_service",
    options: options as ResolvedShapeFillOption[],
  };
}

export function compoundPayloadMenuFill(args: {
  context: JourneyContext;
  drawContext: DrawContext;
  label: string;
  family?: "scissor_saint" | "molting_archive" | "withered_orchard" | "mixed_service";
  shapeId: JourneyShapeId;
  stage: JourneyStage;
}): ResolvedShapeFill | undefined {
  const family = args.family ??
    weightedChoice(
      args.drawContext,
      `${args.label}:compound-family`,
      [
        { item: "scissor_saint", weight: 3 },
        { item: "molting_archive", weight: 3 },
        { item: "withered_orchard", weight: 3 },
        { item: "mixed_service", weight: 1 },
      ] as const,
    );
  const fillArgs = {
    context: args.context,
    drawContext: args.drawContext,
    stage: args.stage,
    shapeId: args.shapeId,
  };

  switch (family) {
    case "scissor_saint":
      return scissorSaintCompoundFill(fillArgs);
    case "molting_archive":
      return moltingArchiveCompoundFill(fillArgs);
    case "withered_orchard":
      return witheredOrchardCompoundFill(fillArgs);
    case "mixed_service":
      return mixedServiceCompoundFill(fillArgs);
  }
}

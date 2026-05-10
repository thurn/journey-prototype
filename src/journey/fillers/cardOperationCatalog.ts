import type { CardContent } from "../../content/model.js";
import type { JourneyContext } from "../../quest/context.js";
import { shuffleDeterministic, type DrawContext } from "../../util/rng.js";
import {
  ALLOWED_TRANSFIGURATIONS,
  BATTLE_KEYWORDS,
  STANDARD_TRANSFIGURATIONS,
} from "../effects.js";
import type { JourneyStage } from "../manifest.js";
import {
  CARD_MODIFICATION_VALUE_CONSTANTS,
  TRANSFIGURATION_VALUE_CONSTANTS,
  valueStarterCleanup,
  valueStarterReplacement,
} from "../value.js";
import {
  cardQualityValue,
  selectContentBackedCard,
  starterDeckCardCount,
  starterReplacementProfile,
  starterReplacementResultPredicate,
} from "./namedCardPayloads.js";
import type { OperationCompatibilityTrait } from "./operationCompatibility.js";
import { BATTLE_WINDOW_DURATION, chosenCardText } from "./shared.js";

export type CardOperationTopology =
  | "one_target_many_operations"
  | "mirrored_operations"
  | "one_operation_many_targets";

export type CardOperationTargetClass =
  | "draft_card"
  | "deck_card"
  | "starter_card";

export type CardOperationTargetMode =
  | "chosen"
  | "exact_named"
  | "random_predicate"
  | "all_matching"
  | "drafted_card";

export type CardOperationValueBand = "standard" | "premium" | "temporary";

export type CardOperationTiming = "immediate" | "battle_window";

export type CardOperationFamily =
  | "transfiguration"
  | "purge"
  | "replacement"
  | "transform"
  | "duplicate"
  | "merge_split"
  | "keyword"
  | "cost"
  | "type"
  | "subtype"
  | "text"
  | "target_restriction"
  | "opening_hand"
  | "materialized_ability"
  | "timing";

export type MaterializedCardOperation = {
  key: string;
  family: CardOperationFamily;
  targetModes: readonly CardOperationTargetMode[];
  valueBand: CardOperationValueBand;
  timing: CardOperationTiming;
  renderText: (targetText: string) => string;
  effect: Record<string, unknown>;
  value: number;
  uncertainty?: number;
};

type CardOperationMaterializerArgs = {
  context?: JourneyContext;
  drawContext: DrawContext;
  label: string;
  stage: JourneyStage;
  entry: CardOperationCatalogEntry;
};

type CardOperationCatalogEntry = MaterializedCardOperation & {
  topologies: readonly CardOperationTopology[]; // deprecated; remove in Task 3.4
  compatibilityTraits?: readonly OperationCompatibilityTrait[];
  targetClasses: readonly CardOperationTargetClass[];
  contextFree?: boolean;
  materialize?: (
    args: CardOperationMaterializerArgs,
  ) => MaterializedCardOperation | undefined;
};

type CardOperationRequest = {
  topology: CardOperationTopology;
  targetClasses: readonly CardOperationTargetClass[];
  targetModes?: readonly CardOperationTargetMode[];
  valueBands?: readonly CardOperationValueBand[];
  timings?: readonly CardOperationTiming[];
  families?: readonly CardOperationFamily[];
  context?: JourneyContext;
  stage?: JourneyStage;
  label: string;
  count: number;
};

type StarterTransfigurationMode = "random" | "chosen";

type BattleWindowProfile = {
  label: string;
  count: number;
};

const ALL_TARGET_CLASSES = [
  "draft_card",
  "deck_card",
  "starter_card",
] as const satisfies readonly CardOperationTargetClass[];

const DECK_TARGET_CLASSES = [
  "deck_card",
  "starter_card",
] as const satisfies readonly CardOperationTargetClass[];

const ALL_NORMAL_TOPOLOGIES = [
  "one_target_many_operations",
  "mirrored_operations",
  "one_operation_many_targets",
] as const satisfies readonly CardOperationTopology[];

const CHOSEN_OR_NAMED = [
  "chosen",
  "exact_named",
] as const satisfies readonly CardOperationTargetMode[];

const VISIBLE_TARGET_MODES = [
  "chosen",
  "exact_named",
  "drafted_card",
] as const satisfies readonly CardOperationTargetMode[];

const ALL_TARGET_MODES = [
  "chosen",
  "exact_named",
  "random_predicate",
  "all_matching",
  "drafted_card",
] as const satisfies readonly CardOperationTargetMode[];

const STARTER_TRANSFIGURATION_TARGET_COUNTS = {
  random: {
    early: [1, 2],
    mid: [2, 3],
    late: [2, 3],
  },
  chosen: {
    early: [1, 2],
    mid: [1, 2],
    late: [2],
  },
} as const satisfies Record<
  StarterTransfigurationMode,
  Record<JourneyStage, readonly number[]>
>;

const CARD_OPERATION_BATTLE_WINDOW_PROFILES: Record<
  JourneyStage,
  readonly BattleWindowProfile[]
> = {
  early: [
    { label: "next battle", count: 1 },
    { label: "next 2 battles", count: 2 },
  ],
  mid: [
    { label: "next 2 battles", count: 2 },
    { label: BATTLE_WINDOW_DURATION, count: 3 },
  ],
  late: [
    { label: "next 2 battles", count: 2 },
    { label: BATTLE_WINDOW_DURATION, count: 3 },
    { label: "next 4 battles", count: 4 },
  ],
};

function withCompatibility(
  effect: Record<string, unknown>,
  targetModes: readonly CardOperationTargetMode[],
  family: CardOperationFamily,
): Record<string, unknown> {
  return {
    ...effect,
    cardOperationFamily: family,
    cardOperationTargetModes: [...targetModes],
  };
}

function baseEntry(
  entry: Omit<CardOperationCatalogEntry, "targetModes" | "effect"> & {
    targetModes?: readonly CardOperationTargetMode[];
    effect: Record<string, unknown>;
  },
): CardOperationCatalogEntry {
  const targetModes = entry.targetModes ?? ALL_TARGET_MODES;

  return {
    ...entry,
    targetModes,
    effect: withCompatibility(entry.effect, targetModes, entry.family),
  };
}

function requireContext(args: CardOperationMaterializerArgs): JourneyContext {
  if (!args.context) {
    throw new Error(`Card operation ${args.entry.key} requires Journey context`);
  }

  return args.context;
}

function battleWindowProfile(args: CardOperationMaterializerArgs): BattleWindowProfile {
  return shuffleDeterministic(
    args.drawContext,
    `${args.label}:${args.entry.key}:battle-window`,
    CARD_OPERATION_BATTLE_WINDOW_PROFILES[args.stage],
  )[0]!;
}

function materializeBattleWindowOperation(
  args: CardOperationMaterializerArgs,
  renderText: (targetText: string, profile: BattleWindowProfile) => string,
): MaterializedCardOperation {
  const profile = battleWindowProfile(args);

  return {
    ...args.entry,
    key: `${args.entry.key}:${profile.count}-battles`,
    renderText: (targetText) => renderText(targetText, profile),
    effect: withCompatibility(
      {
        ...args.entry.effect,
        duration: profile.label,
        durationCount: profile.count,
      },
      args.entry.targetModes,
      args.entry.family,
    ),
    value: args.entry.value,
  };
}

function transfigurationValue(transfigurationName: string): number {
  return transfigurationName in TRANSFIGURATION_VALUE_CONSTANTS.standardByType
    ? TRANSFIGURATION_VALUE_CONSTANTS.standardByType[
        transfigurationName as keyof typeof TRANSFIGURATION_VALUE_CONSTANTS.standardByType
      ]
    : TRANSFIGURATION_VALUE_CONSTANTS.genericChosen;
}

function transfigurationEntry(
  transfigurationName: string,
): CardOperationCatalogEntry {
  return baseEntry({
    key: `transfigure-${transfigurationName.toLowerCase()}`,
    family: "transfiguration",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) =>
      `Apply {${transfigurationName} Transfiguration} to ${targetText}.`,
    effect: { kind: "card_transfigure", transfigurationName },
    value: transfigurationValue(transfigurationName),
  });
}

function resultCardForOperation(
  args: CardOperationMaterializerArgs,
): CardContent | undefined {
  const context = requireContext(args);

  return selectContentBackedCard({
    context,
    drawContext: args.drawContext,
    label: `${args.label}:${args.entry.key}:result`,
    stage: args.stage,
    sources: ["draftPool", "catalog"],
  })?.card;
}

function namedResultOperation(
  entry: CardOperationCatalogEntry,
  args: CardOperationMaterializerArgs,
  kind: "card_replace" | "card_transform" | "starter_replacement",
  verb: "Replace" | "Transform",
): MaterializedCardOperation | undefined {
  const result = resultCardForOperation(args);

  if (!result) {
    return undefined;
  }

  const context = requireContext(args);
  const value = Math.max(entry.value, cardQualityValue(result) + 45);

  return {
    ...entry,
    key: `${entry.key}:${result.id}`,
    renderText: (targetText) => `${verb} ${targetText} with {${result.name}}.`,
    effect: withCompatibility(
      {
        kind,
        cardOperationKind: kind.replace(/^card_/u, ""),
        source: "catalog",
        sourcePoolSize: context.content.cards.length,
        timing: "immediate",
        resultCardId: result.id,
        resultCardName: result.name,
        resultSelection: "exact_named",
        resultTargetOrigin: "catalog_reward",
      },
      entry.targetModes,
      entry.family,
    ),
    value,
  };
}

function starterTargetCountEffect(
  args: CardOperationMaterializerArgs,
  effect: Record<string, unknown>,
): Record<string, unknown> {
  const context = requireContext(args);

  return {
    ...effect,
    source: "deck",
    sourcePoolSize: context.state.quest.deck.summary.uniqueCards,
    starterTarget: true,
    starterTargetCount: starterDeckCardCount(context),
    predicate: { source: "deck", starter: true },
  };
}

function namedStarterReplacementOperation(
  entry: CardOperationCatalogEntry,
  args: CardOperationMaterializerArgs,
): MaterializedCardOperation | undefined {
  const context = requireContext(args);
  const replacementProfile = starterReplacementProfile({
    context,
    drawContext: args.drawContext,
    label: `${args.label}:${args.entry.key}`,
    stage: args.stage,
    sources: ["catalog"],
  });

  if (!replacementProfile) {
    return undefined;
  }

  const result = selectContentBackedCard({
    context,
    drawContext: args.drawContext,
    label: `${args.label}:${args.entry.key}:starter-result`,
    stage: args.stage,
    sources: [replacementProfile.profile.source],
    predicate: replacementProfile.profile.predicate,
  })?.card;

  if (!result) {
    return undefined;
  }

  return {
    ...entry,
    key: `${entry.key}:${result.id}`,
    renderText: (targetText) => `Replace ${targetText} with {${result.name}}.`,
    effect: withCompatibility(
      starterTargetCountEffect(args, {
        kind: "starter_replacement",
        replacementMode: "named",
        resultCardId: result.id,
        resultCardName: result.name,
        resultSelection: "exact_named",
        resultTargetOrigin: "catalog_reward",
      }),
      entry.targetModes,
      entry.family,
    ),
    value: valueStarterReplacement({
      count: 1,
      resultValue: cardQualityValue(result),
      stage: args.stage,
    }),
  };
}

function starterTransfigurationOperation(
  args: CardOperationMaterializerArgs,
  mode: StarterTransfigurationMode,
): MaterializedCardOperation | undefined {
  const context = requireContext(args);
  const starterCount = starterDeckCardCount(context);
  const targetCounts = STARTER_TRANSFIGURATION_TARGET_COUNTS[mode][args.stage]
    .filter((count) => count <= starterCount);

  if (targetCounts.length === 0) {
    return undefined;
  }

  const targetCount = shuffleDeterministic(
    args.drawContext,
    `${args.label}:${args.entry.key}:target-count`,
    targetCounts,
  )[0]!;
  const transfigurationName = shuffleDeterministic(
    args.drawContext,
    `${args.label}:${args.entry.key}:transfiguration`,
    ALLOWED_TRANSFIGURATIONS,
  )[0]!;
  const random = mode === "random";
  const selection = random ? "hidden_random" : "chosen_after_commitment";
  const starterText = targetCount === 1 ? "Starter card" : "Starter cards";
  const targetText = `${targetCount} ${random ? "random" : "chosen"} ${starterText}`;

  return {
    ...args.entry,
    key: `${args.entry.key}:${transfigurationName.toLowerCase()}:${targetCount}`,
    renderText: () =>
      `Apply {${transfigurationName} Transfiguration} to ${targetText}.`,
    effect: withCompatibility(
      starterTargetCountEffect(args, {
        ...args.entry.effect,
        transfigurationName,
        selection,
        minRequiredTargets: targetCount,
        targetCount,
      }),
      args.entry.targetModes,
      args.entry.family,
    ),
    value:
      valueStarterCleanup({ count: targetCount, random, stage: args.stage }) +
      Math.round(transfigurationValue(transfigurationName) * 0.25),
  };
}

export const CARD_OPERATION_CATALOG: readonly CardOperationCatalogEntry[] = [
  ...STANDARD_TRANSFIGURATIONS.map(transfigurationEntry),
  transfigurationEntry("Ivory"),
  {
    ...baseEntry({
      key: "chosen-purge",
      family: "purge",
      valueBand: "standard",
      timing: "immediate",
      topologies: ALL_NORMAL_TOPOLOGIES,
      compatibilityTraits: ["needs_named_target", "produces_deck_mutation"],
      targetClasses: DECK_TARGET_CLASSES,
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) => `Purge ${targetText} from your deck.`,
      effect: { kind: "card_purge", purgeMode: "chosen" },
      value: 90,
    }),
  },
  baseEntry({
    key: "random-purge",
    family: "purge",
    valueBand: "standard",
    timing: "immediate",
    topologies: ["one_target_many_operations", "mirrored_operations"],
    targetClasses: ["deck_card"],
    targetModes: ["random_predicate"],
    renderText: () => "Purge a random card in your deck.",
    effect: {
      kind: "card_purge",
      purgeMode: "random",
      selection: "hidden_random",
      predicate: { source: "deck" },
    },
    value: 65,
    uncertainty: -10,
  }),
  baseEntry({
    key: "all-duplicate-purge",
    family: "purge",
    valueBand: "premium",
    timing: "immediate",
    topologies: ["one_target_many_operations", "mirrored_operations"],
    targetClasses: ["deck_card"],
    targetModes: ["all_matching"],
    renderText: () => "Purge all duplicate copies in your deck.",
    effect: {
      kind: "card_purge",
      purgeMode: "all_duplicates",
      selection: "predicate",
      predicate: { source: "deck", minCopies: 2 },
    },
    value: 125,
  }),
  {
    ...baseEntry({
      key: "starter-replacement-draft",
      family: "replacement",
      valueBand: "standard",
      timing: "immediate",
      topologies: ALL_NORMAL_TOPOLOGIES,
      targetClasses: ["starter_card"],
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) =>
        `Replace ${targetText} with a drafted replacement card.`,
      effect: {
        kind: "starter_replacement",
        replacementMode: "draft",
        takeCount: 1,
        choiceCount: 4,
      },
      value: 120,
    }),
    materialize: (args) => {
      const context = requireContext(args);
      const replacementProfile = starterReplacementProfile({
        context,
        drawContext: args.drawContext,
        label: `${args.label}:${args.entry.key}`,
        stage: args.stage,
        sources: ["draftPool"],
        minCandidates: 4,
      });

      if (!replacementProfile) {
        return undefined;
      }

      return {
        ...args.entry,
        renderText: (targetText) =>
          `Replace ${targetText} with 1 of 4 ${replacementProfile.profile.description}.`,
        effect: withCompatibility(
          starterTargetCountEffect(args, {
            ...args.entry.effect,
            resultPredicate: starterReplacementResultPredicate(
              replacementProfile.profile,
            ),
            resultPoolSize: replacementProfile.candidates.length,
          }),
          args.entry.targetModes,
          args.entry.family,
        ),
      };
    },
  },
  {
    ...baseEntry({
      key: "starter-replacement-named",
      family: "replacement",
      valueBand: "premium",
      timing: "immediate",
      topologies: ALL_NORMAL_TOPOLOGIES,
      targetClasses: ["starter_card"],
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) => `Replace ${targetText} with a named catalog card.`,
      effect: {
        kind: "starter_replacement",
        replacementMode: "named",
      },
      value: 145,
    }),
    materialize: (args) => namedStarterReplacementOperation(args.entry, args),
  },
  {
    ...baseEntry({
      key: "starter-replacement-all",
      family: "replacement",
      valueBand: "premium",
      timing: "immediate",
      topologies: ["one_target_many_operations", "mirrored_operations"],
      targetClasses: ["starter_card"],
      targetModes: ["all_matching"],
      renderText: () =>
        "Purge all Starter cards and replace them with catalog replacement cards.",
      effect: {
        kind: "starter_replacement",
        replacementMode: "all",
        selection: "predicate",
        resultSelection: "hidden_random",
      },
      value: 170,
      uncertainty: -10,
    }),
    materialize: (args) => {
      const context = requireContext(args);
      const starterCount = starterDeckCardCount(context);
      const replacementProfile = starterReplacementProfile({
        context,
        drawContext: args.drawContext,
        label: `${args.label}:${args.entry.key}`,
        stage: args.stage,
        sources: ["catalog"],
        minCandidates: starterCount,
      });

      if (starterCount === 0 || !replacementProfile) {
        return undefined;
      }

      return {
        ...args.entry,
        renderText: () =>
          `Purge all Starter cards and replace them with ${replacementProfile.profile.description}.`,
        effect: withCompatibility(
          starterTargetCountEffect(args, {
            ...args.entry.effect,
            count: starterCount,
            targetCount: starterCount,
            resultPredicate: starterReplacementResultPredicate(
              replacementProfile.profile,
            ),
            resultPoolSize: replacementProfile.candidates.length,
          }),
          args.entry.targetModes,
          args.entry.family,
        ),
        value: valueStarterReplacement({
          count: starterCount,
          resultValue: 45,
          stage: args.stage,
          all: true,
        }),
      };
    },
  },
  {
    ...baseEntry({
      key: "starter-replacement-random",
      family: "replacement",
      valueBand: "standard",
      timing: "immediate",
      topologies: ["one_target_many_operations", "mirrored_operations"],
      targetClasses: ["starter_card"],
      targetModes: ["random_predicate"],
      renderText: () =>
        "Purge a random Starter card and gain a random catalog replacement.",
      effect: {
        kind: "starter_replacement",
        replacementMode: "random",
        count: 1,
        targetCount: 1,
        selection: "hidden_random",
        resultSelection: "hidden_random",
      },
      value: valueStarterReplacement({ count: 1, resultValue: 55 }),
      uncertainty: -10,
    }),
    materialize: (args) => {
      const context = requireContext(args);
      const replacementProfile = starterReplacementProfile({
        context,
        drawContext: args.drawContext,
        label: `${args.label}:${args.entry.key}`,
        stage: args.stage,
        sources: ["catalog"],
      });

      if (starterDeckCardCount(context) === 0 || !replacementProfile) {
        return undefined;
      }

      return {
        ...args.entry,
        renderText: () =>
          `Purge a random Starter card and gain a random ${replacementProfile.profile.resultText}.`,
        effect: withCompatibility(
          starterTargetCountEffect(args, {
            ...args.entry.effect,
            resultPredicate: starterReplacementResultPredicate(
              replacementProfile.profile,
            ),
            resultPoolSize: replacementProfile.candidates.length,
          }),
          args.entry.targetModes,
          args.entry.family,
        ),
      };
    },
  },
  {
    ...baseEntry({
      key: "random-starter-purge",
      family: "purge",
      valueBand: "standard",
      timing: "immediate",
      topologies: ["one_target_many_operations", "mirrored_operations"],
      targetClasses: ["starter_card"],
      targetModes: ["random_predicate"],
      renderText: () => "Purge a random Starter card.",
      effect: {
        kind: "starter_cleanup",
        cleanupMode: "random",
        count: 1,
        selection: "hidden_random",
      },
      value: valueStarterCleanup({ count: 1, random: true }),
      uncertainty: -10,
    }),
    materialize: (args) => ({
      ...args.entry,
      effect: withCompatibility(
        starterTargetCountEffect(args, args.entry.effect),
        args.entry.targetModes,
        args.entry.family,
      ),
    }),
  },
  {
    ...baseEntry({
      key: "all-starter-purge",
      family: "purge",
      valueBand: "premium",
      timing: "immediate",
      topologies: ["one_target_many_operations", "mirrored_operations"],
      targetClasses: ["starter_card"],
      targetModes: ["all_matching"],
      renderText: () => "Purge all Starter cards.",
      effect: {
        kind: "starter_cleanup",
        cleanupMode: "all",
        selection: "predicate",
      },
      value: 180,
    }),
    materialize: (args) => {
      const context = requireContext(args);
      const starterCount = starterDeckCardCount(context);

      if (starterCount === 0) {
        return undefined;
      }

      return {
        ...args.entry,
        effect: withCompatibility(
          starterTargetCountEffect(args, {
            ...args.entry.effect,
            count: starterCount,
            targetCount: starterCount,
          }),
          args.entry.targetModes,
          args.entry.family,
        ),
        value: valueStarterCleanup({
          count: starterCount,
          stage: args.stage,
          all: true,
        }),
      };
    },
  },
  {
    ...baseEntry({
      key: "named-card-replacement",
      family: "replacement",
      valueBand: "premium",
      timing: "immediate",
      topologies: ALL_NORMAL_TOPOLOGIES,
      targetClasses: DECK_TARGET_CLASSES,
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) => `Replace ${targetText} with a named card.`,
      effect: {
        kind: "card_replace",
        replacementMode: "named",
      },
      value: 135,
    }),
    materialize: (args) =>
      namedResultOperation(args.entry, args, "card_replace", "Replace"),
  },
  baseEntry({
    key: "transform-to-random-card",
    family: "transform",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: DECK_TARGET_CLASSES,
    targetModes: CHOSEN_OR_NAMED,
    renderText: (targetText) => `Transform ${targetText} into a random card.`,
    effect: {
      kind: "card_transform",
      resultSelection: "hidden_random",
      resultPredicate: { source: "catalog" },
    },
    value: 100,
    uncertainty: -10,
  }),
  {
    ...baseEntry({
      key: "transform-to-named-card",
      family: "transform",
      valueBand: "premium",
      timing: "immediate",
      topologies: ALL_NORMAL_TOPOLOGIES,
      targetClasses: DECK_TARGET_CLASSES,
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) => `Transform ${targetText} into a named card.`,
      effect: {
        kind: "card_transform",
        resultSelection: "exact_named",
      },
      value: 140,
    }),
    materialize: (args) =>
      namedResultOperation(args.entry, args, "card_transform", "Transform"),
  },
  baseEntry({
    key: "duplicate-count-two",
    family: "duplicate",
    valueBand: "premium",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Add 2 copies of ${targetText} to your deck.`,
    effect: { kind: "card_duplicate", copyCount: 2 },
    value: CARD_MODIFICATION_VALUE_CONSTANTS.duplicateChosen,
  }),
  baseEntry({
    key: "batch-duplicate",
    family: "duplicate",
    valueBand: "premium",
    timing: "immediate",
    topologies: ["one_target_many_operations", "mirrored_operations"],
    targetClasses: ["deck_card"],
    targetModes: ["all_matching"],
    renderText: () => "Duplicate each non-Starter card with exactly 1 copy.",
    effect: {
      kind: "card_duplicate",
      duplicateMode: "batch",
      copyCount: 1,
      selection: "predicate",
      predicate: { source: "deck", maxCopies: 1, starter: false },
    },
    value: 135,
  }),
  baseEntry({
    key: "merge",
    family: "merge_split",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: DECK_TARGET_CLASSES,
    targetModes: CHOSEN_OR_NAMED,
    renderText: (targetText) =>
      `Merge ${targetText} with another card in your deck.`,
    effect: { kind: "card_merge", mergeMode: "with_eligible_deck_card" },
    value: CARD_MODIFICATION_VALUE_CONSTANTS.mergeOrSplitExistingCards,
  }),
  baseEntry({
    key: "split",
    family: "merge_split",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: DECK_TARGET_CLASSES,
    targetModes: CHOSEN_OR_NAMED,
    renderText: (targetText) => `Split ${targetText} into two focused cards.`,
    effect: { kind: "card_split", splitMode: "focused_cards" },
    value: CARD_MODIFICATION_VALUE_CONSTANTS.mergeOrSplitExistingCards,
  }),
  baseEntry({
    key: "add-fast",
    family: "keyword",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Add Fast to ${targetText}.`,
    effect: { kind: "card_keyword_add", keyword: "Fast" },
    value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
  }),
  baseEntry({
    key: "add-reclaim",
    family: "keyword",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Add Reclaim 1 to ${targetText}.`,
    effect: { kind: "card_keyword_add", keyword: "Reclaim", amount: 1 },
    value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
  }),
  baseEntry({
    key: "remove-dissolve",
    family: "keyword",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Remove Dissolve from ${targetText}.`,
    effect: { kind: "card_keyword_remove", keyword: "Dissolve" },
    value: 85,
  }),
  baseEntry({
    key: "event-keyword-rewrite",
    family: "keyword",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Rewrite ${targetText} to use Echo.`,
    effect: {
      kind: "card_keyword_add",
      keyword: "Echo",
      rewriteMode: "event_keyword_rewrite",
    },
    value: 90,
  }),
  baseEntry({
    key: "reduce-cost",
    family: "cost",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Reduce the cost of ${targetText} by 1.`,
    effect: { kind: "card_rewrite", field: "energy_cost", amount: -1 },
    value: CARD_MODIFICATION_VALUE_CONSTANTS.lowerCostOrAddFastOrReclaim,
  }),
  baseEntry({
    key: "change-type-event",
    family: "type",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Make ${targetText} an Event card.`,
    effect: { kind: "card_type_change", newCardType: "Event" },
    value: 95,
  }),
  baseEntry({
    key: "change-subtype-sigil",
    family: "subtype",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Change ${targetText} to the Sigil subtype.`,
    effect: { kind: "card_type_change", newSubtype: "Sigil" },
    value: 90,
  }),
  baseEntry({
    key: "add-foresee",
    family: "text",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Add "Foresee 1" to ${targetText}.`,
    effect: {
      kind: "card_text_modification",
      textModification: "Add Foresee 1",
    },
    value: 95,
  }),
  baseEntry({
    key: "ink-reassignment-text",
    family: "text",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Rewrite the ink clause on ${targetText}.`,
    effect: {
      kind: "card_text_modification",
      textModification: "Rewrite ink assignment text",
      rewriteMode: "ink_reassignment",
    },
    value: 95,
  }),
  baseEntry({
    key: "remove-target-restriction",
    family: "target_restriction",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Remove a target restriction from ${targetText}.`,
    effect: {
      kind: "card_text_modification",
      textModification: "Remove target restriction",
      removeTargetRestriction: true,
    },
    value: 90,
  }),
  baseEntry({
    key: "remove-transfiguration",
    family: "transfiguration",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) => `Remove a Transfiguration from ${targetText}.`,
    effect: {
      kind: "card_transfigure",
      transfigurationOperation: "remove",
    },
    value: 75,
  }),
  {
    ...baseEntry({
      key: "opening-hand-window",
      family: "opening_hand",
      valueBand: "temporary",
      timing: "battle_window",
      topologies: ["one_operation_many_targets"],
      targetClasses: ["deck_card", "starter_card"],
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) =>
        `${targetText} appears in your opening hand for the next 3 battles.`,
      effect: { kind: "card_opening_hand", duration: BATTLE_WINDOW_DURATION },
      value: 105,
      uncertainty: -10,
    }),
    contextFree: true,
    materialize: (args) =>
      materializeBattleWindowOperation(
        args,
        (targetText, profile) =>
          `${targetText} appears in your opening hand for the ${profile.label}.`,
      ),
  },
  {
    ...baseEntry({
      key: "temporary-copy-window",
      family: "duplicate",
      valueBand: "temporary",
      timing: "battle_window",
      topologies: ["one_operation_many_targets"],
      targetClasses: ["deck_card", "starter_card"],
      targetModes: CHOSEN_OR_NAMED,
      renderText: (targetText) =>
        `Create a temporary copy of ${targetText} for the next 3 battles.`,
      effect: {
        kind: "card_temporary_copy",
        duration: BATTLE_WINDOW_DURATION,
        copyCount: 1,
        temporary: true,
      },
      value: 110,
      uncertainty: -10,
    }),
    contextFree: true,
    materialize: (args) =>
      materializeBattleWindowOperation(
        args,
        (targetText, profile) =>
          `Create a temporary copy of ${targetText} for the ${profile.label}.`,
      ),
  },
  {
    ...baseEntry({
      key: "reduce-cost-window",
      family: "timing",
      valueBand: "temporary",
      timing: "battle_window",
      topologies: ["one_target_many_operations"],
      targetClasses: ALL_TARGET_CLASSES,
      targetModes: VISIBLE_TARGET_MODES,
      renderText: (targetText) =>
        `Reduce the cost of ${targetText} by 1 for the next 3 battles.`,
      effect: {
        kind: "card_rewrite",
        field: "energy_cost",
        amount: -1,
        duration: BATTLE_WINDOW_DURATION,
      },
      value: 105,
      uncertainty: -10,
    }),
    contextFree: true,
    materialize: (args) =>
      materializeBattleWindowOperation(
        args,
        (targetText, profile) =>
          `Reduce the cost of ${targetText} by 1 for the ${profile.label}.`,
      ),
  },
  baseEntry({
    key: "materialized-ability-conversion",
    family: "materialized_ability",
    valueBand: "standard",
    timing: "immediate",
    topologies: ALL_NORMAL_TOPOLOGIES,
    targetClasses: ALL_TARGET_CLASSES,
    targetModes: VISIBLE_TARGET_MODES,
    renderText: (targetText) =>
      `Convert a Materialize ability on ${targetText} into permanent text.`,
    effect: {
      kind: "card_text_modification",
      textModification: "Convert Materialize ability into permanent text",
      materializedAbilityConversion: true,
    },
    value: 105,
  }),
  baseEntry({
    key: "all-card-transfiguration",
    family: "transfiguration",
    valueBand: "premium",
    timing: "immediate",
    topologies: ["one_target_many_operations", "mirrored_operations"],
    targetClasses: ["deck_card"],
    targetModes: ["all_matching"],
    renderText: () =>
      "Apply {Silver Transfiguration} to every card in your deck.",
    effect: {
      kind: "card_transfigure",
      transfigurationName: "Silver",
      selection: "predicate",
      predicate: { source: "deck" },
      transfigurationScope: "all_cards",
    },
    value: 155,
  }),
  baseEntry({
    key: "all-event-transfiguration",
    family: "transfiguration",
    valueBand: "premium",
    timing: "immediate",
    topologies: ["one_target_many_operations", "mirrored_operations"],
    targetClasses: ["deck_card"],
    targetModes: ["all_matching"],
    renderText: () =>
      "Apply {Umbral Transfiguration} to every Event in your deck.",
    effect: {
      kind: "card_transfigure",
      transfigurationName: "Umbral",
      selection: "predicate",
      predicate: { source: "deck", cardType: "Event" },
      transfigurationScope: "all_events",
    },
    value: 145,
  }),
  baseEntry({
    key: "random-predicate-transfiguration",
    family: "transfiguration",
    valueBand: "standard",
    timing: "immediate",
    topologies: ["one_target_many_operations", "mirrored_operations"],
    targetClasses: ["deck_card"],
    targetModes: ["random_predicate"],
    renderText: () =>
      "Apply {Glass Transfiguration} to a random Event in your deck.",
    effect: {
      kind: "card_transfigure",
      transfigurationName: "Glass",
      selection: "hidden_random",
      predicate: { source: "deck", cardType: "Event" },
      transfigurationScope: "random_predicate",
    },
    value: TRANSFIGURATION_VALUE_CONSTANTS.random,
    uncertainty: -10,
  }),
  {
    ...baseEntry({
      key: "random-starter-transfiguration",
      family: "transfiguration",
      valueBand: "standard",
      timing: "immediate",
      topologies: ["one_target_many_operations", "mirrored_operations"],
      targetClasses: ["starter_card"],
      targetModes: ["random_predicate"],
      renderText: () =>
        "Apply a generated Transfiguration to random Starter cards.",
      effect: {
        kind: "card_transfigure",
        transfigurationName: "generated",
        selection: "hidden_random",
        transfigurationScope: "random_starters",
        minRequiredTargets: 1,
        targetCount: 1,
      },
      value: valueStarterCleanup({ count: 3, random: true }) + 30,
      uncertainty: -10,
    }),
    materialize: (args) => {
      return starterTransfigurationOperation(args, "random");
    },
  },
  {
    ...baseEntry({
      key: "two-chosen-starter-transfiguration",
      family: "transfiguration",
      valueBand: "standard",
      timing: "immediate",
      topologies: ALL_NORMAL_TOPOLOGIES,
      targetClasses: ["starter_card"],
      targetModes: ["chosen"],
      renderText: () =>
        "Apply a generated Transfiguration to chosen Starter cards.",
      effect: {
        kind: "card_transfigure",
        transfigurationName: "generated",
        selection: "chosen_after_commitment",
        transfigurationScope: "two_chosen_starters",
        minRequiredTargets: 1,
        targetCount: 1,
      },
      value: valueStarterCleanup({ count: 2 }) + 25,
    }),
    materialize: (args) => {
      return starterTransfigurationOperation(args, "chosen");
    },
  },
];

function includesAll<T>(
  available: readonly T[],
  requested: readonly T[],
): boolean {
  return requested.every((entry) => available.includes(entry));
}

function matchesRequest(
  entry: CardOperationCatalogEntry,
  request: CardOperationRequest,
): boolean {
  return (
    entry.topologies.includes(request.topology) &&
    includesAll(entry.targetClasses, request.targetClasses) &&
    (!request.targetModes || includesAll(entry.targetModes, request.targetModes)) &&
    (!request.valueBands || request.valueBands.includes(entry.valueBand)) &&
    (!request.timings || request.timings.includes(entry.timing)) &&
    (!request.families || request.families.includes(entry.family))
  );
}

function materializeOperation(
  entry: CardOperationCatalogEntry,
  drawContext: DrawContext,
  request: CardOperationRequest,
): MaterializedCardOperation | undefined {
  if (!entry.materialize) {
    const {
      topologies: _topologies,
      targetClasses: _targetClasses,
      contextFree: _contextFree,
      materialize: _materialize,
      ...operation
    } = entry;

    return operation;
  }

  if (entry.contextFree !== true && !request.context) {
    return undefined;
  }

  return entry.materialize({
    context: request.context,
    drawContext,
    label: request.label,
    stage: request.stage ?? "mid",
    entry,
  });
}

export function compatibleCardOperations(
  drawContext: DrawContext,
  request: CardOperationRequest,
): MaterializedCardOperation[] {
  const candidates = CARD_OPERATION_CATALOG.filter((entry) =>
    matchesRequest(entry, request),
  ).flatMap((entry) => {
    const materialized = materializeOperation(entry, drawContext, request);

    return materialized ? [materialized] : [];
  });

  if (candidates.length < request.count) {
    throw new Error(
      `Card operation catalog has ${candidates.length} compatible entries for ${request.topology}; ${request.count} required`,
    );
  }

  return shuffleDeterministic(drawContext, request.label, candidates)
    .slice(0, request.count)
    .map(({ effect, targetModes, family, ...operation }) => ({
      ...operation,
      family,
      targetModes,
      effect: withCompatibility(effect, targetModes, family),
    }));
}

export function cardOperationTargetModeForClass(
  targetClass: CardOperationTargetClass,
): CardOperationTargetMode {
  return targetClass === "draft_card" ? "drafted_card" : "chosen";
}

export function renderChosenCardOperationText(
  operation: MaterializedCardOperation,
): string {
  return operation.renderText(chosenCardText());
}

export const CARD_OPERATION_DEBUG_CATALOG = Object.freeze({
  operations: Object.freeze(
    CARD_OPERATION_CATALOG.map((entry) => Object.freeze({
      key: entry.key,
      family: entry.family,
      targetClasses: Object.freeze([...entry.targetClasses]),
      targetModes: Object.freeze([...entry.targetModes]),
      effect: Object.freeze({ ...entry.effect }),
    })),
  ),
  families: Object.freeze([
    ...new Set(CARD_OPERATION_CATALOG.map((entry) => entry.family)),
  ]),
  targetModes: Object.freeze(ALL_TARGET_MODES),
  standardTransfigurations: STANDARD_TRANSFIGURATIONS,
  allowedTransfigurations: ALLOWED_TRANSFIGURATIONS,
  battleKeywords: BATTLE_KEYWORDS,
});

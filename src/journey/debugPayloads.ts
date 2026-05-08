import type { JourneyStage } from "./manifest.js";
import { JOURNEY_SHAPES, type JourneyShapeId } from "./shapes.js";

export type DebugPayloadAvailability = "available" | "unimplemented";

export type DebugPayloadVariant = {
  id: string;
  qaId: string;
  availability: DebugPayloadAvailability;
  description: string;
  supportedShapes: readonly JourneyShapeId[] | "all";
  supportedStages: readonly JourneyStage[] | "all";
};

export type DebugPayloadFamily = {
  id: string;
  description: string;
  variants: readonly DebugPayloadVariant[];
};

export type DebugPayloadSelection = {
  familyId: string;
  variantId: string;
  qaId: string;
  description: string;
  supportedShapes: readonly JourneyShapeId[] | "all";
  supportedStages: readonly JourneyStage[] | "all";
};

const ALL_STAGES = ["early", "mid", "late"] as const satisfies readonly JourneyStage[];

const ALL_SHAPES = JOURNEY_SHAPES.map((shape) => shape.id);

function variant(
  familyId: string,
  id: string,
  availability: DebugPayloadAvailability,
  description: string,
  supportedShapes: readonly JourneyShapeId[] | "all" = "all",
  supportedStages: readonly JourneyStage[] | "all" = "all",
): DebugPayloadVariant {
  return {
    id,
    qaId: `${familyId}/${id}`,
    availability,
    description,
    supportedShapes,
    supportedStages,
  };
}

export const DEBUG_PAYLOAD_FAMILIES = Object.freeze([
  {
    id: "adapter",
    description: "Adapt the current shape filler output into typed semantic operations.",
    variants: [
      variant(
        "adapter",
        "current",
        "available",
        "Current production filler payloads passed through the semantic operation adapter.",
      ),
    ],
  },
  {
    id: "card",
    description: "Named card operations and starter-card cleanup payloads.",
    variants: [
      variant("card", "named-card-operation-menu", "available", "Deterministic named card operation menus backed by real card content.", ["service_menu"], ["mid", "late"]),
      variant("card", "starter-cleanup-replacement", "available", "Deterministic Starter-card cleanup and replacement scenes backed by the simulated starter deck.", ["curated_reward_trio"], ["early"]),
    ],
  },
  {
    id: "dreamsign",
    description: "Named Dreamsign shops, transformations, duplicates, and pool edits.",
    variants: [
      variant("dreamsign", "named-dreamsign-shop-row", "available", "Deterministic content-backed named Dreamsign purchase rows for renderer parity QA.", ["shop_row"], ["mid", "late"]),
      variant("dreamsign", "dreamsign-transform-duplicate-pool", "available", "Deterministic content-backed Dreamsign transform, duplicate, temporary, and pool-edit scenes.", ["curated_reward_trio"], ["mid", "late"]),
    ],
  },
  {
    id: "bane",
    description: "Bane gain, purge, and transform payloads.",
    variants: [
      variant("bane", "bane-gain-purge-transform", "available", "Deterministic Bane gain, purge, replacement, and Bane-to-card transform scenes.", ["service_menu"], ["mid", "late"]),
    ],
  },
  {
    id: "resource",
    description: "Resource edge cases for essence, omens, percentages, and caps.",
    variants: [
      variant("resource", "resource-edge-cases", "available", "Deterministic maximum, percentage, range, all-remaining, multi-omen, and cap resource scenes.", ["service_menu"], ["mid", "late"]),
    ],
  },
  {
    id: "route",
    description: "Route edit payloads.",
    variants: [
      variant("route", "route-edits", "available", "Deterministic add, remove, replace, purge, and probability route edits.", ["service_menu"], ["mid", "late"]),
    ],
  },
  {
    id: "shop",
    description: "Shop economy payloads.",
    variants: [
      variant("shop", "shop-economy", "available", "Deterministic shop price, inventory, purchase counter, and future-shop modifiers.", ["shop_row"], ["mid", "late"]),
    ],
  },
  {
    id: "dreamwell",
    description: "Dreamwell window payloads.",
    variants: [
      variant("dreamwell", "dreamwell-window", "available", "Deterministic Dreamwell first-draw, card, upgrade, delayed, and battle-window modifiers.", ["service_menu"], ["mid", "late"]),
    ],
  },
  {
    id: "status",
    description: "Quest status reward and replacement payloads.",
    variants: [
      variant("status", "status-reward-replacement", "available", "Deterministic one-time, temporary, persistent, prohibition, and replacement status rules.", ["service_menu"], ["late"]),
    ],
  },
  {
    id: "hook",
    description: "Delayed trigger hook payloads.",
    variants: [
      variant("hook", "delayed-trigger-matrix", "available", "Deterministic delayed hook trigger and reward matrices.", ["service_menu"], ["mid", "late"]),
    ],
  },
  {
    id: "return",
    description: "Paired return, seal, borrow, and trade payloads.",
    variants: [
      variant("return", "paired-return-seal-borrow-trade", "available", "Deterministic paired-return, seal, borrow, and future trade scenes.", ["paired_return"], ["mid", "late"]),
    ],
  },
  {
    id: "random",
    description: "Reveal, roll, and wager random envelope payloads.",
    variants: [
      variant("random", "reveal-roll-wager", "available", "Deterministic reveal envelopes, rolls, random ranges, visible pools, push choices, and wagers.", ["single_random_outcome", "single_wager", "random_pool_draws", "resolved_random_series"]),
    ],
  },
  {
    id: "generated_object",
    description: "Manifest-local generated object payloads.",
    variants: [
      variant("generated_object", "generated-card", "available", "Deterministic manifest-local generated card grant, transform, return, and trade scenes.", ["curated_reward_trio"], ["late"]),
      variant("generated_object", "generated-dreamsign", "available", "Deterministic manifest-local generated Dreamsign grant, temporary grant, return, and trade scenes.", ["curated_reward_trio"], ["late"]),
      variant("generated_object", "generated-status", "available", "Deterministic manifest-local generated status grant, temporary grant, return, and trade scenes.", ["curated_reward_trio"], ["mid", "late"]),
      variant("generated_object", "generated-transfiguration", "available", "Deterministic manifest-local generated transfiguration grant, transform, return, and trade scenes.", ["curated_reward_trio"], ["late"]),
    ],
  },
  {
    id: "decision_tree",
    description: "Complete decision-tree payloads.",
    variants: [
      variant(
        "decision_tree",
        "complete-decision-tree",
        "available",
        "Complete multi-level decision-tree motifs with visible stop, failure, odds, rewards, and precommitted tree metadata.",
        ["push_your_luck", "probability_ladder", "random_pool_draws", "prize_ladder", "escalating_reward_chain"],
        ["mid", "late"],
      ),
    ],
  },
] as const satisfies readonly DebugPayloadFamily[]);

function shapeConstraintText(supportedShapes: readonly JourneyShapeId[] | "all"): string {
  return supportedShapes === "all" ? "all canonical shapes" : supportedShapes.join(", ");
}

function stageConstraintText(supportedStages: readonly JourneyStage[] | "all"): string {
  return supportedStages === "all" ? ALL_STAGES.join(", ") : supportedStages.join(", ");
}

function findFamily(familyId: string): DebugPayloadFamily | undefined {
  return DEBUG_PAYLOAD_FAMILIES.find((family) => family.id === familyId);
}

function findVariant(
  family: DebugPayloadFamily,
  variantId: string,
): DebugPayloadVariant | undefined {
  return family.variants.find((variant) => variant.id === variantId);
}

function isShapeSupported(
  variant: Pick<DebugPayloadVariant, "supportedShapes">,
  shapeId: JourneyShapeId | string | undefined,
): boolean {
  return shapeId === undefined ||
    variant.supportedShapes === "all" ||
    variant.supportedShapes.includes(shapeId as JourneyShapeId);
}

function isStageSupported(
  variant: Pick<DebugPayloadVariant, "supportedStages">,
  stage: JourneyStage | undefined,
): boolean {
  return stage === undefined ||
    variant.supportedStages === "all" ||
    variant.supportedStages.includes(stage);
}

export function validateDebugPayloadCompatibility(args: {
  selection: DebugPayloadSelection;
  shapeId?: JourneyShapeId | string;
  stage?: JourneyStage;
}): void {
  if (!isShapeSupported(args.selection, args.shapeId)) {
    throw new Error(
      `Debug payload '${args.selection.qaId}' does not support shape '${args.shapeId}'. Supported shapes: ${shapeConstraintText(args.selection.supportedShapes)}.`,
    );
  }

  if (!isStageSupported(args.selection, args.stage)) {
    throw new Error(
      `Debug payload '${args.selection.qaId}' does not support stage '${args.stage}'. Supported stages: ${stageConstraintText(args.selection.supportedStages)}.`,
    );
  }
}

export function validateDebugPayloadSelection(args: {
  familyId?: string;
  variantId?: string;
  shapeId?: JourneyShapeId | string;
  stage?: JourneyStage;
}): DebugPayloadSelection | undefined {
  if (args.familyId === undefined && args.variantId === undefined) {
    return undefined;
  }

  if (args.familyId === undefined) {
    throw new Error(`Debug payload variant '${args.variantId}' requires --debug-payload-family`);
  }

  const family = findFamily(args.familyId);

  if (!family) {
    throw new Error(
      `Unknown debug payload family '${args.familyId}'. Known families: ${DEBUG_PAYLOAD_FAMILIES.map((entry) => entry.id).join(", ")}`,
    );
  }

  if (args.variantId === undefined) {
    throw new Error(
      `Debug payload family '${args.familyId}' requires --debug-payload-variant. Known variants: ${family.variants.map((entry) => entry.id).join(", ")}`,
    );
  }

  const selected = findVariant(family, args.variantId);

  if (!selected) {
    throw new Error(
      `Unknown debug payload variant '${args.variantId}' for family '${args.familyId}'. Known variants: ${family.variants.map((entry) => entry.id).join(", ")}`,
    );
  }

  if (selected.availability !== "available") {
    throw new Error(
      [
        `Debug payload '${selected.qaId}' is reserved but unimplemented.`,
        `Supported shapes: ${shapeConstraintText(selected.supportedShapes)}.`,
        `Supported stages: ${stageConstraintText(selected.supportedStages)}.`,
      ].join(" "),
    );
  }

  const selection = {
    familyId: family.id,
    variantId: selected.id,
    qaId: selected.qaId,
    description: selected.description,
    supportedShapes: selected.supportedShapes,
    supportedStages: selected.supportedStages,
  };

  validateDebugPayloadCompatibility({
    selection,
    shapeId: args.shapeId,
    stage: args.stage,
  });

  return selection;
}

export function debugPayloadListJson() {
  return {
    families: DEBUG_PAYLOAD_FAMILIES.map((family) => ({
      id: family.id,
      description: family.description,
      variants: family.variants.map((payloadVariant) => ({
        id: payloadVariant.id,
        qaId: payloadVariant.qaId,
        availability: payloadVariant.availability,
        description: payloadVariant.description,
        supportedShapes: payloadVariant.supportedShapes === "all" ? ALL_SHAPES : payloadVariant.supportedShapes,
        supportedStages: payloadVariant.supportedStages === "all" ? ALL_STAGES : payloadVariant.supportedStages,
      })),
    })),
  };
}

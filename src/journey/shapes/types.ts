import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
  JourneyRewardPool,
  JourneyStage,
  JourneySymmetryContractDebug,
  JourneyTree,
  PrecommittedOutcomes,
  ValidationCheckedPayload,
} from "../manifest.js";
import type { ValidationResult } from "../validate/result.js";

export type JourneyShapeId = string;

export type JourneyTopology =
  | "direct_menu"
  | "single_offer_refusal"
  | "single_reward"
  | "random_commit"
  | "delayed_hook"
  | "route_edit"
  | "repeatable_menu"
  | "decision_tree";

export type JourneyPayloadCompatibility = {
  readonly familyId:
    | "adapter"
    | "card"
    | "dreamsign"
    | "bane"
    | "resource"
    | "route"
    | "shop"
    | "dreamwell"
    | "status"
    | "hook"
    | "return"
    | "random"
    | "generated_object"
    | "decision_tree";
  readonly variants: readonly string[];
  readonly legality: "legal" | "unsupported";
  readonly reason: string;
};

export type MenuValueChecks = {
  readonly positiveBands: boolean;
  readonly symmetricBands: boolean;
  readonly escalationOrRiskExempt: boolean;
};

export type JourneyShapeDefinition = {
  readonly id: JourneyShapeId;
  readonly topology: JourneyTopology;
  readonly rootOptionCount: Readonly<{ min: number; max: number }>;
  readonly supportedTags: readonly string[];
  readonly payloadCompatibility: readonly JourneyPayloadCompatibility[];
  readonly validationRules: readonly string[];
  readonly repairPreferences: readonly string[];
  readonly debugLabel: string;
  readonly versionContribution: unknown;
  readonly menuValueChecks: MenuValueChecks;
  readonly allowsRouteReward: boolean;
  readonly allowsRouteSideEffects: boolean;
  readonly compoundCoherence: "default" | "skip";
  readonly requiresPrecommittedRandom: boolean;
  readonly compoundAllowsRouteOnlyReward: boolean;
};

export type ShapeFillArgs = {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly stage: JourneyStage;
  /**
   * Optional shape-specific configuration. Each shape's fill function picks
   * the keys it understands; unknown keys are ignored. Threading config this
   * way avoids polluting the shared args type with shape-specific fields.
   */
  readonly shapeArgs?: Record<string, unknown>;
};

export type FilledJourney = {
  readonly options: JourneyOption[];
  readonly tree?: JourneyTree;
  readonly rewardPool?: JourneyRewardPool;
  readonly precommitted: PrecommittedOutcomes;
  readonly symmetryContracts?: readonly JourneySymmetryContractDebug[];
};

export type ShapeRepairActionKind =
  | "adjust_cost_or_burden"
  | "adjust_quantity"
  | "reveal_hidden_target_or_outcome"
  | "repair_payload_family"
  | "simplify_fill"
  | "switch_to_shape"
  | "switch_shape"
  | "fallback";

export type ShapeRepairAction = {
  readonly action: string;
  readonly kind: ShapeRepairActionKind;
  readonly targetShapeId?: JourneyShapeId;
};

export type ShapeValidatorArgs = {
  readonly manifest: JourneyManifest;
  readonly context: JourneyContext;
  readonly definition: JourneyShapeDefinition;
  readonly generatedObjects: readonly GeneratedObjectDefinition[];
  readonly checked: readonly ValidationCheckedPayload[];
  readonly manifestChecked: readonly ValidationCheckedPayload[];
  readonly optionChecked: readonly ValidationCheckedPayload[];
  readonly treeChecked: readonly ValidationCheckedPayload[];
  readonly precommittedChecked: readonly ValidationCheckedPayload[];
};

export type ShapeValidator = {
  readonly ruleId: string;
  readonly passMessage: string;
  readonly checkedPayloads: (args: ShapeValidatorArgs) => readonly ValidationCheckedPayload[];
  readonly validate: (args: ShapeValidatorArgs) => ValidationResult;
};

export type ShapeDebugPayloadCompatibility = {
  readonly familyId: JourneyPayloadCompatibility["familyId"];
  readonly variantIds: readonly string[];
};

export type ShapeOptionValueValidator = (
  nets: readonly number[],
  manifest: JourneyManifest,
) => ValidationResult;

export type ShapeTreeValidator = (
  manifest: JourneyManifest,
  context: import("../../quest/context.js").JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[],
) => ValidationResult;

export type ShapePrecommitValidator = (
  manifest: JourneyManifest,
) => ValidationResult;

export type JourneyShapePlugin = {
  readonly id: JourneyShapeId;
  readonly definition: JourneyShapeDefinition;
  readonly scoreWeight: number;
  readonly fill: (args: ShapeFillArgs) => FilledJourney;
  readonly validators?: readonly ShapeValidator[];
  readonly optionValueValidator?: ShapeOptionValueValidator;
  readonly treeValidator?: ShapeTreeValidator;
  readonly precommitValidator?: ShapePrecommitValidator;
  readonly repair?: {
    readonly fallbackRank?: number;
    readonly actions?: readonly ShapeRepairAction[];
  };
  readonly generatedObjects?: {
    readonly natural: boolean;
    readonly highWeirdness?: boolean;
  };
  readonly debugPayloads?: readonly ShapeDebugPayloadCompatibility[];
  readonly versionContribution?: unknown;
};

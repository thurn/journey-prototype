import type { JourneyContext } from "../../quest/context.js";
import type { DrawContext } from "../../util/rng.js";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
  JourneyPresentation,
  JourneyRewardPool,
  JourneyStage,
  JourneySymmetryContractDebug,
  JourneyTree,
  PrecommittedOutcomes,
  SequenceState,
} from "../manifest.js";
import type { ValidationResult } from "../validate/result.js";

export type JourneyShapeId = string;

export type JourneyTopology =
  | "direct_menu"
  | "single_offer_refusal"
  | "single_reward"
  | "single_rule_trial"
  | "random_commit"
  | "delayed_hook"
  | "route_edit"
  | "repeatable_menu"
  | "decision_tree";

export type JourneyShapeDefinition = {
  readonly id: JourneyShapeId;
  readonly topology: JourneyTopology;
  readonly rootOptionCount: Readonly<{ min: number; max: number }>;
  readonly supportedTags: readonly string[];
  readonly validationRules: readonly string[];
  readonly debugLabel: string;
  readonly versionContribution: unknown;
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
  readonly presentation?: JourneyPresentation;
  readonly tree?: JourneyTree;
  readonly rewardPool?: JourneyRewardPool;
  readonly sequence?: SequenceState;
  readonly generatedObjects?: readonly GeneratedObjectDefinition[];
  readonly precommitted: PrecommittedOutcomes;
  readonly symmetryContracts?: readonly JourneySymmetryContractDebug[];
};

export type ShapeValidatorArgs = {
  readonly manifest: JourneyManifest;
  readonly context: JourneyContext;
  readonly definition: JourneyShapeDefinition;
  readonly generatedObjects: readonly GeneratedObjectDefinition[];
};

export type ShapeValidator = {
  readonly ruleId: string;
  readonly passMessage: string;
  readonly validate: (args: ShapeValidatorArgs) => ValidationResult;
};

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
  readonly treeValidator?: ShapeTreeValidator;
  readonly precommitValidator?: ShapePrecommitValidator;
  readonly generatedObjects?: {
    readonly natural: boolean;
    readonly highWeirdness?: boolean;
  };
  readonly versionContribution?: unknown;
};

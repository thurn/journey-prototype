import type { JourneyShapeId } from "./shapes.js";
import type { ValueBreakdown } from "./value.js";
import type { DebugPayloadSelection } from "./debugPayloads.js";

export const MANIFEST_SCHEMA_VERSION: 2 = 2;
export const MANIFEST_CONTRACT_VERSION = "manifest:v2";

export type JourneyStage = "early" | "mid" | "late";

export type PickBehavior =
  | "record_and_generate_next"
  | "advance_sequence"
  | "complete_sequence"
  | "leave";

export type SequenceState = {
  step: number;
  status: "active" | "complete" | "left";
  maxSteps?: number;
};

export type OperationVisibility = "visible" | "debug" | "precommitted";

export type TargetSelectionMode =
  | "exact"
  | "predicate"
  | "chosen_after_commitment"
  | "visible_random"
  | "hidden_random";

export type TargetReferenceKind = "content" | "controlled_vocabulary" | "manifest_generated" | "placeholder";

type TargetSelectorBase = {
  selection: TargetSelectionMode;
  referenceKind?: TargetReferenceKind;
  description?: string;
  required?: boolean;
};

export type TargetResolutionMetadata = {
  selectorKind: TargetSelector["selectorKind"];
  selection: TargetSelectionMode;
  sourcePool: string;
  candidateCount: number;
  selected: {
    id?: string;
    name: string;
    kind?: string;
  }[];
  emptyReason?: string;
};

export type OperationTiming =
  | { timingKind: "immediate"; label?: string }
  | { timingKind: "delayed"; trigger: string; label?: string }
  | { timingKind: "route"; scope: "current_dreamscape" | "next_dreamscape"; label?: string }
  | { timingKind: "random"; label?: string };

export type OperationValueMetadata = {
  convertedEssence?: number;
  expectedConvertedEssence?: number;
  uncertaintyConvertedEssence?: number;
  bands?: {
    id:
      | "maximum"
      | "percentage"
      | "all_remaining"
      | "random_range"
      | "cap_change"
      | "multi_omen";
    label: string;
    description: string;
    amount?: number;
    minimum?: number;
    maximum?: number;
  }[];
};

export type TargetSelector =
  | (TargetSelectorBase & {
    selectorKind: "card";
    source?: "catalog" | "deck" | "draftPool";
    ids?: string[];
    names?: string[];
    predicate?: unknown;
  })
  | (TargetSelectorBase & {
    selectorKind: "dreamsign";
    source?: "catalog" | "active" | "pool";
    ids?: string[];
    names?: string[];
    predicate?: unknown;
  })
  | (TargetSelectorBase & {
    selectorKind: "dreamcaller";
    source?: "catalog" | "state";
    ids?: string[];
    names?: string[];
  })
  | (TargetSelectorBase & {
    selectorKind: "bane";
    source?: "vocabulary" | "state";
    names?: string[];
  })
  | (TargetSelectorBase & {
    selectorKind: "route_site";
    scope?: "current_dreamscape" | "next_dreamscape" | "route";
    siteType?: string;
    siteTypes?: string[];
  })
  | (TargetSelectorBase & {
    selectorKind: "status";
    scope: string;
    statusId?: string;
    statusName?: string;
  })
  | (TargetSelectorBase & {
    selectorKind: "generated_object";
    generatedObjectId?: string;
    generatedObjectKind?: GeneratedObjectDefinition["generatedObjectKind"];
    generatedObjectReferenceKind?: "definition" | "placeholder";
    name?: string;
  })
  | {
    selectorKind: "none";
  };

export type GeneratedObjectDefinition =
  | {
    generatedObjectKind: "card";
    generatedObjectId: string;
    name: string;
    payload: Record<string, unknown>;
  }
  | {
    generatedObjectKind: "dreamsign";
    generatedObjectId: string;
    name: string;
    payload: Record<string, unknown>;
  }
  | {
    generatedObjectKind: "status";
    generatedObjectId: string;
    name: string;
    payload: Record<string, unknown>;
  }
  | {
    generatedObjectKind: "transfiguration";
    generatedObjectId: string;
    name: string;
    payload: Record<string, unknown>;
  };

type OperationBase = {
  operationId: string;
  role:
    | "cost"
    | "reward"
    | "burden"
    | "target"
    | "trigger"
    | "route_edit"
    | "random"
    | "delayed_hook"
    | "paired_return"
    | "validation_requirement"
    | "generated_object";
  visibility: OperationVisibility;
  timing?: OperationTiming;
  value?: OperationValueMetadata;
  targetSelector?: TargetSelector;
  targetResolution?: TargetResolutionMetadata;
  legacyKind?: string;
  payload: Record<string, unknown>;
};

export type CostOperation = OperationBase & {
  operationKind: "cost";
  role: "cost";
  costKind: "resource";
  resource: "essence" | "omens";
  amount: number;
};

export type RewardOperation = OperationBase & {
  operationKind: "reward";
  role: "reward";
  rewardKind:
    | "resource"
    | "card_draft"
    | "dreamsign_draft"
    | "dreamsign_gain"
    | "starter_cleanup"
    | "transfiguration"
    | "card_rewrite"
    | "card_duplicate"
    | "battle_window_modifier"
    | "random_reward"
    | "random_series"
    | "unknown";
};

export type BurdenOperation = OperationBase & {
  operationKind: "burden";
  role: "burden";
  burdenKind: "bane_gain" | "resource_loss" | "unknown";
};

export type StatusOperation = OperationBase & {
  operationKind: "status";
  role: "reward" | "burden";
  statusKind: string;
};

export type RouteEditOperation = OperationBase & {
  operationKind: "route_edit";
  role: "route_edit";
  editKind: "replace_site" | "unknown";
  fromSite?: string;
  toSite?: string;
};

export type DelayedHookOperation = OperationBase & {
  operationKind: "delayed_hook";
  role: "trigger" | "delayed_hook";
  hookKind: string;
  rewardOperations?: RewardOperation[];
};

export type PairedReturnOperation = OperationBase & {
  operationKind: "paired_return";
  role: "paired_return";
  anchor?: string;
};

export type RandomEnvelopeOperation = OperationBase & {
  operationKind: "random_envelope" | "reveal_envelope";
  role: "random";
  envelopeKind: string;
  odds?: {
    numerator: number;
    denominator: number;
    percent: number;
  };
};

export type TargetOperation = OperationBase & {
  operationKind: "target";
  role: "target";
  targetSelector: TargetSelector;
};

export type GeneratedObjectOperation = OperationBase & {
  operationKind: "generated_object";
  role: "generated_object";
  generatedObject: GeneratedObjectDefinition;
};

export type ValidationRequirementOperation = OperationBase & {
  operationKind: "validation_requirement";
  role: "validation_requirement";
  requirementKind: string;
};

export type JourneyOperation =
  | CostOperation
  | RewardOperation
  | BurdenOperation
  | StatusOperation
  | RouteEditOperation
  | DelayedHookOperation
  | PairedReturnOperation
  | RandomEnvelopeOperation
  | TargetOperation
  | GeneratedObjectOperation
  | ValidationRequirementOperation;

export type ValidationSeverity = "error" | "warning";

export type ValidationCheckedPayload = {
  path: string;
  scope:
    | "manifest"
    | "option"
    | "tree_branch"
    | "tree_terminal"
    | "reward_pool"
    | "precommitted";
  optionNumber?: number;
  shapeId?: JourneyShapeId;
  payloadFamily?: string;
  targetResolution?: TargetResolutionMetadata;
};

export type ValidationRuleOutcome = {
  ruleId: string;
  severity: ValidationSeverity;
  status: "pass" | "fail";
  message: string;
  checked: ValidationCheckedPayload[];
  debug?: Record<string, unknown>;
};

export type ValidationReport = {
  ok: boolean;
  passed: number;
  failed: number;
  firstFailure?: Pick<ValidationRuleOutcome, "ruleId" | "message" | "severity" | "checked">;
  rules: ValidationRuleOutcome[];
};

export type RepairOutcomeStatus =
  | "accepted_immediately"
  | "adjusted"
  | "narrowed"
  | "replaced"
  | "fallback"
  | "forced_shape_failed"
  | "unrepaired";

export type RepairOutcomeMetadata = {
  status: RepairOutcomeStatus;
  forcedShape: boolean;
  finalShapeId: JourneyShapeId;
  failedRule?: string;
  message?: string;
  payloadFamily?: string;
  targetResolution?: TargetResolutionMetadata;
};

export type PrecommittedOutcomes = {
  random?: unknown[];
  delayed?: unknown[];
  pairedReturn?: unknown[];
  routeEdits?: unknown[];
  sequenceMenus?: Record<string, JourneyOption[]>;
  operations?: JourneyOperation[];
};

export type JourneyDebug = {
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  selectedShapeId: JourneyShapeId;
  selectedTags: string[];
  optionValues: ValueBreakdown[];
  repairs: {
    attempt: number;
    failedRule: string;
    actionCategory: Exclude<RepairOutcomeStatus, "accepted_immediately" | "forced_shape_failed" | "unrepaired">;
    action: string;
    result: "repaired" | "fallback" | "failed";
    validation?: Pick<ValidationRuleOutcome, "ruleId" | "message" | "severity" | "checked">;
  }[];
  validation: ValidationReport;
  repair: RepairOutcomeMetadata;
  semanticFingerprint: {
    algorithm: "semantic-fingerprint:v1";
    value: string;
    components: string[];
  };
  previousPick?: {
    journeyId: string;
    shapeId: JourneyShapeId;
    selectedOptionNumber: number;
    effectSimulation: "not_applied";
    sequenceStep?: number;
    sequenceStatus?: SequenceState["status"];
  };
  debugPayload?: DebugPayloadSelection & {
    source: "forced";
  };
};

export type ManifestReferences = {
  cardIds: string[];
  dreamsignIds: string[];
  dreamcallerIds: string[];
  baneNames: string[];
};

export type JourneyVersionMetadata = {
  contentVersion: string;
  shapeCatalogVersion: string;
  effectCatalogVersion: string;
  valueModelVersion: string;
  rendererVersion: string;
  manifestContractVersion: string;
  validationContractVersion: string;
};

export type JourneyOption = {
  number: number;
  symbols: string[];
  text: string;
  operations: JourneyOperation[];
  costs: unknown[];
  effects: unknown[];
  burdens: unknown[];
  targets: unknown[];
  triggers: unknown[];
  routeEffects: unknown[];
  costConvertedEssence: number;
  effectConvertedEssence: number;
  burdenConvertedEssence: number;
  uncertaintyConvertedEssence: number;
  netConvertedEssence: number;
  pickBehavior: PickBehavior;
};

export type JourneyTreeBranchKind =
  | "player_choice"
  | "random_chance"
  | "automatic_transition";

export type JourneyTreeTerminal = {
  text: string;
  outcome: "end" | "claim" | "failure" | "leave";
  operations: JourneyOperation[];
  costs: unknown[];
  effects: unknown[];
  burdens: unknown[];
  targets: unknown[];
  routeEffects: unknown[];
};

export type JourneyTreeBranch = {
  id: string;
  label: string;
  kind: JourneyTreeBranchKind;
  text: string;
  operations: JourneyOperation[];
  odds?: {
    numerator: number;
    denominator: number;
    percent: number;
  };
  costs: unknown[];
  effects: unknown[];
  burdens: unknown[];
  targets: unknown[];
  triggers: unknown[];
  routeEffects: unknown[];
  costConvertedEssence: number;
  effectConvertedEssence: number;
  burdenConvertedEssence: number;
  uncertaintyConvertedEssence: number;
  netConvertedEssence: number;
  nextNodeId?: string;
  terminal?: JourneyTreeTerminal;
};

export type JourneyTreeNode = {
  id: string;
  levelLabel: string;
  description?: string;
  branches: JourneyTreeBranch[];
};

export type JourneyRewardPool = {
  summary: string;
  replacement: "with_replacement" | "without_replacement";
  operations: JourneyOperation[];
  rewards: unknown[];
};

export type JourneyTree = {
  rootNodeId: string;
  nodes: JourneyTreeNode[];
};

export type JourneyManifest = {
  schemaVersion: 2;
  versions: JourneyVersionMetadata;
  journeyId: string;
  seed: string;
  rootJourneyIndex: number;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  dreamscape: number;
  selectedTags: string[];
  options: JourneyOption[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  sequence?: SequenceState;
  precommitted: PrecommittedOutcomes;
  debug: JourneyDebug;
  references: ManifestReferences;
};

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
  | {
    timingKind: "route";
    scope: "current_dreamscape" | "next_dreamscape" | "future_dreamscapes" | "full_atlas";
    label?: string;
  }
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

export type HookTriggerSelector = {
  triggerKind:
    | "battle"
    | "victory"
    | "each_battle"
    | "site_visit"
    | "named_card_play"
    | "dreamsign_trigger"
    | "card_added"
    | "essence_payment"
    | "future_shop"
    | "future_dream_journey";
  label: string;
  count?: number;
  siteType?: string;
  cardId?: string;
  cardName?: string;
  dreamsignId?: string;
  dreamsignName?: string;
  amount?: number;
};

export type BoundedDuration = {
  durationKind: "battle_count" | "dreamscape_count" | "shop_count" | "journey_count" | "until_trigger";
  count?: number;
  label: string;
};

export type HookExpirationPolicy = {
  policyKind: "forfeit_reward" | "resolve_partial" | "pay_cost" | "return_unchanged" | "discard_obligation";
  label: string;
};

export type HookVisibilityPolicy = {
  outcomeVisibility: "visible" | "hidden_until_resolution" | "debug_only";
  disclosure: string;
};

export type HookControlledScene = {
  sceneKind: "reward" | "cost" | "transformation" | "trade" | "return";
  label: string;
};

export type DelayedHookContract = {
  hookId: string;
  optionNumber?: number;
  triggerSelector: HookTriggerSelector;
  trackedCondition: string;
  resolution: string;
  expiration: HookExpirationPolicy;
  duration: BoundedDuration;
  controlledScene: HookControlledScene;
  visibilityPolicy: HookVisibilityPolicy;
  hookBudgetCost: number;
};

export type PairedReturnContract = {
  pairedReturnId: string;
  optionNumber?: number;
  anchor: string;
  created: {
    referenceKind: "sealed_object" | "borrowed_object" | "trade_promise" | "status" | "cost" | "promise";
    referenceId: string;
    label: string;
    objectKind?: "card" | "dreamsign" | "status" | "cost" | "promise";
    cardId?: string;
    cardName?: string;
    dreamsignId?: string;
    dreamsignName?: string;
    statusScope?: string;
    cost?: {
      resource: "essence" | "omens";
      amount: number;
    };
  };
  returnScene: {
    returnSceneKind: "sealed_object_return" | "borrowed_object_return" | "future_trade";
    triggerSelector: HookTriggerSelector;
    referencesCreatedId: string;
    resolution: string;
    expiration: HookExpirationPolicy;
    duration: BoundedDuration;
  };
  visibilityPolicy: HookVisibilityPolicy;
};

export type ResourceAmountSemantics = {
  resource: "essence" | "omens" | "maxEssence";
  amountKind:
    | "fixed"
    | "maximum"
    | "restore_to_maximum"
    | "percentage_of_current"
    | "percentage_of_maximum"
    | "all_remaining"
    | "random_range"
    | "cap_change"
    | "reward_reduction";
  amount?: number;
  percentage?: number;
  minimum?: number;
  maximum?: number;
  capDelta?: number;
  basis?: "current" | "maximum" | "remaining" | "reward";
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
    scope?: "current_dreamscape" | "next_dreamscape" | "future_dreamscapes" | "full_atlas" | "route";
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
  resourceSemantics?: ResourceAmountSemantics;
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
    | "resource_cap_change"
    | "resource_restore_to_maximum"
    | "resource_percentage"
    | "resource_random_range"
    | "card_draft"
    | "dreamsign_draft"
    | "dreamsign_gain"
    | "dreamsign_purchase"
    | "dreamsign_loss"
    | "dreamsign_purge"
    | "dreamsign_duplicate"
    | "dreamsign_transform"
    | "dreamsign_temporary_grant"
    | "dreamsign_copy_gain"
    | "dreamsign_pool_edit"
    | "dreamsign_trigger_counter"
    | "dreamsign_random_reward"
    | "dreamsign_trade_hook"
    | "starter_cleanup"
    | "starter_replacement"
    | "card_gain"
    | "card_purge"
    | "card_transform"
    | "card_replace"
    | "card_transfigure"
    | "card_text_modification"
    | "card_type_change"
    | "card_keyword_add"
    | "card_keyword_remove"
    | "card_opening_hand"
    | "card_merge"
    | "card_split"
    | "card_temporary_copy"
    | "card_delayed_transformation"
    | "transfiguration"
    | "card_rewrite"
    | "card_duplicate"
    | "bane_purge"
    | "bane_random_purge"
    | "bane_chosen_purge"
    | "bane_replace"
    | "bane_transform_to_card"
    | "shop_economy_modifier"
    | "dreamwell_modifier"
    | "battle_window_modifier"
    | "random_reward"
    | "random_series"
    | "unknown";
};

export type BurdenOperation = OperationBase & {
  operationKind: "burden";
  role: "burden";
  burdenKind:
    | "bane_gain"
    | "bane_temporary"
    | "bane_delayed"
    | "dreamwell_modifier"
    | "resource_loss"
    | "reward_reduction"
    | "unknown";
};

export type StatusOperation = OperationBase & {
  operationKind: "status";
  role: "reward" | "burden";
  statusKind: string;
};

export type RouteEditOperation = OperationBase & {
  operationKind: "route_edit";
  role: "route_edit";
  editKind: "add_site" | "remove_site" | "replace_site" | "purge_site" | "probability_adjustment" | "unknown";
  fromSite?: string;
  toSite?: string;
};

export type DelayedHookOperation = OperationBase & {
  operationKind: "delayed_hook";
  role: "trigger" | "delayed_hook";
  hookKind: string;
  triggerSelector?: HookTriggerSelector;
  trackedCondition?: string;
  resolution?: string;
  expiration?: HookExpirationPolicy;
  duration?: BoundedDuration;
  controlledScene?: HookControlledScene;
  visibilityPolicy?: HookVisibilityPolicy;
  hookBudgetCost?: number;
  rewardOperations?: JourneyOperation[];
};

export type PairedReturnOperation = OperationBase & {
  operationKind: "paired_return";
  role: "paired_return";
  anchor?: string;
  contract?: PairedReturnContract;
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

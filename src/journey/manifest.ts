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

export type TargetResolutionOrigin =
  | "current_object"
  | "catalog_reward"
  | "draft_pool_candidate"
  | "dreamsign_pool_candidate"
  | "future_generated_object"
  | "future_burden"
  | "manifest_obligation"
  | "controlled_vocabulary"
  | "state_pool"
  | "catalog_reference";

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
  targetOrigin: TargetResolutionOrigin;
  candidateCount: number;
  selected: {
    id?: string;
    name: string;
    kind?: string;
    sourcePool?: string;
    targetOrigin?: TargetResolutionOrigin;
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
  riskPremiumConvertedEssence?: number;
  bands?: {
    id:
      | "maximum"
      | "percentage"
      | "all_remaining"
      | "random_range"
      | "cap_change"
      | "multi_omen"
      | "predicate_specificity"
      | "choice_breadth"
      | "take_count"
      | "copy_count"
      | "random_hidden_target"
      | "temporary_gain"
      | "starter_cleanup_reward"
      | "starter_replacement"
      | "useful_card_sacrifice"
      | "all_starters"
      | "dreamsign_operation_family"
      | "dreamsign_random_source"
      | "temporary_dreamsign"
      | "dreamsign_predicate"
      | "bane_name"
      | "bane_count"
      | "bane_temporary_duration"
      | "bane_delayed_timing"
      | "bane_purge_certainty"
      | "bane_replacement_relief"
      | "battle_window_operation"
      | "battle_window_player"
      | "battle_window_polarity"
      | "dreamwell_count"
      | "dreamwell_card_role"
      | "dreamwell_phase_selector"
      | "dreamwell_player_visibility";
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
    | "dreamscape"
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
    source?: "vocabulary" | "state" | "future_burden" | "manifest_obligation";
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

export type GeneratedObjectKind = "card" | "dreamsign" | "status" | "transfiguration";

export type GeneratedObjectValueEstimate = {
  convertedEssence: number;
  confidence: "low" | "medium" | "high";
  basis: string;
};

export type GeneratedObjectValidationMetadata = {
  source: "generated_manifest_local";
  status: "validated" | "unvalidated";
  ruleIds: string[];
  notes?: string[];
};

type GeneratedObjectDefinitionBase = {
  generatedObjectKind: GeneratedObjectKind;
  generatedObjectId: string;
  name: string;
  objectType: string;
  rulesText: string;
  tags: string[];
  references: {
    cards?: string[];
    dreamsigns?: string[];
    dreamcallers?: string[];
    banes?: string[];
    rules?: string[];
    generatedObjects?: string[];
  };
  duration?: BoundedDuration;
  lifetime?: "one_time" | "temporary" | "persistent" | "until_returned" | "journey_only";
  valueEstimate: GeneratedObjectValueEstimate;
  validation: GeneratedObjectValidationMetadata;
  payload: Record<string, unknown>;
};

export type GeneratedObjectDefinition =
  | (GeneratedObjectDefinitionBase & { generatedObjectKind: "card" })
  | (GeneratedObjectDefinitionBase & { generatedObjectKind: "dreamsign" })
  | (GeneratedObjectDefinitionBase & { generatedObjectKind: "status" })
  | (GeneratedObjectDefinitionBase & { generatedObjectKind: "transfiguration" });

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
    | "generated_object_create"
    | "generated_object_grant"
    | "generated_object_transform"
    | "generated_object_temporary_grant"
    | "generated_object_return"
    | "generated_object_trade"
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

export type RandomOdds = {
  numerator: number;
  denominator: number;
  percent: number;
};

export type RandomOutcomeVisibility =
  | "visible"
  | "hidden_until_resolution"
  | "delayed"
  | "pre_rolled"
  | "resolved"
  | "debug_only";

export type RandomVisibilityPolicy = {
  outcomeVisibility: RandomOutcomeVisibility;
  disclosure: string;
  playerVisible: boolean;
  revealTiming?: string;
};

export type RandomPoolReplacementPolicy = "with_replacement" | "without_replacement" | "precommitted_order";

export type RandomEnvelopeConstraint = {
  constraintKind: "shape_invariant";
  shapeId: JourneyShapeId;
  ruleId:
    | "risk_or_skip_bounded_downside"
    | "single_wager_known_stake";
  label: string;
};

type RandomPrecommitBase = {
  kind: string;
  optionNumber?: number;
  visibilityPolicy?: RandomVisibilityPolicy;
  odds?: RandomOdds;
  expectedConvertedEssence?: number;
  riskPremiumConvertedEssence?: number;
  presentation?: string;
  constraints?: RandomEnvelopeConstraint[];
};

export type RandomPrecommittedOutcome =
  | (RandomPrecommitBase & {
    kind: "visible_pool";
    poolId: string;
    summary: string;
    rewards: unknown[];
    replacement: RandomPoolReplacementPolicy;
  })
  | (RandomPrecommitBase & {
    kind: "random_cost";
    cost: unknown;
    committedCost: unknown;
  })
  | (RandomPrecommitBase & {
    kind: "random_reward";
    reward: unknown;
    committedReward: unknown;
  })
  | (RandomPrecommitBase & {
    kind: "chance_to_gain_bane";
    baneName: string;
    count: number;
    committedResult: "bane" | "safe";
  })
  | (RandomPrecommitBase & {
    kind: "chance_to_pay_cost";
    cost: unknown;
    committedResult: "paid" | "free";
  })
  | (RandomPrecommitBase & {
    kind: "reveal_rewards";
    revealCount: number;
    rewards: unknown[];
  })
  | (RandomPrecommitBase & {
    kind: "choose_one_revealed_reward";
    revealCount: number;
    rewards: unknown[];
  })
  | (RandomPrecommitBase & {
    kind: "choose_one_random_revealed_reward";
    revealCount: number;
    rewards: unknown[];
    committedReward: unknown;
  })
  | (RandomPrecommitBase & {
    kind: "gain_one_random_reward";
    poolId: string;
    rewards: unknown[];
    committedReward: unknown;
  })
  | (RandomPrecommitBase & {
    kind: "roll_twice_keep_one";
    rolls: number[];
    keptRoll: number;
    outcomes: unknown[];
  })
  | (RandomPrecommitBase & {
    kind: "repeated_pool_draws";
    poolId: string;
    drawCount: number;
    rewards: unknown[];
    committedDraws: unknown[];
    replacement: RandomPoolReplacementPolicy;
  })
  | (RandomPrecommitBase & {
    kind: "random_range";
    resource: "essence" | "omens";
    minimum: number;
    maximum: number;
    committedAmount: number;
  })
  | (RandomPrecommitBase & {
    kind: "resource_random_range";
    resource: "essence" | "omens";
    minimum: number;
    maximum: number;
    committedAmount: number;
  })
  | (RandomPrecommitBase & {
    kind: "wager";
    stake: unknown;
    success: unknown;
    failure: unknown;
    roll: number;
    committedResult: "success" | "failure";
  })
  | (RandomPrecommitBase & {
    kind: "probability_ladder";
    bounded: true;
    levels?: { level: number; odds: RandomOdds; reward: unknown }[];
  })
  | (RandomPrecommitBase & {
    kind: "push_choice";
    bounded: true;
    hazard: unknown;
    committedResult?: "success" | "failure";
  })
  | (RandomPrecommitBase & {
    kind: "complete_decision_tree";
    motif: JourneyShapeId;
    nodes: {
      nodeId: string;
      levelLabel: string;
      branches: {
        branchId: string;
        label: string;
        kind: JourneyTreeBranchKind;
        odds?: RandomOdds;
        nextNodeId?: string;
        terminalOutcome?: JourneyTreeTerminal["outcome"];
        operationCount: number;
      }[];
    }[];
    stopBranchIds: string[];
    failureBranchIds: string[];
    rewardBranchIds: string[];
  })
  | (RandomPrecommitBase & {
    kind: "resolved_random_series";
    series: unknown[];
    resolved: true;
  })
  | ({ kind: string; optionNumber?: number } & Record<string, unknown>);

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

export type SemanticEquivalenceBand = {
  field:
    | "essence_amount"
    | "omen_count"
    | "chance_percentage"
    | "duration_count"
    | "choice_count";
  band: string;
  description: string;
};

export type DistinctnessFingerprint = {
  algorithm: "semantic-fingerprint:v1";
  value: string;
  components: string[];
  explanation: {
    shapeId: JourneyShapeId;
    topology: string;
    stage: JourneyStage;
    payloadFamilies: string[];
    operationVerbs: string[];
    targetClasses: string[];
    namedObjectIdentities: string[];
    generatedObjectArchetypes: string[];
    timingClasses: string[];
    triggerClasses: string[];
    routeScopes: string[];
    statusScopes: string[];
    randomEnvelopeTypes: string[];
    revealEnvelopeTypes: string[];
    visibilityPolicies: string[];
    majorCostFamilies: string[];
    majorRewardFamilies: string[];
    majorBurdenFamilies: string[];
    motifs: string[];
    curatedVariantIds: string[];
    semanticValueBands: string[];
  };
  equivalenceBands: SemanticEquivalenceBand[];
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

export type ReachabilityEvidenceCategory =
  | "payload"
  | "selector"
  | "timing";

export type ReachabilityEvidence = {
  category: ReachabilityEvidenceCategory;
  family: string;
  path: string;
  operationId?: string;
  operationKind?: JourneyOperation["operationKind"];
  role?: JourneyOperation["role"];
  detail?: string;
};

export type ReachabilityMetadata = {
  evidenceSource: "structured_manifest_operations";
  generatorMode: "normal_generation" | "forced_debug_fixture";
  shapeTopology: string;
  shapeId: JourneyShapeId;
  payloadFamilies: string[];
  selectorFamilies: string[];
  timingFamilies: string[];
  evidence: ReachabilityEvidence[];
  debugFixture?: {
    qaId: string;
    familyId: string;
    variantId: string;
    coverageKind?: string;
  };
};

export type PrecommittedOutcomes = {
  random?: RandomPrecommittedOutcome[];
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
  semanticFingerprint: DistinctnessFingerprint;
  reachability?: ReachabilityMetadata;
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
  distinctness: DistinctnessFingerprint;
  generatedObjects: GeneratedObjectDefinition[];
  tree?: JourneyTree;
  rewardPool?: JourneyRewardPool;
  sequence?: SequenceState;
  precommitted: PrecommittedOutcomes;
  debug: JourneyDebug;
  references: ManifestReferences;
};

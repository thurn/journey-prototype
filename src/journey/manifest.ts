import type { JourneyShapeId } from "./shapes.js";
import type { ValueBreakdown } from "./value.js";

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

export type PrecommittedOutcomes = {
  random?: unknown[];
  delayed?: unknown[];
  pairedReturn?: unknown[];
  routeEdits?: unknown[];
  sequenceMenus?: Record<string, JourneyOption[]>;
};

export type JourneyDebug = {
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  selectedShapeId: JourneyShapeId;
  selectedTags: string[];
  optionValues: ValueBreakdown[];
  repairs: {
    attempt: number;
    failedRule: string;
    action: string;
    result: "repaired" | "fallback" | "failed";
  }[];
  previousPick?: {
    journeyId: string;
    shapeId: JourneyShapeId;
    selectedOptionNumber: number;
    effectSimulation: "not_applied";
    sequenceStep?: number;
    sequenceStatus?: SequenceState["status"];
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

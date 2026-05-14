import { validateDecisionTree } from "../validate/tree.js";
import { getShapeScoreWeight } from "./scoreWeights.js";
import type {
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
  JourneyTopology,
  ShapeValidator,
} from "./types.js";

export const JOURNEY_SHAPE_CATALOG_VERSION = "journey-shapes:v25";

export const commonValidationRules = [
  "root_option_count_within_bounds",
  "options_match_shape_topology",
  "option_values_are_comparable_for_shape",
  "symmetric_option_values_are_comparable",
];

export type RawJourneyShapeDefinition = JourneyShapeDefinition;

export function versionContribution(
  id: JourneyShapeId,
  topology: JourneyTopology,
) {
  return {
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    id,
    topology,
  };
}

export function freezeSerializable<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeSerializable)) as T;
  }

  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeSerializable(nestedValue),
        ]),
      ),
    ) as T;
  }

  return value;
}

export function cloneSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSerializable);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneSerializable(nestedValue),
      ]),
    );
  }

  return value;
}

export function freezeShapeDefinition(
  definition: RawJourneyShapeDefinition,
): JourneyShapeDefinition {
  const version = {
    ...(definition.versionContribution &&
    typeof definition.versionContribution === "object" &&
    !Array.isArray(definition.versionContribution)
      ? definition.versionContribution
      : { value: definition.versionContribution }),
  };

  return Object.freeze({
    ...definition,
    rootOptionCount: Object.freeze({ ...definition.rootOptionCount }),
    supportedTags: Object.freeze([...definition.supportedTags]),
    validationRules: Object.freeze([...definition.validationRules]),
    versionContribution: freezeSerializable(version),
    ...(definition.automaticLeave === false ? { automaticLeave: false } : {}),
  });
}

export type DefineShapePluginInput = Omit<
  JourneyShapePlugin,
  "id" | "definition" | "scoreWeight"
> & {
  readonly definition: RawJourneyShapeDefinition;
  // Production shapes get their weight from `scoreWeights.ts`. This override
  // exists only for test fixtures whose IDs aren't in the table.
  readonly scoreWeight?: number;
};

export function defineShapePlugin(
  input: DefineShapePluginInput,
): JourneyShapePlugin {
  const definition = freezeShapeDefinition(input.definition);
  const plugin: JourneyShapePlugin = {
    id: definition.id,
    definition,
    scoreWeight: input.scoreWeight ?? getShapeScoreWeight(definition.id),
    fill: input.fill,
    ...(input.validators
      ? { validators: Object.freeze([...input.validators]) }
      : {}),
    ...(input.treeValidator
      ? { treeValidator: input.treeValidator }
      : {}),
    ...(input.precommitValidator
      ? { precommitValidator: input.precommitValidator }
      : {}),
    ...(input.generatedObjects
      ? { generatedObjects: freezeSerializable(input.generatedObjects) }
      : {}),
    ...(input.versionContribution
      ? { versionContribution: freezeSerializable(input.versionContribution) }
      : {}),
  };

  return Object.freeze(plugin);
}

export const decisionTreeValidator: ShapeValidator = {
  ruleId: "decision_tree_invariants",
  passMessage:
    "Decision-tree topology is complete and legal when applicable.",
  validate: ({ manifest, context, generatedObjects }) =>
    validateDecisionTree(manifest, context, generatedObjects),
};

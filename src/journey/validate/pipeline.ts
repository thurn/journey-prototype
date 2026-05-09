import type { JourneyContext } from "../../quest/context.js";
import { generatedObjectResolverPool } from "../effects.js";
import type { JourneyManifest, ValidationCheckedPayload, ValidationRuleOutcome } from "../manifest.js";
import { MANIFEST_SCHEMA_VERSION } from "../manifest.js";
import { getShapePlugin } from "../shapes.js";
import {
  validateGeneratedObjectDefinitions,
  validateReferences,
  validateVersionMetadata,
} from "./metadataReferences.js";
import { scanIllegalStructuredValue } from "./payloadScanning.js";
import { validateRouteEffects, validateTypedPayloadContracts } from "./payloadContracts.js";
import {
  delayedPrecommittedResult,
  randomPrecommittedResult,
  routePrecommittedPayloadResult,
  routePrecommittedPresenceResult,
} from "./precommitRules.js";
import { manifestCheckedPayloads, resultToOutcome } from "./report.js";
import { fail, type ValidationResult } from "./result.js";
import {
  offerRefusalResult,
  repeatableMenuLeaveResult,
  repeatableMenuLimitResult,
  rootOptionCountResult,
  rootOptionPayloadsResult,
  rootValueResult,
  validateRootMechanicalDistinction,
} from "./rootRules.js";
import { validateSemanticOperations } from "./semanticOperations.js";
import { validateOperationTargetSelectors } from "./targetSelectors.js";

export type ValidationPipelineOptions = {
  stopAfterFirstFailure?: boolean;
};

export function validationRuleOutcomes(
  manifest: JourneyManifest,
  context: JourneyContext,
  options: ValidationPipelineOptions = {},
): ValidationRuleOutcome[] {
  const checked = manifestCheckedPayloads(manifest);
  const manifestChecked = checked.filter((entry) => entry.scope === "manifest");
  const optionChecked = checked.filter((entry) => entry.scope === "option");
  const treeChecked = checked.filter((entry) =>
    entry.scope === "tree_branch" || entry.scope === "tree_terminal"
  );
  const rewardPoolChecked = checked.filter((entry) => entry.scope === "reward_pool");
  const precommittedChecked = checked.filter((entry) => entry.scope === "precommitted");
  const rules: ValidationRuleOutcome[] = [];
  const plugin = getShapePlugin(manifest.shapeId);
  const definition = plugin.definition;
  const generatedObjects = generatedObjectResolverPool(manifest);
  const pushRule = (
    ruleId: string,
    result: ValidationResult,
    ruleChecked: readonly ValidationCheckedPayload[],
    passMessage: string,
    ruleOptions: { fatal?: boolean } = {},
  ): boolean => {
    const outcome = resultToOutcome(ruleId, result, [...ruleChecked], passMessage);
    rules.push(outcome);

    return outcome.status === "pass" ||
      !(options.stopAfterFirstFailure || ruleOptions.fatal);
  };
  const shapeValidatorArgs = {
    manifest,
    context,
    definition,
    generatedObjects,
    checked,
    manifestChecked,
    optionChecked,
    treeChecked,
    precommittedChecked,
  };

  if (!pushRule(
    "manifest_schema_version",
    manifest.schemaVersion === MANIFEST_SCHEMA_VERSION
      ? { ok: true }
      : fail("manifest_schema_version", `Manifest schema version must be ${MANIFEST_SCHEMA_VERSION}`),
    manifestChecked,
    "Manifest schema version matches the active contract.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "manifest_version_metadata",
    validateVersionMetadata(manifest, context),
    manifestChecked,
    "Manifest version metadata matches the content, catalog, renderer, value, and validation contracts.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "journey_id_format",
    /^J-\d{6}$/u.test(manifest.journeyId)
      ? { ok: true }
      : fail("journey_id_format", "Root Journey IDs must use J-000001 formatting"),
    manifestChecked,
    "Journey ID uses the stable root Journey format.",
    { fatal: true },
  )) {
    return rules;
  }

  const optionCountResult = rootOptionCountResult(manifest, definition);
  if (!pushRule(
    "root_option_count_within_bounds",
    optionCountResult,
    optionChecked.length > 0 ? optionChecked : manifestChecked,
    "Root option count is legal for the selected shape.",
    { fatal: true },
  )) {
    return rules;
  }

  const typedPayloadContractResult = validateTypedPayloadContracts(manifest, context);
  if (!pushRule(
    typedPayloadContractResult.ok ? "typed_payload_contracts" : typedPayloadContractResult.rule,
    typedPayloadContractResult,
    checked,
    "Typed operation payload contracts are coherent.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "unresolved_reference",
    validateReferences(manifest, context),
    checked,
    "All manifest references resolve to known content or controlled vocabulary.",
  )) {
    return rules;
  }

  const generatedObjectResult = validateGeneratedObjectDefinitions(manifest, context);
  if (!pushRule(
    generatedObjectResult.ok ? "generated_object_definitions" : generatedObjectResult.rule,
    generatedObjectResult,
    manifestChecked,
    "Manifest-local generated object definitions are complete and coherent.",
  )) {
    return rules;
  }

  const optionResult = rootOptionPayloadsResult(manifest, context, generatedObjects);
  if (!pushRule(
    optionResult.ok ? "root_option_payloads" : optionResult.rule,
    optionResult,
    optionChecked,
    "Root option text, costs, targets, and structured payloads are legal.",
    { fatal: true },
  )) {
    return rules;
  }

  if (!pushRule(
    "duplicate_root_option_mechanics",
    validateRootMechanicalDistinction(manifest),
    optionChecked,
    "Root options are mechanically distinct where the shape requires it.",
  )) {
    return rules;
  }

  const treeBranches = manifest.tree?.nodes.flatMap((node) => node.branches) ?? [];
  if (!pushRule(
    "route_effects",
    validateRouteEffects([
      ...manifest.options.flatMap((option) => option.routeEffects),
      ...treeBranches.flatMap((branch) => branch.routeEffects),
    ]),
    checked.filter((entry) => entry.scope === "option" || entry.scope === "tree_branch"),
    "Route effects use legal route edit structures.",
  )) {
    return rules;
  }

  for (const validator of plugin.validators ?? []) {
    const result = validator.validate(shapeValidatorArgs);

    if (!pushRule(
      result.ok ? validator.ruleId : result.rule,
      result,
      validator.checkedPayloads(shapeValidatorArgs),
      validator.passMessage,
    )) {
      return rules;
    }
  }

  const valueResult = rootValueResult(manifest);
  if (!pushRule(
    valueResult.ok ? "shape_value_comparability" : valueResult.rule,
    valueResult,
    optionChecked,
    "Root option values are coherent for the selected shape.",
  )) {
    return rules;
  }

  const refusalResult = offerRefusalResult(manifest, definition);
  if (!pushRule(
    refusalResult.ok ? "offer_refusal_invariants" : refusalResult.rule,
    refusalResult,
    optionChecked,
    "Offer shapes include a real leave option when required.",
  )) {
    return rules;
  }

  const repeatableLeaveResult = repeatableMenuLeaveResult(manifest, definition);
  if (!pushRule(
    repeatableLeaveResult.ok ? "repeatable_menu_leave_option" : repeatableLeaveResult.rule,
    repeatableLeaveResult,
    optionChecked,
    "Repeatable menus include a real leave option when applicable.",
  )) {
    return rules;
  }

  const repeatableLimitResult = repeatableMenuLimitResult(manifest, definition);
  if (!pushRule(
    repeatableLimitResult.ok ? "repeatable_menu_limiting_structure" : repeatableLimitResult.rule,
    repeatableLimitResult,
    optionChecked,
    "Repeatable take options include a cost, burden, or risk when applicable.",
  )) {
    return rules;
  }

  const randomResult = randomPrecommittedResult(manifest, definition);
  if (!pushRule(
    randomResult.ok ? "random_precommitted_outcomes" : randomResult.rule,
    randomResult,
    precommittedChecked,
    "Random or hidden outcomes are precommitted when required.",
  )) {
    return rules;
  }

  const delayedResult = delayedPrecommittedResult(manifest, context, definition);
  if (!pushRule(
    delayedResult.ok ? "delayed_precommitted_outcomes" : delayedResult.rule,
    delayedResult,
    precommittedChecked,
    "Delayed outcomes are precommitted and within persistence budget when required.",
  )) {
    return rules;
  }

  const routePresenceResult = routePrecommittedPresenceResult(manifest, definition);
  if (!pushRule(
    routePresenceResult.ok ? "route_precommitted_outcomes" : routePresenceResult.rule,
    routePresenceResult,
    precommittedChecked,
    "Route edits are precommitted when required.",
  )) {
    return rules;
  }

  const routePrecommitResult = routePrecommittedPayloadResult(manifest);
  if (!pushRule(
    routePrecommitResult.ok ? "route_precommitted_payloads" : routePrecommitResult.rule,
    routePrecommitResult,
    precommittedChecked,
    "Precommitted route edits use legal route edit structures.",
  )) {
    return rules;
  }

  const rewardPoolTargetResult = manifest.rewardPool
    ? validateOperationTargetSelectors(manifest.rewardPool.operations, context, "Reward pool", generatedObjects)
    : { ok: true } as const;
  if (!pushRule(
    rewardPoolTargetResult.ok ? "reward_pool_target_selectors" : rewardPoolTargetResult.rule,
    rewardPoolTargetResult,
    rewardPoolChecked.length > 0 ? rewardPoolChecked : checked,
    "Reward pool typed operation target selectors resolve where required.",
  )) {
    return rules;
  }

  const precommittedTargetResult = validateOperationTargetSelectors(
    manifest.precommitted.operations,
    context,
    "Precommitted outcomes",
    generatedObjects,
  );
  if (!pushRule(
    precommittedTargetResult.ok ? "operation_target_selectors" : precommittedTargetResult.rule,
    precommittedTargetResult,
    precommittedChecked,
    "Precommitted typed operation target selectors resolve where required.",
  )) {
    return rules;
  }

  if (!pushRule(
    "semantic_operations",
    validateSemanticOperations(manifest),
    checked,
    "Legacy payload records have typed semantic operation counterparts.",
  )) {
    return rules;
  }

  pushRule(
    "precommitted_structured_values",
    scanIllegalStructuredValue(manifest.precommitted),
    precommittedChecked,
    "Precommitted structured values are legal.",
  );

  return rules;
}

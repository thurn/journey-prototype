import type { JourneyContext } from "../../quest/context.js";
import { generatedObjectResolverPool } from "../effects.js";
import type { JourneyManifest, ValidationCheckedPayload, ValidationRuleOutcome } from "../manifest.js";
import { MANIFEST_SCHEMA_VERSION } from "../manifest.js";
import { getShapeDefinition } from "../shapes.js";
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
  validateRiskOrSkip,
  validateSequenceMenus,
  validateSingleWager,
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
import { validateDecisionTree } from "./tree.js";
import { validateTimedWindowMenu } from "./values.js";

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
  const definition = getShapeDefinition(manifest.shapeId);
  const generatedObjects = generatedObjectResolverPool(manifest);
  const pushRule = (
    ruleId: string,
    result: ValidationResult,
    ruleChecked: ValidationCheckedPayload[],
    passMessage: string,
    ruleOptions: { fatal?: boolean } = {},
  ): boolean => {
    const outcome = resultToOutcome(ruleId, result, ruleChecked, passMessage);
    rules.push(outcome);

    return outcome.status === "pass" ||
      !(options.stopAfterFirstFailure || ruleOptions.fatal);
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

  const typedPayloadContractResult = validateTypedPayloadContracts(manifest);
  if (!pushRule(
    typedPayloadContractResult.ok ? "typed_payload_contracts" : typedPayloadContractResult.rule,
    typedPayloadContractResult,
    checked,
    "Typed route, status, and rule-mutation payload contracts are coherent.",
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

  const riskResult = manifest.shapeId === "risk_or_skip"
    ? validateRiskOrSkip(manifest)
    : { ok: true } as const;
  if (!pushRule(
    riskResult.ok ? "risk_or_skip_envelope" : riskResult.rule,
    riskResult,
    optionChecked.length > 0 ? optionChecked : precommittedChecked,
    "Risk-or-skip envelopes expose bounded downside metadata when applicable.",
  )) {
    return rules;
  }

  const timedWindowResult = manifest.shapeId === "timed_window_menu"
    ? validateTimedWindowMenu(manifest)
    : { ok: true } as const;
  if (!pushRule(
    timedWindowResult.ok ? "timed_window_menu" : timedWindowResult.rule,
    timedWindowResult,
    optionChecked,
    "Timed window menus use multi-battle, play-changing rewards when applicable.",
  )) {
    return rules;
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

  const treeResult = definition.topology === "decision_tree"
    ? validateDecisionTree(manifest, context, generatedObjects)
    : { ok: true } as const;
  if (!pushRule(
    treeResult.ok ? "decision_tree_invariants" : treeResult.rule,
    treeResult,
    treeChecked.length > 0 ? treeChecked : checked,
    "Decision-tree topology is complete and legal when applicable.",
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

  const wagerResult = manifest.shapeId === "single_wager"
    ? validateSingleWager(manifest)
    : { ok: true } as const;
  if (!pushRule(
    wagerResult.ok ? "single_wager_envelope" : wagerResult.rule,
    wagerResult,
    checked,
    "Single wager options expose stakes, odds, and committed roll metadata when applicable.",
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

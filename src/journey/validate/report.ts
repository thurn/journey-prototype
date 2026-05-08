import type {
  JourneyManifest,
  TargetResolutionMetadata,
  ValidationCheckedPayload,
  ValidationReport,
  ValidationRuleOutcome,
} from "../manifest.js";
import { isRecord } from "./guards.js";
import type { ValidationResult } from "./result.js";

export function targetResolutionFromDebug(debug: Record<string, unknown> | undefined): TargetResolutionMetadata | undefined {
  const targetResolution = debug?.targetResolution;

  return isRecord(targetResolution) &&
    typeof targetResolution.selectorKind === "string" &&
    typeof targetResolution.sourcePool === "string" &&
    typeof targetResolution.candidateCount === "number" &&
    Array.isArray(targetResolution.selected)
    ? targetResolution as TargetResolutionMetadata
    : undefined;
}

export function payloadFamilyFor(manifest: JourneyManifest): string {
  return manifest.debug.debugPayload?.familyId ?? "adapter";
}

export function manifestCheckedPayloads(manifest: JourneyManifest): ValidationCheckedPayload[] {
  const payloadFamily = payloadFamilyFor(manifest);
  const checked: ValidationCheckedPayload[] = [
    {
      path: "$",
      scope: "manifest",
      shapeId: manifest.shapeId,
      payloadFamily,
    },
    ...manifest.options.map((option, index) => ({
      path: `$.options[${
        isRecord(option) && typeof option.number === "number"
          ? option.number - 1
          : index
      }]`,
      scope: "option" as const,
      ...(isRecord(option) && typeof option.number === "number" ? { optionNumber: option.number } : {}),
      shapeId: manifest.shapeId,
      payloadFamily,
    })),
  ];

  if (manifest.tree) {
    for (const node of manifest.tree.nodes) {
      for (const branch of node.branches) {
        checked.push({
          path: `$.tree.nodes.${node.id}.branches.${branch.id}`,
          scope: "tree_branch",
          shapeId: manifest.shapeId,
          payloadFamily,
        });

        if (branch.terminal) {
          checked.push({
            path: `$.tree.nodes.${node.id}.branches.${branch.id}.terminal`,
            scope: "tree_terminal",
            shapeId: manifest.shapeId,
            payloadFamily,
          });
        }
      }
    }
  }

  if (manifest.rewardPool) {
    checked.push({
      path: "$.rewardPool",
      scope: "reward_pool",
      shapeId: manifest.shapeId,
      payloadFamily,
    });
  }

  checked.push({
    path: "$.precommitted",
    scope: "precommitted",
    shapeId: manifest.shapeId,
    payloadFamily,
  });

  return checked;
}

export function resultToOutcome(
  ruleId: string,
  result: ValidationResult,
  checked: ValidationCheckedPayload[],
  passMessage: string,
): ValidationRuleOutcome {
  const targetResolution = !result.ok ? targetResolutionFromDebug(result.debug) : undefined;
  const checkedWithTarget = targetResolution
    ? checked.map((entry) => ({ ...entry, targetResolution }))
    : checked;

  return result.ok
    ? {
        ruleId,
        severity: "error",
        status: "pass",
        message: passMessage,
        checked,
      }
    : {
        ruleId: result.rule,
        severity: "error",
        status: "fail",
        message: result.message,
        checked: checkedWithTarget,
        ...(result.debug ? { debug: result.debug } : {}),
      };
}

export function buildReport(rules: ValidationRuleOutcome[]): ValidationReport {
  const firstFailure = rules.find((rule) => rule.status === "fail");

  return {
    ok: firstFailure === undefined,
    passed: rules.filter((rule) => rule.status === "pass").length,
    failed: rules.filter((rule) => rule.status === "fail").length,
    ...(firstFailure
      ? {
          firstFailure: {
            ruleId: firstFailure.ruleId,
            message: firstFailure.message,
            severity: firstFailure.severity,
            checked: firstFailure.checked,
          },
        }
      : {}),
    rules,
  };
}

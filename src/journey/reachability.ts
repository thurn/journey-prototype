import type {
  BoundedDuration,
  DelayedHookOperation,
  FeatureReachabilityDecision,
  JourneyManifest,
  JourneyOperation,
  ReachabilityEvidence,
  ReachabilityMetadata,
  TargetSelector,
} from "./manifest.js";
import { getShapeDefinition } from "./shapes.js";

type OperationEntry = {
  path: string;
  operation: JourneyOperation;
};

function addEvidence(
  evidence: ReachabilityEvidence[],
  entry: OperationEntry,
  category: ReachabilityEvidence["category"],
  family: string | undefined,
  detail?: string,
): void {
  if (!family) {
    return;
  }

  evidence.push({
    category,
    family,
    path: entry.path,
    operationId: entry.operation.operationId,
    operationKind: entry.operation.operationKind,
    role: entry.operation.role,
    ...(detail ? { detail } : {}),
  });
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function operationEntries(manifest: JourneyManifest): OperationEntry[] {
  const optionOperations = manifest.options.flatMap((option) =>
    option.operations.map((operation, index) => ({
      path: `options.${option.number}.operations.${index}`,
      operation,
    })),
  );
  const treeOperations =
    manifest.tree?.nodes.flatMap((node) =>
      node.branches.flatMap((branch) => [
        ...branch.operations.map((operation, index) => ({
          path: `tree.${node.id}.${branch.id}.operations.${index}`,
          operation,
        })),
        ...(branch.terminal?.operations.map((operation, index) => ({
          path: `tree.${node.id}.${branch.id}.terminal.operations.${index}`,
          operation,
        })) ?? []),
      ]),
    ) ?? [];
  const rewardPoolOperations =
    manifest.rewardPool?.operations.map((operation, index) => ({
      path: `rewardPool.operations.${index}`,
      operation,
    })) ?? [];
  const precommittedOperations =
    manifest.precommitted.operations?.map((operation, index) => ({
      path: `precommitted.operations.${index}`,
      operation,
    })) ?? [];

  return [
    ...optionOperations,
    ...treeOperations,
    ...rewardPoolOperations,
    ...precommittedOperations,
  ];
}

function selectorFamily(selector: TargetSelector | undefined): string | undefined {
  if (!selector || selector.selectorKind === "none") {
    return undefined;
  }

  return `${selector.selectorKind}:${selector.selection}`;
}

function sourceSelectorFamily(selector: TargetSelector | undefined): string | undefined {
  if (!selector || selector.selectorKind === "none" || !("source" in selector)) {
    return undefined;
  }

  return selector.source ? `${selector.selectorKind}:source:${selector.source}` : undefined;
}

function durationFamily(duration: BoundedDuration | undefined): string | undefined {
  if (!duration) {
    return undefined;
  }

  return duration.count === undefined
    ? `duration:${duration.durationKind}`
    : `duration:${duration.durationKind}:${duration.count}`;
}

function operationPayloadFamilies(operation: JourneyOperation): string[] {
  switch (operation.operationKind) {
    case "cost":
      return [
        "resource_cost",
        `resource_cost:${operation.resource}`,
        operation.resourceSemantics
          ? `resource_amount:${operation.resourceSemantics.amountKind}`
          : "resource_amount:fixed",
      ];
    case "reward":
      return [
        operation.rewardKind,
        operation.resourceSemantics
          ? `resource_amount:${operation.resourceSemantics.amountKind}`
          : undefined,
      ].filter((family): family is string => family !== undefined);
    case "burden":
      return [operation.burdenKind];
    case "route_edit":
      return ["route_edit", `route_edit:${operation.editKind}`];
    case "delayed_hook":
      return [
        "delayed_hook",
        operation.hookKind ? `delayed_hook:${operation.hookKind}` : undefined,
      ].filter((family): family is string => family !== undefined);
    case "paired_return":
      return [
        "paired_return",
        operation.contract?.returnScene.returnSceneKind
          ? `paired_return:${operation.contract.returnScene.returnSceneKind}`
          : undefined,
      ].filter((family): family is string => family !== undefined);
    case "random_envelope":
    case "reveal_envelope":
      return [
        operation.operationKind,
        operation.envelopeKind ? `random:${operation.envelopeKind}` : undefined,
      ].filter((family): family is string => family !== undefined);
    case "status":
      return ["status", `status:${operation.statusKind}`];
    case "generated_object":
      return [
        "generated_object",
        `generated_object:${operation.generatedObject.generatedObjectKind}`,
      ];
    case "target":
      return ["target_selector"];
    case "validation_requirement":
      return ["validation_requirement", operation.requirementKind];
  }
}

function operationTimingFamilies(operation: JourneyOperation): string[] {
  const timing = operation.timing;
  const families = timing
    ? [
        timing.timingKind,
        timing.timingKind === "delayed" ? `delayed:${timing.trigger}` : undefined,
        timing.timingKind === "route" ? `route:${timing.scope}` : undefined,
      ]
    : ["immediate"];

  if (operation.operationKind === "delayed_hook") {
    families.push(
      `trigger:${operation.triggerSelector?.triggerKind ?? "unknown"}`,
      durationFamily(operation.duration),
    );
  }

  if (operation.operationKind === "paired_return" && operation.contract) {
    families.push(
      `trigger:${operation.contract.returnScene.triggerSelector.triggerKind}`,
      durationFamily(operation.contract.returnScene.duration),
    );
  }

  return families.filter((family): family is string => family !== undefined);
}

function addGeneratedObjectEvidence(
  manifest: JourneyManifest,
  evidence: ReachabilityEvidence[],
): void {
  for (const [index, generatedObject] of manifest.generatedObjects.entries()) {
    evidence.push({
      category: "payload",
      family: "generated_object",
      path: `generatedObjects.${index}`,
      detail: generatedObject.generatedObjectKind,
    });
    evidence.push({
      category: "payload",
      family: `generated_object:${generatedObject.generatedObjectKind}`,
      path: `generatedObjects.${index}`,
      detail: generatedObject.name,
    });

    const duration = durationFamily(generatedObject.duration);
    if (duration) {
      evidence.push({
        category: "timing",
        family: duration,
        path: `generatedObjects.${index}`,
        detail: generatedObject.name,
      });
    }
  }
}

function addDelayedRewardSelectorEvidence(
  entry: OperationEntry,
  operation: DelayedHookOperation,
  evidence: ReachabilityEvidence[],
): void {
  for (const [index, rewardOperation] of (operation.rewardOperations ?? []).entries()) {
    const nestedEntry = {
      path: `${entry.path}.rewardOperations.${index}`,
      operation: rewardOperation,
    };

    for (const family of operationPayloadFamilies(rewardOperation)) {
      addEvidence(evidence, nestedEntry, "payload", family);
    }

    addEvidence(
      evidence,
      nestedEntry,
      "selector",
      selectorFamily(rewardOperation.targetSelector),
    );
    addEvidence(
      evidence,
      nestedEntry,
      "selector",
      sourceSelectorFamily(rewardOperation.targetSelector),
    );
  }
}

function featureDecisionsForManifest(
  manifest: JourneyManifest,
  evidence: readonly ReachabilityEvidence[],
): FeatureReachabilityDecision[] {
  const pathsWithTargetResolution = new Set(
    operationEntries(manifest)
      .filter((entry) => entry.operation.targetResolution)
      .map((entry) => entry.path),
  );
  const contracts = manifest.debug.symmetryContracts ?? [];
  const evidenceFor = (predicate: (entry: ReachabilityEvidence) => boolean) =>
    evidence.filter(predicate);
  const decision = (
    family: string,
    matches: readonly ReachabilityEvidence[],
    selectedReason: string,
    skippedReason: string,
  ): FeatureReachabilityDecision => ({
    family,
    status: matches.length > 0 ? "selected" : "skipped",
    reason: matches.length > 0 ? selectedReason : skippedReason,
    evidencePaths: sortedUnique(matches.map((entry) => entry.path)).slice(0, 8),
    evidenceFamilies: sortedUnique(matches.map((entry) => entry.family)).slice(0, 12),
  });
  const targetResolutionMatches: ReachabilityEvidence[] = [...pathsWithTargetResolution].map((path) => ({
    category: "selector",
    family: "target_resolution_metadata",
    path,
  }));
  const symmetryMatches: ReachabilityEvidence[] = contracts.map((contract, index) => ({
    category: "payload",
    family: `symmetry:${contract.contractKind}`,
    path: `debug.symmetryContracts.${index}`,
    detail: `${contract.sharedProperty} -> ${contract.variedProperty}`,
  }));

  return [
    decision(
      "resource_semantics",
      evidenceFor((entry) =>
        entry.family.startsWith("resource_amount:") && entry.family !== "resource_amount:fixed"
      ),
      "Selected because one or more operations use non-fixed resource amount semantics.",
      "Skipped because this manifest only uses fixed resource amounts or no resource operations.",
    ),
    decision(
      "named_object_operations",
      evidenceFor((entry) =>
        entry.category === "selector" &&
        (
          entry.family === "card:exact" ||
          entry.family === "dreamsign:exact" ||
          entry.family === "bane:exact" ||
          entry.family === "status:exact" ||
          entry.family === "generated_object:exact"
        )
      ),
      "Selected because typed operations resolve exact visible object selectors.",
      "Skipped because no typed operation resolves an exact named object selector.",
    ),
    decision(
      "target_resolution_metadata",
      targetResolutionMatches,
      "Selected because operations carry resolved target metadata with candidate counts.",
      "Skipped because no operation needed resolved target metadata.",
    ),
    decision(
      "route_effects",
      evidenceFor((entry) => entry.family === "route_edit" || entry.family.startsWith("route_edit:")),
      "Selected because route edit operations are present.",
      "Skipped because no route edit operation is present.",
    ),
    decision(
      "statuses",
      evidenceFor((entry) => entry.family === "status" || entry.family.startsWith("status:")),
      "Selected because status or rule-mutation operations are present.",
      "Skipped because no status operation is present.",
    ),
    decision(
      "random_envelopes",
      evidenceFor((entry) =>
        entry.family === "random_envelope" ||
        entry.family === "reveal_envelope" ||
        entry.family.startsWith("random:")
      ),
      "Selected because a random or reveal envelope is precommitted in structured operations.",
      "Skipped because no random or reveal envelope operation is present.",
    ),
    decision(
      "delayed_hooks",
      evidenceFor((entry) => entry.family === "delayed_hook" || entry.family.startsWith("delayed_hook:")),
      "Selected because delayed hook contracts are present.",
      "Skipped because no delayed hook contract is present.",
    ),
    decision(
      "paired_returns",
      evidenceFor((entry) => entry.family === "paired_return" || entry.family.startsWith("paired_return:")),
      "Selected because paired-return contracts are present.",
      "Skipped because no paired-return contract is present.",
    ),
    decision(
      "generated_objects",
      evidenceFor((entry) => entry.family === "generated_object" || entry.family.startsWith("generated_object:")),
      "Selected because manifest-local generated object definitions or operations are present.",
      "Skipped because no manifest-local generated object is present.",
    ),
    decision(
      "shared_symmetry_contracts",
      symmetryMatches,
      "Selected because the fill recorded a shared-property symmetry contract.",
      "Skipped because this shape/fill did not record a symmetry contract.",
    ),
  ];
}

export function reachabilityMetadataForManifest(
  manifest: JourneyManifest,
): ReachabilityMetadata {
  const evidence: ReachabilityEvidence[] = [];

  for (const entry of operationEntries(manifest)) {
    for (const family of operationPayloadFamilies(entry.operation)) {
      addEvidence(evidence, entry, "payload", family);
    }

    addEvidence(
      evidence,
      entry,
      "selector",
      selectorFamily(entry.operation.targetSelector),
    );
    addEvidence(
      evidence,
      entry,
      "selector",
      sourceSelectorFamily(entry.operation.targetSelector),
    );

    for (const family of operationTimingFamilies(entry.operation)) {
      addEvidence(evidence, entry, "timing", family);
    }

    if (entry.operation.operationKind === "delayed_hook") {
      addDelayedRewardSelectorEvidence(entry, entry.operation, evidence);
    }
  }

  addGeneratedObjectEvidence(manifest, evidence);

  const shapeTopology = getShapeDefinition(manifest.shapeId).topology;

  return {
    evidenceSource: "structured_manifest_operations",
    generatorMode: "normal_generation",
    shapeTopology,
    shapeId: manifest.shapeId,
    payloadFamilies: sortedUnique(
      evidence
        .filter((entry) => entry.category === "payload")
        .map((entry) => entry.family),
    ),
    selectorFamilies: sortedUnique(
      evidence
        .filter((entry) => entry.category === "selector")
        .map((entry) => entry.family),
    ),
    timingFamilies: sortedUnique(
      evidence
        .filter((entry) => entry.category === "timing")
        .map((entry) => entry.family),
    ),
    featureDecisions: featureDecisionsForManifest(manifest, evidence),
    evidence,
  };
}

export function withReachabilityMetadata(
  manifest: JourneyManifest,
): JourneyManifest {
  return {
    ...manifest,
    debug: {
      ...manifest.debug,
      reachability: reachabilityMetadataForManifest(manifest),
    },
  };
}

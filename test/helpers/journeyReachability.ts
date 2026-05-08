import type { JourneyManifest } from "../../src/journey/manifest.js";
import { reachabilityMetadataForManifest } from "../../src/journey/reachability.js";

export type ReachabilityFamilyRequirement = {
  payloadFamilies?: readonly string[];
  selectorFamilies?: readonly string[];
  timingFamilies?: readonly string[];
};

export function reachabilityFor(manifest: JourneyManifest) {
  return manifest.debug.reachability ?? reachabilityMetadataForManifest(manifest);
}

export function manifestMatchesReachabilityFamilies(
  manifest: JourneyManifest,
  requirement: ReachabilityFamilyRequirement,
): boolean {
  const reachability = reachabilityFor(manifest);

  return (
    (requirement.payloadFamilies ?? []).every((family) =>
      reachability.payloadFamilies.includes(family),
    ) &&
    (requirement.selectorFamilies ?? []).every((family) =>
      reachability.selectorFamilies.includes(family),
    ) &&
    (requirement.timingFamilies ?? []).every((family) =>
      reachability.timingFamilies.includes(family),
    )
  );
}

export function findReachabilityEvidence(
  manifests: readonly JourneyManifest[],
  requirement: ReachabilityFamilyRequirement,
): JourneyManifest[] {
  return manifests.filter((manifest) =>
    manifestMatchesReachabilityFamilies(manifest, requirement),
  );
}

export function batchReachabilityFamilies(manifests: readonly JourneyManifest[]) {
  return {
    payloadFamilies: [
      ...new Set(
        manifests.flatMap((manifest) => reachabilityFor(manifest).payloadFamilies),
      ),
    ].sort((left, right) => left.localeCompare(right, "en-US")),
    selectorFamilies: [
      ...new Set(
        manifests.flatMap((manifest) => reachabilityFor(manifest).selectorFamilies),
      ),
    ].sort((left, right) => left.localeCompare(right, "en-US")),
    timingFamilies: [
      ...new Set(
        manifests.flatMap((manifest) => reachabilityFor(manifest).timingFamilies),
      ),
    ].sort((left, right) => left.localeCompare(right, "en-US")),
  };
}

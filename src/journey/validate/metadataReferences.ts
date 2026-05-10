import type { JourneyContext } from "../../quest/context.js";
import { RENDERER_VERSION } from "../../render/theme.js";
import {
  EFFECT_CATALOG_VERSION,
  generatedObjectResolverPool,
  validateNamedReferences,
} from "../effects.js";
import type { JourneyManifest } from "../manifest.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "../manifest.js";
import { JOURNEY_SHAPE_CATALOG_VERSION } from "../shapes.js";
import { VALUE_MODEL_VERSION } from "../value.js";
import { isRecord, stringEntries } from "./guards.js";
import { fail, VALIDATION_CONTRACT_VERSION, type ValidationResult } from "./result.js";

export function validateVersionMetadata(manifest: JourneyManifest, context: JourneyContext): ValidationResult {
  if (!isRecord(manifest.versions)) {
    return fail("manifest_version_metadata", "Manifest version metadata is required");
  }

  const expected: JourneyManifest["versions"] = {
    contentVersion: context.contentVersion,
    shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    effectCatalogVersion: EFFECT_CATALOG_VERSION,
    valueModelVersion: VALUE_MODEL_VERSION,
    rendererVersion: RENDERER_VERSION,
    manifestContractVersion: MANIFEST_CONTRACT_VERSION,
    validationContractVersion: VALIDATION_CONTRACT_VERSION,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (manifest.versions[key as keyof JourneyManifest["versions"]] !== value) {
      return fail("manifest_version_metadata", `Manifest version metadata ${key} must be ${value}`);
    }
  }

  return { ok: true };
}

export function validateReferences(manifest: JourneyManifest, context: JourneyContext): ValidationResult {
  const structuredReferences = collectStructuredReferences([
    Array.isArray(manifest.generatedObjects) ? manifest.generatedObjects : [],
    manifest.options,
    manifest.tree,
    manifest.rewardPool,
    manifest.precommitted,
  ]);
  const result = validateNamedReferences(context.content, {
    cards: [...manifest.references.cardIds, ...structuredReferences.cards],
    dreamsigns: [
      ...manifest.references.dreamsignIds,
      ...structuredReferences.dreamsigns,
    ],
    dreamcallers: [
      ...manifest.references.dreamcallerIds,
      ...structuredReferences.dreamcallers,
    ],
    banes: [...manifest.references.baneNames, ...structuredReferences.banes],
    rules: structuredReferences.rules,
  });

  if (!result.ok) {
    return fail("unresolved_reference", result.errors[0] ?? "Unresolved reference");
  }

  return { ok: true };
}

export function validateGeneratedObjectDefinitions(
  manifest: JourneyManifest,
  context: JourneyContext,
): ValidationResult {
  if (!Array.isArray(manifest.generatedObjects)) {
    return fail("invalid_generated_object_definition", "Generated object definitions must be an array");
  }

  const seen = new Set<string>();

  for (const generatedObject of generatedObjectResolverPool(manifest)) {
    if (!isRecord(generatedObject)) {
      return fail("invalid_generated_object_definition", "Generated object definitions must be structured records");
    }

    if (!generatedObject.generatedObjectId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(generatedObject.generatedObjectId)) {
      return fail("invalid_generated_object_id", "Generated object IDs must be stable kebab-case IDs");
    }

    if (seen.has(generatedObject.generatedObjectId)) {
      return fail("duplicate_generated_object_id", `Duplicate generated object ID: ${generatedObject.generatedObjectId}`);
    }
    seen.add(generatedObject.generatedObjectId);

    if (!["card", "dreamsign", "status", "transfiguration"].includes(generatedObject.generatedObjectKind)) {
      return fail("invalid_generated_object_kind", `Invalid generated object kind: ${generatedObject.generatedObjectKind}`);
    }

    if (typeof generatedObject.name !== "string" || generatedObject.name.trim().length === 0) {
      return fail("invalid_generated_object_name", `Generated object ${generatedObject.generatedObjectId} requires a display name`);
    }

    if (typeof generatedObject.objectType !== "string" || generatedObject.objectType.trim().length === 0) {
      return fail("invalid_generated_object_type", `Generated object ${generatedObject.generatedObjectId} requires an object type`);
    }

    if (typeof generatedObject.rulesText !== "string" || generatedObject.rulesText.trim().length < 10) {
      return fail("invalid_generated_object_rules", `Generated object ${generatedObject.generatedObjectId} requires compact rules text`);
    }

    if (!Array.isArray(generatedObject.tags) || generatedObject.tags.length === 0) {
      return fail("invalid_generated_object_tags", `Generated object ${generatedObject.generatedObjectId} requires tags`);
    }

    if (!isRecord(generatedObject.references)) {
      return fail("invalid_generated_object_references", `Generated object ${generatedObject.generatedObjectId} requires references`);
    }

    const referenceResult = validateNamedReferences(context.content, {
      cards: stringEntries(generatedObject.references.cards),
      dreamsigns: stringEntries(generatedObject.references.dreamsigns),
      dreamcallers: stringEntries(generatedObject.references.dreamcallers),
      banes: stringEntries(generatedObject.references.banes),
      rules: stringEntries(generatedObject.references.rules),
    });

    if (!referenceResult.ok) {
      return fail("generated_object_unresolved_reference", referenceResult.errors[0] ?? "Generated object reference is unresolved");
    }

    if (generatedObject.duration !== undefined) {
      if (
        !isRecord(generatedObject.duration) ||
        typeof generatedObject.duration.durationKind !== "string" ||
        typeof generatedObject.duration.label !== "string" ||
        (generatedObject.duration.count !== undefined &&
          (typeof generatedObject.duration.count !== "number" || generatedObject.duration.count < 1))
      ) {
        return fail("invalid_generated_object_duration", `Generated object ${generatedObject.generatedObjectId} has an invalid duration`);
      }
    }

    if (generatedObject.lifetime !== undefined) {
      const lifetime = generatedObject.lifetime;
      if (typeof lifetime === "string") {
        if (
          !["one_time", "temporary", "persistent", "until_returned", "journey_only"].includes(lifetime)
        ) {
          return fail("invalid_generated_object_lifetime", `Generated object ${generatedObject.generatedObjectId} has an invalid lifetime`);
        }
      } else if (
        !isRecord(lifetime) ||
        lifetime.kind !== "trigger_count" ||
        typeof lifetime.triggerKind !== "string" ||
        typeof lifetime.count !== "number" ||
        lifetime.count < 1
      ) {
        return fail("invalid_generated_object_lifetime", `Generated object ${generatedObject.generatedObjectId} has an invalid lifetime`);
      }
    }

    if (
      !isRecord(generatedObject.valueEstimate) ||
      typeof generatedObject.valueEstimate.convertedEssence !== "number" ||
      !["low", "medium", "high"].includes(String(generatedObject.valueEstimate.confidence)) ||
      typeof generatedObject.valueEstimate.basis !== "string"
    ) {
      return fail("invalid_generated_object_value", `Generated object ${generatedObject.generatedObjectId} requires value metadata`);
    }

    if (
      !isRecord(generatedObject.validation) ||
      generatedObject.validation.source !== "generated_manifest_local" ||
      !["validated", "unvalidated"].includes(String(generatedObject.validation.status)) ||
      !Array.isArray(generatedObject.validation.ruleIds)
    ) {
      return fail("invalid_generated_object_validation", `Generated object ${generatedObject.generatedObjectId} requires validation metadata`);
    }
  }

  return { ok: true };
}

export function collectStructuredReferences(value: unknown): {
  cards: string[];
  dreamsigns: string[];
  dreamcallers: string[];
  banes: string[];
  rules: string[];
} {
  const references = {
    cards: [] as string[],
    dreamsigns: [] as string[],
    dreamcallers: [] as string[],
    banes: [] as string[],
    rules: [] as string[],
  };

  function visit(nested: unknown): void {
    if (Array.isArray(nested)) {
      nested.forEach(visit);
      return;
    }

    if (!isRecord(nested)) {
      return;
    }

    if (typeof nested.selectorKind === "string") {
      if (nested.selectorKind === "card") {
        references.cards.push(...stringEntries(nested.ids), ...stringEntries(nested.names));
      } else if (nested.selectorKind === "dreamsign") {
        references.dreamsigns.push(...stringEntries(nested.ids), ...stringEntries(nested.names));
      } else if (nested.selectorKind === "dreamcaller") {
        references.dreamcallers.push(...stringEntries(nested.ids), ...stringEntries(nested.names));
      } else if (nested.selectorKind === "bane") {
        references.banes.push(...stringEntries(nested.names));
      } else if (nested.selectorKind === "route_site") {
        references.rules.push(...stringEntries(nested.siteTypes));
        if (typeof nested.siteType === "string") {
          references.rules.push(nested.siteType);
        }
      } else if (nested.selectorKind === "status") {
        if (typeof nested.scope === "string") {
          references.rules.push(nested.scope);
        }
      } else if (nested.selectorKind === "generated_object") {
        if (typeof nested.generatedObjectKind === "string") {
          references.rules.push(nested.generatedObjectKind);
        }
        if (typeof nested.generatedObjectReferenceKind === "string") {
          references.rules.push(nested.generatedObjectReferenceKind);
        }
      }
    }

    for (const [key, entry] of Object.entries(nested)) {
      if (Array.isArray(entry)) {
        if (key === "cards") {
          references.cards.push(...stringEntries(entry));
        } else if (key === "dreamsigns") {
          references.dreamsigns.push(...stringEntries(entry));
        } else if (key === "dreamcallers") {
          references.dreamcallers.push(...stringEntries(entry));
        } else if (key === "banes") {
          references.banes.push(...stringEntries(entry));
        } else if (key === "rules") {
          references.rules.push(...stringEntries(entry));
        }
      }

      if (typeof entry === "string") {
        if (
          key === "cardName" ||
          key === "cardId" ||
          key === "oldCardName" ||
          key === "oldCardId" ||
          key === "newCardName" ||
          key === "newCardId" ||
          key === "targetCardName" ||
          key === "targetCardId" ||
          key === "resultCardName" ||
          key === "resultCardId" ||
          key === "secondTargetCardName" ||
          key === "secondTargetCardId"
        ) {
          references.cards.push(entry);
        } else if (
          key === "dreamsignName" ||
          key === "dreamsignId" ||
          key === "newDreamsignName" ||
          key === "newDreamsignId" ||
          key === "targetDreamsignName" ||
          key === "targetDreamsignId" ||
          key === "resultDreamsignName" ||
          key === "resultDreamsignId" ||
          key === "giveDreamsignName" ||
          key === "giveDreamsignId" ||
          key === "receiveDreamsignName" ||
          key === "receiveDreamsignId"
        ) {
          references.dreamsigns.push(entry);
        } else if (key === "dreamcallerName" || key === "dreamcallerId") {
          references.dreamcallers.push(entry);
        } else if (key === "baneName" || key === "newBaneName") {
          references.banes.push(entry);
        } else if (
          key === "transfigurationName" ||
          key === "keyword" ||
          key === "fromSite" ||
          key === "toSite" ||
          key === "siteType" ||
          key === "statusScope" ||
          key === "generatedObjectKind" ||
          key === "generatedObjectReferenceKind"
        ) {
          references.rules.push(entry);
        }
      }

      visit(entry);
    }
  }

  visit(value);
  return references;
}

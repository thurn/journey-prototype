import type { JourneyContext } from "../../quest/context.js";
import { stableStringify } from "../../util/stableJson.js";
import {
  isImmediateCostPayable,
  type ImmediateCost,
} from "../effects.js";
import type {
  JourneyManifest,
  JourneyOperation,
  JourneyOption,
} from "../manifest.js";
import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

export function asImmediateCost(value: unknown): ImmediateCost | null {
  if (!isRecord(value)) {
    return null;
  }

  const amount = typeof value.amount === "number" ? value.amount : 0;

  if (value.kind === "essence") {
    return { essence: amount };
  }

  if (value.kind === "omens") {
    return { omens: amount };
  }

  return null;
}

export function stringEntries(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function immediateCostFromOperation(operation: JourneyOperation): ImmediateCost | null {
  if (operation.operationKind !== "cost") {
    return null;
  }

  return operation.resource === "essence"
    ? { essence: operation.amount }
    : { omens: operation.amount };
}

export function validateCosts(option: JourneyOption, context: JourneyContext): ValidationResult {
  const costOperations = option.operations
    .map(immediateCostFromOperation)
    .filter((entry): entry is ImmediateCost => entry !== null);

  for (const immediateCost of costOperations) {
    if (!isImmediateCostPayable(context.state.quest, immediateCost)) {
      return fail("unpayable_immediate_cost", `Option ${option.number} has an unpayable immediate cost`);
    }
  }

  for (const entry of option.costs) {
    const immediateCost = asImmediateCost(entry);

    if (immediateCost && !isImmediateCostPayable(context.state.quest, immediateCost)) {
      return fail("unpayable_immediate_cost", `Option ${option.number} has an unpayable immediate cost`);
    }
  }

  return { ok: true };
}

function namedDreamsignPurchaseName(option: JourneyOption): string | undefined {
  const purchase = option.operations.find((operation) =>
    operation.operationKind === "reward" &&
    operation.rewardKind === "dreamsign_purchase"
  );

  return typeof purchase?.payload.dreamsignName === "string"
    ? purchase.payload.dreamsignName
    : undefined;
}

function costSignature(option: JourneyOption): string | undefined {
  const costOperation = option.operations.find((operation) =>
    operation.operationKind === "cost"
  );

  if (!costOperation || costOperation.operationKind !== "cost") {
    return undefined;
  }

  return stableStringify({
    resource: costOperation.resource,
    amount: costOperation.amount,
    resourceSemantics: costOperation.resourceSemantics,
  });
}

export function validateNamedDreamsignShopRowCosts(
  manifest: JourneyManifest,
): ValidationResult {
  if (manifest.shapeId !== "shop_row" || manifest.options.length < 2) {
    return { ok: true };
  }

  const purchaseNames = manifest.options.map(namedDreamsignPurchaseName);

  if (purchaseNames.some((name) => name === undefined)) {
    return { ok: true };
  }

  const uniqueNames = new Set(purchaseNames);

  if (uniqueNames.size !== purchaseNames.length) {
    return fail(
      "duplicate_named_dreamsign_shop_good",
      "Named Dreamsign shop rows must sell different named goods",
    );
  }

  const costSignatures = manifest.options.map(costSignature);

  if (costSignatures.some((signature) => signature === undefined)) {
    return fail(
      "missing_named_dreamsign_shop_cost",
      "Named Dreamsign shop rows must attach a structured cost to each purchase",
    );
  }

  return { ok: true };
}

import { stableStringify } from "../../../util/stableJson.js";
import type { JourneyManifest, JourneyOption } from "../../manifest.js";
import { fail, type ValidationResult } from "../../validate/result.js";

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
  if (manifest.options.length < 2) {
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

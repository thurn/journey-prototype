import type { JourneyContext } from "../../quest/context.js";
import {
  resolveDreamsignTargets,
  type DreamsignTargetPredicate,
} from "../effects.js";
import { isRecord } from "./guards.js";
import { fail, type ValidationResult } from "./result.js";

export function dreamsignPredicateFromPayload(
  payload: Record<string, unknown>,
  fields: { id: string; name: string; source?: string },
): DreamsignTargetPredicate {
  const source = fields.source && (
    payload[fields.source] === "catalog" ||
    payload[fields.source] === "active" ||
    payload[fields.source] === "pool"
  )
    ? payload[fields.source] as DreamsignTargetPredicate["source"]
    : undefined;

  return {
    ...(source ? { source } : {}),
    ...(typeof payload[fields.id] === "string" ? { ids: [payload[fields.id] as string] } : {}),
    ...(typeof payload[fields.name] === "string" ? { names: [payload[fields.name] as string] } : {}),
  };
}

export function resolveDreamsignPayloadField(
  payload: Record<string, unknown>,
  context: JourneyContext,
  fields: { id: string; name: string; source?: string },
) {
  const predicate = dreamsignPredicateFromPayload(payload, fields);

  return resolveDreamsignTargets(context.content, context.state.quest, predicate);
}

export function validateDreamsignPayload(
  payload: Record<string, unknown>,
  context: JourneyContext,
  optionNumber: number,
): ValidationResult {
  const kind = typeof payload.kind === "string" ? payload.kind : "";

  if (!kind.startsWith("dreamsign_")) {
    return { ok: true };
  }

  const sourcePredicate = dreamsignPredicateFromPayload(payload, {
    id: "dreamsignId",
    name: "dreamsignName",
    source: "source",
  });
  const sourceMatches = sourcePredicate.ids || sourcePredicate.names
    ? resolveDreamsignTargets(context.content, context.state.quest, sourcePredicate)
    : [];

  if (
    [
      "dreamsign_purchase",
      "dreamsign_gain",
      "dreamsign_loss",
      "dreamsign_purge",
      "dreamsign_duplicate",
      "dreamsign_copy_gain",
      "dreamsign_temporary_grant",
      "dreamsign_transform",
      "dreamsign_pool_edit",
      "dreamsign_trigger_counter",
      "dreamsign_random_reward",
      "dreamsign_trade_hook",
    ].includes(kind) &&
    sourceMatches.length === 0
  ) {
    return fail("dreamsign_target_unavailable", `Option ${optionNumber} ${kind} requires a resolvable Dreamsign target`);
  }

  if (kind === "dreamsign_transform") {
    const resultPredicate = dreamsignPredicateFromPayload(payload, {
      id: "newDreamsignId",
      name: "newDreamsignName",
      source: "resultSource",
    });
    const resultMatches = resolveDreamsignTargets(context.content, context.state.quest, resultPredicate);

    if (resultMatches.length === 0) {
      return fail("dreamsign_transform_destination_unavailable", `Option ${optionNumber} Dreamsign transformation requires a resolvable destination`);
    }

    if (sourceMatches[0]?.id === resultMatches[0]?.id) {
      return fail("dreamsign_transform_same_target", `Option ${optionNumber} Dreamsign transformation requires distinct source and destination`);
    }
  }

  if (
    (kind === "dreamsign_duplicate" || kind === "dreamsign_copy_gain") &&
    (typeof payload.copyCount !== "number" || payload.copyCount < 1)
  ) {
    return fail("dreamsign_copy_count_invalid", `Option ${optionNumber} Dreamsign copy operation requires a positive copy count`);
  }

  if (
    kind === "dreamsign_temporary_grant" &&
    (typeof payload.duration !== "string" || payload.duration.length === 0)
  ) {
    return fail("dreamsign_temporary_duration_missing", `Option ${optionNumber} temporary Dreamsign grant requires a duration`);
  }

  if (kind === "dreamsign_pool_edit") {
    const operation = typeof payload.poolOperation === "string" ? payload.poolOperation : "";
    const resultPredicate = dreamsignPredicateFromPayload(payload, {
      id: "resultDreamsignId",
      name: "resultDreamsignName",
      source: "resultSource",
    });
    const resultMatches = resolveDreamsignTargets(context.content, context.state.quest, resultPredicate);

    if (!["add", "remove", "replace"].includes(operation)) {
      return fail("dreamsign_pool_edit_operation_invalid", `Option ${optionNumber} Dreamsign pool edit requires add, remove, or replace`);
    }

    if (resultMatches.length === 0) {
      return fail("dreamsign_pool_edit_target_unavailable", `Option ${optionNumber} Dreamsign pool edit requires a resolvable result`);
    }
  }

  if (
    kind === "dreamsign_trigger_counter" &&
    (typeof payload.trigger !== "string" || typeof payload.count !== "number" || payload.count < 1)
  ) {
    return fail("dreamsign_trigger_counter_invalid", `Option ${optionNumber} Dreamsign trigger counter requires a trigger and positive count`);
  }

  if (
    kind === "dreamsign_random_reward" &&
    (!Array.isArray(payload.rewardPoolDreamsignIds) || payload.rewardPoolDreamsignIds.length === 0)
  ) {
    return fail("dreamsign_random_reward_pool_missing", `Option ${optionNumber} random Dreamsign reward requires a source pool`);
  }

  if (kind === "dreamsign_random_reward") {
    const rewardPoolDreamsignIds = payload.rewardPoolDreamsignIds as unknown[];

    if (
      !rewardPoolDreamsignIds.every((entry) =>
        typeof entry === "string" &&
        resolveDreamsignTargets(context.content, context.state.quest, {
          source: "pool",
          ids: [entry],
        }).length > 0
      )
    ) {
      return fail("dreamsign_random_reward_pool_unavailable", `Option ${optionNumber} random Dreamsign reward source pool must contain resolvable pool Dreamsigns`);
    }
  }

  if (
    kind === "dreamsign_trade_hook" &&
    (typeof payload.obligation !== "string" ||
      typeof payload.giveDreamsignName !== "string" ||
      typeof payload.receiveDreamsignName !== "string")
  ) {
    return fail("dreamsign_trade_hook_obligation_missing", `Option ${optionNumber} Dreamsign trade hook requires explicit give and receive obligations`);
  }

  if (kind === "dreamsign_trade_hook") {
    const giveMatches = resolveDreamsignPayloadField(payload, context, {
      id: "giveDreamsignId",
      name: "giveDreamsignName",
      source: "source",
    });
    const receiveMatches = resolveDreamsignPayloadField(payload, context, {
      id: "receiveDreamsignId",
      name: "receiveDreamsignName",
      source: "resultSource",
    });
    const resultMatches = resolveDreamsignPayloadField(payload, context, {
      id: "resultDreamsignId",
      name: "resultDreamsignName",
      source: "resultSource",
    });

    if (giveMatches.length === 0) {
      return fail("dreamsign_trade_hook_give_unavailable", `Option ${optionNumber} Dreamsign trade hook requires a resolvable give Dreamsign`);
    }

    if (receiveMatches.length === 0 || resultMatches.length === 0) {
      return fail("dreamsign_trade_hook_receive_unavailable", `Option ${optionNumber} Dreamsign trade hook requires a resolvable receive Dreamsign`);
    }
  }

  return { ok: true };
}

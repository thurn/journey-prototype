// src/journey/shapes/random_rewards/fill.ts
import type { JourneyOption } from "../../manifest.js";
import { REWARDS } from "../../shared/rewards.js";
import { weightedChoice, type DrawContext } from "../../../util/rng.js";
import type { Reward, TemplateParams } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const TOLERANCE_LO_INITIAL = 0.6;
const TOLERANCE_HI_INITIAL = 1.4;
const TOLERANCE_WIDEN_STEP = 0.2;

type RolledReward = { template: Reward; params: TemplateParams; cec: number };

function emptyOption(
  number: number,
  text: string,
  symbols: readonly string[],
  cec: number,
  rewardTemplateIds: readonly string[],
): JourneyOption {
  return {
    number,
    symbols: [...symbols],
    text,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: cec,
    pickBehavior: "record_and_generate_next",
    rewardTemplateIds: [...rewardTemplateIds],
  };
}

function subTemplateIdsOf(rolled: { template: Reward; params: TemplateParams }): readonly string[] {
  // For meta_gain_2_rewards, params has subIds; for others, none.
  if (rolled.template.id === "meta_gain_2_rewards") {
    const p = rolled.params as { subIds: readonly [string, string] };
    return p.subIds;
  }
  return [];
}

function consumedIds(rolled: { template: Reward; params: TemplateParams }): readonly string[] {
  return [rolled.template.id, ...subTemplateIdsOf(rolled)];
}

function rollOneCandidate(
  draw: DrawContext,
  label: string,
  pool: readonly Reward[],
  ctx: import("../../../quest/context.js").JourneyContext,
): RolledReward | undefined {
  const viable: Array<{ template: Reward; params: TemplateParams; cec: number; weight: number }> = [];
  for (const template of pool) {
    const params = template.rollParams(ctx, { ...draw, selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length });
    if (!template.viable(params, ctx)) continue;
    const cec = template.cec(params, ctx);
    // Reject degenerate (CEC<=0) anchors so the tolerance band has a meaningful scale.
    if (cec <= 0) continue;
    const rolled = { template, params, cec };
    viable.push({ ...rolled, weight: template.weight });
  }
  if (viable.length === 0) return undefined;
  return weightedChoice(draw, label, viable.map((v) => ({ item: v, weight: v.weight })));
}

function meetsDistinctness(
  rolled: { template: Reward; params: TemplateParams },
  used: ReadonlySet<string>,
): boolean {
  for (const id of consumedIds(rolled)) {
    if (used.has(id)) return false;
  }
  return true;
}

export function randomRewardsFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const used = new Set<string>();

  const row1 = rollOneCandidate(drawContext, "rr:row1", REWARDS, context);
  if (!row1) {
    throw new Error("random_rewards fill could not roll a viable first row");
  }
  for (const id of consumedIds(row1)) used.add(id);
  const anchor = row1.cec;

  function rollFurtherRow(rowIndex: number): RolledReward {
    let lo = TOLERANCE_LO_INITIAL;
    let hi = TOLERANCE_HI_INITIAL;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const pool = REWARDS.filter((r) => !used.has(r.id));
      const candidates: Array<{ template: Reward; params: TemplateParams; cec: number; weight: number }> = [];
      for (const template of pool) {
        const params = template.rollParams(context, {
          ...drawContext,
          sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
          selectionAttempt: ((drawContext.selectionAttempt ?? 0) * 100) + attempt,
        });
        if (!template.viable(params, context)) continue;
        const cec = template.cec(params, context);
        if (cec < lo * anchor || cec > hi * anchor) continue;
        const rolled = { template, params, cec };
        if (!meetsDistinctness(rolled, used)) continue;
        candidates.push({ ...rolled, weight: template.weight });
      }
      if (candidates.length > 0) {
        return weightedChoice(
          { ...drawContext, sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex },
          `rr:row${rowIndex}:attempt${attempt}`,
          candidates.map((c) => ({ item: c, weight: c.weight })),
        );
      }
      lo = Math.max(0, lo - TOLERANCE_WIDEN_STEP);
      hi = hi + TOLERANCE_WIDEN_STEP;
    }
    throw new Error(`random_rewards fill failed to find a viable row ${rowIndex} after widening`);
  }

  const row2 = rollFurtherRow(2);
  for (const id of consumedIds(row2)) used.add(id);
  const row3 = rollFurtherRow(3);

  const options: JourneyOption[] = [
    emptyOption(1, row1.template.render(row1.params, context), ["reward"], row1.cec, [row1.template.id]),
    emptyOption(2, row2.template.render(row2.params, context), ["reward"], row2.cec, [row2.template.id]),
    emptyOption(3, row3.template.render(row3.params, context), ["reward"], row3.cec, [row3.template.id]),
  ];

  return { options, precommitted: {} };
}

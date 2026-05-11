// src/journey/shapes/random_trades/fill.ts
import type { JourneyContext } from "../../../quest/context.js";
import type { JourneyOption } from "../../manifest.js";
import { COSTS, getCost } from "../../shared/costs.js";
import { REWARDS } from "../../shared/rewards.js";
import { drawInt, weightedChoice, type DrawContext } from "../../../util/rng.js";
import { essenceAmount } from "../../shared/content.js";
import { withLockedPrefix } from "../../shared/text.js";
import type { Cost, Reward } from "../../shared/types.js";
import type { FilledJourney, ShapeFillArgs } from "../types.js";

const TOLERANCE_INITIAL = 15;
const TOLERANCE_WIDEN_STEP = 10;
const PAY_FLOOR = 10;

type RolledReward = { template: Reward; params: unknown; cec: number };
type RolledCost = { template: Cost; params: unknown; cec: number; rendered: string };

function emptyOption(
  number: number,
  text: string,
  symbols: readonly string[],
  effectCec: number,
  costCec: number,
): JourneyOption {
  const net = effectCec - costCec;
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
    costConvertedEssence: costCec,
    effectConvertedEssence: effectCec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: net,
    pickBehavior: "record_and_generate_next",
  };
}

function rewardSubIds(rolled: RolledReward): readonly string[] {
  if (rolled.template.id === "meta_gain_2_rewards") {
    const p = rolled.params as { subIds: readonly [string, string] };
    return p.subIds;
  }
  return [];
}

function consumedRewardIds(rolled: RolledReward): readonly string[] {
  return [rolled.template.id, ...rewardSubIds(rolled)];
}

function meetsRewardDistinctness(rolled: RolledReward, used: ReadonlySet<string>): boolean {
  for (const id of consumedRewardIds(rolled)) {
    if (used.has(id)) return false;
  }
  return true;
}

function rollReward(
  ctx: JourneyContext,
  draw: DrawContext,
  label: string,
  pool: readonly Reward[],
  used: ReadonlySet<string>,
): RolledReward | undefined {
  const candidates: Array<{ rolled: RolledReward; weight: number }> = [];
  for (const template of pool) {
    if (used.has(template.id)) continue;
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const rolled: RolledReward = { template, params, cec: template.cec(params as never, ctx) };
    if (!meetsRewardDistinctness(rolled, used)) continue;
    candidates.push({ rolled, weight: template.weight });
  }
  if (candidates.length === 0) return undefined;
  return weightedChoice(draw, label, candidates.map((c) => ({ item: c.rolled, weight: c.weight })));
}

function pickCostForReward(
  ctx: JourneyContext,
  draw: DrawContext,
  label: string,
  rewardCec: number,
): RolledCost | undefined {
  const cap = 0.5 * rewardCec;
  const candidates: Array<{ rolled: RolledCost; weight: number }> = [];
  for (const template of COSTS) {
    const params = template.rollParams(ctx, {
      ...draw,
      selectionAttempt: ((draw.selectionAttempt ?? 0) * 100) + template.id.length,
    });
    if (!template.viable(params as never, ctx)) continue;
    const cec = template.cec(params as never, ctx);
    if (cec > cap) continue;
    candidates.push({
      rolled: { template, params, cec, rendered: template.render(params as never, ctx) },
      weight: template.weight,
    });
  }
  if (candidates.length > 0) {
    return weightedChoice(draw, label, candidates.map((c) => ({ item: c.rolled, weight: c.weight })));
  }
  if (cap >= PAY_FLOOR) {
    const ceiling = Math.max(PAY_FLOOR, Math.floor(cap));
    const x = drawInt(draw, `${label}:fallback`, PAY_FLOOR, ceiling);
    const params = { x };
    const cec = x;
    const rendered = withLockedPrefix(`Pay ${x} essence`, x > essenceAmount(ctx));
    return { template: getCost("pay_essence"), params, cec, rendered };
  }
  return undefined;
}

function renderRow(reward: RolledReward, cost: RolledCost | undefined, ctx: JourneyContext): string {
  const rewardText = reward.template.render(reward.params as never, ctx);
  if (!cost) return rewardText;
  return `${rewardText}. ${cost.rendered}`;
}

export function randomTradesFill(args: ShapeFillArgs): FilledJourney {
  const { context, drawContext } = args;
  const used = new Set<string>();

  const row1Reward = rollReward(context, drawContext, "rt:row1:reward", REWARDS, used);
  if (!row1Reward) {
    throw new Error("random_trades fill could not roll a viable first reward");
  }
  for (const id of consumedRewardIds(row1Reward)) used.add(id);
  const row1Cost = pickCostForReward(context, drawContext, "rt:row1:cost", row1Reward.cec);
  const anchorNet = row1Reward.cec - (row1Cost?.cec ?? 0);

  function rollFurtherRow(rowIndex: number): { reward: RolledReward; cost: RolledCost | undefined } {
    let tol = TOLERANCE_INITIAL;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const lo = anchorNet - tol;
      const hi = anchorNet + tol;
      const candidates: Array<{ reward: RolledReward; cost: RolledCost | undefined; weight: number }> = [];
      for (const template of REWARDS) {
        if (used.has(template.id)) continue;
        const params = template.rollParams(context, {
          ...drawContext,
          sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
          selectionAttempt: ((drawContext.selectionAttempt ?? 0) * 100) + attempt + template.id.length,
        });
        if (!template.viable(params as never, context)) continue;
        const rCec = template.cec(params as never, context);
        const reward: RolledReward = { template, params, cec: rCec };
        if (!meetsRewardDistinctness(reward, used)) continue;
        const cost = pickCostForReward(context, {
          ...drawContext,
          sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex,
          selectionAttempt: ((drawContext.selectionAttempt ?? 0) * 100) + attempt + 1000,
        }, `rt:row${rowIndex}:cost:${template.id}`, rCec);
        const net = rCec - (cost?.cec ?? 0);
        if (net < lo || net > hi) continue;
        candidates.push({ reward, cost, weight: template.weight });
      }
      if (candidates.length > 0) {
        const picked = weightedChoice(
          { ...drawContext, sequenceStep: (drawContext.sequenceStep ?? 0) * 100 + rowIndex },
          `rt:row${rowIndex}:attempt${attempt}`,
          candidates.map((c) => ({ item: c, weight: c.weight })),
        );
        return { reward: picked.reward, cost: picked.cost };
      }
      tol += TOLERANCE_WIDEN_STEP;
    }
    throw new Error(`random_trades fill failed to find row ${rowIndex} after widening`);
  }

  const row2 = rollFurtherRow(2);
  for (const id of consumedRewardIds(row2.reward)) used.add(id);
  const row3 = rollFurtherRow(3);

  const rows = [
    { reward: row1Reward, cost: row1Cost },
    row2,
    row3,
  ];

  const options: JourneyOption[] = rows.map((row, index) => {
    const text = renderRow(row.reward, row.cost, context);
    const lockedRow = text.includes("[LOCKED]");
    const finalText = lockedRow && !text.startsWith("[LOCKED] ")
      ? `[LOCKED] ${text.replace(/\[LOCKED\] /g, "")}`
      : text;
    return emptyOption(
      index + 1,
      finalText,
      row.cost ? ["cost", "reward"] : ["reward"],
      row.reward.cec,
      row.cost?.cec ?? 0,
    );
  });

  return { options, precommitted: {} };
}

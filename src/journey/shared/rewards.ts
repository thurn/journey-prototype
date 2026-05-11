import { drawInt } from "../../util/rng.js";
import { STAGE_MULTIPLIER } from "./cec.js";
import { essenceAmount, maxEssence } from "./content.js";
import type { Reward } from "./types.js";

type GainEssenceParams = { x: number };
const gainEssence: Reward<GainEssenceParams> = {
  id: "gain_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "gain_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} essence`,
};

type GainOmensParams = { x: number };
const gainOmens: Reward<GainOmensParams> = {
  id: "gain_omens",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "gain_omens:x", 1, 3) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} omen${p.x === 1 ? "" : "s"}`,
};

type GainMaxEssenceParams = Record<string, never>;
const gainMaxEssence: Reward<GainMaxEssenceParams> = {
  id: "gain_max_essence",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => maxEssence(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain maximum essence",
};

type SetEssencePctParams = { percent: number };
const setEssenceToPercentOfMax: Reward<SetEssencePctParams> = {
  id: "set_essence_to_percent_of_max",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const choices = [50, 75, 100, 125];
    return { percent: choices[drawInt(draw, "set_essence_pct:i", 0, choices.length - 1)]! };
  },
  cec: (p, ctx) => Math.max(0, (maxEssence(ctx) * p.percent) / 100 - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Set essence to ${p.percent}% of your maximum essence`,
};

type GainEssenceRangeParams = { min: number; max: number };
const gainEssenceRandomRange: Reward<GainEssenceRangeParams> = {
  id: "gain_essence_random_range",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "essence_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "essence_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.min}-${p.max} essence (random roll)`,
};

type GainEssenceToMaxParams = Record<string, never>;
const gainEssenceToMax: Reward<GainEssenceToMaxParams> = {
  id: "gain_essence_to_max",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(0, maxEssence(ctx) - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain essence up to your maximum",
};

export const REWARDS: readonly Reward[] = Object.freeze([
  gainEssence,
  gainOmens,
  gainMaxEssence,
  setEssenceToPercentOfMax,
  gainEssenceRandomRange,
  gainEssenceToMax,
] as unknown as Reward[]);

const BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

export function getReward(id: string): Reward {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown reward template id: ${id}`);
  return found;
}

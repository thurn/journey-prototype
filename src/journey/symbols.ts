import type { JourneyOption } from "./manifest.js";

const SYMBOLS = {
  reward: "reward",
  cost: "cost",
  risk: "risk",
  route: "route",
  leave: "leave",
  loss: "loss",
  neutral: "no-op",
} as const;

function hasCost(option: JourneyOption): boolean {
  return option.costConvertedEssence > 0 || option.costs.length > 0;
}

function hasUpside(option: JourneyOption): boolean {
  return (
    option.effectConvertedEssence > 0 ||
    option.effects.length > 0 ||
    option.routeEffects.length > 0
  );
}

function hasRisk(option: JourneyOption): boolean {
  return (
    option.uncertaintyConvertedEssence < 0 ||
    option.burdenConvertedEssence < 0 ||
    option.burdens.length > 0 ||
    option.triggers.length > 0
  );
}

export function symbolsForOption(option: JourneyOption): string[] {
  if (option.pickBehavior === "leave") {
    return [SYMBOLS.leave];
  }

  const symbols: string[] = [];

  if (hasUpside(option)) {
    symbols.push(option.routeEffects.length > 0 ? SYMBOLS.route : SYMBOLS.reward);
  } else if (option.netConvertedEssence < 0) {
    symbols.push(SYMBOLS.loss);
  } else {
    symbols.push(SYMBOLS.neutral);
  }

  if (hasRisk(option)) {
    symbols.push(SYMBOLS.risk);
  } else if (hasCost(option)) {
    symbols.push(SYMBOLS.cost);
  }

  return symbols.slice(0, 2);
}

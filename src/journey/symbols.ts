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
  return option.costConvertedEssence > 0 ||
    option.operations.some((operation) => operation.role === "cost") ||
    option.costs.length > 0;
}

function hasUpside(option: JourneyOption): boolean {
  return (
    option.effectConvertedEssence > 0 ||
    option.operations.some((operation) =>
      operation.role === "reward" || operation.role === "route_edit"
    ) ||
    option.effects.length > 0 ||
    option.routeEffects.length > 0
  );
}

function hasRisk(option: JourneyOption): boolean {
  return (
    option.uncertaintyConvertedEssence < 0 ||
    option.burdenConvertedEssence < 0 ||
    option.operations.some((operation) =>
      operation.role === "burden" ||
      operation.role === "trigger" ||
      operation.role === "random" ||
      operation.role === "delayed_hook"
    ) ||
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
    const hasRoute = option.routeEffects.length > 0 ||
      option.operations.some((operation) => operation.role === "route_edit");

    symbols.push(hasRoute ? SYMBOLS.route : SYMBOLS.reward);
  } else if (option.netConvertedEssence < 0) {
    symbols.push(SYMBOLS.loss);
  } else {
    symbols.push(SYMBOLS.neutral);
  }

  if (hasCost(option)) {
    symbols.push(SYMBOLS.cost);
  }

  if (hasRisk(option)) {
    symbols.push(SYMBOLS.risk);
  }

  return symbols.slice(0, 3);
}

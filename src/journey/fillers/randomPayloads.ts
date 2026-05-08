import type { RandomOutcomeVisibility } from "../manifest.js";

export function randomVisibility(
  outcomeVisibility: RandomOutcomeVisibility,
  disclosure: string,
  playerVisible: boolean,
  revealTiming?: string,
) {
  return {
    outcomeVisibility,
    disclosure,
    playerVisible,
    ...(revealTiming ? { revealTiming } : {}),
  };
}

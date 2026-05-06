import type { CommandResult, CommonCommandOptions } from "./options.js";
import { handleJourney } from "./journey.js";

export async function handleRun(
  options: CommonCommandOptions,
): Promise<CommandResult> {
  return handleJourney(options, "run");
}

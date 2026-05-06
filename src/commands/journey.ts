import { randomUUID } from "node:crypto";
import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { generateNextJourney } from "../journey/generate.js";
import { createInitialJourneyState } from "../quest/init.js";
import { renderJourneyHuman } from "../render/human.js";
import { journeyCommandPayload, renderCommandJson } from "../render/json.js";
import { writeJourneyStateAtomic } from "../state/state.js";
import {
  buildContext,
  loadContentContext,
  setupErrorResult,
  stateWithGeneratedJourney,
} from "./shared.js";

function randomSeed(): string {
  return `random:${randomUUID()}`;
}

export async function handleJourney(
  options: CommonCommandOptions,
): Promise<CommandResult> {
  try {
    const loadedContent = await loadContentContext(options.projectRoot);
    const initialState = createInitialJourneyState({
      seed: randomSeed(),
      content: loadedContent.content,
      contentVersion: loadedContent.contentVersion,
    });
    const context = buildContext(options, loadedContent, initialState);
    const pendingJourney = generateNextJourney({ context });
    const nextState = stateWithGeneratedJourney(initialState, pendingJourney);

    await writeJourneyStateAtomic(options.statePath, nextState);

    return {
      exitCode: ExitCode.Success,
      stdout: options.json
        ? renderCommandJson(journeyCommandPayload(nextState, pendingJourney, "journey"))
        : renderJourneyHuman(nextState, pendingJourney, options),
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error, options);
  }
}

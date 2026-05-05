import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { generateNextJourney } from "../journey/generate.js";
import type { JourneyManifest } from "../journey/manifest.js";
import { createInitialJourneyState } from "../quest/init.js";
import type { JourneyState } from "../state/schema.js";
import { readJourneyState, writeJourneyStateAtomic } from "../state/state.js";
import {
  assertContentVersion,
  buildContext,
  loadContentContext,
  malformedStateResult,
  renderJourneyHuman,
  renderRunJson,
  setupErrorResult,
} from "./shared.js";

function stateWithGeneratedJourney(
  state: JourneyState,
  pendingJourney: JourneyManifest,
): JourneyState {
  return {
    ...state,
    generator: {
      ...state.generator,
      rootJourneyIndex: pendingJourney.rootJourneyIndex + 1,
      lastJourneyId: pendingJourney.journeyId,
    },
    pendingJourney,
  };
}

export async function handleRun(
  options: CommonCommandOptions,
): Promise<CommandResult> {
  try {
    const loadedContent = await loadContentContext(options.projectRoot);
    const readResult = await readJourneyState(options.statePath);

    if (readResult.kind === "malformed") {
      return malformedStateResult(readResult.error);
    }

    if (readResult.kind === "missing") {
      const initialState = createInitialJourneyState({
        seed: "default",
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
          ? renderRunJson(nextState, pendingJourney, "run")
          : renderJourneyHuman(nextState, pendingJourney, options),
        stderr: "",
      };
    }

    const mismatch = assertContentVersion(
      readResult.state,
      loadedContent.contentVersion,
    );

    if (mismatch) {
      return mismatch;
    }

    if (readResult.state.pendingJourney) {
      return {
        exitCode: ExitCode.Success,
        stdout: options.json
          ? renderRunJson(readResult.state, readResult.state.pendingJourney, "run")
          : renderJourneyHuman(
            readResult.state,
            readResult.state.pendingJourney,
            options,
          ),
        stderr: "",
      };
    }

    const context = buildContext(options, loadedContent, readResult.state);
    const pendingJourney = generateNextJourney({ context });
    const nextState = stateWithGeneratedJourney(readResult.state, pendingJourney);

    await writeJourneyStateAtomic(options.statePath, nextState);

    return {
      exitCode: ExitCode.Success,
      stdout: options.json
        ? renderRunJson(nextState, pendingJourney, "run")
        : renderJourneyHuman(nextState, pendingJourney, options),
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error);
  }
}

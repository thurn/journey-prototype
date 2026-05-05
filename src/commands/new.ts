import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { createInitialJourneyState } from "../quest/init.js";
import { renderNewHuman } from "../render/human.js";
import { newCommandPayload, renderCommandJson } from "../render/json.js";
import { readJourneyState, writeJourneyStateAtomic } from "../state/state.js";
import {
  assertContentVersion,
  loadContentContext,
  malformedStateResult,
  protectedResetResult,
  setupErrorResult,
} from "./shared.js";

export async function handleNew(
  seed: string,
  force: boolean,
  options: CommonCommandOptions,
): Promise<CommandResult> {
  try {
    const readResult = await readJourneyState(options.statePath);

    if (!force) {
      if (readResult.kind === "malformed") {
        return malformedStateResult(readResult.error, options);
      }

      if (readResult.kind === "loaded") {
        const loadedContent = await loadContentContext(options.projectRoot);
        const mismatch = assertContentVersion(
          readResult.state,
          loadedContent.contentVersion,
          options,
        );

        if (mismatch) {
          return mismatch;
        }

        if (readResult.state.pendingJourney) {
          return protectedResetResult(
            seed,
            readResult.state.pendingJourney.journeyId,
            options,
          );
        }
      }
    }

    const loadedContent = await loadContentContext(options.projectRoot);
    const nextState = createInitialJourneyState({
      seed: seed || "default",
      content: loadedContent.content,
      contentVersion: loadedContent.contentVersion,
    });

    await writeJourneyStateAtomic(options.statePath, nextState);

    return {
      exitCode: ExitCode.Success,
      stdout: options.json
        ? renderCommandJson(newCommandPayload(nextState))
        : renderNewHuman(nextState, options),
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error, options);
  }
}

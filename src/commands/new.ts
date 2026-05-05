import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { createInitialJourneyState } from "../quest/init.js";
import { readJourneyState, writeJourneyStateAtomic } from "../state/state.js";
import {
  assertContentVersion,
  loadContentContext,
  malformedStateResult,
  renderNewHuman,
  renderNewJson,
  setupErrorResult,
  usageErrorResult,
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
        return malformedStateResult(readResult.error);
      }

      if (readResult.kind === "loaded") {
        const loadedContent = await loadContentContext(options.projectRoot);
        const mismatch = assertContentVersion(
          readResult.state,
          loadedContent.contentVersion,
        );

        if (mismatch) {
          return mismatch;
        }

        if (readResult.state.pendingJourney) {
          return usageErrorResult(
            "refusing to discard a pending Journey. Run `journey new --force` to replace this quest state.",
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
      stdout: options.json ? renderNewJson(nextState) : renderNewHuman(nextState),
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error);
  }
}

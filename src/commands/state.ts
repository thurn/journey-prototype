import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { readJourneyState } from "../state/state.js";
import {
  assertContentVersion,
  loadContentContext,
  malformedStateResult,
  renderStateHuman,
  renderStateJson,
  setupErrorResult,
} from "./shared.js";

export async function handleState(
  options: CommonCommandOptions,
): Promise<CommandResult> {
  try {
    const readResult = await readJourneyState(options.statePath);

    if (readResult.kind === "missing") {
      return {
        exitCode: ExitCode.Success,
        stdout: "No Journey state exists yet. Run `journey run` to create one, or `journey new` to initialize a quest without a pending Journey.\n",
        stderr: "",
      };
    }

    if (readResult.kind === "malformed") {
      return malformedStateResult(readResult.error);
    }

    const loadedContent = await loadContentContext(options.projectRoot);
    const mismatch = assertContentVersion(
      readResult.state,
      loadedContent.contentVersion,
    );

    if (mismatch) {
      return mismatch;
    }

    return {
      exitCode: ExitCode.Success,
      stdout: options.json
        ? renderStateJson(readResult.state)
        : renderStateHuman(readResult.state),
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error);
  }
}

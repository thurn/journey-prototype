import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";

export async function handleState(
  options: CommonCommandOptions,
): Promise<CommandResult> {
  void options;

  return {
    exitCode: ExitCode.Success,
    stdout: "journey state is not implemented yet.\n",
    stderr: "",
  };
}

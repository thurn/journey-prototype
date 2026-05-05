import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";

export async function handlePick(
  numberText: string,
  options: CommonCommandOptions,
): Promise<CommandResult> {
  void numberText;
  void options;

  return {
    exitCode: ExitCode.Success,
    stdout: "journey pick is not implemented yet.\n",
    stderr: "",
  };
}

import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";

export async function handleNew(
  seed: string,
  force: boolean,
  options: CommonCommandOptions,
): Promise<CommandResult> {
  void seed;
  void force;
  void options;

  return {
    exitCode: ExitCode.Success,
    stdout: "journey new is not implemented yet.\n",
    stderr: "",
  };
}

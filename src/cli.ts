#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import { handleNew } from "./commands/new.js";
import type { CommandResult, CommonCommandOptions } from "./commands/options.js";
import { handlePick } from "./commands/pick.js";
import { handleRun } from "./commands/run.js";
import { handleState } from "./commands/state.js";
import { ExitCode } from "./util/exitCodes.js";

type RawCommonOptions = {
  json?: boolean;
  debug?: boolean;
  color?: boolean;
};

function defaultProjectRoot(): string {
  return process.cwd();
}

function buildCommonOptions(rawOptions: RawCommonOptions): CommonCommandOptions {
  const projectRoot = defaultProjectRoot();

  return {
    json: rawOptions.json ?? false,
    debug: rawOptions.debug ?? true,
    color: rawOptions.color ?? true,
    projectRoot,
    statePath: join(projectRoot, ".journey", "state.json"),
  };
}

function addCommonFlags(command: Command): Command {
  return command
    .option("--json", "print JSON output")
    .option("--no-color", "disable colored output")
    .option("--no-debug", "disable debug output");
}

function writeResult(result: CommandResult): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}

async function runHandler(result: Promise<CommandResult>): Promise<void> {
  writeResult(await result);
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("journey")
    .description("Simulate Dream Journey choices")
    .showHelpAfterError()
    .exitOverride();

  const runCommand = addCommonFlags(new Command("run"))
    .description("show the pending Dream Journey")
    .action(async (rawOptions: RawCommonOptions) => {
      await runHandler(handleRun(buildCommonOptions(rawOptions)));
    });

  const pickCommand = addCommonFlags(new Command("pick"))
    .description("pick a Dream Journey option")
    .argument("<number>", "option number to pick")
    .action(async (numberText: string, rawOptions: RawCommonOptions) => {
      await runHandler(handlePick(numberText, buildCommonOptions(rawOptions)));
    });

  program.addCommand(runCommand);
  program.addCommand(pickCommand);

  program
    .command("state")
    .description("show simulator quest state")
    .action(async () => {
      await runHandler(handleState(buildCommonOptions({})));
    });

  program
    .command("new")
    .description("start a new simulator quest")
    .option("--force", "replace existing simulator state")
    .option("--seed <seed>", "seed for the new simulator quest")
    .action(async (rawOptions: { force?: boolean; seed?: string }) => {
      await runHandler(
        handleNew(
          rawOptions.seed ?? "default",
          rawOptions.force ?? false,
          buildCommonOptions({}),
        ),
      );
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();

  try {
    await program.parseAsync(argv, { from: "node" });
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }

    process.stderr.write(
      error instanceof Error ? `${error.message}\n` : "Unknown internal error\n",
    );
    process.exitCode = ExitCode.InternalError;
  }
}

const invokedPath = process.argv[1]
  ? realpathSync(resolve(process.argv[1]))
  : undefined;
if (invokedPath && invokedPath === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}

#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import { handleJourney } from "./commands/journey.js";
import { handleNew } from "./commands/new.js";
import type { CommandResult, CommonCommandOptions } from "./commands/options.js";
import { handlePick } from "./commands/pick.js";
import { handleRun } from "./commands/run.js";
import { handleState } from "./commands/state.js";
import { supportsColor } from "./util/ansi.js";
import { ExitCode } from "./util/exitCodes.js";

export type RawCommonOptions = {
  json?: boolean;
  debug?: boolean;
  color?: boolean;
};

function defaultProjectRoot(): string {
  return process.cwd();
}

export function buildCommonOptions(rawOptions: RawCommonOptions): CommonCommandOptions {
  const projectRoot = defaultProjectRoot();
  const json = rawOptions.json ?? false;
  const colorDisabled = json || rawOptions.color === false;
  const color = colorDisabled ? false : supportsColor(process.stdout, "auto");
  const stderrColor = colorDisabled ? false : supportsColor(process.stderr, "auto");

  return {
    json,
    debug: rawOptions.debug ?? true,
    color,
    stderrColor,
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

function addJsonColorFlags(command: Command): Command {
  return command
    .option("--json", "print JSON output")
    .option("--no-color", "disable colored output");
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
    .addHelpText(
      "after",
      "\nRun without arguments to discard simulator state, choose a random seed, and show the first Dream Journey.",
    )
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

  const stateCommand = addJsonColorFlags(new Command("state"))
    .description("show simulator quest state")
    .action(async (rawOptions: RawCommonOptions) => {
      await runHandler(handleState(buildCommonOptions(rawOptions)));
    });

  const newCommand = addJsonColorFlags(new Command("new"))
    .description("start a new simulator quest")
    .option("--force", "replace existing simulator state")
    .option("--seed <seed>", "seed for the new simulator quest")
    .action(async (rawOptions: RawCommonOptions & { force?: boolean; seed?: string }) => {
      await runHandler(
        handleNew(
          rawOptions.seed ?? "default",
          rawOptions.force ?? false,
          buildCommonOptions(rawOptions),
        ),
      );
    });

  program.addCommand(stateCommand);
  program.addCommand(newCommand);

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  if (argv.length <= 2) {
    await runHandler(handleJourney(buildCommonOptions({})));
    return;
  }

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

#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { handleJourney } from "./commands/journey.js";
import type { CommandResult, CommonCommandOptions } from "./commands/options.js";
import { handleRun } from "./commands/run.js";
import { supportsColor } from "./util/ansi.js";
import { ExitCode } from "./util/exitCodes.js";
import {
  isJourneyShapeId,
  journeyShapeDefinitions,
} from "./journey/shapes.js";

export type RawCommonOptions = {
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  debugContext?: boolean;
  showDeck?: boolean;
  color?: boolean;
  seed?: string;
  stage?: "early" | "mid" | "late";
  shape?: string;
  count?: number;
  debugPayloadFamily?: string;
  debugPayloadVariant?: string;
  debugListPayloads?: boolean;
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
    debug: rawOptions.debug ?? false,
    verbose: rawOptions.verbose ?? false,
    debugContext: rawOptions.debugContext ?? false,
    showDeck: rawOptions.showDeck ?? false,
    color,
    stderrColor,
    projectRoot,
    statePath: join(projectRoot, ".journey", "state.json"),
    debugListPayloads: rawOptions.debugListPayloads ?? false,
    ...(rawOptions.seed !== undefined ? { seed: rawOptions.seed } : {}),
    ...(rawOptions.stage !== undefined ? { stage: rawOptions.stage } : {}),
    ...(rawOptions.shape !== undefined ? { shape: rawOptions.shape } : {}),
    ...(rawOptions.count !== undefined ? { count: rawOptions.count } : {}),
    ...(rawOptions.debugPayloadFamily !== undefined ? { debugPayloadFamily: rawOptions.debugPayloadFamily } : {}),
    ...(rawOptions.debugPayloadVariant !== undefined ? { debugPayloadVariant: rawOptions.debugPayloadVariant } : {}),
  };
}

function parseCount(value: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new InvalidArgumentError("count must be a positive integer");
  }

  const count = Number.parseInt(value, 10);

  if (count < 1 || count > 1000) {
    throw new InvalidArgumentError("count must be between 1 and 1000");
  }

  return count;
}

function addGenerationFlags(command: Command): Command {
  return command
    .option("--json", "print JSON output")
    .option("--no-color", "disable colored output")
    .option("--debug", "print generation metadata")
    .option("--verbose", "include exhaustive --debug detail (fingerprint components, all validation, all operations)")
    .option("--debug-context", "print generated quest context")
    .option("--show-deck", "print deck cards and active dreamsigns (comma separated, wrapped)")
    .option("--seed <seed>", "seed for deterministic generation")
    .addOption(
      new Option("--debug-payload-family <family>", "force a debug payload family")
        .hideHelp(),
    )
    .addOption(
      new Option("--debug-payload-variant <variant>", "force a debug payload variant")
        .hideHelp(),
    )
    .addOption(
      new Option("--debug-list-payloads", "list deterministic debug payload families")
        .hideHelp(),
    )
    .option(
      "--count <count>",
      "generate multiple stateless Dream Journeys",
      parseCount,
      1,
    )
    .addOption(
      new Option("--stage <stage>", "force Journey stage: early, mid, or late")
        .choices(["early", "mid", "late"]),
    )
    .addOption(
      new Option("--shape <shape>", "force a canonical Journey shape")
        .choices(journeyShapeDefinitions().map((shape) => shape.id)),
    );
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

  addGenerationFlags(program)
    .name("journey")
    .description("Generate Dream Journey offers")
    .enablePositionalOptions()
    .addHelpText(
      "after",
      "\nRun without a subcommand to generate one stateless Dream Journey.",
    )
    .action(async (rawOptions: RawCommonOptions) => {
      await runHandler(handleJourney(buildCommonOptions(rawOptions)));
    })
    .showHelpAfterError()
    .exitOverride();

  const runCommand = addGenerationFlags(new Command("run"))
    .description("generate one Dream Journey")
    .action(async () => {
      await runHandler(handleRun(buildCommonOptions(runCommand.opts<RawCommonOptions>())));
    });

  program.addCommand(runCommand);

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts<RawCommonOptions>();
    if (
      opts.shape !== undefined &&
      !isJourneyShapeId(opts.shape)
    ) {
      thisCommand.error(`error: unknown Journey shape '${opts.shape}'`);
    }
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

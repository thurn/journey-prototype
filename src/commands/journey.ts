import { randomUUID } from "node:crypto";
import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { generateNextJourney } from "../journey/generate.js";
import type { JourneyStage } from "../journey/manifest.js";
import type { JourneyState } from "../state/schema.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../quest/init.js";
import { renderDreamArt } from "../render/dreamArt.js";
import { renderJourneyHuman } from "../render/human.js";
import {
  journeyBatchCommandPayload,
  journeyCommandPayload,
  renderCommandJson,
} from "../render/json.js";
import { THEME } from "../render/theme.js";
import { ansiTruecolor } from "../util/ansi.js";
import { drawInt } from "../util/rng.js";
import { buildContext, loadContentContext, setupErrorResult } from "./shared.js";

function randomSeed(): string {
  return `random:${randomUUID()}`;
}

function dreamscapeForStage(stage: JourneyStage): number {
  switch (stage) {
    case "early":
      return 0;
    case "mid":
      return 2;
    case "late":
      return 4;
  }
}

function stageForInvocation(
  options: CommonCommandOptions,
  seed: string,
  contentVersion: string,
  rootJourneyIndex: number,
): JourneyStage {
  if (options.stage) {
    if (!["early", "mid", "late"].includes(options.stage)) {
      throw new Error(`Unknown Journey stage: ${options.stage}`);
    }

    return options.stage;
  }

  const stages = ["early", "mid", "late"] as const;
  const index = drawInt(
    { seed, contentVersion, rootJourneyIndex },
    "stateless:stage",
    0,
    stages.length - 1,
  );

  return stages[index]!;
}

type GeneratedJourney = {
  state: JourneyState;
  manifest: ReturnType<typeof generateNextJourney>;
};

export function formatReviewFlags(flags: readonly string[]): string {
  if (flags.length === 0) return "";
  return `Dream art: cases to investigate\n${flags.map((flag) => `  ${flag}`).join("\n")}\n`;
}

export function formatRepeatFallbacks(
  fallbacks: readonly string[],
  options: Pick<CommonCommandOptions, "stderrColor" | "json">,
): string {
  if (fallbacks.length === 0) return "";
  const block = `Dream art: ledger pool exhausted (debug)\n${fallbacks.map((line) => `  ${line}`).join("\n")}\n`;
  const enabled = options.stderrColor && !options.json;
  return ansiTruecolor(block, THEME.error, enabled);
}

export async function handleJourney(
  options: CommonCommandOptions,
  command: "journey" | "run" = "journey",
): Promise<CommandResult> {
  try {
    const loadedContent = await loadContentContext(options.projectRoot);
    const seed = options.seed ?? randomSeed();
    const count = options.count ?? 1;

    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new Error("Journey batch count must be between 1 and 1000");
    }

    const generated: GeneratedJourney[] = [];
    for (let index = 0; index < count; index += 1) {
      const rootJourneyIndex = index + 1;
      const stage = stageForInvocation(
        options,
        seed,
        loadedContent.contentVersion,
        rootJourneyIndex,
      );
      const state = createInitialJourneyState({
        seed,
        content: loadedContent.content,
        contentVersion: loadedContent.contentVersion,
      });

      state.generator.rootJourneyIndex = rootJourneyIndex;
      state.quest.resources.dreamscape = dreamscapeForStage(stage);
      simulateQuestStateForStage({
        state,
        stage,
        drawContext: {
          seed,
          contentVersion: loadedContent.contentVersion,
          rootJourneyIndex,
        },
      });

      const context = buildContext(options, loadedContent, state);
      const manifest = generateNextJourney({
        context,
        forcedShapeId: options.shape,
        forcedStage: stage,
      });

      generated.push({ state, manifest });
    }
    const first = generated[0]!;

    if (options.json) {
      return {
        exitCode: ExitCode.Success,
        stdout: renderCommandJson(
          count === 1
            ? journeyCommandPayload(first.state, first.manifest, command, options)
            : journeyBatchCommandPayload(generated, command, options),
        ),
        stderr: "",
      };
    }

    const renderedBlocks = await Promise.all(
      generated.map(async (entry) => {
        const human = renderJourneyHuman(
          entry.state,
          entry.manifest,
          options,
          loadedContent.content,
        ).trimEnd();
        const art = await renderDreamArt(entry.manifest, options.projectRoot);
        const trailing = art.block.length > 0 ? `\n\n${art.block.trimEnd()}` : "";
        return {
          text: `${human}${trailing}`,
          reviewFlags: art.reviewFlags,
          repeatFallbacks: art.repeatFallbacks,
        };
      }),
    );
    const stdout = `${renderedBlocks.map((block) => block.text).join("\n\n")}\n`;
    const flags = renderedBlocks.flatMap((block) => block.reviewFlags);
    const repeats = options.debug
      ? renderedBlocks.flatMap((block) => block.repeatFallbacks)
      : [];
    const stderr = `${formatReviewFlags(flags)}${formatRepeatFallbacks(repeats, options)}`;

    return {
      exitCode: ExitCode.Success,
      stdout,
      stderr,
    };
  } catch (error) {
    return setupErrorResult(error, options);
  }
}

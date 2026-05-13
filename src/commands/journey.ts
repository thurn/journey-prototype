import { randomUUID } from "node:crypto";
import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { generateNextJourney } from "../journey/generate.js";
import type { JourneyStage } from "../journey/manifest.js";
import type { JourneyState } from "../state/schema.js";
import { createInitialJourneyState, simulateQuestStateForStage } from "../quest/init.js";
import { renderJourneyHuman } from "../render/human.js";
import {
  journeyBatchCommandPayload,
  journeyCommandPayload,
  renderCommandJson,
} from "../render/json.js";
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

    return {
      exitCode: ExitCode.Success,
      stdout: options.json
        ? renderCommandJson(
            count === 1
              ? journeyCommandPayload(first.state, first.manifest, command, options)
              : journeyBatchCommandPayload(generated, command, options),
          )
        : generated.map((entry) =>
            renderJourneyHuman(entry.state, entry.manifest, options, loadedContent.content).trimEnd()
          ).join("\n\n") + "\n",
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error, options);
  }
}

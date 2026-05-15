import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { advanceSequenceJourney, generateNextJourney } from "../journey/generate.js";
import type { JourneyManifest } from "../journey/manifest.js";
import { renderDreamArt } from "../render/dreamArt.js";
import { renderJourneyHuman, renderSelectedHuman } from "../render/human.js";
import { journeyCommandPayload, renderCommandJson } from "../render/json.js";
import { formatRepeatFallbacks, formatReviewFlags } from "./journey.js";
import { readJourneyState, writeJourneyStateAtomic } from "../state/state.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import {
  assertContentVersion,
  buildContext,
  invalidOptionResult,
  loadContentContext,
  malformedStateResult,
  setupErrorResult,
  stateWithGeneratedJourney,
  usageErrorResult,
} from "./shared.js";

function parsePickNumber(numberText: string): number | null {
  if (!/^[1-9]\d*$/.test(numberText)) {
    return null;
  }

  const parsed = Number(numberText);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

type ContentBundle = Parameters<typeof renderJourneyHuman>[3];

async function humanWithDreamArt(args: {
  readonly state: JourneyState;
  readonly manifest: JourneyManifest;
  readonly selectedHuman: string;
  readonly options: CommonCommandOptions;
  readonly content?: ContentBundle;
}): Promise<{ stdout: string; stderr: string }> {
  const human = renderJourneyHuman(
    args.state,
    args.manifest,
    args.options,
    args.content,
  );
  const art = await renderDreamArt(args.manifest, args.options.projectRoot);
  const humanTrailing = art.block.length > 0
    ? `${human.trimEnd()}\n\n${art.block.trimEnd()}\n`
    : human;
  const repeats = args.options.debug ? art.repeatFallbacks : [];
  const stderr = `${formatReviewFlags(art.reviewFlags)}${formatRepeatFallbacks(repeats, args.options)}`;
  return { stdout: `${args.selectedHuman}${humanTrailing}`, stderr };
}

function historyEntry(
  manifest: JourneyManifest,
  selectedOptionNumber: number,
  selectedOptionText: string,
  sequenceStatus?: PickHistoryEntry["sequenceStatus"],
): PickHistoryEntry {
  return {
    journeyId: manifest.journeyId,
    shapeId: manifest.shapeId,
    ...(manifest.sequence ? { sequenceStep: manifest.sequence.step } : {}),
    ...(sequenceStatus ? { sequenceStatus } : {}),
    selectedOptionNumber,
    selectedOptionText,
    effectSimulation: "not_applied",
  };
}

export async function handlePick(
  numberText: string,
  options: CommonCommandOptions,
): Promise<CommandResult> {
  const selectedOptionNumber = parsePickNumber(numberText);

  if (selectedOptionNumber === null) {
    return usageErrorResult("pick number must be a positive integer.", options);
  }

  try {
    const loadedContent = await loadContentContext(options.projectRoot);
    const readResult = await readJourneyState(options.statePath);

    if (readResult.kind === "missing") {
      return usageErrorResult(
        "no pending Journey exists. Run `journey run` first.",
        options,
      );
    }

    if (readResult.kind === "malformed") {
      return malformedStateResult(readResult.error, options);
    }

    const mismatch = assertContentVersion(
      readResult.state,
      loadedContent.contentVersion,
      options,
    );

    if (mismatch) {
      return mismatch;
    }

    const pendingJourney = readResult.state.pendingJourney;

    if (!pendingJourney) {
      return usageErrorResult(
        "no pending Journey exists. Run `journey run` first.",
        options,
      );
    }

    const selectedOption = pendingJourney.options.find(
      (option) => option.number === selectedOptionNumber,
    );

    if (!selectedOption) {
      return invalidOptionResult(selectedOptionNumber, pendingJourney, options);
    }

    const contextBeforePick = buildContext(options, loadedContent, readResult.state);

    if (
      pendingJourney.sequence?.status === "active" &&
      selectedOption.pickBehavior !== "record_and_generate_next"
    ) {
      const advanceResult = advanceSequenceJourney({
        context: contextBeforePick,
        manifest: pendingJourney,
        selectedOptionNumber,
      });
      const sequenceStatus = advanceResult.kind === "advanced"
        ? "active"
        : advanceResult.kind === "complete"
          ? "complete"
          : "left";
      const recordedPick = historyEntry(
        pendingJourney,
        selectedOptionNumber,
        selectedOption.text,
        sequenceStatus,
      );
      const stateWithHistory: JourneyState = {
        ...readResult.state,
        history: [...readResult.state.history, recordedPick],
      };
      const nextState = advanceResult.kind === "advanced"
        ? {
          ...stateWithHistory,
          pendingJourney: advanceResult.manifest,
        }
        : stateWithGeneratedJourney(
          {
            ...stateWithHistory,
            pendingJourney: null,
          },
          generateNextJourney({
            context: buildContext(options, loadedContent, {
              ...stateWithHistory,
              pendingJourney: null,
            }),
            previousPick: recordedPick,
          }),
        );

      await writeJourneyStateAtomic(options.statePath, nextState);

      const nextManifest = nextState.pendingJourney;
      if (!nextManifest) {
        throw new Error("valid pick transition did not produce a pending Journey");
      }

      if (options.json) {
        return {
          exitCode: ExitCode.Success,
          stdout: renderCommandJson(
            journeyCommandPayload(nextState, nextManifest, "pick", recordedPick),
          ),
          stderr: "",
        };
      }
      const rendered = await humanWithDreamArt({
        state: nextState,
        manifest: nextManifest,
        selectedHuman: renderSelectedHuman(selectedOption, options),
        options,
        content: loadedContent.content,
      });
      return {
        exitCode: ExitCode.Success,
        stdout: rendered.stdout,
        stderr: rendered.stderr,
      };
    }

    const recordedPick = historyEntry(
      pendingJourney,
      selectedOptionNumber,
      selectedOption.text,
    );
    const stateWithHistory: JourneyState = {
      ...readResult.state,
      pendingJourney: null,
      history: [...readResult.state.history, recordedPick],
    };
    const nextManifest = generateNextJourney({
      context: buildContext(options, loadedContent, stateWithHistory),
      previousPick: recordedPick,
    });
    const nextState = stateWithGeneratedJourney(stateWithHistory, nextManifest);

    await writeJourneyStateAtomic(options.statePath, nextState);

    if (options.json) {
      return {
        exitCode: ExitCode.Success,
        stdout: renderCommandJson(
          journeyCommandPayload(nextState, nextManifest, "pick", recordedPick),
        ),
        stderr: "",
      };
    }
    const rendered = await humanWithDreamArt({
      state: nextState,
      manifest: nextManifest,
      selectedHuman: renderSelectedHuman(selectedOption, options),
      options,
    });
    return {
      exitCode: ExitCode.Success,
      stdout: rendered.stdout,
      stderr: rendered.stderr,
    };
  } catch (error) {
    return setupErrorResult(error, options);
  }
}

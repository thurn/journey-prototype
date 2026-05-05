import type { CommandResult, CommonCommandOptions } from "./options.js";
import { ExitCode } from "../util/exitCodes.js";
import { advanceSequenceJourney, generateNextJourney } from "../journey/generate.js";
import type { JourneyManifest } from "../journey/manifest.js";
import { readJourneyState, writeJourneyStateAtomic } from "../state/state.js";
import type { JourneyState, PickHistoryEntry } from "../state/schema.js";
import {
  assertContentVersion,
  buildContext,
  loadContentContext,
  malformedStateResult,
  renderJourneyHuman,
  renderRunJson,
  renderSelectedLine,
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
    return usageErrorResult("pick number must be a positive integer.");
  }

  try {
    const loadedContent = await loadContentContext(options.projectRoot);
    const readResult = await readJourneyState(options.statePath);

    if (readResult.kind === "missing") {
      return usageErrorResult(
        "no pending Journey exists. Run `journey run` first.",
      );
    }

    if (readResult.kind === "malformed") {
      return malformedStateResult(readResult.error);
    }

    const mismatch = assertContentVersion(
      readResult.state,
      loadedContent.contentVersion,
    );

    if (mismatch) {
      return mismatch;
    }

    const pendingJourney = readResult.state.pendingJourney;

    if (!pendingJourney) {
      return usageErrorResult(
        "no pending Journey exists. Run `journey run` first.",
      );
    }

    const selectedOption = pendingJourney.options.find(
      (option) => option.number === selectedOptionNumber,
    );

    if (!selectedOption) {
      return usageErrorResult(
        `option ${selectedOptionNumber} is not available for ${pendingJourney.journeyId}.`,
      );
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

      return {
        exitCode: ExitCode.Success,
        stdout: options.json
          ? renderRunJson(nextState, nextManifest, "pick", recordedPick)
          : `${renderSelectedLine(selectedOption)}${renderJourneyHuman(
            nextState,
            nextManifest,
            options,
            recordedPick,
          )}`,
        stderr: "",
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

    return {
      exitCode: ExitCode.Success,
      stdout: options.json
        ? renderRunJson(nextState, nextManifest, "pick", recordedPick)
        : `${renderSelectedLine(selectedOption)}${renderJourneyHuman(
          nextState,
          nextManifest,
          options,
          recordedPick,
        )}`,
      stderr: "",
    };
  } catch (error) {
    return setupErrorResult(error);
  }
}

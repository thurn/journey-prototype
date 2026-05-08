import type { ContentBundle } from "../content/model.js";
import { loadContent } from "../content/loadToml.js";
import { computeContentVersion } from "../content/version.js";
import { EFFECT_CATALOG, EFFECT_CATALOG_VERSION } from "../journey/effects.js";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
  type JourneyManifest,
} from "../journey/manifest.js";
import {
  canonicalShapeDefinitions,
  JOURNEY_SHAPE_CATALOG_VERSION,
} from "../journey/shapes.js";
import {
  VALUE_MODEL_CONTRIBUTION,
  VALUE_MODEL_VERSION,
} from "../journey/value.js";
import type { JourneyContext } from "../quest/context.js";
import { buildJourneyContext } from "../quest/context.js";
import { QUEST_INITIALIZATION_VERSION } from "../quest/init.js";
import { createJourneyError, renderError } from "../render/errors.js";
import { RENDERER_VERSION } from "../render/theme.js";
import type { JourneyState } from "../state/schema.js";
import { ExitCode } from "../util/exitCodes.js";
import type { CommandResult, CommonCommandOptions } from "./options.js";
import { VALIDATION_CONTRACT_VERSION } from "../journey/validate/index.js";

export type LoadedContentContext = {
  content: ContentBundle;
  contentVersion: string;
};

export async function loadContentContext(
  projectRoot: string,
): Promise<LoadedContentContext> {
  const content = await loadContent(projectRoot);
  const contentVersion = computeContentVersion({
    content,
    journeyCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    canonicalShapeDefinitions: canonicalShapeDefinitions(),
    effectCatalogVersion: EFFECT_CATALOG_VERSION,
    effectCatalogContribution: EFFECT_CATALOG.map(
      (entry) => entry.versionContribution,
    ),
    valueModelVersion: VALUE_MODEL_VERSION,
    valueModelContribution: VALUE_MODEL_CONTRIBUTION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    manifestContractVersion: MANIFEST_CONTRACT_VERSION,
    validationContractVersion: VALIDATION_CONTRACT_VERSION,
    rendererVersion: RENDERER_VERSION,
    questInitializationVersion: QUEST_INITIALIZATION_VERSION,
  });

  return { content, contentVersion };
}

export function buildContext(
  options: CommonCommandOptions,
  loaded: LoadedContentContext,
  state: JourneyState,
): JourneyContext {
  return buildJourneyContext({
    projectRoot: options.projectRoot,
    content: loaded.content,
    state,
    contentVersion: loaded.contentVersion,
  });
}

export function setupErrorResult(
  error: unknown,
  options: CommonCommandOptions,
): CommandResult {
  const detail = error instanceof Error ? error.message : String(error);

  return renderError(
    createJourneyError(detail, ExitCode.SetupOrSchema),
    options,
  );
}

export function malformedStateResult(
  error: Error,
  options: CommonCommandOptions,
): CommandResult {
  return renderError(
    createJourneyError(
      `local Journey state is malformed.\n\n${error.message}\n\nRun \`journey new --force\` to discard the old simulator state.`,
      ExitCode.StateOrContent,
    ),
    options,
  );
}

export function contentMismatchResult(
  stateVersion: string,
  currentVersion: string,
  options: CommonCommandOptions,
): CommandResult {
  return renderError(
    createJourneyError(
      [
        "local Journey state was created for a different content version.",
        "",
        `State content version: ${stateVersion}`,
        `Current content version: ${currentVersion}`,
        "",
        "Run `journey new --force` to discard the old simulator state.",
      ].join("\n"),
      ExitCode.StateOrContent,
    ),
    options,
  );
}

export function protectedResetResult(
  seed: string,
  pendingJourneyId: string,
  options: CommonCommandOptions,
): CommandResult {
  return renderError(
    createJourneyError(
      [
        "a pending Journey would be discarded.",
        "",
        `Pending Journey: ${pendingJourneyId}`,
        `Run \`journey new --seed ${seed || "default"} --force\` to replace this quest state.`,
      ].join("\n"),
      ExitCode.UsageOrInput,
    ),
    options,
  );
}

function choicesText(choices: readonly number[]): string {
  if (choices.length === 0) {
    return "none";
  }

  if (choices.length === 1) {
    return String(choices[0]);
  }

  if (choices.length === 2) {
    return `${choices[0]} or ${choices[1]}`;
  }

  return `${choices.slice(0, -1).join(", ")}, or ${choices[choices.length - 1]}`;
}

export function invalidOptionResult(
  selectedOptionNumber: number,
  manifest: JourneyManifest,
  options: CommonCommandOptions,
): CommandResult {
  const choices = manifest.options.map((option) => option.number);

  return renderError(
    createJourneyError(
      [
        `option ${selectedOptionNumber} is not available for Journey ${manifest.journeyId}.`,
        "",
        `Valid choices are ${choicesText(choices)}.`,
        "Run `journey run` to show the pending choices again.",
      ].join("\n"),
      ExitCode.UsageOrInput,
    ),
    options,
  );
}

export function usageErrorResult(
  message: string,
  options: CommonCommandOptions,
): CommandResult {
  return renderError(createJourneyError(message, ExitCode.UsageOrInput), options);
}

export function assertContentVersion(
  state: JourneyState,
  currentContentVersion: string,
  options: CommonCommandOptions,
): CommandResult | null {
  if (state.contentVersion === currentContentVersion) {
    return null;
  }

  return contentMismatchResult(state.contentVersion, currentContentVersion, options);
}

export function stateWithGeneratedJourney(
  state: JourneyState,
  pendingJourney: JourneyManifest,
): JourneyState {
  return {
    ...state,
    generator: {
      ...state.generator,
      rootJourneyIndex: pendingJourney.rootJourneyIndex + 1,
      lastJourneyId: pendingJourney.journeyId,
    },
    pendingJourney,
  };
}

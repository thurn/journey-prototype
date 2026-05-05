import type { RenderedOutput, RenderOptions } from "./human.js";
import { THEME } from "./theme.js";
import { ExitCode } from "../util/exitCodes.js";
import { ansiTruecolor } from "../util/ansi.js";

export type JourneyError = Error & { exitCode: number };
type ErrorRenderOptions = RenderOptions & { stderrColor?: boolean };

export function createJourneyError(
  message: string,
  exitCode: number,
): JourneyError {
  const error = new Error(message) as JourneyError;
  error.exitCode = exitCode;

  return error;
}

function hasExitCode(error: unknown): error is JourneyError {
  return error instanceof Error && "exitCode" in error && typeof error.exitCode === "number";
}

function messageFor(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function renderError(
  error: unknown,
  options: ErrorRenderOptions,
): RenderedOutput & { exitCode: number } {
  const exitCode = hasExitCode(error) ? error.exitCode : ExitCode.InternalError;
  const message = messageFor(error);
  const prefixed = message.startsWith("Error: ") ? message : `Error: ${message}`;
  const enabled = (options.stderrColor ?? options.color) && !options.json;

  return {
    exitCode,
    stdout: "",
    stderr: `${ansiTruecolor(prefixed, THEME.error, enabled)}\n`,
  };
}

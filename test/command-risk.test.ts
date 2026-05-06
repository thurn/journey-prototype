import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleJourney } from "../src/commands/journey.js";
import { handleNew } from "../src/commands/new.js";
import type { CommonCommandOptions } from "../src/commands/options.js";
import { handlePick } from "../src/commands/pick.js";
import { handleRun } from "../src/commands/run.js";
import { handleState } from "../src/commands/state.js";
import type { JourneyState } from "../src/state/schema.js";
import { readJourneyState, writeJourneyStateAtomic } from "../src/state/state.js";
import { ExitCode } from "../src/util/exitCodes.js";

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/u;

type TempStateContext = {
  statePath: string;
  options: (overrides?: Partial<CommonCommandOptions>) => CommonCommandOptions;
};

async function withTempState<T>(
  run: (context: TempStateContext) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "journey-risk-"));
  const statePath = join(directory, ".journey", "state.json");

  try {
    return await run({
      statePath,
      options: (overrides = {}) => ({
        json: false,
        debug: true,
        color: false,
        stderrColor: false,
        projectRoot: process.cwd(),
        statePath,
        ...overrides,
      }),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readState(statePath: string): Promise<JourneyState> {
  const readResult = await readJourneyState(statePath);

  expect(readResult.kind).toBe("loaded");

  if (readResult.kind !== "loaded") {
    throw new Error("expected a loaded Journey state");
  }

  return readResult.state;
}

async function readStateBytes(statePath: string): Promise<Buffer> {
  return readFile(statePath);
}

function expectStderrOnly(
  result: { exitCode: number; stdout: string; stderr: string },
  exitCode: number,
): void {
  expect(result.exitCode).toBe(exitCode);
  expect(result.stdout).toBe("");
  expect(result.stderr.length).toBeGreaterThan(0);
}

describe("command risk transitions", () => {
  it("fresh run creates default state and pending J-000001", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleRun(options());
      const state = await readState(statePath);

      expect(result).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(result.stdout).toContain("Dream Journey");
      expect(state.quest.seed).toBe("default");
      expect(state.pendingJourney?.journeyId).toBe("J-000001");
      expect(state.history).toEqual([]);
    });
  });

  it("repeated run with pending Journey leaves state bytes unchanged", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      const before = await readStateBytes(statePath);

      const result = await handleRun(options());
      const after = await readStateBytes(statePath);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(after.equals(before)).toBe(true);
    });
  });

  it("state query in human and JSON modes leaves state bytes unchanged", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      const beforeHumanState = await readStateBytes(statePath);

      const humanResult = await handleState(options());
      const afterHumanState = await readStateBytes(statePath);

      const jsonResult = await handleState(options({ json: true }));
      const afterJsonState = await readStateBytes(statePath);

      expect(humanResult).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(jsonResult).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(afterHumanState.equals(beforeHumanState)).toBe(true);
      expect(afterJsonState.equals(beforeHumanState)).toBe(true);
    });
  });

  it("invalid pick exits 2 on stderr only and leaves state bytes unchanged", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      const before = await readStateBytes(statePath);

      const result = await handlePick("999", options());
      const after = await readStateBytes(statePath);

      expectStderrOnly(result, ExitCode.UsageOrInput);
      expect(result.stderr).toContain("option 999 is not available");
      expect(after.equals(before)).toBe(true);
    });
  });

  it("content mismatch exits 3 on stderr only and leaves state bytes unchanged", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      const state = await readState(statePath);

      await writeJourneyStateAtomic(statePath, {
        ...state,
        contentVersion: "stale-content-version",
      });
      const before = await readStateBytes(statePath);

      const result = await handleRun(options());
      const after = await readStateBytes(statePath);

      expectStderrOnly(result, ExitCode.StateOrContent);
      expect(result.stderr).toContain("different content version");
      expect(after.equals(before)).toBe(true);
    });
  });

  it("protected new exits 2 and leaves pending state bytes unchanged", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      const before = await readStateBytes(statePath);

      const result = await handleNew("ash", false, options());
      const after = await readStateBytes(statePath);

      expectStderrOnly(result, ExitCode.UsageOrInput);
      expect(result.stderr).toContain("a pending Journey would be discarded");
      expect(after.equals(before)).toBe(true);
    });
  });

  it("forced new replaces state and clears pending Journey plus history", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      await handlePick("1", options());
      const before = await readState(statePath);

      expect(before.history).toHaveLength(1);
      expect(before.pendingJourney).not.toBeNull();

      const result = await handleNew("ash", true, options());
      const after = await readState(statePath);

      expect(result).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(after.quest.seed).toBe("ash");
      expect(after.pendingJourney).toBeNull();
      expect(after.history).toEqual([]);
      expect(after.generator).toEqual({
        rootJourneyIndex: 1,
        lastJourneyId: null,
        cursors: {},
      });
    });
  });

  it("bare journey command replaces existing state with random first Journey", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      await handlePick("1", options());

      const result = await handleJourney(options());
      const after = await readState(statePath);

      expect(result).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(result.stdout).toContain("Dream Journey");
      expect(after.quest.seed).toMatch(/^random:[0-9a-f-]{36}$/u);
      expect(after.pendingJourney?.journeyId).toBe("J-000001");
      expect(after.history).toEqual([]);
      expect(after.generator).toMatchObject({
        rootJourneyIndex: 2,
        lastJourneyId: "J-000001",
        cursors: {},
      });
    });
  });

  it("valid pick records history without applying Journey effects", async () => {
    await withTempState(async ({ statePath, options }) => {
      await handleRun(options());
      const before = await readState(statePath);
      const pending = before.pendingJourney;

      expect(pending).not.toBeNull();

      if (!pending) {
        throw new Error("expected a pending Journey");
      }

      const selectedOption =
        pending.options.find((option) => option.effects.length > 0) ??
        pending.options[0];

      expect(selectedOption).toBeDefined();
      expect(selectedOption.effects.length).toBeGreaterThan(0);

      const result = await handlePick(String(selectedOption.number), options());
      const after = await readState(statePath);
      const recordedPick = after.history.at(-1);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(recordedPick).toMatchObject({
        journeyId: pending.journeyId,
        shapeId: pending.shapeId,
        selectedOptionNumber: selectedOption.number,
        selectedOptionText: selectedOption.text,
        effectSimulation: "not_applied",
      });
      expect(after.quest.resources).toEqual(before.quest.resources);
      expect(after.quest.deck.entries).toEqual(before.quest.deck.entries);
      expect(after.quest.activeDreamsigns).toEqual(before.quest.activeDreamsigns);
      expect(after.quest.route).toEqual(before.quest.route);
    });
  });

  it("run --json and state --json parse as JSON and contain no ANSI", async () => {
    await withTempState(async ({ options }) => {
      const runResult = await handleRun(options({ json: true }));
      const stateResult = await handleState(options({ json: true }));

      expect(runResult).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(stateResult).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(runResult.stdout).not.toMatch(ANSI_PATTERN);
      expect(stateResult.stdout).not.toMatch(ANSI_PATTERN);
      expect(JSON.parse(runResult.stdout)).toMatchObject({
        status: "ok",
        command: "run",
      });
      expect(JSON.parse(stateResult.stdout)).toMatchObject({
        status: "ok",
        command: "state",
      });
    });
  });

  it("--no-debug hides human debug while stored manifest metadata remains", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleRun(options({ debug: false }));
      const state = await readState(statePath);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("Debug");
      expect(state.pendingJourney?.debug).toMatchObject({
        selectedShapeId: expect.any(String),
        optionValues: expect.any(Array),
      });
    });
  });
});

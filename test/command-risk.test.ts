import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleJourney } from "../src/commands/journey.js";
import type { CommonCommandOptions } from "../src/commands/options.js";
import { handleRun } from "../src/commands/run.js";
import { readJourneyState } from "../src/state/state.js";
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
        debug: false,
        debugContext: false,
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

async function expectMissingState(statePath: string): Promise<void> {
  await expect(readFile(statePath)).rejects.toThrow();
  await expect(readJourneyState(statePath)).resolves.toEqual({ kind: "missing" });
}

describe("stateless command risk transitions", () => {
  it("bare journey generates without creating local simulator state", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({ seed: "qa", stage: "late" }));

      expect(result).toMatchObject({
        exitCode: ExitCode.Success,
        stderr: "",
      });
      expect(result.stdout).toContain("Dream Journey");
      expect(result.stdout).not.toContain("journey pick");
      await expectMissingState(statePath);
    });
  });

  it("run is a stateless alias and does not read existing state", async () => {
    await withTempState(async ({ statePath, options }) => {
      const first = await handleRun(options({ seed: "qa", stage: "mid" }));
      const second = await handleRun(options({ seed: "qa", stage: "mid" }));

      expect(first.exitCode).toBe(ExitCode.Success);
      expect(second.exitCode).toBe(ExitCode.Success);
      expect(first.stdout).toBe(second.stdout);
      await expectMissingState(statePath);
    });
  });

  it("batch generation increments root indexes without writing simulator state", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "qa",
        stage: "early",
        count: 4,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");

      const payload = JSON.parse(result.stdout);

      expect(payload.journeys.map((entry: { manifest: { journeyId: string } }) =>
        entry.manifest.journeyId
      )).toEqual(["J-000001", "J-000002", "J-000003", "J-000004"]);
      expect(payload.journeys.every((entry: { stage: string }) =>
        entry.stage === "early"
      )).toBe(true);
      await expectMissingState(statePath);
    });
  });

  it("seeded stage and forced shape produce a complete tree", async () => {
    await withTempState(async ({ statePath, options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "late",
        shape: "prize_ladder",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Decision Tree");
      expect(result.stdout).toContain("Level 1");
      expect(result.stdout).toContain("Claim:");
      await expectMissingState(statePath);
    });
  });

  it("JSON contains manifest, context, tree data, and no ANSI", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        json: true,
        seed: "qa",
        stage: "mid",
        shape: "random_pool_draws",
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toMatch(ANSI_PATTERN);

      const payload = JSON.parse(result.stdout);

      expect(payload).toMatchObject({
        status: "ok",
        contentVersion: expect.any(String),
        catalogVersion: "journey-shapes:v16",
        seed: "qa",
        stage: "mid",
        shapeId: "random_pool_draws",
        manifest: {
          schemaVersion: 2,
          shapeId: "random_pool_draws",
          versions: {
            contentVersion: expect.any(String),
            shapeCatalogVersion: "journey-shapes:v16",
            effectCatalogVersion: "effects:v7",
            valueModelVersion: "value:v10",
            rendererVersion: "renderer:v1",
            manifestContractVersion: "manifest:v2",
          },
          tree: expect.any(Object),
          rewardPool: expect.any(Object),
        },
        context: {
          deck: expect.any(Object),
          draftPool: expect.any(Array),
          dreamsignPoolIds: expect.any(Array),
        },
      });
      expect(payload.manifest.versions.contentVersion).toBe(payload.contentVersion);
      expect(payload.manifest.versions.shapeCatalogVersion).toBe(payload.catalogVersion);
    });
  });

  it("--debug-context adds human context without enabling generation debug", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "mid",
        debugContext: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stdout).toContain("Debug Context");
      expect(result.stdout).toContain("Deck list:");
      expect(result.stdout).not.toContain("Selected shape:");
    });
  });

  it("--debug adds generation metadata explicitly", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "mid",
        debug: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stdout).toContain("Debug");
      expect(result.stdout).toContain("Selected shape:");
    });
  });

  it("forced wager output shows odds and debugs the committed roll", async () => {
    await withTempState(async ({ options }) => {
      const result = await handleJourney(options({
        seed: "qa",
        stage: "early",
        shape: "single_wager",
        debug: true,
      }));

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.stderr).toBe("");
      expect(result.stdout).toMatch(
        /Pay \d+ essence\. \d+% chance\. On success: .+; on failure: gain nothing\./u,
      );
      expect(result.stdout).toContain("Precommitted outcomes:");
      expect(result.stdout).toMatch(/1\. \d+% wager:/u);
      expect(result.stdout).toContain("committed roll:");
    });
  });
});

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";

const execFileAsync = promisify(execFile);
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/u;

describe("buildProgram", () => {
  beforeEach(async () => {
    await rm(".journey", { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(".journey", { recursive: true, force: true });
  });

  it("registers only the stateless run alias", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toEqual(["run"]);
  });

  it("exposes the built journey bin without pick/new/state commands", async () => {
    const { stdout, stderr } = await execFileAsync(
      "npm",
      ["run", "journey", "--", "--help"],
      { cwd: process.cwd(), timeout: 15_000 },
    );

    expect(stderr).toBe("");
    expect(stdout).toContain("Usage: journey");
    expect(stdout).toContain("run");
    expect(stdout).not.toContain("pick");
    expect(stdout).not.toContain("new");
    expect(stdout).not.toContain("state [options]");
  }, 20_000);

  it("rejects unknown and incomplete generation flags", async () => {
    await expect(
      execFileAsync(
        "npm",
        ["run", "journey", "--", "--not-a-real-flag"],
        { cwd: process.cwd(), timeout: 15_000 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("unknown option '--not-a-real-flag'"),
    });

    await expect(
      execFileAsync(
        "npm",
        ["run", "journey", "--", "--seed"],
        { cwd: process.cwd(), timeout: 15_000 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("option '--seed <seed>' argument missing"),
    });

    await expect(
      execFileAsync(
        "npm",
        ["run", "journey", "--", "--count", "0"],
        { cwd: process.cwd(), timeout: 15_000 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("error: option '--count <count>' argument '0' is invalid"),
    });

    await expect(
      execFileAsync(
        "npm",
        ["run", "journey", "--", "run", "--not-a-real-flag"],
        { cwd: process.cwd(), timeout: 15_000 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("unknown option '--not-a-real-flag'"),
    });
  }, 30_000);

  it("rejects unknown forced shapes with the project error", async () => {
    const retiredShapeId = ["resolved", "random", "series"].join("_");

    await expect(
      execFileAsync(
        "npm",
        ["run", "journey", "--", "--seed", "qa", "--shape", retiredShapeId],
        { cwd: process.cwd(), timeout: 15_000 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(`unknown Journey shape '${retiredShapeId}'`),
    });
  }, 30_000);

  it("rejects the deleted single_rule_trial forced shape", async () => {
    await expect(
      execFileAsync(
        "npm",
        ["run", "journey", "--", "--seed", "qa", "--shape", "single_rule_trial"],
        { cwd: process.cwd(), timeout: 15_000 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("unknown Journey shape 'single_rule_trial'"),
    });
  }, 30_000);

  it("emits parseable stateless JSON through the npm run journey contract", async () => {
    const result = await execFileAsync(
      "npm",
      ["run", "journey", "--", "--seed", "qa", "--stage", "late", "--json"],
      { cwd: process.cwd(), timeout: 15_000 },
    );

    expect(result.stderr).toBe("");
    expect(result.stdout).not.toMatch(ANSI_PATTERN);

    const payload = JSON.parse(result.stdout);

    expect(payload).toMatchObject({
      status: "ok",
      command: "journey",
      seed: "qa",
      stage: "late",
      manifest: {
        schemaVersion: 2,
        journeyId: "J-000001",
        seed: "qa",
        stage: "late",
        versions: {
          contentVersion: expect.any(String),
          shapeCatalogVersion: "journey-shapes:v23",
          effectCatalogVersion: "effects:v7",
          valueModelVersion: "value:v10",
          rendererVersion: "renderer:v1",
          manifestContractVersion: "manifest:v2",
        },
      },
      context: {
        deck: expect.any(Object),
      },
    });
    expect(payload).not.toHaveProperty("nextCommands");
    expect(payload).not.toHaveProperty("pendingJourney");
    expect(payload.manifest.versions.contentVersion).toBe(payload.contentVersion);
    expect(payload.manifest.versions.shapeCatalogVersion).toBe(payload.catalogVersion);
  }, 30_000);

  it("emits a deterministic stateless JSON batch", async () => {
    const result = await execFileAsync(
      "npm",
      [
        "run",
        "journey",
        "--",
        "--seed",
        "qa",
        "--stage",
        "early",
        "--count",
        "3",
        "--json",
      ],
      { cwd: process.cwd(), timeout: 20_000 },
    );

    expect(result.stderr).toBe("");
    expect(result.stdout).not.toMatch(ANSI_PATTERN);

    const payload = JSON.parse(result.stdout);

    expect(payload).toMatchObject({
      status: "ok",
      command: "journey",
      seed: "qa",
      count: 3,
      parameters: {
        seed: "qa",
        stage: "early",
        count: 3,
      },
      journeys: [
        {
          index: 1,
          seed: "qa",
          stage: "early",
          manifest: {
            schemaVersion: 2,
            journeyId: "J-000001",
            rootJourneyIndex: 1,
            versions: {
              contentVersion: expect.any(String),
              shapeCatalogVersion: "journey-shapes:v23",
            },
          },
        },
        {
          index: 2,
          seed: "qa",
          stage: "early",
          manifest: {
            schemaVersion: 2,
            journeyId: "J-000002",
            rootJourneyIndex: 2,
            versions: {
              contentVersion: expect.any(String),
              shapeCatalogVersion: "journey-shapes:v23",
            },
          },
        },
        {
          index: 3,
          seed: "qa",
          stage: "early",
          manifest: {
            schemaVersion: 2,
            journeyId: "J-000003",
            rootJourneyIndex: 3,
            versions: {
              contentVersion: expect.any(String),
              shapeCatalogVersion: "journey-shapes:v23",
            },
          },
        },
      ],
    });
    expect(payload).not.toHaveProperty("manifest");
    for (const entry of payload.journeys) {
      expect(entry.manifest.versions.contentVersion).toBe(payload.contentVersion);
      expect(entry.manifest.versions.shapeCatalogVersion).toBe(payload.catalogVersion);
    }
  }, 30_000);

  it("runs bare npm run journey without writing simulator state", async () => {
    const journeyResult = await execFileAsync(
      "npm",
      ["run", "journey", "--", "--seed", "qa", "--no-color"],
      { cwd: process.cwd(), timeout: 15_000 },
    );

    expect(journeyResult.stderr).toBe("");
    expect(journeyResult.stdout).toContain("Dream Journey");
    await expect(rm(".journey", { recursive: true })).rejects.toThrow();
  }, 30_000);
});

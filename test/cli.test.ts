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
        journeyId: "J-000001",
        seed: "qa",
        stage: "late",
      },
      context: {
        deck: expect.any(Object),
      },
    });
    expect(payload).not.toHaveProperty("nextCommands");
    expect(payload).not.toHaveProperty("pendingJourney");
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
            journeyId: "J-000001",
            rootJourneyIndex: 1,
          },
        },
        {
          index: 2,
          seed: "qa",
          stage: "early",
          manifest: {
            journeyId: "J-000002",
            rootJourneyIndex: 2,
          },
        },
        {
          index: 3,
          seed: "qa",
          stage: "early",
          manifest: {
            journeyId: "J-000003",
            rootJourneyIndex: 3,
          },
        },
      ],
    });
    expect(payload).not.toHaveProperty("manifest");
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

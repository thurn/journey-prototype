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

  it("registers the scaffold commands", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toEqual(["run", "pick", "state", "new"]);
  });

  it("exposes the built journey bin through npm exec", async () => {
    const { stdout, stderr } = await execFileAsync(
      "npm",
      ["exec", "--", "journey", "--help"],
      { cwd: process.cwd(), timeout: 15_000 },
    );

    expect(stderr).toBe("");
    expect(stdout).toContain("Usage: journey");
    expect(stdout).toContain("run");
    expect(stdout).toContain("pick");
  }, 20_000);

  it("emits parseable JSON through the exact npm run journey contract", async () => {
    const runResult = await execFileAsync(
      "npm",
      ["run", "journey", "--", "run", "--json"],
      { cwd: process.cwd(), timeout: 15_000 },
    );
    const stateResult = await execFileAsync(
      "npm",
      ["run", "journey", "--", "state", "--json"],
      { cwd: process.cwd(), timeout: 15_000 },
    );

    expect(runResult.stderr).toBe("");
    expect(stateResult.stderr).toBe("");
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
  }, 30_000);

  it("runs bare npm run journey as a fresh random first Journey", async () => {
    await execFileAsync(
      "npm",
      ["run", "journey", "--", "run", "--json"],
      { cwd: process.cwd(), timeout: 15_000 },
    );

    const journeyResult = await execFileAsync(
      "npm",
      ["run", "journey"],
      { cwd: process.cwd(), timeout: 15_000 },
    );
    const stateResult = await execFileAsync(
      "npm",
      ["run", "journey", "--", "state", "--json"],
      { cwd: process.cwd(), timeout: 15_000 },
    );
    const statePayload = JSON.parse(stateResult.stdout);

    expect(journeyResult.stderr).toBe("");
    expect(journeyResult.stdout).toContain("Dream Journey");
    expect(stateResult.stderr).toBe("");
    expect(statePayload.state.seed).toMatch(/^random:[0-9a-f-]{36}$/u);
    expect(statePayload.state.pendingJourney.journeyId).toBe("J-000001");
    expect(statePayload.state.history).toEqual([]);
  }, 30_000);
});

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";

const execFileAsync = promisify(execFile);

describe("buildProgram", () => {
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
});

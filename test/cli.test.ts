import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";

describe("buildProgram", () => {
  it("registers the scaffold commands", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toEqual(["run", "pick", "state", "new"]);
  });
});

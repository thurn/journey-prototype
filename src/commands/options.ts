export type CommonCommandOptions = {
  json: boolean;
  debug: boolean;
  debugContext: boolean;
  color: boolean;
  stderrColor: boolean;
  projectRoot: string;
  statePath: string;
  seed?: string;
  stage?: "early" | "mid" | "late";
  shape?: string;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommonCommandOptions = {
  json: boolean;
  debug: boolean;
  verbose: boolean;
  debugContext: boolean;
  showDeck: boolean;
  color: boolean;
  stderrColor: boolean;
  projectRoot: string;
  statePath: string;
  seed?: string;
  stage?: "early" | "mid" | "late";
  shape?: string;
  count?: number;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommonCommandOptions = {
  json: boolean;
  debug: boolean;
  verbose: boolean;
  debugContext: boolean;
  color: boolean;
  stderrColor: boolean;
  projectRoot: string;
  statePath: string;
  seed?: string;
  stage?: "early" | "mid" | "late";
  shape?: string;
  count?: number;
  debugPayloadFamily?: string;
  debugPayloadVariant?: string;
  debugListPayloads: boolean;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

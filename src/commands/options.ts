export type CommonCommandOptions = {
  json: boolean;
  debug: boolean;
  color: boolean;
  stderrColor: boolean;
  projectRoot: string;
  statePath: string;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

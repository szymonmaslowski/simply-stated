import ts from 'typescript';

export const createProgramFromTsconfig = (tsconfigPath: string) => {
  const configDiagnostics: ts.Diagnostic[] = [];
  const parsedConfig = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic =>
        configDiagnostics.push(diagnostic),
    },
  );

  if (!parsedConfig) {
    const [diagnostic] = configDiagnostics;
    throw new Error(
      `Cannot read tsconfig '${tsconfigPath}'${
        diagnostic
          ? `: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
          : ''
      }`,
    );
  }

  return ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
};

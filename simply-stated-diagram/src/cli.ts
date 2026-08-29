import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import ts from 'typescript';
import { extractMachines } from './extract';
import { createProgramFromTsconfig } from './program';
import { renderHtml } from './render/html';
import { renderMermaid } from './render/mermaid';
import type { MachineGraph } from './types';

const FORMATS = ['json', 'mermaid', 'html'] as const;
type Format = (typeof FORMATS)[number];

const USAGE = `Usage: simply-stated-diagram [file...] [options]

Options:
  --tsconfig <path>   tsconfig to build the program from (default: nearest one)
  --format <format>   json | mermaid | html (default: json)
  --machine <name>    only this machine (repeatable)
  --out <path>        write to a file instead of stdout
  -h, --help          show this message`;

export class CliError extends Error {}

const isFormat = (value: string): value is Format =>
  (FORMATS as readonly string[]).includes(value);

const findTsconfig = (startPath: string) => {
  const configPath = ts.findConfigFile(startPath, ts.sys.fileExists);
  if (!configPath) {
    throw new CliError(`No tsconfig.json found from '${startPath}'`);
  }
  return configPath;
};

const matchesRequestedFiles = (graph: MachineGraph, files: string[]) =>
  files.length === 0 ||
  files.some(file => path.resolve(file) === path.resolve(graph.sourceFile));

const render = (graphs: MachineGraph[], format: Format) => {
  if (format === 'json') return `${JSON.stringify(graphs, null, 2)}\n`;
  if (format === 'html') return renderHtml(graphs);
  return `${graphs.map(renderMermaid).join('\n\n')}\n`;
};

export const runCli = (argv: string[]) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      tsconfig: { type: 'string' },
      format: { type: 'string', default: 'json' },
      machine: { type: 'string', multiple: true, default: [] },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) return USAGE;

  if (!isFormat(values.format)) {
    throw new CliError(
      `Unknown format '${values.format}'. Expected ${FORMATS.join(', ')}`,
    );
  }

  const tsconfigPath =
    values.tsconfig ??
    findTsconfig(
      positionals[0]
        ? path.dirname(path.resolve(positionals[0]))
        : process.cwd(),
    );

  const graphs = extractMachines(createProgramFromTsconfig(tsconfigPath))
    .filter(graph => matchesRequestedFiles(graph, positionals))
    .filter(
      graph =>
        values.machine.length === 0 || values.machine.includes(graph.name),
    );

  if (graphs.length === 0) {
    throw new CliError(`No machines found via '${tsconfigPath}'`);
  }

  const output = render(graphs, values.format);
  if (!values.out) return output;

  writeFileSync(values.out, output);
  return `Wrote ${graphs.length} machine${graphs.length === 1 ? '' : 's'} to ${values.out}\n`;
};

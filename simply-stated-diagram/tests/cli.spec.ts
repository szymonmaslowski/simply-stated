import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CliError, runCli } from '../src';
import type { MachineGraph } from '../src';

const fixturesTsconfig = fileURLToPath(
  new URL('./fixtures/tsconfig.json', import.meta.url),
);
const fixturesFile = fileURLToPath(
  new URL('./fixtures/machines.ts', import.meta.url),
);

const withFixtures = (...argv: string[]) =>
  runCli(['--tsconfig', fixturesTsconfig, ...argv]);

describe('runCli', () => {
  it('prints json by default', () => {
    const graphs = JSON.parse(withFixtures()) as MachineGraph[];
    expect(graphs.map(graph => graph.name).sort()).toEqual([
      'crossingMachine',
      'fetchMachine',
      'jobMachine',
      'lightMachine',
    ]);
  });

  it('filters by machine name', () => {
    const graphs = JSON.parse(
      withFixtures('--machine', 'lightMachine'),
    ) as MachineGraph[];
    expect(graphs).toHaveLength(1);
    expect(graphs[0]?.states.map(state => state.name)).toEqual([
      'Red',
      'Green',
    ]);
  });

  it('filters by source file positional', () => {
    const graphs = JSON.parse(
      withFixtures(fixturesFile, '--machine', 'jobMachine'),
    ) as MachineGraph[];
    expect(graphs).toHaveLength(1);
  });

  it('renders mermaid for every machine', () => {
    const output = withFixtures('--format', 'mermaid');
    expect(output.match(/stateDiagram-v2/g)).toHaveLength(4);
  });

  it('renders a standalone html page', () => {
    const output = withFixtures('--format', 'html');
    expect(output.startsWith('<!doctype html>')).toBe(true);
    expect(output).toContain('globalThis["mermaid"]');
  });

  it('writes to a file and reports what it wrote', () => {
    const outPath = path.join(
      mkdtempSync(path.join(tmpdir(), 'simply-stated-diagram-')),
      'diagram.mmd',
    );
    const message = withFixtures('--format', 'mermaid', '--out', outPath);
    expect(message).toBe(`Wrote 4 machines to ${outPath}\n`);
    expect(readFileSync(outPath, 'utf8')).toContain('stateDiagram-v2');
  });

  it('rejects an unknown format', () => {
    expect(() => withFixtures('--format', 'svg')).toThrow(CliError);
  });

  it('reports when nothing matches', () => {
    expect(() => withFixtures('--machine', 'nope')).toThrow(
      /No machines found/,
    );
  });

  it('prints usage on --help', () => {
    expect(runCli(['--help'])).toContain('Usage: simply-stated-diagram');
  });
});

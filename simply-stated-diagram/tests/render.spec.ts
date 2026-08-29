import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createProgramFromTsconfig,
  extractMachines,
  renderHtml,
  renderMermaid,
} from '../src';
import type { MachineGraph } from '../src';

const fixturesTsconfig = fileURLToPath(
  new URL('./fixtures/tsconfig.json', import.meta.url),
);

const graphs = extractMachines(createProgramFromTsconfig(fixturesTsconfig));

const graphNamed = (name: string) => {
  const graph = graphs.find(candidate => candidate.name === name);
  if (!graph) throw new Error(`No machine '${name}' extracted`);
  return graph;
};

const linesOf = (graph: MachineGraph) => renderMermaid(graph).split('\n');

describe('renderMermaid', () => {
  it('opens with a left-to-right state diagram', () => {
    expect(linesOf(graphNamed('lightMachine')).slice(0, 2)).toEqual([
      'stateDiagram-v2',
      '  direction LR',
    ]);
  });

  it('declares every state under a generated id', () => {
    const lines = linesOf(graphNamed('lightMachine'));
    expect(lines).toContain('  state "Red" as state0');
    expect(lines).toContain('  state "Green" as state1');
    expect(lines).toContain('  state0 --> state1 : go');
  });

  it('names the cross-state group instead of a state id', () => {
    const lines = linesOf(graphNamed('fetchMachine'));
    expect(lines).toContain('  state "any state" as state4');
    expect(lines).toContain('  state4 --> state0 : reset');
  });

  it('emits one edge per branch target', () => {
    const lines = linesOf(graphNamed('fetchMachine'));
    expect(lines).toContain('  state1 --> state1 : rejected(string)');
    expect(lines).toContain('  state1 --> state3 : rejected(string)');
  });

  it('folds object payloads away from the label', () => {
    expect(linesOf(graphNamed('fetchMachine'))).toContain(
      '  state0 --> state1 : fetch({…})',
    );
  });

  it('keeps primitive and union payloads readable', () => {
    const lines = linesOf(graphNamed('jobMachine'));
    expect(lines).toContain('  state0 --> state1 : start(string)');
    expect(
      lines.some(line => line.includes("decide('finish' | 'restart')")),
    ).toBe(true);
  });
});

describe('renderHtml', () => {
  const html = renderHtml(graphs);

  it('inlines the mermaid runtime so the page works offline', () => {
    expect(html).toContain('globalThis["mermaid"]');
    expect(html).not.toContain('<script src=');
  });

  it('embeds one section and one diagram per machine', () => {
    expect(html.match(/<pre class="mermaid">/g)).toHaveLength(graphs.length);
    for (const graph of graphs) {
      expect(html).toContain(`<section id="${graph.name}">`);
    }
  });

  it('lists the full payload type in the table', () => {
    expect(html).toContain('<code>{ query: string; }</code>');
  });

  it('escapes the diagram source so arrows cannot close the tag', () => {
    const [, diagram = ''] =
      /<pre class="mermaid">([\s\S]*?)<\/pre>/.exec(html) ?? [];
    expect(diagram).toContain('--&gt;');
    expect(diagram).not.toContain('-->');
  });

  it('calls out states with no outgoing events', () => {
    expect(html).toContain('No outgoing events: <code>Done</code>');
  });
});

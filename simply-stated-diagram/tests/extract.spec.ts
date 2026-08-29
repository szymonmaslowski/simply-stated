import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProgramFromTsconfig, extractMachines } from '../src';
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

const transition = (graph: MachineGraph, state: string, event: string) => {
  const found = graph.states
    .find(candidate => candidate.name === state)
    ?.transitions.find(candidate => candidate.event === event);
  if (!found) throw new Error(`No transition ${state}.${event}`);
  return found;
};

const targetsOf = (graph: MachineGraph, state: string, event: string) =>
  [...transition(graph, state, event).targets].sort();

describe('extractMachines', () => {
  it('finds every machine in the program', () => {
    expect(graphs.map(graph => graph.name).sort()).toEqual([
      'crossingMachine',
      'fetchMachine',
      'jobMachine',
      'lightMachine',
    ]);
  });

  it('resolves a single-target handler with its payload', () => {
    expect(transition(graphNamed('fetchMachine'), 'Idle', 'fetch')).toEqual({
      event: 'fetch',
      payload: '{ query: string; }',
      targets: ['Fetching'],
    });
  });

  it('resolves branching handlers to every reachable state', () => {
    const machine = graphNamed('fetchMachine');
    expect(targetsOf(machine, 'Fetching', 'rejected')).toEqual([
      'Failure',
      'Fetching',
    ]);
    expect(targetsOf(machine, 'Fetching', 'settled')).toEqual([
      'Idle',
      'Success',
    ]);
    expect(targetsOf(graphNamed('jobMachine'), 'Running', 'decide')).toEqual([
      'Done',
      'Queued',
    ]);
  });

  it('resolves handlers that delegate to a helper', () => {
    expect(targetsOf(graphNamed('jobMachine'), 'Running', 'tick')).toEqual([
      'Done',
      'Running',
    ]);
  });

  it('reports the full state set for widened handler annotations', () => {
    expect(targetsOf(graphNamed('jobMachine'), 'Running', 'bail')).toEqual([
      'Done',
      'Queued',
      'Running',
    ]);
  });

  it('reads cross-state handlers with the payload at argument zero', () => {
    expect(transition(graphNamed('fetchMachine'), '*', 'reset')).toEqual({
      event: 'reset',
      payload: null,
      targets: ['Idle'],
    });
  });

  it('reads state creators used as handlers', () => {
    expect(transition(graphNamed('lightMachine'), 'Red', 'go').targets).toEqual(
      ['Green'],
    );
  });

  it('reads events contributed by forwardEvents spreads', () => {
    const machine = graphNamed('crossingMachine');
    expect(transition(machine, 'Open', 'go').targets).toEqual(['Open']);
    expect(transition(machine, 'Open', 'stop').targets).toEqual(['Open']);
  });

  it('keeps terminal states', () => {
    const done = graphNamed('jobMachine').states.find(
      state => state.name === 'Done',
    );
    expect(done?.transitions).toEqual([]);
  });
});

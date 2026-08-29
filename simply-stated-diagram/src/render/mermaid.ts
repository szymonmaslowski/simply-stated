import type { MachineGraph, Transition } from '../types';

const CROSS_STATE_KEY = '*';
const CROSS_STATE_LABEL = 'any state';
const MAX_PAYLOAD_LABEL = 32;

// Mermaid labels run to the end of the line, so anything that reads as syntax
// there (object braces, colons, quotes) is folded away; the full type stays in
// the accompanying table.
const payloadLabel = (payload: string) => {
  if (payload.includes('{')) return '{…}';
  const collapsed = payload.replace(/\s+/g, ' ').replace(/["`]/g, "'").trim();
  const shortened =
    collapsed.length > MAX_PAYLOAD_LABEL
      ? `${collapsed.slice(0, MAX_PAYLOAD_LABEL - 1)}…`
      : collapsed;
  return shortened.replace(/[:;]/g, ' ');
};

export const transitionLabel = ({ event, payload }: Transition) =>
  payload === null ? event : `${event}(${payloadLabel(payload)})`;

const quoted = (text: string) => `"${text.replace(/"/g, "'")}"`;

export const renderMermaid = (graph: MachineGraph) => {
  const nodeIds = new Map<string, string>();
  const nodeIdOf = (stateName: string) => {
    const existing = nodeIds.get(stateName);
    if (existing) return existing;
    const id = `state${nodeIds.size}`;
    nodeIds.set(stateName, id);
    return id;
  };

  const declaredStateNames = graph.states.map(state => state.name);
  const targetStateNames = graph.states.flatMap(state =>
    state.transitions.flatMap(transition => transition.targets),
  );
  for (const stateName of [...declaredStateNames, ...targetStateNames]) {
    nodeIdOf(stateName);
  }

  const declarations = [...nodeIds].map(
    ([stateName, id]) =>
      `  state ${quoted(stateName === CROSS_STATE_KEY ? CROSS_STATE_LABEL : stateName)} as ${id}`,
  );

  const edges = graph.states.flatMap(state =>
    state.transitions.flatMap(transition =>
      transition.targets.map(
        target =>
          `  ${nodeIdOf(state.name)} --> ${nodeIdOf(target)} : ${transitionLabel(transition)}`,
      ),
    ),
  );

  return ['stateDiagram-v2', '  direction LR', ...declarations, ...edges].join(
    '\n',
  );
};

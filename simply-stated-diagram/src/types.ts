export type Transition = {
  event: string;
  payload: string | null;
  targets: string[];
};

export type StateNode = {
  name: string;
  transitions: Transition[];
};

export type MachineGraph = {
  name: string;
  sourceFile: string;
  states: StateNode[];
};

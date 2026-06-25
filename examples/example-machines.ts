import { combineStates, defineState } from 'simply-stated';

export const fetchMachine = combineStates(
  defineState('Idle'),
  defineState('Loading'),
  defineState('Success').withData<{ value: string }>(),
  defineState('Failure').withData<{ error: string }>(),
).createMachine(state => ({
  Idle: {
    fetch: () => state.Loading(),
  },
  Loading: {
    resolved: (_, value: string) => state.Success({ value }),
    rejected: (_, error: string) => state.Failure({ error }),
  },
  Success: {
    refetch: () => state.Loading(),
  },
  Failure: {
    retry: () => state.Loading(),
  },
}));

export const toggleMachine = combineStates(
  defineState('Open', 'Closed'),
).createMachine(state => ({
  Open: {
    closed: () => state.Closed(),
  },
  Closed: {
    opened: () => state.Open(),
  },
}));

export const jobMachine = combineStates(
  defineState('Queued', 'Running', 'Done').withData<{
    id: string;
    percentage: number;
  }>(),
).createMachine(state => ({
  Queued: {
    started: data => state.Running(data),
  },
  Running: {
    progressed: (data, percentage: number) =>
      state.Running({ ...data, percentage }),
    finished: data => state.Done(data),
  },
  Done: {},
}));

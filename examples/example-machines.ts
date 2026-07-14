import { combineStates, defineState } from 'simply-stated';

export const fetchMachine = combineStates(
  defineState('Idle'),
  defineState('Fetching').withData<{ query: string }>(),
  defineState('Success').withData<{ query: string; value: string }>(),
  defineState('Failure').withData<{ query: string; error: string }>(),
).createMachine(state => ({
  Idle: {
    fetch: (_, paylaod: { query: string }) => state.Fetching(paylaod),
  },
  Fetching: {
    resolved: (data, value: string) => state.Success({ ...data, value }),
    rejected: (data, error: string) => state.Failure({ ...data, error }),
  },
  Success: {
    refetch: ({ query }) => state.Fetching({ query }),
  },
  Failure: {
    retry: ({ query }) => state.Fetching({ query }),
  },
}));

export const toggleMachine = combineStates(
  defineState('On', 'Off'),
).createMachine(state => ({
  On: { off: state.Off },
  Off: { on: state.On },
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

import {
  combineStates,
  defineState,
  forwardEvents,
  type StateOf,
} from 'simply-stated';

export const fetchMachine = combineStates(
  defineState('Idle'),
  defineState('Fetching').withData<{ query: string; retries: number }>(),
  defineState('Success').withData<{ query: string; value: string }>(),
  defineState('Failure').withData<{ query: string; error: string }>(),
).createMachine(state => ({
  Idle: {
    fetch: (_, payload: { query: string }) =>
      state.Fetching({ ...payload, retries: 0 }),
  },
  Fetching: {
    resolved: (data, value: string) => state.Success({ ...data, value }),
    rejected: (data, error: string) => {
      if (data.retries < 3) {
        return state.Fetching({ ...data, retries: data.retries + 1 });
      }
      return state.Failure({ query: data.query, error });
    },
    settled: (data, succeeded: boolean) =>
      succeeded ? state.Success({ ...data, value: '' }) : state.Idle(),
  },
  Success: { refetch: ({ query }) => state.Fetching({ query, retries: 0 }) },
  Failure: { retry: ({ query }) => state.Fetching({ query, retries: 0 }) },
  '*': { reset: () => state.Idle() },
}));

export const lightMachine = combineStates(
  defineState('Red', 'Green'),
).createMachine(state => ({
  Red: { go: state.Green },
  Green: { stop: state.Red },
}));

type LightState = StateOf<(typeof lightMachine)['state']>;

export const crossingMachine = combineStates(
  defineState('Open').withData<{ light: LightState }>(),
  defineState('Closed'),
).createMachine(state => ({
  Open: {
    ...forwardEvents(lightMachine, state.Open, data => data.light),
    close: () => state.Closed(),
  },
  Closed: { open: () => state.Open({ light: lightMachine.state.Red() }) },
}));

const { state: jobState, createMachine: createJobMachine } = combineStates(
  defineState('Queued'),
  defineState('Running').withData<{ id: string; tick: number }>(),
  defineState('Done').withData<{ id: string }>(),
);

const advance = (data: { id: string; tick: number }) =>
  data.tick > 5
    ? jobState.Done({ id: data.id })
    : jobState.Running({ ...data, tick: data.tick + 1 });

const bail = (): StateOf<typeof jobState> => jobState.Queued();

export const jobMachine = createJobMachine({
  Queued: { start: (_, id: string) => jobState.Running({ id, tick: 0 }) },
  Running: {
    tick: data => advance(data),
    bail,
    decide: (data, kind: 'finish' | 'restart') => {
      switch (kind) {
        case 'finish':
          return jobState.Done({ id: data.id });
        default:
          return jobState.Queued();
      }
    },
  },
  Done: {},
});

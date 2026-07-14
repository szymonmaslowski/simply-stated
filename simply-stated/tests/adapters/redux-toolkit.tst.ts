/**
 * Type-level tests for the Redux Toolkit slice adapter
 * (`toSliceOptions`).
 */

import { expect, test } from 'tstyche';
import { combineStates, defineState, is, type StateOf } from '../../src';
import { toSliceOptions } from '../../src/adapters/redux-toolkit';

const makeFetchMachine = () =>
  combineStates(
    defineState('Idle'),
    defineState('Loading'),
    defineState('Success').withData<{ value: string }>(),
    defineState('Failure').withData<{ error: string }>(),
  ).createMachine(state => ({
    Idle: { fetch: () => state.Loading() },
    Loading: {
      resolved: (_, value: string) => state.Success({ value }),
      rejected: (_, error: string) => state.Failure({ error }),
    },
    Success: { refetch: () => state.Loading() },
    Failure: { retry: () => state.Loading() },
  }));

type FetchState = StateOf<ReturnType<typeof makeFetchMachine>['state']>;

test('a user selector receives the machine state', () => {
  const machine = makeFetchMachine();
  const { selectors } = toSliceOptions(machine, {
    initialState: machine.state.Idle(),
    selectors: {
      selectState: state => state,
    },
  });
  const sliceState = {} as Parameters<typeof selectors.selectState>[0];
  expect(selectors.selectState(sliceState)).type.toBe<FetchState>();
});

test('user selectors keep their return type and read the state', () => {
  const machine = makeFetchMachine();
  const { selectors } = toSliceOptions(machine, {
    initialState: machine.state.Idle(),
    selectors: {
      selectError: state =>
        is(state, machine.state.Failure) ? state.data.error : null,
    },
  });
  const sliceState = {} as Parameters<typeof selectors.selectError>[0];
  expect(selectors.selectError(sliceState)).type.toBe<string | null>();
});

// `initialState` must be a state of the machine.
void (() => {
  const machine = makeFetchMachine();
  toSliceOptions(machine, {
    // @ts-expect-error is not assignable
    initialState: { name: 'Nope' },
  });
});

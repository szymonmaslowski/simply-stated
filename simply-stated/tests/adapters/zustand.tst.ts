/**
 * Type-level tests for the Zustand single-instance adapter (`toStore`).
 */

import { createStore } from 'zustand/vanilla';
import { expect, test } from 'tstyche';
import { combineStates, defineState, is, type StateOf } from '../../src';
import { toStore } from '../../src/adapters/zustand';

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

test('the stored state is the machine state union under `state`', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, { initialState: machine.state.Idle() }),
  );
  expect(store.getState().state).type.toBe<FetchState>();
});

test('is() narrows the stored state', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, { initialState: machine.state.Idle() }),
  );
  const state = store.getState().state;
  if (is(state, machine.state.Success)) {
    expect(state.data.value).type.toBe<string>();
  }
});

test('event methods take the event payload (or nothing)', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, { initialState: machine.state.Idle() }),
  );
  expect(store.getState().fetch).type.toBeCallableWith();
  expect(store.getState().resolved).type.toBeCallableWith('value');
  // a required payload cannot be omitted
  expect(store.getState().resolved).type.not.toBeCallableWith();
  expect(store.getState().resolved).type.not.toBeCallableWith(1);
});

test('adjust determines the slice shape', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, {
      initialState: machine.state.Idle(),
      nestingPath: 'current',
      adjust: ({ state, eventActions }) => ({
        current: state,
        actions: eventActions,
      }),
    }),
  );
  expect(store.getState().current).type.toBe<FetchState>();
  expect(store.getState().actions.resolved).type.toBeCallableWith('value');
});

// `initialState` must be a state of the machine.
void (() => {
  const machine = makeFetchMachine();
  toStore(machine, {
    // @ts-expect-error is not assignable
    initialState: { name: 'Nope' },
  });
});

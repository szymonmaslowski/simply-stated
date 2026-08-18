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

test('statePath places the state, leaving the methods at the root', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, {
      initialState: machine.state.Idle(),
      statePath: 'machines.fetch',
    }),
  );
  expect(store.getState().machines.fetch).type.toBe<FetchState>();
  expect(store.getState().resolved).type.toBeCallableWith('value');
});

test('adjustActions determines the method shape only', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, {
      initialState: machine.state.Idle(),
      statePath: 'current',
      adjustActions: ({ machineActions }) => ({ actions: machineActions }),
    }),
  );
  expect(store.getState().current).type.toBe<FetchState>();
  expect(store.getState().actions.resolved).type.toBeCallableWith('value');
});

test('adjusted methods merge into the branch holding the state', () => {
  const machine = makeFetchMachine();
  const store = createStore(
    toStore(machine, {
      initialState: machine.state.Idle(),
      statePath: 'machines.fetch',
      adjustActions: ({ machineActions }) => ({
        machines: { fetchActions: machineActions },
      }),
    }),
  );
  expect(store.getState().machines.fetch).type.toBe<FetchState>();
  expect(store.getState().machines.fetchActions.resolved).type.toBeCallableWith(
    'value',
  );
});

// `initialState` must be a state of the machine.
void (() => {
  const machine = makeFetchMachine();
  toStore(machine, {
    // @ts-expect-error is not assignable
    initialState: { name: 'Nope' },
  });
});

// Adjusted methods may not occupy the slot the state is placed at.
void (() => {
  const machine = makeFetchMachine();
  toStore(machine, {
    initialState: machine.state.Idle(),
    statePath: 'machines.fetch',
    // @ts-expect-error Naming clash at path 'machines.fetch'
    adjustActions: ({ machineActions }) => ({
      machines: { fetch: machineActions },
    }),
  });
});

// Without `adjustActions` the clash is carried by the path option instead.
void (() => {
  const machine = makeFetchMachine();
  toStore(machine, {
    initialState: machine.state.Idle(),
    // @ts-expect-error Naming clash at path 'fetch'
    statePath: 'fetch',
  });
});

// With `statePath` omitted the clash is reported as the missing option.
void (() => {
  const machine = combineStates(
    defineState('Idle'),
    defineState('Busy'),
  ).createMachine(stateCreators => ({
    Idle: { state: () => stateCreators.Busy() },
    Busy: {},
  }));
  // @ts-expect-error Naming clash at path 'state'
  toStore(machine, { initialState: machine.state.Idle() });
});

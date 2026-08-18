/**
 * Type-level tests for the Zustand `combineSlices` helper.
 */

import { createStore } from 'zustand/vanilla';
import { expect, test } from 'tstyche';
import { combineStates, defineState, is, type StateOf } from '../../src';
import { combineSlices, toStore } from '../../src/adapters/zustand';

const makeFetchMachine = () =>
  combineStates(
    defineState('Idle'),
    defineState('Loading'),
    defineState('Success').withData<{ value: string }>(),
  ).createMachine(state => ({
    Idle: { fetch: () => state.Loading() },
    Loading: { resolved: (_, value: string) => state.Success({ value }) },
    Success: { refetch: () => state.Loading() },
  }));

const makeToggleMachine = () =>
  combineStates(defineState('On'), defineState('Off')).createMachine(state => ({
    On: { off: () => state.Off() },
    Off: { on: () => state.On() },
  }));

type FetchState = StateOf<ReturnType<typeof makeFetchMachine>['state']>;
type ToggleState = StateOf<ReturnType<typeof makeToggleMachine>['state']>;

const makeCombined = () => {
  const fetchMachine = makeFetchMachine();
  const toggleMachine = makeToggleMachine();
  return combineSlices(
    toStore(fetchMachine, {
      initialState: fetchMachine.state.Idle(),
      statePath: 'machines.fetch',
    }),
    toStore(toggleMachine, {
      initialState: toggleMachine.state.On(),
      statePath: 'machines.toggle',
      adjustActions: ({ machineActions }) => ({
        toggleActions: machineActions,
      }),
    }),
  );
};

test('the combined slice carries every branch', () => {
  const store = createStore(makeCombined());
  expect(store.getState().machines.fetch).type.toBe<FetchState>();
  expect(store.getState().machines.toggle).type.toBe<ToggleState>();
});

test('every slice’s methods survive the merge, payloads intact', () => {
  const store = createStore(makeCombined());
  expect(store.getState().resolved).type.toBeCallableWith('value');
  expect(store.getState().resolved).type.not.toBeCallableWith(1);
  expect(store.getState().toggleActions.off).type.toBeCallableWith();
});

test('is() narrows a state read from the combined slice', () => {
  const machine = makeFetchMachine();
  const store = createStore(makeCombined());
  const state = store.getState().machines.fetch;
  if (is(state, machine.state.Success)) {
    expect(state.data.value).type.toBe<string>();
  }
});

test('the combined shape composes into the store type', () => {
  const combined = makeCombined();
  type AppStore = ReturnType<typeof combined> & {
    counter: { count: number };
    countUp: () => void;
  };
  const store = createStore<AppStore>()((...params) => ({
    ...combined(...params),
    counter: { count: 0 },
    countUp: () => params[0](current => ({ counter: current.counter })),
  }));
  expect(store.getState().machines.fetch).type.toBe<FetchState>();
  expect(store.getState().counter.count).type.toBe<number>();
});

// Two slices may not claim the same path. See zustand-combine-conflicts.tst.ts
// for every clash case and for why the error lands on the first argument.
void (() => {
  const fetchMachine = makeFetchMachine();
  const toggleMachine = makeToggleMachine();
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.shared'
    toStore(fetchMachine, {
      initialState: fetchMachine.state.Idle(),
      statePath: 'machines.shared',
    }),
    toStore(toggleMachine, {
      initialState: toggleMachine.state.On(),
      statePath: 'machines.shared',
      adjustActions: ({ machineActions }) => ({
        toggleActions: machineActions,
      }),
    }),
  );
});

// Two slices may not claim the same method name either.
void (() => {
  const first = makeFetchMachine();
  const second = makeFetchMachine();
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'fetch', 'resolved', 'refetch'
    toStore(first, {
      initialState: first.state.Idle(),
      statePath: 'machines.first',
    }),
    toStore(second, {
      initialState: second.state.Idle(),
      statePath: 'machines.second',
    }),
  );
});

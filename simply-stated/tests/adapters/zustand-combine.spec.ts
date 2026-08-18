import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState } from '../../src';
import {
  combineSlices,
  toCollectionStore,
  toStore,
} from '../../src/adapters/zustand';

const makeFetchMachine = () => {
  const { createMachine } = combineStates(
    defineState('Idle'),
    defineState('Loading'),
    defineState('Success').withData<{ value: string }>(),
  );
  return createMachine(state => ({
    Idle: { fetch: () => state.Loading() },
    Loading: { resolved: (_, value: string) => state.Success({ value }) },
    Success: { refetch: () => state.Loading() },
  }));
};

const makeToggleMachine = () => {
  const { createMachine } = combineStates(
    defineState('On'),
    defineState('Off'),
  );
  return createMachine(state => ({
    On: { off: () => state.Off() },
    Off: { on: () => state.On() },
  }));
};

describe('combineSlices', () => {
  const setup = () => {
    const fetchMachine = makeFetchMachine();
    const toggleMachine = makeToggleMachine();
    const combined = combineSlices(
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
    return { fetchMachine, toggleMachine, combined };
  };

  it('merges the branches both slices mount under', () => {
    const { combined } = setup();
    const store = createStore(combined);
    expect(store.getState().machines).toEqual({
      fetch: { name: 'Idle' },
      toggle: { name: 'On' },
    });
  });

  it('keeps every slice’s methods driving its own machine', () => {
    const { combined } = setup();
    const store = createStore(combined);
    store.getState().fetch();
    store.getState().toggleActions.off();
    expect(store.getState().machines).toEqual({
      fetch: { name: 'Loading' },
      toggle: { name: 'Off' },
    });
  });

  it('a transition leaves the sibling machine untouched', () => {
    const { combined } = setup();
    const store = createStore(combined);
    store.getState().fetch();
    store.getState().resolved('x');
    expect(store.getState().machines.toggle).toEqual({ name: 'On' });
  });

  it('composes with custom store state added around it', () => {
    const { combined } = setup();
    const store = createStore<
      ReturnType<typeof combined> & { count: number; countUp: () => void }
    >()((...params) => ({
      ...combined(...params),
      count: 0,
      countUp: () => params[0](current => ({ count: current.count + 1 })),
    }));
    store.getState().countUp();
    store.getState().fetch();
    expect(store.getState().count).toBe(1);
    expect(store.getState().machines.fetch).toEqual({ name: 'Loading' });
  });

  it('merges a single-instance slice with a collection slice', () => {
    const fetchMachine = makeFetchMachine();
    const toggleMachine = makeToggleMachine();
    const combined = combineSlices(
      toStore(toggleMachine, {
        initialState: toggleMachine.state.On(),
        statePath: 'machines.toggle',
      }),
      toCollectionStore(fetchMachine, {
        collectionPath: 'machines.fetches',
        adjustActions: ({ machineActions, lifecycleActions }) => ({
          ...machineActions,
          addFetch: lifecycleActions.addEntity,
        }),
      }),
    );
    const store = createStore(combined);
    store.getState().addFetch('a', fetchMachine.state.Idle());
    store.getState().fetch('a');
    store.getState().off();
    expect(store.getState().machines).toEqual({
      toggle: { name: 'Off' },
      fetches: { a: { name: 'Loading' } },
    });
  });
});

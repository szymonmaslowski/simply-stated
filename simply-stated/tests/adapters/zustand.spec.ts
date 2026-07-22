import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState, is } from '../../src';
import { toStore } from '../../src/adapters/zustand';

const makeFetchMachine = () => {
  const { createMachine } = combineStates(
    defineState('Idle'),
    defineState('Loading'),
    defineState('Success').withData<{ value: string }>(),
    defineState('Failure').withData<{ error: string }>(),
  );
  return createMachine(state => ({
    Idle: { fetch: () => state.Loading() },
    Loading: {
      resolved: (_, value: string) => state.Success({ value }),
      rejected: (_, error: string) => state.Failure({ error }),
    },
    Success: { refetch: () => state.Loading() },
    Failure: { retry: () => state.Loading() },
  }));
};

describe('toStore', () => {
  describe('flat', () => {
    const setup = () => {
      const machine = makeFetchMachine();
      const store = createStore(
        toStore(machine, { initialState: machine.state.Idle() }),
      );
      return { machine, store };
    };

    it('places the initial state under `state`', () => {
      const { store } = setup();
      expect(store.getState().state).toEqual({ name: 'Idle' });
    });

    it('one method per event drives transitions', () => {
      const { store } = setup();
      store.getState().fetch();
      expect(store.getState().state).toEqual({ name: 'Loading' });
      store.getState().resolved('server-payload');
      expect(store.getState().state).toEqual({
        name: 'Success',
        data: { value: 'server-payload' },
      });
    });

    it('replaces the whole state — no stale data when a state drops data', () => {
      const { store } = setup();
      store.getState().fetch();
      store.getState().resolved('x');
      store.getState().refetch(); // Success -> Loading
      expect(store.getState().state).toEqual({ name: 'Loading' });
    });

    it('stores plain, serialisable state', () => {
      const { store } = setup();
      store.getState().fetch();
      store.getState().resolved('x');
      const stored = store.getState().state;
      expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    });

    it('is() narrows the stored state', () => {
      const { machine, store } = setup();
      store.getState().fetch();
      store.getState().resolved('hi');
      const state = store.getState().state;
      expect(is(state, machine.state.Success)).toBe(true);
      expect(is(state, machine.state.Failure)).toBe(false);
    });

    it('ignores events invalid for the current state', () => {
      const { store } = setup();
      store.getState().resolved('nope'); // not valid in Idle
      expect(store.getState().state).toEqual({ name: 'Idle' });
    });
  });

  describe('data values', () => {
    type LockData = { until: string; attempts: number[] };

    const setup = () => {
      const { createMachine, state } = combineStates(
        defineState('Idle'),
        defineState('Locked').withData<LockData>(),
      );
      const machine = createMachine({
        Idle: { lock: (_, data: LockData) => state.Locked(data) },
        Locked: {},
      });
      const store = createStore(
        toStore(machine, { initialState: machine.state.Idle() }),
      );
      return { machine, store };
    };

    it('keeps data values intact through the store', () => {
      const { machine, store } = setup();
      const data: LockData = {
        until: '2030-01-01T00:00:00.000Z',
        attempts: [1, 2, 3],
      };
      store.getState().lock(data);
      const state = store.getState().state;
      expect(state).toEqual({ name: 'Locked', data });
      expect(is(state, machine.state.Locked)).toBe(true);
    });
  });

  describe('nestingPath', () => {
    const setup = () => {
      const machine = makeFetchMachine();
      const store = createStore<{
        machines: { fetch: ReturnType<typeof machine.state.Idle> };
        fetch: () => void;
        resolved: (value: string) => void;
        rejected: (error: string) => void;
        refetch: () => void;
        retry: () => void;
        extra: number;
        bump: () => void;
      }>((...params) => ({
        ...toStore(machine, {
          initialState: machine.state.Idle(),
          nestingPath: 'machines.fetch',
        })(...params),
        extra: 0,
        bump: () => params[0](store => ({ extra: store.extra + 1 })),
      }));
      return { machine, store };
    };

    it('nests the initial state under the dot-path', () => {
      const { store } = setup();
      expect(store.getState().machines).toEqual({ fetch: { name: 'Idle' } });
    });

    it('routes events to the nested branch only', () => {
      const { store } = setup();
      store.getState().fetch();
      store.getState().resolved('deep');
      expect(store.getState().machines.fetch).toEqual({
        name: 'Success',
        data: { value: 'deep' },
      });
      expect(store.getState().extra).toBe(0);
    });

    it('sibling methods leave the machine branch untouched', () => {
      const { store } = setup();
      store.getState().fetch();
      store.getState().bump();
      expect(store.getState().extra).toBe(1);
      expect(store.getState().machines.fetch).toEqual({ name: 'Loading' });
    });
  });

  describe('adjust', () => {
    const setup = () => {
      const machine = makeFetchMachine();
      const store = createStore(
        toStore(machine, {
          initialState: machine.state.Idle(),
          nestingPath: 'current',
          adjust: ({ state, eventActions, set }) => ({
            current: state,
            actions: eventActions,
            reset: () => set({ current: machine.state.Idle() }),
          }),
        }),
      );
      return { machine, store };
    };

    it('reshapes the slice output', () => {
      const { store } = setup();
      expect(store.getState().current).toEqual({ name: 'Idle' });
      expect(typeof store.getState().actions.fetch).toBe('function');
    });

    it('the reshaped event actions still drive transitions', () => {
      const { store } = setup();
      store.getState().actions.fetch();
      expect(store.getState().current).toEqual({ name: 'Loading' });
    });

    it('custom methods built from set work', () => {
      const { store } = setup();
      store.getState().actions.fetch();
      store.getState().reset();
      expect(store.getState().current).toEqual({ name: 'Idle' });
    });
  });
});

import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState, is } from '../../src';
import { toSliceOptions } from '../../src/adapters/redux-toolkit';

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

const setupFlat = () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetch',
    ...toSliceOptions(machine, {
      initialState: machine.state.Idle(),
      selectors: {
        selectState: state => state,
        selectError: state =>
          is(state, machine.state.Failure) ? state.data.error : null,
        matchesName: (state, name: string) => state.name === name,
      },
    }),
  });
  const store = configureStore({ reducer: { fetch: slice.reducer } });
  return { machine, slice, store };
};

const setupNested = () => {
  const machine = makeFetchMachine();
  const { selectors, ...options } = toSliceOptions(machine, {
    initialState: machine.state.Idle(),
    nestingPath: 'machines.fetch',
    selectors: {
      selectState: state => state,
    },
  });
  const slice = createSlice({
    name: 'app',
    initialState: { ...options.initialState, extra: 0 },
    reducers: {
      ...options.reducers,
      bump: state => {
        state.extra += 1;
      },
    },
    selectors,
  });
  const store = configureStore({ reducer: { app: slice.reducer } });
  return { machine, slice, store };
};

describe('toSliceOptions', () => {
  describe('flat', () => {
    it('initial state is the bare state', () => {
      const { store } = setupFlat();
      expect(store.getState().fetch).toEqual({ name: 'Idle' });
    });

    it('one action per event drives transitions', () => {
      const { slice, store } = setupFlat();
      store.dispatch(slice.actions.fetch());
      expect(store.getState().fetch).toEqual({ name: 'Loading' });
      store.dispatch(slice.actions.resolved('server-payload'));
      expect(store.getState().fetch).toEqual({
        name: 'Success',
        data: { value: 'server-payload' },
      });
    });

    it('stores plain, serialisable state', () => {
      const { slice, store } = setupFlat();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('x'));
      const stored = store.getState().fetch;
      expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    });

    it('selectState returns the stored state; is() narrows it', () => {
      const { machine, slice, store } = setupFlat();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('hi'));
      const state = slice.selectors.selectState(store.getState());
      expect(state.name).toBe('Success');
      expect(is(state, machine.state.Success)).toBe(true);
      expect(is(state, machine.state.Failure)).toBe(false);
    });

    it('user selectors receive the state (incl. extra args)', () => {
      const { slice, store } = setupFlat();
      expect(slice.selectors.selectError(store.getState())).toBeNull();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.rejected('boom'));
      expect(slice.selectors.selectError(store.getState())).toBe('boom');
      expect(slice.selectors.matchesName(store.getState(), 'Failure')).toBe(
        true,
      );
      expect(slice.selectors.matchesName(store.getState(), 'Idle')).toBe(false);
    });

    it('ignores events invalid for the current state', () => {
      const { slice, store } = setupFlat();
      store.dispatch(slice.actions.resolved('nope')); // not valid in Idle
      expect(store.getState().fetch).toEqual({ name: 'Idle' });
    });
  });

  describe('data values', () => {
    type LockData = { until: string; attempts: number[] };

    const setupWithData = () => {
      const { createMachine, state } = combineStates(
        defineState('Idle'),
        defineState('Locked').withData<LockData>(),
      );
      const machine = createMachine({
        Idle: { lock: (_, data: LockData) => state.Locked(data) },
        Locked: {},
      });
      const slice = createSlice({
        name: 'lock',
        ...toSliceOptions(machine, {
          initialState: machine.state.Idle(),
          selectors: { selectState: state => state },
        }),
      });
      const store = configureStore({ reducer: { lock: slice.reducer } });
      return { machine, slice, store };
    };

    it('keeps data values intact through the store', () => {
      const { machine, slice, store } = setupWithData();
      const data: LockData = {
        until: '2030-01-01T00:00:00.000Z',
        attempts: [1, 2, 3],
      };
      store.dispatch(slice.actions.lock(data));

      const stored = store.getState().lock;
      expect(stored).toEqual({ name: 'Locked', data });

      const state = slice.selectors.selectState(store.getState());
      expect(is(state, machine.state.Locked)).toBe(true);
      if (is(state, machine.state.Locked)) {
        expect(state.data).toEqual(data);
      }
    });
  });

  describe('nestingPath', () => {
    it('nests the initial state under the path', () => {
      const { store } = setupNested();
      expect(store.getState().app).toEqual({
        machines: { fetch: { name: 'Idle' } },
        extra: 0,
      });
    });

    it('routes events to the nested branch only', () => {
      const { slice, store } = setupNested();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('deep'));
      expect(store.getState().app.machines.fetch).toEqual({
        name: 'Success',
        data: { value: 'deep' },
      });
      expect(store.getState().app.extra).toBe(0);
    });

    it('sibling reducers leave the machine branch untouched', () => {
      const { slice, store } = setupNested();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.bump());
      expect(store.getState().app.extra).toBe(1);
      expect(store.getState().app.machines.fetch).toEqual({ name: 'Loading' });
    });

    it('selectState reads the nested branch', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('deep'));
      const state = slice.selectors.selectState(store.getState());
      expect(state.name).toBe('Success');
      expect(is(state, machine.state.Success)).toBe(true);
    });

    it('ignores events invalid for the current state', () => {
      const { slice, store } = setupNested();
      store.dispatch(slice.actions.resolved('nope')); // not valid in Idle
      expect(store.getState().app.machines.fetch).toEqual({ name: 'Idle' });
    });
  });
});

import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState } from '../../src';
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
        selectError: state =>
          state.is(machine.state.Failure) ? state.data.error : null,
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
    it('initial state is the bare plain state', () => {
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

    it('stores plain, serializable state (no is method)', () => {
      const { slice, store } = setupFlat();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('x'));
      const stored = store.getState().fetch;
      expect('is' in stored).toBe(false);
      expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    });

    it('selectNativeState hydrates back to a native state with is', () => {
      const { machine, slice, store } = setupFlat();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('hi'));
      const native = slice.selectors.selectNativeState(store.getState());
      expect(native.name).toBe('Success');
      expect(native.is(machine.state.Success)).toBe(true);
      expect(native.is(machine.state.Failure)).toBe(false);
    });

    it('user selectors receive the native state (incl. extra args)', () => {
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

    it('selectNativeState reads + hydrates the nested branch', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(slice.actions.fetch());
      store.dispatch(slice.actions.resolved('deep'));
      const native = slice.selectors.selectNativeState(store.getState());
      expect(native.name).toBe('Success');
      expect(native.is(machine.state.Success)).toBe(true);
    });

    it('ignores events invalid for the current state', () => {
      const { slice, store } = setupNested();
      store.dispatch(slice.actions.resolved('nope')); // not valid in Idle
      expect(store.getState().app.machines.fetch).toEqual({ name: 'Idle' });
    });
  });
});

import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState } from '../../src';
import {
  toCollectionSliceOptions,
  toSliceOptions,
} from '../../src/adapters/redux-toolkit';

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

const makeJobMachine = () => {
  const { createMachine } = combineStates(
    defineState('Queued', 'Running', 'Done').withData<{
      id: string;
      n: number;
    }>(),
  );
  return createMachine(state => ({
    Queued: { start: data => state.Running(data) },
    Running: { progress: (data, n: number) => state.Running({ ...data, n }) },
    Done: { finish: data => state.Done(data) },
  }));
};

const setupExplicit = () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine),
  });
  const store = configureStore({ reducer: { fetches: slice.reducer } });
  return { machine, slice, store };
};

const setupData = () => {
  const machine = makeJobMachine();
  const slice = createSlice({
    name: 'jobs',
    ...toCollectionSliceOptions(machine, {
      selectIdFromData: data => data.id,
    }),
  });
  const store = configureStore({ reducer: { jobs: slice.reducer } });
  return { machine, slice, store };
};

const setupNested = () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'box',
    ...toCollectionSliceOptions(machine, {
      nestingPath: 'entities.fetches',
    }),
  });
  const store = configureStore({ reducer: { box: slice.reducer } });
  return { machine, slice, store };
};

describe('toCollectionSliceOptions', () => {
  describe('explicit id', () => {
    it('addEntity stores a plain (serializable) entity keyed by entityId', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      expect(slice.selectors.selectTotal(store.getState())).toBe(1);
      expect(slice.selectors.selectIds(store.getState())).toEqual(['a']);
      const stored = store.getState().fetches.entities['a'];
      expect(stored).toEqual({ entityId: 'a', name: 'Idle' });
      expect('is' in stored!).toBe(false);
    });

    it('addEntity on an existing id is a no-op (does not reset it)', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' })); // Idle -> Loading
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      expect(slice.selectors.selectTotal(store.getState())).toBe(1);
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Loading',
      });
    });

    it('one action per event drives transitions on the targeted entity', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' }));
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Success',
        data: { value: 'x' },
      });
      // "b" untouched
      expect(store.getState().fetches.entities['b']).toEqual({
        entityId: 'b',
        name: 'Idle',
      });
    });

    it('setOne replaces — no stale fields when a state drops data', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' }));
      store.dispatch(slice.actions.refetch({ entityId: 'a' })); // Success -> Loading
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Loading',
      });
    });

    it('removeEntity deletes', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.removeEntity({ entityId: 'a' }));
      expect(slice.selectors.selectTotal(store.getState())).toBe(0);
    });

    it('selectAllNative / selectNativeById / selectNativeEntities hydrate with is', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'hi' }));
      const [entity] = slice.selectors.selectAllNative(store.getState());
      expect(entity!.entityId).toBe('a');
      expect(entity!.is(machine.state.Success)).toBe(true);
      const byId = slice.selectors.selectNativeById(store.getState(), 'a');
      expect(byId?.is(machine.state.Success)).toBe(true);
      expect(
        slice.selectors.selectNativeById(store.getState(), 'nope'),
      ).toBeUndefined();
      const map = slice.selectors.selectNativeEntities(store.getState());
      expect(Object.keys(map)).toEqual(['a']);
      expect(map['a']!.entityId).toBe('a');
      expect(map['a']!.is(machine.state.Success)).toBe(true);
    });

    it('user selectors receive the native entities map (incl. extra args)', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          selectors: {
            countSuccess: statesCollection =>
              Object.values(statesCollection).filter(entity =>
                entity.is(machine.state.Success),
              ).length,
            nameOf: (statesCollection, id: string) =>
              statesCollection[id]?.name,
          },
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' }));

      expect(slice.selectors.countSuccess(store.getState())).toBe(1);
      expect(slice.selectors.nameOf(store.getState(), 'b')).toBe('Idle');
      // built-ins still present
      expect(slice.selectors.selectTotal(store.getState())).toBe(2);
    });

    it('ignores events invalid for the current state', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' })); // not valid in Idle
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Idle',
      });
    });
  });

  describe('data id (selectIdFromData)', () => {
    it('derives the id from the state data on create (no entityId prop)', () => {
      const { machine, slice, store } = setupData();
      store.dispatch(
        slice.actions.addEntity({
          state: machine.state.Queued({ id: 'j1', n: 0 }),
        }),
      );
      expect(slice.selectors.selectIds(store.getState())).toEqual(['j1']);
      store.dispatch(slice.actions.start({ entityId: 'j1' })); // Queued -> Running
      store.dispatch(slice.actions.progress({ entityId: 'j1', payload: 5 }));
      const stored = store.getState().jobs.entities['j1'];
      expect(stored).toEqual({ name: 'Running', data: { id: 'j1', n: 5 } });
      expect('entityId' in stored!).toBe(false);
    });

    it('removeEntity deletes by the derived id', () => {
      const { machine, slice, store } = setupData();
      store.dispatch(
        slice.actions.addEntity({
          state: machine.state.Queued({ id: 'j1', n: 0 }),
        }),
      );
      store.dispatch(slice.actions.removeEntity({ entityId: 'j1' }));
      expect(slice.selectors.selectTotal(store.getState())).toBe(0);
    });

    it('selectNativeEntities maps derived ids to native states (no entityId prop)', () => {
      const { machine, slice, store } = setupData();
      store.dispatch(
        slice.actions.addEntity({
          state: machine.state.Queued({ id: 'j1', n: 0 }),
        }),
      );
      const map = slice.selectors.selectNativeEntities(store.getState());
      expect(Object.keys(map)).toEqual(['j1']);
      expect(map['j1']!.is(machine.state.Queued)).toBe(true);
      expect(map['j1']!.data).toEqual({ id: 'j1', n: 0 });
      expect('entityId' in map['j1']!).toBe(false);
    });
  });

  describe('sortComparer', () => {
    it('orders entities by the comparer, not insertion order', () => {
      const machine = makeFetchMachine();
      const rank: Record<string, number> = {
        Idle: 0,
        Loading: 1,
        Success: 2,
        Failure: 3,
      };
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          sortComparer: (a, b) => rank[a.name]! - rank[b.name]!,
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' })); // a -> Loading (rank 1)

      // inserted a, b — but b (Idle, 0) now sorts before a (Loading, 1)
      expect(slice.selectors.selectIds(store.getState())).toEqual(['b', 'a']);
      expect(
        slice.selectors.selectAllNative(store.getState()).map(e => e.entityId),
      ).toEqual(['b', 'a']);
    });
  });

  describe('nestingPath', () => {
    it('stores the EntityState at the nested path and operates through it', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' }));

      expect(store.getState().box.entities.fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Success',
        data: { value: 'x' },
      });
      expect(slice.selectors.selectIds(store.getState())).toEqual(['a']);
      expect(slice.selectors.selectTotal(store.getState())).toBe(1);
      const byId = slice.selectors.selectNativeById(store.getState(), 'a');
      expect(byId?.is(machine.state.Success)).toBe(true);
    });

    it('removeEntity deletes through the nested path', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.removeEntity({ entityId: 'a' }));
      expect(slice.selectors.selectTotal(store.getState())).toBe(0);
    });

    it('ignores events invalid for the current state', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', state: machine.state.Idle() }),
      );
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' })); // not valid in Idle
      expect(store.getState().box.entities.fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Idle',
      });
    });
  });

  describe('composition', () => {
    it('merges a collection with a single-machine slice into one slice', () => {
      const fetchMachine = makeFetchMachine();
      const jobMachine = makeJobMachine();
      const single = toSliceOptions(fetchMachine, {
        initialState: fetchMachine.state.Idle(),
        nestingPath: 'single',
      });
      const jobs = toCollectionSliceOptions(jobMachine, {
        nestingPath: 'jobs',
        selectIdFromData: data => data.id,
      });
      const slice = createSlice({
        name: 'combined',
        initialState: { ...single.initialState, ...jobs.initialState },
        reducers: { ...single.reducers, ...jobs.reducers },
      });
      const store = configureStore({ reducer: { combined: slice.reducer } });

      store.dispatch(slice.actions.fetch());
      store.dispatch(
        slice.actions.addEntity({
          state: jobMachine.state.Queued({ id: 'j1', n: 0 }),
        }),
      );
      store.dispatch(slice.actions.start({ entityId: 'j1' }));

      expect(store.getState().combined.single).toEqual({ name: 'Loading' });
      expect(jobs.selectors.selectIds(store.getState().combined)).toEqual([
        'j1',
      ]);
      expect(store.getState().combined.jobs.entities['j1']).toEqual({
        name: 'Running',
        data: { id: 'j1', n: 0 },
      });
    });
  });

  describe('lifecycle actions', () => {
    it('always includes addEntity / removeEntity alongside event actions', () => {
      const { slice } = setupExplicit();
      expect('addEntity' in slice.actions).toBe(true);
      expect('removeEntity' in slice.actions).toBe(true);
      expect('fetch' in slice.actions).toBe(true);
    });
  });
});

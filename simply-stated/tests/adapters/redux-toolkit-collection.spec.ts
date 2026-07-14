import { configureStore, createSlice } from '@reduxjs/toolkit';
import type { EntityState, PayloadAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState, is } from '../../src';
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
    ...toCollectionSliceOptions(machine, {
      selectors: entitySelectors => ({
        selectIds: entitySelectors.selectIds,
        selectTotalCount: entitySelectors.selectTotal,
        selectAll: entitySelectors.selectAll,
        selectById: entitySelectors.selectById,
        selectEntitiesMap: entitySelectors.selectEntities,
      }),
    }),
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
      selectors: entitySelectors => ({
        selectIds: entitySelectors.selectIds,
        selectTotalCount: entitySelectors.selectTotal,
        selectAll: entitySelectors.selectAll,
        selectById: entitySelectors.selectById,
        selectEntitiesMap: entitySelectors.selectEntities,
      }),
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
      selectors: entitySelectors => ({
        selectIds: entitySelectors.selectIds,
        selectTotalCount: entitySelectors.selectTotal,
        selectAll: entitySelectors.selectAll,
        selectById: entitySelectors.selectById,
        selectEntitiesMap: entitySelectors.selectEntities,
      }),
    }),
  });
  const store = configureStore({ reducer: { box: slice.reducer } });
  return { machine, slice, store };
};

describe('toCollectionSliceOptions', () => {
  describe('explicit id', () => {
    it('addEntity stores a plain (serialisable) entity keyed by entityId', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(1);
      expect(slice.selectors.selectIds(store.getState())).toEqual(['a']);
      const stored = store.getState().fetches.entities['a'];
      expect(stored).toEqual({ entityId: 'a', name: 'Idle' });
      expect('is' in stored!).toBe(false);
    });

    it('addEntity on an existing id is a no-op (does not reset it)', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' })); // Idle -> Loading
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(1);
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Loading',
      });
    });

    it('one action per event drives transitions on the targeted entity', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', ...machine.state.Idle() }),
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
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
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
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.removeEntity({ entityId: 'a' }));
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('selectAll / selectById / selectEntitiesMap resolve entities; is() narrows', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'hi' }));
      const [entity] = slice.selectors.selectAll(store.getState());
      expect(entity!.entityId).toBe('a');
      expect(is(entity!, machine.state.Success)).toBe(true);
      const byId = slice.selectors.selectById(store.getState(), 'a');
      expect(is(byId!, machine.state.Success)).toBe(true);
      expect(
        slice.selectors.selectById(store.getState(), 'nope'),
      ).toBeUndefined();
      const map = slice.selectors.selectEntitiesMap(store.getState());
      expect(Object.keys(map)).toEqual(['a']);
      expect(map['a']!.entityId).toBe('a');
      expect(is(map['a']!, machine.state.Success)).toBe(true);
    });

    it('selectAll / selectEntitiesMap are memoised (stable ref until entities change)', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );

      const allFirst = slice.selectors.selectAll(store.getState());
      const mapFirst = slice.selectors.selectEntitiesMap(store.getState());

      // No entity change → same references.
      expect(slice.selectors.selectAll(store.getState())).toBe(allFirst);
      expect(slice.selectors.selectEntitiesMap(store.getState())).toBe(
        mapFirst,
      );

      // A transition on the entity → recomputed, new references.
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      expect(slice.selectors.selectAll(store.getState())).not.toBe(allFirst);
      expect(slice.selectors.selectEntitiesMap(store.getState())).not.toBe(
        mapFirst,
      );
    });

    it('user selectors receive the entity state and the adapter selectors', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          selectors: entitySelectors => ({
            countSuccess: state =>
              entitySelectors
                .selectAll(state)
                .filter(entity => is(entity, machine.state.Success)).length,
            nameOf: (state, id: string) =>
              entitySelectors.selectById(state, id)?.name,
            total: entitySelectors.selectTotal,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' }));

      expect(slice.selectors.countSuccess(store.getState())).toBe(1);
      expect(slice.selectors.nameOf(store.getState(), 'b')).toBe('Idle');
      expect(slice.selectors.total(store.getState())).toBe(2);
    });

    it('selectors also accept a plain object (no entity-adapter selectors)', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          selectors: {
            countAll: entitiesState => entitiesState.ids.length,
            nameOf: (entitiesState, id: string) =>
              entitiesState.entities[id]?.name,
          },
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));

      expect(slice.selectors.countAll(store.getState())).toBe(2);
      expect(slice.selectors.nameOf(store.getState(), 'a')).toBe('Loading');
      expect(slice.selectors.nameOf(store.getState(), 'b')).toBe('Idle');
    });

    it('ignores events invalid for the current state', () => {
      const { machine, slice, store } = setupExplicit();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
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
        slice.actions.addEntity(machine.state.Queued({ id: 'j1', n: 0 })),
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
        slice.actions.addEntity(machine.state.Queued({ id: 'j1', n: 0 })),
      );
      store.dispatch(slice.actions.removeEntity({ entityId: 'j1' }));
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('selectEntitiesMap maps derived ids to states (no entityId prop)', () => {
      const { machine, slice, store } = setupData();
      store.dispatch(
        slice.actions.addEntity(machine.state.Queued({ id: 'j1', n: 0 })),
      );
      const map = slice.selectors.selectEntitiesMap(store.getState());
      expect(Object.keys(map)).toEqual(['j1']);
      expect(is(map['j1']!, machine.state.Queued)).toBe(true);
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
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(
        slice.actions.addEntity({ entityId: 'b', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' })); // a -> Loading (rank 1)

      // inserted a, b — but b (Idle, 0) now sorts before a (Loading, 1)
      expect(slice.selectors.selectIds(store.getState())).toEqual(['b', 'a']);
      expect(
        slice.selectors.selectAll(store.getState()).map(e => e.entityId),
      ).toEqual(['b', 'a']);
    });
  });

  describe('nestingPath', () => {
    it('stores the EntityState at the nested path and operates through it', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      store.dispatch(slice.actions.resolved({ entityId: 'a', payload: 'x' }));

      expect(store.getState().box.entities.fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Success',
        data: { value: 'x' },
      });
      expect(slice.selectors.selectIds(store.getState())).toEqual(['a']);
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(1);
      const byId = slice.selectors.selectById(store.getState(), 'a');
      expect(is(byId!, machine.state.Success)).toBe(true);
    });

    it('removeEntity deletes through the nested path', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.removeEntity({ entityId: 'a' }));
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('ignores events invalid for the current state', () => {
      const { machine, slice, store } = setupNested();
      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
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
        selectors: entitySelectors => ({
          selectIds: entitySelectors.selectIds,
          selectTotalCount: entitySelectors.selectTotal,
          selectAll: entitySelectors.selectAll,
          selectById: entitySelectors.selectById,
          selectEntitiesMap: entitySelectors.selectEntities,
        }),
      });
      const slice = createSlice({
        name: 'combined',
        initialState: { ...single.initialState, ...jobs.initialState },
        reducers: { ...single.reducers, ...jobs.reducers },
      });
      const store = configureStore({ reducer: { combined: slice.reducer } });

      store.dispatch(slice.actions.fetch());
      store.dispatch(
        slice.actions.addEntity(jobMachine.state.Queued({ id: 'j1', n: 0 })),
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

  describe('reducers option', () => {
    const setupRenamedExplicit = () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          reducers: lifecycleReducers => ({
            addFetch: lifecycleReducers.addEntity,
            removeFetch: lifecycleReducers.removeEntity,
          }),
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });
      return { machine, slice, store };
    };

    it('renamed lifecycle reducers behave like the defaults (explicit mode)', () => {
      const { machine, slice, store } = setupRenamedExplicit();
      store.dispatch(
        slice.actions.addFetch({ entityId: 'a', ...machine.state.Idle() }),
      );
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Idle',
      });
      // event reducers keep working alongside
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      expect(store.getState().fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Loading',
      });
      store.dispatch(slice.actions.removeFetch({ entityId: 'a' }));
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('renamed addEntity keeps deriving the id from data (data mode)', () => {
      const machine = makeJobMachine();
      const slice = createSlice({
        name: 'jobs',
        ...toCollectionSliceOptions(machine, {
          selectIdFromData: data => data.id,
          reducers: lifecycleReducers => ({
            addJob: lifecycleReducers.addEntity,
            removeJob: lifecycleReducers.removeEntity,
          }),
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { jobs: slice.reducer } });

      store.dispatch(
        slice.actions.addJob(machine.state.Queued({ id: 'j1', n: 0 })),
      );
      expect(slice.selectors.selectIds(store.getState())).toEqual(['j1']);
      const stored = store.getState().jobs.entities['j1'];
      expect('entityId' in stored!).toBe(false);
      store.dispatch(slice.actions.removeJob({ entityId: 'j1' }));
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('custom reducers mutate through the entity adapter CRUD', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          reducers: (lifecycleReducers, entityAdapterCRUD) => ({
            addFetch: lifecycleReducers.addEntity,
            seedIdle: (entitiesState, action: PayloadAction<string[]>) => {
              entityAdapterCRUD.addMany(
                entitiesState,
                action.payload.map(entityId => ({
                  entityId,
                  ...machine.state.Idle(),
                })),
              );
            },
          }),
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(slice.actions.seedIdle(['a', 'b']));
      expect(slice.selectors.selectIds(store.getState())).toEqual(['a', 'b']);
      expect(store.getState().fetches.entities['b']).toEqual({
        entityId: 'b',
        name: 'Idle',
      });
    });

    it('a custom reducer may return a new entities state', () => {
      const { machine, slice, store } = (() => {
        const machine = makeFetchMachine();
        const slice = createSlice({
          name: 'fetches',
          ...toCollectionSliceOptions(machine, {
            reducers: lifecycleReducers => ({
              addFetch: lifecycleReducers.addEntity,
              reset: () => ({ ids: [], entities: {} }),
            }),
            selectors: entitySelectors => ({
              selectIds: entitySelectors.selectIds,
              selectTotalCount: entitySelectors.selectTotal,
              selectAll: entitySelectors.selectAll,
              selectById: entitySelectors.selectById,
              selectEntitiesMap: entitySelectors.selectEntities,
            }),
          }),
        });
        const store = configureStore({ reducer: { fetches: slice.reducer } });
        return { machine, slice, store };
      })();

      store.dispatch(
        slice.actions.addFetch({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.reset());
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('returning the crud result (the mutated draft) behaves as a mutation', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          reducers: (lifecycleReducers, entityAdapterCRUD) => ({
            addFetch: lifecycleReducers.addEntity,
            clear: entitiesState => entityAdapterCRUD.removeAll(entitiesState),
          }),
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addFetch({ entityId: 'a', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.clear());
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
    });

    it('custom reducers operate through nestingPath in both styles', () => {
      const machine = makeFetchMachine();
      const options = toCollectionSliceOptions(machine, {
        nestingPath: 'entities.fetches',
        reducers: (lifecycleReducers, entityAdapterCRUD) => ({
          addFetch: lifecycleReducers.addEntity,
          clearMutate: entitiesState => {
            entityAdapterCRUD.removeAll(entitiesState);
          },
          reset: () => ({ ids: [], entities: {} }),
        }),
        selectors: entitySelectors => ({
          selectIds: entitySelectors.selectIds,
          selectTotalCount: entitySelectors.selectTotal,
          selectAll: entitySelectors.selectAll,
          selectById: entitySelectors.selectById,
          selectEntitiesMap: entitySelectors.selectEntities,
        }),
      });
      const slice = createSlice({
        name: 'box',
        initialState: { ...options.initialState, meta: 'kept' },
        reducers: options.reducers,
        selectors: options.selectors,
      });
      const store = configureStore({ reducer: { box: slice.reducer } });

      store.dispatch(
        slice.actions.addFetch({ entityId: 'a', ...machine.state.Idle() }),
      );
      expect(store.getState().box.entities.fetches.entities['a']).toEqual({
        entityId: 'a',
        name: 'Idle',
      });

      store.dispatch(slice.actions.clearMutate());
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
      expect(store.getState().box.meta).toBe('kept');

      store.dispatch(
        slice.actions.addFetch({ entityId: 'b', ...machine.state.Idle() }),
      );
      store.dispatch(slice.actions.reset());
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(0);
      // the written-back entities state replaces only the nested path
      expect(store.getState().box.meta).toBe('kept');
    });

    it('does not expose addEntity / removeEntity when reducers is provided', () => {
      const { slice } = setupRenamedExplicit();
      expect('addEntity' in slice.actions).toBe(false);
      expect('removeEntity' in slice.actions).toBe(false);
      expect('addFetch' in slice.actions).toBe(true);
      expect('fetch' in slice.actions).toBe(true);
    });

    it('allows a custom reducer named addEntity', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          reducers: lifecycleReducers => ({
            addEntity: lifecycleReducers.addEntity,
          }),
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        slice.actions.addEntity({ entityId: 'a', ...machine.state.Idle() }),
      );
      expect(slice.selectors.selectTotalCount(store.getState())).toBe(1);
    });

    it('a custom reducer clashing with an event name wins at runtime', () => {
      const machine = makeFetchMachine();
      const slice = createSlice({
        name: 'fetches',
        ...toCollectionSliceOptions(machine, {
          // @ts-expect-error a reducer must not clash with a machine event
          reducers: (lifecycleReducers, entityAdapterCRUD) => ({
            addFetch: lifecycleReducers.addEntity,
            fetch: (
              entitiesState: EntityState<never, string>,
              action: PayloadAction<{ entityId: string }>,
            ) => {
              entityAdapterCRUD.removeOne(
                entitiesState as never,
                action.payload.entityId,
              );
            },
          }),
          selectors: entitySelectors => ({
            selectIds: entitySelectors.selectIds,
            selectTotalCount: entitySelectors.selectTotal,
            selectAll: entitySelectors.selectAll,
            selectById: entitySelectors.selectById,
            selectEntitiesMap: entitySelectors.selectEntities,
          }),
        }),
      });
      const store = configureStore({ reducer: { fetches: slice.reducer } });

      store.dispatch(
        // @ts-expect-error the clashing factory degrades the custom reducers
        slice.actions.addFetch({ entityId: 'a', ...machine.state.Idle() }),
      );
      // the custom reducer removes instead of transitioning
      store.dispatch(slice.actions.fetch({ entityId: 'a' }));
      expect(
        // @ts-expect-error the clashing factory degrades the custom selectors
        slice.selectors.selectTotalCount(store.getState()),
      ).toBe(0);
    });
  });
});

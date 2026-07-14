/**
 * Type-level tests for the Redux Toolkit collection adapter
 * (`toCollectionSliceOptions`).
 */

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { expect, test } from 'tstyche';
import { combineStates, defineState } from '../../src';
import { toCollectionSliceOptions } from '../../src/adapters/redux-toolkit';

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

const makeJobMachine = () =>
  combineStates(
    defineState('Queued', 'Running', 'Done').withData<{
      id: string;
      n: 0 | 1 | 2 | 3;
    }>(),
  ).createMachine(state => ({
    Queued: { start: data => state.Running(data) },
    Running: {
      progress: (data, n: 0 | 1 | 2 | 3) => state.Running({ ...data, n }),
    },
    Done: { finish: data => state.Done(data) },
  }));

// --- id inference -----------------------------------------------------------
// The entity id is inferred from selectIdFromData and surfaces on the lifecycle
// action payloads (removeEntity targets an entity by id).

test('selectIdFromData return type drives the entity id (string)', () => {
  const machine = makeJobMachine();
  const slice = createSlice({
    name: 'jobs',
    ...toCollectionSliceOptions(machine, {
      selectIdFromData: data => data.id,
    }),
  });
  const { removeEntity } = slice.actions;
  type EntityId = Parameters<typeof removeEntity>[0]['entityId'];
  expect(removeEntity).type.toBeCallableWith({ entityId: 'j1' });
  expect<EntityId>().type.toBe<string>();
});

test('the entity id is selectIdFromData’s exact return type (not widened)', () => {
  const machine = makeJobMachine();
  const slice = createSlice({
    name: 'jobs',
    ...toCollectionSliceOptions(machine, {
      selectIdFromData: data => data.n,
    }),
  });
  const { removeEntity } = slice.actions;
  type EntityId = Parameters<typeof removeEntity>[0]['entityId'];
  expect(removeEntity).type.toBeCallableWith({ entityId: 0 });
  expect<EntityId>().type.toBe<0 | 1 | 2 | 3>();
});

test('selectIdFromData data is never when not every state carries data', () => {
  // makeFetchMachine: Idle / Loading carry no data, so the shared data is never.
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    selectIdFromData: data => {
      expect(data).type.toBe<never>();
      return 'x';
    },
  });
});

// --- action payloads --------------------------------------------------------

test('per-event actions take { entityId } (and { entityId, payload })', () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine),
  });
  expect(slice.actions.fetch).type.toBeCallableWith({ entityId: 'a' });
  expect(slice.actions.resolved).type.toBeCallableWith({
    entityId: 'a',
    payload: 'v',
  });
});

// --- custom selectors from the entity-adapter selectors ---------------------

test('selectors receive the entity-adapter selectors and keep return types', () => {
  const machine = makeFetchMachine();
  const { selectors } = toCollectionSliceOptions(machine, {
    selectors: entitySelectors => ({
      count: state => entitySelectors.selectTotal(state),
    }),
  });
  const sliceState = {} as Parameters<typeof selectors.count>[0];
  expect(selectors.count(sliceState)).type.toBe<number>();
});

test('selectors also accept a plain object and keep return types', () => {
  const machine = makeFetchMachine();
  const { selectors } = toCollectionSliceOptions(machine, {
    selectors: {
      countAll: entitiesState => entitiesState.ids.length,
    },
  });
  const sliceState = {} as Parameters<typeof selectors.countAll>[0];
  expect(selectors.countAll(sliceState)).type.toBe<number>();
});

// --- custom reducers via the reducers factory --------------------------------

test('reducers factory: the CRUD surface is exactly the mutating methods', () => {
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    reducers: (lifecycleReducers, _entityAdapterCRUD) => {
      expect<keyof typeof _entityAdapterCRUD>().type.toBe<
        | 'addOne'
        | 'addMany'
        | 'setOne'
        | 'setMany'
        | 'setAll'
        | 'removeOne'
        | 'removeMany'
        | 'removeAll'
        | 'updateOne'
        | 'updateMany'
        | 'upsertOne'
        | 'upsertMany'
      >();
      return { addFetch: lifecycleReducers.addEntity };
    },
  });
});

test('reducers factory: data-mode addEntity takes the bare machine state', () => {
  const machine = makeJobMachine();
  const slice = createSlice({
    name: 'jobs',
    ...toCollectionSliceOptions(machine, {
      selectIdFromData: data => data.id,
      reducers: lifecycleReducers => ({
        addJob: lifecycleReducers.addEntity,
      }),
    }),
  });
  expect(slice.actions.addJob).type.toBeCallableWith(
    machine.state.Queued({ id: 'j1', n: 0 }),
  );
  // the id comes from the state's data — no entityId to append
  expect(slice.actions.addJob).type.not.toBeCallableWith({
    entityId: 'j1',
    ...machine.state.Queued({ id: 'j1', n: 0 }),
  });
});

test('crud entities are the machine states (entityId appended in explicit mode)', () => {
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    reducers: (_lifecycleReducers, entityAdapterCRUD) => ({
      seed: entitiesState => {
        expect(entityAdapterCRUD.addOne).type.toBeCallableWith(entitiesState, {
          entityId: 'a',
          ...machine.state.Idle(),
        });
        // a bare machine state misses entityId
        expect(entityAdapterCRUD.addOne).type.not.toBeCallableWith(
          entitiesState,
          machine.state.Idle(),
        );
      },
    }),
  });
});

test('unannotated custom reducer params are contextually typed (not any)', () => {
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    reducers: () => ({
      touch: entitiesState => {
        expect(entitiesState.ids.length).type.toBe<number>();
      },
    }),
  });
});

test('custom reducer payloads surface on the slice action creators', () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine, {
      reducers: () => ({
        tag: (entitiesState, action: PayloadAction<{ n: number }>) => {
          void entitiesState;
          void action;
        },
      }),
    }),
  });
  expect(slice.actions.tag).type.toBeCallableWith({ n: 1 });
  expect(slice.actions.tag).type.not.toBeCallableWith({ n: 'x' });
});

test('a renamed addEntity keeps the mode-dependent input (explicit mode)', () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine, {
      reducers: lifecycleReducers => ({
        addFetch: lifecycleReducers.addEntity,
      }),
    }),
  });
  expect(slice.actions.addFetch).type.toBeCallableWith({
    entityId: 'a',
    ...machine.state.Idle(),
  });
  // explicit mode requires the appended entityId
  expect(slice.actions.addFetch).type.not.toBeCallableWith(
    machine.state.Idle(),
  );
});

test('providing reducers replaces the default lifecycle actions', () => {
  const machine = makeFetchMachine();
  const _slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine, {
      reducers: lifecycleReducers => ({
        addFetch: lifecycleReducers.addEntity,
      }),
    }),
  });
  expect<keyof typeof _slice.actions>().type.toBe<
    'fetch' | 'resolved' | 'rejected' | 'refetch' | 'retry' | 'addFetch'
  >();
});

test('a custom reducer may reuse the addEntity name', () => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine, {
      reducers: lifecycleReducers => ({
        addEntity: lifecycleReducers.addEntity,
      }),
    }),
  });
  expect(slice.actions.addEntity).type.toBeCallableWith({
    entityId: 'a',
    ...machine.state.Idle(),
  });
});

test('reducers option preserves exact id inference', () => {
  const machine = makeJobMachine();
  const _slice = createSlice({
    name: 'jobs',
    ...toCollectionSliceOptions(machine, {
      nestingPath: 'inner.jobs',
      selectIdFromData: data => data.n,
      reducers: lifecycleReducers => ({
        removeJob: lifecycleReducers.removeEntity,
      }),
    }),
  });
  type EntityId = Parameters<typeof _slice.actions.removeJob>[0]['entityId'];
  expect<EntityId>().type.toBe<0 | 1 | 2 | 3>();
});

// --- negative: selectIdFromData data is contextually typed (not any) --------

void (() => {
  const machine = makeJobMachine();
  toCollectionSliceOptions(machine, {
    // @ts-expect-error does not exist
    selectIdFromData: data => data.nope,
  });
});

// --- negative: addEntity input shape per mode -------------------------------

// explicit mode requires `entityId`.
void (() => {
  const machine = makeFetchMachine();
  const slice = createSlice({
    name: 'fetches',
    ...toCollectionSliceOptions(machine),
  });
  // @ts-expect-error is missing
  slice.actions.addEntity(machine.state.Idle());
});

// data mode does not accept `entityId` (the id comes from the state's data).
void (() => {
  const machine = makeJobMachine();
  const slice = createSlice({
    name: 'jobs',
    ...toCollectionSliceOptions(machine, {
      selectIdFromData: data => data.id,
    }),
  });
  slice.actions.addEntity({
    // @ts-expect-error may only specify known properties
    entityId: 'j1',
    ...machine.state.Queued({ id: 'j1', n: 0 }),
  });
});

// --- negative: custom reducers take a PayloadAction as second param ---------

void (() => {
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    // The second reducer param must be a payload action:
    // @ts-expect-error Type '{ payload: never; type: string; }' is not assignable to type 'number'
    reducers: () => ({
      broken: (entitiesState: object, count: number) => {
        void entitiesState;
        void count;
      },
    }),
  });
});

// --- negative: custom reducer names must not clash with machine events ------

void (() => {
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    // @ts-expect-error Reducer 'fetch' clashes with machine event 'fetch'
    reducers: () => ({
      fetch: (
        entitiesState: object,
        action: PayloadAction<{ entityId: string }>,
      ) => {
        void entitiesState;
        void action;
      },
    }),
  });
});

/**
 * Type-level tests for the Zustand collection adapter (`toCollectionStore`).
 */

import { createStore } from 'zustand/vanilla';
import { expect, test } from 'tstyche';
import { combineStates, defineState, is, type StateOf } from '../../src';
import { toCollectionStore } from '../../src/adapters/zustand';

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

type JobState = StateOf<ReturnType<typeof makeJobMachine>['state']>;

// --- id inference -----------------------------------------------------------

test('selectIdFromData return type drives the entity id (string)', () => {
  const machine = makeJobMachine();
  const store = createStore(
    toCollectionStore(machine, { selectIdFromData: data => data.id }),
  );
  const removeEntity = store.getState().removeEntity;
  expect(removeEntity).type.toBeCallableWith('j1');
  expect<Parameters<typeof removeEntity>[0]>().type.toBe<string>();
});

test('the entity id is selectIdFromData’s exact return type (not widened)', () => {
  const machine = makeJobMachine();
  const store = createStore(
    toCollectionStore(machine, { selectIdFromData: data => data.n }),
  );
  const removeEntity = store.getState().removeEntity;
  expect<Parameters<typeof removeEntity>[0]>().type.toBe<0 | 1 | 2 | 3>();
  expect(removeEntity).type.toBeCallableWith(0);
  expect(removeEntity).type.not.toBeCallableWith('0');
});

test('selectIdFromData data is never when not every state carries data', () => {
  const machine = makeFetchMachine();
  toCollectionStore(machine, {
    selectIdFromData: data => {
      expect(data).type.toBe<never>();
      return 'x';
    },
  });
});

// --- action shapes ----------------------------------------------------------

test('data mode: addEntity takes the bare state, events take (id, payload)', () => {
  const machine = makeJobMachine();
  const store = createStore(
    toCollectionStore(machine, { selectIdFromData: data => data.id }),
  );
  const state = store.getState();
  expect(state.addEntity).type.toBeCallableWith(
    machine.state.Queued({ id: 'j1', n: 0 }),
  );
  expect(state.progress).type.toBeCallableWith('j1', 1);
  expect(state.start).type.toBeCallableWith('j1');
});

test('explicit mode: addEntity takes (id, state), removeEntity takes id', () => {
  const machine = makeFetchMachine();
  const store = createStore(toCollectionStore(machine));
  const state = store.getState();
  expect(state.addEntity).type.toBeCallableWith('a', machine.state.Idle());
  // explicit mode does not derive the id from data
  expect(state.addEntity).type.not.toBeCallableWith(machine.state.Idle());
  expect(state.removeEntity).type.toBeCallableWith('a');
  expect(state.resolved).type.toBeCallableWith('a', 'value');
});

test('the collection map is keyed by the entity id', () => {
  const machine = makeJobMachine();
  const store = createStore(
    toCollectionStore(machine, { selectIdFromData: data => data.n }),
  );
  expect(store.getState().collection).type.toBe<
    Partial<Record<0 | 1 | 2 | 3, JobState>>
  >();
});

test('is() narrows an entry read from the collection', () => {
  const machine = makeJobMachine();
  const store = createStore(
    toCollectionStore(machine, { selectIdFromData: data => data.id }),
  );
  const entry = store.getState().collection['j1'];
  if (entry && is(entry, machine.state.Running)) {
    expect(entry.data.n).type.toBe<0 | 1 | 2 | 3>();
  }
});

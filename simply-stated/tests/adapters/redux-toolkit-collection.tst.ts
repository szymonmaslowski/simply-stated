/**
 * Type-level tests for the Redux Toolkit collection adapter
 * (`toCollectionSliceOptions`).
 */

import { createSlice } from '@reduxjs/toolkit';
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

test('selectIdFromData return type drives the entity id (string)', () => {
  const machine = makeJobMachine();
  const { selectors } = toCollectionSliceOptions(machine, {
    selectIdFromData: data => data.id,
  });
  const sliceState = {} as Parameters<typeof selectors.selectIds>[0];
  expect(selectors.selectIds(sliceState)).type.toBe<string[]>();
});

test('the entity id is selectIdFromData’s exact return type (not widened)', () => {
  const machine = makeJobMachine();
  const { selectors } = toCollectionSliceOptions(machine, {
    selectIdFromData: data => data.n,
  });
  const sliceState = {} as Parameters<typeof selectors.selectIds>[0];
  expect(selectors.selectIds(sliceState)).type.toBe<(0 | 1 | 2 | 3)[]>();
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

// --- negative: reserved selector names --------------------------------------

// A user selector cannot reuse a built-in selector name; the reserved keys
// carry an `ApiError`, so supplying one is rejected.
void (() => {
  const machine = makeFetchMachine();
  toCollectionSliceOptions(machine, {
    selectors: {
      // @ts-expect-error 'selectTotalCount' is a reserved selector name
      selectTotalCount: () => 1,
    },
  });
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
  slice.actions.addEntity({ state: machine.state.Idle() });
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
    state: machine.state.Queued({ id: 'j1', n: 0 }),
  });
});

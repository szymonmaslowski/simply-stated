/**
 * Every conflict case `combineSlices` can be handed.
 *
 * Clashes are reported on the offending argument, so each case below is a
 * `@ts-expect-error` carrying the message. TypeScript anchors a rest-parameter
 * mismatch at the start of the argument list, so the directive sits above the
 * *first* slice even when a later one is at fault — each case names the
 * offender in a comment.
 *
 * Detection reads the path each slice placed its state at off the initializer
 * (a phantom `PathTag` brand) rather than guessing it from the slice shape.
 * That distinction is what case 1 pins down: two slices sharing a `machines`
 * branch is the normal composition, while two slices claiming one slot is not,
 * and the two are structurally identical.
 */

import { expect, test } from 'tstyche';
import { createStore } from 'zustand/vanilla';
import { combineStates, defineState, type StateOf } from '../../src';
import {
  combineSlices,
  toCollectionStore,
  toStore,
} from '../../src/adapters/zustand';

const makePlainMachine = () =>
  combineStates(defineState('Idle'), defineState('Loading')).createMachine(
    state => ({ Idle: { go: () => state.Loading() }, Loading: {} }),
  );

const makeDataMachine = () =>
  combineStates(
    defineState('Queued', 'Running').withData<{
      id: string;
      n: 0 | 1 | 2 | 3;
    }>(),
  ).createMachine(state => ({
    Queued: { start: data => state.Running(data) },
    Running: {},
  }));

type PlainState = StateOf<ReturnType<typeof makePlainMachine>['state']>;
type DataState = StateOf<ReturnType<typeof makeDataMachine>['state']>;

const plainState = () => makePlainMachine().state.Idle();
const dataState = () => makeDataMachine().state.Queued({ id: 'x', n: 0 });

// --- 1. the case that must keep working ------------------------------------

test('disjoint paths under a shared branch are not a clash', () => {
  const store = createStore(
    combineSlices(
      toStore(makePlainMachine(), {
        initialState: plainState(),
        statePath: 'machines.a',
      }),
      toStore(makeDataMachine(), {
        initialState: dataState(),
        statePath: 'machines.b',
        adjustActions: ({ machineActions }) => ({ bActions: machineActions }),
      }),
    ),
  );
  expect(store.getState().machines.a).type.toBe<PlainState>();
  expect(store.getState().machines.b).type.toBe<DataState>();
});

// --- 2. two slices claiming one slot ---------------------------------------

// Second slice repeats `machines.shared`.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.shared'
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.shared',
    }),
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.shared',
      adjustActions: ({ machineActions }) => ({ other: machineActions }),
    }),
  );
});

// States carrying data are still reported at the branch, not per data field.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'shared'
    toStore(makeDataMachine(), {
      initialState: dataState(),
      statePath: 'shared',
    }),
    toStore(makeDataMachine(), {
      initialState: dataState(),
      statePath: 'shared',
      adjustActions: ({ machineActions }) => ({ other: machineActions }),
    }),
  );
});

// Neither slice names a path, so both default to `state`.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'state'
    toStore(makePlainMachine(), { initialState: plainState() }),
    toStore(makePlainMachine(), {
      initialState: plainState(),
      adjustActions: ({ machineActions }) => ({ other: machineActions }),
    }),
  );
});

// A single instance and a collection on the same path.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.x'
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.x',
    }),
    toCollectionStore(makeDataMachine(), {
      collectionPath: 'machines.x',
      adjustActions: ({ machineActions }) => ({ other: machineActions }),
    }),
  );
});

// Two collections keyed by literal ids. Their entries share no key name, so
// only the recorded path catches this.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.jobs'
    toCollectionStore(makeDataMachine(), {
      collectionPath: 'machines.jobs',
      selectIdFromData: data => data.n,
    }),
    toCollectionStore(makeDataMachine(), {
      collectionPath: 'machines.jobs',
      selectIdFromData: data => data.n,
      adjustActions: ({ machineActions }) => ({ other: machineActions }),
    }),
  );
});

// --- 3. a slice's methods landing on another slice's state -----------------

// `adjustActions` parks the second slice's methods at `machines.a`, where the
// first slice places its state.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.a'
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.a',
    }),
    toStore(makeDataMachine(), {
      initialState: dataState(),
      statePath: 'machines.b',
      adjustActions: ({ machineActions }) => ({
        machines: { a: machineActions },
      }),
    }),
  );
});

// --- 4. method names -------------------------------------------------------

// Distinct paths, but both machines generate the same event methods.
void (() => {
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'go'
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.a',
    }),
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.b',
    }),
  );
});

// --- 5. nested combineSlices -----------------------------------------------

test('a combined initializer can be combined again', () => {
  const inner = combineSlices(
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.a',
    }),
    toCollectionStore(makeDataMachine(), {
      collectionPath: 'machines.jobs',
      selectIdFromData: data => data.id,
      adjustActions: ({ machineActions, lifecycleActions }) => ({
        jobActions: { ...machineActions, ...lifecycleActions },
      }),
    }),
  );
  const outer = combineSlices(
    inner,
    toStore(makeDataMachine(), {
      initialState: dataState(),
      statePath: 'machines.b',
      adjustActions: ({ machineActions }) => ({ bActions: machineActions }),
    }),
  );
  const store = createStore(outer);
  expect(store.getState().machines.a).type.toBe<PlainState>();
  expect(store.getState().machines.b).type.toBe<DataState>();
  expect(store.getState().machines.jobs).type.toBe<
    Partial<Record<string, DataState>>
  >();
  expect(store.getState().go).type.toBeCallableWith();
  expect(store.getState().jobActions.start).type.toBeCallableWith('j1');
  expect(store.getState().bActions.start).type.toBeCallableWith();
});

// A path claimed inside the inner combination is still seen by the outer one.
void (() => {
  const inner = combineSlices(
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.a',
    }),
    toCollectionStore(makeDataMachine(), {
      collectionPath: 'machines.jobs',
      adjustActions: ({ machineActions }) => ({ jobActions: machineActions }),
    }),
  );
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.jobs'
    inner,
    toCollectionStore(makeDataMachine(), {
      collectionPath: 'machines.jobs',
      adjustActions: ({ machineActions }) => ({
        moreJobActions: machineActions,
      }),
    }),
  );
});

// The outer slice's methods landing on a path the inner combination placed.
void (() => {
  const inner = combineSlices(
    toStore(makePlainMachine(), {
      initialState: plainState(),
      statePath: 'machines.a',
    }),
    toStore(makeDataMachine(), {
      initialState: dataState(),
      statePath: 'machines.b',
      adjustActions: ({ machineActions }) => ({ bActions: machineActions }),
    }),
  );
  combineSlices(
    // @ts-expect-error An earlier slice already defines 'machines.b'
    inner,
    toStore(makeDataMachine(), {
      initialState: dataState(),
      statePath: 'machines.c',
      adjustActions: ({ machineActions }) => ({
        machines: { b: machineActions },
      }),
    }),
  );
});

/**
 * Type-level tests for the collection-nesting helper.
 *
 * The helper returns a handler per inner event (like `forwardEvents`), each
 * folding the collection id into the payload; Check A rejects an element type
 * the inner machine can escape. Never executed at runtime.
 */

import { expect, test } from 'tstyche';
import {
  combineStates,
  defineState,
  forwardCollectionEvent,
  type StateCollection,
  type StateOf,
} from '../src';
import type { ApiError } from '../src/simply-stated';

const jobMachine = combineStates(
  defineState('Queued', 'Running', 'Done').withData<{
    id: string;
    percentage: number;
  }>(),
).createMachine(state => ({
  Queued: { started: data => state.Running(data) },
  Running: {
    progressed: (data, percentage: number) =>
      state.Running({ ...data, percentage }),
    finished: data => state.Done(data),
  },
  Done: {},
}));

type JobState = StateOf<typeof jobMachine.state>;

const { state: workingState } = combineStates(
  defineState('Working').withData<{ jobs: Record<string, JobState> }>(),
);

test('exposes a handler per inner event, folding the id into the payload', () => {
  const _handlers = forwardCollectionEvent(
    jobMachine,
    workingState.Working,
    data => data.jobs,
  );
  expect<Parameters<typeof _handlers.started>[1]>().type.toBe<{ id: string }>();
  expect<Parameters<typeof _handlers.progressed>[1]>().type.toBe<{
    id: string;
    payload: number;
  }>();
});

test('a literal-union id stays literal instead of widening to string', () => {
  const { state } = combineStates(
    defineState('Working').withData<{ jobs: Record<'a' | 'b', JobState> }>(),
  );
  const _handlers = forwardCollectionEvent(
    jobMachine,
    state.Working,
    data => data.jobs,
  );
  expect<Parameters<typeof _handlers.started>[1]>().type.toBe<{
    id: 'a' | 'b';
  }>();
});

test('the handlers are assignable into the outer state transition tree', () => {
  combineStates(
    defineState('Working').withData<{ jobs: Record<string, JobState> }>(),
  ).createMachine(state => ({
    Working: {
      ...forwardCollectionEvent(jobMachine, state.Working, data => data.jobs),
    },
  }));
});

test('a selector returning a single inner state is rejected', () => {
  const { state } = combineStates(
    defineState('Working').withData<{ job: JobState }>(),
  );
  // @ts-expect-error is not assignable to type
  forwardCollectionEvent(jobMachine, state.Working, data => data.job);
});

test('an element type the inner machine can escape is an ApiError property', () => {
  const { state } = combineStates(
    defineState('Working').withData<{
      jobs: Record<
        string,
        StateOf<typeof jobMachine.state, 'Queued' | 'Running'>
      >;
    }>(),
  );
  const handlers = forwardCollectionEvent(
    jobMachine,
    state.Working,
    data => data.jobs,
  );
  expect(handlers.finished).type.toBe<
    ApiError<`Forwarding 'finished' can store an inner state outside the declared element type`>
  >();
  expect(handlers.started).type.not.toBe<
    ApiError<`Forwarding 'started' can store an inner state outside the declared element type`>
  >();
});

test('StateCollection maps a state map to an id-keyed record', () => {
  expect<StateCollection<typeof jobMachine.state>>().type.toBe<
    Record<string, JobState>
  >();
});

test('StateCollection keeps a literal id type from a data path', () => {
  const { state: _slot } = combineStates(
    defineState('Slot').withData<{ id: 'a' | 'b'; label: string }>(),
  );
  expect<StateCollection<typeof _slot, 'id'>>().type.toBe<
    Record<'a' | 'b', StateOf<typeof _slot>>
  >();
});

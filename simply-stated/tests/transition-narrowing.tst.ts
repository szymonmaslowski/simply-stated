/**
 * Type-level tests for the narrowed `transition` overload.
 *
 * A literal state plus a literal event resolves to the specific handler's
 * return type (or the input state unchanged when nothing handles it), while
 * wide-union arguments still collapse to the full state union. Never executed.
 */

import { expect, test } from 'tstyche';
import { combineStates, defineState, type StateOf } from '../src';

const machine = combineStates(
  defineState('Idle'),
  defineState('Fetching').withData<{ query: string }>(),
  defineState('Success').withData<{ query: string; value: string }>(),
  defineState('Failure').withData<{ query: string; error: string }>(),
).createMachine(state => ({
  '*': { reset: () => state.Idle() },
  Idle: {
    fetch: (_, payload: { query: string }) => state.Fetching(payload),
  },
  Fetching: {
    resolved: (data, value: string) => state.Success({ ...data, value }),
    rejected: (data, error: string) => state.Failure({ ...data, error }),
  },
  Success: {
    refetch: ({ query }) => state.Fetching({ query }),
  },
  Failure: {
    retry: ({ query }) => state.Fetching({ query }),
  },
}));

type State<Name extends keyof typeof machine.state> = StateOf<
  typeof machine.state,
  Name
>;

test('a per-state handler resolves to its exact return type', () => {
  const next = machine.transition(
    machine.state.Fetching({ query: 'books' }),
    machine.event.resolved('payload'),
  );
  expect(next).type.toBe<State<'Success'>>();
});

test('a branching handler resolves to the union of its branches', () => {
  const idle = machine.transition(
    machine.state.Idle(),
    machine.event.fetch({ query: 'books' }),
  );
  expect(idle).type.toBe<State<'Fetching'>>();
});

test('a cross-state handler resolves to its return type', () => {
  const next = machine.transition(
    machine.state.Success({ query: 'books', value: 'payload' }),
    machine.event.reset(),
  );
  expect(next).type.toBe<State<'Idle'>>();
});

test('an unhandled event passes the input state through unchanged', () => {
  const next = machine.transition(
    machine.state.Idle(),
    machine.event.resolved('payload'),
  );
  expect(next).type.toBe<State<'Idle'>>();
});

test('a union input unions the handler return with the passthrough states', () => {
  const input = null as unknown as
    | State<'Idle'>
    | State<'Fetching'>
    | State<'Success'>;
  const next = machine.transition(input, machine.event.resolved('payload'));
  expect(next).type.toBe<State<'Idle'> | State<'Success'>>();
});

test('wide-union arguments collapse to the full state union', () => {
  const state = null as unknown as StateOf<typeof machine.state>;
  const event = null as unknown as ReturnType<
    (typeof machine.event)[keyof typeof machine.event]
  >;
  const next = machine.transition(state, event);
  expect(next).type.toBe<StateOf<typeof machine.state>>();
});

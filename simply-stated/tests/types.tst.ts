/**
 * Type-level tests covering the library's compile-time error surface.
 *
 * Each `@ts-expect-error` directive carries the expected error message.
 * The test verifies that the directive both fires and the actual diagnostic
 * includes the trailing text. The whole file is never executed at runtime.
 */

import { expect, test } from 'tstyche';
import {
  combineStates,
  defineState,
  is,
  type EventOf,
  type StateOf,
} from '../src';

// --- defineState() ----------------------------------------------------------

// 1. '*' is reserved for cross-state events and cannot be used as a state name.
void (() => {
  // @ts-expect-error '*' is reserved for cross-state events
  defineState('*');
});

// 2. withData<undefined>() is rejected — Data must extend NonNullable<unknown>.
void (() => {
  // @ts-expect-error does not satisfy the constraint
  defineState('A').withData<undefined>();
});

// 2b. At least one state name is required.
void (() => {
  // @ts-expect-error Expected at least 1 arguments, but got 0.
  defineState();
});

// --- combineStates() — duplicate state detection ----------------------------

// 3. Same state across two separate defineState() calls.
//    The error fires at the first offending argument because TS bails on
//    the first parameter mismatch when validating a rest-parameter call.
void (() => {
  combineStates(
    // @ts-expect-error Duplicate state 'A'
    defineState('A'),
    defineState('A'),
  );
});

// 4. Same state repeated within a single defineState() call.
//    The duplicate is reported at the combineStates() argument position.
void (() => {
  // @ts-expect-error Duplicate state 'A'
  combineStates(defineState('A', 'A'));
});

// 5. Same state mixing a void-data defineState with a .withData<>() variant.
//    Detection ignores the data shape — it is based solely on the state name.
void (() => {
  combineStates(
    // @ts-expect-error Duplicate state 'Open'
    defineState('Open'),
    defineState('Open').withData<{ secret: string }>(),
  );
});

// 6. Non-state-creator arguments are rejected by the rest-parameter constraint.
//    The constraint allows only state creators or arrays of state creators.
void (() => {
  combineStates(
    // @ts-expect-error not assignable to parameter
    'asd',
    defineState('A'),
  );
});

// --- createMachine() — payload consistency across handlers ------------------

// 7. Mismatching primitive payload types for the same event name.
void (() => {
  const { createMachine, state } = combineStates(
    defineState('A'),
    defineState('B'),
  );
  createMachine({
    A: {
      // @ts-expect-error Mismatching payload types across handlers
      click: (_, _p: string) => state.A(),
    },
    B: {
      // @ts-expect-error Mismatching payload types across handlers
      click: (_, _p: number) => state.B(),
    },
  });
});

// 8. Overlapping object payloads (one is a strict superset of the other).
//    Both shapes are valid objects, but they are not equal, so the validator
//    flags the inconsistency.
void (() => {
  const { createMachine, state } = combineStates(
    defineState('A'),
    defineState('B'),
  );
  createMachine({
    A: {
      // @ts-expect-error Mismatching payload types across handlers
      init: (_, _p: { id: string }) => state.A(),
    },
    '*': {
      // @ts-expect-error Mismatching payload types across handlers
      init: (_p: { id: string; extra: number }) => state.A(),
    },
    B: {},
  });
});

// 9. Mixing an implicit `any` payload with a concrete payload for the same
//    event. Two `any` handlers would be allowed (uniform); mixing is not.
void (() => {
  const { createMachine, state } = combineStates(
    defineState('A'),
    defineState('B'),
  );
  createMachine({
    A: {
      // payload param has no annotation → implicit `any`
      // @ts-expect-error Mismatching payload types across handlers
      click: (_, _p) => state.A(),
    },
    B: {
      // @ts-expect-error Mismatching payload types across handlers
      click: (_, _p: number) => state.B(),
    },
  });
});

// --- EventOf ----------------------------------------------------------------

// 10. EventOf requires a map of functions returning event objects ({ type }).
//    Plain callable maps that do not produce an event-shaped value are
//    rejected by the constraint.
void (() => {
  const _notEvents = {
    greet: () => 'hello',
    add: (a: number, b: number) => a + b,
  };
  // @ts-expect-error does not satisfy the constraint
  type _X = EventOf<typeof _notEvents>;
});

// --- State / event creator call shapes --------------------------------------

void (() => {
  const { createMachine, state } = combineStates(
    defineState('Closed'),
    defineState('Open').withData<{ accountId: string }>(),
  );
  const { event } = createMachine({
    Closed: { opened: (_, p: { accountId: string }) => state.Open(p) },
    Open: {
      closed: () => state.Closed(),
      failed: (_, _p: number) => state.Closed(),
    },
  });

  // 11. Event creator: payload type mismatch.
  // @ts-expect-error not assignable to parameter of type 'number'
  event.failed(false);

  // 12. Void-data state creator called with data.
  // @ts-expect-error Expected 0 arguments
  state.Closed({});

  // 13. With-data state creator called without data.
  // @ts-expect-error Expected 1 arguments
  state.Open();

  // 14. With-data state creator called with incomplete data.
  // @ts-expect-error is missing in type
  state.Open({});
});

// --- Positive type assertions -----------------------------------------------

const demoMachine = (() => {
  const { createMachine, state } = combineStates(
    defineState('Closed'),
    defineState('Open').withData<{ accountId: string }>(),
  );
  const { event, transition } = createMachine({
    '*': { reset: () => state.Closed() },
    Closed: {
      opened: (_, p: { accountId: string }) => state.Open(p),
    },
    Open: {
      closed: () => state.Closed(),
      failed: (_, _p: number) => state.Closed(),
    },
  });
  return { state, event, transition };
})();

test('StateOf without a name returns the union of all state names', () => {
  expect<StateOf<typeof demoMachine.state>['name']>().type.toBe<
    'Closed' | 'Open'
  >();
});

test('StateOf with a name extracts the matching state', () => {
  expect<
    StateOf<typeof demoMachine.state, 'Open'>['name']
  >().type.toBe<'Open'>();
  expect<StateOf<typeof demoMachine.state, 'Open'>['data']>().type.toBe<{
    accountId: string;
  }>();
});

test('EventOf without a name returns the union of all event types', () => {
  expect<EventOf<typeof demoMachine.event>['type']>().type.toBe<
    'reset' | 'opened' | 'closed' | 'failed'
  >();
});

test('EventOf with a name extracts the matching event shape', () => {
  expect<EventOf<typeof demoMachine.event, 'opened'>>().type.toBe<{
    type: 'opened';
    payload: { accountId: string };
  }>();
});

test('name discriminator narrows the state union', () => {
  const s = null as unknown as StateOf<typeof demoMachine.state>;
  if (s.name === 'Open') {
    expect(s.name).type.toBe<'Open'>();
    expect(s.data).type.toBe<{ accountId: string }>();
  }
});

test('is() narrows the state union', () => {
  const { state } = demoMachine;
  const currentState = null as unknown as StateOf<typeof demoMachine.state>;
  if (is(currentState, state.Open)) {
    expect(currentState.name).type.toBe<'Open'>();
    expect(currentState.data).type.toBe<{ accountId: string }>();
  }
});

test('previousData is undefined for void-data states', () => {
  const { createMachine, state } = combineStates(
    defineState('Closed'),
    defineState('Open').withData<{ accountId: string }>(),
  );
  createMachine({
    Closed: {
      ping: prev => {
        expect(prev).type.toBe<undefined>();
        return state.Closed();
      },
    },
    Open: {},
  });
});

test('previousData carries the declared data type for with-data states', () => {
  const { createMachine, state } = combineStates(
    defineState('Closed'),
    defineState('Open').withData<{ accountId: string; flag?: boolean }>(),
  );
  createMachine({
    Open: {
      toggle: prev => {
        expect(prev).type.toBe<{ accountId: string; flag?: boolean }>();
        return state.Open(prev);
      },
    },
    Closed: {},
  });
});

test('withData<Primitive>() yields a state creator that accepts the primitive', () => {
  const { state } = combineStates(defineState('Open').withData<string>());
  const open = state.Open('hello');
  expect(open.name).type.toBe<'Open'>();
  expect(open.data).type.toBe<string>();
});

test('identical union payloads shared across states are allowed', () => {
  const { createMachine, state } = combineStates(
    defineState('A'),
    defineState('B'),
  );
  const { event } = createMachine({
    A: {
      go: (_, _p: string | number) => state.A(),
    },
    B: {
      go: (_, _p: string | number) => state.B(),
    },
  });
  expect(event.go).type.toBe<
    (payload: string | number) => {
      type: 'go';
      payload: string | number;
    }
  >();
});

test('union-typed payload in a single handler is allowed', () => {
  const { createMachine, state } = combineStates(
    defineState('A'),
    defineState('B'),
  );
  const { event } = createMachine({
    A: {
      mixed: (_, _p: { kind: 'x' } | { kind: 'y'; extra: number }) => state.A(),
    },
    B: {},
  });
  expect(event.mixed).type.toBe<
    (payload: { kind: 'x' } | { kind: 'y'; extra: number }) => {
      type: 'mixed';
      payload: { kind: 'x' } | { kind: 'y'; extra: number };
    }
  >();
});

# Simply Stated API Reference

The package exports `combineStates`, `defineState`, `is`, `forwardEvents` and
the types `StateOf`, `EventOf`, `StateCreatorOf`. Anything else reachable in the
source is internal.

The Redux Toolkit adapters are documented separately —
[`simply-stated/redux-toolkit`](./simply-stated/src/adapters/redux-toolkit/README.md).

## Table of contents

- [Entry points](#entry-points)
  - [defineState](#definestate)
  - [combineStates](#combinestates)
  - [createMachine](#createmachine)
- [The transition tree](#the-transition-tree)
  - [Cross-state events](#cross-state-events)
- [The machine object](#the-machine-object)
  - [Machine.state](#machinestate)
  - [Machine.event](#machineevent)
  - [Machine.transition](#machinetransition)
  - [Disallowed transitions](#disallowed-transitions)
- [Helpers](#helpers)
  - [is](#is)
  - [forwardEvents](#forwardevents)
- [Type utilities](#type-utilities)
  - [StateOf](#stateof)
  - [EventOf](#eventof)
  - [StateCreatorOf](#statecreatorof)
- [Reserved names & compile-time rejections](#reserved-names--compile-time-rejections)

## Entry points

### defineState

**defineState(...stateNames)**<br />
**defineState(...stateNames).withData\<Data>()**

- `stateNames` _\<string>_ One or more state names. All names given in a single
  call share the same data shape. At least one name is required. `'*'` is
  reserved for [cross-state events](#cross-state-events) and rejected both at
  runtime and in types
- `Data` (only in Typescript) the type of the data carried by every state of
  this call. Without `.withData()` the states carry no `data` property at all
- Returns: \<StateDefinitions> an opaque tuple to be passed to
  [`combineStates`](#combinestates)

```typescript
defineState('Idle');
// → state object: { name: 'Idle' }

defineState('Listening').withData<Date>();
// → state object: { name: 'Listening', data: Date }

defineState('Queued', 'Processing').withData<Job>();
// → two states, both carrying a Job
```

### combineStates

**combineStates(...stateDefinitions)**

- `stateDefinitions` _\<StateDefinitions>_ Tuples returned by
  [`defineState`](#definestate). A state name repeated across the definitions is
  rejected both at runtime and in types — see
  [compile-time rejections](#reserved-names--compile-time-rejections)
- Returns: _\<Object>_
  - `state` _\<Object>_ Map of [state creators](#machinestate) keyed by state
    name. Same map as on the machine, available before the transition tree
    exists
  - `createMachine` <[createMachine](#createmachine)>

```typescript
const { state, createMachine } = combineStates(
  defineState('Idle'),
  defineState('Listening').withData<Date>(),
);
```

### createMachine

**createMachine(tree[, options])**<br />
**createMachine((state) => tree[, options])**

- `tree` <[TransitionTree](#the-transition-tree)> All allowed transitions. Given
  as a value, or as a factory receiving the `state` creators map.
- `options` _\<Object>_
  - `onInvalidTransition` _\<Function>_ Called with `{ state, event }` when an
    event has no handler in the current state and no `'*'` handler either. Its
    return value is **ignored** — `transition` always returns the unchanged input
    state, so this cannot redirect a transition. Use it for logging, telemetry,
    or throwing in strict/dev builds. **Default:** logs
    `Invalid transition: event '<type>' not allowed in state '<name>'` via
    `console.error`. Pass `() => {}` to silence it. See
    [disallowed transitions](#disallowed-transitions)
- Returns: <[Machine](#the-machine-object)>

```typescript
combineStates(
  defineState('Idle'),
  defineState('Listening').withData<Date>(),
).createMachine(
  state => ({
    Idle: { started: () => state.Listening(new Date()) },
    Listening: {},
  }),
  {
    onInvalidTransition: ({ state, event }) => {
      throw new Error(`'${event.type}' not allowed in '${state.name}'`);
    },
  },
);
```

## The transition tree

The tree has one key per defined state and requires all states to be specified.
Each state gets assigned an object with its list of events, or `{}` for states with no
events. There is also the optional `'*'` group for events available across all states.

Each state's object maps an event name to
its handler. The property name **is** the event type (`started` →
`{ type: 'started' }`).

- Per-state handler: **(data, payload?) => nextState**
  - `data` the current state's data (`undefined` for states without data)
  - `payload` optional **second** param. Its type declares the event's payload
    type; omit the param and the event carries no payload
- Handlers return the next state, built with a state creator. Returning the
  current state's own creator is a **self transition**

> ⚠️ An event name may appear under several states, but all its handlers must declare
> the **same** payload type — a mismatch is a
> [compile-time rejection](#reserved-names--compile-time-rejections).

```typescript
Listening: {
  consumed: (_, job: Job) => state.Queued(job),
  failed: (
    dateOfStart,
    { critical, reason }: { critical: boolean; reason: string },
  ) => {
    if (critical) return state.Failed({ reason });
    return state.Listening(dateOfStart);
  },
},
```

### Cross-state events

The optional `'*'` group holds events allowed in **any** state.

- Cross-state handler: **(payload?) => nextState**
  - There is **no data param** — cross-state handlers cannot read the current
    state's data. The payload is therefore the **first** param, unlike per-state
    handlers
- Precedence: a per-state handler for the same event name **wins** over the
  `'*'` one; `'*'` is the fallback

```typescript
'*': {
  reset: () => state.Idle(),
  killed: (reason: string) => state.Failed({ reason }),
},
```

## The machine object

Returned by [`createMachine`](#createmachine).

### Machine.state

- Returns: _\<Object>_ Map of state creators keyed by state name

A state creator builds a state object and carries the `stateName` property.
Creators of states defined without `.withData()` take no arguments; creators of
states with data take the data as their only argument. The produced state is a
plain **serialisable** object — `{ name }` or `{ name, data }`.

```typescript
const { state } = workerMachine;

state.Idle();
// → { name: 'Idle' }
state.Queued({ id: '0', data: Buffer.from('data') });
// → { name: 'Queued', data: { id: '0', data: Buffer<...> } }
state.Queued.stateName;
// → 'Queued'
```

### Machine.event

- Returns: _\<Object>_ Map of event creators keyed by event name

Derived from every event key found in the tree, the `'*'` group included. Events
whose handler declares no payload produce `() => { type }`; the rest produce
`(payload) => { type, payload }`.

```typescript
const { event } = workerMachine;

event.reset();
// → { type: 'reset' }
event.consumed({ id: '0', data: Buffer.from('data') });
// → { type: 'consumed', payload: { id: '0', data: Buffer<...> } }
```

### Machine.transition

**transition(state, event)**

- `state` _\<Object>_ The current state
- `event` _\<Object>_ The event to process
- Returns: _\<Object>_ The resulting state

A plain reducer — `(State, Event) => State`. It never mutates its input and
never throws on an unknown event, so it drops straight into `reduce`, a Redux
reducer, or any other event loop. Resolution order:

1. the current state's own handler for `event.type`,
2. else the `'*'` handler for `event.type`,
3. else [`onInvalidTransition`](#createmachine) runs and the **input state is
   returned unchanged**.

```typescript
const { event, state, transition } = workerMachine;

let currentState = state.Idle() as StateOf<typeof state>;
currentState = transition(currentState, event.started());
// → { name: 'Listening', data: Date }
```

### Disallowed transitions

An event with no handler in the current state and no `'*'` handler is a
**no-op**. `transition` returns the **same state object** unchanged and invokes
[`onInvalidTransition`](#createmachine). It does not throw and does not produce
an error state — invalid events are absorbed, surfaced by default only through
the `console.error` log.

This is intentional: the machine stays safe to feed arbitrary event streams
(the Redux Toolkit adapters dispatch over every machine event key), and
unhandled pairs fall through harmlessly.

```typescript
const idle = workerMachine.state.Idle();
// 'consumed' is only handled in 'Listening'
const next = workerMachine.transition(idle, workerMachine.event.consumed(job));
// → logs "Invalid transition: event 'consumed' not allowed in state 'Idle'"
// → next === idle (unchanged)
```

## Helpers

### is

**is(state, ...stateCreators)**

- `state` _\<Object>_ The state to check
- `stateCreators` _\<Function>_ One or more state creators to check against
- Returns: _\<boolean>_ `true` when `state.name` matches the `stateName` of any
  given creator

A standalone type guard — in a truthy branch it **narrows** the state union to
the matched states.

```typescript
import { is } from 'simply-stated';

if (is(currentState, state.Queued, state.Processing)) {
  // narrowed — .data is a Job here
  console.info('Job already consumed. Details:', currentState.data);
}
```

### forwardEvents

**forwardEvents(innerMachine, outerStateCreator, selector)**

- `innerMachine` <[Machine](#the-machine-object)> The nested machine, whose
  state lives inside the outer state's `data`
- `outerStateCreator` _\<Function>_ Creator of the outer state the handlers
  belong to. Every generated handler re-creates this state, so the outer state
  name never changes
- `selector` _\<Function>_ A `data => innerState` accessor locating the nested
  state inside the outer state's data
- Returns: _\<Object>_ One handler per inner event, keyed by the inner event
  names, ready to be spread into an outer state's tree entry

Each handler reads the nested state at the recorded path, runs the inner
machine's `transition` on it, writes the result back immutably and re-creates
the outer state. Payload types are inherited from the inner events.

```typescript
import { forwardEvents } from 'simply-stated';

combineStates(
  defineState('Open', 'Closed').withData<{
    lockState: StateOf<typeof lockMachine.state>;
  }>(),
).createMachine(state => ({
  Open: { closed: data => state.Closed(data) },
  Closed: {
    ...forwardEvents(lockMachine, state.Closed, data => data.lockState),
    opened: data => state.Open(data),
  },
}));
```

Spread the whole map, or pick individual handlers off it to wire one inner event
to a differently-named outer event. `forwardEvents` keeps the outer state name
fixed and cannot read the inner result, so it can neither branch the outer state
nor transform data — for those, call the inner `transition` by hand.

See the [nesting docs](./simply-stated/src/nesting/README.md) ·
[examples](./examples/nesting/README.md).

## Type utilities

### StateOf

**StateOf\<StateCreatorsMap[, StateName]>**

- `StateCreatorsMap` The `state` map of a machine (`typeof machine.state`)
- `StateName` _\<string>_ Optional. Narrows to the named state(s). **Default:**
  all states
- Returns: the union of the state object types

```typescript
import type { StateOf } from 'simply-stated';

const { state } = workerMachine;

type AnyWorkerState = StateOf<typeof state>;
// { name: 'Idle' } | { name: 'Listening', data: Date } | ...

type FinishedState = StateOf<typeof state, 'Processing' | 'Failed'>;
```

### EventOf

**EventOf\<EventCreatorsMap[, EventName]>**

- `EventCreatorsMap` The `event` map of a machine (`typeof machine.event`)
- `EventName` _\<string>_ Optional. Narrows to the named event(s). **Default:**
  all events
- Returns: the union of the event object types

```typescript
import type { EventOf } from 'simply-stated';

type AnyWorkerEvent = EventOf<typeof workerMachine.event>;
// { type: 'started' } | { type: 'consumed', payload: Job } | ...

type ConsumedEvent = EventOf<typeof workerMachine.event, 'consumed'>;
```

### StateCreatorOf

**StateCreatorOf\<StateCreatorsMap[, StateName]>**

- `StateCreatorsMap` The `state` map of a machine (`typeof machine.state`)
- `StateName` _\<string>_ Optional. Narrows to the named state(s). **Default:**
  all states
- Returns: the union of the **creator** types (not of the states they produce)

Use it to type code that passes creators around — a function taking a creator to
build a state with, or to pass to [`is`](#is).

```typescript
import type { StateCreatorOf } from 'simply-stated';

type JobStateCreator = StateCreatorOf<typeof state, 'Queued' | 'Processing'>;
// (job: Job) => { name: 'Queued', data: Job }
// | (job: Job) => { name: 'Processing', data: Job }

const carriesJob = (
  currentState: StateOf<typeof state>,
  ...jobStateCreators: JobStateCreator[]
) => is(currentState, ...jobStateCreators);
```

## Reserved names & compile-time rejections

Invalid usage is rejected at compile time through a branded `ApiError<Message>`
type. A type error carrying one of the messages below is the API rejecting the
usage **by design** — not a bug in your types.

| Usage                                                         | Message                                     | Rejected              |
| ------------------------------------------------------------- | ------------------------------------------- | --------------------- |
| `'*'` as a state name                                         | `'*' is reserved for cross-state events`    | runtime **and** types |
| Same state name twice across `defineState` / `combineStates`  | `Duplicate state '<name>'`                  | runtime **and** types |
| One event name whose handlers declare different payload types | `Mismatching payload types across handlers` | types only            |

```typescript
combineStates(defineState('Idle'), defineState('Idle').withData<Date>());
// type error: ApiError<"Duplicate state 'Idle'">
// runtime: throws Error("Duplicate state 'Idle'")
```

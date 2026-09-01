# Simply Stated API Reference

Requires **TypeScript >= 5.4**.

The [adapters](./simply-stated/src/adapters/README.md) and the
[runner](./simply-stated/src/runner/README.md) are documented separately.

```typescript
import { combineStates, defineState, forwardEvents, is } from 'simply-stated';
import type { StateOf, EventOf, StateCreatorOf } from 'simply-stated';
```

## Table of contents

- [Basic concepts](#basic-concepts)
  - [State](#state)
  - [Event](#event)
  - [Transition](#transition)
- [Entry points](#entry-points)
  - [defineState](#definestate)
  - [combineStates](#combinestates)
- [State creators map](#state-creators-map)
  - [State creator](#state-creator)
- [Event creators map](#event-creators-map)
  - [Event creator](#event-creator)
- [createMachine](#createmachine)
  - [onTransition](#ontransition)
  - [onInvalidTransition](#oninvalidtransition)
- [StateMachineTree](#statemachinetree)
  - [State level](#state-level)
  - [Event level](#event-level)
  - [Event handler](#event-handler)
    - [Per-state handler](#per-state-handler)
    - [Cross-state handler](#cross-state-handler)
  - [Cross-state events](#cross-state-events)
- [The machine object](#the-machine-object)
  - [Machine.state](#machinestate)
  - [Machine.event](#machineevent)
  - [Machine.transition](#machinetransition)
    - [Narrowed resulting state](#narrowed-resulting-state)
  - [Invalid transitions](#invalid-transitions)
- [Helpers](#helpers)
  - [is](#is)
  - [forwardEvents](#forwardevents)
- [Type utilities](#type-utilities)
  - [StateOf](#stateof)
  - [EventOf](#eventof)
  - [StateCreatorOf](#statecreatorof)
- [Compile-time rejections](#compile-time-rejections)
  - [UsageGuardError](#usageguarderror)

## Basic concepts

**State machine** is described by three things: the **states** it can be in, the
**events** it accepts, and the **transitions** mapping a state and an event to
the next state.

### State

Describes a distinct condition or status that a system can exist in at any
given moment. In simple words, a name for a unique situation.

It is represented by an object with a **name** property. It may also carry
**data**.
State is built by a [state creator](#state-creator).

```typescript
type State =
  | {
      name: string;
    }
  | {
      name: string;
      data: any;
    };

// Examples:
[
  { name: 'Idle' },
  {
    name: 'Fetching',
    data: { query: '' },
  },
];
```

The `name` is a literal type, so a state union discriminates on it — that is what
[is](#is) and [StateOf](#stateof) narrow with.

### Event

Describes an occurrence — what can happen in a given situation (state).

It is represented by an object with a **type** property. It may carry
a **payload**.
Event is built by an [event creator](#event-creator).

```typescript
type Event =
  | {
      type: string;
    }
  | {
      type: string;
      payload: any;
    };

// Examples:
[
  { type: 'created' },
  {
    type: 'fetchRequested',
    payload: { query: '' },
  },
];
```

### Transition

The change from one state to another in reaction to an event.

A state machine restricts state changes by defining explicit transitions —
ensuring a state can only move to specific, allowed target states.
Transitions are defined via nested structure
([StateMachineTree](#statemachinetree)) created during machine modelling.

```typescript
// For state 'Idle', event 'started' transitions to state 'Running'
Idle: { started: () => state.Running() },
```

```typescript
// Transition gets triggered with the transition function
const stateRunning = machine.transition(stateIdle, eventStarted);
```

## Entry points

### defineState

Defines one or more states of the same shape.

**defineState(...stateNames): StateDefinitionsTuple**<br />
**defineState(...stateNames).withData\<Data>(): StateDefinitionsTuple**

- `stateNames` _\<string>_ One or more state names. All names given in a single
  call share the same data shape. At least one name is required. `'*'` is
  reserved for [cross-state events](#cross-state-events) and rejected at
  runtime and on the type level — see [compile-time rejections](#compile-time-rejections).
- `Data` is the type of the data carried by every `stateName` of
  particular `defineState`. Without `.withData()` the states carry no `data`
  property at all.
- Returns: \<[StateDefinitionsTuple](#combinestates)> an opaque tuple to be passed to
  [`combineStates`](#combinestates)

```typescript
defineState('Idle');
// → state object: { name: 'Idle' }

defineState('Listening').withData<{ name: string }>();
// → state object: { name: 'Listening', data: { name: string } }

defineState('Queued', 'Processing').withData<Date>();
// → two states, both carrying a Date object
```

### combineStates

Combines state definitions of the [defineState](#definestate) into single map.

**combineStates(...stateDefinitionsTuples): { state, createMachine }**

- `stateDefinitionsTuples` _\<StateDefinitionsTuple[]>_ Tuples returned by
  [`defineState`](#definestate). A state name repeated across the definitions is
  rejected at runtime and type level — see [compile-time rejections](#compile-time-rejections)
- Returns:
  - `state` _\<[State creators map](#state-creators-map)>_
  - `createMachine` _\<[createMachine](#createmachine)>_

```typescript
const { state, createMachine } = combineStates(
  defineState('Idle'),
  defineState('Listening').withData<Date>(),
);
```

## State creators map

Map of state creators keyed by state name

### State creator

Produces [state](#state) object.

**() => { name }**<br />
**(data) => { name, data }**

- `data` _\<any>_
- Returns: [state](#state) object.

State creators build [state objects](#state) and carry the `stateName` property.
Creators of states defined without `.withData()` take no arguments, while
creators of states with data take the data as their only argument.

```typescript
// The same state creators are returned from `createMachine` and `combineStates`
const { state } = combineStates(...);
// const { state } = createMachine(...);

state.Idle();
// → { name: 'Idle' }
state.Queued({ id: '0', data: Buffer.from('data') });
// → { name: 'Queued', data: { id: '0', data: Buffer<...> } }
state.Queued.stateName;
// → 'Queued'
```

## Event creators map

Map of event creators keyed by event name.

### Event creator

Produces [event](#event) object.

**() => { type }**<br />
**(payload) => { type, payload }**

- `payload` _\<any>_
- Returns: [event](#event) object.

Event creators build an [event object](#event). Creators of events that
carry payload take that payload as an argument, while creators for events
without payload take no argument.

Events and the Event creators map are derived from every event key found in
the [StateMachineTree](#statemachinetree),
the [cross-state](#cross-state-events) group included.

```typescript
const { event } = workerMachine;

event.reset();
// → { type: 'reset' }
event.jobAssigned({ id: '0', data: Buffer.from('data') });
// → { type: 'jobAssigned', payload: { id: '0', data: Buffer<...> } }
```

## createMachine

Builds the actual state machine.

**createMachine(tree[, options]): Machine**<br />
**createMachine((state) => tree[, options]): Machine**

- `tree` _\<[StateMachineTree](#statemachinetree)>_ Nested structure describing
  behaviour of the state machine.
  - `state` _\<[State creators map](#state-creators-map)>_ The tree could be provided
    directly or as a factory receiving the [state creators map](#state-creators-map)
    - the same map as the one returned from the
      [combineStates](#combinestates) and the one of the
      [Machine](#the-machine-object).
- `options` _\<Object>_ Optional.
  - `onTransition` _\<[onTransition](#ontransition)>_
  - `onInvalidTransition` _\<[onInvalidTransition](#oninvalidtransition)>_
- Returns: _\<[Machine](#the-machine-object)>_

### onTransition

Callback fired for every performed transition.

**({ state: State; event: Event; nextState: State }): void**

Gets called by the [Machine.transition](#machinetransition) once a handler
computed the resulting state, with the `state` and `event` that were supplied
to the transition and the resulting `nextState`. It fires for both
[per-state](#per-state-handler) and [cross-state](#cross-state-handler)
handlers, [self transitions](#event-handler) included. It does **not** fire for
an [invalid transition](#invalid-transitions) — that case is reported by
[onInvalidTransition](#oninvalidtransition).

The transition returns the state computed by the handler, so the callback
cannot be used to amend the result. Its return value is ignored.

Use it for logging, telemetry, or persisting the transition history. Note the
`state` and `nextState` are the **wide state unions** — narrow them with
[is](#is) when a specific state is of interest.

A transition of an inner machine driven by [forwardEvents](#forwardevents) runs
that machine's own `transition`, so **both** machines' callbacks fire — the
inner one first.

**Default:** none.

---

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
    onTransition: ({ state, event, nextState }) => {
      console.info(`${state.name} --${event.type}--> ${nextState.name}`);
    },
  },
);
```

### onInvalidTransition

Callback fired for an [invalid transition](#invalid-transitions).

**({ state: State; event: Event }): void**

Gets called for an [invalid transition](#invalid-transitions) with `state` and
`event` that were supplied to the [Machine.transition](#machinetransition).
The transition always returns the unchanged input state in such case, and it
cannot be used to amend this behaviour.

Use it for logging (using own logger), telemetry, or throwing in strict/dev
builds. Pass `() => {}` to silence it.

**Default:** logs
`Invalid transition: event 'picked' not allowed in state 'Idle'` message via
`console.error`.

---

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

## StateMachineTree

A nested object describing the state machine behaviour. It has two levels of
nesting: **state level** and **event level**. The event-level specifies **event
handlers**.

```
{
  <State level>: {
    <Event level>: <Event handler>
  },
}
```

### State level

The tree specifies a key for each defined state and requires all states to be
specified. Each state key gets assigned an object listing its allowed events.

There is also the optional `'*'` group for events available across all states
(see [Cross-state events](#cross-state-events)).

### Event level

An object listing events available for a given state. Each event property name
**becomes** the [event](#event)'s type (`started` → `{ type: 'started' }`).

A state may define no events at all (`{}`), and if there are no
[Cross-state events](#cross-state-events) available, such state becomes a
**final state** — there is no way out of it.

Each event property specifies its handler function.

### Event handler

Event handlers compute the next state (and its data) and return it using
[state creator](#state-creator). Returning the given state's own creator is
called a **self transition** — in such case the state does not change (but its
data can). By specifying an optional payload param, the event handler defines
that [event](#event)'s payload's type. When omitted the event won't carry any
payload.

> ⚠️ The same event name may appear under several states, but all its handlers
> must define **identical** payload type (or none) — a mismatch is a
> [compile-time rejection](#compile-time-rejections).

Handler's parameters vary depending on whether it is a **per-state handler** or
a **cross-state handler** — cross-state handlers cannot read the state's data
(see [cross-state events](#cross-state-events)).

#### Per-state handler

**(data): nextState**<br />
**(data, payload: any): nextState**

- `data` of the state that particular event was defined for. (`undefined`
  for states without data).
- `payload` is an optional **second** param, defining the event's payload type.

#### Cross-state handler

**(): nextState**<br />
**(payload: any): nextState**

- `payload` an optional **first** param, defining the event's payload type.

### Cross-state events

The optional, state-level `'*'` group defines events allowed in **any** state.
Cross-state event handlers cannot read the state's data. The payload is
therefore the **first** param, unlike per-state handlers.

A state that defines no events of its own still accepts the cross-state ones.

A per-state handler for the same event name **wins** over the `'*'` one.

---

```typescript
{
  '*': {
    reset: () => state.Idle(),
  },
  Listening: {
    failed: (
      data,
      { critical, reason }: { critical: boolean; reason: string },
    ) => {
      if (critical) return state.Failed({ reason });
      return state.Listening(data);
    },
  },
}
```

## The machine object

Returned by [createMachine](#createmachine).

### Machine.state

The [State creators map](#state-creators-map).

### Machine.event

The [Event creators map](#event-creators-map).

### Machine.transition

**transition(state, event): nextState**

- `state` _\<[State](#state)>_ The current state
- `event` _\<[Event](#event)>_ The event to process
- Returns: `nextState` _\<[State](#state)>_ The resulting state

A reducer function. When executed, the target handler for provided event gets
resolved based on `state.name` and `event.type` in the following
order:

1. the provided state's own handlers,
2. the `'*'` group handlers,
3. no handler available — the [onInvalidTransition](#createmachine) runs and
   the **input state is returned unchanged**.

When a handler was found (1 or 2), the [onTransition](#ontransition) callback
runs with the resulting state before it is returned.

```typescript
const { event, state, transition } = myMachine;

const resultState = transition(state.Idle(), event.started());
// → { name: 'Listening', data: Date }
```

#### Narrowed resulting state

When supplying a state of specific type, e.g. created by the
[state creator](#state-creator), or narrowed with the [StateOf](#stateof) type
helper, the transition function is able to narrow the type of resulting state.

It narrows when **both** the state and the event are of a specific type. A union
in either position widens the result — supplying the full state union gives back
the full state union.

In case of an [invalid transition](#invalid-transitions), the returned
state is the unchanged input state, and so its type.

```typescript
import { StateOf } from 'simply-stated';

transition(state.Idle(), event.started());
// → Listening (narrowed)

transition(state.Idle(), event.picked());
// → Idle ('picked' is not handled in 'Idle' → input unchanged)

const inputState = state.Idle() as StateOf<typeof state>;
transition(inputState, event.started());
// → Idle | Listening | ... → wide state union
```

### Invalid transitions

If the supplied transition params (state and event) do not form a transition
(they don't match any handler in the [StateMachineTree](#statemachinetree)),
such transition attempt is invalid. In that case the
[Machine.transition](#machinetransition) function returns the **same state
object** unchanged and invokes [onInvalidTransition](#createmachine). The
[onTransition](#ontransition) callback does not run.

```typescript
const idleState = myMachine.state.Idle();

const next = myMachine.transition(
  idleState,
  // 'picked' is only handled in 'Queued'
  myMachine.event.picked(),
);
// → next === idleState (the same object, unchanged)
```

## Helpers

### is

A type guard, checking if supplied [state](#state) matches any of supplied
[state creators](#state-creator).

**is(state, ...stateCreators): boolean**

- `state` _\<[State](#state)>_ The state to check
- `stateCreators` _\<[State creator](#state-creator)>_ One or more state creators to check against
- Returns: _\<boolean>_ Whether the state was matched

It **narrows** the state union to the matched states. It's a handy alternative
to manual state name checking, paying off when you compare against many states.

```typescript
import { is } from 'simply-stated';

// if (currentState.name === 'Queued' || currentState.name === 'Processing') {
if (is(currentState, state.Queued, state.Processing)) {
  // narrowed — both Queued and Processing states' data is a Job with id property
  console.info(`Job ${currentState.data.id} already assigned.`);
}
```

### forwardEvents

Nests one machine into another, by forwarding inner machine's events to become
the outer machine's events. Read more in the
[nesting machines](./simply-stated/src/nesting/README.md) docs and check out
[examples](./examples/nesting/README.md).

**forwardEvents(innerMachine, outerStateCreator, innerStateSelector): forwardedEvents**

- `innerMachine` _\<[Machine](#the-machine-object)>_ The nested machine, whose
  state lives inside the outer state's `data`
- `outerStateCreator` _\<[State creator](#state-creator)>_ Creator of the
  outer state — the state where inner events are being forwarded.
- `innerStateSelector` _\<[InnerStateSelector](#innerstateselector)>_ Locates
  the nested state inside the outer state's data.
- Returns: `forwardedEvents` _\<Record<EventName, EventHandler>>_ One handler
  per inner event, keyed by the inner event names, ready to be spread into an
  outer state's tree entry

Each handler inherits the type of the inner event, reads the nested state
using provided `innerStateSelector`, runs the inner machine's `transition`
on it and writes the result back immutably re-creating the outer state.

#### InnerStateSelector

**(data): innerState**

- `data` The data carried by the outer state
- `innerState` The state of the nested machine defined on the outer state's
  data type

---

```typescript
import { forwardEvents } from 'simply-stated';

combineStates(
  defineState('Open', 'Closed').withData<{
    lockState: StateOf<typeof lockMachine.state>;
  }>(),
).createMachine(state => ({
  Open: { closed: data => state.Closed(data) },
  Closed: {
    // Defining all lockMachine's events on the 'Closed' state
    ...forwardEvents(lockMachine, state.Closed, data => data.lockState),
    opened: data => state.Open(data),
  },
}));
```

## Type utilities

### StateOf

Extracts the State type — the entire union, or a subset.

**StateOf\<StateCreatorsMap[, StateName]> = StateType**

- `StateCreatorsMap` _\<[State creators map](#state-creators-map)>_ The type of state
  creators map (`typeof machine.state`).
- `StateName` _\<string>_ Optional. Narrows to the specified state(s).
  **Default:** all states.
- Returns: `StateType` _\<[State](#state)>_ The union of the state object types.

```typescript
import type { StateOf } from 'simply-stated';

const { state } = workerMachine;

type AnyWorkerState = StateOf<typeof state>;
// { name: 'Idle' } | { name: 'Listening', data: Date } | ...

type FinishedState = StateOf<typeof state, 'Processing' | 'Failed'>;
```

### EventOf

Extracts the Event type — the entire union, or a subset.

**EventOf\<EventCreatorsMap[, EventName]> = EventType**

- `EventCreatorsMap` _\<[Event creators map](#event-creators-map)>_ The type of
  event creators map (`typeof machine.event`)
- `EventName` _\<string>_ Optional. Narrows to the specified event(s).
  **Default:** all events.
- Returns: `EventType` _\<[Event](#event)>_ the union of the event object types.

```typescript
import type { EventOf } from 'simply-stated';

const { event } = workerMachine;

type AnyWorkerEvent = EventOf<typeof event>;
// { type: 'started' } | { type: 'jobAssigned', payload: Job } | ...

type JobAssignedEvent = EventOf<typeof event, 'jobAssigned'>;
```

### StateCreatorOf

Extracts the StateCreator type — the entire union, or a subset.<br />
Like the [StateOf](#stateof), but returning StateCreator type instead of a State type.

**StateCreatorOf\<StateCreatorsMap[, StateName]> = StateCreatorsUnion**

- `StateCreatorsMap` _\<[State creators map](#state-creators-map)>_ The type of state
  creators map (`typeof machine.state`).
- `StateName` _\<string>_ Optional. Narrows to the specified state(s).
  **Default:** all states.
- Returns: `StateCreator` _\<[State creator](#state-creator)>_ The union of the
  state creator types.

```typescript
import type { StateCreatorOf } from 'simply-stated';

type JobStateCreator = StateCreatorOf<typeof state, 'Queued' | 'Processing'>;
// (job: Job) => { name: 'Queued', data: Job } | (job: Job) => { name: 'Processing', data: Job }

const carriesJob = (
  currentState: StateOf<typeof state>,
  ...jobStateCreators: JobStateCreator[]
) => is(currentState, ...jobStateCreators);
```

## Compile-time rejections

One of the biggest strengths of this library is that it clearly communicates
any invalid usage with type errors. Some of them will contain the
`UsageGuardError<Message>` in the message (sometimes it might be buried under
other less vocal messages). This type error carrying one of the messages below
is the API rejecting the usage **by design** — not a bug in your types.

### UsageGuardError

**Reserved keyword used for a state name**

The `'*'` supplied as a state name to [defineState](#definestate).

```typescript
// UsageGuardError<'*' is reserved for cross-state events>
defineState('*');
```

**State name duplication**

Duplication of the state name in [defineState](#definestate) or
[combineStates](#combinestates).

```typescript
combineStates(
  // UsageGuardError<Duplicate state 'DuplicatedState'>
  defineState('Idle', 'DuplicatedState'),
  defineState('DuplicatedState'),
);
```

**Event payload type mismatch**

When handlers of the same event defined in different states have different
types of payload.

```typescript
{
  Compiling: {
    // UsageGuardError<Mismatching payload types across handlers>
    killed: (_, payload: { exitCode: number }) => {/* ... */},
  },
  Running: {
    // UsageGuardError<Mismatching payload types across handlers>
    killed: (_, payload: { exitCode: number, reason: string }) => {/* ... */},
  },
}
```

**Forwarded event not reachable**

When the nested state is narrowed to the subset for which forwarded event
is not available.

```typescript
// Nested machine (switcherMachine)
{
  On: { off: /* ... */ },
  Off: { on: /* ... */) },
}

// Parent machine
defineState('Running').withData<{
  switcher: StateOf<typeof switcherMachine.state, 'On'>;
}>();

{
  // UsageGuardError<Forwarded event 'on' is not handled by any inner state ('On')>
  Running: {
    on: forwardEvents(switcherMachine, /* ... */).on,
  },
}
```

**Forwarded event transitions out of the defined state**

When the nested state is narrowed to the subset and forwarded event transitions
the nested state to the state which does not match the subset.

```typescript
// Nested machine (switcherMachine)
{
  On: { lock: () => state.Locked() },
}

// Parent machine
defineState('Running').withData<{
  switcher: StateOf<typeof switcherMachine.state, 'On'>;
}>();

{
  // UsageGuardError<Forwarded event 'lock' transitions to an unexpected inner state ('Locked')>
  Running: {
    lock: forwardEvents(switcherMachine, /* ... */).lock,
  },
}
```

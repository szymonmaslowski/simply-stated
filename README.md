# Simply Stated

Strongly typed, declarative utility for state machine modeling.

<hr/>

Simply Stated is NOT a _state management_ lib - It is all about **state description**.

1. Describe your state shape and behavior.<br />
2. Drive it using your preferred state management solution.

See [adapters & examples](#adapters--examples) for popular state management
libraries.

## API

The below example showcases an abstract processing worker state.

### Step 1. Describe the state shape

Define all possible states (names) and specify the shape of the data carried by each of them.

<details open>
<summary>With comments</summary>

```typescript
import { combineStates, defineState } from 'simply-stated';

type Job = {
  id: string;
  data: Buffer;
};

const workerMachine = combineStates(
  // State is represented by a string (state name)
  defineState('Idle'),
  // It might carry a data
  defineState('Listening').withData<Date>(),
  // Multiple names define multiple states of the same shape
  defineState('Queued', 'Processing').withData<Job>(),
  defineState('Failed').withData<{ reason: string }>(),
).createMachine(/* ... */);
```

</details>

<details>
<summary>Just code</summary>

```typescript
import { combineStates, defineState } from 'simply-stated';

type Job = {
  id: string;
  data: Buffer;
};

const workerMachine = combineStates(
  defineState('Idle'),
  defineState('Listening').withData<Date>(),
  defineState('Queued', 'Processing').withData<Job>(),
  defineState('Failed').withData<{ reason: string }>(),
).createMachine(/* ... */);
```

</details>

### Step 2. Describe the behavior - relations between states

List allowed events for each of defined state and the results (next states) of processing those events.

<details open>
<summary>With comments</summary>

```typescript
const workerMachine = combineStates(/* ... */).createMachine(state => ({
  // Each defined state has to be listed as root-level property
  Idle: {
    // Nested properties define events allowed ONLY in a given state.
    // Property name becomes an event type ({ type: 'started' }).
    // Each event handler returns resulting state.
    started: () => state.Listening(new Date()),
  },
  Listening: {
    // Event handler might define a payload by specifying SECOND param
    // ({ type: 'consumed', payload: Job })
    consumed: (_, job: Job) => state.Queued(job),
    failed: (
      // The first param is the data of a given state ('Listening' has a Date)
      dateOfStart,
      { critical, reason }: { critical: boolean; reason: string },
    ) => {
      if (critical) return state.Failed({ reason });
      // Self transition - State does not have to change
      return state.Listening(dateOfStart);
    },
  },
  Queued: {
    picked: job => state.Processing(job),
  },
  // States might skip defining their events
  Processing: {},
  Failed: {},
  // A star group define events that are allowed in ANY state (cross-state events).
  // The star group is optional; your machine may not define any cross-state events
  '*': {
    reset: () => state.Idle(),
    // Cross-state events DOES NOT have access to the state's data.
    // The payload of cross-state events is specified as the FIRST param
    failForced: (reason: string) => state.Failed({ reason }),
  },
}));
```

</details>

<details>
<summary>Just code</summary>

```typescript
const workerMachine = combineStates(/* ... */).createMachine(state => ({
  Idle: {
    started: () => state.Listening(new Date()),
  },
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
  Queued: {
    picked: job => state.Processing(job),
  },
  Processing: {},
  Failed: {},
  '*': {
    reset: () => state.Idle(),
    failForced: (reason: string) => state.Failed({ reason }),
  },
}));
```

</details>

### Step 3. Process the state

This step depends on your application design and the way it manages the state.

- Backend system might process events and use the state machine to validate and
  derive the current object state.
- Frontend applications usually store the current state with state management
  libraries (redux, zustand etc.). See the [adapters & examples](#adapters--examples).

Either way, the app calls the `transition` function passing the **base state**
and the **event** to compute the **resulting state**.

<details open>
<summary>With comments</summary>

```typescript
import { is, type EventOf, type StateOf } from 'simply-stated';

const { state } = workerMachine;

// The StateOf extracts the union of types of all defined states.
// You can specify a second type param to extract specific type(s).
// StateOf<typeof state, 'Listening' | 'Failed'>
type MachineState = StateOf<typeof state>;
let currentState = state.Listening(new Date()) as MachineState;

// The EventOf works exactly like StateOf but for events
// EventOf<typeof event, 'failed'>
type MachineEvent = EventOf<typeof workerMachine.event>;
const processEvents = (eventsToProcess: MachineEvent[]) => {
  // `transition` is a reducer function: transition(State, Event): State
  const nextState = eventsToProcess.reduce(
    workerMachine.transition,
    currentState,
  );
  currentState = nextState;
  return nextState;
};

// nextEvent: { type: 'consumed', payload: { id: '0', data: Buffer<...> } }
const nextEvent = workerMachine.event.consumed({
  id: '0',
  data: Buffer.from('data'),
});

// resultingState: { name: 'Queued', data: { id: '0', data: Buffer<...> } }
const resultingState = processEvents([nextEvent]);

// The 'is' helper works by comparing the state names
// currentState.name === state.Queued.stateName
// || currentState.name === state.Processing.stateName
if (is(currentState, state.Queued, state.Processing)) {
  // It narrows the state type.
  // The .data property is available for Queued and Processing states
  console.info('Job already consumed. Details:', currentState.data);
}
```

</details>

<details>
<summary>Just code</summary>

```typescript
import { is, type EventOf, type StateOf } from 'simply-stated';

const { state } = workerMachine;

type MachineState = StateOf<typeof state>;
let currentState = state.Listening(new Date()) as MachineState;

type MachineEvent = EventOf<typeof workerMachine.event>;
const processEvents = (eventsToProcess: MachineEvent[]) => {
  const nextState = eventsToProcess.reduce(
    workerMachine.transition,
    currentState,
  );
  currentState = nextState;
  return nextState;
};

const nextEvent = workerMachine.event.consumed({
  id: '0',
  data: Buffer.from('data'),
});
const resultingState = processEvents([nextEvent]);

if (is(currentState, state.Queued, state.Processing)) {
  console.info('Job already consumed. Details:', currentState.data);
}
```

</details>

## Adapters & examples

Describe your state, then plug it into your state manager with available
adapters. See examples in [examples/](examples).

- **Redux Toolkit** — slice & collection adapters (`simply-stated/redux-toolkit`)
  · [docs](simply-stated/src/adapters/redux-toolkit/README.md) ·
  [examples](examples/redux-toolkit/README.md)
- **Zustand** — _(coming soon)_

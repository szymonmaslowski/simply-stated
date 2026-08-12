# Simply Stated

Strongly typed, declarative utility for state machine modelling
that **integrates with your existing state management solution**.

Best-in-class dev experience with **compile-time guards** and a simple
and powerful API.

```bash
npm install simply-stated
```

New to state machines? Get familiar reading
[basic concepts](./API_REFERENCE.md#basic-concepts).

---

Simply Stated is a _state ~~management~~ **description**_ tool.

Having your state management solution of choice in place,
use Simply Stated to:

1. **Describe** (model) your state shape and behaviour as a state-machine.
2. Drive it using your state management solution — manually or using one of
   the available adapters that do it for you.

See [adapters](#adapters) for popular state management libraries.

**Strong type support** - strongest of its strong strengths. 🙃<br />
Simply Stated puts a huge emphasis on guarding the proper usage with clear type
errors.
See [compile-time rejections](./API_REFERENCE.md#compile-time-rejections).

Fast-forward to:

- [API Walkthrough](#api-walkthrough)
- [API Reference](./API_REFERENCE.md)
- [Nesting machines](#nesting-machines)
- [Adapters](#adapters)

## Quick look

```typescript
import { combineStates, defineState } from 'simply-stated';

const doorMachine = combineStates(
  defineState('Open'),
  defineState('Closed', 'Locked').withData<{ closedTimestamp: number }>(),
).createMachine(state => ({
  Open: {
    close: (_, closedTimestamp: number) => state.Closed({ closedTimestamp }),
  },
  Closed: {
    open: () => state.Open(),
    lock: data => state.Locked(data),
  },
  Locked: {},
}));

const { event, state, transition } = doorMachine;

const stateOpen = state.Open();
const stateClosed = transition(stateOpen, event.close(Date.now()));
const stateLocked = transition(stateClosed, event.lock());

// Each resulting state is narrowed to the state that particular transition
// leads to, so the 'Locked' data is reachable without any check.
console.info('Closed timestamp:', stateLocked.data.closedTimestamp);
```

## API Walkthrough

The below walkthrough explains the Simply Stated usage in action. For the full
API listing, head to the [API Reference](./API_REFERENCE.md) page.

### Subject: modelling an abstract processing worker

#### Step 1. Describe the state shape

First we need to define all possible states (names) and specify the shape of
the data carried by each of them.

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

#### Step 2. Describe the behaviour — relations between states

Second step is about listing allowed events for each defined state + the
results (next states) of processing those events.

<details open>
<summary>With comments</summary>

```typescript
const workerMachine = combineStates(/* ... */).createMachine(
  state => ({
    // Each defined state has to be listed as root-level property
    Idle: {
      // Nested properties define events allowed ONLY in a given state.
      // Property name becomes an event type ({ type: 'started' }).
      // Each event handler returns resulting state.
      started: () => state.Listening(new Date()),
    },
    Listening: {
      // Event handler might define a payload by specifying SECOND param
      // ({ type: 'jobAssigned', payload: Job })
      jobAssigned: (_, job: Job) => state.Queued(job),
    },
    Queued: {
      // The FIRST param of a handler is the data of a given state
      // ('Queued' state's data is a Job)
      picked: job => state.Processing(job),

      // Same events might be defined by different states, but they have to
      // carry identical payloads
      jobAssigned: (_, job: Job) =>
        // State does not have to change (Self Transition)
        // In this case: Queued -> jobAssigned -> Queued
        state.Queued(job),
    },
    Processing: {
      completed: () => state.Idle(),

      failed: (
        job,
        { critical, reason }: { critical: boolean; reason: string },
      ) => {
        if (critical) return state.Failed({ reason });
        return state.Processing(job);
      },
    },
    // States don't have to define any events
    Failed: {},
    // A star group defines events that are allowed in ANY state (cross-state events).
    // The star group is optional; your machine may not define any cross-state events
    '*': {
      reset: () => state.Idle(),
      // Cross-state events DO NOT have access to the state's data.
      // The payload of cross-state events is specified as the FIRST param
      killed: (reason: string) => state.Failed({ reason }),
    },
  }),
  {
    // Optional onTransition function gets called for every performed
    // transition, right after the handler computed the resulting state.
    // It cannot amend the result — use it for logging, telemetry etc.
    onTransition: ({ state, event, nextState }) => {
      console.info(`${state.name} --${event.type}--> ${nextState.name}`);
    },

    // Optional onInvalidTransition function gets called when attempted to
    // "execute" an event that is not allowed for a given state.
    // By default the transition function logs an error to the console
    // and returns the input state (makes a self transition).
    onInvalidTransition: ({ state, event }) => {
      throw new Error(`'${event.type}' not allowed in '${state.name}'`);
    },
  },
);
```

</details>

<details>
<summary>Just code</summary>

```typescript
const workerMachine = combineStates(/* ... */).createMachine(
  state => ({
    Idle: {
      started: () => state.Listening(new Date()),
    },
    Listening: {
      jobAssigned: (_, job: Job) => state.Queued(job),
    },
    Queued: {
      picked: job => state.Processing(job),
      jobAssigned: (_, job: Job) => state.Queued(job),
    },
    Processing: {
      completed: () => state.Idle(),
      failed: (
        job,
        { critical, reason }: { critical: boolean; reason: string },
      ) => {
        if (critical) return state.Failed({ reason });
        return state.Processing(job);
      },
    },
    Failed: {},
    '*': {
      reset: () => state.Idle(),
      killed: (reason: string) => state.Failed({ reason }),
    },
  }),
  {
    onTransition: ({ state, event, nextState }) => {
      console.info(`${state.name} --${event.type}--> ${nextState.name}`);
    },
    onInvalidTransition: ({ state, event }) => {
      throw new Error(`'${event.type}' not allowed in '${state.name}'`);
    },
  },
);
```

</details>

#### Step 3. Process the state

This step depends on your application design and the way it manages the state.

- Backend system might process events and use the state machine to validate and
  derive the current object state.
- Frontend applications usually store the current state with state management
  libraries (redux, zustand etc.). See the [adapters](#adapters).

Either way, the app calls the `transition` function passing the **base state**
and the **event** to compute the **resulting state**.

<details open>
<summary>With comments</summary>

```typescript
import { is, type EventOf, type StateOf } from 'simply-stated';

const { event, state, transition } = workerMachine;

const stateIdle = state.Idle();
// Run machine's transition function to "execute" given event on a given state.
const stateListening = transition(stateIdle, event.started());

// The type of resulting state is determined by the types of input state and
// event, so we can access the Date without any additional checks.
// stateListening: { name: 'Listening', data: Date }
console.info(`Started listening at ${stateListening.data.toUTCString()}`);

// The StateOf extracts the union of types of all defined states.
// You can specify a second type param to extract specific type(s).
// StateOf<typeof state, 'Listening' | 'Failed'>
type WorkerState = StateOf<typeof state>;
// The currentState will be a container holding any possible worker state,
// so we need to cast the narrowed 'stateListening' to WorkerState (union of all states)
let currentState = stateListening as WorkerState;

// The EventOf works exactly like StateOf but for events
// EventOf<typeof event, 'failed'>
type WorkerEvent = EventOf<typeof workerMachine.event>;
const processEvents = (eventsToProcess: WorkerEvent[]) => {
  // `transition` is a reducer function: transition(State, Event): State
  const nextState = eventsToProcess.reduce(
    workerMachine.transition,
    currentState,
  );
  currentState = nextState;
  return nextState;
};

// eventJobAssigned: { type: 'jobAssigned', payload: { id: '0', data: Buffer<...> } }
const eventJobAssigned = workerMachine.event.jobAssigned({
  id: '0',
  data: Buffer.from('data'),
});
// eventPicked: { type: 'picked' }
const eventPicked = workerMachine.event.picked();

// resultingState: { name: 'Queued', data: { id: '0', data: Buffer<...> } }
const resultingState = processEvents([eventJobAssigned, eventPicked]);

try {
  // We configured the machine ('onInvalidTransition' option) to throw an error
  // for disallowed events.
  // The 'currentState' is now 'Queued', so event 'jobAssigned' is not allowed.
  processEvents([eventJobAssigned]);
} catch {}

// The 'is' helper works by comparing the state names
// resultingState.name === state.Queued.stateName
// || resultingState.name === state.Processing.stateName
if (is(resultingState, state.Queued, state.Processing)) {
  // It narrows the state type.
  // The .data property is available for Queued and Processing states
  console.info('Job already assigned. Details:', resultingState.data);
}
```

</details>

<details>
<summary>Just code</summary>

```typescript
import { is, type EventOf, type StateOf } from 'simply-stated';

const { event, state, transition } = workerMachine;

const stateIdle = state.Idle();
const stateListening = transition(stateIdle, event.started());

console.info(`Started listening at ${stateListening.data.toUTCString()}`);

type WorkerState = StateOf<typeof state>;
let currentState = stateListening as WorkerState;

type WorkerEvent = EventOf<typeof workerMachine.event>;
const processEvents = (eventsToProcess: WorkerEvent[]) => {
  const nextState = eventsToProcess.reduce(
    workerMachine.transition,
    currentState,
  );
  currentState = nextState;
  return nextState;
};

const eventJobAssigned = workerMachine.event.jobAssigned({
  id: '0',
  data: Buffer.from('data'),
});
const eventPicked = workerMachine.event.picked();

const resultingState = processEvents([eventJobAssigned, eventPicked]);

try {
  processEvents([eventJobAssigned]);
} catch {}

if (is(resultingState, state.Queued, state.Processing)) {
  console.info('Job already assigned. Details:', resultingState.data);
}
```

</details>

## Nesting machines

First, embed nested machine's state inside outer machine's `data`.

```typescript
const innerMachine = combineStates(/* ... */).createMachine(/* ... */);

defineState('OuterState').withData<{
  inner: StateOf<typeof innerMachine.state>;
}>(),
```

Next, define outer machine's event handler that runs
`innerMachine.transition()` or use the `forwardEvents` helper.

```typescript
Outer: {
  ...forwardEvents(innerMachine, state.Outer, data => data.inner),
  transitionInner: ({ inner }, event: EventOf<typeof innerMachine.event>) =>
    state.Outer({ inner: innerMachine.transition(inner, event) }),
}
```

The `forwardEvents` helper turns the inner machine's events into handlers on an outer
state; when it doesn't fit, drive the inner machine with `transition` by hand.

See the [nesting docs](simply-stated/src/nesting/README.md) ·
[examples](examples/nesting/README.md).

## Adapters

Describe your state, then plug it into your state manager with available
adapters. See examples in [examples/](examples/README.md).

See the [adapters docs](simply-stated/src/adapters/README.md).

- **Redux Toolkit** — single state & collection adapters (`simply-stated/redux-toolkit`)
  · [docs](simply-stated/src/adapters/redux-toolkit/README.md) · [examples](examples/redux-toolkit/README.md)
- **Zustand** — _(coming soon)_
- **Pinia** — _(coming soon)_

## License

[MIT](./LICENSE)

# Simply Stated

Strongly typed, declarative utility for state machine modeling.

It is **not** a state-management library — it is about **state description**.
Describe your states and transitions, then drive them with whatever state
manager you already use.

```bash
npm install simply-stated
```

## Quick look

First you describe the state.

```typescript
import { combineStates, defineState } from 'simply-stated';
import type { EventOf, StateOf } from 'simply-stated';

type Job = {
  id: string;
  data: Buffer;
};

const workerMachine = combineStates(
  defineState('Idle'),
  defineState('Listening').withData<Date>(),
  defineState('Queued', 'Processing').withData<Job>(),
  defineState('Failed').withData<{ reason: string }>(),
).createMachine(state => ({
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

Next, you process it with your state-management library of choice using
available [adapter](#adapters) or do it manually, like below.

```typescript
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

if (currentState.is(state.Queued, state.Processing)) {
  console.info('Job already consumed. Details:', currentState.data);
}
```

## Adapters

Plug a machine into your state manager:

- **Redux Toolkit** — `simply-stated/redux-toolkit` (single instance / collection
  adapters). See the
  [docs](https://github.com/szymonmaslowski/simply-stated/blob/main/simply-stated/src/adapters/redux-toolkit/README.md).
- **Zustand** — _(coming soon)_

## Documentation

Full API walkthrough:
[github.com/szymonmaslowski/simply-stated](https://github.com/szymonmaslowski/simply-stated#readme).

## License

[MIT](./LICENSE)

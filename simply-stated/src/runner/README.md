# Running a machine

`transition` is a reducer — it computes the next state and nothing else. The
runner is the missing half: it **holds** the current state and **runs your
effects** every time that state changes.

Use it when the machine drives work rather than a UI — an agent loop, a job
pipeline, a backend workflow. When the state belongs to a state manager instead,
reach for the [adapters](../adapters/README.md).

See available [runner examples](../../../examples/runner/README.md).

```typescript
import { createRunner } from 'simply-stated/runner';

const runner = createRunner(machine, {
  onComplete: (summary: string) => console.info(summary),
  effects: async ({ complete, currentState, dispatch }) => {
    if (currentState.name === 'Completed')
      return complete(currentState.data.summary);
    if (currentState.name !== 'Ready') return;

    dispatch(machine.event.started());
    dispatch(machine.event.finished(await doTheWork()));
  },
});

const { api, result } = runner.start(machine.state.Ready());

console.info(await result);
```

## `createRunner(machine, options)`

- `machine` — the machine to run.
- `options.effects` — the [effects processor](#the-effects-processor).
- `options.onComplete` — optional, see [completion](#completion).
- `options.scheduler` — optional, see [scheduling](#scheduling). Defaults to
  `queueMicrotask`.
- Returns `{ start }`.

A runner is a reusable recipe, not a single run. Call `start` as many times as
you like; each call is an independent run with its own state and its own abort
signal.

## `start(initialState)`

Sets the initial state, schedules its effects, and returns the
[run handle](#the-run-handle):

- `api` — always present.
- `result` — only when an `onComplete` was given, see
  [completion](#completion).

## The effects processor

A function receiving one context object:

- `currentState` — the state the machine is in right now.
- `dispatch(event)` — applies the event, replacing the current state.
- `isRunning()` — whether this run is still going.
- `abortSignal` — aborted when the run completes.
- `complete(result?)` — ends the run, see [completion](#completion).

It may be synchronous or asynchronous. It runs once per state change (plus once
for the state passed to `start`), so **branch on the state** rather than
keeping your own progress flags — the state is the flag.

```typescript
effects: async ({ currentState, dispatch, abortSignal }) => {
  if (!is(currentState, machine.state.Ready)) return;

  // The state moves out of `Ready` before the work is awaited, so a re-run
  // caused by another event in the meantime won't start it twice.
  dispatch(machine.event.started());

  const result = await doTheWork(currentState.data);
  if (abortSignal.aborted) return;

  dispatch(machine.event.finished(result));
};
```

`currentState` is a snapshot taken when the run _starts_, not when it was
scheduled — a coalesced run sees the state reached last. After you `dispatch`,
read the new state on the next run rather than from the same `currentState`
binding.

### A throw ends the run

Anything the processor throws — synchronously or as a rejected promise — ends
the run: the `abortSignal` is aborted, no further effects are processed, and
`result` **rejects** with the error. `onComplete` does not fire.

```typescript
const { api, result } = createRunner(machine, { effects }).start(initialState);

try {
  await result;
} catch (error) {
  // whatever the processor threw
}

api.isRunning(); // false
api.getCurrentState(); // the state the run failed on
```

**Handle `result`.** The runner does not silence the rejection: an unawaited
`result` surfaces as an unhandled rejection, which crashes Node by default. A
failure is never swallowed — the cost is that every run whose processor can
throw needs somewhere for that error to go.

That is a blunt end, though. A failure you expect is better described by the
machine than by an exception, so wrap the work and turn it into an event:

```typescript
effects: async ({ currentState, dispatch }) => {
  if (!is(currentState, machine.state.Ready)) return;

  dispatch(machine.event.started());
  try {
    dispatch(machine.event.finished(await doTheWork()));
  } catch (error) {
    dispatch(machine.event.failed(String(error)));
  }
};
```

## Completion

A run ends when the processor calls `complete`, or when it throws. `complete`
and `result` are always there; `onComplete` decides what they carry.

Without an `onComplete`, `complete` takes no argument and `result` resolves with
nothing once the run is over:

```typescript
const { result } = createRunner(machine, {
  effects: ({ complete, currentState }) => {
    if (is(currentState, machine.state.Completed)) complete();
  },
}).start(machine.state.Ready());

await result; // Promise<void>
```

Add an `onComplete` to declare what a run produces. Its parameter types both
`complete` and `result`, and it is called with the value `complete` was given:

```typescript
const { api, result } = createRunner(machine, {
  onComplete: (summary: string) => console.info('finished:', summary),
  effects: ({ complete, currentState }) => {
    if (is(currentState, machine.state.Completed))
      complete(currentState.data.summary);
  },
}).start(machine.state.Ready());

const summary = await result; // Promise<string>
```

A zero-parameter `onComplete` behaves exactly like leaving it out — a nullary
`complete` and `Promise<void>` — so use it when you want the notification but
the run produces no value.

`onComplete` takes at most one parameter; its return value is ignored, and it
does not fire when the run ends by throwing.

## The run handle

`start` returns `{ api, result? }`. The `api` is how the outside world talks to
a run:

- `dispatch(event)` — same as the processor's `dispatch`, callable from the
  outside (a UI handler, an incoming message).
- `getCurrentState()` — the state the machine is in. Still readable after the
  run has completed, where it gives the state the run finished on.
- `isRunning()` — whether the run is in progress.

## Lifecycle

`Idle` → `start` → `Running`, then either `complete` → `Completed` or a throw
→ `Failed`. Both ends are terminal: `dispatch` does nothing, no further effects
are processed, and the `abortSignal` is aborted.

Runs are independent. One runner can drive several at once, each with its own
state:

```typescript
const runner = createRunner(machine, { effects });

const first = runner.start(machine.state.Ready());
const second = runner.start(machine.state.Ready());

// Subscribe to both in the same tick. Awaiting one and then the other leaves
// the second rejection unhandled if it fails while the first is still running.
const [firstResult, secondResult] = await Promise.all([
  first.result,
  second.result,
]);
```

To carry on where a completed run left off, start another from the state it
reached:

```typescript
runner.start(first.api.getCurrentState());
```

A run's own lifecycle is itself a Simply Stated machine — `Idle`, `Running`,
`Completed`, `Failed` — with the abort controller and the pending-effects flag
nested in the `Running` state's data.

## Scheduling

A `dispatch` that changes the state schedules one processor run. Runs are
**coalesced**: many dispatches before the next run produce a single run, against
the state reached last. A dispatch that changes nothing — an event the current
state does not handle — schedules nothing.

Runs may overlap. An `await` inside the processor does not block the next run,
which is what lets a processor dispatch a "work started" event and keep awaiting
the work itself.

`scheduler` decides when a scheduled run happens. The default `queueMicrotask`
keeps effects off the dispatching call stack. Swap it to spread work across
frames, or to make a test deterministic:

```typescript
createRunner(machine, {
  effects,
  scheduler: runEffects => runEffects(),
});
```

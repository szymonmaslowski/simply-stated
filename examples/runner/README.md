# Runner examples

Holding the current state and running effects against it, instead of handing
the state to a state manager.

See [runner docs](../../simply-stated/src/runner/README.md).

## [pipeline.ts](./pipeline.ts) — a linear pipeline of asynchronous steps

`Researching` → `Planning` → `Implementing` → `Reviewing` → `Completed`, with
`Reviewing` able to send work back to `Implementing`. Every working state
carries a nested `executionMachine` (`Idle` / `Running`) at `data.execution`,
so "which step" and "has this step been kicked off" are two separate,
independently readable facts.

The processor branches on both:

```ts
if (currentState.name === 'Completed')
  return complete(currentState.data.context);
if (currentState.data.execution.name !== 'Idle') return;

dispatch(event.triggered());
const result = await runStep(currentState.name);
dispatch(event.reported({ success: true, result }));
```

`triggered` moves the nested execution to `Running` **before** the step is
awaited. That is what keeps the step from being started twice: the processor
re-runs on every state change, and every re-run finds the execution no longer
`Idle`.

The step outcome comes back as one `reported` event carrying `success`. Each
state decides for itself what a failure means — every step retries by returning
to itself with its context untouched, while a success moves the context on to
the next state:

```ts
reported: (data, { success, result }: Report) =>
  success
    ? state.Reviewing(makeInitialData(`${data.context} ${result}`))
    : state.Implementing(makeInitialData(data.context)),
```

`Reviewing` is the one that reaches `Completed`, and it is also the only state
that reads the step's text to decide where to go — sending the work back to
`Implementing` when the review asks for changes:

```ts
reported: (data, { success, result }: Report) => {
  if (!success) return state.Reviewing(makeInitialData(data.context));
  if (result.includes('Changes requested')) {
    return state.Implementing(makeInitialData(`${data.context} ${result}`));
  }
  return state.Completed({ context: `${data.context} ${result}` });
},
```

Re-ordering the steps, or making a failed review bounce back to `Planning`
instead, is a change to the transition tree only — the processor stays as it
is.

### Completing a run

`complete` and `result` are always available; the optional `onComplete` declares
what they carry. Here it types both the `complete` handed to the processor and
the `result` promise handed back by `start`:

```ts
const runner = createRunner(pipelineMachine, {
  onComplete: (result: string) => {
    console.info('Pipeline finished:', result);
  },
  effects: async ({ complete, currentState, dispatch, isRunning }) => { ... },
});
```

Each step re-checks `isRunning()` after its `await`, so a run that finished
while the work was in flight stops rather than dispatching into a completed
machine.

### Several runs at once

One runner is a recipe, not a single run — `start` returns an independent run
each time, and the example drives two side by side:

```ts
const weatherRun = runner.start(
  pipelineMachine.state.Researching(
    makeInitialData('What is the weather today?'),
  ),
);
const unicornRun = runner.start(
  pipelineMachine.state.Researching(makeInitialData('Am I rich yet?')),
);

const [rainingTodayResult, unicornResult] = await Promise.all([
  weatherRun.result,
  unicornRun.result,
]);
```

`Promise.all` matters here rather than awaiting one and then the other: a
`result` rejects the moment its run fails, and a handler attached a tick later
is too late — the rejection is already unhandled. `Promise.all` subscribes to
both in the same tick, `Promise.allSettled` too if you want the failures
side by side.

Each run has its own state and its own abort signal, so `weatherRun.api` steers
only the weather pipeline. The example uses that to redirect one run mid-flight
with the cross-state `startOverWithNewQuery` event, after reading how far it had
got:

```ts
const {
  data: { context: weatherUntilNow },
} = weatherRun.api.getCurrentState();
if (weatherRun.api.isRunning()) {
  weatherRun.api.dispatch(
    pipelineMachine.event.startOverWithNewQuery('Is it raining today?'),
  );
}
```

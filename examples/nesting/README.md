# Machines nesting examples

Storing an inner machine's state inside an outer machine's `data` and
controlling it with the outer machine's events.

The `forwardEvents` helper covers the common case; when it doesn't fit, call
`innerMachine.transition` by hand.

See [nesting docs](../../simply-stated/src/nesting/README.md).

## [door.ts](./door.ts) — uses `forwardEvents` to run a single inner machine

Simplest form: nest a whole machine in a single state, expose all its
events unchanged to be available in that state.

A door is `Open` / `Closed`; the `Closed` state carries a
nested `lockMachine` (`Locked` / `Unlocked`) at `data.lockState`.

```ts
Closed: {
  ...forwardEvents(lockMachine, state.Closed, data => data.lockState),
  opened: data => state.Open(data),
}
```

`forwardEvents` spreads the lock's `locked` / `unlocked` handlers onto `Closed`;
the door adds its own `opened` event. The lock only exists while closed — the outer
state gates the inner one.

## [player.ts](./player.ts) — runs two inner machines parallelly

A player (`Paused` / `Playing`) nests **two** independent `toggleMachine`s —
`fullScreen` and `muted`. Instead of spreading, it picks individual handlers off
the returned map and renames them to semantic outer events:

```ts
const mute = forwardEvents(toggleMachine, stateCreator, data => data.muted);
// ...
mute:   mute.on,
unmute: mute.off,
```

The selector picks the nested toggle (`muted` or `fullScreen`); the accessed
property (`on` / `off`) picks the inner machine event.
The `makeSharedEvents(stateCreator)` builds the four handlers once and both
states spread them, so mute / fullscreen work whether playing or paused.

## [search.ts](./search.ts) — runs inner machine parallelly with strict states mapping

In other examples nested machines could be in _any_ of their states while held
by the outer state. This example does the opposite: **each outer state pins the inner
machine to a specific subset of its states.**:

```ts
defineState('Parametrising').withData<{
  fetchingState: StateOf<typeof fetchMachine.state, 'Idle'>;
}>();
// ...
defineState('Loading').withData<{
  fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
}>();
// ...
defineState('ViewingResults').withData<{
  fetchingState: StateOf<typeof fetchMachine.state, 'Success'>;
}>();
```

`StateOf<..., 'Idle'>` is not the whole inner state — it's the inner state
_narrowed_ to a single name. So `Parametrising` may only hold an `Idle` fetch,
`Loading` may only hold a `Fetching` or `Failure` fetch, and `ViewingResults`
may only hold a `Success` fetch.

**Reason.** The two machines are not independent — the `search`'s phase _is_ the
`fetch`'s phase. "Viewing results with no fetch in flight" is an invalid state, so
the outer state forbids it at the type level.

**Consequence.** The two states now move together. You can't advance the `fetch`
without advancing the `search`, and you can't advance the search without having
`fetch` in an expected state — the compiler rejects
`state.ViewingResults({ fetchingState: idleFetchState })`.

In this setup impossible combinations does not exist. Downstream code that reads
`ViewingResults` _knows_ the `fetch` succeeded and its data is there. The type
is the guarantee.

Two events are forwarded; both stay inside the pinned `{ Fetching | Failure }`
subset:

```ts
searchFailed: forwardEvents(fetchMachine, state.Loading, d => d.fetchingState).rejected,
retry:        forwardEvents(fetchMachine, state.Loading, d => d.fetchingState).retry,
```

The pin is **compiler-enforced**. Forwarding `resolved` is rejected — it moves
`Fetching → Success`, outside the subset. Any `fetch` event no pinned state
handles is rejected too. See
[compile-time checks on forwarding](../../simply-stated/src/nesting/README.md#compile-time-checks-on-forwarding).

The other two events (`triggerSearch` and `searchSucceeded`) are manually wired,
as they have some more job to do - they pass the data from the outer state to
the inner state and guard the `fetch` machine transition and decide the next
outer state based on it.

Summarising:

- forwarded events are the ones that leave the outer state alone.
- those crafted manually transform the result or change the outer state.

## [workflow.ts](./workflow.ts) — fully manual, collection of nested machines

A workflow tracks **many** `jobMachine`s in a `Record<JobId, JobState>`.

`updateJob` picks a job by id, applies an inner event manually, rebuilds the
record, then branches the outer state on the aggregate result:

```ts
const nextJob = jobMachine.transition(jobs[id], event);
const nextJobs = { ...jobs, [nextJob.data.id]: nextJob };
const allJobsDone = Object.values(nextJobs).every(j => j.name === 'Done');
return allJobsDone
  ? state.Completed({ jobs: nextJobs })
  : state.Working({ jobs: nextJobs });
```

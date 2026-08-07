# Nesting machines

Compose machines by storing one machine's state inside another machine's `data`
and driving it with the outer machine's events.

See available [nesting examples](../../../examples/nesting/README.md).

## `forwardEvents` helper

`forwardEvents(innerMachine, outerStateCreator, selector)`

- Returns a map of handlers for all `innerMachine` events, keyed by those
  event names (`Record<EventName, EventHandler>`).
- Each handler runs the `innerMachine` transition and writes the resulting
  inner state back.
- Forwarded event payload types are inherited from the inner events.
- `outerStateCreator` is a creator of the state to which events are forwarded.
- `selector` points at the nested state inside outer state's `data`.

Spread the whole map into a state's handler map, or pick individual handlers
(`forwardEvents(...).on`) to wire one inner event to a differently-named outer
event.

```typescript
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

Forwarded events keep the outer state unchanged. If you want the event to also
modify the other data, make a [manual transition](#manual-transition) instead.

## Compile-time checks on forwarding

The `forwardEvents` validates forwarded events against the nested state type.
When an outer state defines its nested state as a subset
(`StateOf<typeof myMachine.state, 'A' | 'B'>`), then the
`forwardEvents` checks each forwarded event against that subset and raises a
type level error (see
[compile-time rejections](../../../API_REFERENCE.md#reserved-names--compile-time-rejections)).

Given

```typescript
defineState('Loading').withData<{
  // The subset of fetchMachine states
  fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
}>();
```

there are the following restrictions for forwarding events of the inner machine:

**Unexpected target state.** Events that transition the nested state out of the
defined subset.

```typescript
Loading: {
  // 'resolved' transitions from Fetching to Success - outside expected `Fetching | Failure`
  // UsageGuardError<"Forwarded event 'resolved' transitions to an unexpected inner state ('Success')">
  searchDone: forwardEvents(fetchMachine, state.Loading, d => d.fetchingState).resolved,
}
```

**Dead forward.** No state of the subset allows for the event. The forward is
a permanent no-op.

```typescript
Loading: {
  // 'refetch' is handled only by Success; neither Fetching nor Failure handles it
  // UsageGuardError<"Forwarded event 'refetch' is not handled by any inner state ('Fetching', 'Failure')">
  refetch: forwardEvents(fetchMachine, state.Loading, d => d.fetchingState).refetch,
}
```

Those cases occur only for subsets of nested state. When defining the full inner
state union, any forwarded event is valid.

## Manual transition

When simple `forwardEvents` doesn't fit your case, you can transition the nested
machine manually by running inner machine's `transition` function in the outer
handler, read the resulting inner machine state, and build whatever next outer
state you want — including transitioning to a _different_ outer state.

```typescript
Fetching: {
  // Transition the nested fetch machine, then branch the outer machine to a
  // different state built from the inner result.
  searchSucceeded: ({ fetchingState }, value: string) => {
    const nextFetchingState = fetchMachine.transition(
      fetchingState,
      fetchMachine.event.resolved(value),
    );

    return state.ViewingResults({
      result: JSON.parse(nextFetchingState.data.value),
      fetchingState: nextFetchingState,
    });
  },
},
```

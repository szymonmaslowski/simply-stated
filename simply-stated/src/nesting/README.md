# Nesting machines

Compose machines by storing one machine's state inside another machine's `data`
and driving it with the outer machine's events.

## `forwardEvents` helper

`forwardEvents(innerMachine, outerStateCreator, selector)` returns a handler for
every inner event, keyed by the inner event names. `selector` points at the
nested state inside outer's `data`; each handler reads it, runs the inner transition,
writes the result back, and re-creates the outer state (same state - self transition).
Handler payload types are inherited from the inner events.

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

Spread the whole map into a state's handler map, or pick individual handlers off
it (`forwardEvents(...).on`) to wire one inner event to a differently-named
outer event.

`forwardEvents` keeps the outer state name fixed and cannot read the inner
result, so it can't branch the outer state or transform inner data — for those,
use a [manual transition](#manual-transition).

## Compile-time checks on forwarding

When an outer state pins its inner state to a subset
(`StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>`), `forwardEvents`
checks every forwarded event against that subset and rejects two cases at compile
time with a branded `ApiError<Message>` (see
[compile-time rejections](../../../API_REFERENCE.md#reserved-names--compile-time-rejections)).

**Unexpected target state.** The event moves a pinned inner state _out_ of the
declared subset. Storing that result would break the outer state's own data type,
so it is rejected:

```typescript
defineState('Loading').withData<{
  fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
}>();
// ...
Loading: {
  // 'resolved' moves Fetching → Success, outside { Fetching | Failure }
  // ApiError<"Forwarded event 'resolved' transitions to an unexpected inner state ('Success')">
  searchDone: forwardEvents(fetchMachine, state.Loading, d => d.fetchingState).resolved,
}
```

**Dead forward.** No pinned state handles the event, so it would always be a
no-op — almost certainly a mistake, so it is rejected:

```typescript
Loading: {
  // 'refetch' is handled only by Success; neither Fetching nor Failure handles it
  // ApiError<"Forwarded event 'refetch' is not handled by any inner state ('Fetching', 'Failure')">
  refetch: forwardEvents(fetchMachine, state.Loading, d => d.fetchingState).refetch,
}
```

Both surface at the offending event when you pick a handler, or at the state when
you spread the whole map. An event that stays within the subset — moving between
pinned states or self-transitioning — is a normal handler. With the full inner
state union (no pinning) nothing escapes and every event is forwardable.

## Manual transition

When simple `forwardEvents` doesn't fit your case, you can advance the nested
machine manually by running inner machine's `transition` function in the outer
handler, read the resulting inner machine state, and build whatever next outer
state you want — including transitioning to a _different_ outer state.

```typescript
Fetching: {
  // Advance the nested fetch machine, then branch the outer machine to a
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

## Examples

See [examples/nesting](../../../examples/nesting/README.md) — whole-machine
nesting, two parallel inner machines, forwarding plus manual transitions, and a
collection of nested machines.

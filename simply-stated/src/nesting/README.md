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

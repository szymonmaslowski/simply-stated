# Redux Toolkit examples

Worked, runnable scenarios for the Redux Toolkit adapters. For the API and how
the adapters behave (the slice & collection adapters, plain/native storage, id
modes, `nestingPath`, …), see the adapter docs:
[`simply-stated/src/adapters/redux-toolkit`](../../simply-stated/src/adapters/redux-toolkit/README.md).

## Running

Examples import the **built** library, so build it once first:

```bash
pnpm install            # from the repo root
pnpm build              # emit simply-stated/dist

pnpm example:redux-toolkit:basic
pnpm example:redux-toolkit:complex
pnpm example:redux-toolkit:basic-collection
pnpm example:redux-toolkit:complex-collection
```

The machines used (`fetchMachine`, `toggleMachine`, `jobMachine`) are defined in
[`../example-machines.ts`](../example-machines.ts).

## The examples

### `basic.ts` — one machine, one instance

The simplest case. A single `fetchMachine` slice, no nesting.

- Each event (`fetch`, `resolved`, `retry`, `refetch`, `rejected`) is an action.
- The built-in `selectNativeState` selector returns the current native state.

### `complex.ts` — composing several slices into one

Two machines plus extra plain state, merged into a single `complex` slice.

- `fetchMachine` is mounted at `machines.fetch`, `toggleMachine` at
  `machines.toggle` (via `nestingPath`), and a plain `counter` lives alongside.
- Reducers are merged by spreading each adapter's `reducers` plus a hand-written
  `countUp`. **Assumption:** action/selector names across the merged adapters
  must not collide — `omit` is used to drop/rename the shared `selectNativeState`
  before re-exposing it as `selectFetchState` / `selectToggleState`.
- A custom `selectError` selector reads the (native) fetch state.

### `basic-collection.ts` — a collection of one machine type

Many `fetchMachine` instances keyed by id, via the collection adapter.

- **Explicit-id mode** (no `selectIdFromData`): the caller supplies the id, and
  it is stored as a separate `entityId` property on the entity.
- Default actions: per-event actions take `{ entityId }` (or
  `{ entityId, payload }`); lifecycle `addEntity({ entityId, state })` and
  `removeEntity({ entityId })`.
- Five default selectors, all patched to native: `selectIds`, `selectTotal`,
  `selectAllNative`, `selectNativeEntities` (id→native map), `selectNativeById`.
- The bare RTK `entityAdapter` is also returned for manual use.

### `complex-collection.ts` — several collections merged

A `complex-collection` slice combining a fetch collection, a job collection, and
a plain (non-machine) RTK counter adapter.

- **Data-id mode** for jobs: `selectIdFromData: data => data.id` derives the id
  from the state's `data`. **Assumption:** every state of that machine must carry
  the id in its data. In return, no redundant `entityId` property is stored.
- `sortComparer` orders job entities by a native state ranking.
- **Assumption:** merging collections means default reducer names
  (`addEntity` / `removeEntity`) clash — they are `omit`-ted and re-exposed under
  unique names (`addFetchEntity` / `removeFetchEntity`, `addJobEntity` /
  `removeJobEntity`). `addFetchEntity` also shows manual integration via
  `entityAdapter.addOne` + `toPlainState`.
- Selectors are hand-picked (the adapter exposes the full default set) and mixed
  with selectors over the plain counter adapter.

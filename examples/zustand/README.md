# Zustand examples

The examples below use a few example machines (`fetchMachine`, `toggleMachine`,
`jobMachine`) defined in [../example-machines.ts](../example-machines.ts).

## Examples

### `toStore(machine, options)` — single machine state

- [basic.ts](./basic.ts) — **one machine, one instance and one store**.

  The simplest case, a single `fetchMachine` machine mapped to a store. The
  initializer is passed straight to `create`, which infers the whole store shape.
  - Machine state becomes the store state, under the `state` key,
  - Events mapped 1:1 to actions at the store root,
  - The `initialState` specified via the required option.
  - There are no built-in selectors — a selector is a plain function over the
    store state.

- [complex.ts](./complex.ts) — **composing several machines into one store**.

  Two machines plus extra state, merged into a single store.
  - Each machine specifies its "mounting point" via the `statePath` property
    (`machines.fetch` and `machines.toggle`).
  - Both machines use `adjustActions` to place and rename their actions.
    Placing the state stays the adapter's job, so the actions can never lose
    track of it.
  - Both slices mount states under `machines`, and `combineSlices` merges
    them deeply, and rejects two slices claiming the same slot.
  - Custom actions (e.g. `countUp`) are built from the raw `set`, typed against
    the whole store.

  One piece of manual wiring remains: passing the combined store shape to
  `create<AppStore>(...)`, as we need to describe the extra store part.
  No machine types are written by hand — the machine part is read off
  the combined initializer with `ReturnType`.

### `toCollectionStore(machine, options?)` — a collection of machine states

- [basic-collection.ts](./basic-collection.ts) — **a collection of one machine states**.
  - The collection is a plain id→state map stored under `collection`.
  - This case needs to distinguish the specific fetch state targeted via a
    action call. Therefore, every action takes the entity id as its first
    argument (the explicit id mode).
  - Two builtin "lifecycle" actions are generated: `addEntity` and
    `removeEntity`.

- [complex-collection.ts](./complex-collection.ts) — **several collections in one store**

  Similarly to the [complex.ts](./complex.ts) example, we are merging a few
  machine state collections into a single store.
  - Specifying "mounting points" via the `collectionPath` property
    (`machines.fetches.collection` and `machines.jobs.collection`).
  - `adjustActions` places each collection's actions next to the collection
    itself - one nesting key (`fetches` or `jobs`) holds the state and actions.
  - `adjustActions` also renames the lifecycle actions (`addFetchEntity`,
    `addJobEntity`), which two collections in one store would otherwise clash
    on as they are all defined at the common `machines` branch.
  - The job case provides the `selectIdFromData` option that points out the
    entity id from the state's data. With it, `addJobEntity` takes the state
    alone — no redundant entity id argument.
  - Both collections mount under `machines`, so `combineSlices` merges the two
    slices deeply.
  - Custom actions (e.g. `removeAllJobs`, `countUp`) are built from the raw
    `set`, typed against the whole store. `removeAllJobs` shows what that costs
    below the root: `set` shallow-merges there only, so every level above the
    collection has to be re-spread by hand.

### Manual integration (no adapter)

- [manual.ts](./manual.ts) — **wiring machines into a store by hand**.

  A machine is just a reducer (`transition(state, event) => state`), so the
  adapters are a convenience, not a requirement. The state lives under a key
  (`state`, `toggle`, `jobs`) rather than at the store root: Zustand's `set`
  shallow-merges, so replacing the whole state object at a key drops stale `data`
  and keeps the sibling actions intact. Shows three shapes:
  - **one action per event** (single instance) — each event is its own action,
    like `toStore` generates.
  - **a single `transition` action whose payload is the event** (single
    instance) — tiny surface; the caller builds the event.
  - **a manual collection** keyed by id in a plain record, driven by a
    per-entity `transition(id, event)` action.

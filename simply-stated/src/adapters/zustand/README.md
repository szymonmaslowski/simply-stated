# Zustand adapters

Drive [Simply Stated](../../../../README.md) machines from Zustand.

There are two adapters available, each converting a state machine to a Zustand
**store initializer** you pass into `create`.

```typescript
import {
  toStore,
  toCollectionStore,
  combineSlices,
} from 'simply-stated/zustand';
```

- **single state adapter** — `toStore(machine, options)` adapts one machine
  **instance** to a store slice. Returns an initializer function which by
  default, shapes the store as `{ state, ...machineActions }`.

  ```typescript
  const useStore = create(
    toStore(myMachine, { initialState: myMachine.state.SomeState() }),
  );
  ```

- **Collection adapter** — `toCollectionStore(machine, options?)` adapts a
  **collection** of machine instances keyed by id (a plain `Record<Id, State>`).
  Returns an initializer function which by default, shapes the store as
  `{ collection, addEntity, removeEntity ...machineActions }`..

  ```typescript
  const useStore = create(toCollectionStore(myMachine));
  ```

- **`combineSlices(...initializers)`** — deeply merges several of these
  initializers into one, removing the burden of hand-wiring.

## See them in action

[examples/zustand](../../../../examples/zustand/README.md).

## Fast-forward

- [Adapters API](#adapters-api)
- [Composing adapters](#composing-adapters-combineslices)
- [Extending the store](#extending-the-store)

## Adapters API

### Both adapters

- **Stored machine state.**
  - By default, stored on the root level beside actions.
  - Default name is either `state` or `collection` (depending on the adapter).
  - `statePath` / `collectionPath` adjust the mounting path of the machine's
    state (or collection), allowing for renaming and enable nesting.
    (`statePath: 'machines.fetch.state'`).

- **Events become store actions.**
  - Every machine event is turned into an action on the store.
  - By default, each of them is placed at the root beside state.
  - Each action runs the `machine.transition(state, event)` and stores the
    next state.
  - Actions read and write against the `statePath` / `collectionPath`.

- **`adjustActions` option**
  - Allows to rename or adjust placement of the generated actions.
  - Shapes **actions only**. Placing the state is a job of the `statePath`
    / `collectionPath` option.
  - The returned actions are merged with the placed state, so they may sit in
    the same branch.

### Single instance adapter (`toStore`) specifics

- **`initialState` option**

  A required option.

- **`adjustActions` option**

  Receives the machine events generated actions as property of the first
  parameter.

  ```typescript
  toStore(myMachine, {
    initialState: myMachine.state.Idle(),
    statePath: 'fetchState',
    adjustActions: ({ machineActions }) => ({ fetchActions: machineActions }),
  });
  // -> { fetchState: <Idle state>, fetchActions: { ... } }
  ```

### Collection adapter (`toCollectionStore`) specifics

**Event actions**

- They target a specific state entity in the collection
- Each event action takes the target `entityId` as first param:
  `started(entityId)`.
- If the machine event has a payload, the action takes it as second param:
  `progressed(entityId, payload)`.
- An unknown id is a no-op.

**Lifecycle actions.**

Apart from event generated actions the collection adapter adds two lifecycle
actions for managing the collection items.

- `addEntity` — adds a state entity to the collection.
- `removeEntity` — drops it.

**Id modes.**

- **Explicit** (default) — id specified by hand when adding new entity:
  `addEntity(entityId, state)`.
- **From data** — In case all the machine's states carry an identifier in
  a data, you can point it out with the `selectIdFromData` option.
  this way `addEntity` takes only the state: `addEntity(state)`.

```typescript
const useJobsStore = create(
  toCollectionStore(jobMachine, { selectIdFromData: data => data.id }),
);

const { addEntity, started } = useJobsStore.getState();
addEntity(jobMachine.state.Queued({ id: '10', percentage: 0 }));
started('10');
```

**`adjustActions` option**

Receives the events generated actions as property of the first parameter.
Receives two kind of actions as the first parameter:

- event generated actions (`machineActions`),
- the two collection management actions (`lifecycleActions`).

```typescript
toCollectionStore(jobMachine, {
  adjustActions: ({ machineActions, lifecycleActions }) => ({
    ...machineActions,
    addJob: lifecycleActions.addEntity,
    removeJob: lifecycleActions.removeEntity,
  }),
});
// -> { start, progress, ..., addJob, removeJob }
```

## Composing adapters (`combineSlices`)

Each adapter returns a Zustand store initializer. The `combineSlices` merges
several of them into one:

```typescript
const machineSlices = combineSlices(
  toStore(fetchMachine, { initialState, statePath: 'machines.fetch' }),
  toCollectionStore(jobMachine, { collectionPath: 'machines.jobs' }),
);
```

The `combineSlices` streamlines merging two adapters into a single store by
performing a **deep** merge of constructed store parts. It keeps track of
state/collection paths and their actions.

It guards the proper usage with the `UsageGuardError`. It Reports two slices
claiming the same slot. That covers a shared `statePath` / `collectionPath`,
and all actions.

## Extending the store

When building the Zustand store by hand we usually define
the store type and supply it as type param (`create<AppStore>()`).

Adapters on the other hand derive the store type from the provided machine
and adjustments made using options (`adjustActions`, or
`statePath`/`collectionPath`).

In order to extend the store produced by adapters you can grab its type
using the TypeScript's built-in `ReturnType` utility and
extend it with your stuff.

```typescript
const jobsCollectionSlice = toCollectionStore(jobMachine);

type AppStore = ReturnType<typeof jobsCollectionSlice> & {
  counter: { count: number };
  countUp: () => void;
};

const useStore = create<AppStore>((set, get, store) => ({
  ...jobsCollectionSlice(set, get, store),
  counter: { count: 0 },
  countUp: () => set(s => ({ counter: { count: s.counter.count + 1 } })),
}));
```

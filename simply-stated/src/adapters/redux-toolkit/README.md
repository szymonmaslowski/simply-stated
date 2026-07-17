# Redux Toolkit adapters

Drive [Simply Stated](../../../../README.md) machines from Redux Toolkit.

There are two adapters available, each converting a state machine to options
you pass into the RTK's `createSlice`.

```typescript
import {
  toSliceOptions,
  toCollectionSliceOptions,
} from 'simply-stated/redux-toolkit';
```

- **single state adapter** — `toSliceOptions(machine, options)` adapts one
  machine **instance** to a slice. Returns
  `{ initialState, reducers, selectors }`.

  ```typescript
  createSlice({
    name: 'single-instance',
    ...toSliceOptions(myMachine, {
      initialState: myMachine.state.SomeState(),
    }),
  });
  ```

- **Collection adapter** — `toCollectionSliceOptions(machine, options)`
  adapts a **collection** of machine instances keyed by id, backed by RTK's
  `createEntityAdapter`. Returns
  `{ entityAdapter, initialState, reducers, selectors }`.
  ```typescript
  createSlice({
    name: 'collection',
    ...toCollectionSliceOptions(myMachine),
  });
  ```

## See them in action

[examples/redux-toolkit](../../../../examples/redux-toolkit/README.md).

## How they work

### Both adapters:

- **State is the stored value.**
  Machine state is a serialisable object, so it is stored as-is.

- **Events become actions.**
  - Every machine event is turned into a slice action.
  - Each reducer delegates to `machine.transition(state, event)` and stores the
    next state.

- **Selectors**
  - Expose your custom selectors via the optional `selectors` option.
  - Each custom selector receives the state as its first argument, plus an
    extra arguments representing the selector parameter - same as the RTK do.
  - Selectors are rebound to the slice state, so they keep working when the
    machine is mounted under a `nestingPath`.

- **`nestingPath` option enables composition.**
  - It mounts a machine's state at a given path inside the slice state
  - Reducers/selectors work against the nested state - the state parameter
    is unnested (you don't have to access it via the nesting path).

### Single instance adapter (`toSliceOptions`) specifics

- **Selectors**

  No selectors are provided by default. Define one by reading the state
  (machine state) and define optional parameters:

  ```typescript
  toSliceOptions(myMachine, {
    initialState: myMachine.state.SomeState(),
    selectors: {
      selectState: state => state,
      selectError: (state, fallback: any) =>
        is(state, myMachine.state.Failure) ? state.data : fallback,
    },
  });
  ```

### Collection adapter (`toCollectionSliceOptions`) specifics

- **RTK's entity adapter**

  The `toCollectionSliceOptions` adapter operates on the RTK's entity adapter
  which manages the machine states.

- **Lifecycle reducers**

  Two actions for adding/removing state entities are provided out of the box
  - `addEntity(entity)` — the entity being the machine state (with an
    `entityId` appended in the explicit id mode: `{ entityId, ...state }`)
  - `removeEntity({ entityId: Id })`

- **Reducers factory**

  Provide the `reducers` factory if you want to easily rename the default
  lifecycle reducers or add some extra ones. The factory is receiving
  - default lifecycle reducers
  - entity adapter's CRUD functions (addOne, addMany, setOne, setMany...).

  Whatever it returns replaces the two default lifecycle reducers (event
  reducers always stay). Returned reducers get the RTK `EntityState` — nesting
  is handled for you — and may either mutate it or return a new one

  ```typescript
  toCollectionSliceOptions(myMachine, {
    reducers: (lifecycleReducers, entityAdapterCRUD) => ({
      addMyEntity: lifecycleReducers.addEntity,
      clear: entitiesState => entityAdapterCRUD.removeAll(entitiesState),
    }),
  });
  ```

  _Machine event names are reserved, so you cannot use them as custom
  reducer names._

- **Id modes.**
  - By default, each state entity gets an `entityId` appended.
  - In case all the machine's states carry an identifier in a data, you can point
    it out with the `selectIdFromData` option.
  - Providing `selectIdFromData` removes `entityId` from the entity state and
    the `addEntity` action (`addEntity(state)`);

- **Actions patched to target specific state entities.**
  - Each event-derived action specify an `entityId` in the payload to target
    specific state entity.
  - If particular machine event has a payload, the derived action will have
    that payload nested: `{ entityId, payload }`.

- **Selectors**

  No selectors are provided by default. Define your own via the `selectors`
  option, which accepts either shape:
  - a **plain object** — each selector receives the RTK `EntityState`:

    ```typescript
    toCollectionSliceOptions(myMachine, {
      selectors: {
        countAll: entitiesState => entitiesState.ids.length,
      },
    });
    ```

  - a **function** — receives the entity adapter's own selectors
    (`selectAll`, `selectById`, `selectIds`, `selectTotal`, `selectEntities`) so
    you can build on them:

    ```typescript
    toCollectionSliceOptions(myMachine, {
      selectors: entitySelectors => ({
        selectAll: entitySelectors.selectAll,
        selectById: entitySelectors.selectById,
      }),
    });
    ```

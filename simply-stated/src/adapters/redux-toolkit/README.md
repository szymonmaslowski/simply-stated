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

## How they work

### Both adapters:

- **State is stored plain, exposed native.**
  (See [Native vs Plain state](../../../../README.md#native-vs-plain-state)).
  - Reducers store only the plain, serialisable state.
  - Selectors expose the native one.

- **Events become actions.**
  - Every machine event is turned into a slice action.
  - Each reducer delegates to `machine.transition(state, event)` and stores the
    next state.

- **Selectors**
  - Built-in selectors return the native state.
  - Possibility to define custom selectors via the `selectors` option.
  - Custom selector builders receive the native state as the first argument.
  - Built-in selector names (see below) are reserved - custom selectors can't
    use those names

- **`nestingPath` option enables composition.**
  - It mounts a machine's state at a given path inside the slice state
  - Reducers/selectors work against the nested state.

### Single instance adapter (`toSliceOptions`) specifics

- **Built-in selector**

  There is one: `selectNativeState`.

### Collection adapter (`toCollectionSliceOptions`) specifics

- **RTK's entity adapter**

  The `toCollectionSliceOptions` adapter operates on the RTK's entity adapter
  which manages the machine states.

- **Lifecycle reducers**

  Two actions for adding/removing state entities are provided out of the box
  - `addEntity({ entityId: Id, state: NativeState })`
  - `removeEntity({ entityId: Id })`

- **Id modes.**
  - By default, each state entity gets an `entityId` appended.
  - In case all the machine's states carry an identifier in a data, you can point
    it out with the `selectIdFromData` option.
  - Providing `selectIdFromData` removes `entityId` from the entity state and
    the `addEntity` action (`addEntity({ state: NativeState })`);

- **Actions patched to target specific state entities.**
  - Each event-derived action specify an `entityId` in the payload to target
    specific state entity.
  - If particular machine event has a payload, the derived action will have
    that payload nested: `{ entityId, payload }`.

- **Built-in selector**

  There are a bunch of default RTK's entity adapter selectors provided out
  of the box. Those returning state are patched to return the **native** one.
  - `selectIds`
  - `selectTotalCount`
  - `selectAllNative`
  - `selectNativeEntitiesMap`
  - `selectNativeById`

## See them in action

[examples/redux-toolkit](../../../../examples/redux-toolkit/README.md).

# Redux Toolkit adapters

Drive [Simply Stated](../../../../README.md) machines from Redux Toolkit. Two
adapters are published at `simply-stated/redux-toolkit`, each adapting a machine
to options you spread into RTK's `createSlice`:

- **Slice adapter** — `toSliceOptions(machine, options)` adapts one
  machine **instance** to a slice. Returns
  `{ initialState, reducers, selectors }`.
- **Collection adapter** — `toCollectionSliceOptions(machine, options)`
  adapts a **collection** of machine instances keyed by id, backed by RTK's
  `createEntityAdapter`. Returns
  `{ entityAdapter, initialState, reducers, selectors }`.

## How they work

Both adapters:

- **Events become actions.** Every machine event is turned into a slice action.
  Each reducer delegates to `machine.transition(state, event)` and stores the
  next state. You never write transition logic by hand.
- **State is stored plain, exposed native.** A Simply Stated _native_ state
  carries an `is()` type-guard method, so it is **not** serializable. The
  adapters store only the plain, serializable `{ name, data }` (`toPlainState`)
  and the
  generated selectors rehydrate it back to native (`toNativeState`, re-attaching
  `is()`). So reducers/`store.getState()` see plain state; selectors return
  native state you can call `.is(...)` on. No need to disable RTK's
  `serializableCheck`.
- **User selectors receive native state.** Anything you pass under `selectors`
  is wrapped so its first argument is the native projection (a single native
  state for the slice adapter; a `Record<id, nativeState>` map for the
  collection adapter).
- **Invalid transitions are a no-op.** Dispatching an event with no handler for
  the current state leaves the state unchanged (the machine's default
  `onInvalidTransition` logs it).
- **`nestingPath` enables composition.** It mounts a machine's state at a path
  inside the slice state, so several machine slices (and other plain state) can
  be merged into one `createSlice`. Reducers/selectors are typed against that
  path.

### Collection specifics

- **Id modes.** By default (explicit mode) the caller supplies the id, stored as
  a separate `entityId` property. Pass `selectIdFromData: data => data.id` to use
  **data mode** — the id is derived from each state's `data`, so no redundant
  `entityId` property is stored. (Data mode requires every state of the machine
  to carry the id in its `data`.)
- **Actions.** Per-event actions take `{ entityId }` (or
  `{ entityId, payload }`); lifecycle `addEntity` (`{ entityId, state }` in
  explicit mode, `{ state }` in data mode) and `removeEntity({ entityId })`.
- **Selectors.** Five defaults, all patched to native: `selectIds`,
  `selectTotal`, `selectAllNative`, `selectNativeEntities` (id→native map),
  `selectNativeById`. These names are reserved — a user selector cannot reuse
  them. The bare RTK `entityAdapter` is also returned for manual use.

## Examples

Worked, runnable scenarios live in
[`examples/redux-toolkit`](../../../../examples/redux-toolkit/README.md).

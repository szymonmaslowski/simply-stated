# Redux Toolkit examples

Below examples use a few example machines (`fetchMachine`, `toggleMachine`, `jobMachine`)
defined in [../example-machines.ts](../example-machines.ts).

## Examples

### `toSliceOptions(machine, options)` - single machine state

- [basic.ts](./basic.ts) - **one machine, one instance and one slice**.

  The simplest case, a single `fetchMachine` machine mapped to a slice.
  - Machine state becomes the slice state
  - Each machine event becomes redux action.
  - A built-in `selectNativeState` selector returns the current **native** state.
  - A required `initialState` option.

- [complex.ts](./complex.ts) — **composing several machines into one slice**.

  Two machines plus extra plain state, merged into a single `complex` slice.
  - Each machine specifies its "mounting point" via the `nestingPath` property.
  - The fetch machine case defines a custom `selectError` selector that reads
    the (native) fetch state.

  Some level of manual wiring is required here: assembling all slice state parts,
  renaming selectors to avoid naming clash (default `selectNativeState` selector
  created for both machines).

### `toCollectionSliceOptions(machine)` - a collection of machine states.

- [basic-collection.ts](./basic-collection.ts) - **a collection of one machine states**.

  A collection of `fetchMachine` states. This one requires to distinguish the
  state targeted via an action/selector.
  - Each action derived from a machine event, carries a payload with an `entityId`
    property for identification purposes.
  - Those that carried a payload define a nested payload property:
    `{ entityId: EntityId, payload: EventPayload }`.
  - A set of default lifecycle actions also carry the `entityId` property
    (`addEntity({ entityId, state })` and `removeEntity({ entityId })`)
  - Five default entity adapter selectors, all patched to expose the **native** state
    (`selectIds`, `selectTotal`, `selectAllNative`, `selectNativeEntities` and
    `selectNativeById`).

- [complex-collection.ts](./complex-collection.ts) - **several collections in one slice**

  Similarly to the [complex.ts](./complex.ts) example, we are merging a few
  machine state collections into a single slice.
  - Specifying "mounting points" via the `nestingPath` property.
  - The job case provides the `selectIdFromData` option that point out the
    entity id from the state's data. With it, no redundant `entityId` property is stored.
  - The `sortComparer` option (the same as RTK's entity adapter one) orders job
    entities by a **native** state ranking.

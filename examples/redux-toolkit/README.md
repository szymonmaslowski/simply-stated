# Redux Toolkit examples

Below examples use a few example machines (`fetchMachine`, `toggleMachine`, `jobMachine`)
defined in [../example-machines.ts](../example-machines.ts).

## Examples

### `toSliceOptions(machine, options)` - single machine state

- [basic.ts](./basic.ts) - **one machine, one instance and one slice**.

  The simplest case, a single `fetchMachine` machine mapped to a slice.
  - Machine state becomes the slice state
  - Events mapped 1:1 to actions,
  - The `initialState` specified via the required option.

- [complex.ts](./complex.ts) — **composing several machines into one slice**.

  Two machines plus extra state, merged into a single `complex` slice.
  - Each machine specifies its "mounting point" via the `nestingPath` property.
  - Each machine defines its own custom selectors (e.g. `selectFetchState`,
    `selectError`) that receive the machine state as argument.

  Some level of manual wiring is required here:
  - assembling all slice state parts
  - merging each machine's selectors into the combined slice.

### `toCollectionSliceOptions(machine)` - a collection of machine states.

- [basic-collection.ts](./basic-collection.ts) - **a collection of one machine states**.

  This one needs to distinguish the specific fetch state targeted via an
  action/selector. Therefore, every action carries a payload with an `entityId`
  property.

- [complex-collection.ts](./complex-collection.ts) - **several collections in one slice**

  Similarly to the [complex.ts](./complex.ts) example, we are merging a few
  machine state collections into a single slice.
  - Specifying "mounting points" via the `nestingPath` property.
  - The job case provides the `selectIdFromData` option that point out the
    entity id from the state's data. With it, no redundant `entityId` property is stored.
  - The `sortComparer` option (the same as RTK's entity adapter one) orders job
    entities by a **native** state ranking.

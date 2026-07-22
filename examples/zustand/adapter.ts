/* eslint-disable @typescript-eslint/no-unused-vars */
import { create } from 'zustand';
import { toCollectionStore, toStore } from 'simply-stated/zustand';
import { fetchMachine, jobMachine, toggleMachine } from '../example-machines';
import { is, type StateOf } from 'simply-stated';

// Adapter-driven equivalents of examples/zustand/manual.ts. Each `toStore` /
// `toCollectionStore` call generates the same slice the manual file hand-writes,
// so the boilerplate collapses to the machine plus a few options.

// 1. Minimal single instance — pass the initializer straight to `create`. The
// state lives under `state` and every event becomes a method at the root.
const useFetchStore = create(
  toStore(fetchMachine, { initialState: fetchMachine.state.Idle() }),
);

useFetchStore.getState().fetch({ query: 'books' });
useFetchStore.getState().resolved('server-payload');
const fetched = useFetchStore.getState().state;
if (is(fetched, fetchMachine.state.Success)) {
  const value: string = fetched.data.value;
}

// 2. Minimal collection — a plain id->state map under `collection`, with
// addEntity / removeEntity and one method per event. `selectIdFromData` derives
// the key from each state's data (data mode).
const useJobsStore = create(
  toCollectionStore(jobMachine, { selectIdFromData: data => data.id }),
);

useJobsStore
  .getState()
  .addEntity(jobMachine.state.Queued({ id: 'a', percentage: 0 }));
useJobsStore.getState().started('a');
useJobsStore.getState().progressed('a', 50);

// Explicit id mode (no selectIdFromData) — addEntity takes the id and the state.
const useToggles = create(toCollectionStore(toggleMachine));
useToggles.getState().addEntity('main', toggleMachine.state.On());
useToggles.getState().off('main');
useToggles.getState().removeEntity('main');

// 3. Combining several machines into one store. `adjust` reshapes each slice and
// `nestingPath` says where its state lives; custom methods are built from the
// raw `set` / `get`. Provide the combined store type to `create<T>()` — zustand
// cannot infer a shape that refers to itself.
type FetchState = StateOf<typeof fetchMachine.state>;

type AppStore = {
  fetch: FetchState;
  fetchActions: {
    fetch: (payload: { query: string }) => void;
    resolved: (payload: string) => void;
    rejected: (payload: string) => void;
    refetch: () => void;
    retry: () => void;
  };
  forceFetch: (next: FetchState) => void;
  jobs: Partial<Record<string, StateOf<typeof jobMachine.state>>>;
  started: (entityId: string) => void;
  progressed: (entityId: string, payload: number) => void;
  finished: (entityId: string) => void;
  addJob: (state: StateOf<typeof jobMachine.state>) => void;
  removeJob: (entityId: string) => void;
  resetJobs: () => void;
};

const useAppStore = create<AppStore>()((...stateCreatorParams) => ({
  ...toStore(fetchMachine, {
    initialState: fetchMachine.state.Idle(),
    nestingPath: 'fetch',
    adjust: ({ state, eventActions, set }) => ({
      fetch: state,
      fetchActions: eventActions,
      forceFetch: (next: FetchState) => set({ fetch: next }),
    }),
  })(...stateCreatorParams),
  ...toCollectionStore(jobMachine, {
    nestingPath: 'jobs',
    selectIdFromData: data => data.id,
    adjust: ({ collection, eventActions, lifecycleActions, set }) => ({
      jobs: collection,
      ...eventActions,
      addJob: lifecycleActions.addEntity,
      removeJob: lifecycleActions.removeEntity,
      resetJobs: () => set({ jobs: {} }),
    }),
  })(...stateCreatorParams),
}));

useAppStore.getState().fetchActions.fetch({ query: 'books' });
useAppStore.getState().forceFetch(fetchMachine.state.Idle());
useAppStore
  .getState()
  .addJob(jobMachine.state.Queued({ id: 'x', percentage: 0 }));
useAppStore.getState().started('x');

import { createStore } from 'zustand/vanilla';
import { fetchMachine, jobMachine, toggleMachine } from '../example-machines';
import { is, type EventOf, type StateOf } from 'simply-stated';

// Manual integration of simply-stated with Zustand — no adapter. Each pattern
// below is the hand-written equivalent of what a `simply-stated/zustand` adapter
// would generate, so the boilerplate here is the yardstick for whether an
// adapter earns its keep.
//
// The machine state lives under a key (`state`, `toggle`, `jobs`) rather than at
// the store root: Zustand's `set` shallow-merges, so replacing the whole state
// object at a key is what drops stale `data` when moving to a no-data state, and
// it keeps the sibling action methods intact.

// 1. Single instance, one method per event — mirrors `toStoreInitializer`.
type FetchState = StateOf<typeof fetchMachine.state>;

const fetchStore = createStore<{
  state: FetchState;
  fetch: (query: string) => void;
  resolved: (value: string) => void;
  rejected: (error: string) => void;
  refetch: () => void;
  retry: () => void;
}>(set => {
  const drive = (event: EventOf<typeof fetchMachine.event>) =>
    set(store => ({ state: fetchMachine.transition(store.state, event) }));
  return {
    state: fetchMachine.state.Idle(),
    fetch: query => drive(fetchMachine.event.fetch({ query })),
    resolved: value => drive(fetchMachine.event.resolved(value)),
    rejected: error => drive(fetchMachine.event.rejected(error)),
    refetch: () => drive(fetchMachine.event.refetch()),
    retry: () => drive(fetchMachine.event.retry()),
  };
});

fetchStore.getState().fetch('books');
fetchStore.getState().resolved('payload');
const _fetched = fetchStore.getState().state;
if (is(_fetched, fetchMachine.state.Success)) {
  const _value: string = _fetched.data.value;
}

// 2. Single instance, one `transition` method — payload IS the machine event.
const _toggleStore = createStore<{
  toggle: StateOf<typeof toggleMachine.state>;
  transition: (event: EventOf<typeof toggleMachine.event>) => void;
}>(set => ({
  toggle: toggleMachine.state.On(),
  transition: event =>
    set(store => ({ toggle: toggleMachine.transition(store.toggle, event) })),
}));

// 3. Collection — a plain id->state map, mirroring `toCollectionSliceOptions`
// (no entity adapter). Selectors are plain functions over the store state.
type JobState = StateOf<typeof jobMachine.state>;
type JobId = JobState['data']['id'];

const jobsStore = createStore<{
  jobs: Record<string, JobState>;
  add: (job: JobState) => void;
  remove: (id: JobId) => void;
  transition: (id: JobId, event: EventOf<typeof jobMachine.event>) => void;
}>(set => ({
  jobs: {},
  add: job => set(store => ({ jobs: { ...store.jobs, [job.data.id]: job } })),
  remove: id =>
    set(store => {
      const { [id]: _removed, ...rest } = store.jobs;
      return { jobs: rest };
    }),
  transition: (id, event) =>
    set(store => {
      const current = store.jobs[id];
      if (!current) return store;
      return {
        jobs: { ...store.jobs, [id]: jobMachine.transition(current, event) },
      };
    }),
}));

const _selectAllJobs = (store: { jobs: Record<string, JobState> }) =>
  Object.values(store.jobs);
const _selectJobById = (store: { jobs: Record<string, JobState> }, id: JobId) =>
  store.jobs[id];

jobsStore.getState().add(jobMachine.state.Queued({ id: 'a', percentage: 0 }));
jobsStore.getState().transition('a', jobMachine.event.started());

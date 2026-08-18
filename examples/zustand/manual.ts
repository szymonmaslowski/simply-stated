import { createStore } from 'zustand/vanilla';
import { fetchMachine, jobMachine, toggleMachine } from '../example-machines';
import { type EventOf, type StateOf } from 'simply-stated';

type FetchState = StateOf<typeof fetchMachine.state>;

const _fetchStore = createStore<{
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

const _toggleStore = createStore<{
  toggle: StateOf<typeof toggleMachine.state>;
  transition: (event: EventOf<typeof toggleMachine.event>) => void;
}>(set => ({
  toggle: toggleMachine.state.On(),
  transition: event =>
    set(store => ({ toggle: toggleMachine.transition(store.toggle, event) })),
}));

type JobState = StateOf<typeof jobMachine.state>;
type JobId = JobState['data']['id'];

const _jobsStore = createStore<{
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

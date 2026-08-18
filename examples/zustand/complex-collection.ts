/* eslint-disable @typescript-eslint/no-unused-vars */
import { create } from 'zustand';
import { combineSlices, toCollectionStore } from 'simply-stated/zustand';
import { fetchMachine, jobMachine } from '../example-machines';
import { is } from 'simply-stated';

const fetchCollectionSlice = toCollectionStore(fetchMachine, {
  collectionPath: 'machines.fetches.collection',
  // `adjustActions` allows for different placement of generated actions
  // In here it renames the default lifecycle methods, avoiding the naming
  // clash with the job collection.
  adjustActions: ({ machineActions, lifecycleActions }) => ({
    machines: {
      // all machine actions will be placed next to the fetches collection
      // nested in the fetches property
      fetches: machineActions,
      addFetchEntity: lifecycleActions.addEntity,
      removeFetchEntity: lifecycleActions.removeEntity,
    },
  }),
});

const jobCollectionSlice = toCollectionStore(jobMachine, {
  collectionPath: 'machines.jobs.collection',
  // If each of the machine's states carries an identifier in a data you
  // can point it out. This influences the methods API and the stored entity
  // shape (no redundant entityId argument when adding)
  selectIdFromData: data => data.id,
  adjustActions: ({ machineActions, lifecycleActions }) => ({
    machines: {
      // all machine actions will be placed next to the jobs collection
      // nested in the jobs property
      jobs: machineActions,
      addJobEntity: lifecycleActions.addEntity,
      removeJobEntity: lifecycleActions.removeEntity,
    },
  }),
});

// Both slices mount under `machines`, and zustand only shallow-merges, so
// spreading them into one store would drop a branch. `combineSlices` merges
// them deeply instead.
const slicesCombined = combineSlices(fetchCollectionSlice, jobCollectionSlice);

// We are extending the store so we need to type the store shape
type AppStore = ReturnType<typeof slicesCombined> & {
  removeAllJobs: () => void;
  counters: Partial<Record<string, number>>;
  countUp: (entityId: string) => void;
};

const useAppStore = create<AppStore>((setState, getState, store) => ({
  ...slicesCombined(setState, getState, store),
  removeAllJobs: () =>
    // `setState` shallow-merges at the root only, so every level have to be
    // recreated: dropping `...s.machines` would remove fetches, dropping
    // `...s.machines.jobs` would remove the job methods.
    setState(s => ({
      machines: { ...s.machines, jobs: { ...s.machines.jobs, collection: {} } },
    })),
  counters: {},
  countUp: entityId =>
    setState(s => ({
      counters: {
        ...s.counters,
        [entityId]: (s.counters[entityId] ?? 0) + 1,
      },
    })),
}));

const {
  machines: {
    jobs,
    fetches,
    addJobEntity,
    removeJobEntity,
    addFetchEntity,
    removeFetchEntity,
  },
  removeAllJobs,
  counters,
  countUp,
} = useAppStore.getState();

const fetchError = useAppStore(store => {
  const fetchState = store.machines.fetches.collection['fetch2'];
  return fetchState && is(fetchState, fetchMachine.state.Failure)
    ? fetchState.data.error
    : null;
});
if (fetchError) {
  console.error('Fetch error', fetchError);
}

addFetchEntity('fetch2', fetchMachine.state.Idle());
fetches.fetch('fetch2', { query: '' });

// There is no need to provide the entity id when adding the new Job entity.
// That's thanks to the selectIdFromData option
addJobEntity(jobMachine.state.Queued({ id: 'j1', percentage: 0 }));

jobs.started('j1');
jobs.progressed('j1', 50);
removeAllJobs();

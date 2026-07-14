/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  configureStore,
  createEntityAdapter,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { toCollectionSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine, jobMachine } from '../example-machines';
import type { StateOf } from 'simply-stated';
import { nanoid } from 'nanoid';

const fetchCollectionSliceOptions = toCollectionSliceOptions(fetchMachine, {
  nestingPath: 'machines.fetch',
  // Providing `reducers` replaces the default addEntity/removeEntity
  reducers: (lifecycleReducers, entityAdapterCRUD) => ({
    // Renaming default reducers to avoid the naming clash with the job
    // collection
    addFetchEntity: lifecycleReducers.addEntity,
    removeFetchEntity: lifecycleReducers.removeEntity,
    addManyFetchEntities: (
      entitiesState,
      action: PayloadAction<StateOf<typeof fetchMachine.state>[]>,
    ) => {
      const entities = action.payload.map(fetchState => ({
        // For the fetch the selectIdFromData is missing - an id is not
        // part of the fetch state's data. Therefore, it needs to be appended
        // to the machine's state. See below job machine integration.
        entityId: nanoid(),
        ...fetchState,
      }));
      entityAdapterCRUD.addMany(entitiesState, entities);
    },
  }),
  selectors: entitySelectors => ({
    selectFetchError: (entitiesState, entityId: string) => {
      const fetchState = entitySelectors.selectById(entitiesState, entityId);
      return fetchState && fetchState.name === 'Failure'
        ? fetchState.data.error
        : null;
    },
  }),
});

const jobCollectionSliceOptions = toCollectionSliceOptions(jobMachine, {
  nestingPath: 'machines.job',
  // If each of the machine's states carries an identifier in a data you
  // can point it out. This influences the reducer's API and the stored entity
  // shape (no redundant entityId property)
  selectIdFromData: data => data.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
  reducers: ({ addEntity, removeEntity }, { removeAll }) => ({
    // Renaming default reducers to avoid the naming clash with the fetch
    // collection
    addJobEntity: addEntity,
    removeJobEntity: removeEntity,
    removeAllJobs: removeAll,
  }),
  selectors: ({ selectTotal }) => ({
    selectTotalCount: selectTotal,
  }),
});

const counterCollectionEntityAdapter = createEntityAdapter({
  selectId: (entity: { id: string; count: number }) => entity.id,
});

const complexCollectionSlice = createSlice({
  name: 'complex-collection',
  initialState: {
    machines: {
      job: jobCollectionSliceOptions.initialState.machines.job,
      fetch: fetchCollectionSliceOptions.initialState.machines.fetch,
    },
    counters: counterCollectionEntityAdapter.getInitialState(),
  },
  reducers: {
    ...jobCollectionSliceOptions.reducers,
    ...fetchCollectionSliceOptions.reducers,
    addCountEntity: (state, { payload: id }: PayloadAction<string>) => {
      counterCollectionEntityAdapter.addOne(state.counters, {
        id,
        count: 0,
      });
    },
    countUp: (state, { payload: id }: PayloadAction<string>) => {
      counterCollectionEntityAdapter.setOne(state.counters, {
        id,
        count: (state.counters.entities[id]?.count || 0) + 1,
      });
    },
  },
  selectors: {
    ...fetchCollectionSliceOptions.selectors,
    ...jobCollectionSliceOptions.selectors,
    selectAllCounters: state =>
      counterCollectionEntityAdapter.getSelectors().selectAll(state.counters),
  },
});

const {
  addFetchEntity,
  removeFetchEntity,
  fetch,
  retry,
  resolved,
  refetch,
  rejected,

  addJobEntity,
  removeJobEntity,
  started,
  finished,
  progressed,

  addCountEntity,
  countUp,
} = complexCollectionSlice.actions;

const store = configureStore({
  reducer: { [complexCollectionSlice.name]: complexCollectionSlice.reducer },
});

const fetchError = complexCollectionSlice.selectors.selectFetchError(
  store.getState(),
  'fetch2',
);
if (fetchError) {
  console.error('Fetch error', fetchError);
}

store.dispatch(
  addJobEntity(
    // There is no need to provide the entityId property when adding the new
    // Job entity. That's thanks to the selectIdFromData option
    jobMachine.state.Queued({ id: 'j1', percentage: 0 }),
  ),
);
store.dispatch(started({ entityId: 'j1' }));

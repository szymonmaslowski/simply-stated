/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  configureStore,
  createEntityAdapter,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { toCollectionSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine, jobMachine } from '../example-machines';
import { toNativeState, toPlainState } from 'simply-stated';
import type { StateOf } from 'simply-stated';
import { omit } from '../utils';

const makeComplexCollectionSlice = () => {
  const fetchCollectionSliceOptions = toCollectionSliceOptions(fetchMachine, {
    nestingPath: 'machines.fetch',
    selectors: {
      // The collection passed to the selector contains a native states
      selectError: (statesCollection, entityId: string) => {
        const state = statesCollection[entityId];
        if (!state) return null;
        return state.is(fetchMachine.state.Failure) ? state.data.error : null;
      },
    },
  });

  const jobCollectionSliceOptions = toCollectionSliceOptions(jobMachine, {
    nestingPath: 'machines.job',
    // If each of the machine's states carries an identifier in a data you
    // can point it out. This influences the reducer's API and the stored data
    // shape (no redundant entityId property)
    selectIdFromData: data => data.id,
    sortComparer: (a, b) => {
      const stateToNumber = (state: StateOf<typeof jobMachine.state>) => {
        if (state.is(jobMachine.state.Queued)) return 0;
        if (state.is(jobMachine.state.Running)) return 1;
        if (state.is(jobMachine.state.Done)) return 2;
        return 99;
      };

      return stateToNumber(a) - stateToNumber(b);
    },
  });

  const counterCollectionEntityAdapter = createEntityAdapter({
    selectId: (entity: { id: string; count: number }) => entity.id,
  });

  const complexCollectionSlice = createSlice({
    name: 'complex-collection',
    initialState: {
      machines: {
        fetch: fetchCollectionSliceOptions.initialState.machines.fetch,
        job: jobCollectionSliceOptions.initialState.machines.job,
      },
      counters: counterCollectionEntityAdapter.getInitialState(),
    },
    reducers: {
      // Fetch reducers
      ...omit(
        fetchCollectionSliceOptions.reducers,
        'addEntity',
        'removeEntity',
      ),
      // Renaming default reducer to avoid naming clash with jobSlice
      removeFetchEntity: fetchCollectionSliceOptions.reducers.removeEntity,
      // There is fetchCollectionSliceOptions.reducers.addEntity available.
      // The bellow example showcases manual integration
      addFetchEntity: (
        state,
        {
          payload,
        }: PayloadAction<{
          entityId: string;
          state: StateOf<typeof fetchMachine.state>;
        }>,
      ) => {
        const newEntity = {
          // for the fetch we did not specify the selectIdFromData - an id is not
          // part of the state's data. Therefore, it needs to be appended to the machine's state.
          entityId: payload.entityId,
          // Redux require state to be serialisable, while machine state is not.
          // The toPlainState converts native machine state to plain, serialisable version.
          // All reducers prepared by the simply stated adapter already do that under the hood
          ...toPlainState(payload.state),
        };
        fetchCollectionSliceOptions.entityAdapter.addOne(
          state.machines.fetch,
          newEntity,
        );
      },

      // Job reducers
      ...omit(jobCollectionSliceOptions.reducers, 'addEntity', 'removeEntity'),
      // Renaming default reducers to avoid naming clash with fetchSlice
      addJobEntity: jobCollectionSliceOptions.reducers.addEntity,
      removeJobEntity: jobCollectionSliceOptions.reducers.removeEntity,

      // Count reducers
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
    // The adapter out of the box provides selectors of the internal RTK's entity
    // adapter. Not exactly them actually... Those selectors are patched to return
    // the native machine state as the state managed by the entity adapter is plain.
    // To avoid the noise, here we pick only a few available selectors
    selectors: {
      // Fetch selectors
      selectFetchById: fetchCollectionSliceOptions.selectors.selectNativeById,
      selectFetchError: fetchCollectionSliceOptions.selectors.selectError,

      // Job selectors
      selectAllJobs: jobCollectionSliceOptions.selectors.selectAllNative,
      selectJobsIds: jobCollectionSliceOptions.selectors.selectIds,
      selectTotalJobsCount:
        jobCollectionSliceOptions.selectors.selectTotalCount,
      selectJobById: ({ machines: { job } }, id: string) => {
        const jobEntity = job.entities[id];
        //
        return jobEntity ? toNativeState(jobEntity) : undefined;
      },

      // Counter selectors
      selectAllCounters: state =>
        counterCollectionEntityAdapter.getSelectors().selectAll(state.counters),
    },
  });

  // @ts-expect-error actions not used
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
  } = complexCollectionSlice.actions;

  // @ts-expect-error selectors not used
  const {
    selectFetchById,
    selectFetchError,
    selectAllJobs,
    selectJobsIds,
    selectJobById,
    selectTotalJobsCount,
    selectAllCounters,
  } = complexCollectionSlice.selectors;

  return complexCollectionSlice;
};

const complexCollectionSlice = makeComplexCollectionSlice();

const store = configureStore({
  reducer: { [complexCollectionSlice.name]: complexCollectionSlice.reducer },
});

const logFetchData = (fetchSuccess?: StateOf<typeof fetchMachine.state>) => {
  if (fetchSuccess?.is(fetchMachine.state.Success)) {
    console.info('Fetch success! Data:', fetchSuccess.data.value);
  }
};

const fetch2 = complexCollectionSlice.selectors.selectFetchById(
  store.getState(),
  'fetch2',
);
logFetchData(fetch2);

store.dispatch(
  complexCollectionSlice.actions.addJobEntity({
    // Thanks to the selectIdFromData option there is no need
    // to provide the entityId property for adding Job entity
    state: jobMachine.state.Queued({ id: 'j1', percentage: 0 }),
  }),
);
store.dispatch(complexCollectionSlice.actions.started({ entityId: 'j1' }));

/* eslint-disable @typescript-eslint/no-unused-vars */
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { toCollectionSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine } from '../example-machines';
import { is } from 'simply-stated';

const basicCollectionSlice = createSlice({
  name: 'basic-collection',
  ...toCollectionSliceOptions(fetchMachine, {
    // The adapter provides selectors of the internal RTK entity-adapter so you
    // can expose exactly the ones you need, returning the managed states.
    selectors: entitySelectors => ({
      selectById: entitySelectors.selectById,
    }),
  }),
});

// There are two builtin "lifecycle" reducers: addEntity and removeEntity
const { addEntity, removeEntity, fetch, retry, resolved, refetch, rejected } =
  basicCollectionSlice.actions;

// It additionally exposes the bare RTK's entity adapter
const { entityAdapter } = toCollectionSliceOptions(fetchMachine);

const store = configureStore({
  reducer: { [basicCollectionSlice.name]: basicCollectionSlice.reducer },
});

const fetch1 = basicCollectionSlice.selectors.selectById(
  store.getState(),
  'fetch1',
);
if (fetch1 && is(fetch1, fetchMachine.state.Success)) {
  console.info('Fetch success! Data:', fetch1.data.value);
}

store.dispatch(
  addEntity({
    entityId: 'fetch2',
    ...fetchMachine.state.Idle(),
  }),
);
store.dispatch(fetch({ entityId: 'fetch2', payload: { query: '' } }));
store.dispatch(removeEntity({ entityId: 'fetch2' }));

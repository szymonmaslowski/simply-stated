/* eslint-disable @typescript-eslint/no-unused-vars */
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { toCollectionSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine } from '../example-machines';
import type { StateOf } from 'simply-stated';

const makeBasicCollectionSlice = () => {
  const basicCollectionSlice = createSlice({
    name: 'basic-collection',
    ...toCollectionSliceOptions(fetchMachine),
  });

  // @ts-expect-error actions not used
  const { addEntity, removeEntity, fetch, retry, resolved, refetch, rejected } =
    basicCollectionSlice.actions;

  // @ts-expect-error selectors not used
  // The adapter out of the box provides selectors of the internal RTK's entity
  // adapter. Not exactly them actually... Those selectors are patched to return
  // the native machine state as the state managed by the entity adapter is plain.
  const {
    selectAllNative,
    selectNativeEntities,
    selectNativeById,
    selectIds,
    selectTotal,
  } = basicCollectionSlice.selectors;

  // @ts-expect-error properties not used
  // The collection adapter additionally exposes the bare RTK's entity adapter
  const { entityAdapter } = toCollectionSliceOptions(fetchMachine);

  return basicCollectionSlice;
};

const basicCollectionSlice = makeBasicCollectionSlice();

const store = configureStore({
  reducer: { [basicCollectionSlice.name]: basicCollectionSlice.reducer },
});

const logFetchData = (fetchSuccess?: StateOf<typeof fetchMachine.state>) => {
  if (fetchSuccess?.is(fetchMachine.state.Success)) {
    console.info('Fetch success! Data:', fetchSuccess.data.value);
  }
};

const fetch1 = basicCollectionSlice.selectors.selectNativeById(
  store.getState(),
  'fetch1',
);
logFetchData(fetch1);

store.dispatch(
  basicCollectionSlice.actions.addEntity({
    entityId: 'fetch1',
    state: fetchMachine.state.Idle(),
  }),
);
store.dispatch(basicCollectionSlice.actions.fetch({ entityId: 'fetch1' }));

/* eslint-disable @typescript-eslint/no-unused-vars */
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { toSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine } from '../example-machines';
import type { StateOf } from 'simply-stated';

const makeBasicSlice = () => {
  const basicSlice = createSlice({
    name: 'basic',
    ...toSliceOptions(fetchMachine, {
      initialState: fetchMachine.state.Idle(),
    }),
  });

  // @ts-expect-error actions not used
  // All the machine events are converted to actions
  const { fetch, retry, resolved, refetch, rejected } = basicSlice.actions;

  // @ts-expect-error selectors not used
  // The adapter out of the box provides the "selectNativeState" selector
  // that exposes the native machine state (redux stores plain, serialisable state)
  const { selectNativeState } = basicSlice.selectors;

  return basicSlice;
};

const basicSlice = makeBasicSlice();

const store = configureStore({
  reducer: { [basicSlice.name]: basicSlice.reducer },
});

const logFetchData = (
  fetchSuccess: StateOf<typeof fetchMachine.state> | undefined,
) => {
  if (fetchSuccess?.is(fetchMachine.state.Success)) {
    console.info('Fetch success! Data:', fetchSuccess.data.value);
  }
};

const fetchState = basicSlice.selectors.selectNativeState(store.getState());
logFetchData(fetchState);

store.dispatch(basicSlice.actions.fetch());
store.dispatch(basicSlice.actions.resolved('server-payload'));

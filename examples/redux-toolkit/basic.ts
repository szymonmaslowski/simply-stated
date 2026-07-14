/* eslint-disable @typescript-eslint/no-unused-vars */
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { toSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine } from '../example-machines';

const basicSlice = createSlice({
  name: 'basic',
  ...toSliceOptions(fetchMachine, {
    initialState: fetchMachine.state.Idle(),
  }),
});

// All the machine events are converted to actions
const { fetch, retry, resolved, refetch, rejected } = basicSlice.actions;

const store = configureStore({
  reducer: { [basicSlice.name]: basicSlice.reducer },
});

store.dispatch(fetch({ query: '' }));
store.dispatch(resolved('server-payload'));

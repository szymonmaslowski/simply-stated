/* eslint-disable @typescript-eslint/no-unused-vars */
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { toSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine, toggleMachine } from '../example-machines';
import { is } from 'simply-stated';

const fetchSliceOptions = toSliceOptions(fetchMachine, {
  initialState: fetchMachine.state.Idle(),
  nestingPath: 'machines.fetch',
  selectors: {
    selectFetchState: state => state,
    selectFetchError: state =>
      is(state, fetchMachine.state.Failure) ? state.data.error : null,
  },
});

const toggleSliceOptions = toSliceOptions(toggleMachine, {
  initialState: toggleMachine.state.On(),
  nestingPath: 'machines.toggle',
  selectors: {
    selectToggleState: state => state,
  },
});

type CounterState = {
  count: number;
};
const initialCounterState: CounterState = {
  count: 0,
};

const complexSlice = createSlice({
  name: 'complex',
  initialState: {
    // Combine manually or deepMerge(fetchSliceOptions.initialState, toggleSliceOptions.initialState)
    machines: {
      fetch: fetchSliceOptions.initialState.machines.fetch,
      toggle: toggleSliceOptions.initialState.machines.toggle,
    },
    counter: initialCounterState,
  },
  reducers: {
    ...fetchSliceOptions.reducers,
    ...toggleSliceOptions.reducers,
    countUp: state => {
      state.counter.count += 1;
    },
  },
  selectors: {
    ...fetchSliceOptions.selectors,
    ...toggleSliceOptions.selectors,
    selectCount: state => state.counter.count,
  },
});

const { fetch, retry, resolved, refetch, rejected, on, off, countUp } =
  complexSlice.actions;

const store = configureStore({
  reducer: { [complexSlice.name]: complexSlice.reducer },
});

const fetchState = complexSlice.selectors.selectFetchState(store.getState());
if (is(fetchState, fetchMachine.state.Success)) {
  console.info('Fetch success! Data:', fetchState.data.value);
}

store.dispatch(fetch({ query: '' }));
store.dispatch(off());
store.dispatch(countUp());

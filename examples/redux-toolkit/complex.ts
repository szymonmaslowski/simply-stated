/* eslint-disable @typescript-eslint/no-unused-vars */
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { toSliceOptions } from 'simply-stated/redux-toolkit';
import { fetchMachine, toggleMachine } from '../example-machines';
import { omit } from '../utils';
import type { StateOf } from 'simply-stated';

const makeComplexSlice = () => {
  const fetchSliceOptions = toSliceOptions(fetchMachine, {
    initialState: fetchMachine.state.Idle(),
    nestingPath: 'machines.fetch',
    selectors: {
      // The state passed to the selector is a native state
      selectError: state =>
        state.is(fetchMachine.state.Failure) ? state.data.error : null,
    },
  });

  const toggleSliceOptions = toSliceOptions(toggleMachine, {
    initialState: toggleMachine.state.Open(),
    nestingPath: 'machines.toggle',
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
      ...omit(fetchSliceOptions.selectors, 'selectNativeState'),
      selectFetchState: fetchSliceOptions.selectors.selectNativeState,
      ...omit(toggleSliceOptions.selectors, 'selectNativeState'),
      selectToggleState: toggleSliceOptions.selectors.selectNativeState,
      selectCount: state => state.counter.count,
    },
  });

  // @ts-expect-error actions not used
  const { fetch, retry, resolved, refetch, rejected, opened, closed, countUp } =
    complexSlice.actions;

  // @ts-expect-error selectors not used
  const { selectCount, selectToggleState, selectFetchState, selectError } =
    complexSlice.selectors;

  return complexSlice;
};

const complexSlice = makeComplexSlice();

const store = configureStore({
  reducer: { [complexSlice.name]: complexSlice.reducer },
});

const logFetchData = (fetchSuccess?: StateOf<typeof fetchMachine.state>) => {
  if (fetchSuccess?.is(fetchMachine.state.Success)) {
    console.info('Fetch success! Data:', fetchSuccess.data.value);
  }
};

logFetchData(complexSlice.selectors.selectFetchState(store.getState()));

store.dispatch(complexSlice.actions.fetch());
store.dispatch(complexSlice.actions.closed());
store.dispatch(complexSlice.actions.countUp());

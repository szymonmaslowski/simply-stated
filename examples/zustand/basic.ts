/* eslint-disable @typescript-eslint/no-unused-vars */
import { create } from 'zustand';
import { toStore } from 'simply-stated/zustand';
import { fetchMachine } from '../example-machines';

const useFetchStore = create(
  toStore(fetchMachine, {
    initialState: fetchMachine.state.Idle(),
  }),
);

// All the machine events are converted to methods at the store root
const { fetch, retry, resolved, refetch, rejected } = useFetchStore.getState();

// The machine state is at the store root as well
const { state } = useFetchStore.getState();

fetch({ query: '' });
resolved('server-payload');

if (state.name === 'Success') {
  console.info('Fetch success! Data:', state.data.value);
}

/* eslint-disable @typescript-eslint/no-unused-vars */
import { create } from 'zustand';
import { combineSlices, toStore } from 'simply-stated/zustand';
import { fetchMachine, toggleMachine } from '../example-machines';
import { is } from 'simply-stated';

const fetchStoreSlice = toStore(fetchMachine, {
  initialState: fetchMachine.state.Idle(),
  statePath: 'machines.fetch',
  // `adjustActions` allows for different placement of generated actions
  adjustActions: ({ machineActions }) => ({
    fetchActions: machineActions,
  }),
});

const toggleStoreSlice = toStore(toggleMachine, {
  initialState: toggleMachine.state.On(),
  statePath: 'machines.toggle',
  adjustActions: ({ machineActions }) => ({
    // Note we are nesting actions in the machines property shared by both slices.
    // Having conflicting structures (same properties) in both slices results
    // in rejection on the combineSlices level.
    machines: {
      toggleActions: {
        switchToggleOff: machineActions.off,
        turnToggleOn: machineActions.on,
      },
    },
  }),
});

// Both slices mount under `machines`, and zustand only shallow-merges, so
// spreading them into one store would drop a branch. `combineSlices` merges
// them deeply instead.
const slicesCombined = combineSlices(fetchStoreSlice, toggleStoreSlice);

// We are extending the store with a counter so we need to type the store shape
type AppStore = ReturnType<typeof slicesCombined> & {
  counter: { count: number };
  countUp: () => void;
};
const useAppStore = create<AppStore>((setState, getState, store) => ({
  ...slicesCombined(setState, getState, store),
  counter: { count: 0 },
  countUp: () => setState(s => ({ counter: { count: s.counter.count + 1 } })),
}));

const {
  machines: { fetch, toggle, toggleActions },
  fetchActions,
  counter,
  countUp,
} = useAppStore.getState();

if (is(fetch, fetchMachine.state.Success)) {
  console.info('Fetch success! Data:', fetch.data.value);
}

fetchActions.fetch({ query: '' });
toggleActions.switchToggleOff();
countUp();

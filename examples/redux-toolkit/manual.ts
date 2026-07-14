import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { fetchMachine, jobMachine, toggleMachine } from '../example-machines';
import { type EventOf, type StateOf } from 'simply-stated';

// Single instance, one action per event - mirrors the `toSliceOptions`.
const _fetchSlice = createSlice({
  name: 'fetch',
  initialState: fetchMachine.state.Idle() as StateOf<typeof fetchMachine.state>,
  reducers: {
    fetch: (state, { payload }: PayloadAction<string>) =>
      fetchMachine.transition(
        state,
        fetchMachine.event.fetch({ query: payload }),
      ),
    resolved: (state, { payload }: PayloadAction<string>) =>
      fetchMachine.transition(state, fetchMachine.event.resolved(payload)),
    rejected: (state, { payload }: PayloadAction<string>) =>
      fetchMachine.transition(state, fetchMachine.event.rejected(payload)),
    refetch: state =>
      fetchMachine.transition(state, fetchMachine.event.refetch()),
    retry: state => fetchMachine.transition(state, fetchMachine.event.retry()),
  },
});

// Single instance, and single "transition" action
const _toggleSlice = createSlice({
  name: 'toggle',
  initialState: {
    // nested state
    toggle: toggleMachine.state.On() as StateOf<typeof toggleMachine.state>,
  },
  reducers: {
    // Alternatively to defining an action per event, expose a single action
    // handling all the events where payload IS the machine event
    transition: (
      state,
      { payload: event }: PayloadAction<EventOf<typeof toggleMachine.event>>,
    ) => {
      state.toggle = toggleMachine.transition(state.toggle, event);
    },
  },
});

// Collection and single "transition" action per entity
type JobState = StateOf<typeof jobMachine.state>;
type JobId = JobState['data']['id'];
const _jobsSlice = createSlice({
  name: 'jobs',
  // Using plain object as opposed to Entity Adapter used by
  // the `toCollectionSliceOptions`.
  initialState: {} as Record<string, JobState>,
  reducers: {
    add: (state, { payload: job }: PayloadAction<JobState>) => {
      state[job.data.id] = job;
    },
    remove: (state, { payload: id }: PayloadAction<string>) => {
      delete state[id];
    },
    transition: (
      state,
      {
        payload: { id, event },
      }: PayloadAction<{
        id: JobId;
        event: EventOf<typeof jobMachine.event>;
      }>,
    ) => {
      const current = state[id];
      if (current) state[id] = jobMachine.transition(current, event);
    },
  },
  selectors: {
    selectAll: state => Object.values(state),
    selectById: (state, id: JobId) => state[id],
  },
});

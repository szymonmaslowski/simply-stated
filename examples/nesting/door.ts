import {
  combineStates,
  defineState,
  forwardEvents,
  type StateOf,
} from 'simply-stated';

export const lockMachine = combineStates(
  defineState('Locked', 'Unlocked').withData<{ pin: string }>(),
).createMachine(state => ({
  Locked: {
    unlocked: (data, payload: { pin: string }) =>
      data.pin === payload.pin ? state.Unlocked(data) : state.Locked(data),
  },
  Unlocked: {
    locked: data => state.Locked(data),
  },
}));

const doorMachine = combineStates(
  defineState('Open', 'Closed').withData<{
    lockState: StateOf<typeof lockMachine.state>;
  }>(),
).createMachine(state => ({
  Open: {
    closed: data => state.Closed(data),
  },
  Closed: {
    ...forwardEvents(lockMachine, state.Closed, data => data.lockState),
    opened: data => state.Open(data),
  },
}));

doorMachine.event.closed();
doorMachine.event.locked();
doorMachine.event.unlocked({ pin: '1234' });

const doorOpenState = doorMachine.state.Open({
  lockState: lockMachine.state.Locked({ pin: '1234' }),
});

// It won't transition (will return the same doorOpenState)
// as the `locked` event is not available in Open state
doorMachine.transition(doorOpenState, doorMachine.event.locked());

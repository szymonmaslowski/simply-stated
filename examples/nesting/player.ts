import {
  combineStates,
  defineState,
  forwardEvents,
  type StateCreatorOf,
  type StateOf,
} from 'simply-stated';
import { toggleMachine } from '../example-machines';

// Defining the state shape first.
const { createMachine, state } = combineStates(
  defineState('Paused', 'Playing').withData<{
    fullScreen: StateOf<typeof toggleMachine.state>;
    muted: StateOf<typeof toggleMachine.state>;
  }>(),
);

const makeSharedEvents = <StateCreator extends StateCreatorOf<typeof state>>(
  stateCreator: StateCreator,
) => {
  const mute = forwardEvents(toggleMachine, stateCreator, data => data.muted);
  const fullScreen = forwardEvents(
    toggleMachine,
    stateCreator,
    data => data.fullScreen,
  );

  return {
    mute: mute.on,
    unmute: mute.off,
    enterFullScreen: fullScreen.on,
    exitFullScreen: fullScreen.off,
  };
};

const _playerMachine = createMachine({
  Paused: {
    ...makeSharedEvents(state.Paused),
    play: data => state.Playing(data),
  },
  Playing: {
    ...makeSharedEvents(state.Playing),
    pause: data => state.Paused(data),
  },
});

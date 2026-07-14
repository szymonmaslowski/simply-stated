import {
  combineStates,
  defineState,
  forwardEvents,
  type EventOf,
  type StateOf,
} from 'simply-stated';
import { fetchMachine } from '../example-machines';

const _searchMachine = combineStates(
  // The Parametrising state doesn't allow for running fetch (only Idle allowed)
  defineState('Parametrising').withData<{
    options: Record<string, string>;
    fetchingState: StateOf<typeof fetchMachine.state, 'Idle'>;
  }>(),

  // Fetching and handling failure is handled by the single Fetching state.
  defineState('Loading').withData<{
    fetchingState: StateOf<typeof fetchMachine.state, 'Fetching' | 'Failure'>;
  }>(),

  // Viewing the results is possible only when fetching succeeded
  defineState('ViewingResults').withData<{
    result: object[];
    fetchingState: StateOf<typeof fetchMachine.state, 'Success'>;
  }>(),
).createMachine(state => ({
  Parametrising: {
    parameterSet: (
      { options, ...restData },
      { name, value }: { name: string; value: string },
    ) =>
      state.Parametrising({
        ...restData,
        options: {
          ...options,
          [name]: value,
        },
      }),

    triggerSearch: ({ fetchingState, options }) => {
      const query = Object.entries(options)
        .map(([key, val]) => `${key}=${val}`)
        .join(',');
      const nextFetchingState = fetchMachine.transition(
        fetchingState,
        fetchMachine.event.fetch({ query }),
      );

      // In case the transition was not successful
      // we return the current state back
      if (nextFetchingState.name !== 'Fetching') {
        return state.Parametrising({ fetchingState, options });
      }

      return state.Loading({ fetchingState: nextFetchingState });
    },
  },
  Loading: {
    searchFailed: forwardEvents(
      fetchMachine,
      state.Loading,
      data => data.fetchingState,
    ).rejected,

    retry: forwardEvents(
      fetchMachine,
      state.Loading,
      data => data.fetchingState,
    ).retry,

    searchSucceeded: (
      { fetchingState },
      value: EventOf<typeof fetchMachine.event, 'resolved'>['payload'],
    ) => {
      const nextFetchingState = fetchMachine.transition(
        fetchingState,
        fetchMachine.event.resolved(value),
      ) as StateOf<typeof fetchMachine.state, 'Success'>;

      // In case the transition was not successful
      // we return the current state back
      if (nextFetchingState.name !== 'Success') {
        return state.Loading({ fetchingState });
      }

      const result = JSON.parse(nextFetchingState.data.value);
      return state.ViewingResults({
        result,
        fetchingState: nextFetchingState,
      });
    },
  },
  ViewingResults: {},
}));

import {
  combineStates,
  defineState,
  forwardEvents,
  type StateOf,
} from 'simply-stated';
import { createRunner } from 'simply-stated/runner';

type Report = { success: boolean; result: string };

const runStep = async (step: string) =>
  new Promise<string>(resolve => {
    setTimeout(() => {
      resolve(`${step} done`);
    }, 2000);
  });

const executionMachine = combineStates(
  defineState('Idle', 'Running'),
).createMachine(state => ({
  Idle: { triggered: () => state.Running() },
  Running: {},
}));

const makeInitialData = (context: string) => ({
  context,
  execution: executionMachine.state.Idle(),
});

const pipelineMachine = combineStates(
  defineState('Researching', 'Planning', 'Implementing', 'Reviewing').withData<{
    context: string;
    execution: StateOf<typeof executionMachine.state>;
  }>(),
  defineState('Completed').withData<{ context: string }>(),
).createMachine(state => ({
  '*': {
    startOverWithNewQuery: (newQuery: string) =>
      state.Researching(makeInitialData(newQuery)),
  },
  Researching: {
    ...forwardEvents(executionMachine, state.Researching, d => d.execution),
    reported: (data, { success, result }: Report) =>
      success
        ? state.Planning(makeInitialData(`${data.context} ${result}`))
        : state.Researching(makeInitialData(data.context)),
  },
  Planning: {
    ...forwardEvents(executionMachine, state.Planning, d => d.execution),
    reported: (data, { success, result }: Report) =>
      success
        ? state.Implementing(makeInitialData(`${data.context} ${result}`))
        : state.Planning(makeInitialData(data.context)),
  },
  Implementing: {
    ...forwardEvents(executionMachine, state.Implementing, d => d.execution),
    reported: (data, { success, result }: Report) =>
      success
        ? state.Reviewing(makeInitialData(`${data.context} ${result}`))
        : state.Implementing(makeInitialData(data.context)),
  },
  Reviewing: {
    ...forwardEvents(executionMachine, state.Reviewing, d => d.execution),
    reported: (data, { success, result }: Report) => {
      if (!success) return state.Reviewing(makeInitialData(data.context));
      if (result.includes('Changes requested')) {
        return state.Implementing(makeInitialData(`${data.context} ${result}`));
      }
      return state.Completed({ context: `${data.context} ${result}` });
    },
  },
  Completed: {},
}));

const { event } = pipelineMachine;

const runner = createRunner(pipelineMachine, {
  onComplete: (result: string) => {
    console.info('Pipeline finished:', result);
  },
  effects: async ({ complete, currentState, dispatch, isRunning }) => {
    if (currentState.name === 'Completed') {
      console.info(currentState.name, currentState.data.context);
      complete(currentState.data.context);
      return;
    }
    if (currentState.data.execution.name !== 'Idle') return;

    dispatch(event.triggered());

    try {
      const result = await runStep(currentState.name);
      if (!isRunning()) return;
      dispatch(
        event.reported({
          success: true,
          result,
        }),
      );
    } catch (error) {
      if (!isRunning()) return;
      dispatch(
        event.reported({
          success: false,
          result: `Failed: ${error}`,
        }),
      );
    }
  },
});

const weatherRun = runner.start(
  pipelineMachine.state.Researching(
    makeInitialData('What is the weather today?'),
  ),
);
const unicornRun = runner.start(
  pipelineMachine.state.Researching(makeInitialData('Am I rich yet?')),
);

const {
  data: { context: weatherUntilNow },
} = weatherRun.api.getCurrentState();
if (weatherRun.api.isRunning()) {
  weatherRun.api.dispatch(
    pipelineMachine.event.startOverWithNewQuery('Is it raining today?'),
  );
}
// Awaited together: `result` rejects as soon as its run fails, so awaiting
// one and then the other would leave the second rejection unhandled.
const [rainingTodayResult, unicornResult] = await Promise.all([
  weatherRun.result,
  unicornRun.result,
]);

console.info('Here is what I got:');
console.info(weatherUntilNow);
console.info(rainingTodayResult);
console.info(unicornResult);

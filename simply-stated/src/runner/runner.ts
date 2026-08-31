import { forwardEvents } from '../nesting';
import { combineStates, defineState } from '../simply-stated';
import type {
  AnyMachine,
  AnyState,
  EventOf,
  StateOf,
  StateOfMachine,
} from '../simply-stated';

type AnyInputEvent = EventOf<AnyMachine['event']>;

const effectsScheduledMachine = combineStates(
  defineState('No', 'Yes'),
).createMachine(
  state => ({
    No: { effectsScheduled: state.Yes },
    Yes: { effectsExecuted: state.No },
  }),
  { onInvalidTransition: () => {} },
);

const createRunnerMachine = (inputMachine: AnyMachine) =>
  combineStates(
    defineState('Idle'),
    defineState('Running').withData<{
      abortController: AbortController;
      effectsScheduled: StateOf<typeof effectsScheduledMachine.state>;
      inputMachineState: AnyState;
    }>(),
    defineState('Stopped').withData<{
      inputMachineState: AnyState;
    }>(),
  ).createMachine(
    state => ({
      Idle: {
        started: (_, inputMachineState: AnyState) =>
          state.Running({
            abortController: new AbortController(),
            effectsScheduled: effectsScheduledMachine.state.No(),
            inputMachineState,
          }),
      },
      Running: {
        ...forwardEvents(
          effectsScheduledMachine,
          state.Running,
          d => d.effectsScheduled,
        ),
        stopped: ({ abortController, inputMachineState }) => {
          abortController.abort();
          return state.Stopped({ inputMachineState });
        },
        transitionInputState: (data, inputMachineEvent: AnyInputEvent) => {
          return state.Running({
            ...data,
            inputMachineState: inputMachine.transition(
              data.inputMachineState,
              inputMachineEvent,
            ),
          });
        },
      },
      Stopped: {},
    }),
    { onInvalidTransition: () => {} },
  );

type RunnerMachine = ReturnType<typeof createRunnerMachine>;

// Only this much is per-run: the machine itself is built once per runner.
const createRunnerController = (runnerMachine: RunnerMachine) => {
  const runnerController = {
    state: runnerMachine.state.Idle() as StateOf<RunnerMachine['state']>,
    process: (event: EventOf<RunnerMachine['event']>) => {
      runnerController.state = runnerMachine.transition(
        runnerController.state,
        event,
      );
    },
  };

  return runnerController;
};

type AnyOnComplete = (result: never) => void;

export type Dispatch<Machine extends AnyMachine> = (
  event: EventOf<Machine['event']>,
) => void;

type CommonApiPart<Machine extends AnyMachine> = {
  dispatch: Dispatch<Machine>;
  isRunning: () => boolean;
};

type CompleteArgs<OnComplete> = OnComplete extends (
  ...args: infer Args
) => unknown
  ? Args
  : [];

type CompleteResult<OnComplete> =
  CompleteArgs<OnComplete> extends [result: infer Result]
    ? Result
    : CompleteArgs<OnComplete>[number] | void;

type EffectsContext<
  Machine extends AnyMachine,
  OnComplete,
> = CommonApiPart<Machine> & {
  abortSignal: AbortSignal;
  complete: (...args: CompleteArgs<OnComplete>) => void;
  currentState: StateOfMachine<Machine>;
};

export type RunnerApi<Machine extends AnyMachine> = CommonApiPart<Machine> & {
  getCurrentState: () => StateOfMachine<Machine>;
};

type Start<Machine extends AnyMachine, OnComplete> = (
  initialState: StateOfMachine<Machine>,
) => {
  api: RunnerApi<Machine>;
  result: Promise<CompleteResult<OnComplete>>;
};

export type EffectsProcessor<
  Machine extends AnyMachine,
  OnComplete = undefined,
> = (
  effectsContext: EffectsContext<Machine, OnComplete>,
) => void | Promise<void>;

export type RunnerOptions<Machine extends AnyMachine, OnComplete> = {
  effects: EffectsProcessor<Machine, OnComplete>;
  onComplete?: OnComplete;
  scheduler?: (runEffects: () => void) => void;
};

export const createRunner = <
  InputMachine extends AnyMachine,
  OnComplete extends AnyOnComplete | undefined = undefined,
>(
  inputMachine: InputMachine,
  {
    effects,
    onComplete,
    scheduler = queueMicrotask,
  }: RunnerOptions<InputMachine, OnComplete>,
) => {
  const notifyComplete = onComplete as
    | ((...args: CompleteArgs<OnComplete>) => unknown)
    | undefined;

  const runnerMachine = createRunnerMachine(inputMachine);

  const start: Start<InputMachine, OnComplete> = initialState => {
    let resolveResult: (result: CompleteResult<OnComplete>) => void;
    let rejectResult: (error: unknown) => void;
    const resultPromise = new Promise<CompleteResult<OnComplete>>(
      (resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      },
    );

    const runController = createRunnerController(runnerMachine);

    const isRunning = () => runController.state.name === 'Running';

    const dispatch: CommonApiPart<InputMachine>['dispatch'] = event => {
      if (runController.state.name !== 'Running') return;

      const prevInputState = runController.state.data.inputMachineState;
      runController.process(
        runnerMachine.event.transitionInputState(event as AnyInputEvent),
      );

      if (prevInputState === runController.state.data.inputMachineState) return;
      scheduleEffects();
    };

    const getCurrentState: RunnerApi<InputMachine>['getCurrentState'] = () => {
      if (runController.state.name === 'Idle') {
        throw new Error('The runner has not been started');
      }
      return runController.state.data
        .inputMachineState as StateOfMachine<InputMachine>;
    };

    const complete = (...args: CompleteArgs<OnComplete>) => {
      if (runController.state.name !== 'Running') return;
      const [result] = args as [CompleteResult<OnComplete>];
      runController.process(runnerMachine.event.stopped());
      resolveResult(result);
      notifyComplete?.(...args);
    };

    const createEffectsContext = ({
      abortSignal,
      currentState,
    }: {
      abortSignal: AbortSignal;
      currentState: StateOfMachine<InputMachine>;
    }) =>
      ({
        abortSignal,
        complete,
        currentState,
        dispatch,
        isRunning,
      }) as EffectsContext<InputMachine, OnComplete>;

    const runEffects = async () => {
      if (runController.state.name !== 'Running') return;
      runController.process(runnerMachine.event.effectsExecuted());
      try {
        await effects(
          createEffectsContext({
            abortSignal: runController.state.data.abortController.signal,
            currentState: getCurrentState(),
          }),
        );
      } catch (error) {
        if (runController.state.name !== 'Running') throw error;

        runController.process(runnerMachine.event.stopped());
        rejectResult(error);
      }
    };

    const scheduleEffects = () => {
      if (runController.state.name !== 'Running') return;
      if (runController.state.data.effectsScheduled.name === 'Yes') return;

      runController.process(runnerMachine.event.effectsScheduled());
      scheduler(() => void runEffects());
    };

    const api: RunnerApi<InputMachine> = {
      dispatch,
      getCurrentState,
      isRunning,
    };

    runController.process(
      runnerMachine.event.started(initialState as AnyState),
    );
    scheduleEffects();

    return { api, result: resultPromise };
  };

  return {
    start,
  };
};

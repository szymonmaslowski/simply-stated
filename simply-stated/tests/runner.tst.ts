/**
 * Type-level tests for the runner.
 *
 * Positive inference of the effects context and the run handle, plus the
 * compile-time error surface (foreign states and events, and the arity
 * `onComplete` imposes on `complete` and `result`). Never executed at runtime.
 */

import { expect, test } from 'tstyche';
import { combineStates, defineState, is, type StateOf } from '../src';
import {
  createRunner,
  type Dispatch,
  type EffectsProcessor,
  type RunnerApi,
  type RunnerOptions,
} from '../src/runner';

const workerMachine = combineStates(
  defineState('Idle'),
  defineState('Running').withData<{ job: string }>(),
  defineState('Done').withData<{ result: string }>(),
).createMachine(state => ({
  Idle: { started: (_, job: string) => state.Running({ job }) },
  Running: { finished: (_, result: string) => state.Done({ result }) },
  Done: {},
}));

type WorkerState = StateOf<typeof workerMachine.state>;

const otherMachine = combineStates(defineState('Elsewhere')).createMachine(
  state => ({
    Elsewhere: { wandered: () => state.Elsewhere() },
  }),
);

const makeRunner = (effects: EffectsProcessor<typeof workerMachine>) =>
  createRunner(workerMachine, { effects });

test('the effects context carries the state union', () => {
  makeRunner(({ currentState }) => {
    expect(currentState).type.toBe<WorkerState>();
  });
});

test('the state is narrowable inside the processor', () => {
  makeRunner(({ currentState }) => {
    if (is(currentState, workerMachine.state.Running)) {
      expect(currentState.data).type.toBe<{ job: string }>();
    }
  });
});

test('dispatch accepts only the events of the run machine', () => {
  makeRunner(({ dispatch }) => {
    expect(dispatch(workerMachine.event.started('job-1'))).type.toBe<void>();
    expect(dispatch(workerMachine.event.finished('ok'))).type.toBe<void>();

    // @ts-expect-error not assignable to parameter
    dispatch(otherMachine.event.wandered());
    // @ts-expect-error not assignable to parameter
    dispatch({ type: 'started' });
  });
});

test('the abort signal and the running flag are available to the processor', () => {
  makeRunner(({ abortSignal, isRunning }) => {
    expect(abortSignal).type.toBe<AbortSignal>();
    expect(isRunning()).type.toBe<boolean>();
  });
});

type BareRunner = {
  start: (initialState: WorkerState) => {
    api: RunnerApi<typeof workerMachine>;
    result: Promise<void>;
  };
};

test('the processor may be synchronous or asynchronous', () => {
  expect(makeRunner(() => {})).type.toBe<BareRunner>();
  expect(makeRunner(async () => {})).type.toBe<BareRunner>();
});

test('the run handle exposes the machine state and the lifecycle', () => {
  const { api } = makeRunner(() => {}).start(workerMachine.state.Idle());

  expect(api.dispatch(workerMachine.event.started('j'))).type.toBe<void>();
  expect(api.getCurrentState()).type.toBe<WorkerState>();
  expect(api.isRunning()).type.toBe<boolean>();
});

test('the initial state must belong to the run machine', () => {
  const runner = makeRunner(() => {});

  // @ts-expect-error not assignable to parameter
  runner.start(otherMachine.state.Elsewhere());
});

test('complete and result are available without an onComplete', () => {
  createRunner(workerMachine, {
    effects: ({ complete }) => {
      expect<Parameters<typeof complete>>().type.toBe<[]>();
      expect(complete()).type.toBe<void>();

      // @ts-expect-error Expected 0 arguments, but got 1
      complete('nothing declares this');
    },
  });

  const started = makeRunner(() => {}).start(workerMachine.state.Idle());

  expect(started.result).type.toBe<Promise<void>>();
});

test('complete takes the parameter declared by onComplete', () => {
  createRunner(workerMachine, {
    onComplete: (_result: string) => {},
    effects: ({ complete }) => {
      expect<Parameters<typeof complete>>().type.toBe<[result: string]>();
      expect(complete('ok')).type.toBe<void>();

      // @ts-expect-error Argument of type 'number' is not assignable to parameter of type 'string'
      complete(42);
      // @ts-expect-error Expected 1 arguments, but got 0
      complete();
    },
  });
});

test('a zero-parameter onComplete yields a nullary complete', () => {
  createRunner(workerMachine, {
    onComplete: () => {},
    effects: ({ complete }) => {
      expect<Parameters<typeof complete>>().type.toBe<[]>();
      expect(complete()).type.toBe<void>();

      // @ts-expect-error Expected 0 arguments, but got 1
      complete('nope');
    },
  });
});

test('the result promise carries what onComplete declared', () => {
  const withResult = createRunner(workerMachine, {
    onComplete: (_result: string) => {},
    effects: () => {},
  }).start(workerMachine.state.Idle());

  expect(withResult.result).type.toBe<Promise<string>>();

  const withoutResult = createRunner(workerMachine, {
    onComplete: () => {},
    effects: () => {},
  }).start(workerMachine.state.Idle());

  expect(withoutResult.result).type.toBe<Promise<void>>();
});

test('an optional onComplete parameter keeps complete callable both ways', () => {
  createRunner(workerMachine, {
    onComplete: (_result?: string) => {},
    effects: ({ complete }) => {
      expect<Parameters<typeof complete>>().type.toBe<[result?: string]>();
      expect(complete()).type.toBe<void>();
      expect(complete('ok')).type.toBe<void>();

      // @ts-expect-error Argument of type 'number' is not assignable to parameter of type 'string'
      complete(42);
    },
  });

  const started = createRunner(workerMachine, {
    onComplete: (_result?: string) => {},
    effects: () => {},
  }).start(workerMachine.state.Idle());

  // `[result?: string][number]` keeps the `undefined`, so it is not `T | void`.
  expect(started.result).type.toBe<Promise<string | void | undefined>>();
});

test('the exported option and handle types describe the same surface', () => {
  expect<Dispatch<typeof workerMachine>>().type.toBe<
    RunnerApi<typeof workerMachine>['dispatch']
  >();

  const options: RunnerOptions<typeof workerMachine, (result: string) => void> =
    {
      effects: ({ complete }) => {
        expect<Parameters<typeof complete>>().type.toBe<[result: string]>();
        complete('ok');
      },
      onComplete: (_result: string) => {},
      scheduler: runEffects => runEffects(),
    };

  expect(createRunner(workerMachine, options).start).type.toBe<
    (initialState: WorkerState) => {
      api: RunnerApi<typeof workerMachine>;
      result: Promise<string>;
    }
  >();
});

test('EffectsProcessor carries the completion arity in its second argument', () => {
  const withResult: EffectsProcessor<
    typeof workerMachine,
    (result: string) => void
  > = ({ complete }) => complete('ok');

  const bare: EffectsProcessor<typeof workerMachine> = ({ complete }) =>
    complete();

  expect(withResult).type.toBeAssignableTo<
    EffectsProcessor<typeof workerMachine, (result: string) => void>
  >();
  expect(bare).type.toBeAssignableTo<EffectsProcessor<typeof workerMachine>>();
});

test('onComplete takes at most one parameter', () => {
  createRunner(workerMachine, {
    // @ts-expect-error is not assignable to type 'AnyOnComplete'
    onComplete: (_result: string, _extra: number) => {},
    effects: () => {},
  });
});

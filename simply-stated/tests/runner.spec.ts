import { describe, expect, it, vi } from 'vitest';
import { combineStates, defineState, is } from '../src';
import { createRunner, type EffectsProcessor } from '../src/runner';

const makeMachine = () =>
  combineStates(
    defineState('Idle'),
    defineState('Running').withData<{ job: string }>(),
    defineState('Done').withData<{ result: string }>(),
  ).createMachine(
    state => ({
      Idle: { started: (_, job: string) => state.Running({ job }) },
      Running: { finished: (_, result: string) => state.Done({ result }) },
      Done: {},
    }),
    { onInvalidTransition: () => {} },
  );

type WorkerMachine = ReturnType<typeof makeMachine>;

const runSynchronously = (runEffects: () => void) => runEffects();

const flushMicrotasks = () => Promise.resolve();

// Vitest fails the run on an unhandled rejection, so take its listeners off
// while asserting that one happens, then put them back.
const withoutVitestRejectionHandling = async (
  body: () => void | Promise<void>,
) => {
  const vitestListeners = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  const onUnhandled = vi.fn();
  process.on('unhandledRejection', onUnhandled);

  try {
    await body();
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally {
    process.off('unhandledRejection', onUnhandled);
    vitestListeners.forEach(listener =>
      process.on('unhandledRejection', listener),
    );
  }

  return onUnhandled;
};

describe('createRunner', () => {
  it('processes effects for the initial state once started', async () => {
    const machine = makeMachine();
    const effects = vi.fn<EffectsProcessor<WorkerMachine>>();
    createRunner(machine, { effects }).start(machine.state.Idle());

    expect(effects).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(effects).toHaveBeenCalledTimes(1);
    expect(effects.mock.calls[0]![0]).toMatchObject({
      currentState: { name: 'Idle' },
    });
  });

  it('re-processes effects after every state change', () => {
    const machine = makeMachine();
    const seenStates: string[] = [];
    const { api } = createRunner(machine, {
      scheduler: runSynchronously,
      effects: ({ currentState, dispatch }) => {
        seenStates.push(currentState.name);
        if (is(currentState, machine.state.Idle)) {
          dispatch(machine.event.started('job-1'));
        }
        if (is(currentState, machine.state.Running)) {
          dispatch(machine.event.finished('ok'));
        }
      },
    }).start(machine.state.Idle());

    expect(seenStates).toEqual(['Idle', 'Running', 'Done']);
    expect(api.getCurrentState()).toEqual({
      name: 'Done',
      data: { result: 'ok' },
    });
  });

  it('re-processes effects after a state change dispatched from the outside', async () => {
    const machine = makeMachine();
    const seenStates: string[] = [];
    const { api } = createRunner(machine, {
      effects: ({ currentState }) => {
        seenStates.push(currentState.name);
      },
    }).start(machine.state.Idle());

    await flushMicrotasks();

    api.dispatch(machine.event.started('job-1'));
    await flushMicrotasks();

    expect(seenStates).toEqual(['Idle', 'Running']);
  });

  it('does not re-process effects when the event is not allowed', () => {
    const machine = makeMachine();
    const effects = vi.fn<EffectsProcessor<WorkerMachine>>(
      ({ currentState, dispatch }) => {
        if (is(currentState, machine.state.Idle)) {
          dispatch(machine.event.finished('ok'));
        }
      },
    );
    const { api } = createRunner(machine, {
      scheduler: runSynchronously,
      effects,
    }).start(machine.state.Idle());

    expect(effects).toHaveBeenCalledTimes(1);
    expect(api.getCurrentState()).toEqual({ name: 'Idle' });
  });

  it('coalesces state changes made within one run into a single re-run', async () => {
    const machine = makeMachine();
    const seenStates: string[] = [];
    createRunner(machine, {
      effects: ({ currentState, dispatch }) => {
        seenStates.push(currentState.name);
        if (!is(currentState, machine.state.Idle)) return;

        dispatch(machine.event.started('job-1'));
        dispatch(machine.event.finished('ok'));
      },
    }).start(machine.state.Idle());

    await flushMicrotasks();
    await flushMicrotasks();

    expect(seenStates).toEqual(['Idle', 'Done']);
  });

  it('drives an asynchronous processor to completion', async () => {
    const machine = makeMachine();
    const work = vi.fn(async (job: string) => `${job}-result`);

    const { api, result } = createRunner(machine, {
      onComplete: (_result: string) => {},
      effects: async ({ complete, currentState, dispatch }) => {
        if (is(currentState, machine.state.Idle)) {
          dispatch(machine.event.started('job-1'));
          return;
        }

        if (is(currentState, machine.state.Running)) {
          dispatch(machine.event.finished(await work(currentState.data.job)));
          return;
        }

        if (is(currentState, machine.state.Done)) {
          complete(currentState.data.result);
        }
      },
    }).start(machine.state.Idle());

    expect(await result).toBe('job-1-result');
    expect(work).toHaveBeenCalledWith('job-1');
    expect(api.isRunning()).toBe(false);
    expect(api.getCurrentState()).toEqual({
      name: 'Done',
      data: { result: 'job-1-result' },
    });
  });

  it('hands the result to onComplete and to the result promise', async () => {
    const machine = makeMachine();
    const onComplete = vi.fn((_result: string) => {});

    const { result } = createRunner(machine, {
      scheduler: runSynchronously,
      onComplete,
      effects: ({ complete }) => complete('all done'),
    }).start(machine.state.Idle());

    expect(await result).toBe('all done');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('all done');
  });

  it('completes with no result when onComplete takes no parameter', async () => {
    const machine = makeMachine();
    const onComplete = vi.fn(() => {});

    const { api, result } = createRunner(machine, {
      scheduler: runSynchronously,
      onComplete,
      effects: ({ complete }) => complete(),
    }).start(machine.state.Idle());

    expect(await result).toBeUndefined();
    expect(onComplete).toHaveBeenCalledExactlyOnceWith();
    expect(api.isRunning()).toBe(false);
  });

  it('stops processing effects and ignores dispatches once completed', async () => {
    const machine = makeMachine();
    const effects = vi.fn<EffectsProcessor<WorkerMachine>>(({ complete }) =>
      complete(),
    );
    const { api } = createRunner(machine, { effects }).start(
      machine.state.Idle(),
    );

    await flushMicrotasks();

    api.dispatch(machine.event.started('job-1'));
    await flushMicrotasks();

    expect(api.isRunning()).toBe(false);
    expect(effects).toHaveBeenCalledTimes(1);
    expect(api.getCurrentState()).toEqual({ name: 'Idle' });
  });

  it('aborts the signal handed to the processor when completed', async () => {
    const machine = makeMachine();
    let effectsSignal: AbortSignal | undefined;
    let completeRun: (() => void) | undefined;

    createRunner(machine, {
      effects: ({ abortSignal, complete }) => {
        effectsSignal = abortSignal;
        completeRun = complete;
      },
    }).start(machine.state.Idle());

    await flushMicrotasks();
    expect(effectsSignal!.aborted).toBe(false);

    completeRun!();
    expect(effectsSignal!.aborted).toBe(true);
  });

  it('completes bare without an onComplete', async () => {
    const machine = makeMachine();

    const { api, result } = createRunner(machine, {
      scheduler: runSynchronously,
      effects: ({ complete }) => complete(),
    }).start(machine.state.Idle());

    expect(await result).toBeUndefined();
    expect(api.isRunning()).toBe(false);
  });

  it('rejects the result and stops the run when the processor throws', async () => {
    const machine = makeMachine();
    const failure = new Error('effects blew up');
    const onComplete = vi.fn(() => {});
    let effectsSignal: AbortSignal | undefined;

    const { api, result } = createRunner(machine, {
      scheduler: runSynchronously,
      onComplete,
      effects: ({ abortSignal }) => {
        effectsSignal = abortSignal;
        throw failure;
      },
    }).start(machine.state.Idle());

    await expect(result).rejects.toBe(failure);
    expect(api.isRunning()).toBe(false);
    expect(effectsSignal!.aborted).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(api.getCurrentState()).toEqual({ name: 'Idle' });
  });

  it('rejects the result when an asynchronous processor rejects', async () => {
    const machine = makeMachine();

    const { api, result } = createRunner(machine, {
      effects: async () => {
        throw new Error('async failure');
      },
    }).start(machine.state.Idle());

    await expect(result).rejects.toThrow('async failure');
    expect(api.isRunning()).toBe(false);
  });

  it('does not process further effects after a failure', async () => {
    const machine = makeMachine();
    const effects = vi.fn<EffectsProcessor<WorkerMachine>>(() => {
      throw new Error('once');
    });

    const { api, result } = createRunner(machine, {
      scheduler: runSynchronously,
      effects,
    }).start(machine.state.Idle());

    await expect(result).rejects.toThrow('once');

    api.dispatch(machine.event.started('job-1'));
    await flushMicrotasks();

    expect(effects).toHaveBeenCalledTimes(1);
  });

  it('settles the result before notifying, so a throwing onComplete cannot strand it', async () => {
    const machine = makeMachine();
    const callbackFailure = new Error('onComplete blew up');
    const unhandled = await withoutVitestRejectionHandling(async () => {
      const { result } = createRunner(machine, {
        scheduler: runSynchronously,
        onComplete: () => {
          throw callbackFailure;
        },
        effects: ({ complete }) => complete(),
      }).start(machine.state.Idle());

      await expect(result).resolves.toBeUndefined();
    });

    expect(unhandled).toHaveBeenCalledOnce();
    expect(unhandled.mock.calls[0]![0]).toBe(callbackFailure);
  });

  it('re-surfaces an error raised after the run has already ended', async () => {
    const machine = makeMachine();
    const lateFailure = new Error('thrown after the run ended');
    let releaseWork: () => void;
    const work = new Promise<void>(resolve => {
      releaseWork = resolve;
    });

    const unhandled = await withoutVitestRejectionHandling(async () => {
      const { result } = createRunner(machine, {
        effects: async ({ complete }) => {
          complete();
          await work;
          throw lateFailure;
        },
      }).start(machine.state.Idle());

      await result;
      releaseWork();
    });

    expect(unhandled).toHaveBeenCalledOnce();
    expect(unhandled.mock.calls[0]![0]).toBe(lateFailure);
  });

  it('surfaces an ignored rejected result as an unhandled rejection', async () => {
    const machine = makeMachine();
    const failure = new Error('nobody awaits this');

    const onUnhandled = await withoutVitestRejectionHandling(() => {
      createRunner(machine, {
        scheduler: runSynchronously,
        effects: () => {
          throw failure;
        },
      }).start(machine.state.Idle());
    });

    expect(onUnhandled).toHaveBeenCalledOnce();
    expect(onUnhandled.mock.calls[0]![0]).toBe(failure);
  });

  it('keeps separate runs of one runner independent', () => {
    const machine = makeMachine();
    const runner = createRunner(machine, {
      scheduler: runSynchronously,
      effects: ({ currentState, dispatch }) => {
        if (is(currentState, machine.state.Idle)) {
          dispatch(machine.event.started('job-1'));
        }
      },
    });

    const first = runner.start(machine.state.Idle());
    const second = runner.start(machine.state.Done({ result: 'untouched' }));

    expect(first.api.getCurrentState()).toEqual({
      name: 'Running',
      data: { job: 'job-1' },
    });
    expect(second.api.getCurrentState()).toEqual({
      name: 'Done',
      data: { result: 'untouched' },
    });
  });

  it('resumes from the state reached by an earlier run', () => {
    const machine = makeMachine();
    const { api } = createRunner(machine, {
      scheduler: runSynchronously,
      effects: ({ complete, currentState, dispatch }) => {
        if (is(currentState, machine.state.Idle)) {
          dispatch(machine.event.started('job-1'));
          return;
        }
        complete();
      },
    }).start(machine.state.Idle());

    const seenStates: string[] = [];
    createRunner(machine, {
      scheduler: runSynchronously,
      effects: ({ currentState }) => {
        seenStates.push(currentState.name);
      },
    }).start(api.getCurrentState());

    expect(seenStates).toEqual(['Running']);
  });

  it('does not block the next run on an await inside the processor', async () => {
    const machine = makeMachine();
    const order: string[] = [];
    let releaseWork: () => void;
    const work = new Promise<void>(resolve => {
      releaseWork = resolve;
    });

    const { api } = createRunner(machine, {
      scheduler: runSynchronously,
      effects: async ({ currentState }) => {
        order.push(`enter:${currentState.name}`);
        if (is(currentState, machine.state.Idle)) await work;
        order.push(`exit:${currentState.name}`);
      },
    }).start(machine.state.Idle());

    api.dispatch(machine.event.started('job-1'));
    releaseWork!();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(order).toEqual([
      'enter:Idle',
      'enter:Running',
      'exit:Running',
      'exit:Idle',
    ]);
  });

  it('ignores a second complete, and one after a failure', async () => {
    const machine = makeMachine();
    const onComplete = vi.fn((_result: string) => {});

    const { result } = createRunner(machine, {
      scheduler: runSynchronously,
      onComplete,
      effects: ({ complete }) => {
        complete('first');
        complete('second');
      },
    }).start(machine.state.Idle());

    expect(await result).toBe('first');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('first');
  });

  it('defers effects until a deferring scheduler runs them', async () => {
    const machine = makeMachine();
    const pending: (() => void)[] = [];
    const effects = vi.fn<EffectsProcessor<WorkerMachine>>();

    createRunner(machine, {
      scheduler: runEffects => pending.push(runEffects),
      effects,
    }).start(machine.state.Idle());

    expect(effects).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);

    pending.forEach(runEffects => runEffects());
    await flushMicrotasks();

    expect(effects).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when a scheduler invokes its callback more than once', () => {
    const machine = makeMachine();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    createRunner(machine, {
      scheduler: runEffects => {
        runEffects();
        runEffects();
      },
      effects: () => {},
    }).start(machine.state.Idle());

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("routes an unhandled event to the machine's own onInvalidTransition", () => {
    const onInvalidTransition = vi.fn();
    const machine = combineStates(
      defineState('Idle'),
      defineState('Running').withData<{ job: string }>(),
      defineState('Done').withData<{ result: string }>(),
    ).createMachine(
      state => ({
        Idle: { started: (_, job: string) => state.Running({ job }) },
        Running: { finished: (_, result: string) => state.Done({ result }) },
        Done: {},
      }),
      { onInvalidTransition },
    );

    const { api } = createRunner(machine, {
      scheduler: runSynchronously,
      effects: () => {},
    }).start(machine.state.Idle());

    api.dispatch(machine.event.finished('not allowed from Idle'));

    expect(onInvalidTransition).toHaveBeenCalledOnce();
    expect(api.getCurrentState()).toEqual({ name: 'Idle' });
  });

  it('hands the processor exactly the documented context', () => {
    const machine = makeMachine();
    let contextKeys: string[] = [];

    createRunner(machine, {
      scheduler: runSynchronously,
      effects: context => {
        contextKeys = Object.keys(context).sort();
      },
    }).start(machine.state.Idle());

    expect(contextKeys).toEqual([
      'abortSignal',
      'complete',
      'currentState',
      'dispatch',
      'isRunning',
    ]);
  });
});

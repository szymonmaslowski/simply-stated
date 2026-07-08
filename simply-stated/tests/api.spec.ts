import { describe, expect, it, vi } from 'vitest';
import { combineStates, defineState } from '../src';

describe('defineState', () => {
  it('returns a definition object for each state name passed', () => {
    const [closed, broken] = defineState('Closed', 'Broken');
    expect(closed.stateName).toBe('Closed');
    expect(broken.stateName).toBe('Broken');
    expect('data' in closed).toBe(false);
    expect('data' in broken).toBe(false);
  });

  it('void-data definition has no data key', () => {
    const [closed] = defineState('Closed');
    expect(closed).toEqual({ stateName: 'Closed', withData: false });
  });

  it('.withData<Data>() definition carry a data key as the marker', () => {
    const [open] = defineState('Open').withData<{ accountId: string }>();
    expect(open).toEqual({ stateName: 'Open', withData: true });
  });

  it('throws at runtime when called with "*"', () => {
    expect(() => defineState('*' as never)).toThrow(
      "'*' is reserved for cross-state events",
    );
  });

  it('throws at runtime when called with no state names', () => {
    // @ts-expect-error at least one state name is required
    expect(() => defineState()).toThrow(
      'defineState requires at least one state name',
    );
  });
});

describe('combineStates', () => {
  it('returns { createMachine, state }', () => {
    const result = combineStates(defineState('A'));
    expect(typeof result.createMachine).toBe('function');
    expect(typeof result.state).toBe('object');
  });

  it('aggregates creators from multiple defineState() calls into a single state map keyed by state name', () => {
    const { state } = combineStates(
      defineState('A', 'B'),
      defineState('C'),
      defineState('D').withData<{ x: number }>(),
    );
    expect(Object.keys(state).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(state.A.stateName).toBe('A');
    expect(state.B.stateName).toBe('B');
    expect(state.C.stateName).toBe('C');
    expect(state.D.stateName).toBe('D');
  });

  it('throws at runtime on duplicate state across creators', () => {
    // @ts-expect-error duplicate state 'A'
    expect(() => combineStates(defineState('A'), defineState('A'))).toThrow(
      "Duplicate state 'A'",
    );
  });

  it('throws at runtime when a creator with state "*" is passed', () => {
    expect(() => combineStates(defineState('*' as never))).toThrow(
      "'*' is reserved for cross-state events",
    );
  });
});

describe('state object', () => {
  const { state } = combineStates(
    defineState('A', 'B', 'C'),
    defineState('Open').withData<{ accountId: string; n?: number }>(),
  );

  it('has the correct name field', () => {
    expect(state.A().name).toBe('A');
  });

  it('has the correct data field for with-data creators', () => {
    expect(state.Open({ accountId: 'x', n: 1 }).data).toEqual({
      accountId: 'x',
      n: 1,
    });
  });

  it('exposes an is() method', () => {
    expect(typeof state.A().is).toBe('function');
  });

  describe('is()', () => {
    it('returns true when current state matches the passed creator', () => {
      expect(state.A().is(state.A)).toBe(true);
    });

    it('returns false when current state does not match', () => {
      expect(state.A().is(state.B)).toBe(false);
    });

    it('returns true if any of multiple creators matches', () => {
      expect(state.A().is(state.B, state.A, state.C)).toBe(true);
    });

    it('returns false when none of multiple creators matches', () => {
      expect(state.A().is(state.B, state.C)).toBe(false);
    });
  });
});

describe('createMachine', () => {
  const buildMachine = () => {
    const { createMachine, state } = combineStates(
      defineState('Closed'),
      defineState('Open').withData<{ accountId: string }>(),
    );
    return createMachine({
      '*': { reset: () => state.Closed() },
      Closed: {
        opened: (_, p: { accountId: string }) => state.Open(p),
      },
      Open: {
        closed: () => state.Closed(),
        failed: (_, _p: number) => state.Closed(),
      },
    });
  };

  describe('shape', () => {
    it('returns { event, state, transition }', () => {
      const m = buildMachine();
      expect(typeof m.transition).toBe('function');
      expect(typeof m.event).toBe('object');
      expect(typeof m.state).toBe('object');
    });

    it('exposes an event creator for every event name in the tree', () => {
      const { event } = buildMachine();
      expect(Object.keys(event).sort()).toEqual([
        'closed',
        'failed',
        'opened',
        'reset',
      ]);
    });

    it('event creator returns { type } when no payload is defined', () => {
      const { event } = buildMachine();
      expect(event.reset()).toEqual({ type: 'reset' });
    });

    it('event creator returns { type, payload } when a payload is defined', () => {
      const { event } = buildMachine();
      expect(event.opened({ accountId: 'a' })).toEqual({
        type: 'opened',
        payload: { accountId: 'a' },
      });
    });
  });

  describe('tree factory', () => {
    it('accepts a (state) => tree callback', () => {
      const { createMachine } = combineStates(
        defineState('Closed'),
        defineState('Open').withData<{ accountId: string }>(),
      );
      const { transition, event, state } = createMachine(s => ({
        '*': { reset: () => s.Closed() },
        Closed: { opened: (_, p: { accountId: string }) => s.Open(p) },
        Open: { closed: () => s.Closed() },
      }));

      const opened = transition(
        state.Closed(),
        event.opened({ accountId: 'x' }),
      );
      expect(opened.name).toBe('Open');
      expect(opened.is(state.Open) && opened.data).toEqual({ accountId: 'x' });

      const reset = transition(opened, event.reset());
      expect(reset.name).toBe('Closed');
    });

    it('passes the state-creators map to the factory', () => {
      const spy = vi.fn().mockReturnValue({ A: {} });
      const { createMachine, state } = combineStates(defineState('A'));
      createMachine(spy);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(state);
    });

    it('forwards options.onInvalidTransition in factory form', () => {
      const onInvalidTransition = vi.fn();
      const { createMachine, state } = combineStates(
        defineState('A'),
        defineState('B'),
      );
      const { transition, event } = createMachine(
        s => ({ A: { go: () => s.B() }, B: {} }),
        { onInvalidTransition },
      );
      transition(state.B(), event.go());
      expect(onInvalidTransition).toHaveBeenCalledOnce();
    });
  });

  describe('transition', () => {
    it('invokes the per-state handler for the current state', () => {
      const { transition, event, state } = buildMachine();
      const next = transition(state.Closed(), event.opened({ accountId: 'a' }));
      expect(next.name).toBe('Open');
      expect(next.is(state.Open) && next.data).toEqual({ accountId: 'a' });
    });

    it('passes previousData and payload to the per-state handler', () => {
      const { createMachine, state } = combineStates(
        defineState('A').withData<{ n: number }>(),
      );
      const spy = vi.fn((prev: { n: number }, payload: { n: number }) =>
        state.A({ n: prev.n + payload.n }),
      );
      const m = createMachine({ A: { add: spy } });
      const next = m.transition(state.A({ n: 1 }), m.event.add({ n: 2 }));
      expect(spy).toHaveBeenCalledWith({ n: 1 }, { n: 2 });
      expect(next.is(state.A) && next.data).toEqual({ n: 3 });
    });

    it('falls back to the "*" cross-state handler when no per-state handler matches', () => {
      const { transition, event, state } = buildMachine();
      // Open has no `reset` handler — `*` should catch it.
      const start = state.Open({ accountId: 'a' });
      const next = transition(start, event.reset());
      expect(next.name).toBe('Closed');
    });

    it('does not pass previousData to "*" cross-state handlers', () => {
      const { createMachine, state } = combineStates(
        defineState('A').withData<{ n: number }>(),
        defineState('B'),
      );
      const crossSpy = vi.fn((..._args: unknown[]) => state.B());
      const m = createMachine({
        '*': { go: crossSpy },
        A: {},
        B: {},
      });
      const next = m.transition(state.A({ n: 1 }), m.event.go());
      // Cross-state handler signature is (...payload) — no previousData arg.
      // With a no-payload event, it should be called with no args.
      expect(crossSpy).toHaveBeenCalledWith(undefined);
      expect(next.name).toBe('B');
    });

    it('returns the current state when no handler matches the event', () => {
      const { transition, event, state } = buildMachine();
      const start = state.Open({ accountId: 'a' });
      // 'opened' is only handled in Closed; in Open it falls through.
      const next = transition(start, event.opened({ accountId: 'b' }));
      expect(next).toBe(start);
    });

    it('calls the default invalid-transition logger on console.error when no handler matches', () => {
      const { transition, event, state } = buildMachine();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      transition(
        state.Open({ accountId: 'a' }),
        event.opened({ accountId: 'b' }),
      );
      expect(errSpy).toHaveBeenCalledWith(
        "Invalid transition: event 'opened' not allowed in state 'Open'",
      );
      errSpy.mockRestore();
    });

    it('calls a user-provided onInvalidTransition callback when no handler matches', () => {
      const { createMachine, state } = combineStates(
        defineState('A'),
        defineState('B'),
      );
      const cb = vi.fn();
      const m = createMachine(
        {
          A: { go: () => state.B() },
          B: {},
        },
        { onInvalidTransition: cb },
      );
      const start = state.B();
      m.transition(start, m.event.go());
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({
        state: start,
        event: m.event.go(),
      });
    });
  });
});

import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { combineStates, defineState, is } from '../../src';
import { toCollectionStore } from '../../src/adapters/zustand';

const makeFetchMachine = () => {
  const { createMachine } = combineStates(
    defineState('Idle'),
    defineState('Loading'),
    defineState('Success').withData<{ value: string }>(),
    defineState('Failure').withData<{ error: string }>(),
  );
  return createMachine(state => ({
    Idle: { fetch: () => state.Loading() },
    Loading: {
      resolved: (_, value: string) => state.Success({ value }),
      rejected: (_, error: string) => state.Failure({ error }),
    },
    Success: { refetch: () => state.Loading() },
    Failure: { retry: () => state.Loading() },
  }));
};

const makeJobMachine = () => {
  const { createMachine } = combineStates(
    defineState('Queued', 'Running', 'Done').withData<{
      id: string;
      n: number;
    }>(),
  );
  return createMachine(state => ({
    Queued: { start: data => state.Running(data) },
    Running: { progress: (data, n: number) => state.Running({ ...data, n }) },
    Done: { finish: data => state.Done(data) },
  }));
};

describe('toCollectionStore', () => {
  describe('explicit id', () => {
    const setup = () => {
      const machine = makeFetchMachine();
      const store = createStore(toCollectionStore(machine));
      return { machine, store };
    };

    it('starts with an empty collection', () => {
      const { store } = setup();
      expect(store.getState().collection).toEqual({});
    });

    it('addEntity stores the state keyed by the given id', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      expect(store.getState().collection).toEqual({ a: { name: 'Idle' } });
    });

    it('one method per event drives transitions on the targeted entity', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      store.getState().addEntity('b', machine.state.Idle());
      store.getState().fetch('a');
      store.getState().resolved('a', 'x');
      expect(store.getState().collection['a']).toEqual({
        name: 'Success',
        data: { value: 'x' },
      });
      // "b" untouched
      expect(store.getState().collection['b']).toEqual({ name: 'Idle' });
    });

    it('replaces the entity — no stale data when a state drops data', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      store.getState().fetch('a');
      store.getState().resolved('a', 'x');
      store.getState().refetch('a'); // Success -> Loading
      expect(store.getState().collection['a']).toEqual({ name: 'Loading' });
    });

    it('a transition on an unknown id is a no-op', () => {
      const { store } = setup();
      store.getState().fetch('missing');
      expect(store.getState().collection).toEqual({});
    });

    it('removeEntity deletes', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      store.getState().removeEntity('a');
      expect(store.getState().collection).toEqual({});
    });

    it('is() narrows a stored entity', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      store.getState().fetch('a');
      store.getState().resolved('a', 'hi');
      const entity = store.getState().collection['a'];
      expect(is(entity!, machine.state.Success)).toBe(true);
    });
  });

  describe('data id (selectIdFromData)', () => {
    const setup = () => {
      const machine = makeJobMachine();
      const store = createStore(
        toCollectionStore(machine, { selectIdFromData: data => data.id }),
      );
      return { machine, store };
    };

    it('derives the id from the state data on add (no entityId arg)', () => {
      const { machine, store } = setup();
      store.getState().addEntity(machine.state.Queued({ id: 'j1', n: 0 }));
      expect(Object.keys(store.getState().collection)).toEqual(['j1']);
      store.getState().start('j1'); // Queued -> Running
      store.getState().progress('j1', 5);
      expect(store.getState().collection['j1']).toEqual({
        name: 'Running',
        data: { id: 'j1', n: 5 },
      });
    });

    it('removeEntity deletes by the derived id', () => {
      const { machine, store } = setup();
      store.getState().addEntity(machine.state.Queued({ id: 'j1', n: 0 }));
      store.getState().removeEntity('j1');
      expect(store.getState().collection).toEqual({});
    });
  });

  describe('nestingPath', () => {
    const setup = () => {
      const machine = makeFetchMachine();
      const store = createStore(
        toCollectionStore(machine, { nestingPath: 'entities.fetches' }),
      );
      return { machine, store };
    };

    it('stores the collection at the nested path and operates through it', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      store.getState().fetch('a');
      store.getState().resolved('a', 'x');
      expect(store.getState().entities.fetches['a']).toEqual({
        name: 'Success',
        data: { value: 'x' },
      });
    });

    it('removeEntity deletes through the nested path', () => {
      const { machine, store } = setup();
      store.getState().addEntity('a', machine.state.Idle());
      store.getState().removeEntity('a');
      expect(store.getState().entities.fetches).toEqual({});
    });
  });

  describe('adjust', () => {
    const setup = () => {
      const machine = makeJobMachine();
      const store = createStore(
        toCollectionStore(machine, {
          nestingPath: 'jobs',
          selectIdFromData: data => data.id,
          adjust: ({ collection, eventActions, lifecycleActions, set }) => ({
            jobs: collection,
            ...eventActions,
            addJob: lifecycleActions.addEntity,
            removeJob: lifecycleActions.removeEntity,
            resetJobs: () => set({ jobs: {} }),
          }),
        }),
      );
      return { machine, store };
    };

    it('reshapes the slice and rebinds lifecycle + event actions', () => {
      const { machine, store } = setup();
      store.getState().addJob(machine.state.Queued({ id: 'j1', n: 0 }));
      store.getState().start('j1');
      expect(store.getState().jobs['j1']).toEqual({
        name: 'Running',
        data: { id: 'j1', n: 0 },
      });
      store.getState().removeJob('j1');
      expect(store.getState().jobs).toEqual({});
    });

    it('custom methods built from set work', () => {
      const { machine, store } = setup();
      store.getState().addJob(machine.state.Queued({ id: 'j1', n: 0 }));
      store.getState().resetJobs();
      expect(store.getState().jobs).toEqual({});
    });
  });
});

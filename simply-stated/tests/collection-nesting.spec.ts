import { describe, expect, it } from 'vitest';
import {
  combineStates,
  defineState,
  forwardCollectionEvent,
  is,
  type StateCollection,
} from '../src';

const makeJobMachine = () =>
  combineStates(
    defineState('Queued', 'Running', 'Done').withData<{
      id: string;
      percentage: number;
    }>(),
  ).createMachine(state => ({
    Queued: { started: data => state.Running(data) },
    Running: {
      progressed: (data, percentage: number) =>
        state.Running({ ...data, percentage }),
      finished: data => state.Done(data),
    },
    Done: {},
  }));

type Jobs = StateCollection<ReturnType<typeof makeJobMachine>['state']>;

const makeWorkflowMachine = () => {
  const jobs = makeJobMachine();
  const machine = combineStates(
    defineState('Working').withData<{ jobs: Jobs }>(),
  ).createMachine(state => ({
    Working: {
      ...forwardCollectionEvent(jobs, state.Working, data => data.jobs),
    },
  }));
  return { jobs, machine };
};

describe('forwardCollectionEvent', () => {
  it('exposes a handler per inner event, each addressing one element by id', () => {
    const { jobs, machine } = makeWorkflowMachine();
    expect(Object.keys(machine.event).sort()).toEqual([
      'finished',
      'progressed',
      'started',
    ]);

    const start = machine.state.Working({
      jobs: {
        a: jobs.state.Queued({ id: 'a', percentage: 0 }),
        b: jobs.state.Queued({ id: 'b', percentage: 0 }),
      },
    });

    const next = machine.transition(start, machine.event.started({ id: 'a' }));

    expect(next.data.jobs.a.name).toBe('Running');
    expect(next.data.jobs.b.name).toBe('Queued');
  });

  it('forwards a payload-carrying inner event', () => {
    const { jobs, machine } = makeWorkflowMachine();
    const start = machine.state.Working({
      jobs: { a: jobs.state.Running({ id: 'a', percentage: 0 }) },
    });

    const next = machine.transition(
      start,
      machine.event.progressed({ id: 'a', payload: 75 }),
    );

    expect(next.data.jobs.a).toEqual(
      jobs.state.Running({ id: 'a', percentage: 75 }),
    );
  });

  it('leaves sibling elements reference-equal and preserves order', () => {
    const { jobs, machine } = makeWorkflowMachine();
    const siblingB = jobs.state.Queued({ id: 'b', percentage: 0 });
    const start = machine.state.Working({
      jobs: {
        a: jobs.state.Queued({ id: 'a', percentage: 0 }),
        b: siblingB,
      },
    });

    const next = machine.transition(start, machine.event.started({ id: 'a' }));

    expect(next.data.jobs.b).toBe(siblingB);
    expect(Object.keys(next.data.jobs)).toEqual(['a', 'b']);
  });

  it('is a no-op for an unknown id', () => {
    const { jobs, machine } = makeWorkflowMachine();
    const start = machine.state.Working({
      jobs: { a: jobs.state.Queued({ id: 'a', percentage: 0 }) },
    });

    const next = machine.transition(
      start,
      machine.event.started({ id: 'missing' }),
    );

    expect(next).toEqual(start);
  });

  it('leaves the element unchanged for an invalid inner event', () => {
    const { jobs, machine } = makeWorkflowMachine();
    const doneJob = jobs.state.Done({ id: 'a', percentage: 100 });
    const start = machine.state.Working({ jobs: { a: doneJob } });

    const next = machine.transition(start, machine.event.started({ id: 'a' }));

    expect(next.data.jobs.a).toEqual(doneJob);
  });

  it('does not mutate the input data or collection', () => {
    const { jobs, machine } = makeWorkflowMachine();
    const inputJobs = { a: jobs.state.Queued({ id: 'a', percentage: 0 }) };
    const start = machine.state.Working({ jobs: inputJobs });

    machine.transition(start, machine.event.started({ id: 'a' }));

    expect(inputJobs.a.name).toBe('Queued');
    expect(start.data.jobs).toBe(inputJobs);
  });

  it('writes back through a selector path deeper than the top level', () => {
    const jobs = makeJobMachine();
    const machine = combineStates(
      defineState('Working').withData<{ nested: { jobs: Jobs } }>(),
    ).createMachine(state => ({
      Working: {
        ...forwardCollectionEvent(
          jobs,
          state.Working,
          data => data.nested.jobs,
        ),
      },
    }));

    const start = machine.state.Working({
      nested: { jobs: { a: jobs.state.Queued({ id: 'a', percentage: 0 }) } },
    });

    const next = machine.transition(start, machine.event.started({ id: 'a' }));

    expect(is(next.data.nested.jobs.a, jobs.state.Running)).toBe(true);
  });
});

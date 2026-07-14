import {
  combineStates,
  defineState,
  type EventOf,
  type StateOf,
} from 'simply-stated';
import { jobMachine } from '../example-machines';

type JobState = StateOf<typeof jobMachine.state>;
type JobId = JobState['data']['id'];

const _workflowMachine = combineStates(
  defineState('Idle'),
  defineState('Working', 'Completed').withData<{
    jobs: Record<JobId, JobState>;
  }>(),
).createMachine(state => ({
  Idle: {
    scheduled: (_, job: JobState) =>
      state.Working({
        jobs: {
          [job.data.id]: job,
        },
      }),
  },
  Working: {
    scheduled: ({ jobs }, job: JobState) =>
      state.Working({
        jobs: {
          ...jobs,
          [job.data.id]: job,
        },
      }),

    updateJob: (
      { jobs },
      {
        id,
        event,
      }: {
        id: JobId;
        event: EventOf<typeof jobMachine.event>;
      },
    ) => {
      if (!jobs[id]) return state.Working({ jobs });

      const nextJob = jobMachine.transition(jobs[id], event);
      const nextJobs = {
        ...jobs,
        [nextJob.data.id]: nextJob,
      };

      const allJobsDone = Object.values(nextJobs).every(j => j.name === 'Done');
      return allJobsDone
        ? state.Completed({ jobs: nextJobs })
        : state.Working({ jobs: nextJobs });
    },
  },
  Completed: {},
}));

import {
  combineStates,
  defineState,
  forwardCollectionEvent,
  type StateCollection,
  type StateOf,
} from 'simply-stated';
import { jobMachine } from '../example-machines';

// Helper-driven counterpart to `workflow.ts`. `forwardCollectionEvent` replaces
// the hand-rolled `updateJob` handler: like `forwardEvents`, it returns one
// handler per inner event, each addressing one job by id, running the job
// machine's `transition`, and writing the element back into the collection.
//
// The helper keeps the outer state (`Working`) — it does not branch on the
// aggregate result, so the manual example's `Working -> Completed` transition
// (fired once every job is `Done`) stays hand-written. The helper covers only
// the element-update half.

type JobState = StateOf<typeof jobMachine.state>;
type Jobs = StateCollection<typeof jobMachine.state, 'id'>;

const _workflowMachine = combineStates(
  defineState('Idle'),
  defineState('Working').withData<{ jobs: Jobs }>(),
).createMachine(state => ({
  Idle: {
    scheduled: (_, job: JobState) =>
      state.Working({ jobs: { [job.data.id]: job } }),
  },
  Working: {
    scheduled: ({ jobs }, job: JobState) =>
      state.Working({ jobs: { ...jobs, [job.data.id]: job } }),

    // started(id) / progressed({ id, payload }) / finished(id)
    ...forwardCollectionEvent(jobMachine, state.Working, ({ jobs }) => jobs),
  },
}));

// The game's own simulation code. When deploying, this file points at the same
// files pinned to a commit (see README), so the server runs exactly this code.
export { runReplay } from '../../../src/core/replay.ts';
export type { Replay, ReplayResult } from '../../../src/core/replay.ts';
export { dailySeed, jstDateKey } from '../../../src/core/daily.ts';
export { STEP } from '../../../src/core/sim.ts';

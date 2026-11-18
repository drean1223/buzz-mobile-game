# submit-score

Edge function for the daily ranking. It re-runs the submitted replay with the
game's own `src/core` code, so only scores that can really happen in the game
are stored (the score the client claims is never trusted).

`deps.ts` imports `src/core` by relative path for local tests
(`node tools/fn-test.ts`). The deployed copy of `deps.ts` imports the same files
from jsDelivr pinned to a commit, e.g.

```ts
const CORE = 'https://cdn.jsdelivr.net/gh/drean1223/buzz-mobile-game@<commit>/src/core';
export { runReplay } from `${CORE}/replay.ts`; // (written out per line)
```

Redeploy whenever `src/core` changes, or old clients' replays and the server
will disagree. Deploy with `verify_jwt` off (the function checks its input itself).

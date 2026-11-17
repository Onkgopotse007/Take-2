# @take2/madagascar

Pure rules engine for Madagascar, the second game on the table. No I/O. The rules are in the "Madagascar" section of the repo's CLAUDE.md.

```ts
import { createSeededRng } from '@take2/engine';
import { createGame, applyMove, getPlayerView } from '@take2/madagascar';

let state = createGame(['thabo', 'neo', 'kago'], createSeededRng(42));
const result = applyMove(state, { type: 'turn', player: 'neo', slot: 17 });
if (result.ok) state = result.state;
```

- Phase 1 moves are `{ type: 'turn', slot }` (a slot in the face-down oval); phase 2 moves are `{ type: 'play', cardId }`.
- `forfeit` is a server move for a player who leaves or misses too many turns.
- `applyMove` never mutates its input and needs no RNG: all the randomness is in the shuffle.
- `getPlayerView` hides which card is in which slot and everyone else's hand.
- `ranking` is a list of groups, best first; players in one group share that place (`placeNumbers` gives 1, 1, 3...).

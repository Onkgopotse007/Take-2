# @take2/engine

Pure rules engine for Take 2 / Crusades. No I/O. All randomness comes from an injected `Rng`.

```ts
import { createGame, applyMove, getPlayerView, getLegalMoves, createSeededRng } from '@take2/engine';

const rng = createSeededRng(42);
let state = createGame(['thabo', 'neo', 'kago'], rng);
const result = applyMove(state, { type: 'play', player: 'neo', cardId: '9H' }, rng);
if (result.ok) state = result.state;
else console.log(result.code, result.reason);
```

- `applyMove(state, move, rng)` never mutates `state`. It returns `{ ok: true, state, events }` or `{ ok: false, code, reason }`.
- `getPlayerView(state, playerId)` is what the server sends to one player: their own hand, everyone else's card counts.
- `getLegalMoves(state, playerId)` lists every move that player can make now (useful for highlighting cards).
- Card ids are rank plus suit letter (`10H`, `AS`, `QC`), and `JKR` / `JKB` for the Jokers.

## Moves

| Move | Who | Notes |
| --- | --- | --- |
| `play { cardId, suit?, announce? }` | player to act | `suit` is required for an 8. Set `announce` when the play leaves you with 2 or 1 cards. |
| `pick` | player to act | Facing a 2 or Joker this takes the whole penalty. |
| `pass` | player to act | Keep a playable card you just picked. |
| `callOut { target }` | anyone else | Target picks 2. |
| `toss { picks: [i, j] }` | tossing player | Two indices of the 4 face-down cards. |
| `nextRound` | server | After `roundOver`. |
| `forfeit { player, reason }` | server | The player is out for good (`left` or `missedTurns`). |
| `forceStart` | server | When the start timer runs out during the starting race. A random player picks one card (and may play or keep it if valid), then a random neighbour of theirs plays next. |

## Interpretations of the rules

The spec in `CLAUDE.md` is the source of truth. Rules the owner has since confirmed have been written into it (forced start, Jokers on their own colour, Ace blocks, wrong call-outs, the separate toss deck). Choices the engine still makes on its own:

1. **Burying** puts the card at the bottom of the draw pile.
2. **After an 8** the next card must be the named suit, another 8, or a Joker of that suit's colour.
3. **8s after a taken stack** are still playable, because an 8 is playable on any card when no penalty is pending.
4. **Picking a playable card**: the player chooses to play it or keep it (`pass`). An unplayable pick ends the turn automatically.
5. **Call-out window** closes when it becomes the player's turn again. Being skipped by a 7 does not close it.
6. **Start race ties**: the engine accepts the first valid play it is given. Randomising between near-simultaneous plays is the server's job, as is the start timer that sends `forceStart`.
7. **Forced start**: the starter's picked card follows the normal pick rule, so any card valid on the base (including an 8 or action card) may be played.
8. **Two players**: when one checks, the other is marked eliminated and the checker wins.

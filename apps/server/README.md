# @take2/server

Authoritative Colyseus game server. It owns the deck and every hand, validates each move through `@take2/engine`, and sends each player only what they may see.

```sh
pnpm --filter @take2/server dev     # watch mode on port 2567 (PORT to change)
pnpm --filter @take2/server test
```

`GET /healthz` returns `{ "ok": true }` for Kubernetes probes.

## Joining

- `client.create('table', { name })` makes a table. Its `roomId` is the 5-character join code (no 0, O, 1, I or L).
- `client.joinById(code, { name })` joins it. Share links as `/<code>` and normalise typed codes to upper case.
- After registering handlers, send `sync` once to get a fresh snapshot (one sent during the join can arrive before handlers exist).
- Keep `room.reconnectionToken` (for example in `sessionStorage`). After a drop or reload, `client.reconnect(token)` restores the same seat and hand. Seats are held for 2 minutes.
- Tables lock when a game starts. Reconnection still works; new players can join again once the game has finished.

## Messages

See `src/protocol.ts` for the types the client should import.

| Client sends | Payload |
| --- | --- |
| `start` | `{}`. Host only. Also starts a rematch after a finished game. |
| `move` | An engine move without `player`, e.g. `{ type: 'play', cardId: '9H', announce: true }`. |
| `sync` | `{}`. Reply is a `table` snapshot. |

| Server sends | Payload |
| --- | --- |
| `table` | `TableSnapshot`: seats, host, status, this player's `PlayerView`, `raceOpensAt`, `deadline`, `serverNow`. |
| `events` | Public `GameEvent[]` for animations and the log. Never contains hidden cards. |
| `rejected` | `{ code, reason }` with a British English reason. |

## Timing

All timers run on the server clock (`src/table.ts`, `DEFAULT_TIMINGS`):

| Timer | Default | What happens |
| --- | --- | --- |
| Countdown | 3 s | After dealing. Starting plays before it ends are refused. |
| Start tie window | 150 ms | Starting plays within this of the first one tie; one wins at random. |
| Start timeout | 15 s | Nobody started: a random player picks (and may play), a random neighbour goes next. |
| Turn | 10 s | Out of time: keep the picked card, otherwise pick (taking any penalty). |
| Disconnected turn | 5 s | Turn time for a player who has dropped. |
| Toss | 20 s | Out of time: two random cards are picked. |
| Round break | 10 s | Between rounds. Interstitial ads will go here. |

Randomness uses `node:crypto`. A small seeded RNG could be brute-forced from an observed deal.

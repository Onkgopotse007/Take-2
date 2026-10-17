# @take2/client

Mobile-first Vite + React client. Talks to the game server at `<same origin>/api` (Vite proxies it in development, Caddy in production). Set `VITE_SERVER_URL` to point elsewhere.

```sh
pnpm --filter @take2/server dev   # game server on :2567 (set PORT in apps/server/.env to change it)
pnpm --filter @take2/client dev   # http://localhost:5173 (also on your Wi-Fi IP, for testing on a phone)
pnpm --filter @take2/client test
pnpm --filter @take2/client build # static files in dist/
```

## How it plays

- **Join:** start a table or type a 5-character code. Links look like `/K7MPX`; opening one asks for a name, then joins.
- **Play a card:** tap it to lift it, tap it again to play. An 8 then asks for the next suit.
- **Pick:** tap the draw pile. Facing a 2 or Joker, that takes the whole penalty. After picking a playable card, play it or tap **Keep it**.
- **Announce:** tap **Announce** before the play that leaves you with 2 or 1 cards. It never lights up to remind you.
- **Call out:** tap a player, then **Call out**. Nothing shows who forgot to announce; you have to notice.
- **Hand:** sorted hearts, clubs, diamonds, spades, A to K, Jokers last. Cards you could play sit slightly raised.
- **Reconnect:** the reconnection token is kept per tab, so a reload or dropped connection rejoins the same seat.

The installable PWA (manifest and service worker) is in place, but browsers only install it over HTTPS, so it switches on once the game has a domain.

# Take 2 / Crusades: multiplayer web game

A real-time multiplayer web version of Take 2 (also called Crusades), a card game played across Botswana. Players join a room by code or link, mostly on phones. Revenue later comes from ads (Google AdSense H5 Games Ads).

Use British English in all user-facing text. Do not use em-dashes in UI copy.

## Open decisions (defaults until the owner says otherwise)

- **Repo:** new GitHub repo named `take2`.
- **Domain:** none yet. Serve over plain HTTP on the VM's IP (`140.238.81.209`) until a domain is added. HTTPS, the installable PWA and AdSense all need a domain, so design for it from the start.

## Stack

- **Monorepo** (pnpm workspaces), TypeScript everywhere.
  - `packages/engine`: pure rules engine. No I/O, no randomness except through an injected RNG. Fully unit tested (Vitest).
  - `apps/server`: Colyseus game server (Node 20+). Authoritative: it owns the deck and all hands, validates every move, and sends each player only their own cards.
  - `apps/client`: Vite + React, mobile-first, installable PWA, light on data.
- **Deployment:** k3s on an Oracle Cloud VM (details below), arm64 images.

## Build order

1. **Engine.** State + move -> new state or a typed rejection. One test per rule below, plus full simulated games with a seeded RNG. Done when every rule in this file has a passing test.
2. **Server.** Rooms with join codes, reconnect on dropped connections, server-clock start race, hidden hands.
3. **Client.** Lobby, table view, hand, pick button, announce button, call-out button, suit picker for 8s, toss screen.
4. **Deploy** to the VM (see Deployment).
5. **Ads** (after a domain exists): interstitial between rounds, optional rewarded ad for cosmetics (card backs). Never show ads during active play.

## Rules specification

This is the source of truth for the engine.

### Setup
- 2 to 10 players. One 52-card deck plus two Jokers (one red, one black).
- Deal 4 cards each. Remaining cards form the draw pile.
- Turn one card face up as the base. It must be an ordinary card: if it is A, 2, 7, 8, J, Joker or K, bury it in the draw pile and draw another.

### Card types
- **Ordinary cards:** 3, 4, 5, 6, 9, 10, Q. Also K when 3 or more players remain.
- **Action cards:** A, 2, 7, 8, J, Joker. Also K when exactly 2 players remain.
- A K can never be the base card or a check card, regardless of player count.

### Starting play
- No fixed first player. Any player holding an ordinary card matching the base's suit or number may play first. The first valid play received by the server wins; ties are broken at random.
- No fixed direction. After the first play, whichever neighbour of the starter (left or right) acts first, by playing or picking, sets the direction.

### A turn
- Play exactly one card, or pick exactly one card. Never more than one card per turn.
- A normal play must match the top card's suit or number (8s are the exception, see below).
- A player may pick even when holding a playable card.
- After picking, the player may play the picked card if it is valid, and no other card. Otherwise the turn ends.

### Action cards
| Card | Effect |
| --- | --- |
| A | Blocks a 2 or Joker played against you, in any suit or colour. When not blocking, it must match suit or number. |
| 2 | Next player picks 2 and misses their turn, unless they block or stack. |
| 7 | Skips the next player. With 2 players: play again. |
| 8 | Playable on any card during your turn. The player names the suit to be played next. Not playable when facing an unblocked 2 or Joker. |
| J | Reverses direction. With 2 players: play again. |
| K | With 2 players: play again. With 3+ players: ordinary card. |
| Joker | Next player picks 5 and misses their turn, unless they block or stack. |

### Stacking and blocking
- Facing a 2 or Joker, a player may: block with an Ace (any suit), stack a 2 or Joker (any suit or colour), or take the penalty (pick the total and miss the turn).
- Penalties accumulate: each 2 adds 2, each Joker adds 5. Example: 2 then Joker = pick 7.
- What may be played next:
  - After an Ace block: same suit as the Ace.
  - After a taken stack topped by a 2: same suit as that 2, or another 2.
  - After a taken stack topped by a Joker: same colour as that Joker, or another Joker.

### Announcements
- A player must announce "2 cards" or "1 card" before playing the card that leaves them with that many.
- If they don't, any other player may call them out until play returns to them. Penalty: pick 2.
- UI: an announce button before playing, and a call-out button on other players.

### Ending a round
- A player **checks** by playing their last card when it is an ordinary card (never an action card or K).
- **Card on air:** if a player's last card is an action card, they play it and hold zero cards. On their next turn they must pick one card, then play normally: check if valid, play an action card (staying on air), or keep it.
- If another player checks while someone is on air, the on-air player draws one card, which counts towards their points.

### Scoring
- When a player checks, every other player totals their hand. Points do not carry between rounds.

| Card | Points |
| --- | --- |
| 2 to 7, 9, 10 | Face value |
| J, Q, K | 10 |
| A | 11 |
| 8 | 24 |
| Joker | 50 |

- Over 15: eliminated. Under 15: survives.
- Exactly 15: **toss**. The hand is ignored. Lay out 4 fresh face-down cards, at least one of which is an 8 or Joker. The player picks 2. Under 15 survives, over 15 is out, exactly 15 tosses again.

### Winning
- Survivors play another round until one player remains, who wins.
- If every other player is eliminated in one round, the checker wins.
- With 2 players left, the game ends as soon as one checks; the checker wins.

### Running out of cards
- When the draw pile is empty, shuffle the played cards except the top base card into a new draw pile.
- If there still aren't enough cards for a pick, the player picks whatever is available and play continues.

## Deployment

### VM
- Oracle Cloud, `uk-london-1`, shape `VM.Standard.A1.Flex` (4 Ampere cores, 24 GB), Ubuntu 24.04 **aarch64**.
- SSH: `ssh -i ~/.ssh/instapula_uk ubuntu@140.238.81.209`
- Disk: about 33 GB free.

### Shared cluster: do not disturb
- k3s is already running another project in the `instapula` namespace. Never modify anything outside the `take2` namespace.
- Traefik and k3s servicelb are disabled. Do not re-enable them or change the k3s config.
- Docker 29 is installed; Docker Compose is not. Use k3s, not Compose.

### Plan
- All game resources live in namespace `take2`.
- A Caddy Deployment with `hostPort` 80 and 443 fronts the game: serves the client files and proxies WebSocket traffic to the server Service. Once a domain exists, Caddy handles HTTPS certificates automatically.
- Build `linux/arm64` images on the owner's Mac (Apple Silicon, so native arm64). Initially ship without a registry: `docker save <image> | ssh -i ~/.ssh/instapula_uk ubuntu@140.238.81.209 sudo k3s ctr images import -`. Move to GHCR later.

### Firewall (must be opened before the game is reachable)
- VM iptables currently rejects everything except SSH (final REJECT rule). Insert ACCEPT rules for TCP 80 and 443 **before** the REJECT rule, then persist them with `sudo netfilter-persistent save`.
- Oracle console: add ingress rules for TCP 80 and 443 to the security list of VCN `instapula-uk`.

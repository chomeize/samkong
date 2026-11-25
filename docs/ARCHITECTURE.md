# 3 กอง: Architecture & Implementation Plan

## 1. System Architecture

```
┌──────────────────────┐        WSS (Socket.IO)         ┌──────────────────────────┐
│ apps/web             │  ───── actions (typed) ─────▶  │ apps/server              │
│ React + Vite + TS    │  ◀──── public state ────────   │ Express + Socket.IO      │
│ Tailwind, dnd-kit,   │  ◀──── private hand (own) ──   │ RoomStore (in-memory)    │
│ Motion, Zustand      │                                │ State machine, timers    │
└─────────┬────────────┘                                └────────────┬─────────────┘
          │ imports (UX-only validation)                            │ imports (authoritative)
          ▼                                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ packages/engine  (pure TypeScript, no I/O)                                       │
│ deck + secure shuffle · hand evaluation · tie-break · foul check · pairwise      │
│ scoring · scoop · royalty config · auto arrange                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────┐
│ packages/protocol  event names, payload interfaces, public/private DTOs, i18n    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- The server is the single source of truth. It shuffles with `crypto.getRandomValues`, deals,
  validates every submitted arrangement against the dealt cards, evaluates hands and computes scores.
- Each socket joins a per-player channel. Dealt cards are sent only to their owner. Other players'
  hands leave the server only after the room enters `REVEALING`.
- The client uses the same engine for live feedback (hand names, foul warning, auto arrange preview).
  Nothing the client computes is trusted.
- `RoomStore` is an interface; the MVP implementation is in-memory, so Redis/SQLite can replace it later.

## 2. Folder Structure

```
packages/engine/      src/{cards,evaluate,arrangement,royalty,scoring,autoArrange}.ts + test/
packages/protocol/    src/{events,dto,settings,i18n}.ts
apps/server/          src/{index,config,store,room,gameMachine,timers,session,rateLimit,handlers}.ts + test/
apps/web/             src/{main,App}.tsx, src/{pages,components,store,socket,i18n,sound}/
docs/                 ARCHITECTURE.md
```

## 3. Game State Flow

```
LOBBY ──start_game (host, ≥2, all READY)──▶ DEALING ──▶ ARRANGING
ARRANGING ──first confirm──▶ WAITING_FOR_CONFIRMATION
WAITING_FOR_CONFIRMATION ──all confirmed | timer expired──▶ REVEALING ──▶ SCORING ──▶ ROUND_RESULT
ROUND_RESULT ──next_round (host, rounds left)──▶ DEALING
ROUND_RESULT ──end_game (host) | last round──▶ GAME_FINISHED
GAME_FINISHED ──play_again──▶ DEALING (scores reset)   ──back_to_lobby──▶ LOBBY
```

Player state: `NOT_READY → READY → ARRANGING → CONFIRMED | AUTO_SUBMITTED`.
Connection (`ONLINE`/`OFFLINE`) is stored separately and never overwrites player state.
Every handler checks the current state first, so duplicate start/confirm/next-round calls are rejected.
Scores are applied once per round, keyed by round id.

## 4. Decisions on points the spec leaves open

These follow the spec's wording. Confirm or change them before Phase 3.

1. **Foul with Scoop Bonus off.** Foul still costs a fixed 6 per clean opponent (spec 4.3 / AC-05),
   even though a clean sweep is only +3 when Scoop is off. `foulPenalty` is a setting in the engine.
2. **Play Again** starts a new game right away with the same players and resets scores; nobody has to press Ready again.
3. **Leaving mid-round.** The player is auto-arranged and auto-submitted for that round, then removed
   after the round. If fewer than 2 players remain, the room returns to LOBBY.
4. **Royalty when both players foul.** The pair scores 0, royalty included.
5. **Front vs middle comparison.** Same category scale; rank vectors are padded with 0 (spec 3.4).
6. **Deployment.** Config files for Netlify and Railway are provided; deploying uses your own accounts.
7. **Host and Ready.** Start Game needs every *other* player to be READY; the host pressing Start counts as their own ready.
8. **Settings change clears Ready.** Any real settings change in the lobby sets every player back to NOT_READY so everyone agrees to the new rules.
9. **Session check.** The session token is verified when a socket joins or reconnects, and that socket is bound to the player. Every later action checks the binding is still that player's current socket. The token isn't resent with each action.

10. **Mobile-first UI.** Single column from 360px; every primary action sits in a bottom bar that clears the iPhone home indicator; dialogs are bottom sheets. Card size follows both screen width and height so the three rows, all 13 cards and Confirm fit on one phone screen. Cards set `touch-action: none` so dragging never scrolls the page; touch drag starts after a 120ms hold, so quick taps stay taps.
11. **Tap to place.** Tap several cards in the hand, then tap a row to place them all at once. Tap a card in a row while one card is selected to swap them. Drag and drop works too.
12. **One session per tab.** The tab's session lives in sessionStorage, so a refresh restores it and two tabs can be two players. The home page offers "back to my room" from a copy in localStorage.
13. **Final round.** When the last configured round is scored, the room goes straight to GAME_FINISHED; players can still open that round's result from the final screen.

14. **Timer grace.** Players see `deadlineAt`; the server auto-submits 750ms later so a confirm sent in the last second still counts. Clients save their draft 2 seconds before the deadline, so the auto-submit uses what they actually arranged when it's complete and not fouled.
15. **Reactions** are a fixed list of emoji and quick-message ids (no free text), limited to 4 per burst per player, refilling 30 per minute.
16. **Sounds** are synthesised with Web Audio (no files) and remembered per device. Phones only allow audio after the first tap.

17. **Landscape table.** Home, create/join, lobby and the final screen are portrait pages. Arranging, waiting and the round result are a full-screen landscape card table. A phone held upright during a round sees a "rotate your phone" prompt (with a fullscreen-landscape button where the browser allows it, e.g. Android Chrome).
18. **Staged reveal.** The result plays front → middle → back (about 1.8s each), lifting the pile in play with its hand type and points, then shows totals. It can be skipped, and it plays once per round (returning to it shows the summary).

## 5. Edge cases to cover

- Host leaves in LOBBY → host moves to the next player by join order.
- A kicked player's session token is invalidated. Without accounts they could join again under a new nickname while the room is still in LOBBY; the host can kick again.
- Two tabs with the same session token: the newest socket wins and the old one is told to close.
- Timer expiry and the last confirm arriving together: guarded by state check, so reveal runs once.
- Nickname collision is checked case-insensitively after trimming and normalising whitespace.
- Room code collisions are retried; codes avoid look-alike characters (0/O, 1/I).
- Room with nobody online expires after 30 minutes.

## 6. Implementation Plan

| Phase | Scope | Done when |
|---|---|---|
| 1 | Engine: deck, secure shuffle, evaluation, tie-break, foul, pairwise scoring, scoop, royalty, auto arrange | Vitest covers AC-04/AC-05, typecheck clean |
| 2 | Server rooms, sessions, lobby, Socket.IO events, protocol types | Integration tests with real sockets |
| 3 | Web: home, create/join, lobby, arrange (dnd-kit + tap), confirm, reveal, results, leaderboard, next round, end game | 2–4 browsers play full games |
| 4 | Timer + timeout logic, reconnect, host transfer, royalty UI, reactions, sound, animation | AC-06, AC-07 pass |
| 5 | Responsive pass (360px+), security/rate limits, README, `.env.example`, deploy config | AC-08 pass, build clean |

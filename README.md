# Tic Tac Cool

Power-up tic-tac-toe with online multiplayer, hotseat, chat, series scoring, and flashy power-move animations.

## Features

- **Online rooms** with 6-character codes and shareable invite links (`/room/CODE`)
- **Solo vs Bot** with Easy / Medium / Hard / Expert
- **Hotseat** mode on one device
- **Resume mid-game** — room state is persisted to `data/rooms.json`; reopen the invite link
- **In-game chat**
- **Record keeper** — wins, losses, streaks per seat; career stats in `localStorage`
- **First-to-N** series (adjustable in lobby / between rounds by the host)
- **Alternate openings** — whoever was X last round becomes O next (and vice versa)
- **Smooth Framer Motion** FX when powers fire


## Energy & powers

- Start each round at **50 ⚡** (max 100). Gain **+10 ⚡** at the start of your turn.
- Every power costs energy and can be used **once per game (round)**.
- Powers do **not** end your turn — place a mark afterward.
- **Double Place** unlocks only on a **4×4** board.
- **Double Expansion** unlocks only after **Expansion** has been used this round; costs **all** remaining energy and grows to **5×5**.

| Power | Cost | Effect |
| --- | ---: | --- |
| 🥾 Boot | 15 | Remove one opponent tile |
| ⚡ Lightning | 20 | Remove a random opponent tile |
| 🛡️ Shield | 20 | Protect one of your tiles until your next turn |
| 🔄 Swap | 25 | Swap your tile with an opponent tile |
| 🔒 Lock | 25 | Block an empty cell until your next turn begins again |
| 🪞 Mirror | 25 | Flip the board left ↔ right |
| 🧹 Broom | 30 | Erase a row or column |
| ↔️ Column Switch | 30 | Shuffle column order |
| ↕️ Row Switch | 30 | Shuffle row order |
| 🔇 Silence | 30 | Opponent cannot use powers next turn |
| ✨ Double Place | 35 | Place two marks (4×4 only) |
| ⏪ Time Warp | 35 | Undo opponent’s last place |
| ⬇️ Gravity | 35 | Marks fall toward a chosen edge |
| 💣 Bomb | 35 | Clear a 2×2 block |
| 🧬 Clone | 40 | Copy opponent mark onto an empty cell as yours |
| 🌪️ Tornado | 40 | Shuffle all tiles |
| 📐 Expansion | 45 | Grow board to 4×4 |
| 🚀 Double Expansion | ALL ⚡ | Grow to 5×5 (need 5 in a row); unlocks after Expansion |


## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production:

```bash
npm run build
npm start
```

## Install (PWA)

- **Android / Chrome:** open the site → **Install app** banner, or browser menu → **Install app** / **Add to Home screen**.
- **iPhone / Safari:** Share → **Add to Home Screen**.
- Offline shell is cached; multiplayer/bot play still needs network.

## Solo vs Bot

1. On the home page pick **Easy / Medium / Hard / Expert**.
2. Set first-to-N, then **Play vs … bot**.
3. You are **X**; the bot is **O**. Series score and streaks work the same as multiplayer.
4. System chat lines note when the bot fires a power (animations still play).

## Turn notifications

Enable browser notifications when prompted (or from the banner). You’ll get a notification,
beep, and title flash when it becomes your turn in online/bot games — including after rejoin.

## Async online play

Online rooms are **turn-based async**. The host can **Start** and play before the guest opens the invite —
when they join, they see the board and turn as it is. Only one player needs to be connected to take their turn.
Leave anytime — reopen the same `/room/CODE` link on the **same browser/device** to resume
exactly where you left off (board, energy, used powers, whose turn, series score, chat).

## Invite flow

1. Create an **online** room on the home page (set first-to-N).
2. Copy the invite link or share the room code.
3. Friend opens the link (or enters the code) on another device/browser.
4. Host taps **Start match**.
5. Either player can leave and reopen the same `/room/CODE` link to resume.

## Env vars

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + Socket.IO port |
| `HOSTNAME` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` / `production` | Set by `npm start` |

No API keys required — realtime is self-hosted Socket.IO colocated with Next.js.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Custom Node server (`server.ts`) wrapping Next + Socket.IO
- JSON file persistence in `data/rooms.json`
- Guest nicknames + stable `localStorage` player ids

## Production deploy notes

- Deploy as a **long-running Node process** (Railway, Render, Fly.io, VPS). Not ideal for serverless-only Vercel because of Socket.IO + file persistence.
- Put a durable volume on `data/` (or swap the store for Postgres/Redis) so rooms survive restarts across multiple instances.
- For multiple instances, replace the in-memory/JSON store with a shared DB and a Socket.IO adapter (Redis).
- Set `HOSTNAME=0.0.0.0` and your platform `PORT`.
- Optionally put HTTPS termination in front; Socket.IO works behind standard reverse proxies.

## Scripts

- `npm run dev` — custom server with hot reload via `tsx`
- `npm run build` — `next build`
- `npm start` — production custom server

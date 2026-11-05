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

## Power moves

| Power | Effect |
| --- | --- |
| 🥾 Boot | Remove one opponent tile (you choose) |
| ⚡ Lightning | Remove a random opponent tile |
| 🌪️ Tornado | Shuffle all tiles on the board |
| 🧹 Broom | Erase an entire row **or** column |
| 📐 Expansion | Grow board to 4×4; win needs 4-in-a-row |
| 🔄 Swap | Swap one of your tiles with an opponent tile |
| 🛡️ Shield | Protect one of your tiles from removal until your next turn |
| ✨ Double Place | Place two marks in one turn |

Each round every player is dealt **3 random powers**. Using a power usually spends your turn (Double Place does not end the turn until both marks are placed).

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

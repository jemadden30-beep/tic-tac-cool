import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server, type Server as IOServer } from "socket.io";
import {
  createRoom,
  getRoom,
  joinRoom,
  saveRoom,
  setConnected,
  listPublicRooms,
  listRoomsForPlayer,
  tttCodeTaken,
  kickOSeat,
  deleteRoom,
} from "./src/lib/store";
import { applyPlace, applyPower, startRound, resetSeriesForRematch } from "./src/lib/game";
import { BOT_ID, chooseBotAction } from "./src/lib/bot";
import type { BotDifficulty, PowerId, PowerTarget, RoomState } from "./src/lib/types";
import {
  createDotsRoom,
  getDotsRoom,
  joinDotsRoom,
  saveDotsRoom,
  setDotsConnected,
  listDotsRoomsForPlayer,
  dotsCodeTaken,
  kickDotsOSeat,
  deleteDotsRoom,
} from "./src/lib/dots/store";
import {
  claimEdge,
  applyDotsPower,
  startDotsRound,
  resetDotsSeries,
  DOTS_BOT_ID,
} from "./src/lib/dots/game";
import { runDotsBotStep } from "./src/lib/dots/bot";
import type { DotsRoomState, DotsPowerId, DotsPowerTarget, EdgeId } from "./src/lib/dots/types";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const botTimers = new Map<string, NodeJS.Timeout>();

const dotsBotTimers = new Map<string, NodeJS.Timeout>();

function pushDotsSystem(room: DotsRoomState, text: string) {
  room.chat.push({
    id: `${Date.now()}-sys`,
    playerId: "system",
    name: "System",
    text,
    at: Date.now(),
  });
  if (room.chat.length > 100) room.chat = room.chat.slice(-100);
}

function broadcastDots(io: IOServer, room: DotsRoomState, opts?: { emitAnimation?: boolean }) {
  const shouldAnim = opts?.emitAnimation && room.lastAnimation;
  const anim = shouldAnim ? room.lastAnimation : null;
  if (shouldAnim) room.lastAnimation = null;
  saveDotsRoom(room);
  io.to(`dots:${room.code}`).emit("dots:state", room);
  if (anim) io.to(`dots:${room.code}`).emit("dots:animation", anim);
}

function scheduleDotsBot(io: IOServer, code: string, delay = 550) {
  const existing = dotsBotTimers.get(code);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => runDotsBotTurn(io, code), delay);
  dotsBotTimers.set(code, t);
}

function runDotsBotTurn(io: IOServer, code: string) {
  dotsBotTimers.delete(code);
  const room = getDotsRoom(code);
  if (!room || room.mode !== "bot" || room.phase !== "playing") return;
  const bot = room.players.find((p) => p.id === DOTS_BOT_ID);
  if (!bot || room.turn !== bot.mark) return;

  const beforeAnim = room.lastAnimation;
  const ok = runDotsBotStep(room);
  if (!ok) return;
  const usedPower = room.lastAnimation && room.lastAnimation !== beforeAnim;
  broadcastDots(io, room, { emitAnimation: Boolean(usedPower) });

  const botSeat = room.players.find((p) => p.id === DOTS_BOT_ID);
  if (room.mode === "bot" && room.phase === "playing" && botSeat && room.turn === botSeat.mark) {
    scheduleDotsBot(io, room.code, 420);
  }
}

function maybeDotsBot(io: IOServer, room: DotsRoomState) {
  const bot = room.players.find((p) => p.id === DOTS_BOT_ID);
  if (room.mode === "bot" && room.phase === "playing" && bot && room.turn === bot.mark) {
    scheduleDotsBot(io, room.code);
  }
}


function pushSystem(room: RoomState, text: string) {
  room.chat.push({
    id: `${Date.now()}-sys`,
    playerId: "system",
    name: "System",
    text,
    at: Date.now(),
  });
  if (room.chat.length > 100) room.chat = room.chat.slice(-100);
}

function broadcast(io: IOServer, room: RoomState, opts?: { emitAnimation?: boolean }) {
  const shouldAnim = opts?.emitAnimation && room.lastAnimation;
  const anim = shouldAnim ? room.lastAnimation : null;
  if (shouldAnim) room.lastAnimation = null; // one-shot — don't replay on later moves
  saveRoom(room);
  io.to(room.code).emit("room:state", room);
  if (anim) io.to(room.code).emit("game:animation", anim);
}

function scheduleBot(io: IOServer, code: string, delay = 650) {
  const existing = botTimers.get(code);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => runBotTurn(io, code), delay);
  botTimers.set(code, t);
}

function runBotTurn(io: IOServer, code: string) {
  botTimers.delete(code);
  const room = getRoom(code);
  if (!room || room.mode !== "bot" || room.phase !== "playing") return;
  const bot = room.players.find((p) => p.id === BOT_ID);
  if (!bot || room.turn !== bot.mark) return;

  const action = chooseBotAction(room);
  if (!action) return;

  if (action.type === "place") {
    const result = applyPlace(room, BOT_ID, action.index);
    if (!result.ok) {
      pushSystem(room, `Bot hesitated: ${result.error}`);
      saveRoom(room);
      io.to(room.code).emit("room:state", room);
      return;
    }
  } else {
    const result = applyPower(room, BOT_ID, action.power, action.target);
    if (!result.ok) {
      // fall back to a place
      const fallback = chooseBotAction(room);
      if (fallback?.type === "place") {
        applyPlace(room, BOT_ID, fallback.index);
      } else {
        pushSystem(room, `Bot skipped power (${result.error})`);
      }
    } else {
      pushSystem(room, `Bot used ${action.power}`);
    }
  }

  const usedPower = action.type === "power";
  broadcast(io, room, { emitAnimation: usedPower });

  // Bot may still have the turn (double / power-then-place)
  const botSeat = room.players.find((p) => p.id === BOT_ID);
  if (room.mode === "bot" && room.phase === "playing" && botSeat && room.turn === botSeat.mark) {
    scheduleBot(io, room.code, room.doublePending || room.powerUsedThisTurn ? 420 : 700);
  }
}

function maybeBotAfterHuman(io: IOServer, room: RoomState) {
  const bot = room.players.find((p) => p.id === BOT_ID);
  if (room.mode === "bot" && room.phase === "playing" && bot && room.turn === bot.mark) {
    scheduleBot(io, room.code);
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });


// ---- Live socket truth: channel -> playerId -> socket ids ----
const liveSeats = new Map<string, Map<string, Set<string>>>();
function addLive(channel: string, pid: string, sid: string) {
  let m = liveSeats.get(channel);
  if (!m) liveSeats.set(channel, (m = new Map()));
  let set = m.get(pid);
  if (!set) m.set(pid, (set = new Set()));
  set.add(sid);
}
function removeLive(channel: string, pid: string, sid: string): boolean {
  const set = liveSeats.get(channel)?.get(pid);
  if (!set) return false;
  set.delete(sid);
  return set.size > 0;
}
function isLive(channel: string, pid: string): boolean {
  return (liveSeats.get(channel)?.get(pid)?.size ?? 0) > 0;
}
/** Make room.players[].connected match real sockets (bot always connected). */
function reconcileLive<T extends { players: { id: string; connected: boolean }[] }>(
  channel: string,
  room: T,
  botId: string
): boolean {
  let changed = false;
  for (const p of room.players) {
    const live = p.id === botId ? true : isLive(channel, p.id);
    if (p.connected !== live) {
      p.connected = live;
      changed = true;
    }
  }
  return changed;
}
function seatOpen(room: { mode: string; players: { id: string; mark: string; connected: boolean }[] }, botId: string): boolean {
  if (room.mode !== "online") return false;
  const humans = room.players.filter((p) => p.id !== botId);
  const o = humans.find((p) => p.mark === "O");
  return humans.length < 2 || (!!o && !o.connected);
}

  io.on("connection", (socket) => {
    let joinedCode: string | null = null;
    let playerId: string | null = null;
    const bindSeat = (channel: string, pid: string) => {
      if (joinedCode && playerId && (joinedCode !== channel || playerId !== pid)) {
        removeLive(joinedCode, playerId, socket.id);
      }
      joinedCode = channel;
      playerId = pid;
      addLive(channel, pid, socket.id);
      socket.join(channel);
    };

    socket.on("rooms:list", (cb) => {
      cb?.({ rooms: listPublicRooms() });
    });

    socket.on("rooms:mine", (payload: { playerId: string }, cb) => {
      const playerId = payload?.playerId || "";
      if (!playerId) return cb?.({ ok: false, matches: [], error: "Missing player" });
      const matches = [
        ...listRoomsForPlayer(playerId),
        ...listDotsRoomsForPlayer(playerId),
      ].sort((a, b) => {
        if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      cb?.({ ok: true, matches });
    });

    socket.on(
      "room:create",
      (
        payload: {
          playerId: string;
          name: string;
          mode: "online" | "hotseat" | "bot";
          firstTo: number;
          difficulty?: BotDifficulty;
        },
        cb
      ) => {
        const mode = payload.mode || "online";
        // createRoom already unique in TTT store; also skip dots collisions via store makeCode loop only in-ttt —
        // dots uses separate file so rare collision OK (join routes are game-specific).
        const room = createRoom({
          hostId: payload.playerId,
          hostName: payload.name || "Host",
          mode,
          firstTo: Math.min(9, Math.max(1, payload.firstTo || 3)),
          difficulty: payload.difficulty,
        });
        bindSeat(room.code, payload.playerId);

        if (mode === "bot") {
          pushSystem(
            room,
            `Solo match vs ${room.players.find((p) => p.id === BOT_ID)?.name || "Bot"} — first to ${room.firstTo}.`
          );
          startRound(room);
          saveRoom(room);
        }

        cb?.({ ok: true, room });
        io.to(room.code).emit("room:state", room);
        maybeBotAfterHuman(io, room);
      }
    );

    socket.on(
      "room:join",
      (payload: { code: string; playerId: string; name: string }, cb) => {
        const pre = getRoom(payload.code);
        if (!pre) {
          const other = getDotsRoom(payload.code);
          if (other) {
            cb?.({ ok: false, error: "That code is a Dots & Boxes room", redirect: `/dots/room/${other.code}` });
            return;
          }
        } else if (reconcileLive(pre.code, pre, BOT_ID)) saveRoom(pre);
        const result = joinRoom(
          payload.code,
          payload.playerId,
          payload.name || "Player"
        );
        if (!result.ok) {
          cb?.(result);
          return;
        }
        bindSeat(result.room.code, payload.playerId);
        cb?.({ ok: true, room: result.room, joined: true });
        io.to(result.room.code).emit("room:state", result.room);
      }
    );

    socket.on(
      "room:sync",
      (payload: { code: string; playerId: string; name?: string }, cb) => {
        const room = getRoom(payload.code);
        if (!room) {
          cb?.({ ok: false, error: "Room not found" });
          return;
        }
        const channel = room.code.toUpperCase();
        const known = room.players.some((p) => p.id === payload.playerId);
        if (!known) {
          // Never auto-claim a seat on sync (link previews / in-app browsers stole P2).
          if (reconcileLive(channel, room, BOT_ID)) saveRoom(room);
          if (room.mode === "bot") return cb?.({ ok: false, error: "Solo bot game — create your own" });
          if (room.mode === "hotseat")
            return cb?.({ ok: false, error: "Hotseat is tied to the original device. Use the same browser to resume." });
          socket.join(channel); // observe only
          cb?.({ ok: true, room, joined: false, canJoin: seatOpen(room, BOT_ID) });
          return;
        }
        bindSeat(channel, payload.playerId);
        setConnected(room.code, payload.playerId, true);
        const fresh = getRoom(channel)!;
        cb?.({ ok: true, room: fresh, joined: true });
        io.to(channel).emit("room:state", fresh);
        maybeBotAfterHuman(io, fresh);
      }
    );

    socket.on(
      "room:setFirstTo",
      (payload: { code: string; playerId: string; firstTo: number }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (
          room.hostId !== payload.playerId &&
          room.mode === "online"
        ) {
          return cb?.({ ok: false, error: "Only host can change" });
        }
        if (room.phase === "playing") {
          return cb?.({ ok: false, error: "Wait until round ends" });
        }
        room.firstTo = Math.min(9, Math.max(1, payload.firstTo));
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
      }
    );

    socket.on(
      "room:rename",
      (payload: { code: string; playerId: string; name: string }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        const p = room.players.find((x) => x.id === payload.playerId);
        if (p && p.id !== BOT_ID) p.name = payload.name.slice(0, 20) || p.name;
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
      }
    );

    socket.on(
      "room:kickO",
      (payload: { code: string; playerId: string }, cb) => {
        const result = kickOSeat(payload.code, payload.playerId);
        if (!result.ok) {
          cb?.(result);
          return;
        }
        io.to(result.room.code).emit("room:kicked", { code: result.room.code, playerId: result.kickedId });
        pushSystem(result.room, "Host freed the P2 seat — a new opponent can join.");
        saveRoom(result.room);
        io.to(result.room.code).emit("room:state", result.room);
        cb?.({ ok: true, room: result.room });
      }
    );

    socket.on(
      "room:delete",
      (payload: { code: string; playerId: string }, cb) => {
        const code = (payload.code || "").toUpperCase();
        const result = deleteRoom(code, payload.playerId);
        if (!result.ok) {
          cb?.(result);
          return;
        }
        io.to(result.code).emit("room:deleted", { code: result.code });
        // Drop sockets from the room channel
        const roomNs = io.sockets.adapter.rooms.get(result.code);
        if (roomNs) {
          for (const sid of [...roomNs]) {
            io.sockets.sockets.get(sid)?.leave(result.code);
          }
        }
        cb?.({ ok: true, code: result.code });
      }
    );

    socket.on(
      "game:start",
      (payload: { code: string; playerId: string }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        // Host may start before the guest opens the invite (async)
        if (
          room.hostId !== payload.playerId &&
          room.mode === "online"
        ) {
          return cb?.({ ok: false, error: "Only host can start" });
        }
        room.seriesWinner = null;
        if (room.phase === "series_over") {
          room.players.forEach((p) => {
            p.wins = 0;
            p.losses = 0;
            p.streak = 0;
          });
          resetSeriesForRematch(room);
        }
        startRound(room);
        if (room.mode === "bot") {
          const human = room.players.find((p) => p.id !== BOT_ID);
          const opener = room.players.find((p) => p.mark === "X");
          pushSystem(
            room,
            `New round — ${opener?.name || "X"} opens (you are ${human?.mark || "?"}).`
          );
        }
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
        maybeBotAfterHuman(io, room);
      }
    );

    socket.on(
      "game:nextRound",
      (payload: { code: string; playerId: string }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (room.phase !== "round_over") {
          return cb?.({ ok: false, error: "Round not over" });
        }
        startRound(room);
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
        maybeBotAfterHuman(io, room);
      }
    );

    socket.on(
      "game:place",
      (payload: { code: string; playerId: string; index: number }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (payload.playerId === BOT_ID) {
          return cb?.({ ok: false, error: "Nice try" });
        }
        const result = applyPlace(room, payload.playerId, payload.index);
        if (!result.ok) return cb?.(result);
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
        maybeBotAfterHuman(io, room);
      }
    );

    socket.on(
      "game:power",
      (
        payload: {
          code: string;
          playerId: string;
          power: PowerId;
          target: PowerTarget;
        },
        cb
      ) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (payload.playerId === BOT_ID) {
          return cb?.({ ok: false, error: "Nice try" });
        }
        const result = applyPower(
          room,
          payload.playerId,
          payload.power,
          payload.target
        );
        if (!result.ok) return cb?.(result);
        const anim = room.lastAnimation;
        room.lastAnimation = null;
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        if (anim) io.to(room.code).emit("game:animation", anim);
        cb?.({ ok: true, room });
        maybeBotAfterHuman(io, room);
      }
    );

    socket.on(
      "chat:send",
      (payload: { code: string; playerId: string; text: string }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        const p = room.players.find((x) => x.id === payload.playerId);
        const text = (payload.text || "").trim().slice(0, 240);
        if (!text) return cb?.({ ok: false, error: "Empty" });
        const msg = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          playerId: payload.playerId,
          name: p?.name || "Guest",
          text,
          at: Date.now(),
        };
        room.chat.push(msg);
        if (room.chat.length > 100) room.chat = room.chat.slice(-100);
        saveRoom(room);
        io.to(room.code).emit("chat:message", msg);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true });
      }
    );


    // ----- Dots & Boxes -----
    socket.on(
      "dots:create",
      (
        payload: {
          playerId: string;
          name: string;
          mode: "online" | "hotseat" | "bot";
          firstTo: number;
          difficulty?: BotDifficulty;
        },
        cb
      ) => {
        const mode = payload.mode || "online";
        const room = createDotsRoom(
          {
            hostId: payload.playerId,
            hostName: payload.name || "Host",
            mode,
            firstTo: Math.min(9, Math.max(1, payload.firstTo || 3)),
            difficulty: payload.difficulty,
          },
          (code) => tttCodeTaken(code)
        );
        bindSeat(`dots:${room.code}`, payload.playerId);

        if (mode === "bot") {
          pushDotsSystem(room, `Solo Dots vs bot — first to ${room.firstTo}.`);
          startDotsRound(room);
          saveDotsRoom(room);
        }

        cb?.({ ok: true, room });
        io.to(`dots:${room.code}`).emit("dots:state", room);
        maybeDotsBot(io, room);
      }
    );

    socket.on(
      "dots:join",
      (payload: { code: string; playerId: string; name: string }, cb) => {
        const pre = getDotsRoom(payload.code);
        if (!pre) {
          const other = getRoom(payload.code);
          if (other) {
            cb?.({ ok: false, error: "That code is a Tic Tac Toe room", redirect: `/room/${other.code}` });
            return;
          }
        } else if (reconcileLive(`dots:${pre.code}`, pre, DOTS_BOT_ID)) saveDotsRoom(pre);
        const result = joinDotsRoom(
          payload.code,
          payload.playerId,
          payload.name || "Player"
        );
        if (!result.ok) {
          cb?.(result);
          return;
        }
        bindSeat(`dots:${result.room.code}`, payload.playerId);
        cb?.({ ok: true, room: result.room, joined: true });
        io.to(`dots:${result.room.code}`).emit("dots:state", result.room);
      }
    );

    socket.on(
      "dots:sync",
      (payload: { code: string; playerId: string; name?: string }, cb) => {
        const room = getDotsRoom(payload.code);
        if (!room) {
          cb?.({ ok: false, error: "Room not found" });
          return;
        }
        const channel = `dots:${room.code.toUpperCase()}`;
        const known = room.players.some((p) => p.id === payload.playerId);
        if (!known) {
          if (reconcileLive(channel, room, DOTS_BOT_ID)) saveDotsRoom(room);
          if (room.mode === "bot") return cb?.({ ok: false, error: "Solo bot game — create your own" });
          if (room.mode === "hotseat")
            return cb?.({ ok: false, error: "Hotseat is tied to the original device. Use the same browser to resume." });
          socket.join(channel); // observe only
          cb?.({ ok: true, room, joined: false, canJoin: seatOpen(room, DOTS_BOT_ID) });
          return;
        }
        bindSeat(channel, payload.playerId);
        setDotsConnected(room.code, payload.playerId, true);
        const fresh = getDotsRoom(room.code)!;
        cb?.({ ok: true, room: fresh, joined: true });
        io.to(channel).emit("dots:state", fresh);
        maybeDotsBot(io, fresh);
      }
    );

    socket.on(
      "dots:kickO",
      (payload: { code: string; playerId: string }, cb) => {
        const result = kickDotsOSeat(payload.code, payload.playerId);
        if (!result.ok) {
          cb?.(result);
          return;
        }
        io.to(`dots:${result.room.code}`).emit("dots:kicked", { code: result.room.code, playerId: result.kickedId });
        pushDotsSystem(result.room, "Host freed the P2 seat — a new opponent can join.");
        saveDotsRoom(result.room);
        io.to(`dots:${result.room.code}`).emit("dots:state", result.room);
        cb?.({ ok: true, room: result.room });
      }
    );

    socket.on(
      "dots:delete",
      (payload: { code: string; playerId: string }, cb) => {
        const code = (payload.code || "").toUpperCase();
        const result = deleteDotsRoom(code, payload.playerId);
        if (!result.ok) {
          cb?.(result);
          return;
        }
        const channel = `dots:${result.code}`;
        io.to(channel).emit("dots:deleted", { code: result.code });
        const roomNs = io.sockets.adapter.rooms.get(channel);
        if (roomNs) {
          for (const sid of [...roomNs]) {
            io.sockets.sockets.get(sid)?.leave(channel);
          }
        }
        cb?.({ ok: true, code: result.code });
      }
    );

    socket.on(
      "dots:start",
      (payload: { code: string; playerId: string }, cb) => {
        const room = getDotsRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (room.hostId !== payload.playerId && room.mode === "online") {
          return cb?.({ ok: false, error: "Only host can start" });
        }
        room.seriesWinner = null;
        if (room.phase === "series_over") {
          resetDotsSeries(room);
        }
        startDotsRound(room);
        saveDotsRoom(room);
        io.to(`dots:${room.code}`).emit("dots:state", room);
        cb?.({ ok: true, room });
        maybeDotsBot(io, room);
      }
    );

    socket.on(
      "dots:nextRound",
      (payload: { code: string; playerId: string }, cb) => {
        const room = getDotsRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (room.phase !== "round_over") {
          return cb?.({ ok: false, error: "Round not over" });
        }
        startDotsRound(room);
        saveDotsRoom(room);
        io.to(`dots:${room.code}`).emit("dots:state", room);
        cb?.({ ok: true, room });
        maybeDotsBot(io, room);
      }
    );

    socket.on(
      "dots:claim",
      (payload: { code: string; playerId: string; edge: EdgeId }, cb) => {
        const room = getDotsRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (payload.playerId === DOTS_BOT_ID) {
          return cb?.({ ok: false, error: "Nice try" });
        }
        const result = claimEdge(room, payload.playerId, payload.edge);
        if (!result.ok) return cb?.(result);
        saveDotsRoom(room);
        io.to(`dots:${room.code}`).emit("dots:state", room);
        cb?.({ ok: true, room });
        maybeDotsBot(io, room);
      }
    );

    socket.on(
      "dots:power",
      (
        payload: {
          code: string;
          playerId: string;
          power: DotsPowerId;
          target: DotsPowerTarget;
        },
        cb
      ) => {
        const room = getDotsRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (payload.playerId === DOTS_BOT_ID) {
          return cb?.({ ok: false, error: "Nice try" });
        }
        const result = applyDotsPower(
          room,
          payload.playerId,
          payload.power,
          payload.target
        );
        if (!result.ok) return cb?.(result);
        const anim = room.lastAnimation;
        room.lastAnimation = null;
        saveDotsRoom(room);
        io.to(`dots:${room.code}`).emit("dots:state", room);
        if (anim) io.to(`dots:${room.code}`).emit("dots:animation", anim);
        cb?.({ ok: true, room });
        maybeDotsBot(io, room);
      }
    );

    socket.on(
      "dots:chat",
      (payload: { code: string; playerId: string; text: string }, cb) => {
        const room = getDotsRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        const p = room.players.find((x) => x.id === payload.playerId);
        const text = (payload.text || "").trim().slice(0, 240);
        if (!text) return cb?.({ ok: false, error: "Empty" });
        const msg = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          playerId: payload.playerId,
          name: p?.name || "Guest",
          text,
          at: Date.now(),
        };
        room.chat.push(msg);
        if (room.chat.length > 100) room.chat = room.chat.slice(-100);
        saveDotsRoom(room);
        io.to(`dots:${room.code}`).emit("chat:message", msg);
        io.to(`dots:${room.code}`).emit("dots:state", room);
        cb?.({ ok: true });
      }
    );


    socket.on("disconnect", () => {
      if (joinedCode && playerId) {
        if (removeLive(joinedCode, playerId, socket.id)) return; // another tab still live
        if (joinedCode.startsWith("dots:")) {
          const code = joinedCode.slice(5);
          setDotsConnected(code, playerId, false);
          const room = getDotsRoom(code);
          if (room) io.to(joinedCode).emit("dots:state", room);
        } else {
          setConnected(joinedCode, playerId, false);
          const room = getRoom(joinedCode);
          if (room) io.to(joinedCode).emit("room:state", room);
        }
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Tic Tac Cool ready on http://${hostname}:${port}`);
  });
});

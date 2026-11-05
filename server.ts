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
} from "./src/lib/store";
import { applyPlace, applyPower, startRound } from "./src/lib/game";
import { BOT_ID, chooseBotAction } from "./src/lib/bot";
import type { BotDifficulty, PowerId, PowerTarget, RoomState } from "./src/lib/types";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const botTimers = new Map<string, NodeJS.Timeout>();

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

function broadcast(io: IOServer, room: RoomState) {
  saveRoom(room);
  io.to(room.code).emit("room:state", room);
  if (room.lastAnimation) {
    io.to(room.code).emit("game:animation", room.lastAnimation);
  }
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
  if (room.turn !== "O") return;

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

  broadcast(io, room);

  // Bot may still have the turn (double place) or used power that didn't consume
  if (room.mode === "bot" && room.phase === "playing" && room.turn === "O") {
    scheduleBot(io, room.code, room.doublePending ? 420 : 700);
  }
}

function maybeBotAfterHuman(io: IOServer, room: RoomState) {
  if (room.mode === "bot" && room.phase === "playing" && room.turn === "O") {
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

  io.on("connection", (socket) => {
    let joinedCode: string | null = null;
    let playerId: string | null = null;

    socket.on("rooms:list", (cb) => {
      cb?.({ rooms: listPublicRooms() });
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
        const room = createRoom({
          hostId: payload.playerId,
          hostName: payload.name || "Host",
          mode,
          firstTo: Math.min(9, Math.max(1, payload.firstTo || 3)),
          difficulty: payload.difficulty,
        });
        joinedCode = room.code;
        playerId = payload.playerId;
        socket.join(room.code);

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
        const result = joinRoom(
          payload.code,
          payload.playerId,
          payload.name || "Player"
        );
        if (!result.ok) {
          cb?.(result);
          return;
        }
        joinedCode = result.room.code;
        playerId = payload.playerId;
        socket.join(result.room.code);
        cb?.({ ok: true, room: result.room });
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
        const known = room.players.some((p) => p.id === payload.playerId);
        if (!known) {
          const joined = joinRoom(
            payload.code,
            payload.playerId,
            payload.name || "Player"
          );
          if (!joined.ok) {
            cb?.(joined);
            return;
          }
        } else {
          setConnected(room.code, payload.playerId, true);
        }
        joinedCode = room.code.toUpperCase();
        playerId = payload.playerId;
        socket.join(joinedCode);
        const fresh = getRoom(joinedCode)!;
        cb?.({ ok: true, room: fresh });
        io.to(joinedCode).emit("room:state", fresh);
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
      "game:start",
      (payload: { code: string; playerId: string }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (room.mode === "online" && room.players.length < 2) {
          return cb?.({ ok: false, error: "Need 2 players" });
        }
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
        }
        startRound(room);
        if (room.mode === "bot") {
          pushSystem(room, "New round — you are X, bot is O.");
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
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        io.to(room.code).emit("game:animation", room.lastAnimation);
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

    socket.on("disconnect", () => {
      if (joinedCode && playerId) {
        setConnected(joinedCode, playerId, false);
        const room = getRoom(joinedCode);
        if (room) io.to(joinedCode).emit("room:state", room);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Tic Tac Cool ready on http://${hostname}:${port}`);
  });
});

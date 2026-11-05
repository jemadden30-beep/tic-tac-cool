import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import {
  createRoom,
  getRoom,
  joinRoom,
  saveRoom,
  setConnected,
  listPublicRooms,
} from "./src/lib/store";
import { applyPlace, applyPower, startRound } from "./src/lib/game";
import type { PowerId, PowerTarget } from "./src/lib/types";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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
          mode: "online" | "hotseat";
          firstTo: number;
        },
        cb
      ) => {
        const room = createRoom({
          hostId: payload.playerId,
          hostName: payload.name || "Host",
          mode: payload.mode || "online",
          firstTo: Math.min(9, Math.max(1, payload.firstTo || 3)),
        });
        joinedCode = room.code;
        playerId = payload.playerId;
        socket.join(room.code);
        cb?.({ ok: true, room });
        io.to(room.code).emit("room:state", room);
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

    socket.on("room:sync", (payload: { code: string; playerId: string; name?: string }, cb) => {
      const room = getRoom(payload.code);
      if (!room) {
        cb?.({ ok: false, error: "Room not found" });
        return;
      }
      const known = room.players.some((p) => p.id === payload.playerId);
      if (!known) {
        const joined = joinRoom(payload.code, payload.playerId, payload.name || "Player");
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
    });

    socket.on(
      "room:setFirstTo",
      (payload: { code: string; playerId: string; firstTo: number }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        if (room.hostId !== payload.playerId && room.mode === "online") {
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
        if (p) p.name = payload.name.slice(0, 20) || p.name;
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
        if (room.hostId !== payload.playerId && room.mode === "online") {
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
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
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
      }
    );

    socket.on(
      "game:place",
      (payload: { code: string; playerId: string; index: number }, cb) => {
        const room = getRoom(payload.code);
        if (!room) return cb?.({ ok: false, error: "Missing room" });
        const result = applyPlace(room, payload.playerId, payload.index);
        if (!result.ok) return cb?.(result);
        saveRoom(room);
        io.to(room.code).emit("room:state", room);
        cb?.({ ok: true, room });
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

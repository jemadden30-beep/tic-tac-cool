import fs from "fs";
import path from "path";
import type { RoomState, PublicRoom } from "./types";
import { createRoomState } from "./game";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "rooms.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll(): Record<string, RoomState> {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(rooms: Record<string, RoomState>) {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(rooms, null, 2));
}

const rooms: Record<string, RoomState> = loadAll();

function persist() {
  saveAll(rooms);
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  if (rooms[code]) return makeCode();
  return code;
}

export function createRoom(opts: {
  hostId: string;
  hostName: string;
  mode: "online" | "hotseat" | "bot";
  firstTo: number;
  difficulty?: "easy" | "medium" | "hard" | "expert";
}): RoomState {
  const code = makeCode();
  const room = createRoomState({ ...opts, code });
  rooms[code] = room;
  persist();
  return room;
}

export function getRoom(code: string): RoomState | undefined {
  const room = rooms[code.toUpperCase()];
  if (room && room.difficulty === undefined) {
    (room as RoomState).difficulty = room.mode === "bot" ? "medium" : null;
  }
  if (room && typeof room.roundIndex !== "number") {
    room.roundIndex = 0;
  }
  return room;
}

export function saveRoom(room: RoomState) {
  room.updatedAt = Date.now();
  rooms[room.code] = room;
  persist();
}

export function listPublicRooms(): PublicRoom[] {
  return Object.values(rooms)
    .filter((r) => r.phase !== "series_over")
    .map((r) => ({
      code: r.code,
      phase: r.phase,
      mode: r.mode,
      firstTo: r.firstTo,
      playerCount: r.players.filter((p) => p.connected).length,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);
}

export function joinRoom(
  code: string,
  playerId: string,
  name: string
): { ok: true; room: RoomState } | { ok: false; error: string } {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "Room not found" };

  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    saveRoom(room);
    return { ok: true, room };
  }

  if (room.mode === "bot") {
    // Only the human host may rejoin; never replace the bot seat
    if (room.hostId === playerId) {
      const host = room.players.find((p) => p.mark === "X");
      if (host) {
        host.id = playerId;
        host.name = name || host.name;
        host.connected = true;
        saveRoom(room);
        return { ok: true, room };
      }
    }
    return { ok: false, error: "Solo bot game — create your own" };
  }

  if (room.mode === "hotseat") {
    // Spectator/controller joins as host seat
    const host = room.players[0];
    if (host && host.id !== playerId) {
      // Allow second device to take O if reclaiming
    }
  }

  const openSeat = room.players.find(
    (p) => p.mark === "O" && !p.connected && p.id !== "ttc-bot"
  );
  if (openSeat) {
    openSeat.id = playerId;
    openSeat.name = name;
    openSeat.connected = true;
    saveRoom(room);
    return { ok: true, room };
  }

  if (room.players.length >= 2) {
    // resume by name match soft — never overwrite bot
    const byName = room.players.find((p) => p.name === name && p.id !== "ttc-bot");
    if (byName) {
      byName.id = playerId;
      byName.connected = true;
      saveRoom(room);
      return { ok: true, room };
    }
    return { ok: false, error: "Room is full" };
  }

  room.players.push({
    id: playerId,
    name,
    mark: "O",
    powers: [],
    wins: 0,
    losses: 0,
    streak: 0,
    connected: true,
    shieldIndex: null,
    frozen: false,
  });
  saveRoom(room);
  return { ok: true, room };
}

export function setConnected(code: string, playerId: string, connected: boolean) {
  const room = getRoom(code);
  if (!room) return;
  const p = room.players.find((x) => x.id === playerId);
  if (p) {
    p.connected = connected;
    saveRoom(room);
  }
}

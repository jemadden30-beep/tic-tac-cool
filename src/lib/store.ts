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
  if (room && typeof room.powerUsedThisTurn !== "boolean") {
    room.powerUsedThisTurn = false;
  }
  if (room) {
    if (room.lockedCell === undefined) room.lockedCell = null;
    if (room.lockedBy === undefined) room.lockedBy = null;
    if (room.lastPlace === undefined) room.lastPlace = null;
    for (const pl of room.players) {
      if (typeof pl.energy !== "number") pl.energy = 50;
      if (!Array.isArray(pl.usedPowers)) pl.usedPowers = [];
      if (typeof pl.silenced !== "boolean") pl.silenced = false;
    }
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
      playerCount: r.players.filter((p) => p.id !== "ttc-bot").length,
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

  // Async multiplayer: same playerId always resumes their seat (board/energy/turn intact)
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    saveRoom(room);
    return { ok: true, room };
  }

  if (room.mode === "bot") {
    return { ok: false, error: "Solo bot game — create your own" };
  }

  if (room.mode === "hotseat") {
    // One controller device; reopen with the same saved player id
    if (room.players.length >= 1) {
      return {
        ok: false,
        error: "Hotseat is tied to the original device. Use the same browser to resume.",
      };
    }
  }

  // First-time O seat (lobby only) — never steal a seat after someone claimed it
  if (room.mode === "online" && room.players.length < 2) {
    room.players.push({
      id: playerId,
      name,
      mark: "O",
      powers: [],
      energy: 50,
      usedPowers: [],
      wins: 0,
      losses: 0,
      streak: 0,
      connected: true,
      shieldIndex: null,
      frozen: false,
      silenced: false,
    });
    saveRoom(room);
    return { ok: true, room };
  }

  return {
    ok: false,
    error:
      "Room is full. Reopen this invite on the same device/browser you used before to pick up where you left off.",
  };
}

export function setConnected(code: string, playerId: string, connected: boolean) {
  const room = getRoom(code);
  if (!room) return;
  const p = room.players.find((x) => x.id === playerId);
  if (p) {
    // Presence only — never pause turns or clear game state when someone goes away
    p.connected = connected;
    saveRoom(room);
  }
}

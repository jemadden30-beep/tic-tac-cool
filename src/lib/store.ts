import fs from "fs";
import path from "path";
import type { RoomState, PublicRoom, MyMatchSummary } from "./types";
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
  let dotsTaken = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dotsTaken = require("./dots/store").dotsCodeTaken(code);
  } catch {
    dotsTaken = false;
  }
  if (rooms[code] || dotsTaken) return makeCode();
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

export function tttCodeTaken(code: string): boolean {
  return Boolean(rooms[code.toUpperCase()]);
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

function fullRoomError(room: RoomState): string {
  const p1 = room.players.find((p) => p.mark === "X");
  const p2 = room.players.find((p) => p.mark === "O");
  return `Room is full (P1: ${p1?.name || "—"}, P2: ${p2?.name || "—"}). Open this link on the same device you used before, or ask the host to free the P2 seat.`;
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

  if (room.mode === "online") {
    // Reclaim a disconnected O seat (lobby or mid-game) — never steal a connected O or X/host
    const oSeat = room.players.find((p) => p.mark === "O");
    if (oSeat && oSeat.connected === false) {
      oSeat.id = playerId;
      oSeat.name = name || oSeat.name;
      oSeat.connected = true;
      saveRoom(room);
      return { ok: true, room };
    }

    // First-time O seat — never steal a seat after someone claimed it
    if (room.players.length < 2) {
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
  }

  return {
    ok: false,
    error: fullRoomError(room),
  };
}

/** Host frees the O seat so a new guest can join. Lobby always; mid-game only if O is disconnected. */
export function kickOSeat(
  code: string,
  hostPlayerId: string
): { ok: true; room: RoomState } | { ok: false; error: string } {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "Room not found" };
  if (room.mode !== "online") return { ok: false, error: "Only online rooms have a freeable P2 seat" };
  if (room.hostId !== hostPlayerId) return { ok: false, error: "Only host can free the P2 seat" };
  const oIdx = room.players.findIndex((p) => p.mark === "O");
  if (oIdx < 0) return { ok: false, error: "No P2 seat to free" };
  const o = room.players[oIdx];
  if (room.phase !== "lobby" && o.connected) {
    return { ok: false, error: "P2 is still connected — wait until they leave, or stay in lobby" };
  }
  room.players.splice(oIdx, 1);
  saveRoom(room);
  return { ok: true, room };
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


export function listRoomsForPlayer(playerId: string): MyMatchSummary[] {
  return Object.values(rooms)
    .filter((r) => r.mode === "online" && r.players.some((p) => p.id === playerId))
    .map((r) => {
      const me = r.players.find((p) => p.id === playerId)!;
      const opp = r.players.find((p) => p.id !== playerId);
      const yourTurn =
        r.phase === "playing" &&
        (r.mode === "hotseat" || me.mark === r.turn);
      let statusLabel = "Lobby";
      if (r.phase === "playing") {
        statusLabel = yourTurn ? "Your turn" : "Their turn";
      } else if (r.phase === "round_over") {
        statusLabel = "Round over";
      } else if (r.phase === "series_over") {
        statusLabel = "Series over";
      }
      return {
        gameKind: "ttt" as const,
        code: r.code,
        mode: r.mode,
        phase: r.phase,
        firstTo: r.firstTo,
        myMark: me.mark,
        myWins: me.wins,
        opponentName:
          opp?.name ||
          (r.mode === "online" ? "Waiting for opponent…" : "—"),
        opponentWins: opp?.wins ?? 0,
        opponentConnected: opp?.connected ?? false,
        turn: r.turn,
        yourTurn,
        statusLabel,
        updatedAt: r.updatedAt,
        difficulty: r.difficulty,
      };
    })
    .sort((a, b) => {
      // Your turn first, then recent
      if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
}

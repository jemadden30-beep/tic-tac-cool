import fs from "fs";
import path from "path";
import type { DotsRoomState, DotsMatchSummary } from "./types";
import { createDotsRoomState, DOTS_BOT_ID } from "./game";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "dots-rooms.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll(): Record<string, DotsRoomState> {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(rooms: Record<string, DotsRoomState>) {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(rooms, null, 2));
}

const rooms: Record<string, DotsRoomState> = loadAll();

function persist() {
  saveAll(rooms);
}

/** Avoid colliding with TTT codes — caller may pass reserved checker */
export function makeDotsCode(isTaken?: (code: string) => boolean): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms[code] && !(isTaken && isTaken(code))) return code;
  }
  return `D${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

export function createDotsRoom(
  opts: {
    hostId: string;
    hostName: string;
    mode: "online" | "hotseat" | "bot";
    firstTo: number;
    difficulty?: "easy" | "medium" | "hard" | "expert";
  },
  isTaken?: (code: string) => boolean
): DotsRoomState {
  const code = makeDotsCode(isTaken);
  const room = createDotsRoomState({ ...opts, code });
  rooms[code] = room;
  persist();
  return room;
}

export function getDotsRoom(code: string): DotsRoomState | undefined {
  return rooms[code.toUpperCase()];
}

export function saveDotsRoom(room: DotsRoomState) {
  room.updatedAt = Date.now();
  rooms[room.code] = room;
  persist();
}

export function dotsCodeTaken(code: string): boolean {
  return Boolean(rooms[code.toUpperCase()]);
}

function fullDotsRoomError(room: DotsRoomState): string {
  const p1 = room.players.find((p) => p.mark === "X");
  const p2 = room.players.find((p) => p.mark === "O");
  return `Room is full (P1: ${p1?.name || "—"}, P2: ${p2?.name || "—"}). Open this link on the same device you used before, or ask the host to free the P2 seat.`;
}

export function joinDotsRoom(
  code: string,
  playerId: string,
  name: string
): { ok: true; room: DotsRoomState } | { ok: false; error: string } {
  const room = getDotsRoom(code);
  if (!room) return { ok: false, error: "Room not found" };

  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    saveDotsRoom(room);
    return { ok: true, room };
  }

  if (room.mode === "bot") {
    return { ok: false, error: "Solo bot game — create your own" };
  }

  if (room.mode === "hotseat") {
    return {
      ok: false,
      error: "Hotseat is tied to the original device. Use the same browser to resume.",
    };
  }

  if (room.mode === "online") {
    const humans = room.players.filter((p) => p.id !== DOTS_BOT_ID);
    // Reclaim disconnected O (lobby or mid-game) — never steal connected O or X/host
    const oSeat = humans.find((p) => p.mark === "O");
    if (oSeat && oSeat.connected === false) {
      oSeat.id = playerId;
      oSeat.name = name || oSeat.name;
      oSeat.connected = true;
      saveDotsRoom(room);
      return { ok: true, room };
    }

    if (humans.length < 2) {
      room.players.push({
        id: playerId,
        name,
        mark: "O",
        energy: 50,
        usedPowers: [],
        boxes: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        connected: true,
        silenced: false,
      });
      saveDotsRoom(room);
      return { ok: true, room };
    }
  }

  return {
    ok: false,
    error: fullDotsRoomError(room),
  };
}

/** Host frees the O seat so a new guest can join. Lobby always; mid-game only if O is disconnected. */
export function kickDotsOSeat(
  code: string,
  hostPlayerId: string
): { ok: true; room: DotsRoomState } | { ok: false; error: string } {
  const room = getDotsRoom(code);
  if (!room) return { ok: false, error: "Room not found" };
  if (room.mode !== "online") return { ok: false, error: "Only online rooms have a freeable P2 seat" };
  if (room.hostId !== hostPlayerId) return { ok: false, error: "Only host can free the P2 seat" };
  const oIdx = room.players.findIndex((p) => p.mark === "O" && p.id !== DOTS_BOT_ID);
  if (oIdx < 0) return { ok: false, error: "No P2 seat to free" };
  const o = room.players[oIdx];
  if (room.phase !== "lobby" && o.connected) {
    return { ok: false, error: "P2 is still connected — wait until they leave, or stay in lobby" };
  }
  room.players.splice(oIdx, 1);
  saveDotsRoom(room);
  return { ok: true, room };
}

export function setDotsConnected(code: string, playerId: string, connected: boolean) {
  const room = getDotsRoom(code);
  if (!room) return;
  const p = room.players.find((x) => x.id === playerId);
  if (p) {
    p.connected = connected;
    saveDotsRoom(room);
  }
}

export function listDotsRoomsForPlayer(playerId: string): DotsMatchSummary[] {
  return Object.values(rooms)
    .filter((r) => r.mode === "online" && r.players.some((p) => p.id === playerId))
    .map((r) => {
      const me = r.players.find((p) => p.id === playerId)!;
      const opp = r.players.find((p) => p.id !== playerId);
      const yourTurn = r.phase === "playing" && me.mark === r.turn;
      let statusLabel = "Lobby";
      if (r.phase === "playing") statusLabel = yourTurn ? "Your turn" : "Their turn";
      else if (r.phase === "round_over") statusLabel = "Round over";
      else if (r.phase === "series_over") statusLabel = "Series over";
      return {
        gameKind: "dots" as const,
        code: r.code,
        mode: r.mode,
        phase: r.phase,
        firstTo: r.firstTo,
        myMark: me.mark,
        myWins: me.wins,
        opponentName: opp?.name || "Waiting for opponent…",
        opponentWins: opp?.wins ?? 0,
        opponentConnected: opp?.connected ?? false,
        turn: r.turn,
        yourTurn,
        statusLabel,
        updatedAt: r.updatedAt,
        difficulty: r.difficulty,
        myBoxes: me.boxes,
        opponentBoxes: opp?.boxes ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
}

import type { Cell, Mark, PowerId, PowerTarget, RoomState, PlayerState } from "./types";
import {
  ENERGY_MAX,
  ENERGY_PER_TURN,
  ENERGY_START,
  POWER_DEFS,
  powerAvailability,
} from "./powers";

export function emptyBoard(size: 3 | 4 | 5): Cell[] {
  return Array(size * size).fill(null);
}

/** Copy current board into top-left of a larger board; remap shields/locks. */
function expandBoardTo(room: RoomState, nextSize: 4 | 5) {
  const prev = room.boardSize;
  if (prev >= nextSize) return false;
  const next = emptyBoard(nextSize);
  for (let r = 0; r < prev; r++) {
    for (let c = 0; c < prev; c++) {
      next[r * nextSize + c] = room.board[r * prev + c];
    }
  }
  room.board = next;
  room.boardSize = nextSize;
  room.players.forEach((p) => {
    if (p.shieldIndex !== null) {
      const old = p.shieldIndex;
      const r = Math.floor(old / prev);
      const c = old % prev;
      p.shieldIndex = r * nextSize + c;
    }
  });
  if (room.lockedCell !== null) {
    const old = room.lockedCell;
    const r = Math.floor(old / prev);
    const c = old % prev;
    room.lockedCell = r * nextSize + c;
  }
  return true;
}

export function winningLines(size: 3 | 4 | 5): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    for (let c = 0; c < size; c++) row.push(r * size + c);
    lines.push(row);
  }
  for (let c = 0; c < size; c++) {
    const col: number[] = [];
    for (let r = 0; r < size; r++) col.push(r * size + c);
    lines.push(col);
  }
  const diag1: number[] = [];
  const diag2: number[] = [];
  for (let i = 0; i < size; i++) {
    diag1.push(i * size + i);
    diag2.push(i * size + (size - 1 - i));
  }
  lines.push(diag1, diag2);
  return lines;
}

export function checkWinner(
  board: Cell[],
  size: 3 | 4 | 5
): { winner: Mark; line: number[] } | null {
  for (const line of winningLines(size)) {
    const first = board[line[0]];
    if (first && line.every((i) => board[i] === first)) {
      return { winner: first, line };
    }
  }
  return null;
}

export function boardFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

export function opponentOf(mark: Mark): Mark {
  return mark === "X" ? "O" : "X";
}

export function playerByMark(room: RoomState, mark: Mark): PlayerState | undefined {
  return room.players.find((p) => p.mark === mark);
}

export function playerById(room: RoomState, id: string): PlayerState | undefined {
  return room.players.find((p) => p.id === id);
}

function clearShieldsOnTurnStart(room: RoomState, mark: Mark) {
  const p = playerByMark(room, mark);
  if (p) p.shieldIndex = null;
}

function isProtected(room: RoomState, index: number): boolean {
  return room.players.some((p) => p.shieldIndex === index);
}

function ensurePlayerEnergyFields(p: PlayerState) {
  if (typeof p.energy !== "number") p.energy = ENERGY_START;
  if (!Array.isArray(p.usedPowers)) p.usedPowers = [];
  if (typeof p.silenced !== "boolean") p.silenced = false;
}

export function grantTurnEnergy(room: RoomState, mark: Mark) {
  const p = playerByMark(room, mark);
  if (!p) return;
  ensurePlayerEnergyFields(p);
  p.energy = Math.min(ENERGY_MAX, p.energy + ENERGY_PER_TURN);
  // NOTE: do NOT clear silence here — Silence must last through the victim's full turn
}

function advanceTurn(room: RoomState) {
  // Silence lasts for the victim's next turn; clear when that turn ends
  const ending = playerByMark(room, room.turn);
  if (ending?.silenced) ending.silenced = false;

  room.turn = opponentOf(room.turn);
  // Clear lock when turn returns to the locker
  const locker = room.lockedBy;
  if (locker && room.turn === locker) {
    room.lockedCell = null;
    room.lockedBy = null;
  }
  grantTurnEnergy(room, room.turn);
}

export function startRound(room: RoomState) {
  if (typeof room.roundIndex !== "number") room.roundIndex = 0;
  if (room.roundIndex > 0 && room.players.length >= 2) {
    const a = room.players[0];
    const b = room.players[1];
    const tmp = a.mark;
    a.mark = b.mark;
    b.mark = tmp;
  }

  room.boardSize = 3;
  room.board = emptyBoard(3);
  room.turn = "X";
  room.winner = null;
  room.winningLine = null;
  room.phase = "playing";
  room.pendingPower = null;
  room.doublePending = false;
  room.powerUsedThisTurn = false;
  room.lastAnimation = null;
  room.lockedCell = null;
  room.lockedBy = null;
  room.lastPlace = null;
  for (const p of room.players) {
    p.powers = [];
    p.energy = ENERGY_START;
    p.usedPowers = [];
    p.shieldIndex = null;
    p.frozen = false;
    p.silenced = false;
  }
  // Opening player gains turn energy
  grantTurnEnergy(room, "X");
  room.roundIndex += 1;
  room.updatedAt = Date.now();
}

export function applyPlace(
  room: RoomState,
  playerId: string,
  index: number
): { ok: true } | { ok: false; error: string } {
  if (room.phase !== "playing") return { ok: false, error: "Not playing" };
  const player = playerById(room, playerId);
  if (!player) return { ok: false, error: "Unknown player" };

  if (room.mode === "hotseat") {
    // ok
  } else if (player.mark !== room.turn) {
    return { ok: false, error: "Not your turn" };
  }

  const acting = playerByMark(room, room.turn);
  if (!acting) return { ok: false, error: "No acting player" };
  if (room.mode === "online" && acting.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }
  if (room.mode === "bot" && acting.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }
  if (acting.frozen) {
    acting.frozen = false;
    advanceTurn(room);
    room.updatedAt = Date.now();
    return { ok: false, error: "You were frozen — turn skipped" };
  }

  if (index < 0 || index >= room.board.length) return { ok: false, error: "Bad cell" };
  if (room.board[index] !== null) return { ok: false, error: "Occupied" };
  if (room.lockedCell === index) return { ok: false, error: "Cell is locked" };

  clearShieldsOnTurnStart(room, room.turn);
  room.powerUsedThisTurn = false;
  room.lastAnimation = null;
  room.board[index] = room.turn;
  room.lastPlace = { mark: room.turn, index };

  const result = checkWinner(room.board, room.boardSize);
  if (result) {
    finishRound(room, result.winner, result.line);
    return { ok: true };
  }
  if (boardFull(room.board)) {
    room.phase = "round_over";
    room.winner = null;
    room.winningLine = null;
    room.updatedAt = Date.now();
    return { ok: true };
  }

  if (room.doublePending) {
    room.doublePending = false;
  } else {
    advanceTurn(room);
  }
  room.updatedAt = Date.now();
  return { ok: true };
}

function finishRound(room: RoomState, winner: Mark, line: number[]) {
  room.winner = winner;
  room.winningLine = line;
  room.phase = "round_over";
  const winP = playerByMark(room, winner);
  const loseP = playerByMark(room, opponentOf(winner));
  if (winP) {
    winP.wins += 1;
    winP.streak = Math.max(0, winP.streak) + 1;
  }
  if (loseP) {
    loseP.losses += 1;
    loseP.streak = 0;
  }
  if (winP && winP.wins >= room.firstTo) {
    room.phase = "series_over";
    room.seriesWinner = winP.id;
  }
  room.updatedAt = Date.now();
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function remapShields(room: RoomState, map: Map<number, number>) {
  for (const p of room.players) {
    if (p.shieldIndex !== null && map.has(p.shieldIndex)) {
      p.shieldIndex = map.get(p.shieldIndex)!;
    } else if (p.shieldIndex !== null) {
      p.shieldIndex = null;
    }
  }
  if (room.lockedCell !== null && map.has(room.lockedCell)) {
    room.lockedCell = map.get(room.lockedCell)!;
  }
}

export function applyPower(
  room: RoomState,
  playerId: string,
  power: PowerId,
  target: PowerTarget
): { ok: true } | { ok: false; error: string } {
  if (room.phase !== "playing") return { ok: false, error: "Not playing" };
  const player = playerById(room, playerId);
  if (!player) return { ok: false, error: "Unknown player" };

  if (room.mode === "hotseat") {
    const hot = room.players.find((p) => p.mark === room.turn);
    if (!hot) return { ok: false, error: "No player" };
    return applyPowerAs(room, hot, power, target);
  }
  return applyPowerAs(room, player, power, target);
}

function applyPowerAs(
  room: RoomState,
  player: PlayerState,
  power: PowerId,
  target: PowerTarget
): { ok: true } | { ok: false; error: string } {
  if (player.mark !== room.turn) return { ok: false, error: "Not your turn" };
  ensurePlayerEnergyFields(player);

  const avail = powerAvailability(room, player, power);
  if (!avail.ok) return { ok: false, error: avail.reason || "Unavailable" };

  if (player.frozen) {
    player.frozen = false;
    advanceTurn(room);
    room.updatedAt = Date.now();
    return { ok: false, error: "You were frozen — turn skipped" };
  }

  clearShieldsOnTurnStart(room, player.mark);
  const opp = opponentOf(player.mark);
  let meta: Record<string, unknown> = {};
  const size = room.boardSize;
  const cost = POWER_DEFS[power].cost;

  switch (power) {
    case "boot": {
      if (target.kind !== "cell") return { ok: false, error: "Pick a cell" };
      if (room.board[target.index] !== opp) return { ok: false, error: "Must boot opponent" };
      if (isProtected(room, target.index)) return { ok: false, error: "Shielded!" };
      room.board[target.index] = null;
      meta = { index: target.index };
      break;
    }
    case "lightning": {
      const candidates = room.board
        .map((c, i) => (c === opp && !isProtected(room, i) ? i : -1))
        .filter((i) => i >= 0);
      if (candidates.length === 0) return { ok: false, error: "No target" };
      const hit = candidates[Math.floor(Math.random() * candidates.length)];
      room.board[hit] = null;
      meta = { index: hit };
      break;
    }
    case "tornado": {
      const values = [...room.board];
      shuffleInPlace(values);
      room.players.forEach((p) => (p.shieldIndex = null));
      room.board = values;
      room.lockedCell = null;
      room.lockedBy = null;
      meta = { board: values };
      break;
    }
    case "broom": {
      if (target.kind !== "line") return { ok: false, error: "Pick a row or column" };
      const cleared: number[] = [];
      if (target.axis === "row") {
        for (let c = 0; c < size; c++) {
          const i = target.index * size + c;
          if (!isProtected(room, i)) {
            room.board[i] = null;
            cleared.push(i);
          }
        }
      } else {
        for (let r = 0; r < size; r++) {
          const i = r * size + target.index;
          if (!isProtected(room, i)) {
            room.board[i] = null;
            cleared.push(i);
          }
        }
      }
      room.players.forEach((p) => {
        if (p.shieldIndex !== null && cleared.includes(p.shieldIndex)) p.shieldIndex = null;
      });
      meta = { axis: target.axis, index: target.index, cleared };
      break;
    }
    case "expansion": {
      if (room.boardSize >= 4) return { ok: false, error: "Already expanded" };
      if (!expandBoardTo(room, 4)) return { ok: false, error: "Cannot expand" };
      meta = { size: 4 };
      break;
    }
    case "double_expansion": {
      if (room.boardSize >= 5) return { ok: false, error: "Already 5×5" };
      if (!(player.usedPowers || []).includes("expansion")) {
        return { ok: false, error: "Use Expansion first" };
      }
      if ((player.energy ?? 0) <= 0) return { ok: false, error: "Need some ⚡" };
      if (!expandBoardTo(room, 5)) return { ok: false, error: "Cannot expand" };
      meta = { size: 5, drained: player.energy };
      break;
    }
    case "swap": {
      if (target.kind !== "pair") return { ok: false, error: "Pick two cells" };
      const { a, b } = target;
      if (room.board[a] !== player.mark) return { ok: false, error: "First must be yours" };
      if (room.board[b] !== opp) return { ok: false, error: "Second must be opponent" };
      if (isProtected(room, a) || isProtected(room, b)) return { ok: false, error: "Shielded!" };
      room.board[a] = opp;
      room.board[b] = player.mark;
      meta = { a, b };
      break;
    }
    case "shield": {
      if (target.kind !== "cell") return { ok: false, error: "Pick a cell" };
      if (room.board[target.index] !== player.mark) return { ok: false, error: "Shield your tile" };
      player.shieldIndex = target.index;
      meta = { index: target.index };
      break;
    }
    case "double": {
      if (room.boardSize < 4) return { ok: false, error: "Need 4×4 board" };
      room.doublePending = true;
      meta = {};
      break;
    }
    case "column_switch": {
      const order = Array.from({ length: size }, (_, i) => i);
      shuffleInPlace(order);
      const next = emptyBoard(size);
      const map = new Map<number, number>();
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const from = r * size + c;
          const to = r * size + order[c];
          next[to] = room.board[from];
          map.set(from, to);
        }
      }
      room.board = next;
      remapShields(room, map);
      meta = { order, axis: "col" };
      break;
    }
    case "row_switch": {
      const order = Array.from({ length: size }, (_, i) => i);
      shuffleInPlace(order);
      const next = emptyBoard(size);
      const map = new Map<number, number>();
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const from = r * size + c;
          const to = order[r] * size + c;
          next[to] = room.board[from];
          map.set(from, to);
        }
      }
      room.board = next;
      remapShields(room, map);
      meta = { order, axis: "row" };
      break;
    }
    case "mirror": {
      const next = emptyBoard(size);
      const map = new Map<number, number>();
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const from = r * size + c;
          const to = r * size + (size - 1 - c);
          next[to] = room.board[from];
          map.set(from, to);
        }
      }
      room.board = next;
      remapShields(room, map);
      meta = { flipped: true };
      break;
    }
    case "time_warp": {
      const last = room.lastPlace;
      if (!last || last.mark !== opp) {
        return { ok: false, error: "No opponent place to undo" };
      }
      if (room.board[last.index] !== opp) {
        return { ok: false, error: "That tile is gone" };
      }
      if (isProtected(room, last.index)) return { ok: false, error: "Shielded!" };
      room.board[last.index] = null;
      meta = { index: last.index };
      room.lastPlace = null;
      break;
    }
    case "gravity": {
      if (target.kind !== "edge") return { ok: false, error: "Pick an edge" };
      const next = emptyBoard(size);
      const edge = target.edge;
      if (edge === "down" || edge === "up") {
        for (let c = 0; c < size; c++) {
          const col: Cell[] = [];
          for (let r = 0; r < size; r++) col.push(room.board[r * size + c]);
          const filled = col.filter((x) => x !== null);
          const emptyCount = size - filled.length;
          const rebuilt: Cell[] =
            edge === "down"
              ? [...Array(emptyCount).fill(null), ...filled]
              : [...filled, ...Array(emptyCount).fill(null)];
          for (let r = 0; r < size; r++) next[r * size + c] = rebuilt[r];
        }
      } else {
        for (let r = 0; r < size; r++) {
          const row: Cell[] = [];
          for (let c = 0; c < size; c++) row.push(room.board[r * size + c]);
          const filled = row.filter((x) => x !== null);
          const emptyCount = size - filled.length;
          const rebuilt: Cell[] =
            edge === "right"
              ? [...Array(emptyCount).fill(null), ...filled]
              : [...filled, ...Array(emptyCount).fill(null)];
          for (let c = 0; c < size; c++) next[r * size + c] = rebuilt[c];
        }
      }
      room.board = next;
      room.players.forEach((p) => (p.shieldIndex = null));
      room.lockedCell = null;
      room.lockedBy = null;
      meta = { edge };
      break;
    }
    case "bomb": {
      if (target.kind !== "cell") return { ok: false, error: "Pick top-left of 2×2" };
      const tl = target.index;
      const r0 = Math.floor(tl / size);
      const c0 = tl % size;
      if (r0 > size - 2 || c0 > size - 2) {
        return { ok: false, error: "2×2 must fit on the board" };
      }
      const cleared: number[] = [];
      for (const [dr, dc] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ] as const) {
        const i = (r0 + dr) * size + (c0 + dc);
        if (!isProtected(room, i)) {
          room.board[i] = null;
          cleared.push(i);
        }
      }
      room.players.forEach((p) => {
        if (p.shieldIndex !== null && cleared.includes(p.shieldIndex)) p.shieldIndex = null;
      });
      meta = { cleared, index: tl };
      break;
    }
    case "lock": {
      if (target.kind !== "cell") return { ok: false, error: "Pick empty cell" };
      if (room.board[target.index] !== null) return { ok: false, error: "Must be empty" };
      room.lockedCell = target.index;
      room.lockedBy = player.mark;
      meta = { index: target.index };
      break;
    }
    case "clone": {
      if (target.kind !== "pair") return { ok: false, error: "Pick opponent tile, then empty" };
      const { a, b } = target;
      if (room.board[a] !== opp) return { ok: false, error: "First must be opponent" };
      if (room.board[b] !== null) return { ok: false, error: "Second must be empty" };
      if (room.lockedCell === b) return { ok: false, error: "Cell is locked" };
      room.board[b] = player.mark;
      meta = { a, b };
      break;
    }
    case "silence": {
      const victim = playerByMark(room, opp);
      if (victim) victim.silenced = true;
      meta = {};
      break;
    }
    default:
      return { ok: false, error: "Unknown power" };
  }

  if (power === "double_expansion") {
    player.energy = 0;
  } else {
    player.energy = Math.max(0, player.energy - cost);
  }
  player.usedPowers = [...(player.usedPowers || []), power];
  room.powerUsedThisTurn = true;

  room.lastAnimation = {
    id: `${Date.now()}-${power}`,
    power,
    by: player.mark,
    at: Date.now(),
    meta,
  };

  const result = checkWinner(room.board, room.boardSize);
  if (result) {
    finishRound(room, result.winner, result.line);
    return { ok: true };
  }

  room.updatedAt = Date.now();
  return { ok: true };
}

function blankPlayer(
  id: string,
  name: string,
  mark: Mark
): PlayerState {
  return {
    id,
    name,
    mark,
    powers: [],
    energy: ENERGY_START,
    usedPowers: [],
    wins: 0,
    losses: 0,
    streak: 0,
    connected: true,
    shieldIndex: null,
    frozen: false,
    silenced: false,
  };
}

export function createRoomState(opts: {
  code: string;
  hostId: string;
  hostName: string;
  mode: "online" | "hotseat" | "bot";
  firstTo: number;
  difficulty?: "easy" | "medium" | "hard" | "expert";
}): RoomState {
  const host = blankPlayer(opts.hostId, opts.hostName, "X");

  const room: RoomState = {
    code: opts.code,
    hostId: opts.hostId,
    phase: "lobby",
    mode: opts.mode,
    difficulty: opts.mode === "bot" ? opts.difficulty || "medium" : null,
    firstTo: opts.firstTo,
    boardSize: 3,
    board: emptyBoard(3),
    turn: "X",
    players: [host],
    chat: [],
    winner: null,
    winningLine: null,
    seriesWinner: null,
    lastAnimation: null,
    pendingPower: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    doublePending: false,
    powerUsedThisTurn: false,
    roundIndex: 0,
    lockedCell: null,
    lockedBy: null,
    lastPlace: null,
  };

  if (opts.mode === "hotseat") {
    room.players.push(blankPlayer(`${opts.hostId}-o`, "Player O", "O"));
  }

  if (opts.mode === "bot") {
    const labels: Record<string, string> = {
      easy: "Bot (Easy)",
      medium: "Bot (Medium)",
      hard: "Bot (Hard)",
      expert: "Bot (Expert)",
    };
    const diff = opts.difficulty || "medium";
    room.players.push(blankPlayer("ttc-bot", labels[diff] || "Bot", "O"));
  }

  return room;
}

export function resetSeriesForRematch(room: RoomState) {
  room.roundIndex = 0;
  if (room.players[0]) room.players[0].mark = "X";
  if (room.players[1]) room.players[1].mark = "O";
}

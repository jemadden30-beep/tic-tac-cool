import type { Cell, Mark, PowerId, PowerTarget, RoomState, PlayerState } from "./types";
import { dealPowers } from "./powers";

export function emptyBoard(size: 3 | 4): Cell[] {
  return Array(size * size).fill(null);
}

export function winningLines(size: 3 | 4): number[][] {
  const lines: number[][] = [];
  const need = size;
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
  // For 4x4 we only use full length lines (need === size)
  void need;
  return lines;
}

export function checkWinner(
  board: Cell[],
  size: 3 | 4
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

export function startRound(room: RoomState) {
  // Alternate who is X each round: X always opens, marks swap after round 0
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
  room.lastAnimation = null;
  for (const p of room.players) {
    p.powers = dealPowers(3);
    p.shieldIndex = null;
    p.frozen = false;
  }
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
    // In hotseat, either seated player can act for current mark if local
  } else if (player.mark !== room.turn) {
    return { ok: false, error: "Not your turn" };
  }

  const acting = playerByMark(room, room.turn);
  if (!acting) return { ok: false, error: "No acting player" };
  if (room.mode === "online" && acting.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }
  if (acting.frozen) {
    acting.frozen = false;
    room.turn = opponentOf(room.turn);
    room.updatedAt = Date.now();
    return { ok: false, error: "You were frozen — turn skipped" };
  }

  if (index < 0 || index >= room.board.length) return { ok: false, error: "Bad cell" };
  if (room.board[index] !== null) return { ok: false, error: "Occupied" };

  clearShieldsOnTurnStart(room, room.turn);
  room.board[index] = room.turn;

  const result = checkWinner(room.board, room.boardSize);
  if (result) {
    finishRound(room, result.winner, result.line);
    return { ok: true };
  }
  if (boardFull(room.board)) {
    // draw — no score change, next round
    room.phase = "round_over";
    room.winner = null;
    room.winningLine = null;
    room.updatedAt = Date.now();
    return { ok: true };
  }

  if (room.doublePending) {
    room.doublePending = false;
    // same turn continues
  } else {
    room.turn = opponentOf(room.turn);
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

export function applyPower(
  room: RoomState,
  playerId: string,
  power: PowerId,
  target: PowerTarget
): { ok: true } | { ok: false; error: string } {
  if (room.phase !== "playing") return { ok: false, error: "Not playing" };
  const player = playerById(room, playerId);
  if (!player) return { ok: false, error: "Unknown player" };

  if (room.mode === "online" && player.mark !== room.turn) {
    return { ok: false, error: "Not your turn" };
  }
  if (room.mode === "hotseat") {
    const acting = playerByMark(room, room.turn);
    if (!acting) return { ok: false, error: "No player" };
    // hotseat: use current turn's powers from the player who owns that mark
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
  const idx = player.powers.indexOf(power);
  if (idx === -1) return { ok: false, error: "You don't have that power" };
  if (player.frozen) {
    player.frozen = false;
    room.turn = opponentOf(room.turn);
    room.updatedAt = Date.now();
    return { ok: false, error: "You were frozen — turn skipped" };
  }

  clearShieldsOnTurnStart(room, player.mark);
  const opp = opponentOf(player.mark);
  let meta: Record<string, unknown> = {};
  let consumeTurn = true;
  let keepPower = false;

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
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      // Move shields with tiles? Clear shields for simplicity after shuffle
      room.players.forEach((p) => (p.shieldIndex = null));
      room.board = values;
      meta = { board: values };
      break;
    }
    case "broom": {
      if (target.kind !== "line") return { ok: false, error: "Pick a row or column" };
      const size = room.boardSize;
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
      if (room.boardSize === 4) return { ok: false, error: "Already 4×4" };
      const next = emptyBoard(4);
      // center the 3x3 into 4x4 top-left
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          next[r * 4 + c] = room.board[r * 3 + c];
        }
      }
      room.board = next;
      room.boardSize = 4;
      room.players.forEach((p) => {
        if (p.shieldIndex !== null) {
          const old = p.shieldIndex;
          const r = Math.floor(old / 3);
          const c = old % 3;
          p.shieldIndex = r * 4 + c;
        }
      });
      meta = { size: 4 };
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
      room.doublePending = true;
      consumeTurn = false;
      keepPower = false;
      meta = {};
      break;
    }
    default:
      return { ok: false, error: "Unknown power" };
  }

  if (!keepPower) player.powers.splice(idx, 1);

  room.lastAnimation = {
    id: `${Date.now()}-${power}`,
    power,
    by: player.mark,
    at: Date.now(),
    meta,
  };

  // Win check after board-changing powers
  const result = checkWinner(room.board, room.boardSize);
  if (result) {
    finishRound(room, result.winner, result.line);
    return { ok: true };
  }

  if (consumeTurn) {
    room.turn = opponentOf(room.turn);
  }
  room.updatedAt = Date.now();
  return { ok: true };
}

export function createRoomState(opts: {
  code: string;
  hostId: string;
  hostName: string;
  mode: "online" | "hotseat" | "bot";
  firstTo: number;
  difficulty?: "easy" | "medium" | "hard" | "expert";
}): RoomState {
  const host: PlayerState = {
    id: opts.hostId,
    name: opts.hostName,
    mark: "X",
    powers: [],
    wins: 0,
    losses: 0,
    streak: 0,
    connected: true,
    shieldIndex: null,
    frozen: false,
  };

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
    roundIndex: 0,
  };

  if (opts.mode === "hotseat") {
    room.players.push({
      id: `${opts.hostId}-o`,
      name: "Player O",
      mark: "O",
      powers: [],
      wins: 0,
      losses: 0,
      streak: 0,
      connected: true,
      shieldIndex: null,
      frozen: false,
    });
  }

  if (opts.mode === "bot") {
    const labels: Record<string, string> = {
      easy: "Bot (Easy)",
      medium: "Bot (Medium)",
      hard: "Bot (Hard)",
      expert: "Bot (Expert)",
    };
    const diff = opts.difficulty || "medium";
    room.players.push({
      id: "ttc-bot",
      name: labels[diff] || "Bot",
      mark: "O",
      powers: [],
      wins: 0,
      losses: 0,
      streak: 0,
      connected: true,
      shieldIndex: null,
      frozen: false,
    });
  }

  return room;
}


export function resetSeriesForRematch(room: RoomState) {
  room.roundIndex = 0;
  // Host / first seat is X again
  if (room.players[0]) room.players[0].mark = "X";
  if (room.players[1]) room.players[1].mark = "O";
}

import {
  boardFull,
  checkWinner,
  opponentOf,
  playerByMark,
  winningLines,
} from "./game";
import { POWER_DEFS, powerAvailability, POWER_ORDER } from "./powers";
import type {
  BotDifficulty,
  Cell,
  Mark,
  PowerId,
  PowerTarget,
  RoomState,
} from "./types";

export const BOT_ID = "ttc-bot";

export type BotAction =
  | { type: "place"; index: number }
  | { type: "power"; power: PowerId; target: PowerTarget };

function empties(board: Cell[], locked: number | null): number[] {
  return board
    .map((c, i) => (c === null && i !== locked ? i : -1))
    .filter((i) => i >= 0);
}

function isProtected(room: RoomState, index: number): boolean {
  return room.players.some((p) => p.shieldIndex === index);
}

function wouldWin(board: Cell[], size: 3 | 4, index: number, mark: Mark): boolean {
  if (board[index] !== null) return false;
  const next = [...board];
  next[index] = mark;
  return !!checkWinner(next, size);
}

function findWinningMove(
  board: Cell[],
  size: 3 | 4,
  mark: Mark,
  locked: number | null
): number | null {
  for (const i of empties(board, locked)) {
    if (wouldWin(board, size, i, mark)) return i;
  }
  return null;
}

function countMark(board: Cell[], line: number[], mark: Mark): number {
  return line.reduce((n, i) => n + (board[i] === mark ? 1 : 0), 0);
}

function heuristic(board: Cell[], size: 3 | 4, me: Mark): number {
  const opp = opponentOf(me);
  const win = checkWinner(board, size);
  if (win?.winner === me) return 10000;
  if (win?.winner === opp) return -10000;
  let score = 0;
  for (const line of winningLines(size)) {
    const mine = countMark(board, line, me);
    const theirs = countMark(board, line, opp);
    if (mine > 0 && theirs > 0) continue;
    if (mine === size - 1) score += 120;
    else if (mine === size - 2) score += 18;
    else if (mine > 0) score += mine * 3;
    if (theirs === size - 1) score -= 140;
    else if (theirs === size - 2) score -= 22;
    else if (theirs > 0) score -= theirs * 3;
  }
  const center = size === 3 ? [4] : [5, 6, 9, 10];
  for (const c of center) if (board[c] === me) score += 4;
  return score;
}

function minimax(
  board: Cell[],
  size: 3 | 4,
  me: Mark,
  turn: Mark,
  depth: number,
  alpha: number,
  beta: number,
  locked: number | null
): number {
  const win = checkWinner(board, size);
  if (win) return win.winner === me ? 1000 - depth : -1000 + depth;
  if (boardFull(board) || depth <= 0) return heuristic(board, size, me);
  const moves = empties(board, locked);
  if (turn === me) {
    let best = -Infinity;
    for (const m of moves) {
      const next = [...board];
      next[m] = turn;
      best = Math.max(
        best,
        minimax(next, size, me, opponentOf(turn), depth - 1, alpha, beta, locked)
      );
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best === -Infinity ? 0 : best;
  }
  let best = Infinity;
  for (const m of moves) {
    const next = [...board];
    next[m] = turn;
    best = Math.min(
      best,
      minimax(next, size, me, opponentOf(turn), depth - 1, alpha, beta, locked)
    );
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best === Infinity ? 0 : best;
}

function bestPlace(room: RoomState, me: Mark, depth: number): number {
  const moves = empties(room.board, room.lockedCell);
  if (moves.length === 0) return 0;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const next = [...room.board];
    next[m] = me;
    const score = minimax(
      next,
      room.boardSize,
      me,
      opponentOf(me),
      depth,
      -Infinity,
      Infinity,
      room.lockedCell
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function opponentCells(room: RoomState, opp: Mark): number[] {
  return room.board
    .map((c, i) => (c === opp && !isProtected(room, i) ? i : -1))
    .filter((i) => i >= 0);
}

function ownCells(room: RoomState, me: Mark): number[] {
  return room.board.map((c, i) => (c === me ? i : -1)).filter((i) => i >= 0);
}

function buildPowerAction(
  room: RoomState,
  me: Mark,
  power: PowerId
): BotAction | null {
  const bot = playerByMark(room, me);
  if (!bot) return null;
  if (!powerAvailability(room, bot, power).ok) return null;

  const opp = opponentOf(me);
  const oppTiles = opponentCells(room, opp);
  const myTiles = ownCells(room, me);
  const empty = empties(room.board, room.lockedCell);
  const size = room.boardSize;

  switch (power) {
    case "lightning":
      if (oppTiles.length === 0) return null;
      return { type: "power", power, target: { kind: "none" } };
    case "boot":
      if (oppTiles.length === 0) return null;
      return { type: "power", power, target: { kind: "cell", index: pickRandom(oppTiles) } };
    case "tornado":
    case "column_switch":
    case "row_switch":
    case "mirror":
    case "silence":
      return { type: "power", power, target: { kind: "none" } };
    case "time_warp":
      if (!room.lastPlace || room.lastPlace.mark !== opp) return null;
      return { type: "power", power, target: { kind: "none" } };
    case "expansion":
      if (room.boardSize === 4) return null;
      return { type: "power", power, target: { kind: "none" } };
    case "double":
      if (room.boardSize < 4 || empty.length < 2) return null;
      return { type: "power", power, target: { kind: "none" } };
    case "broom": {
      let best: { axis: "row" | "col"; index: number; score: number } | null = null;
      for (const axis of ["row", "col"] as const) {
        for (let i = 0; i < size; i++) {
          let score = 0;
          for (let j = 0; j < size; j++) {
            const idx = axis === "row" ? i * size + j : j * size + i;
            if (room.board[idx] === opp && !isProtected(room, idx)) score += 3;
            if (room.board[idx] === me) score -= 2;
          }
          if (!best || score > best.score) best = { axis, index: i, score };
        }
      }
      if (!best || best.score <= 0) return null;
      return { type: "power", power, target: { kind: "line", axis: best.axis, index: best.index } };
    }
    case "swap":
      if (!myTiles.length || !oppTiles.length) return null;
      return {
        type: "power",
        power,
        target: { kind: "pair", a: pickRandom(myTiles), b: pickRandom(oppTiles) },
      };
    case "shield":
      if (!myTiles.length) return null;
      return { type: "power", power, target: { kind: "cell", index: pickRandom(myTiles) } };
    case "gravity":
      return {
        type: "power",
        power,
        target: { kind: "edge", edge: pickRandom(["down", "up", "left", "right"] as const) },
      };
    case "bomb": {
      const candidates: number[] = [];
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) candidates.push(r * size + c);
      }
      if (!candidates.length) return null;
      return { type: "power", power, target: { kind: "cell", index: pickRandom(candidates) } };
    }
    case "lock":
      if (!empty.length) return null;
      return { type: "power", power, target: { kind: "cell", index: pickRandom(empty) } };
    case "clone":
      if (!oppTiles.length || !empty.length) return null;
      return {
        type: "power",
        power,
        target: { kind: "pair", a: pickRandom(oppTiles), b: pickRandom(empty) },
      };
    default:
      return null;
  }
}

function maybePower(
  room: RoomState,
  me: Mark,
  difficulty: BotDifficulty
): BotAction | null {
  const bot = playerByMark(room, me);
  if (!bot || bot.silenced) return null;

  const chance =
    difficulty === "easy"
      ? 0.1
      : difficulty === "medium"
        ? 0.25
        : difficulty === "hard"
          ? 0.4
          : 0.55;

  const opp = opponentOf(me);
  const oppTiles = opponentCells(room, opp);

  if ((difficulty === "hard" || difficulty === "expert") && oppTiles.length) {
    for (const power of ["boot", "lightning", "time_warp"] as PowerId[]) {
      const action = buildPowerAction(room, me, power);
      if (action) return action;
    }
  }

  if (Math.random() > chance) return null;

  const cheapFirst: PowerId[] =
    difficulty === "easy"
      ? ["boot", "lightning", "shield", "mirror"]
      : [
          "boot",
          "lightning",
          "time_warp",
          "shield",
          "silence",
          "broom",
          "bomb",
          "lock",
          "clone",
          "column_switch",
          "row_switch",
          "mirror",
          "gravity",
          "swap",
          "double",
          "tornado",
          "expansion",
        ];

  for (const power of cheapFirst) {
    if (!POWER_ORDER.includes(power)) continue;
    // Prefer affordable
    if ((bot.energy ?? 0) < POWER_DEFS[power].cost) continue;
    const action = buildPowerAction(room, me, power);
    if (action) return action;
  }
  return null;
}

export function chooseBotAction(room: RoomState): BotAction | null {
  if (room.phase !== "playing") return null;
  const difficulty = room.difficulty || "medium";
  const botPlayer = room.players.find((p) => p.id === BOT_ID);
  if (!botPlayer || room.turn !== botPlayer.mark) return null;
  const me = botPlayer.mark;
  const opp = opponentOf(me);
  const moves = empties(room.board, room.lockedCell);

  if (difficulty !== "easy") {
    const winAt = findWinningMove(room.board, room.boardSize, me, room.lockedCell);
    if (winAt !== null) return { type: "place", index: winAt };
    const blockAt = findWinningMove(room.board, room.boardSize, opp, room.lockedCell);
    if (blockAt !== null) return { type: "place", index: blockAt };
  }

  if (!room.doublePending && !room.powerUsedThisTurn) {
    const powerAct = maybePower(room, me, difficulty);
    if (powerAct) return powerAct;
  }

  if (moves.length === 0) return null;

  if (difficulty === "easy") return { type: "place", index: pickRandom(moves) };

  if (difficulty === "medium") {
    if (Math.random() < 0.55) {
      let best = moves[0];
      let bestScore = -Infinity;
      for (const m of moves) {
        const next = [...room.board];
        next[m] = me;
        const s = heuristic(next, room.boardSize, me) + Math.random();
        if (s > bestScore) {
          bestScore = s;
          best = m;
        }
      }
      return { type: "place", index: best };
    }
    return { type: "place", index: pickRandom(moves) };
  }

  const depth =
    difficulty === "expert"
      ? room.boardSize === 3
        ? 8
        : 3
      : room.boardSize === 3
        ? 6
        : 2;
  return { type: "place", index: bestPlace(room, me, depth) };
}

export function difficultyLabel(d: BotDifficulty): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

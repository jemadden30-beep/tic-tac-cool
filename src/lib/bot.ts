import {
  boardFull,
  checkWinner,
  opponentOf,
  playerByMark,
  winningLines,
} from "./game";
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

function empties(board: Cell[]): number[] {
  return board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
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

function findWinningMove(board: Cell[], size: 3 | 4, mark: Mark): number | null {
  for (const i of empties(board)) {
    if (wouldWin(board, size, i, mark)) return i;
  }
  return null;
}

function countMark(board: Cell[], line: number[], mark: Mark): number {
  return line.reduce((n, i) => n + (board[i] === mark ? 1 : 0), 0);
}

function lineOpen(board: Cell[], line: number[]): boolean {
  return line.every((i) => board[i] !== null ? true : true) && !line.some((i) => {
    const v = board[i];
    return v !== null && line.some((j) => board[j] !== null && board[j] !== v && board[i] !== board[j]);
  });
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
  // prefer center / near-center
  const center = size === 3 ? [4] : [5, 6, 9, 10];
  for (const c of center) if (board[c] === me) score += 4;
  void lineOpen;
  return score;
}

function minimax(
  board: Cell[],
  size: 3 | 4,
  me: Mark,
  turn: Mark,
  depth: number,
  alpha: number,
  beta: number
): number {
  const win = checkWinner(board, size);
  if (win) return win.winner === me ? 1000 - depth : -1000 + depth;
  if (boardFull(board) || depth <= 0) return heuristic(board, size, me);

  const moves = empties(board);
  if (turn === me) {
    let best = -Infinity;
    for (const m of moves) {
      const next = [...board];
      next[m] = turn;
      best = Math.max(best, minimax(next, size, me, opponentOf(turn), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const next = [...board];
    next[m] = turn;
    best = Math.min(best, minimax(next, size, me, opponentOf(turn), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function bestPlace(room: RoomState, me: Mark, depth: number): number {
  const moves = empties(room.board);
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
      Infinity
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

function maybePower(
  room: RoomState,
  me: Mark,
  difficulty: BotDifficulty
): BotAction | null {
  const bot = playerByMark(room, me);
  if (!bot || bot.powers.length === 0) return null;

  const opp = opponentOf(me);
  const oppTiles = opponentCells(room, opp);
  const chance =
    difficulty === "easy"
      ? 0.12
      : difficulty === "medium"
        ? 0.28
        : difficulty === "hard"
          ? 0.45
          : 0.62;

  // Always consider defensive/offensive powers at higher diffs
  const threat = findWinningMove(room.board, room.boardSize, opp);
  if (threat !== null && (difficulty === "hard" || difficulty === "expert")) {
    if (bot.powers.includes("boot") && oppTiles.includes(threat) === false) {
      // threat is empty — can't boot it; try broom on that line
    }
    // If opponent is about to win by filling empty, boot isn't on empty.
    // Remove an opponent piece on a hot line instead.
    for (const power of ["boot", "lightning"] as PowerId[]) {
      if (!bot.powers.includes(power) || oppTiles.length === 0) continue;
      if (power === "boot") {
        // prefer opponent tile on a line with many opp marks
        let best = oppTiles[0];
        let bestScore = -1;
        for (const idx of oppTiles) {
          let s = 0;
          for (const line of winningLines(room.boardSize)) {
            if (!line.includes(idx)) continue;
            s += countMark(room.board, line, opp) * 10;
          }
          if (s > bestScore) {
            bestScore = s;
            best = idx;
          }
        }
        return { type: "power", power: "boot", target: { kind: "cell", index: best } };
      }
      return { type: "power", power: "lightning", target: { kind: "none" } };
    }
  }

  if (Math.random() > chance) return null;

  const usable = [...bot.powers];
  // Easy: only lightning / tornado / random boot
  if (difficulty === "easy") {
    const weak = usable.filter((p) =>
      ["lightning", "tornado", "boot", "broom"].includes(p)
    );
    if (weak.length === 0) return null;
    const power = pickRandom(weak);
    return buildPowerAction(room, me, power);
  }

  // Prefer useful powers
  const priority: PowerId[] =
    difficulty === "expert"
      ? ["boot", "lightning", "shield", "double", "broom", "swap", "expansion", "tornado"]
      : difficulty === "hard"
        ? ["boot", "shield", "lightning", "double", "broom", "swap", "tornado", "expansion"]
        : ["lightning", "boot", "broom", "double", "shield", "tornado", "swap", "expansion"];

  for (const power of priority) {
    if (!usable.includes(power)) continue;
    const action = buildPowerAction(room, me, power);
    if (action) return action;
  }
  return null;
}

function buildPowerAction(
  room: RoomState,
  me: Mark,
  power: PowerId
): BotAction | null {
  const opp = opponentOf(me);
  const oppTiles = opponentCells(room, opp);
  const myTiles = ownCells(room, me);

  switch (power) {
    case "lightning":
      if (oppTiles.length === 0) return null;
      return { type: "power", power, target: { kind: "none" } };
    case "boot":
      if (oppTiles.length === 0) return null;
      return {
        type: "power",
        power,
        target: { kind: "cell", index: pickRandom(oppTiles) },
      };
    case "tornado":
      return { type: "power", power, target: { kind: "none" } };
    case "broom": {
      const size = room.boardSize;
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
      return {
        type: "power",
        power,
        target: { kind: "line", axis: best.axis, index: best.index },
      };
    }
    case "expansion":
      if (room.boardSize === 4) return null;
      return { type: "power", power, target: { kind: "none" } };
    case "swap": {
      if (myTiles.length === 0 || oppTiles.length === 0) return null;
      return {
        type: "power",
        power,
        target: {
          kind: "pair",
          a: pickRandom(myTiles),
          b: pickRandom(oppTiles),
        },
      };
    }
    case "shield":
      if (myTiles.length === 0) return null;
      return {
        type: "power",
        power,
        target: { kind: "cell", index: pickRandom(myTiles) },
      };
    case "double":
      if (empties(room.board).length < 2) return null;
      return { type: "power", power, target: { kind: "none" } };
    default:
      return null;
  }
}

export function chooseBotAction(room: RoomState): BotAction | null {
  if (room.phase !== "playing") return null;
  const difficulty = room.difficulty || "medium";
  const me = "O";
  const bot = playerByMark(room, me);
  if (!bot || room.turn !== me) return null;
  if (bot.frozen) {
    // server will clear on failed place — pick a place anyway
  }

  const opp = opponentOf(me);
  const moves = empties(room.board);
  if (moves.length === 0 && bot.powers.length === 0) return null;

  // Immediate win / block for medium+
  if (difficulty !== "easy") {
    const winAt = findWinningMove(room.board, room.boardSize, me);
    if (winAt !== null) return { type: "place", index: winAt };
    const blockAt = findWinningMove(room.board, room.boardSize, opp);
    if (blockAt !== null) {
      return { type: "place", index: blockAt };
    }
  }

  // Power before place sometimes
  if (!room.doublePending) {
    const powerAct = maybePower(room, me, difficulty);
    if (powerAct) return powerAct;
  }

  if (moves.length === 0) return null;

  if (difficulty === "easy") {
    return { type: "place", index: pickRandom(moves) };
  }

  if (difficulty === "medium") {
    // mild: 50% best-ish heuristic one-ply, else random among non-terrible
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

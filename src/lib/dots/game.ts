import type { Mark, BotDifficulty } from "../types";
import {
  BOXES,
  DOTS,
  ENERGY_PER_TURN,
  START_ENERGY,
  type DotsRoomState,
  type DotsPlayer,
  type EdgeId,
  type DotsPowerId,
  type DotsPowerTarget,
} from "./types";
import { DOTS_POWER_DEFS } from "./powers";

export const DOTS_BOT_ID = "ttc-dots-bot";

export function hEdge(r: number, c: number): EdgeId {
  return `h:${r}:${c}` as EdgeId;
}
export function vEdge(r: number, c: number): EdgeId {
  return `v:${r}:${c}` as EdgeId;
}

export function parseEdge(id: string): { axis: "h" | "v"; r: number; c: number } | null {
  const m = /^(h|v):(\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return { axis: m[1] as "h" | "v", r: Number(m[2]), c: Number(m[3]) };
}

export function isValidEdge(id: string): boolean {
  const p = parseEdge(id);
  if (!p) return false;
  if (p.axis === "h") return p.r >= 0 && p.r < DOTS && p.c >= 0 && p.c < BOXES;
  return p.r >= 0 && p.r < BOXES && p.c >= 0 && p.c < DOTS;
}

export function allEdgeIds(): EdgeId[] {
  const out: EdgeId[] = [];
  for (let r = 0; r < DOTS; r++) for (let c = 0; c < BOXES; c++) out.push(hEdge(r, c));
  for (let r = 0; r < BOXES; r++) for (let c = 0; c < DOTS; c++) out.push(vEdge(r, c));
  return out;
}

/** Four edges around box at (br, bc) */
export function boxEdges(br: number, bc: number): EdgeId[] {
  return [hEdge(br, bc), hEdge(br + 1, bc), vEdge(br, bc), vEdge(br, bc + 1)];
}

export function boxIndex(br: number, bc: number) {
  return br * BOXES + bc;
}

export function boxCoords(index: number) {
  return { br: Math.floor(index / BOXES), bc: index % BOXES };
}

function makePlayer(
  id: string,
  name: string,
  mark: Mark,
  connected: boolean
): DotsPlayer {
  return {
    id,
    name,
    mark,
    energy: START_ENERGY,
    usedPowers: [],
    boxes: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    connected,
    silenced: false,
  };
}

export function createDotsRoomState(opts: {
  code: string;
  hostId: string;
  hostName: string;
  mode: "online" | "hotseat" | "bot";
  firstTo: number;
  difficulty?: BotDifficulty;
}): DotsRoomState {
  const now = Date.now();
  const players: DotsPlayer[] = [
    makePlayer(opts.hostId, opts.hostName || "Host", "X", true),
  ];
  if (opts.mode === "bot") {
    const labels: Record<string, string> = {
      easy: "Dot Bot (Easy)",
      medium: "Dot Bot (Medium)",
      hard: "Dot Bot (Hard)",
      expert: "Dot Bot (Expert)",
    };
    const d = opts.difficulty || "medium";
    players.push(makePlayer(DOTS_BOT_ID, labels[d] || "Dot Bot", "O", true));
  } else if (opts.mode === "hotseat") {
    players.push(makePlayer(`${opts.hostId}-o`, "Player O", "O", true));
  }

  return {
    gameKind: "dots",
    code: opts.code,
    hostId: opts.hostId,
    phase: "lobby",
    mode: opts.mode,
    difficulty: opts.mode === "bot" ? opts.difficulty || "medium" : null,
    firstTo: opts.firstTo,
    turn: "X",
    players,
    chat: [],
    edges: {},
    boxOwner: Array(BOXES * BOXES).fill(null),
    frozenEdges: {},
    seriesWinner: null,
    lastAnimation: null,
    powerUsedThisTurn: false,
    twinClaimsLeft: 0,
    sparkArmed: false,
    lastClaim: null,
    roundIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function grantEnergy(p: DotsPlayer) {
  p.energy = Math.min(99, p.energy + ENERGY_PER_TURN);
}

function clearFrozenFor(room: DotsRoomState, mark: Mark) {
  for (const [edge, by] of Object.entries(room.frozenEdges)) {
    if (by === mark) delete room.frozenEdges[edge];
  }
}

export function startDotsRound(room: DotsRoomState) {
  room.edges = {};
  room.boxOwner = Array(BOXES * BOXES).fill(null);
  room.frozenEdges = {};
  room.phase = "playing";
  room.powerUsedThisTurn = false;
  room.twinClaimsLeft = 0;
  room.sparkArmed = false;
  room.lastClaim = null;
  room.lastAnimation = null;
  room.roundIndex += 1;
  // Alternate opener
  room.turn = room.roundIndex % 2 === 1 ? "X" : "O";
  for (const p of room.players) {
    p.boxes = 0;
    p.usedPowers = [];
    p.energy = START_ENERGY;
    p.silenced = false;
  }
  const opener = room.players.find((p) => p.mark === room.turn);
  if (opener) grantEnergy(opener); // slight kick — they already have 50
}

export function resetDotsSeries(room: DotsRoomState) {
  for (const p of room.players) {
    p.wins = 0;
    p.losses = 0;
    p.streak = 0;
  }
  room.seriesWinner = null;
}

function recountBoxes(room: DotsRoomState) {
  for (const p of room.players) p.boxes = 0;
  for (const owner of room.boxOwner) {
    if (!owner) continue;
    const pl = room.players.find((p) => p.mark === owner);
    if (pl) pl.boxes += 1;
  }
}

function edgesOfBoxComplete(room: DotsRoomState, br: number, bc: number) {
  return boxEdges(br, bc).every((e) => room.edges[e]);
}

/** After claiming edge, fill any newly completed boxes for mark. Returns indices. */
function completeBoxes(room: DotsRoomState, mark: Mark): number[] {
  const gained: number[] = [];
  for (let br = 0; br < BOXES; br++) {
    for (let bc = 0; bc < BOXES; bc++) {
      const idx = boxIndex(br, bc);
      if (room.boxOwner[idx]) continue;
      if (edgesOfBoxComplete(room, br, bc)) {
        room.boxOwner[idx] = mark;
        gained.push(idx);
      }
    }
  }
  return gained;
}

function uncompleteBoxesUsing(room: DotsRoomState, edge: EdgeId): number[] {
  const cleared: number[] = [];
  for (let br = 0; br < BOXES; br++) {
    for (let bc = 0; bc < BOXES; bc++) {
      const edges = boxEdges(br, bc);
      if (!edges.includes(edge)) continue;
      const idx = boxIndex(br, bc);
      if (room.boxOwner[idx]) {
        room.boxOwner[idx] = null;
        cleared.push(idx);
      }
    }
  }
  return cleared;
}

/** Erase claimed edges once, reopening every affected box, including neighbors. */
function eraseEdges(room: DotsRoomState, edges: EdgeId[]): boolean {
  const claimed = [...new Set(edges)].filter((edge) => room.edges[edge]);
  if (!claimed.length) return false;
  for (const edge of claimed) {
    delete room.edges[edge];
    uncompleteBoxesUsing(room, edge);
  }
  if (room.lastClaim && claimed.includes(room.lastClaim.edge)) room.lastClaim = null;
  recountBoxes(room);
  return true;
}

function finishRoundIfNeeded(room: DotsRoomState) {
  const totalEdges = allEdgeIds().length;
  const claimed = Object.keys(room.edges).length;
  if (claimed < totalEdges) return;

  recountBoxes(room);
  const sorted = [...room.players].sort((a, b) => b.boxes - a.boxes);
  const winner = sorted[0];
  const loser = sorted[1];
  if (winner && loser && winner.boxes !== loser.boxes) {
    winner.wins += 1;
    winner.streak += 1;
    loser.losses += 1;
    loser.streak = 0;
  }
  // tie: no series win change
  room.phase = "round_over";
  if (winner && winner.wins >= room.firstTo) {
    room.phase = "series_over";
    room.seriesWinner = winner.id;
  }
}

function passTurn(room: DotsRoomState) {
  const prev = room.turn;
  clearFrozenFor(room, prev);
  // clear silence on the player who just finished if they were silenced? silence applies to opponent's next turn — clear when silenced player finishes their turn
  const finishing = room.players.find((p) => p.mark === prev);
  if (finishing) finishing.silenced = false;

  room.turn = prev === "X" ? "O" : "X";
  room.powerUsedThisTurn = false;
  room.twinClaimsLeft = 0;
  room.sparkArmed = false;
  const next = room.players.find((p) => p.mark === room.turn);
  if (next) grantEnergy(next);
}

export function claimEdge(
  room: DotsRoomState,
  playerId: string,
  edge: EdgeId
): { ok: true } | { ok: false; error: string } {
  if (room.phase !== "playing") return { ok: false, error: "Not playing" };
  if (!isValidEdge(edge)) return { ok: false, error: "Invalid edge" };

  const player =
    room.mode === "hotseat"
      ? room.players.find((p) => p.mark === room.turn)
      : room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Not in room" };
  if (room.mode !== "hotseat" && player.id !== playerId) {
    return { ok: false, error: "Wrong seat" };
  }
  if (player.mark !== room.turn) return { ok: false, error: "Not your turn" };
  if (room.edges[edge]) return { ok: false, error: "Edge taken" };

  const frozenBy = room.frozenEdges[edge];
  if (frozenBy && frozenBy !== player.mark) {
    return { ok: false, error: "That edge is frozen" };
  }

  room.edges[edge] = player.mark;
  delete room.frozenEdges[edge];
  const gained = completeBoxes(room, player.mark);
  recountBoxes(room);
  room.lastClaim = { mark: player.mark, edge, boxesGained: gained };

  const closed = gained.length > 0;
  if (closed) {
    // classic: keep turn; twin/spark unused for ending
    room.sparkArmed = false;
    finishRoundIfNeeded(room);
    return { ok: true };
  }

  if (room.sparkArmed) {
    room.sparkArmed = false;
    finishRoundIfNeeded(room);
    return { ok: true };
  }

  if (room.twinClaimsLeft > 0) {
    room.twinClaimsLeft -= 1;
    if (room.twinClaimsLeft > 0) {
      finishRoundIfNeeded(room);
      return { ok: true };
    }
  }

  finishRoundIfNeeded(room);
  if (room.phase === "playing") passTurn(room);
  return { ok: true };
}

export function applyDotsPower(
  room: DotsRoomState,
  playerId: string,
  power: DotsPowerId,
  target: DotsPowerTarget
): { ok: true } | { ok: false; error: string } {
  if (room.phase !== "playing") return { ok: false, error: "Not playing" };
  const def = DOTS_POWER_DEFS[power];
  if (!def) return { ok: false, error: "Unknown power" };

  const player =
    room.mode === "hotseat"
      ? room.players.find((p) => p.mark === room.turn)
      : room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Not in room" };
  if (room.mode !== "hotseat" && player.id !== playerId) {
    return { ok: false, error: "Wrong seat" };
  }
  if (player.mark !== room.turn) return { ok: false, error: "Not your turn" };
  if (player.silenced) return { ok: false, error: "You are silenced" };
  if (room.powerUsedThisTurn) return { ok: false, error: "Already used a power" };
  if (player.usedPowers.includes(power)) return { ok: false, error: "Already used this round" };

  if (power === "vault") {
    if (player.energy < 40) return { ok: false, error: "Need at least ⚡40 to Vault" };
  } else if (player.energy < def.cost) {
    return { ok: false, error: "Not enough energy" };
  }

  if (!target || target.kind !== def.needsTarget) {
    return { ok: false, error: `Pick a ${def.needsTarget} for ${def.name}` };
  }

  const opponent = room.players.find((p) => p.mark !== player.mark);

  switch (power) {
    case "snip": {
      if (target.kind !== "edge" || !isValidEdge(target.edge)) {
        return { ok: false, error: "Pick a claimed edge" };
      }
      if (!room.edges[target.edge]) return { ok: false, error: "Edge is empty" };
      eraseEdges(room, [target.edge]);
      break;
    }
    case "bomb": {
      if (target.kind !== "box" || !Number.isInteger(target.index) ||
          target.index < 0 || target.index >= BOXES * BOXES) {
        return { ok: false, error: "Pick a box on the board" };
      }
      const { br, bc } = boxCoords(target.index);
      if (!eraseEdges(room, boxEdges(br, bc))) {
        return { ok: false, error: "That box has no claimed edges to bomb" };
      }
      break;
    }
    case "row_clear":
    case "col_clear": {
      const kind = power === "row_clear" ? "row" : "col";
      if (target.kind !== kind || !Number.isInteger(target.index) ||
          target.index < 0 || target.index >= BOXES) {
        return { ok: false, error: `Pick a valid box ${kind === "row" ? "row" : "column"}` };
      }
      const edges: EdgeId[] = [];
      for (let i = 0; i < BOXES; i++) {
        edges.push(...(kind === "row" ? boxEdges(target.index, i) : boxEdges(i, target.index)));
      }
      if (!eraseEdges(room, edges)) {
        return { ok: false, error: `That ${kind === "row" ? "row" : "column"} has no claimed edges to clear` };
      }
      break;
    }
    case "cross_clear": {
      if (target.kind !== "dot" || !Number.isInteger(target.r) || !Number.isInteger(target.c) ||
          target.r < 0 || target.r >= DOTS || target.c < 0 || target.c >= DOTS) {
        return { ok: false, error: "Pick a dot on the board" };
      }
      const edges: EdgeId[] = [];
      for (let i = 0; i < BOXES; i++) edges.push(hEdge(target.r, i), vEdge(i, target.c));
      if (!eraseEdges(room, edges)) {
        return { ok: false, error: "That dot’s row and column have no claimed edges to clear" };
      }
      break;
    }
    case "hijack": {
      if (target.kind !== "box") return { ok: false, error: "Pick a box" };
      const idx = target.index;
      if (idx < 0 || idx >= room.boxOwner.length) return { ok: false, error: "Bad box" };
      if (room.boxOwner[idx] !== opponent?.mark) {
        return { ok: false, error: "Pick an opponent box" };
      }
      room.boxOwner[idx] = player.mark;
      recountBoxes(room);
      break;
    }
    case "twin": {
      room.twinClaimsLeft = Math.max(room.twinClaimsLeft, 2);
      break;
    }
    case "freeze": {
      if (target.kind !== "edge" || !isValidEdge(target.edge)) {
        return { ok: false, error: "Pick an empty edge" };
      }
      if (room.edges[target.edge]) return { ok: false, error: "Edge already claimed" };
      room.frozenEdges[target.edge] = player.mark;
      break;
    }
    case "silence": {
      if (opponent) opponent.silenced = true;
      break;
    }
    case "spark": {
      room.sparkArmed = true;
      break;
    }
    case "rewind": {
      const last = room.lastClaim;
      if (!last || last.mark === player.mark) {
        return { ok: false, error: "Nothing to rewind" };
      }
      if (room.edges[last.edge] !== last.mark) {
        return { ok: false, error: "Last claim already gone" };
      }
      delete room.edges[last.edge];
      for (const bi of last.boxesGained) {
        if (room.boxOwner[bi] === last.mark) room.boxOwner[bi] = null;
      }
      recountBoxes(room);
      room.lastClaim = null;
      break;
    }
    case "vault": {
      if (!opponent) return { ok: false, error: "No opponent" };
      const oppBoxes: number[] = [];
      room.boxOwner.forEach((o, i) => {
        if (o === opponent.mark) oppBoxes.push(i);
      });
      if (oppBoxes.length === 0) return { ok: false, error: "No boxes to steal" };
      // steal up to 2, prefer higher indices random-ish last ones
      const steal = oppBoxes.slice(-2);
      for (const i of steal) room.boxOwner[i] = player.mark;
      recountBoxes(room);
      break;
    }
    default:
      return { ok: false, error: "Unknown power" };
  }

  if (power === "vault") player.energy = 0;
  else player.energy -= def.cost;
  player.usedPowers.push(power);
  room.powerUsedThisTurn = true;
  room.lastAnimation = {
    id: `${Date.now()}-${power}`,
    power,
    by: player.mark,
    at: Date.now(),
    meta: { target },
  };
  return { ok: true };
}

export function freeEdges(room: DotsRoomState, forMark: Mark): EdgeId[] {
  return allEdgeIds().filter((e) => {
    if (room.edges[e]) return false;
    const fr = room.frozenEdges[e];
    if (fr && fr !== forMark) return false;
    return true;
  });
}

export function boxesCompletedByEdge(room: DotsRoomState, edge: EdgeId, mark: Mark): number {
  // simulate
  const was = room.edges[edge];
  room.edges[edge] = mark;
  let n = 0;
  for (let br = 0; br < BOXES; br++) {
    for (let bc = 0; bc < BOXES; bc++) {
      const idx = boxIndex(br, bc);
      if (room.boxOwner[idx]) continue;
      if (edgesOfBoxComplete(room, br, bc)) n += 1;
    }
  }
  if (was) room.edges[edge] = was;
  else delete room.edges[edge];
  return n;
}

export function thirdLineGivesOpponent(room: DotsRoomState, edge: EdgeId): boolean {
  // if claiming leaves a box with 3 edges for opponent to take — heuristic: any box that would have exactly 3 edges after claim and not completed
  const was = room.edges[edge];
  room.edges[edge] = "X"; // temp
  let bad = false;
  for (let br = 0; br < BOXES; br++) {
    for (let bc = 0; bc < BOXES; bc++) {
      const idx = boxIndex(br, bc);
      if (room.boxOwner[idx]) continue;
      const count = boxEdges(br, bc).filter((e) => room.edges[e]).length;
      if (count === 3) bad = true;
    }
  }
  if (was) room.edges[edge] = was;
  else delete room.edges[edge];
  return bad;
}

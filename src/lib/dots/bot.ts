import type { DotsRoomState, EdgeId, DotsPowerId, DotsPowerTarget } from "./types";
import {
  DOTS_BOT_ID,
  freeEdges,
  boxesCompletedByEdge,
  thirdLineGivesOpponent,
  claimEdge,
  applyDotsPower,
} from "./game";
import { DOTS_POWER_DEFS, DOTS_POWER_ORDER } from "./powers";

export type DotsBotAction =
  | { type: "claim"; edge: EdgeId }
  | { type: "power"; power: DotsPowerId; target: DotsPowerTarget };

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function chooseDotsBotAction(room: DotsRoomState): DotsBotAction | null {
  const bot = room.players.find((p) => p.id === DOTS_BOT_ID);
  if (!bot || room.turn !== bot.mark) return null;
  const diff = room.difficulty || "medium";
  const frees = freeEdges(room, bot.mark);
  if (!frees.length) return null;

  // Prefer completing boxes
  const completing = frees.filter((e) => boxesCompletedByEdge(room, e, bot.mark) > 0);
  if (completing.length) {
    return { type: "claim", edge: pickRandom(completing)! };
  }

  // Maybe use a power (hard+)
  if (
    !room.powerUsedThisTurn &&
    !bot.silenced &&
    (diff === "hard" || diff === "expert") &&
    Math.random() < (diff === "expert" ? 0.45 : 0.25)
  ) {
    const opp = room.players.find((p) => p.id !== DOTS_BOT_ID);
    for (const id of ["hijack", "twin", "spark", "freeze", "snip"] as DotsPowerId[]) {
      if (bot.usedPowers.includes(id)) continue;
      const def = DOTS_POWER_DEFS[id];
      if (bot.energy < def.cost) continue;
      if (id === "hijack" && opp) {
        const boxes = room.boxOwner
          .map((o, i) => (o === opp.mark ? i : -1))
          .filter((i) => i >= 0);
        if (boxes.length) {
          return { type: "power", power: "hijack", target: { kind: "box", index: pickRandom(boxes)! } };
        }
      }
      if (id === "twin" || id === "spark") {
        return { type: "power", power: id, target: { kind: "none" } };
      }
      if (id === "freeze") {
        const safe = frees.filter((e) => !thirdLineGivesOpponent(room, e));
        const edge = pickRandom(safe.length ? safe : frees);
        if (edge) return { type: "power", power: "freeze", target: { kind: "edge", edge } };
      }
    }
  }

  // Avoid giving third line (medium+)
  let candidates = frees;
  if (diff !== "easy") {
    const safe = frees.filter((e) => !thirdLineGivesOpponent(room, e));
    if (safe.length) candidates = safe;
  }

  if (diff === "easy") {
    return { type: "claim", edge: pickRandom(frees)! };
  }
  return { type: "claim", edge: pickRandom(candidates)! };
}

export function runDotsBotStep(room: DotsRoomState): boolean {
  const action = chooseDotsBotAction(room);
  if (!action) return false;
  if (action.type === "claim") {
    claimEdge(room, DOTS_BOT_ID, action.edge);
    return true;
  }
  const res = applyDotsPower(room, DOTS_BOT_ID, action.power, action.target);
  if (!res.ok) {
    const fallback = chooseDotsBotAction(room);
    if (fallback?.type === "claim") {
      claimEdge(room, DOTS_BOT_ID, fallback.edge);
      return true;
    }
    return false;
  }
  return true;
}

// silence unused warning
void DOTS_POWER_ORDER;

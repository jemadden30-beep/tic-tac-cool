import type { PowerDef, PowerId, RoomState, PlayerState } from "./types";

export const ENERGY_MAX = 100;
export const ENERGY_START = 50;
export const ENERGY_PER_TURN = 10;

export const POWER_DEFS: Record<PowerId, PowerDef> = {
  boot: {
    id: "boot",
    name: "Boot",
    emoji: "🥾",
    description: "Kick one opponent tile off the board.",
    cost: 15,
    needsTarget: "cell",
    targetOpponent: true,
  },
  lightning: {
    id: "lightning",
    name: "Lightning",
    emoji: "⚡",
    description: "Strike a random opponent tile.",
    cost: 20,
    needsTarget: "none",
  },
  shield: {
    id: "shield",
    name: "Shield",
    emoji: "🛡️",
    description: "Protect one of your tiles until your next turn.",
    cost: 20,
    needsTarget: "cell",
    targetOwn: true,
  },
  swap: {
    id: "swap",
    name: "Swap",
    emoji: "🔄",
    description: "Swap one of your tiles with an opponent tile.",
    cost: 25,
    needsTarget: "pair",
    targetOwn: true,
    targetOpponent: true,
  },
  broom: {
    id: "broom",
    name: "Broom",
    emoji: "🧹",
    description: "Erase an entire row or column.",
    cost: 30,
    needsTarget: "line",
  },
  column_switch: {
    id: "column_switch",
    name: "Column Switch",
    emoji: "↔️",
    description: "Shuffle the order of all columns.",
    cost: 30,
    needsTarget: "none",
  },
  row_switch: {
    id: "row_switch",
    name: "Row Switch",
    emoji: "↕️",
    description: "Shuffle the order of all rows.",
    cost: 30,
    needsTarget: "none",
  },
  mirror: {
    id: "mirror",
    name: "Mirror",
    emoji: "🪞",
    description: "Flip the board left ↔ right.",
    cost: 25,
    needsTarget: "none",
  },
  time_warp: {
    id: "time_warp",
    name: "Time Warp",
    emoji: "⏪",
    description: "Undo the opponent’s last placed mark.",
    cost: 35,
    needsTarget: "none",
  },
  gravity: {
    id: "gravity",
    name: "Gravity",
    emoji: "⬇️",
    description: "All marks fall toward a chosen edge.",
    cost: 35,
    needsTarget: "edge",
  },
  bomb: {
    id: "bomb",
    name: "Bomb",
    emoji: "💣",
    description: "Clear a 2×2 block (pick its top-left).",
    cost: 35,
    needsTarget: "cell",
  },
  lock: {
    id: "lock",
    name: "Lock",
    emoji: "🔒",
    description: "Block an empty cell until after your next turn.",
    cost: 25,
    needsTarget: "cell",
    targetEmpty: true,
  },
  clone: {
    id: "clone",
    name: "Clone",
    emoji: "🧬",
    description: "Copy an opponent mark onto an empty cell as yours.",
    cost: 40,
    needsTarget: "pair",
    targetOpponent: true,
    targetEmpty: true,
  },
  silence: {
    id: "silence",
    name: "Silence",
    emoji: "🔇",
    description: "Opponent cannot use powers on their next turn.",
    cost: 30,
    needsTarget: "none",
  },
  double: {
    id: "double",
    name: "Double Place",
    emoji: "✨",
    description: "Place two marks this turn (4×4 only).",
    cost: 35,
    needsTarget: "none",
    requiresExpanded: true,
  },
  tornado: {
    id: "tornado",
    name: "Tornado",
    emoji: "🌪️",
    description: "Shuffle every tile on the board.",
    cost: 40,
    needsTarget: "none",
  },
  expansion: {
    id: "expansion",
    name: "Expansion",
    emoji: "📐",
    description: "Grow to 4×4 — need 4 in a row to win.",
    cost: 45,
    needsTarget: "none",
  },
  double_expansion: {
    id: "double_expansion",
    name: "Double Expansion",
    emoji: "🚀",
    description: "Blast to 5×5 (need 5 in a row). Costs ALL your energy.",
    cost: 0, // special: drains all energy at use time
    needsTarget: "none",
    requiresExpansionUsed: true,
  },
};

export const ALL_POWERS = Object.keys(POWER_DEFS) as PowerId[];

/** Display order in the power panel */
export const POWER_ORDER: PowerId[] = [
  "boot",
  "lightning",
  "shield",
  "swap",
  "broom",
  "column_switch",
  "row_switch",
  "mirror",
  "lock",
  "time_warp",
  "gravity",
  "bomb",
  "clone",
  "silence",
  "double",
  "tornado",
  "expansion",
  "double_expansion",
];

export function canAfford(player: PlayerState, power: PowerId): boolean {
  if (power === "double_expansion") return (player.energy ?? 0) > 0;
  return (player.energy ?? 0) >= POWER_DEFS[power].cost;
}

export function hasUsed(player: PlayerState, power: PowerId): boolean {
  return (player.usedPowers || []).includes(power);
}

export function isPowerUnlocked(
  room: RoomState,
  power: PowerId,
  player?: PlayerState
): boolean {
  const def = POWER_DEFS[power];
  if (def.requiresExpanded && room.boardSize < 4) return false;
  if (def.requiresExpansionUsed) {
    const used = (player?.usedPowers || []).includes("expansion");
    if (!used) return false;
  }
  return true;
}

export function powerAvailability(
  room: RoomState,
  player: PlayerState,
  power: PowerId
): { ok: boolean; reason?: string } {
  if (!isPowerUnlocked(room, power, player)) {
    if (POWER_DEFS[power].requiresExpansionUsed) {
      return { ok: false, reason: "Use Expansion first" };
    }
    return { ok: false, reason: "Unlocks on 4×4" };
  }
  if (power === "double_expansion" && (player.energy ?? 0) <= 0) {
    return { ok: false, reason: "Need some ⚡ to dump" };
  }
  if (player.silenced) return { ok: false, reason: "Silenced" };
  if (hasUsed(player, power)) return { ok: false, reason: "Already used" };
  if (!canAfford(player, power)) return { ok: false, reason: "Not enough ⚡" };
  return { ok: true };
}

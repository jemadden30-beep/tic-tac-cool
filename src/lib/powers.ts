import type { PowerDef, PowerId } from "./types";

export const POWER_DEFS: Record<PowerId, PowerDef> = {
  boot: {
    id: "boot",
    name: "Boot",
    emoji: "🥾",
    description: "Kick one opponent tile off the board.",
    needsTarget: "cell",
    targetOpponent: true,
  },
  lightning: {
    id: "lightning",
    name: "Lightning",
    emoji: "⚡",
    description: "Strike a random opponent tile.",
    needsTarget: "none",
  },
  tornado: {
    id: "tornado",
    name: "Tornado",
    emoji: "🌪️",
    description: "Shuffle every tile on the board.",
    needsTarget: "none",
  },
  broom: {
    id: "broom",
    name: "Broom",
    emoji: "🧹",
    description: "Erase an entire row or column.",
    needsTarget: "line",
  },
  expansion: {
    id: "expansion",
    name: "Expansion",
    emoji: "📐",
    description: "Grow the board to 4×4 — need 4 in a row to win.",
    needsTarget: "none",
  },
  swap: {
    id: "swap",
    name: "Swap",
    emoji: "🔄",
    description: "Swap one of your tiles with an opponent tile.",
    needsTarget: "pair",
    targetOwn: true,
    targetOpponent: true,
  },
  shield: {
    id: "shield",
    name: "Shield",
    emoji: "🛡️",
    description: "Protect one of your tiles from removal until your next turn.",
    needsTarget: "cell",
    targetOwn: true,
  },
  double: {
    id: "double",
    name: "Double Place",
    emoji: "✨",
    description: "Place two marks when you place (does not skip your place).",
    needsTarget: "none",
  },
};

export const ALL_POWERS = Object.keys(POWER_DEFS) as PowerId[];

export function dealPowers(count = 3): PowerId[] {
  const pool = [...ALL_POWERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

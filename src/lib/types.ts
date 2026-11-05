export type Mark = "X" | "O";
export type Cell = Mark | null;

export type PowerId =
  | "boot"
  | "lightning"
  | "tornado"
  | "broom"
  | "expansion"
  | "swap"
  | "shield"
  | "double"
  | "column_switch"
  | "row_switch"
  | "mirror"
  | "time_warp"
  | "gravity"
  | "bomb"
  | "lock"
  | "clone"
  | "silence"
  | "double_expansion";

export type PowerTarget =
  | { kind: "cell"; index: number }
  | { kind: "line"; axis: "row" | "col"; index: number }
  | { kind: "pair"; a: number; b: number }
  | { kind: "edge"; edge: "up" | "down" | "left" | "right" }
  | { kind: "vertex"; row: number; col: number } // 2x2 junction (top-left cell row/col)
  | { kind: "none" };

export interface PowerDef {
  id: PowerId;
  name: string;
  emoji: string;
  description: string;
  cost: number;
  needsTarget: "cell" | "line" | "pair" | "edge" | "vertex" | "none";
  targetOwn?: boolean;
  targetOpponent?: boolean;
  targetEmpty?: boolean;
  requiresExpanded?: boolean;
  /** Unlocks only after Expansion was used this round */
  requiresExpansionUsed?: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  mark: Mark;
  /** @deprecated kept for older rooms; unused with energy system */
  powers: PowerId[];
  energy: number;
  usedPowers: PowerId[];
  wins: number;
  losses: number;
  streak: number;
  connected: boolean;
  shieldIndex: number | null;
  frozen: boolean;
  silenced: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export interface AnimationEvent {
  id: string;
  power: PowerId;
  by: Mark;
  at: number;
  meta?: Record<string, unknown>;
}

export type RoomPhase = "lobby" | "playing" | "round_over" | "series_over";

export type GameMode = "online" | "hotseat" | "bot";
export type BotDifficulty = "easy" | "medium" | "hard" | "expert";

export interface RoomState {
  code: string;
  hostId: string;
  phase: RoomPhase;
  mode: GameMode;
  difficulty: BotDifficulty | null;
  firstTo: number;
  boardSize: 3 | 4 | 5;
  board: Cell[];
  turn: Mark;
  players: PlayerState[];
  chat: ChatMessage[];
  winner: Mark | null;
  winningLine: number[] | null;
  seriesWinner: string | null;
  lastAnimation: AnimationEvent | null;
  pendingPower: PowerId | null;
  createdAt: number;
  updatedAt: number;
  doublePending: boolean;
  roundIndex: number;
  powerUsedThisTurn: boolean;
  /** Empty cell index locked until the locker finishes their next turn */
  lockedCell: number | null;
  lockedBy: Mark | null;
  /** Last opponent place for Time Warp */
  lastPlace: { mark: Mark; index: number } | null;
}

export interface PublicRoom {
  code: string;
  phase: RoomPhase;
  mode: GameMode;
  firstTo: number;
  playerCount: number;
  updatedAt: number;
}

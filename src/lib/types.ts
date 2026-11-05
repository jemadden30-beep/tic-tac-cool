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
  | "double";

export type PowerTarget =
  | { kind: "cell"; index: number }
  | { kind: "line"; axis: "row" | "col"; index: number }
  | { kind: "pair"; a: number; b: number }
  | { kind: "none" };

export interface PowerDef {
  id: PowerId;
  name: string;
  emoji: string;
  description: string;
  needsTarget: "cell" | "line" | "pair" | "none";
  targetOwn?: boolean;
  targetOpponent?: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  mark: Mark;
  powers: PowerId[];
  wins: number;
  losses: number;
  streak: number;
  connected: boolean;
  shieldIndex: number | null;
  frozen: boolean;
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
  boardSize: 3 | 4;
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
}

export interface PublicRoom {
  code: string;
  phase: RoomPhase;
  mode: GameMode;
  firstTo: number;
  playerCount: number;
  updatedAt: number;
}

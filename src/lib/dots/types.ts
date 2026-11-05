import type { Mark, GameMode, BotDifficulty, RoomPhase, ChatMessage } from "../types";

export const DOTS = 10; // 10×10 dots → 9×9 boxes
export const BOXES = DOTS - 1; // 9
export const START_ENERGY = 50;
export const ENERGY_PER_TURN = 10;

/** Horizontal edge between (r,c) and (r,c+1); r:0..9 c:0..8 */
export type HEdge = `h:${number}:${number}`;
/** Vertical edge between (r,c) and (r+1,c); r:0..8 c:0..9 */
export type VEdge = `v:${number}:${number}`;
export type EdgeId = HEdge | VEdge;

export type DotsPowerId =
  | "snip"
  | "hijack"
  | "twin"
  | "freeze"
  | "silence"
  | "spark"
  | "rewind"
  | "vault";

export type DotsPowerTarget =
  | { kind: "edge"; edge: EdgeId }
  | { kind: "box"; index: number }
  | { kind: "none" };

export interface DotsPowerDef {
  id: DotsPowerId;
  name: string;
  emoji: string;
  description: string;
  cost: number;
  needsTarget: "edge" | "box" | "none";
  /** For edge targets: claimed / empty / any */
  edgeFilter?: "claimed" | "empty" | "any";
  boxFilter?: "opponent" | "any";
}

export interface DotsPlayer {
  id: string;
  name: string;
  mark: Mark;
  energy: number;
  usedPowers: DotsPowerId[];
  /** Boxes owned this round (score) */
  boxes: number;
  wins: number;
  losses: number;
  streak: number;
  connected: boolean;
  silenced: boolean;
}

export interface DotsAnimation {
  id: string;
  power: DotsPowerId;
  by: Mark;
  at: number;
  meta?: Record<string, unknown>;
}

export interface DotsRoomState {
  gameKind: "dots";
  code: string;
  hostId: string;
  phase: RoomPhase;
  mode: GameMode;
  difficulty: BotDifficulty | null;
  firstTo: number;
  turn: Mark;
  players: DotsPlayer[];
  chat: ChatMessage[];
  /** edgeId → owner mark */
  edges: Record<string, Mark>;
  /** box index 0..80 → owner mark */
  boxOwner: (Mark | null)[];
  /** empty edges frozen until that mark finishes a turn */
  frozenEdges: Record<string, Mark>;
  seriesWinner: string | null;
  lastAnimation: DotsAnimation | null;
  powerUsedThisTurn: boolean;
  /** Extra free claims remaining this turn (Twin) */
  twinClaimsLeft: number;
  /** Spark: next claim does not end turn even without a box */
  sparkArmed: boolean;
  lastClaim: { mark: Mark; edge: EdgeId; boxesGained: number[] } | null;
  roundIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface DotsMatchSummary {
  gameKind: "dots";
  code: string;
  mode: GameMode;
  phase: RoomPhase;
  firstTo: number;
  myMark: Mark;
  myWins: number;
  opponentName: string;
  opponentWins: number;
  opponentConnected: boolean;
  turn: Mark;
  yourTurn: boolean;
  statusLabel: string;
  updatedAt: number;
  difficulty: BotDifficulty | null;
  myBoxes: number;
  opponentBoxes: number;
}

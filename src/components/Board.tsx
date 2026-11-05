"use client";

import { motion } from "framer-motion";
import type { AnimationEvent, Cell, Mark, PowerId, RoomState } from "@/lib/types";
import { CellFX } from "./PowerFX";

export function Board({
  room,
  meMark,
  selectedPower,
  selectMode,
  onCellClick,
  animation,
}: {
  room: RoomState;
  meMark: Mark | null;
  selectedPower: PowerId | null;
  selectMode: "none" | "cell" | "line" | "pair";
  onCellClick: (index: number) => void;
  animation: AnimationEvent | null;
}) {
  const size = room.boardSize;
  const isMyTurn =
    room.phase === "playing" &&
    (room.mode === "hotseat" || (meMark !== null && meMark === room.turn));

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="grid gap-2 sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          width: size === 3 ? "min(92vw, 360px)" : "min(92vw, 420px)",
        }}
      >
        {room.board.map((cell, i) => {
          const shielded = room.players.some((p) => p.shieldIndex === i);
          const winning = room.winningLine?.includes(i);
          return (
            <BoardCell
              key={`${size}-${i}`}
              cell={cell}
              index={i}
              size={size}
              shielded={shielded}
              winning={!!winning}
              interactive={
                room.phase === "playing" &&
                (selectMode !== "none" || (isMyTurn && cell === null && !selectedPower))
              }
              onClick={() => onCellClick(i)}
              animation={animation}
            />
          );
        })}
      </div>
      {selectMode === "line" && (
        <LinePicker
          size={size}
          onPick={(axis, index) => {
            // encode as special cell click via negative protocol handled by parent
            // parent listens separately — we pass through custom event
            const ev = new CustomEvent("ttc-line", { detail: { axis, index } });
            window.dispatchEvent(ev);
          }}
        />
      )}
    </div>
  );
}

function BoardCell({
  cell,
  index,
  size,
  shielded,
  winning,
  interactive,
  onClick,
  animation,
}: {
  cell: Cell;
  index: number;
  size: number;
  shielded: boolean;
  winning: boolean;
  interactive: boolean;
  onClick: () => void;
  animation: AnimationEvent | null;
}) {
  return (
    <motion.button
      type="button"
      layout
      whileTap={interactive ? { scale: 0.92 } : undefined}
      onClick={onClick}
      disabled={!interactive}
      className={`relative aspect-square rounded-2xl border text-4xl font-black transition sm:text-5xl
        ${winning ? "border-amber-300 bg-amber-400/20 shadow-[0_0_24px_rgba(251,191,36,0.55)]" : "border-white/10 bg-white/5"}
        ${interactive ? "hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10 cursor-pointer" : "cursor-default"}
        ${shielded ? "ring-2 ring-cyan-400/80" : ""}
      `}
    >
      <CellFX animation={animation} index={index} />
      <AnimateMark mark={cell} />
      {shielded && (
        <span className="absolute right-1 top-1 text-sm" title="Shielded">
          🛡️
        </span>
      )}
      <span className="sr-only">
        cell {index + 1} of {size * size}
      </span>
    </motion.button>
  );
}

function AnimateMark({ mark }: { mark: Cell }) {
  if (!mark) return null;
  return (
    <motion.span
      initial={{ scale: 0, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      className={mark === "X" ? "text-fuchsia-400" : "text-cyan-300"}
    >
      {mark}
    </motion.span>
  );
}

function LinePicker({
  size,
  onPick,
}: {
  size: number;
  onPick: (axis: "row" | "col", index: number) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm">
      <span className="w-full text-center text-emerald-200">Pick a row or column to sweep</span>
      {Array.from({ length: size }, (_, i) => (
        <button
          key={`r${i}`}
          type="button"
          className="rounded-lg bg-emerald-500/30 px-3 py-1 font-semibold hover:bg-emerald-400/50"
          onClick={() => onPick("row", i)}
        >
          Row {i + 1}
        </button>
      ))}
      {Array.from({ length: size }, (_, i) => (
        <button
          key={`c${i}`}
          type="button"
          className="rounded-lg bg-lime-500/30 px-3 py-1 font-semibold hover:bg-lime-400/50"
          onClick={() => onPick("col", i)}
        >
          Col {i + 1}
        </button>
      ))}
    </div>
  );
}

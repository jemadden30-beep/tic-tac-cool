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
  selectMode: "none" | "cell" | "line" | "pair" | "edge";
  onCellClick: (index: number) => void;
  animation: AnimationEvent | null;
}) {
  const size = room.boardSize;
  const isMyTurn =
    room.phase === "playing" &&
    (room.mode === "hotseat" || (meMark !== null && meMark === room.turn));

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="grid gap-1.5 sm:gap-2"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          width: size === 3 ? "min(72vw, 260px)" : "min(78vw, 300px)",
        }}
      >
        {room.board.map((cell, i) => {
          const shielded = room.players.some((p) => p.shieldIndex === i);
          const winning = room.winningLine?.includes(i);
          const locked = room.lockedCell === i;
          return (
            <BoardCell
              key={`${size}-${i}`}
              cell={cell}
              index={i}
              size={size}
              shielded={shielded}
              locked={locked}
              winning={!!winning}
              interactive={
                room.phase === "playing" &&
                (selectMode === "cell" ||
                  selectMode === "pair" ||
                  (selectMode === "none" &&
                    isMyTurn &&
                    cell === null &&
                    !selectedPower &&
                    !locked))
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
            window.dispatchEvent(
              new CustomEvent("ttc-line", { detail: { axis, index } })
            );
          }}
        />
      )}
      {selectMode === "edge" && (
        <EdgePicker
          onPick={(edge) => {
            window.dispatchEvent(new CustomEvent("ttc-edge", { detail: { edge } }));
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
  locked,
  winning,
  interactive,
  onClick,
  animation,
}: {
  cell: Cell;
  index: number;
  size: number;
  shielded: boolean;
  locked: boolean;
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
      className={`relative aspect-square rounded-xl border text-2xl font-black transition sm:rounded-2xl sm:text-4xl
        ${winning ? "border-sky-300 bg-sky-400/25 shadow-[0_0_24px_rgba(56,189,248,0.55)]" : "border-white/10 bg-white/5"}
        ${interactive ? "hover:border-sky-400/70 hover:bg-blue-500/15 cursor-pointer" : "cursor-default"}
        ${shielded ? "ring-2 ring-sky-400/90" : ""}
        ${locked ? "bg-slate-700/50 ring-2 ring-amber-400/70" : ""}
      `}
    >
      <CellFX animation={animation} index={index} />
      <AnimateMark mark={cell} />
      {shielded && (
        <span className="absolute right-1 top-1 text-sm" title="Shielded">
          🛡️
        </span>
      )}
      {locked && !cell && (
        <span className="absolute inset-0 grid place-items-center text-base opacity-80">🔒</span>
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
      className={mark === "X" ? "text-sky-400" : "text-blue-300"}
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
      <span className="w-full text-center text-emerald-200">Pick a row or column</span>
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

function EdgePicker({
  onPick,
}: {
  onPick: (edge: "up" | "down" | "left" | "right") => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm">
      <span className="w-full text-center text-sky-100">Gravity pulls toward…</span>
      {(
        [
          ["up", "⬆️ Up"],
          ["down", "⬇️ Down"],
          ["left", "⬅️ Left"],
          ["right", "➡️ Right"],
        ] as const
      ).map(([edge, label]) => (
        <button
          key={edge}
          type="button"
          className="rounded-lg bg-sky-500/30 px-3 py-1 font-semibold hover:bg-sky-400/50"
          onClick={() => onPick(edge)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
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
  selectMode: "none" | "cell" | "line" | "pair" | "edge" | "vertex";
  onCellClick: (index: number) => void;
  animation: AnimationEvent | null;
}) {
  const size = room.boardSize;
  const isMyTurn =
    room.phase === "playing" &&
    (room.mode === "hotseat" || (meMark !== null && meMark === room.turn));

  const [hoverVertex, setHoverVertex] = useState<{ row: number; col: number } | null>(
    null
  );
  const [hoverLine, setHoverLine] = useState<
    { axis: "row" | "col"; index: number } | null
  >(null);

  const previewCells = new Set<number>();
  if (selectMode === "vertex" && hoverVertex) {
    const { row, col } = hoverVertex;
    previewCells.add(row * size + col);
    previewCells.add(row * size + col + 1);
    previewCells.add((row + 1) * size + col);
    previewCells.add((row + 1) * size + col + 1);
  }
  if (selectMode === "line" && hoverLine) {
    if (hoverLine.axis === "row") {
      for (let c = 0; c < size; c++) previewCells.add(hoverLine.index * size + c);
    } else {
      for (let r = 0; r < size; r++) previewCells.add(r * size + hoverLine.index);
    }
  }

  const boardWidth =
    size === 3 ? "min(72vw, 260px)" : size === 4 ? "min(78vw, 300px)" : "min(84vw, 340px)";

  const showLineArrows = selectMode === "line";
  const showVertices = selectMode === "vertex";

  return (
    <div className="flex flex-col items-center gap-2">
      {showLineArrows && (
        <p className="text-center text-[11px] text-emerald-200/90">
          Tap an arrow to sweep that row or column
        </p>
      )}
      {showVertices && (
        <p className="text-center text-[11px] text-amber-200/90">
          Tap a ● junction to bomb the 2×2 around it
        </p>
      )}

      <div
        className="grid items-center justify-items-center gap-1"
        style={{
          gridTemplateColumns: showLineArrows
            ? `28px ${boardWidth}`
            : boardWidth,
          gridTemplateRows: showLineArrows ? `28px auto` : "auto",
        }}
      >
        {showLineArrows && <div />}
        {showLineArrows && (
          <div
            className="grid w-full gap-1.5 sm:gap-2"
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: size }, (_, c) => (
              <button
                key={`col-arrow-${c}`}
                type="button"
                title={`Sweep column ${c + 1}`}
                onMouseEnter={() => setHoverLine({ axis: "col", index: c })}
                onMouseLeave={() => setHoverLine(null)}
                onFocus={() => setHoverLine({ axis: "col", index: c })}
                onBlur={() => setHoverLine(null)}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("ttc-line", { detail: { axis: "col", index: c } })
                  )
                }
                className="flex h-7 items-center justify-center rounded-lg bg-emerald-500/25 text-sm font-bold text-emerald-100 ring-1 ring-emerald-400/40 hover:bg-emerald-400/50"
              >
                ↓
              </button>
            ))}
          </div>
        )}

        {showLineArrows && (
          <div className="flex w-7 flex-col gap-1.5 sm:gap-2" style={{ height: "100%" }}>
            {Array.from({ length: size }, (_, r) => (
              <button
                key={`row-arrow-${r}`}
                type="button"
                title={`Sweep row ${r + 1}`}
                onMouseEnter={() => setHoverLine({ axis: "row", index: r })}
                onMouseLeave={() => setHoverLine(null)}
                onFocus={() => setHoverLine({ axis: "row", index: r })}
                onBlur={() => setHoverLine(null)}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("ttc-line", { detail: { axis: "row", index: r } })
                  )
                }
                className="flex aspect-square w-7 flex-1 items-center justify-center rounded-lg bg-emerald-500/25 text-sm font-bold text-emerald-100 ring-1 ring-emerald-400/40 hover:bg-emerald-400/50"
              >
                →
              </button>
            ))}
          </div>
        )}

        <div className="relative w-full" style={{ width: boardWidth }}>
          <div
            className="grid gap-1.5 sm:gap-2"
            style={{
              gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
              width: "100%",
            }}
          >
            {room.board.map((cell, i) => {
              const shielded = room.players.some((p) => p.shieldIndex === i);
              const winning = room.winningLine?.includes(i);
              const locked = room.lockedCell === i;
              const preview = previewCells.has(i);
              return (
                <BoardCell
                  key={`${size}-${i}`}
                  cell={cell}
                  index={i}
                  size={size}
                  shielded={shielded}
                  locked={locked}
                  winning={!!winning}
                  preview={preview}
                  interactive={
                    room.phase === "playing" &&
                    !showVertices &&
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

          {showVertices && (
            <div className="pointer-events-none absolute inset-0">
              {Array.from({ length: size - 1 }, (_, r) =>
                Array.from({ length: size - 1 }, (_, c) => {
                  const pct = 100 / size;
                  const left = pct * (c + 1);
                  const top = pct * (r + 1);
                  const active =
                    hoverVertex?.row === r && hoverVertex?.col === c;
                  return (
                    <button
                      key={`v-${r}-${c}`}
                      type="button"
                      title={`Bomb 2×2 at junction ${r + 1},${c + 1}`}
                      className={`pointer-events-auto absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-black shadow-lg transition ${
                        active
                          ? "scale-110 border-amber-200 bg-amber-400 text-black"
                          : "border-amber-300/80 bg-amber-500/90 text-black hover:scale-110"
                      }`}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      onMouseEnter={() => setHoverVertex({ row: r, col: c })}
                      onMouseLeave={() => setHoverVertex(null)}
                      onFocus={() => setHoverVertex({ row: r, col: c })}
                      onBlur={() => setHoverVertex(null)}
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("ttc-vertex", {
                            detail: { row: r, col: c },
                          })
                        )
                      }
                    >
                      ●
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

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
  preview,
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
  preview: boolean;
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
        ${preview ? "border-amber-300 bg-amber-400/35 shadow-[0_0_18px_rgba(251,191,36,0.55)]" : ""}
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
        <span className="absolute inset-0 grid place-items-center text-base opacity-80">
          🔒
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
      className={mark === "X" ? "text-sky-400" : "text-blue-300"}
    >
      {mark}
    </motion.span>
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

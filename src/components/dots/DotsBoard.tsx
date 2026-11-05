"use client";

import { BOXES, DOTS, type EdgeId, type DotsRoomState } from "@/lib/dots/types";
import { hEdge, vEdge, boxIndex } from "@/lib/dots/game";

type Props = {
  room: DotsRoomState;
  interactive: boolean;
  selectMode?: "claim" | "edge" | "box" | null;
  onClaimEdge?: (edge: EdgeId) => void;
  onSelectEdge?: (edge: EdgeId) => void;
  onSelectBox?: (index: number) => void;
};

const CELL = 28;
const PAD = 14;

export function DotsBoard({
  room,
  interactive,
  selectMode = "claim",
  onClaimEdge,
  onSelectEdge,
  onSelectBox,
}: Props) {
  const size = PAD * 2 + CELL * (DOTS - 1);

  function edgeClick(edge: EdgeId) {
    if (!interactive) return;
    if (selectMode === "edge") onSelectEdge?.(edge);
    else if (selectMode === "claim" || !selectMode) onClaimEdge?.(edge);
  }

  function boxClick(index: number) {
    if (!interactive || selectMode !== "box") return;
    onSelectBox?.(index);
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,420px)] overflow-hidden rounded-2xl border border-sky-400/20 bg-slate-950/60 p-2">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full touch-manipulation">
        {/* boxes */}
        {Array.from({ length: BOXES }).map((_, br) =>
          Array.from({ length: BOXES }).map((__, bc) => {
            const idx = boxIndex(br, bc);
            const owner = room.boxOwner[idx];
            const x = PAD + bc * CELL;
            const y = PAD + br * CELL;
            return (
              <rect
                key={`b-${idx}`}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                className={
                  selectMode === "box" && interactive
                    ? "cursor-pointer"
                    : undefined
                }
                fill={
                  owner === "X"
                    ? "rgba(56,189,248,0.35)"
                    : owner === "O"
                      ? "rgba(129,140,248,0.4)"
                      : "transparent"
                }
                stroke="transparent"
                onClick={() => boxClick(idx)}
              />
            );
          })
        )}

        {/* horizontal edges */}
        {Array.from({ length: DOTS }).map((_, r) =>
          Array.from({ length: BOXES }).map((__, c) => {
            const edge = hEdge(r, c);
            const owner = room.edges[edge];
            const frozen = room.frozenEdges[edge];
            const x1 = PAD + c * CELL;
            const x2 = PAD + (c + 1) * CELL;
            const y = PAD + r * CELL;
            const canHit =
              interactive &&
              ((selectMode === "claim" && !owner) ||
                (selectMode === "edge" && (owner || !owner)));
            return (
              <g key={edge}>
                {/* hit area */}
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke="transparent"
                  strokeWidth={14}
                  className={canHit ? "cursor-pointer" : undefined}
                  onClick={() => edgeClick(edge)}
                />
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke={
                    owner === "X"
                      ? "#38bdf8"
                      : owner === "O"
                        ? "#a5b4fc"
                        : frozen
                          ? "#67e8f9"
                          : "rgba(148,163,184,0.35)"
                  }
                  strokeWidth={owner ? 4 : frozen ? 3 : 2}
                  strokeDasharray={frozen && !owner ? "4 3" : undefined}
                  strokeLinecap="round"
                  className={canHit ? "cursor-pointer" : undefined}
                  onClick={() => edgeClick(edge)}
                />
              </g>
            );
          })
        )}

        {/* vertical edges */}
        {Array.from({ length: BOXES }).map((_, r) =>
          Array.from({ length: DOTS }).map((__, c) => {
            const edge = vEdge(r, c);
            const owner = room.edges[edge];
            const frozen = room.frozenEdges[edge];
            const x = PAD + c * CELL;
            const y1 = PAD + r * CELL;
            const y2 = PAD + (r + 1) * CELL;
            const canHit =
              interactive &&
              ((selectMode === "claim" && !owner) || selectMode === "edge");
            return (
              <g key={edge}>
                <line
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={14}
                  className={canHit ? "cursor-pointer" : undefined}
                  onClick={() => edgeClick(edge)}
                />
                <line
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke={
                    owner === "X"
                      ? "#38bdf8"
                      : owner === "O"
                        ? "#a5b4fc"
                        : frozen
                          ? "#67e8f9"
                          : "rgba(148,163,184,0.35)"
                  }
                  strokeWidth={owner ? 4 : frozen ? 3 : 2}
                  strokeDasharray={frozen && !owner ? "4 3" : undefined}
                  strokeLinecap="round"
                  className={canHit ? "cursor-pointer" : undefined}
                  onClick={() => edgeClick(edge)}
                />
              </g>
            );
          })
        )}

        {/* dots */}
        {Array.from({ length: DOTS }).map((_, r) =>
          Array.from({ length: DOTS }).map((__, c) => (
            <circle
              key={`d-${r}-${c}`}
              cx={PAD + c * CELL}
              cy={PAD + r * CELL}
              r={3.2}
              fill="#e2e8f0"
            />
          ))
        )}
      </svg>
      <p className="mt-1 text-center text-[10px] text-white/40">
        10×10 dots · tap a line to claim
        {selectMode === "edge" ? " · select an edge for power" : ""}
        {selectMode === "box" ? " · tap a filled box" : ""}
      </p>
    </div>
  );
}

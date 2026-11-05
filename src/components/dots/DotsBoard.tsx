"use client";

import { BOXES, DOTS, type EdgeId, type DotsRoomState } from "@/lib/dots/types";
import type { Mark } from "@/lib/types";
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

/** Player 1 (X) blue · Player 2 (O) red */
const P1 = "#3b82f6";
const P1_BOX = "rgba(59,130,246,0.38)";
const P2 = "#ef4444";
const P2_BOX = "rgba(239,68,68,0.38)";
const GLOW_P1 = "#93c5fd";
const GLOW_P2 = "#fca5a5";

function edgeColor(owner: Mark | undefined, frozen: boolean | Mark | undefined) {
  if (owner === "X") return P1;
  if (owner === "O") return P2;
  if (frozen) return "#67e8f9";
  return "rgba(148,163,184,0.35)";
}

export function DotsBoard({
  room,
  interactive,
  selectMode = "claim",
  onClaimEdge,
  onSelectEdge,
  onSelectBox,
}: Props) {
  const size = PAD * 2 + CELL * (DOTS - 1);
  const lastEdge = room.lastClaim?.edge ?? null;
  const lastMark = room.lastClaim?.mark;

  function edgeClick(edge: EdgeId) {
    if (!interactive) return;
    if (selectMode === "edge") onSelectEdge?.(edge);
    else if (selectMode === "claim" || !selectMode) onClaimEdge?.(edge);
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA") {
      ae.blur();
    }
  }

  function boxClick(index: number) {
    if (!interactive || selectMode !== "box") return;
    onSelectBox?.(index);
  }

  function renderEdgeLine(
    edge: EdgeId,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    canHit: boolean
  ) {
    const owner = room.edges[edge] as Mark | undefined;
    const frozen = room.frozenEdges[edge];
    const isLast = lastEdge === edge && !!owner;
    const color = edgeColor(owner, frozen);
    const glow = lastMark === "O" ? GLOW_P2 : GLOW_P1;

    return (
      <g key={edge}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="transparent"
          strokeWidth={14}
          className={canHit ? "cursor-pointer" : undefined}
          onClick={() => edgeClick(edge)}
        />
        {isLast && (
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={glow}
            strokeWidth={10}
            strokeLinecap="round"
            opacity={0.85}
            style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
            pointerEvents="none"
          >
            <animate attributeName="opacity" values="0.55;1;0.55" dur="1.4s" repeatCount="indefinite" />
          </line>
        )}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={isLast ? 5.5 : owner ? 4 : frozen ? 3 : 2}
          strokeDasharray={frozen && !owner ? "4 3" : undefined}
          strokeLinecap="round"
          className={canHit ? "cursor-pointer" : undefined}
          style={
            isLast
              ? { filter: `drop-shadow(0 0 4px ${glow}) drop-shadow(0 0 8px ${color})` }
              : undefined
          }
          onClick={() => edgeClick(edge)}
        />
      </g>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,420px)] overflow-hidden rounded-2xl border border-sky-400/20 bg-slate-950/60 p-2">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full touch-manipulation">
        <defs>
          <filter id="last-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

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
                  selectMode === "box" && interactive ? "cursor-pointer" : undefined
                }
                fill={
                  owner === "X" ? P1_BOX : owner === "O" ? P2_BOX : "transparent"
                }
                stroke="transparent"
                onClick={() => boxClick(idx)}
              />
            );
          })
        )}

        {Array.from({ length: DOTS }).map((_, r) =>
          Array.from({ length: BOXES }).map((__, c) => {
            const edge = hEdge(r, c);
            const owner = room.edges[edge];
            const canHit =
              interactive &&
              ((selectMode === "claim" && !owner) || selectMode === "edge");
            const x1 = PAD + c * CELL;
            const x2 = PAD + (c + 1) * CELL;
            const y = PAD + r * CELL;
            return renderEdgeLine(edge, x1, y, x2, y, !!canHit);
          })
        )}

        {Array.from({ length: BOXES }).map((_, r) =>
          Array.from({ length: DOTS }).map((__, c) => {
            const edge = vEdge(r, c);
            const owner = room.edges[edge];
            const canHit =
              interactive &&
              ((selectMode === "claim" && !owner) || selectMode === "edge");
            const x = PAD + c * CELL;
            const y1 = PAD + r * CELL;
            const y2 = PAD + (r + 1) * CELL;
            return renderEdgeLine(edge, x, y1, x, y2, !!canHit);
          })
        )}

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
        <span className="font-semibold text-blue-400">P1 blue</span>
        {" · "}
        <span className="font-semibold text-red-400">P2 red</span>
        {" · glow = last claim"}
        {selectMode === "edge" ? " · select an edge for power" : ""}
        {selectMode === "box" ? " · tap a filled box" : ""}
      </p>
    </div>
  );
}

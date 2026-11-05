"use client";

import { useState } from "react";
import { BOXES, DOTS, type EdgeId, type DotsRoomState } from "@/lib/dots/types";
import type { Mark } from "@/lib/types";
import { hEdge, vEdge, boxIndex, boxCoords, parseEdge } from "@/lib/dots/game";

type Props = {
  room: DotsRoomState;
  interactive: boolean;
  selectMode?: "claim" | "edge" | "box" | "row" | "col" | "dot" | null;
  onClaimEdge?: (edge: EdgeId) => void;
  onSelectEdge?: (edge: EdgeId) => void;
  onSelectBox?: (index: number) => void;
  onSelectRow?: (index: number) => void;
  onSelectCol?: (index: number) => void;
  onSelectDot?: (r: number, c: number) => void;
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
  onSelectRow,
  onSelectCol,
  onSelectDot,
}: Props) {
  const size = PAD * 2 + CELL * (DOTS - 1);
  const lastEdge = room.lastClaim?.edge ?? null;
  const lastMark = room.lastClaim?.mark;
  const [hoverDot, setHoverDot] = useState<{ r: number; c: number } | null>(null);
  const boxSelectable = interactive && ["box", "row", "col"].includes(selectMode ?? "");
  const dotSelectable = interactive && selectMode === "dot";

  function edgeClick(edge: EdgeId) {
    if (!interactive) return;
    if (selectMode === "edge") onSelectEdge?.(edge);
    else if (selectMode === "claim") onClaimEdge?.(edge);
    else if (selectMode === "row" || selectMode === "col") {
      const coords = parseEdge(edge);
      if (!coords) return;
      // Shared borders select the row below / column to the right; clamp the outside border.
      if (selectMode === "row") onSelectRow?.(Math.min(coords.r, BOXES - 1));
      else onSelectCol?.(Math.min(coords.c, BOXES - 1));
    }
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA") {
      ae.blur();
    }
  }

  function boxClick(index: number) {
    if (!boxSelectable) return;
    const { br, bc } = boxCoords(index);
    if (selectMode === "box") onSelectBox?.(index);
    else if (selectMode === "row") onSelectRow?.(br);
    else if (selectMode === "col") onSelectCol?.(bc);
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
      <g key={edge} pointerEvents={canHit ? "auto" : "none"}>
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
                className={boxSelectable ? "cursor-pointer" : undefined}
                role={boxSelectable ? "button" : undefined}
                tabIndex={boxSelectable ? 0 : undefined}
                aria-label={boxSelectable ? `Select box row ${br + 1}, column ${bc + 1}` : undefined}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    boxClick(idx);
                  }
                }}
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
              ((selectMode === "claim" && !owner) || selectMode === "edge" || selectMode === "row" || selectMode === "col");
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
              ((selectMode === "claim" && !owner) || selectMode === "edge" || selectMode === "row" || selectMode === "col");
            const x = PAD + c * CELL;
            const y1 = PAD + r * CELL;
            const y2 = PAD + (r + 1) * CELL;
            return renderEdgeLine(edge, x, y1, x, y2, !!canHit);
          })
        )}

        {dotSelectable && hoverDot && (
          <g stroke="#fbbf24" strokeWidth={6} opacity={0.5} pointerEvents="none">
            <line x1={PAD} y1={PAD + hoverDot.r * CELL} x2={size - PAD} y2={PAD + hoverDot.r * CELL} />
            <line x1={PAD + hoverDot.c * CELL} y1={PAD} x2={PAD + hoverDot.c * CELL} y2={size - PAD} />
          </g>
        )}
        {Array.from({ length: DOTS }).map((_, r) =>
          Array.from({ length: DOTS }).map((__, c) => (
            <g
              key={`d-${r}-${c}`}
              pointerEvents={dotSelectable ? "auto" : "none"}
              className={dotSelectable ? "cursor-crosshair" : undefined}
              role={dotSelectable ? "button" : undefined}
              tabIndex={dotSelectable ? 0 : undefined}
              aria-label={dotSelectable ? `Cross clear at dot row ${r + 1}, column ${c + 1}` : undefined}
              onMouseEnter={() => dotSelectable && setHoverDot({ r, c })}
              onMouseLeave={() => setHoverDot(null)}
              onFocus={() => dotSelectable && setHoverDot({ r, c })}
              onBlur={() => setHoverDot(null)}
              onClick={() => dotSelectable && onSelectDot?.(r, c)}
              onKeyDown={(event) => {
                if (dotSelectable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectDot?.(r, c);
                }
              }}
            >
              {dotSelectable && <circle cx={PAD + c * CELL} cy={PAD + r * CELL} r={11} fill="transparent" />}
              <circle
                cx={PAD + c * CELL}
                cy={PAD + r * CELL}
                r={dotSelectable ? 4.5 : 3.2}
                fill={dotSelectable ? "#fbbf24" : "#e2e8f0"}
              />
            </g>
          ))
        )}
      </svg>
      <p className="mt-1 text-center text-[10px] text-white/40">
        <span className="font-semibold text-blue-400">P1 blue</span>
        {" · "}
        <span className="font-semibold text-red-400">P2 red</span>
        {" · glow = last claim"}
        {selectMode === "edge" ? " · select an edge for power" : ""}
        {selectMode === "box" ? " · tap a box" : ""}
        {selectMode === "row" ? " · tap a box or edge in the row to clear" : ""}
        {selectMode === "col" ? " · tap a box or edge in the column to clear" : ""}
        {selectMode === "dot" ? " · tap a gold dot for cross clear" : ""}
      </p>
    </div>
  );
}

"use client";

import type { RoomState } from "@/lib/types";

export function Scoreboard({
  room,
  canEditFirstTo,
  onFirstTo,
}: {
  room: RoomState;
  canEditFirstTo: boolean;
  onFirstTo: (n: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
          Series · first to
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canEditFirstTo || room.firstTo <= 1}
            onClick={() => onFirstTo(room.firstTo - 1)}
            className="h-8 w-8 rounded-lg bg-white/10 text-lg disabled:opacity-30"
          >
            −
          </button>
          <span className="min-w-6 text-center text-xl font-black text-amber-300">
            {room.firstTo}
          </span>
          <button
            type="button"
            disabled={!canEditFirstTo || room.firstTo >= 9}
            onClick={() => onFirstTo(room.firstTo + 1)}
            className="h-8 w-8 rounded-lg bg-white/10 text-lg disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
      <div className="grid gap-2">
        {room.players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-2"
          >
            <div>
              <div className="font-bold">
                <span className={p.mark === "X" ? "text-fuchsia-400" : "text-cyan-300"}>
                  {p.mark}
                </span>{" "}
                {p.name}
                {!p.connected && (
                  <span className="ml-2 text-xs text-white/40">(away)</span>
                )}
              </div>
              <div className="text-xs text-white/50">
                Streak {p.streak} · W {p.wins} / L {p.losses}
              </div>
            </div>
            <div className="text-2xl font-black tabular-nums text-white">{p.wins}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

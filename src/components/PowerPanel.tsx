"use client";

import { POWER_DEFS, POWER_ORDER, powerAvailability } from "@/lib/powers";
import type { PlayerState, PowerId, RoomState } from "@/lib/types";

export function EnergyBar({
  player,
  label,
}: {
  player: PlayerState;
  label?: string;
}) {
  const energy = Math.max(0, Math.min(100, player.energy ?? 0));
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-sky-200/80">
        <span>{label || player.name} · Energy</span>
        <span className="font-bold text-sky-300">⚡ {energy}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-sky-500/30">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-700 via-sky-400 to-cyan-300 transition-all duration-300"
          style={{ width: `${energy}%` }}
        />
      </div>
    </div>
  );
}

export function PowerPanel({
  room,
  player,
  selected,
  disabled,
  onSelect,
}: {
  room: RoomState;
  player: PlayerState | null;
  selected: PowerId | null;
  disabled: boolean;
  onSelect: (p: PowerId | null) => void;
}) {
  if (!player) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-sm text-white/50">
        No active player
      </div>
    );
  }

  return (
    <div>
      <EnergyBar player={player} />
      <p className="mb-1.5 text-[10px] text-white/45">
        1 use per power / game · powers don’t end your turn
      </p>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-5">
        {POWER_ORDER.map((id) => {
          const def = POWER_DEFS[id];
          const status = powerAvailability(room, player, id);
          const active = selected === id;
          const locked = !!def.requiresExpanded && room.boardSize < 4;
          const used = (player.usedPowers || []).includes(id);
          const broke = !status.ok;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled || broke}
              title={broke ? status.reason : def.description}
              onClick={() => onSelect(active ? null : id)}
              className={`relative rounded-xl border p-1.5 text-left transition sm:p-2 ${
                active
                  ? "border-sky-400 bg-blue-500/30 shadow-[0_0_16px_rgba(56,189,248,0.4)]"
                  : broke
                    ? "border-white/5 bg-black/20 opacity-45"
                    : "border-white/10 bg-white/5 hover:border-sky-400/40"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-base leading-none sm:text-lg">{def.emoji}</span>
                <span className="rounded-md bg-sky-500/20 px-1 py-0.5 text-[9px] font-bold text-sky-200">
                  ⚡{def.cost}
                </span>
              </div>
              <div className="mt-1 text-[10px] font-bold leading-tight text-white/90 sm:text-xs">
                {def.name}
              </div>
              {locked && (
                <span className="mt-0.5 inline-block text-[9px] text-amber-300">🔒 4×4</span>
              )}
              {used && !locked && (
                <span className="mt-0.5 inline-block text-[9px] text-white/40">Used</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

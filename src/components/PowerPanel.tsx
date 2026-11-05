"use client";

import { POWER_DEFS } from "@/lib/powers";
import type { PowerId } from "@/lib/types";

export function PowerPanel({
  powers,
  selected,
  disabled,
  onSelect,
}: {
  powers: PowerId[];
  selected: PowerId | null;
  disabled: boolean;
  onSelect: (p: PowerId | null) => void;
}) {
  if (powers.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-sm text-white/50">
        No powers left this round
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      {powers.map((id, i) => {
        const def = POWER_DEFS[id];
        const active = selected === id;
        return (
          <button
            key={`${id}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(active ? null : id)}
            className={`rounded-xl border p-2 text-left transition sm:rounded-2xl sm:p-3 ${
              active
                ? "border-sky-400 bg-blue-500/30 shadow-[0_0_22px_rgba(56,189,248,0.45)]"
                : "border-white/10 bg-white/5 hover:border-white/30"
            } disabled:opacity-40`}
          >
            <div className="flex items-center gap-1 text-xs font-bold sm:gap-2 sm:text-base">
              <span className="text-base sm:text-xl">{def.emoji}</span>
              <span className="leading-tight">{def.name}</span>
            </div>
            <p className="mt-0.5 hidden text-xs text-white/60 sm:mt-1 sm:block">{def.description}</p>
          </button>
        );
      })}
    </div>
  );
}

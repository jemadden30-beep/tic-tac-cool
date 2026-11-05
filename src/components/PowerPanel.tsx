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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {powers.map((id, i) => {
        const def = POWER_DEFS[id];
        const active = selected === id;
        return (
          <button
            key={`${id}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(active ? null : id)}
            className={`rounded-2xl border p-3 text-left transition ${
              active
                ? "border-fuchsia-400 bg-fuchsia-500/30 shadow-[0_0_20px_rgba(217,70,239,0.35)]"
                : "border-white/10 bg-white/5 hover:border-white/30"
            } disabled:opacity-40`}
          >
            <div className="flex items-center gap-2 text-base font-bold">
              <span className="text-xl">{def.emoji}</span>
              {def.name}
            </div>
            <p className="mt-1 text-xs text-white/60">{def.description}</p>
          </button>
        );
      })}
    </div>
  );
}

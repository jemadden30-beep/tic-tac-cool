"use client";

import { DOTS_POWER_DEFS, DOTS_POWER_ORDER } from "@/lib/dots/powers";
import type { DotsPowerId, DotsPlayer } from "@/lib/dots/types";

type Props = {
  me: DotsPlayer | undefined;
  active: DotsPowerId | null;
  onSelect: (id: DotsPowerId | null) => void;
  disabled?: boolean;
};

export function DotsPowerPanel({ me, active, onSelect, disabled }: Props) {
  const energy = me?.energy ?? 0;
  const used = me?.usedPowers ?? [];
  const silenced = me?.silenced;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Powers</h3>
        <span className="text-xs font-bold text-sky-300">⚡{energy}</span>
      </div>
      {silenced && (
        <p className="mb-2 text-[11px] text-amber-200">Silenced — powers locked this turn</p>
      )}
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-4">
        {DOTS_POWER_ORDER.map((id) => {
          const p = DOTS_POWER_DEFS[id];
          const spent = used.includes(id);
          const cost = id === "vault" ? "all" : p.cost;
          const tooPoor = id === "vault" ? energy < 40 : energy < p.cost;
          const locked = disabled || silenced || spent || tooPoor;
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              title={`${p.name} — ⚡${cost}\n${p.description}`}
              disabled={locked && !isActive}
              onClick={() => onSelect(isActive ? null : id)}
              className={`flex flex-col items-start rounded-xl border px-1.5 py-1.5 text-left transition ${
                isActive
                  ? "border-sky-400 bg-sky-500/25"
                  : locked
                    ? "border-white/5 bg-white/[0.03] opacity-40"
                    : "border-white/10 bg-white/5 hover:border-sky-400/40"
              }`}
            >
              <span className="text-sm leading-none">{p.emoji}</span>
              <span className="mt-0.5 w-full truncate text-[10px] font-semibold">{p.name}</span>
              <span className="text-[9px] font-bold text-sky-300">⚡{cost}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="mt-2 text-[11px] text-white/55">{DOTS_POWER_DEFS[active].description}</p>
      )}
    </div>
  );
}

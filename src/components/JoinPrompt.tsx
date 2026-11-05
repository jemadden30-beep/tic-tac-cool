"use client";

import { useState } from "react";
import Link from "next/link";

type P = { id: string; name: string; mark: string; connected: boolean };

/** Shown to a visitor who opened an online invite link but holds no seat. Only a human tap claims P2. */
export function JoinPrompt({
  code,
  gameLabel,
  players,
  defaultName,
  backHref,
  error,
  onJoin,
  onRetry,
}: {
  code: string;
  gameLabel: string;
  players: P[];
  defaultName: string;
  backHref: string;
  error: string | null;
  onJoin: (name: string) => Promise<unknown>;
  onRetry: () => void;
}) {
  const [nick, setNick] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const x = players.find((p) => p.mark === "X");
  const o = players.find((p) => p.mark === "O");
  const blocked = !!o && o.connected;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{gameLabel}</p>
        <h1 className="mt-1 text-2xl font-black">
          Join Match <span className="font-mono text-sky-300">{code}</span>
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2">
            <div className="text-[10px] font-bold uppercase text-blue-300">P1</div>
            {x?.name || "—"} {x ? (x.connected ? "🟢" : "⚪") : ""}
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2">
            <div className="text-[10px] font-bold uppercase text-red-300">P2</div>
            {o ? `${o.name} ${o.connected ? "🟢" : "⚪ (away)"}` : "Open"}
          </div>
        </div>
        {blocked ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-amber-200">
              P2 is taken by someone who is online right now. Ask the host to tap{" "}
              <b>Free P2 seat</b>, then retry.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-xl border border-white/15 px-4 py-3 font-semibold hover:bg-white/10"
            >
              Retry
            </button>
          </div>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              await onJoin(nick.trim() || "Player");
              setBusy(false);
            }}
          >
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value.slice(0, 20))}
              placeholder="Your nickname"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-lg font-bold hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "Joining…" : "Join as Player 2"}
            </button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        <Link href={backHref} className="mt-4 inline-block text-sm text-sky-300 underline">
          Back
        </Link>
      </div>
    </main>
  );
}

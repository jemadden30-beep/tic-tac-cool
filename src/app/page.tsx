"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/hooks/usePlayer";
import { useSocket } from "@/hooks/useSocket";
import { POWER_DEFS, ALL_POWERS } from "@/lib/powers";

export default function HomePage() {
  const router = useRouter();
  const { playerId, name, setName, stats, ready } = usePlayer();
  const { connected, createRoom, joinRoom, error, clearError } = useSocket();
  const [joinCode, setJoinCode] = useState("");
  const [firstTo, setFirstTo] = useState(3);
  const [busy, setBusy] = useState(false);

  async function create(mode: "online" | "hotseat") {
    if (!ready) return;
    setBusy(true);
    clearError();
    const res = await createRoom({ playerId, name, mode, firstTo });
    setBusy(false);
    if (res.ok && res.room) router.push(`/room/${res.room.code}`);
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    if (!ready || !joinCode.trim()) return;
    setBusy(true);
    clearError();
    const res = await joinRoom({
      code: joinCode.trim(),
      playerId,
      name,
    });
    setBusy(false);
    if (res.ok && res.room) router.push(`/room/${res.room.code}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="space-y-3 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-fuchsia-300">
            Power-up tic-tac-toe
          </p>
          <h1 className="bg-gradient-to-r from-fuchsia-300 via-amber-200 to-cyan-300 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">
            Tic Tac Cool
          </h1>
          <p className="max-w-2xl text-white/70">
            Boot tiles, summon lightning, spin a tornado, expand to 4×4, and duel friends
            across devices — with chat, streaks, and first-to-N series.
          </p>
          <p className="text-sm text-white/40">
            Socket {connected ? "online" : "connecting…"} · Career W {stats.wins} / L{" "}
            {stats.losses} · Best streak {stats.bestStreak}
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="mb-3 text-lg font-bold">Your handle</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-fuchsia-400"
              maxLength={20}
              placeholder="Nickname"
            />
            <label className="mb-2 block text-sm text-white/60">First to how many wins?</label>
            <div className="mb-5 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={9}
                value={firstTo}
                onChange={(e) => setFirstTo(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-center text-xl font-black text-amber-300">{firstTo}</span>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => create("online")}
                className="rounded-xl bg-fuchsia-600 px-4 py-3 font-bold hover:bg-fuchsia-500 disabled:opacity-40"
              >
                Create online room
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => create("hotseat")}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold hover:bg-white/10 disabled:opacity-40"
              >
                Play hotseat (same device)
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="mb-3 text-lg font-bold">Join with code</h2>
            <form onSubmit={onJoin} className="space-y-3">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 font-mono text-lg tracking-[0.3em] outline-none focus:border-cyan-400"
                placeholder="ROOM CODE"
                maxLength={6}
              />
              <button
                type="submit"
                disabled={!ready || busy || joinCode.length < 4}
                className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-bold text-black hover:bg-cyan-400 disabled:opacity-40"
              >
                Join game
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
            <p className="mt-4 text-sm text-white/50">
              Got an invite link? Open it directly — it looks like{" "}
              <code className="text-cyan-200">/room/ABC123</code>.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <h2 className="mb-4 text-lg font-bold">Power moves</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ALL_POWERS.map((id) => {
              const p = POWER_DEFS[id];
              return (
                <div key={id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="font-bold">{p.name}</div>
                  <p className="text-xs text-white/55">{p.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

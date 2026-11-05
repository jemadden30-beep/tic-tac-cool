"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/hooks/usePlayer";
import { useSocket } from "@/hooks/useSocket";
import { POWER_DEFS, POWER_ORDER } from "@/lib/powers";
import type { BotDifficulty } from "@/lib/types";

const DIFFICULTIES: { id: BotDifficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Mostly random — warm-up mode" },
  { id: "medium", label: "Medium", blurb: "Blocks & takes wins" },
  { id: "hard", label: "Hard", blurb: "Strong play + smarter powers" },
  { id: "expert", label: "Expert", blurb: "Deep search + aggressive powers" },
];

export default function HomePage() {
  const router = useRouter();
  const { playerId, name, setName, stats, ready } = usePlayer();
  const { connected, createRoom, joinRoom, error, clearError } = useSocket();
  const [joinCode, setJoinCode] = useState("");
  const [firstTo, setFirstTo] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [busy, setBusy] = useState(false);

  async function create(mode: "online" | "hotseat" | "bot") {
    if (!ready) return;
    setBusy(true);
    clearError();
    const res = await createRoom({
      playerId,
      name,
      mode,
      firstTo,
      difficulty: mode === "bot" ? difficulty : undefined,
    });
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
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-600/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="space-y-3 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">
            Power-up tic-tac-toe
          </p>
          <h1 className="bg-gradient-to-r from-sky-300 via-blue-200 to-indigo-300 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">
            Tic Tac Cool
          </h1>
          <p className="max-w-2xl text-white/70">
            Boot tiles, summon lightning, spin a tornado, expand to 4×4 — duel friends online
            or train against a bot with four difficulty levels.
          </p>
          <p className="text-sm text-white/40">
            Socket {connected ? "online" : "connecting…"} · Career W {stats.wins} / L{" "}
            {stats.losses} · Best streak {stats.bestStreak}
          </p>
        </header>

        <section className="rounded-3xl border border-sky-400/25 bg-gradient-to-br from-blue-600/20 to-indigo-900/30 p-5 backdrop-blur">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-sky-100">Solo vs Bot</h2>
              <p className="text-sm text-white/55">
                You are X · Bot is O · series first-to-{firstTo}
              </p>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => create("bot")}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold shadow-[0_0_24px_rgba(37,99,235,0.45)] hover:bg-blue-500 disabled:opacity-40"
            >
              Play vs {difficulty} bot
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFICULTIES.map((d) => {
              const active = difficulty === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDifficulty(d.id)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-sky-400 bg-sky-500/25 shadow-[0_0_18px_rgba(56,189,248,0.35)]"
                      : "border-white/10 bg-black/20 hover:border-white/25"
                  }`}
                >
                  <div className="font-bold text-sky-100">{d.label}</div>
                  <p className="text-xs text-white/55">{d.blurb}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <h2 className="mb-3 text-lg font-bold">Your handle</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-sky-400"
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
              <span className="w-8 text-center text-xl font-black text-sky-300">{firstTo}</span>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => create("online")}
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500 disabled:opacity-40"
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
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 font-mono text-lg tracking-[0.3em] outline-none focus:border-blue-400"
                placeholder="ROOM CODE"
                maxLength={6}
              />
              <button
                type="submit"
                disabled={!ready || busy || joinCode.length < 4}
                className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-bold text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                Join game
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
            <p className="mt-4 text-sm text-white/50">
              Got an invite link? Open it directly — it looks like{" "}
              <code className="text-blue-200">/room/ABC123</code>.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <h2 className="mb-4 text-lg font-bold">Power moves</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {POWER_ORDER.map((id) => {
              const p = POWER_DEFS[id];
              return (
                <div key={id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{p.name}</div>
                    <span className="text-[10px] font-bold text-sky-300">⚡{p.cost}</span>
                  </div>
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

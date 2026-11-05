"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayer } from "@/hooks/usePlayer";
import { useDotsSocket } from "@/hooks/useDotsSocket";
import { DOTS_POWER_DEFS, DOTS_POWER_ORDER } from "@/lib/dots/powers";
import type { BotDifficulty } from "@/lib/types";
import type { DotsMatchSummary } from "@/lib/dots/types";

const DIFFICULTIES: { id: BotDifficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Random lines" },
  { id: "medium", label: "Medium", blurb: "Takes boxes, avoids gifts" },
  { id: "hard", label: "Hard", blurb: "Smart lines + powers" },
  { id: "expert", label: "Expert", blurb: "Aggressive + powers" },
];

function remember(code: string) {
  try {
    const key = "ttc_match_codes";
    const raw = localStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(
      key,
      JSON.stringify([code.toUpperCase(), ...list.filter((c) => c !== code.toUpperCase())].slice(0, 40))
    );
  } catch {
    /* ignore */
  }
}

function forget(code: string) {
  try {
    const key = "ttc_match_codes";
    const raw = localStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(
      key,
      JSON.stringify(list.filter((c) => c !== code.toUpperCase()))
    );
  } catch {
    /* ignore */
  }
}

export default function DotsHomePage() {
  const router = useRouter();
  const { playerId, name, setName, ready } = usePlayer();
  const { connected, createRoom, joinRoom, listMyMatches, deleteMatch, error, clearError } = useDotsSocket();
  const [joinCode, setJoinCode] = useState("");
  const [firstTo, setFirstTo] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<DotsMatchSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!ready || !playerId || !connected) return;
    const res = await listMyMatches(playerId);
    if (res.ok && res.matches) {
      setMatches(res.matches.filter((m): m is DotsMatchSummary => m.gameKind === "dots"));
    }
  }, [ready, playerId, connected, listMyMatches]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function onDeleteMatch(m: DotsMatchSummary) {
    if (
      !window.confirm(
        `Delete match ${m.code} permanently? This removes the room for everyone.`
      )
    ) {
      return;
    }
    clearError();
    const res = await deleteMatch({ code: m.code, playerId });
    if (res.ok) {
      forget(m.code);
      setMatches((prev) => prev.filter((x) => x.code !== m.code));
    }
  }

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
    if (res.ok && res.room) {
      remember(res.room.code);
      router.push(`/dots/room/${res.room.code}`);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    if (!ready || !joinCode.trim()) return;
    setBusy(true);
    clearError();
    const res = await joinRoom({ code: joinCode.trim(), playerId, name });
    setBusy(false);
    if (res.ok && res.room) {
      remember(res.room.code);
      router.push(`/dots/room/${res.room.code}`);
    } else if (res.redirect) {
      router.push(res.redirect);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-600/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <Link href="/" className="text-xs font-semibold text-sky-300 hover:underline">
            ← All games
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">
            Power-up classic
          </p>
          <h1 className="bg-gradient-to-r from-sky-300 via-blue-200 to-indigo-300 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
            Dots & Boxes
          </h1>
          <p className="max-w-2xl text-white/70">
            10×10 dots (9×9 boxes). Claim edges — close a box to score and go again. Energy powers
            let you snip, hijack, freeze, and more.
          </p>
          <p className="text-sm text-white/40">
            Socket {connected ? "online" : "connecting…"}
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Your matches</h2>
              <p className="text-xs text-white/50">Online rooms only — bot games stay off this list.</p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
          {matches.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-center text-sm text-white/45">
              No active online Dots matches yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((m) => (
                <li
                  key={m.code}
                  className="flex items-stretch gap-2 rounded-2xl border border-white/10 bg-black/25 p-2"
                >
                  <Link
                    href={`/dots/room/${m.code}`}
                    className="min-w-0 flex-1 rounded-xl p-2 transition hover:border-sky-400/50 hover:bg-sky-500/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-lg font-black text-sky-300">{m.code}</span>
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                          {m.statusLabel}
                        </span>
                        <p className="mt-1 text-sm text-white/75">
                          vs <span className="font-semibold">{m.opponentName}</span>
                          {" · "}
                          boxes {m.myBoxes}–{m.opponentBoxes}
                        </p>
                      </div>
                      <div className="text-right text-xl font-black tabular-nums">
                        {m.myWins}–{m.opponentWins}
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    title="Delete match permanently"
                    onClick={() => void onDeleteMatch(m)}
                    className="shrink-0 self-center rounded-xl border border-rose-400/35 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/25"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-sky-400/25 bg-gradient-to-br from-blue-600/20 to-indigo-900/30 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-sky-100">Solo vs Bot</h2>
              <p className="text-sm text-white/55">You are X · first to {firstTo}</p>
            </div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => create("bot")}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500 disabled:opacity-40"
            >
              Play vs {difficulty} bot
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDifficulty(d.id)}
                className={`rounded-2xl border p-3 text-left ${
                  difficulty === d.id
                    ? "border-sky-400 bg-sky-500/25"
                    : "border-white/10 bg-black/20 hover:border-white/25"
                }`}
              >
                <div className="font-bold text-sky-100">{d.label}</div>
                <p className="text-xs text-white/55">{d.blurb}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
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

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
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
                className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-bold hover:bg-indigo-400 disabled:opacity-40"
              >
                Join game
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Power moves</h2>
            <p className="text-[11px] text-white/40">Hover for details</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8">
            {DOTS_POWER_ORDER.map((id) => {
              const p = DOTS_POWER_DEFS[id];
              return (
                <div
                  key={id}
                  title={`${p.name} — ⚡${p.cost || "all"}\n${p.description}`}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5"
                >
                  <span className="text-base">{p.emoji}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold">{p.name}</div>
                    <div className="text-[10px] font-bold text-sky-300">
                      ⚡{p.cost === 0 ? "all" : p.cost}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

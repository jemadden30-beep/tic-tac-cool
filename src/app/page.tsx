"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayer } from "@/hooks/usePlayer";
import { useSocket } from "@/hooks/useSocket";
import { POWER_DEFS, POWER_ORDER } from "@/lib/powers";
import type { BotDifficulty, MyMatchSummary } from "@/lib/types";
import type { DotsMatchSummary } from "@/lib/dots/types";

type MatchRow = MyMatchSummary | DotsMatchSummary;

const MATCHES_KEY = "ttc_match_codes";

function rememberMatchCode(code: string) {
  try {
    const raw = localStorage.getItem(MATCHES_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [code.toUpperCase(), ...list.filter((c) => c !== code.toUpperCase())].slice(0, 40);
    localStorage.setItem(MATCHES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function forgetMatchCode(code: string) {
  try {
    const raw = localStorage.getItem(MATCHES_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(
      MATCHES_KEY,
      JSON.stringify(list.filter((c) => c !== code.toUpperCase()))
    );
  } catch {
    /* ignore */
  }
}

const DIFFICULTIES: { id: BotDifficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Mostly random — warm-up mode" },
  { id: "medium", label: "Medium", blurb: "Blocks & takes wins" },
  { id: "hard", label: "Hard", blurb: "Strong play + smarter powers" },
  { id: "expert", label: "Expert", blurb: "Deep search + aggressive powers" },
];

export default function HomePage() {
  const router = useRouter();
  const { playerId, name, setName, stats, ready } = usePlayer();
  const { connected, createRoom, joinRoom, listMyMatches, deleteMatch, error, clearError } = useSocket();
  const [joinCode, setJoinCode] = useState("");
  const [firstTo, setFirstTo] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [gamePick, setGamePick] = useState<"ttt" | null>("ttt");

  const refreshMatches = useCallback(async () => {
    if (!ready || !playerId || !connected) return;
    setMatchesLoading(true);
    const res = await listMyMatches(playerId);
    setMatchesLoading(false);
    if (res.ok && res.matches) setMatches(res.matches);
  }, [ready, playerId, connected, listMyMatches]);

  useEffect(() => {
    void refreshMatches();
    const id = window.setInterval(() => void refreshMatches(), 8000);
    return () => window.clearInterval(id);
  }, [refreshMatches]);

  async function onDeleteMatch(m: MatchRow) {
    if (
      !window.confirm(
        `Delete match ${m.code} permanently? This removes the room for everyone.`
      )
    ) {
      return;
    }
    clearError();
    const res = await deleteMatch({
      code: m.code,
      playerId,
      gameKind: m.gameKind === "dots" ? "dots" : "ttt",
    });
    if (res.ok) {
      forgetMatchCode(m.code);
      setMatches((prev) => prev.filter((x) => !(x.code === m.code && x.gameKind === m.gameKind)));
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
      rememberMatchCode(res.room.code);
      router.push(`/room/${res.room.code}`);
    }
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
    if (res.ok && res.room) {
      rememberMatchCode(res.room.code);
      router.push(`/room/${res.room.code}`);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-600/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="space-y-3 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">
            Power-up parlor games
          </p>
          <h1 className="bg-gradient-to-r from-sky-300 via-blue-200 to-indigo-300 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">
            Tic Tac Cool
          </h1>
          <p className="max-w-2xl text-white/70">
            Pick a game below — power-up tic-tac-toe or classic Dots &amp; Boxes with energy
            powers, online rooms, and bots.
          </p>
          <p className="text-sm text-white/40">
            Socket {connected ? "online" : "connecting…"} · Career W {stats.wins} / L{" "}
            {stats.losses} · Best streak {stats.bestStreak}
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setGamePick("ttt")}
            className={`rounded-3xl border p-5 text-left transition ${
              gamePick === "ttt"
                ? "border-sky-400 bg-sky-500/20 shadow-[0_0_24px_rgba(56,189,248,0.25)]"
                : "border-white/10 bg-white/5 hover:border-white/25"
            }`}
          >
            <div className="text-2xl">❌⭕</div>
            <h2 className="mt-1 text-xl font-black text-sky-100">Tic Tac Cool</h2>
            <p className="mt-1 text-sm text-white/55">
              Power-up tic-tac-toe — expand the board, boot tiles, duel online or vs bot.
            </p>
          </button>
          <Link
            href="/dots"
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-indigo-400/50 hover:bg-indigo-500/15"
          >
            <div className="text-2xl">⬚</div>
            <h2 className="mt-1 text-xl font-black text-indigo-100">Dots &amp; Boxes</h2>
            <p className="mt-1 text-sm text-white/55">
              10×10 dots, claim edges, close boxes — with snip, hijack, freeze &amp; more.
            </p>
          </Link>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Your matches</h2>
              <p className="text-xs text-white/50">
                Online rooms only — tap to resume. Tied to this device via your player id.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshMatches()}
              disabled={!connected || matchesLoading}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40"
            >
              {matchesLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {matches.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/45">
              No active online matches yet. Create or join a room — bot games stay off this list.
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((m) => (
                <li
                  key={`${m.gameKind}-${m.code}`}
                  className="flex items-stretch gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 transition hover:border-sky-400/40"
                >
                  <Link
                    href={m.gameKind === "dots" ? `/dots/room/${m.code}` : `/room/${m.code}`}
                    className="min-w-0 flex-1 rounded-xl p-2 hover:bg-sky-500/10 active:scale-[0.99]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-lg font-black text-sky-300">{m.code}</span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/60">
                            {m.gameKind === "dots" ? "dots" : "ttt"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              m.yourTurn
                                ? "bg-emerald-500/25 text-emerald-200"
                                : m.phase === "playing"
                                  ? "bg-amber-500/20 text-amber-100"
                                  : "bg-white/10 text-white/60"
                            }`}
                          >
                            {m.statusLabel}
                          </span>
                          <span className="text-[10px] uppercase text-white/40">
                            {m.mode === "bot"
                              ? `bot${m.difficulty ? ` · ${m.difficulty}` : ""}`
                              : m.mode}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-white/75">
                          vs <span className="font-semibold text-white">{m.opponentName}</span>
                          {!m.opponentConnected && m.mode === "online" && m.opponentName !== "Waiting for opponent…" && (
                            <span className="text-white/40"> (away)</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black tabular-nums text-white">
                          {m.myWins}–{m.opponentWins}
                        </div>
                        <div className="text-[10px] text-white/45">first to {m.firstTo}</div>
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

        <section className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Power moves</h2>
            <p className="text-[11px] text-white/40">Hover or long-press a chip for details</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {POWER_ORDER.map((id) => {
              const p = POWER_DEFS[id];
              return (
                <div
                  key={id}
                  title={`${p.name} — ⚡${p.cost}\n${p.description}`}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 transition hover:border-sky-400/40 hover:bg-sky-500/10"
                >
                  <span className="text-base leading-none" aria-hidden>
                    {p.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold leading-tight">{p.name}</div>
                    <div className="text-[10px] font-bold leading-tight text-sky-300">
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

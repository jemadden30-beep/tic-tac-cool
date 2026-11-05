"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DotsRoomState, DotsPowerId, EdgeId, DotsAnimation, DotsPowerTarget } from "@/lib/dots/types";
import { DOTS_POWER_DEFS } from "@/lib/dots/powers";
import { DotsBoard } from "./DotsBoard";
import { DotsPowerPanel } from "./DotsPowerPanel";
import { Chat } from "@/components/Chat";
import { TurnNotifier } from "@/components/TurnNotifier";

type Api = {
  startGame: (code: string, playerId: string) => Promise<unknown>;
  nextRound: (code: string, playerId: string) => Promise<unknown>;
  claim: (code: string, playerId: string, edge: EdgeId) => Promise<unknown>;
  usePower: (
    code: string,
    playerId: string,
    power: DotsPowerId,
    target: DotsPowerTarget
  ) => Promise<unknown>;
  sendChat: (code: string, playerId: string, text: string) => Promise<unknown>;
  kickO: (code: string, playerId: string) => Promise<unknown>;
  deleteMatch: (opts: {
    code: string;
    playerId: string;
  }) => Promise<{ ok?: boolean; error?: string }>;
  clearError: () => void;
  error: string | null;
};

export function DotsRoom({
  room,
  playerId,
  api,
  animation,
  onClearAnim,
}: {
  room: DotsRoomState;
  playerId: string;
  api: Api;
  animation: DotsAnimation | null;
  onClearAnim: () => void;
}) {
  const [pendingPower, setPendingPower] = useState<DotsPowerId | null>(null);

  const me = useMemo(() => {
    if (room.mode === "hotseat") return room.players.find((p) => p.mark === room.turn);
    return room.players.find((p) => p.id === playerId);
  }, [room, playerId]);

  const seat = room.players.find((p) => p.id === playerId);
  const isMyTurn =
    room.phase === "playing" &&
    (room.mode === "hotseat" || (!!seat && seat.mark === room.turn));

  const x = room.players.find((p) => p.mark === "X");
  const o = room.players.find((p) => p.mark === "O");

  const pendingTarget = pendingPower ? DOTS_POWER_DEFS[pendingPower].needsTarget : null;
  const selectMode = pendingTarget ? (pendingTarget === "none" ? null : pendingTarget) : "claim";

  async function firePower(
    power: DotsPowerId,
    target: DotsPowerTarget
  ) {
    api.clearError();
    await api.usePower(room.code, playerId, power, target);
    setPendingPower(null);
  }

  async function onSelectPower(id: DotsPowerId | null) {
    if (!id) {
      setPendingPower(null);
      return;
    }
    const def = DOTS_POWER_DEFS[id];
    if (def.needsTarget === "none") {
      await firePower(id, { kind: "none" });
      return;
    }
    setPendingPower(id);
  }

  async function onClaim(edge: EdgeId) {
    if (pendingPower) {
      const def = DOTS_POWER_DEFS[pendingPower];
      if (def.needsTarget === "edge") {
        await firePower(pendingPower, { kind: "edge", edge });
      }
      return;
    }
    api.clearError();
    await api.claim(room.code, playerId, edge);
  }

  async function onBox(index: number) {
    if (pendingPower && DOTS_POWER_DEFS[pendingPower].needsTarget === "box") {
      await firePower(pendingPower, { kind: "box", index });
    }
  }

  const invite =
    typeof window !== "undefined"
      ? `${window.location.origin}/dots/room/${room.code}`
      : `/dots/room/${room.code}`;

  const router = useRouter();

  async function onDeleteRoom() {
    if (
      !window.confirm(
        `Delete room ${room.code} permanently? This removes the match for everyone.`
      )
    ) {
      return;
    }
    const res = await api.deleteMatch({ code: room.code, playerId });
    if (res?.ok) {
      try {
        const key = "ttc_match_codes";
        const raw = localStorage.getItem(key);
        const list: string[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(
          key,
          JSON.stringify(list.filter((c) => c !== room.code.toUpperCase()))
        );
      } catch {
        /* ignore */
      }
      router.push("/dots");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-6 sm:px-6 [overflow-anchor:none]">
      <TurnNotifier room={room} playerId={playerId} gameLabel="Dots & Boxes" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dots" className="text-xs font-semibold text-sky-300 hover:underline">
            ← Dots & Boxes
          </Link>
          <h1 className="text-2xl font-black text-sky-100">
            Room <span className="font-mono text-sky-300">{room.code}</span>
          </h1>
          <p className="text-xs text-white/50">
            {room.mode} · first to {room.firstTo}
            {room.mode === "bot" && room.difficulty ? ` · ${room.difficulty}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {room.mode === "online" && (
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
              onClick={() => void navigator.clipboard?.writeText(invite)}
            >
              Copy invite
            </button>
          )}
          {room.mode === "online" &&
            room.hostId === playerId &&
            !!o &&
            (room.phase === "lobby" || !o.connected) && (
              <button
                type="button"
                className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/25"
                onClick={() => void api.kickO(room.code, playerId)}
              >
                Free P2 seat
              </button>
            )}
          <button
            type="button"
            className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
            onClick={() => void onDeleteRoom()}
          >
            Delete room
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-2xl border p-3 ${
            room.turn === "X" && room.phase === "playing"
              ? "border-blue-400 bg-blue-500/20 shadow-[0_0_18px_rgba(59,130,246,0.35)]"
              : "border-blue-500/30 bg-blue-500/10"
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-blue-300">
            P1 · Blue · {x?.name || "—"}
          </div>
          <div className="text-2xl font-black tabular-nums text-blue-100">
            {x?.boxes ?? 0} <span className="text-sm font-semibold text-blue-200/50">boxes</span>
          </div>
          <div className="text-xs text-blue-100/60">
            Series {x?.wins ?? 0} · ⚡{x?.energy ?? 0}
          </div>
        </div>
        <div
          className={`rounded-2xl border p-3 ${
            room.turn === "O" && room.phase === "playing"
              ? "border-red-400 bg-red-500/20 shadow-[0_0_18px_rgba(239,68,68,0.35)]"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-red-300">
            P2 · Red · {o?.name || "Waiting…"}
          </div>
          <div className="text-2xl font-black tabular-nums text-red-100">
            {o?.boxes ?? 0} <span className="text-sm font-semibold text-red-200/50">boxes</span>
          </div>
          <div className="text-xs text-red-100/60">
            Series {o?.wins ?? 0} · ⚡{o?.energy ?? 0}
          </div>
        </div>
      </div>

      {room.phase === "lobby" && (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-center">
          <p className="mb-3 text-sm text-white/70">
            {room.mode === "online" && o
              ? "P2 seat is taken. If that was a test device, Free P2 seat so your friend can join."
              : "Host can start anytime — guest can join mid-game."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {(room.hostId === playerId || room.mode !== "online") && (
              <button
                type="button"
                onClick={() => void api.startGame(room.code, playerId)}
                className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500"
              >
                Start match
              </button>
            )}
            {room.mode === "online" && room.hostId === playerId && !!o && (
              <button
                type="button"
                onClick={() => void api.kickO(room.code, playerId)}
                className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
              >
                Clear opponent seat
              </button>
            )}
          </div>
        </div>
      )}

      {(room.phase === "round_over" || room.phase === "series_over") && (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-center">
          <p className="text-lg font-bold">
            {room.phase === "series_over"
              ? `${room.players.find((p) => p.id === room.seriesWinner)?.name || "Player"} wins the series!`
              : "Round over"}
          </p>
          <p className="mt-1 text-sm text-white/55">
            Boxes X {x?.boxes ?? 0} — {o?.boxes ?? 0} O
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {room.phase === "round_over" && (
              <button
                type="button"
                onClick={() => void api.nextRound(room.code, playerId)}
                className="rounded-xl bg-blue-600 px-4 py-2 font-bold hover:bg-blue-500"
              >
                Next round
              </button>
            )}
            {room.phase === "series_over" && room.hostId === playerId && (
              <button
                type="button"
                onClick={() => void api.startGame(room.code, playerId)}
                className="rounded-xl bg-indigo-500 px-4 py-2 font-bold hover:bg-indigo-400"
              >
                Rematch series
              </button>
            )}
          </div>
        </div>
      )}

      <p className="min-h-[1.25rem] text-center text-sm font-semibold text-sky-100">
        {room.phase === "playing" ? (
          <>
            {isMyTurn
              ? room.mode === "hotseat"
                ? `${room.turn}'s turn — claim an edge`
                : "Your turn — claim an edge"
              : `Waiting on ${room.turn}…`}
            {room.twinClaimsLeft > 0 ? ` · Twin (${room.twinClaimsLeft} left)` : ""}
            {room.sparkArmed ? " · Spark armed" : ""}
          </>
        ) : (
          <span className="text-white/40">&nbsp;</span>
        )}
      </p>

      <DotsBoard
        room={room}
        interactive={isMyTurn && room.phase === "playing"}
        selectMode={isMyTurn ? selectMode : null}
        onClaimEdge={(e) => void onClaim(e)}
        onSelectEdge={(e) => void onClaim(e)}
        onSelectBox={(i) => void onBox(i)}
        onSelectRow={(index) => pendingPower && void firePower(pendingPower, { kind: "row", index })}
        onSelectCol={(index) => pendingPower && void firePower(pendingPower, { kind: "col", index })}
        onSelectDot={(r, c) => pendingPower && void firePower(pendingPower, { kind: "dot", r, c })}
      />

      {room.phase === "playing" && (
        <DotsPowerPanel
          me={room.mode === "hotseat" ? me : seat}
          active={isMyTurn ? pendingPower : null}
          onSelect={(id) => void onSelectPower(id)}
          disabled={!isMyTurn || room.powerUsedThisTurn}
        />
      )}

      {animation && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-sky-400/40 bg-[#0a1a36]/95 px-4 py-2 text-sm font-bold shadow-lg">
          {DOTS_POWER_DEFS[animation.power].emoji} {DOTS_POWER_DEFS[animation.power].name}
          <button type="button" className="ml-3 text-xs text-white/50" onClick={onClearAnim}>
            dismiss
          </button>
        </div>
      )}

      {api.error && <p className="text-center text-sm text-rose-300">{api.error}</p>}

      <Chat
        messages={room.chat}
        disabled={room.mode === "bot"}
        onSend={(text) => void api.sendChat(room.code, playerId, text)}
      />
    </div>
  );
}

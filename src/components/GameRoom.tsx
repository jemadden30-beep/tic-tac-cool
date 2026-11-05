"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Board } from "./Board";
import { PowerPanel } from "./PowerPanel";
import { Chat } from "./Chat";
import { Scoreboard } from "./Scoreboard";
import { PowerFX } from "./PowerFX";
import { TurnNotifier } from "./TurnNotifier";
import { POWER_DEFS } from "@/lib/powers";
import type { PowerId, PowerTarget, RoomState } from "@/lib/types";

type SocketApi = {
  connected: boolean;
  animation: import("@/lib/types").AnimationEvent | null;
  clearAnimation: () => void;
  error: string | null;
  clearError: () => void;
  setFirstTo: (code: string, playerId: string, firstTo: number) => Promise<unknown>;
  startGame: (code: string, playerId: string) => Promise<unknown>;
  nextRound: (code: string, playerId: string) => Promise<unknown>;
  place: (code: string, playerId: string, index: number) => Promise<unknown>;
  usePower: (
    code: string,
    playerId: string,
    power: PowerId,
    target: PowerTarget
  ) => Promise<unknown>;
  sendChat: (code: string, playerId: string, text: string) => Promise<unknown>;
};

export function GameRoom({
  room,
  playerId,
  api,
}: {
  room: RoomState;
  playerId: string;
  api: SocketApi;
}) {
  const me = room.players.find((p) => p.id === playerId);
  const meMark =
    room.mode === "hotseat"
      ? room.turn
      : me?.mark ?? null;
  const actingPlayer =
    room.mode === "hotseat"
      ? room.players.find((p) => p.mark === room.turn) || null
      : me || null;

  const [selectedPower, setSelectedPower] = useState<PowerId | null>(null);
  const [pairFirst, setPairFirst] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const selectMode = useMemo(() => {
    if (!selectedPower) return "none" as const;
    return POWER_DEFS[selectedPower].needsTarget;
  }, [selectedPower]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        axis: "row" | "col";
        index: number;
      };
      if (!selectedPower) return;
      void firePower(selectedPower, {
        kind: "line",
        axis: detail.axis,
        index: detail.index,
      });
    };
    window.addEventListener("ttc-line", handler);
    return () => window.removeEventListener("ttc-line", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPower, room.code, playerId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        edge: "up" | "down" | "left" | "right";
      };
      if (!selectedPower) return;
      void firePower(selectedPower, { kind: "edge", edge: detail.edge });
    };
    window.addEventListener("ttc-edge", handler);
    return () => window.removeEventListener("ttc-edge", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPower, room.code, playerId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { row: number; col: number };
      if (!selectedPower) return;
      void firePower(selectedPower, {
        kind: "vertex",
        row: detail.row,
        col: detail.col,
      });
    };
    window.addEventListener("ttc-vertex", handler);
    return () => window.removeEventListener("ttc-vertex", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPower, room.code, playerId]);

  useEffect(() => {
    setSelectedPower(null);
    setPairFirst(null);
  }, [room.turn, room.phase]);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${room.code}`
      : `/room/${room.code}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const isMyTurn =
    room.phase === "playing" &&
    (room.mode === "hotseat" || (me && me.mark === room.turn));

  async function firePower(power: PowerId, target: PowerTarget) {
    await api.usePower(room.code, playerId, power, target);
    setSelectedPower(null);
    setPairFirst(null);
  }

  async function onCellClick(index: number) {
    if (room.phase !== "playing") return;

    if (selectedPower) {
      const def = POWER_DEFS[selectedPower];
      if (def.needsTarget === "none") {
        await firePower(selectedPower, { kind: "none" });
        return;
      }
      if (def.needsTarget === "cell") {
        await firePower(selectedPower, { kind: "cell", index });
        return;
      }
      if (def.needsTarget === "pair") {
        if (pairFirst === null) {
          setPairFirst(index);
          return;
        }
        await firePower(selectedPower, { kind: "pair", a: pairFirst, b: index });
        return;
      }
      // line handled by LinePicker
      return;
    }

    await api.place(room.code, playerId, index);
  }

  async function onSelectPower(p: PowerId | null) {
    setPairFirst(null);
    if (!p) {
      setSelectedPower(null);
      return;
    }
    const def = POWER_DEFS[p];
    if (def.needsTarget === "none") {
      await firePower(p, { kind: "none" });
      return;
    }
    setSelectedPower(p);
  }

  const canEditFirstTo =
    room.phase !== "playing" &&
    (room.mode === "hotseat" || room.mode === "bot" || room.hostId === playerId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-4">
      <PowerFX animation={api.animation} onDone={api.clearAnimation} />
      <TurnNotifier room={room} playerId={playerId} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-sky-300/90">
            Tic Tac Cool
          </p>
          <h1 className="text-xl font-black sm:text-3xl">
            Room <span className="text-sky-300">{room.code}</span>
          </h1>
          <p className="text-sm text-white/50">
            {room.mode === "hotseat"
              ? "Hotseat"
              : room.mode === "bot"
                ? `Solo vs Bot (${room.difficulty || "medium"})`
                : "Online"}{" "}
            · {room.boardSize}×{room.boardSize}
            {room.doublePending ? " · Double Place armed" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {room.mode !== "bot" && (
          <button
            type="button"
            onClick={copyInvite}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10"
          >
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          )}
          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Home
          </Link>
        </div>
      </header>

      {api.error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
          <span>{api.error}</span>
          <button type="button" onClick={api.clearError} className="underline">
            dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2 sm:space-y-4">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-3 sm:p-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm sm:mb-4">
              <StatusBanner room={room} meId={playerId} />
              {selectedPower && (
                <span className="rounded-full bg-blue-500/30 px-3 py-1 text-sky-100">
                  Aim {POWER_DEFS[selectedPower].emoji}{" "}
                  {POWER_DEFS[selectedPower].name}
                  {selectMode === "pair" &&
                    (selectedPower === "clone"
                      ? pairFirst === null
                        ? " — pick opponent tile"
                        : " — pick empty cell"
                      : pairFirst === null
                        ? " — pick your tile"
                        : " — pick opponent tile")}
                  {selectMode === "line" && " — tap a row/column arrow"}
                  {selectMode === "vertex" && " — tap a ● junction"}
                  {" · "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setSelectedPower(null);
                      setPairFirst(null);
                    }}
                  >
                    cancel
                  </button>
                </span>
              )}
            </div>

            <Board
              room={room}
              meMark={meMark}
              selectedPower={selectedPower}
              selectMode={selectMode}
              onCellClick={onCellClick}
              animation={api.animation}
            />

            {(room.phase === "round_over" || room.phase === "series_over") && (
              <div className="mt-4 space-y-2 text-center">
                <p className="text-lg font-bold">
                  {room.phase === "series_over"
                    ? `Series over — ${
                        room.players.find((p) => p.id === room.seriesWinner)?.name || "Winner"
                      } wins!`
                    : room.winner
                      ? `${room.winner} wins the round!`
                      : "Draw — board full"}
                </p>
                {room.phase === "round_over" && (
                  <button
                    type="button"
                    onClick={() => api.nextRound(room.code, playerId)}
                    className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-black hover:bg-sky-300"
                  >
                    Next round
                  </button>
                )}
                {room.phase === "series_over" &&
                  (room.hostId === playerId || room.mode === "hotseat" || room.mode === "bot") && (
                    <button
                      type="button"
                      onClick={() => api.startGame(room.code, playerId)}
                      className="rounded-xl bg-blue-500 px-4 py-2 font-bold hover:bg-blue-400"
                    >
                      Rematch series
                    </button>
                  )}
              </div>
            )}

            {room.phase === "lobby" && (
              <div className="mt-4 space-y-3 text-center">
                <p className="text-white/70">
                  {room.mode === "bot"
                    ? "Bot is ready — start when you want."
                    : room.mode === "online" && room.players.length < 2
                      ? "Share the invite anytime — you can start and play before they open it."
                      : "Ready when you are."}
                </p>
                {(room.hostId === playerId || room.mode === "hotseat" || room.mode === "bot") && (
                  <button
                    type="button"
                    onClick={() => api.startGame(room.code, playerId)}
                    className="rounded-xl bg-blue-500 px-5 py-2.5 font-bold hover:bg-blue-400"
                  >
                    Start match
                  </button>
                )}
              </div>
            )}
          </div>

          {room.phase === "playing" && (
            <div>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-white/50">
                {isMyTurn ? "Your powers" : "Powers (wait for turn)"}
              </h3>
              <PowerPanel
                room={room}
                player={actingPlayer}
                selected={selectedPower}
                disabled={!isMyTurn}
                onSelect={onSelectPower}
              />
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Scoreboard
            room={room}
            canEditFirstTo={canEditFirstTo}
            onFirstTo={(n) => api.setFirstTo(room.code, playerId, n)}
          />
          <Chat
            messages={room.chat}
            onSend={(text) => api.sendChat(room.code, playerId, text)}
            disabled={!api.connected}
          />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
            {room.mode === "bot" ? (
              <>
                <p className="font-semibold text-white/70">Solo session</p>
                <p className="mt-1 font-mono text-lg text-sky-300">{room.code}</p>
                <p className="mt-2">
                  Reopen this link to resume your bot series. Chat shows system notes when the bot uses powers.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-white/70">Invite code</p>
                <p className="mt-1 font-mono text-lg text-sky-300">{room.code}</p>
                <p className="mt-2 break-all">{inviteUrl}</p>
                <p className="mt-2">
                  Async play: start and take turns before they open the link. When they join,
                  they see the current board. Reopen this invite on the same device to resume.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusBanner({ room, meId }: { room: RoomState; meId: string }) {
  if (room.phase === "lobby") return <span className="text-white/60">Lobby</span>;
  if (room.phase !== "playing") return <span className="text-sky-200">Round paused</span>;
  const turnPlayer = room.players.find((p) => p.mark === room.turn);
  const opener = room.players.find((p) => p.mark === "X");
  const mine =
    room.mode === "hotseat" || room.players.find((p) => p.id === meId)?.mark === room.turn;
  const opp = room.players.find((p) => p.id !== meId);
  const awayNote =
    room.mode === "online" && opp && !opp.connected
      ? mine
        ? " · opponent away — play anytime"
        : " · away (will resume here)"
      : "";
  return (
    <span className={mine ? "font-bold text-emerald-300" : "text-white/70"}>
      {mine ? "Your turn" : `Waiting on ${turnPlayer?.name || room.turn}`} · {room.turn}
      {awayNote}
      {opener ? ` · ${opener.name} opened` : ""}
      {turnPlayer?.frozen ? " (frozen next)" : ""}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomState } from "@/lib/types";

const PERM_KEY = "ttc_notify_pref"; // "granted" | "denied" | "dismissed"

function playBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore */
  }
}

function flashTitle(message: string) {
  const original = document.title;
  let on = true;
  let ticks = 0;
  const id = window.setInterval(() => {
    document.title = on ? message : original;
    on = !on;
    ticks += 1;
    if (ticks > 12 || !document.hidden) {
      window.clearInterval(id);
      document.title = original;
    }
  }, 700);
  const restore = () => {
    window.clearInterval(id);
    document.title = original;
    document.removeEventListener("visibilitychange", restore);
  };
  document.addEventListener("visibilitychange", restore);
}

function showNotification(roomCode: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("Tic Tac Cool — your turn!", {
      body: `Room ${roomCode}: it's your move.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `ttc-turn-${roomCode}`,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export function TurnNotifier({
  room,
  playerId,
}: {
  room: RoomState;
  playerId: string;
}) {
  const [banner, setBanner] = useState(false);
  const prevMine = useRef<boolean | null>(null);

  const me = room.players.find((p) => p.id === playerId);
  const isMyTurn =
    room.phase === "playing" &&
    room.mode !== "hotseat" &&
    !!me &&
    me.mark === room.turn;

  useEffect(() => {
    try {
      const pref = localStorage.getItem(PERM_KEY);
      if (
        pref !== "dismissed" &&
        pref !== "denied" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        setBanner(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const was = prevMine.current;
    prevMine.current = isMyTurn;
    // Fire on transition to my turn (including first paint after rejoin)
    if (!isMyTurn) return;
    if (was === true) return;

    playBeep();
    if (document.hidden) {
      flashTitle("● Your turn — Tic Tac Cool");
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      showNotification(room.code);
    }
  }, [isMyTurn, room.code, room.turn, room.phase, room.updatedAt]);

  const enable = async () => {
    try {
      if (typeof Notification === "undefined") {
        localStorage.setItem(PERM_KEY, "dismissed");
        setBanner(false);
        return;
      }
      const result = await Notification.requestPermission();
      localStorage.setItem(PERM_KEY, result === "granted" ? "granted" : "denied");
      setBanner(false);
      if (result === "granted" && isMyTurn) {
        showNotification(room.code);
      }
    } catch {
      localStorage.setItem(PERM_KEY, "denied");
      setBanner(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(PERM_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setBanner(false);
  };

  if (!banner) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-lg rounded-2xl border border-sky-400/40 bg-[#0a1a36]/95 p-3 shadow-[0_8px_40px_rgba(29,78,216,0.4)] backdrop-blur sm:left-auto sm:right-4">
      <p className="text-sm font-bold text-sky-100">Turn notifications</p>
      <p className="mt-1 text-xs text-white/65">
        Get an alert (and a short sound) when it becomes your turn — even if this tab is in the
        background.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={enable}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold hover:bg-blue-500"
        >
          Enable notifications
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

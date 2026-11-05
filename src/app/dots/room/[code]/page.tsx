"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePlayer } from "@/hooks/usePlayer";
import { useDotsSocket } from "@/hooks/useDotsSocket";
import { DotsRoom } from "@/components/dots/DotsRoom";

function rememberMatchCode(code: string) {
  try {
    const key = "ttc_match_codes";
    const raw = localStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [code.toUpperCase(), ...list.filter((c) => c !== code.toUpperCase())].slice(0, 40);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function DotsRoomPage() {
  const params = useParams();
  const code = String(params.code || "").toUpperCase();
  const { playerId, name, ready } = usePlayer();
  const api = useDotsSocket();
  const sawRoom = useRef(false);
  if (api.room) sawRoom.current = true;

  useEffect(() => {
    if (!ready || !api.connected) return;
    rememberMatchCode(code);
    void api.syncRoom({ code, playerId, name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, api.connected, code, playerId, name]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white/60">Loading…</main>
    );
  }

  if (!api.room) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4">
        <p className="text-white/60">
          {sawRoom.current
            ? "This room was deleted."
            : api.error || "Connecting to room…"}
        </p>
        <Link href="/dots" className="text-sky-300 underline">
          Back to Dots
        </Link>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl" />
      <DotsRoom
        room={api.room}
        playerId={playerId}
        api={api}
        animation={api.animation}
        onClearAnim={api.clearAnimation}
      />
    </main>
  );
}

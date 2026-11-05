"use client";

import { useEffect, use, useRef } from "react";
import Link from "next/link";
import { usePlayer } from "@/hooks/usePlayer";
import { useSocket } from "@/hooks/useSocket";
import { GameRoom } from "@/components/GameRoom";

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

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { playerId, name, ready } = usePlayer();
  const api = useSocket();
  const sawRoom = useRef(false);
  if (api.room) sawRoom.current = true;

  useEffect(() => {
    if (!ready || !api.connected) return;
    rememberMatchCode(code);
    void api.syncRoom({ code, playerId, name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, api.connected, code, playerId]);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center text-white/60">Loading…</main>
    );
  }

  if (!api.room) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-lg font-bold">
            {sawRoom.current ? "This room was deleted." : `Connecting to ${code.toUpperCase()}…`}
          </p>
          {api.error && <p className="mt-2 text-rose-300">{api.error}</p>}
          <Link href="/" className="mt-4 inline-block text-blue-300 underline">
            Back home
          </Link>
        </div>
      </main>
    );
  }

  return <GameRoom room={api.room} playerId={playerId} api={api} />;
}

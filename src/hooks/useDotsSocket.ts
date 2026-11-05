"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { ChatMessage, MyMatchSummary } from "@/lib/types";
import type {
  DotsRoomState,
  DotsAnimation,
  DotsPowerId,
  DotsPowerTarget,
  EdgeId,
  DotsMatchSummary,
} from "@/lib/dots/types";

export type UnifiedMatch = MyMatchSummary | DotsMatchSummary;

export function useDotsSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<DotsRoomState | null>(null);
  const [animation, setAnimation] = useState<DotsAnimation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io", autoConnect: true });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("dots:state", (r: DotsRoomState) => setRoom(r));
    socket.on("dots:animation", (a: DotsAnimation | null) => {
      if (a) setAnimation(a);
    });
    socket.on("chat:message", (msg: ChatMessage) => {
      setRoom((prev) =>
        prev ? { ...prev, chat: [...prev.chat.filter((m) => m.id !== msg.id), msg] } : prev
      );
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = useCallback(<T,>(event: string, payload: unknown): Promise<T> => {
    return new Promise((resolve) => {
      const s = socketRef.current;
      if (!s) return resolve({ ok: false, error: "No socket" } as T);
      s.emit(event, payload, (res: T) => resolve(res));
    });
  }, []);

  const createRoom = useCallback(
    async (opts: {
      playerId: string;
      name: string;
      mode: "online" | "hotseat" | "bot";
      firstTo: number;
      difficulty?: "easy" | "medium" | "hard" | "expert";
    }) => {
      setError(null);
      const res = await emit<{ ok: boolean; room?: DotsRoomState; error?: string }>(
        "dots:create",
        opts
      );
      if (res.ok && res.room) setRoom(res.room);
      else setError(res.error || "Failed to create");
      return res;
    },
    [emit]
  );

  const joinRoom = useCallback(
    async (opts: { code: string; playerId: string; name: string }) => {
      setError(null);
      const res = await emit<{ ok: boolean; room?: DotsRoomState; error?: string }>(
        "dots:join",
        { ...opts, code: opts.code.toUpperCase() }
      );
      if (res.ok && res.room) setRoom(res.room);
      else setError(res.error || "Failed to join");
      return res;
    },
    [emit]
  );

  const syncRoom = useCallback(
    async (opts: { code: string; playerId: string; name?: string }) => {
      const res = await emit<{ ok: boolean; room?: DotsRoomState; error?: string }>(
        "dots:sync",
        { ...opts, code: opts.code.toUpperCase() }
      );
      if (res.ok && res.room) setRoom(res.room);
      else setError(res.error || "Room not found");
      return res;
    },
    [emit]
  );

  const startGame = useCallback(
    async (code: string, playerId: string) => {
      return emit<{ ok: boolean; error?: string }>("dots:start", { code, playerId });
    },
    [emit]
  );

  const nextRound = useCallback(
    async (code: string, playerId: string) => {
      return emit("dots:nextRound", { code, playerId });
    },
    [emit]
  );

  const claim = useCallback(
    async (code: string, playerId: string, edge: EdgeId) => {
      const res = await emit<{ ok: boolean; error?: string }>("dots:claim", {
        code,
        playerId,
        edge,
      });
      if (!res.ok && res.error) setError(res.error);
      return res;
    },
    [emit]
  );

  const usePower = useCallback(
    async (
      code: string,
      playerId: string,
      power: DotsPowerId,
      target: DotsPowerTarget
    ) => {
      const res = await emit<{ ok: boolean; error?: string }>("dots:power", {
        code,
        playerId,
        power,
        target,
      });
      if (!res.ok && res.error) setError(res.error);
      return res;
    },
    [emit]
  );

  const sendChat = useCallback(
    async (code: string, playerId: string, text: string) => {
      return emit("dots:chat", { code, playerId, text });
    },
    [emit]
  );

  const listMyMatches = useCallback(
    async (playerId: string) => {
      return emit<{ ok: boolean; matches?: UnifiedMatch[]; error?: string }>(
        "rooms:mine",
        { playerId }
      );
    },
    [emit]
  );

  return {
    connected,
    room,
    setRoom,
    animation,
    clearAnimation: useCallback(() => setAnimation(null), []),
    error,
    clearError: useCallback(() => setError(null), []),
    createRoom,
    joinRoom,
    syncRoom,
    startGame,
    nextRound,
    claim,
    usePower,
    sendChat,
    listMyMatches,
  };
}

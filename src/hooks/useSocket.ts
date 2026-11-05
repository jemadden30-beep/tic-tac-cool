"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { RoomState, ChatMessage, AnimationEvent, PowerId, PowerTarget, MyMatchSummary } from "@/lib/types";
import type { DotsMatchSummary } from "@/lib/dots/types";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [animation, setAnimation] = useState<AnimationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io", autoConnect: true });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (r: RoomState) => setRoom(r));
    socket.on("chat:message", (msg: ChatMessage) => {
      setRoom((prev) =>
        prev ? { ...prev, chat: [...prev.chat.filter((m) => m.id !== msg.id), msg] } : prev
      );
    });
    let lastAnimId: string | null = null;
    socket.on("game:animation", (a: AnimationEvent | null) => {
      if (!a) {
        setAnimation(null);
        return;
      }
      if (a.id === lastAnimId) return;
      lastAnimId = a.id;
      setAnimation(a);
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
      const res = await emit<{ ok: boolean; room?: RoomState; error?: string }>(
        "room:create",
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
      const res = await emit<{ ok: boolean; room?: RoomState; error?: string }>(
        "room:join",
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
      const res = await emit<{ ok: boolean; room?: RoomState; error?: string }>(
        "room:sync",
        { ...opts, code: opts.code.toUpperCase() }
      );
      if (res.ok && res.room) setRoom(res.room);
      else setError(res.error || "Room not found");
      return res;
    },
    [emit]
  );

  const setFirstTo = useCallback(
    async (code: string, playerId: string, firstTo: number) => {
      return emit("room:setFirstTo", { code, playerId, firstTo });
    },
    [emit]
  );

  const startGame = useCallback(
    async (code: string, playerId: string) => {
      return emit<{ ok: boolean; error?: string }>("game:start", { code, playerId });
    },
    [emit]
  );

  const nextRound = useCallback(
    async (code: string, playerId: string) => {
      return emit("game:nextRound", { code, playerId });
    },
    [emit]
  );

  const place = useCallback(
    async (code: string, playerId: string, index: number) => {
      const res = await emit<{ ok: boolean; error?: string }>("game:place", {
        code,
        playerId,
        index,
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
      power: PowerId,
      target: PowerTarget
    ) => {
      const res = await emit<{ ok: boolean; error?: string }>("game:power", {
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
      return emit("chat:send", { code, playerId, text });
    },
    [emit]
  );

  const clearAnimation = useCallback(() => setAnimation(null), []);
  const clearError = useCallback(() => setError(null), []);

  const listMyMatches = useCallback(
    async (playerId: string) => {
      return emit<{ ok: boolean; matches?: (MyMatchSummary | DotsMatchSummary)[]; error?: string }>(
        "rooms:mine",
        { playerId }
      );
    },
    [emit]
  );

  const kickO = useCallback(
    async (code: string, playerId: string) => {
      const res = await emit<{ ok: boolean; room?: RoomState; error?: string }>("room:kickO", {
        code,
        playerId,
      });
      if (res.ok && res.room) setRoom(res.room);
      else if (res.error) setError(res.error);
      return res;
    },
    [emit]
  );

  return {
    connected,
    room,
    setRoom,
    animation,
    clearAnimation,
    error,
    clearError,
    createRoom,
    joinRoom,
    syncRoom,
    setFirstTo,
    startGame,
    nextRound,
    place,
    usePower,
    sendChat,
    listMyMatches,
    kickO,
  };
}

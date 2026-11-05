"use client";

import { useEffect, useState } from "react";

const ID_KEY = "ttc_player_id";
const NAME_KEY = "ttc_player_name";
const STATS_KEY = "ttc_local_stats";

function rid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export interface LocalStats {
  wins: number;
  losses: number;
  bestStreak: number;
}

export function usePlayer() {
  const [playerId, setPlayerId] = useState<string>("");
  const [name, setNameState] = useState("Cool Cat");
  const [stats, setStats] = useState<LocalStats>({ wins: 0, losses: 0, bestStreak: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = rid();
      localStorage.setItem(ID_KEY, id);
    }
    const n = localStorage.getItem(NAME_KEY) || "Cool Cat";
    const s = localStorage.getItem(STATS_KEY);
    setPlayerId(id);
    setNameState(n);
    if (s) {
      try {
        setStats(JSON.parse(s));
      } catch {
        /* ignore */
      }
    }
    setReady(true);
  }, []);

  const setName = (n: string) => {
    const clean = n.slice(0, 20);
    setNameState(clean);
    localStorage.setItem(NAME_KEY, clean);
  };

  const recordResult = (won: boolean, streak: number) => {
    setStats((prev) => {
      const next = {
        wins: prev.wins + (won ? 1 : 0),
        losses: prev.losses + (won ? 0 : 1),
        bestStreak: Math.max(prev.bestStreak, streak),
      };
      localStorage.setItem(STATS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { playerId, name, setName, stats, recordResult, ready };
}

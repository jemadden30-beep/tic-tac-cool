"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

export function Chat({
  messages,
  onSend,
  disabled,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Keep page viewport stable — only scroll the chat scroller
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="flex h-40 flex-col rounded-2xl border border-white/10 bg-black/30 sm:h-72">
      <div className="border-b border-white/10 px-3 py-2 text-sm font-semibold text-sky-200">
        Chat
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 && (
          <p className="text-white/40">Say hi — trash talk encouraged.</p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <span className="font-semibold text-blue-300">{m.name}</span>
            <span className="text-white/40"> · </span>
            <span className="text-white/90">{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder="Message…"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-sky-400"
          maxLength={240}
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold hover:bg-blue-500 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

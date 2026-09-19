"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendChatMessageAction } from "@/lib/actions/ai-chat";

type Message = { role: "user" | "model"; text: string };

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function handleSend() {
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    startTransition(async () => {
      const result = await sendChatMessageAction(history, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages((prev) => [...prev, { role: "model", text: result.reply }]);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 日本語入力(IME)の変換確定Enterでも e.key は "Enter" になるため、
    // 変換中(isComposing)は送信せず、確定のためのEnterとして扱う。
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current && e.keyCode !== 229) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col md:h-[calc(100vh-160px)]">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {messages.length === 0 && (
          <p className="text-sm text-foreground-muted">
            例:「ノ音の2026年8月の営業利益を教えて」「グループ全体の今年の売上推移を教えて」「茶ノ音と和ノ音、直近の原価率はどっちが高い?」「小人の今年の損益分岐点を教えて」
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground-muted">考え中...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          rows={2}
          maxLength={4000}
          placeholder="PLや顧客データについて質問してください"
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !input.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          送信
        </button>
      </div>
    </div>
  );
}

"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Conversation as Thread } from "../lib/types";
import { pendingReplies } from "../lib/client/state";
const positions = new Map<string, number>();
export function Conversation({
  conversation,
  selected,
  loading,
}: {
  conversation: Thread | null;
  selected: string;
  loading: boolean;
}) {
  const atBottom = useRef(true),
    loaded = useRef("");
  const scroll = useRef<HTMLDivElement>(null),
    last = useRef<{ id: string; ids: Set<string> }>({ id: "", ids: new Set() }),
    [newReply, setNewReply] = useState(false);
  const messages = conversation?.messages || [];
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const prev = last.current,
      different = prev.id !== selected;
    const incoming = messages.some(
      (m) => m.role === "dot" && !prev.ids.has(m.id),
    );
    const sent = messages.some((m) => m.role === "user" && !prev.ids.has(m.id));
    if (different || (conversation && loaded.current !== selected)) {
      el.scrollTop = positions.get(selected) ?? el.scrollHeight;
      setNewReply(false);
      if (conversation) loaded.current = selected;
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    } else if (sent) {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
      setNewReply(false);
    } else if (incoming) {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      else setNewReply(true);
    }
    last.current = { id: selected, ids: new Set(messages.map((m) => m.id)) };
  }, [messages, selected]);
  const pending = new Set(pendingReplies(messages).map((m) => m.id));
  return (
    <>
      <div
        ref={scroll}
        className="scroll-area"
        id="scroll-area"
        onScroll={(e) => {
          positions.set(selected, e.currentTarget.scrollTop);
          atBottom.current =
            e.currentTarget.scrollHeight -
              e.currentTarget.scrollTop -
              e.currentTarget.clientHeight <
            180;
          if (
            e.currentTarget.scrollHeight -
              e.currentTarget.scrollTop -
              e.currentTarget.clientHeight <
            120
          )
            setNewReply(false);
        }}
      >
        <div className="conversation-content">
          <div className="notice">
            dotが会話を確認して返信します。返信は自動で表示されます。
          </div>
          <section aria-label="会話履歴" aria-busy={loading}>
            {messages.map((m) => (
              <article className="message" key={m.id}>
                <div className="message-top">
                  <span className="avatar">{m.role === "dot" ? "d" : "Y"}</span>
                  <span className="role">
                    {m.role === "dot" ? "dot" : "you"}
                  </span>
                  <time className="message-time">
                    {new Date(m.created).toLocaleString("ja-JP", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <div className="body">{m.body}</div>
                {m.role === "user" && (
                  <div className="delivery-tag">
                    {pending.has(m.id) ? "送信済み · 返信待ち" : "送信済み"}
                  </div>
                )}
              </article>
            ))}
            {!messages.length && (
              <div className="empty">
                <span className="brand-mark" />
                <strong>
                  {loading
                    ? "会話を読み込み中"
                    : selected
                      ? "何から始めましょう？"
                      : "会話をはじめる"}
                </strong>
                <p>
                  {loading
                    ? ""
                    : selected
                      ? "この会話のテーマについて、dotに話しかけてください"
                      : "「新しい会話」からテーマを作成してください"}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
      {newReply && (
        <button
          className="new-reply"
          onClick={() => {
            if (scroll.current)
              scroll.current.scrollTop = scroll.current.scrollHeight;
            setNewReply(false);
          }}
        >
          新しい返信 ↓
        </button>
      )}
    </>
  );
}

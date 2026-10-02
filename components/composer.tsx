"use client";
import { useEffect, useState } from "react";
import type { Message, Session } from "../lib/types";
import { isReadOnly, pendingReplies } from "../lib/client/state";
export function Composer({
  session,
  messages,
  value,
  onChange,
  onSend,
  busy,
  loading,
  error,
  connected,
  syncError,
}: {
  session: Session | undefined;
  messages: Message[];
  value: string;
  onChange: (v: string) => void;
  onSend: () => Promise<void>;
  busy: boolean;
  loading: boolean;
  error: string;
  connected: boolean | null;
  syncError: boolean;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const readonly = isReadOnly(session),
    pending = pendingReplies(messages),
    age = pending.length
      ? Math.max(
          0,
          Math.floor((now - new Date(pending[0].created).getTime()) / 1000),
        )
      : 0;
  const wait =
    !readonly && (busy || loading || pending.length > 0 || syncError);
  const label = busy
    ? "処理中"
    : loading
      ? "会話を読み込み中"
      : syncError
        ? "接続を確認できません"
        : connected === false
          ? "自動返信が未接続です"
          : age > 180
            ? "まだ返信が届いていません"
            : "dotの返信を待っています";
  return (
    <div className="composer-area">
      {wait && (
        <div
          className="reply-status"
          data-state={syncError ? "error" : age > 180 ? "delayed" : "waiting"}
        >
          <span className="wait-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong role="status">{label}</strong>
            <small>
              {busy
                ? "保存結果を確認しています"
                : syncError
                  ? "再接続後に返信を確認します。入力は保持されています"
                  : "返信は届き次第表示します"}
            </small>
          </div>
          {pending.length > 0 && (
            <span className="wait-clock">
              {age < 60
                ? age + "秒"
                : Math.floor(age / 60) + "分 " + (age % 60) + "秒"}
            </span>
          )}
        </div>
      )}
      {readonly && (
        <p className="manage-notice">
          {session?.deletedAt
            ? "ゴミ箱の会話です。復元すると再開できます。"
            : "保管中の会話です。アーカイブを解除すると再開できます。"}
        </p>
      )}
      <form
        id="send-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <label htmlFor="message">dotにメッセージ</label>
        <textarea
          id="message"
          rows={3}
          maxLength={12000}
          placeholder="考えていること、進めたいことを…"
          value={value}
          disabled={busy || readonly || !session || loading}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (!busy && !readonly && !loading) void onSend();
            }
          }}
        />
        <div className="composer-toolbar">
          <span className="composer-hint">⌘ / Ctrl + Enter で送信</span>
          <button
            className="action"
            disabled={busy || readonly || loading || !session || !value.trim()}
          >
            送信 ↑
          </button>
        </div>
        {error && (
          <p id="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="privacy-note">
        会話別に履歴を保存 · dotは共通 · 操作の承認はChatGPTで確認
      </div>
    </div>
  );
}

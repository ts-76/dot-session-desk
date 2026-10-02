"use client";
import { useState } from "react";
import { progressLabels, progressSymbols } from "../lib/client/progress";
import { visibleSessions, statusLabel } from "../lib/client/state";
import type { Session, Filter } from "../lib/types";
export function Sidebar({
  sessions,
  selected,
  filter,
  onFilter,
  search,
  onSearch,
  seen,
  onSelect,
  onCreate,
  onClose,
  busy,
}: {
  sessions: Session[];
  selected: string;
  filter: Filter;
  onFilter: (f: Filter) => void;
  search: string;
  onSearch: (s: string) => void;
  seen: Record<string, string>;
  onSelect: (id: string) => void;
  onCreate: (title: string) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(""),
    [open, setOpen] = useState(false);
  const items = visibleSessions(sessions, filter, search);
  return (
    <aside aria-label="会話一覧">
      <div className="aside-heading">
        <span className="aside-title">
          WORKSPACE <span id="session-sidebar-title">会話</span>
        </span>
        <button
          id="sidebar-close"
          className="sidebar-close"
          type="button"
          aria-label="会話一覧を閉じる"
          onClick={onClose}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </div>
      <div className="search-wrap">
        <label htmlFor="search" className="sr-only">
          会話を探す
        </label>
        <input
          id="search"
          type="search"
          placeholder="会話を検索"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <details
        className="new-session"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary>＋ 新しい会話</summary>
        <form
          id="new-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await onCreate(title);
              setTitle("");
              setOpen(false);
            } catch {}
          }}
        >
          <label htmlFor="new-title">会話の名前</label>
          <input
            id="new-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
          <button className="action" disabled={busy || !title.trim()}>
            作成
          </button>
        </form>
      </details>
      <div className="session-filters" aria-label="表示する会話">
        {(["active", "archived", "trash"] as Filter[]).map((f, i) => (
          <button
            className="quiet"
            key={f}
            aria-pressed={filter === f}
            onClick={() => onFilter(f)}
          >
            {["会話", "保管", "ゴミ箱"][i]}
          </button>
        ))}
      </div>
      <nav id="sessions" aria-label="セッション">
        {items.map((s) => {
          const status = statusLabel(s, seen[s.id]);
          return (
            <button
              className="item"
              key={s.id}
              type="button"
              aria-label={s.title + "、" + status.text}
              aria-describedby={"progress-" + s.id}
              aria-pressed={s.id === selected}
              onClick={() => onSelect(s.id)}
              disabled={busy}
            >
              <span className="session-text">
                <span className="session-title">
                  {s.pinned ? "⌖ " : ""}
                  {s.title}
                </span>
                <span className={"session-status " + status.state}>
                  {status.text}
                </span>
              </span>
              <span
                id={"progress-" + s.id}
                className="progress-indicator"
                data-status={s.progress?.status || "unregistered"}
                role="img"
                aria-label={
                  "作業進捗: " +
                  (s.progress ? progressLabels[s.progress.status] : "未登録") +
                  "（返信状況とは別）"
                }
                title={
                  "作業進捗: " +
                  (s.progress ? progressLabels[s.progress.status] : "未登録") +
                  "（返信状況とは別）"
                }
              >
                <span aria-hidden="true">
                  {progressSymbols[s.progress?.status || "unregistered"]}
                </span>
              </span>
            </button>
          );
        })}
        {!items.length && (
          <div className="nav-empty">
            {search ? "一致する会話がありません" : "会話がありません"}
          </div>
        )}
      </nav>
      <div className="aside-bottom">プライベートワークスペース</div>
    </aside>
  );
}

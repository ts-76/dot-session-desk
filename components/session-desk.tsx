"use client";
import { useEffect } from "react";
import { useSessionDesk } from "../lib/client/use-session-desk";
import { Sidebar } from "./sidebar";
import { Conversation } from "./conversation";
import { SessionMenu } from "./session-menu";
import { Composer } from "./composer";
export default function SessionDesk() {
  const d = useSessionDesk();
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "o"
      ) {
        e.preventDefault();
        const details =
          document.querySelector<HTMLDetailsElement>(".new-session");
        if (details) details.open = true;
        document.getElementById("new-title")?.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          dot<span>Session Desk</span>
        </div>
        <div className="badge" role="status">
          {d.connected === null
            ? "接続を確認中"
            : d.connected
              ? "dot 接続済み"
              : "dot 未接続"}
        </div>
      </header>
      <div className="layout">
        <Sidebar
          sessions={d.sessions}
          selected={d.selected}
          filter={d.filter}
          onFilter={d.setFilter}
          search={d.search}
          onSearch={d.setSearch}
          seen={d.seen}
          onSelect={d.select}
          onCreate={d.create}
          busy={d.busy}
        />
        <main>
          <div className="conversation-header">
            <h1>
              {d.current?.title ||
                (d.loading ? "会話を読み込み中" : "セッションを選択")}
            </h1>
            <span className="header-label">dot / conversation</span>
            <SessionMenu
              session={d.current}
              busy={d.busy}
              onManage={d.manage}
            />
          </div>
          <Conversation
            conversation={d.conversation}
            selected={d.selected}
            loading={d.loading}
          />
          <Composer
            session={d.current}
            messages={d.conversation?.messages || []}
            value={d.draft}
            onChange={d.changeDraft}
            onSend={d.send}
            busy={d.busy}
            loading={d.loading}
            error={d.error}
            connected={d.connected}
            syncError={d.syncError}
          />
        </main>
      </div>
      <footer className="statusbar">
        <span>
          Session Desk /{" "}
          {d.syncError ? "再接続中" : d.loading ? "読み込み中" : "自動更新中"}
        </span>
        <span id="session-id">{d.selected}</span>
      </footer>
    </>
  );
}

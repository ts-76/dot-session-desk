"use client";
import { useEffect, useRef, useState } from "react";
import { useSessionDesk } from "../lib/client/use-session-desk";
import { Sidebar } from "./sidebar";
import { Conversation } from "./conversation";
import { SessionMenu } from "./session-menu";
import { Composer } from "./composer";
import { ProgressPanel } from "./progress-panel";
export default function SessionDesk() {
  const d = useSessionDesk();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebar = useRef<HTMLDivElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const initialFocus = useRef("sidebar-close");
  const modal = isMobile && sidebarOpen;

  function openSidebar(target = "sidebar-close", opener?: HTMLElement | null) {
    initialFocus.current = target;
    if (window.matchMedia("(max-width: 760px)").matches) {
      if (!sidebarOpen)
        returnFocus.current = opener || (document.activeElement as HTMLElement);
      setSidebarOpen(true);
    }
    // The modal effect focuses after its hidden state has been removed.
    if (!isMobile || sidebarOpen) document.getElementById(target)?.focus();
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    // CSS may hide the desktop field before matchMedia fires and move focus to
    // body. Remember its last focus so the mobile toggle still receives it.
    let lastFocused = document.activeElement;
    const rememberFocus = (event: FocusEvent) => {
      lastFocused = event.target as Element;
    };
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) setSidebarOpen(false);
      else if (
        sidebar.current?.contains(document.activeElement) ||
        sidebar.current?.contains(lastFocused)
      ) {
        requestAnimationFrame(() => {
          if (media.matches) sidebarToggle.current?.focus();
        });
      }
    };
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("focusin", rememberFocus);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("focusin", rememberFocus);
    };
  }, []);

  useEffect(() => {
    if (!modal) return;
    const panel = sidebar.current;
    if (!panel) return;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    const first = () => focusable()[0] || panel;
    (document.getElementById(initialFocus.current) || first()).focus();
    function key(event: KeyboardEvent) {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebarOpen(false);
      } else if (event.key === "Tab") {
        const items = focusable();
        const edge = event.shiftKey ? items[0] : items.at(-1);
        if (
          document.activeElement === edge ||
          !items.includes(document.activeElement as HTMLElement)
        ) {
          event.preventDefault();
          (event.shiftKey ? items.at(-1) || first() : first()).focus();
        }
      }
    }
    function focus(event: FocusEvent) {
      if (!panel!.contains(event.target as Node)) first().focus();
    }
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", focus);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if (window.matchMedia("(max-width: 760px)").matches) {
        const previous = returnFocus.current;
        if (
          previous?.isConnected &&
          previous !== document.body &&
          previous.getClientRects().length &&
          !previous.matches(":disabled")
        )
          previous.focus();
        else sidebarToggle.current?.focus();
      } else if (
        document.activeElement === document.body ||
        (panel.contains(document.activeElement) &&
          !(document.activeElement as HTMLElement)?.getClientRects().length)
      ) {
        document.getElementById("search")?.focus();
      }
    };
  }, [modal]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.isComposing || document.querySelector("dialog[open]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSidebar("search");
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
        openSidebar("new-title");
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [isMobile, sidebarOpen]);
  return (
    <>
      <header inert={modal}>
        <div className="header-start">
          <button
            ref={sidebarToggle}
            className="sidebar-toggle"
            type="button"
            aria-label="会話一覧を開く"
            aria-controls="session-sidebar"
            aria-expanded={modal}
            aria-haspopup="dialog"
            onClick={() => openSidebar("sidebar-close", sidebarToggle.current)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            dot<span>Session Desk</span>
          </div>
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
        {modal && (
          <div
            className="sidebar-backdrop"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          ref={sidebar}
          id="session-sidebar"
          className={"sidebar-panel" + (modal ? " is-open" : "")}
          role={modal ? "dialog" : undefined}
          aria-modal={modal ? true : undefined}
          aria-labelledby={modal ? "session-sidebar-title" : undefined}
          tabIndex={-1}
        >
          <Sidebar
            sessions={d.sessions}
            selected={d.selected}
            filter={d.filter}
            onFilter={d.setFilter}
            search={d.search}
            onSearch={d.setSearch}
            seen={d.seen}
            onSelect={(id) => {
              d.select(id);
              setSidebarOpen(false);
            }}
            onCreate={async (title) => {
              await d.create(title);
              setSidebarOpen(false);
            }}
            onClose={() => setSidebarOpen(false)}
            busy={d.busy}
          />
        </div>
        <main inert={modal}>
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
          <ProgressPanel
            progress={d.current?.id === d.selected ? d.current.progress : null}
            selected={d.selected}
            loading={d.loading}
            syncError={d.syncError}
          />
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
      <footer className="statusbar" inert={modal}>
        <span>
          Session Desk /{" "}
          {d.syncError ? "再接続中" : d.loading ? "読み込み中" : "自動更新中"}
        </span>
        <span id="session-id">{d.selected}</span>
      </footer>
    </>
  );
}

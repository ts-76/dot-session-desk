"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deskApi } from "./api";
import { isReadOnly, summary } from "./state";
import type {
  Conversation,
  Session,
  Filter,
  ManageAction,
  Message,
} from "../types";
export function useSessionDesk() {
  const [sessions, setSessions] = useState<Session[]>([]),
    [selected, setSelected] = useState(""),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [draft, setDraft] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState<boolean | null>(null),
    [filter, setFilter] = useState<Filter>("active"),
    [search, setSearch] = useState(""),
    [seen, setSeen] = useState<Record<string, string>>({}),
    [syncError, setSyncError] = useState(false);
  const selectedRef = useRef(""),
    sessionsRef = useRef<Session[]>([]),
    conversationRef = useRef<Conversation | null>(null),
    cache = useRef(new Map<string, Conversation>()),
    drafts = useRef(new Map<string, string>()),
    busyRef = useRef(false),
    epoch = useRef(0),
    reader = useRef<AbortController | null>(null),
    listBusy = useRef(false),
    readBusy = useRef(false),
    statusAt = useRef(0),
    seenRef = useRef<Record<string, string>>({}),
    retry = useRef<{ id: string; text: string; thread: string } | null>(null);
  const putSessions = useCallback((value: Session[]) => {
    sessionsRef.current = value;
    setSessions(value);
  }, []);
  const putConversation = useCallback((value: Conversation | null) => {
    conversationRef.current = value;
    setConversation(value);
  }, []);
  const markSeen = useCallback((id: string, value: string) => {
    seenRef.current = { ...seenRef.current, [id]: value };
    setSeen(seenRef.current);
    try {
      localStorage.setItem("dot-desk:seen-reply:" + id, value);
    } catch {}
  }, []);
  const remember = useCallback((t: Conversation) => {
    cache.current.delete(t.id);
    cache.current.set(t.id, t);
    while (cache.current.size > 20)
      cache.current.delete(cache.current.keys().next().value!);
  }, []);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const version = epoch.current;
    if (Date.now() - statusAt.current > 30000) {
      statusAt.current = Date.now();
      void deskApi
        .status()
        .then((s) => setConnected(s.connected))
        .catch(() => setConnected(null));
    }
    if (!listBusy.current) {
      listBusy.current = true;
      void deskApi
        .list()
        .then((data) => {
          if (version !== epoch.current || busyRef.current) return;
          for (const s of data) {
            if (seenRef.current[s.id] === undefined) {
              let value: string | null = null;
              try {
                value = localStorage.getItem("dot-desk:seen-reply:" + s.id);
              } catch {}
              seenRef.current[s.id] = value ?? s.lastReplyId ?? "";
              if (value === null)
                try {
                  localStorage.setItem(
                    "dot-desk:seen-reply:" + s.id,
                    seenRef.current[s.id],
                  );
                } catch {}
            }
          }
          setSeen({ ...seenRef.current });
          putSessions(data);
          if (!selectedRef.current) {
            const first = data.find((s) => !s.deletedAt && !s.archived);
            if (first) {
              selectedRef.current = first.id;
              setSelected(first.id);
              setLoading(true);
            }
          }
        })
        .catch(() => {
          if (version === epoch.current) setSyncError(true);
        })
        .finally(() => {
          listBusy.current = false;
        });
    }
    const id = selectedRef.current;
    if (!id || readBusy.current) return;
    readBusy.current = true;
    const c = new AbortController();
    reader.current = c;
    try {
      const t = await deskApi.read(id, c.signal);
      if (
        version !== epoch.current ||
        selectedRef.current !== id ||
        busyRef.current
      )
        return;
      remember(t);
      putConversation(t);
      setLoading(false);
      setSyncError(false);
      putSessions(
        sessionsRef.current.map((s) =>
          s.id === id ? { ...s, ...t, ...summary(t.messages) } : s,
        ),
      );
      if (!document.hidden) markSeen(id, summary(t.messages).lastReplyId || "");
    } catch (e) {
      if (version !== epoch.current || c.signal.aborted) return;
      setLoading(false);
      setSyncError(true);
      setError(e instanceof Error ? e.message : "接続を確認してください");
    } finally {
      if (reader.current === c) {
        reader.current = null;
        readBusy.current = false;
      }
    }
  }, [markSeen, putConversation, putSessions, remember]);
  const select = useCallback(
    (id: string) => {
      if (busyRef.current || id === selectedRef.current) return;
      epoch.current++;
      reader.current?.abort();
      reader.current = null;
      readBusy.current = false;
      selectedRef.current = id;
      setSelected(id);
      setDraft(drafts.current.get(id) || "");
      setError("");
      setSyncError(false);
      const cached = cache.current.get(id),
        meta = sessionsRef.current.find((s) => s.id === id);
      if (cached) {
        const t = { ...cached, ...meta, messages: cached.messages };
        putConversation(t);
        setLoading(false);
        if (!document.hidden)
          markSeen(id, summary(t.messages).lastReplyId || "");
      } else {
        putConversation(null);
        setLoading(!!id);
      }
      if (location.hash.slice(1) !== id) location.hash = id ? "#" + id : "";
      void refresh();
    },
    [markSeen, putConversation, refresh],
  );
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (hash) {
      selectedRef.current = hash;
      setSelected(hash);
      setLoading(true);
    }
    void refresh();
    const timer = setInterval(refresh, 2000);
    const hashChange = () => select(location.hash.slice(1));
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("hashchange", hashChange);
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      reader.current?.abort();
      window.removeEventListener("hashchange", hashChange);
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", visible);
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, select]);
  useEffect(() => {
    if (selected && !conversationRef.current) void refresh();
  }, [selected, refresh]);
  function changeDraft(value: string) {
    setDraft(value);
    drafts.current.set(selectedRef.current, value);
    if (retry.current?.text !== value) retry.current = null;
  }
  async function mutation<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    epoch.current++;
    reader.current?.abort();
    reader.current = null;
    readBusy.current = false;
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
      throw e;
    } finally {
      busyRef.current = false;
      setBusy(false);
      void refresh();
    }
  }
  async function create(title: string) {
    if (!title.trim()) return;
    await mutation(async () => {
      const t = await deskApi.create(title.trim()),
        full = { ...t, messages: [] };
      remember(full);
      putSessions([{ ...t, ...summary([]) }, ...sessionsRef.current]);
      setFilter("active");
      setSearch("");
      selectedRef.current = t.id;
      setSelected(t.id);
      setDraft("");
      putConversation(full);
      setLoading(false);
      location.hash = "#" + t.id;
    });
  }
  async function send() {
    const id = selectedRef.current,
      body = draft.trim(),
      meta = sessionsRef.current.find((s) => s.id === id);
    if (!body || !id || isReadOnly(meta) || busyRef.current) return;
    const before = conversationRef.current;
    if (!before || before.id !== id) return;
    const messageId =
      retry.current?.text === draft && retry.current.thread === id
        ? retry.current.id
        : crypto.randomUUID();
    retry.current = { id: messageId, text: draft, thread: id };
    const saved: Message = {
      id: messageId,
      role: "user",
      body,
      created: new Date().toISOString(),
      replyTo: null,
    };
    putConversation({
      ...before,
      messages: [...before.messages.filter((m) => m.id !== messageId), saved],
    });
    try {
      await mutation(async () => {
        await deskApi.send(id, body, messageId);
        const t = {
          ...before,
          messages: [
            ...before.messages.filter((m) => m.id !== messageId),
            saved,
          ],
        };
        remember(t);
        putConversation(t);
        putSessions(
          sessionsRef.current.map((s) =>
            s.id === id ? { ...s, ...summary(t.messages) } : s,
          ),
        );
        drafts.current.delete(id);
        setDraft("");
        retry.current = null;
      });
    } catch {
      putConversation(before);
      setError(
        "送信を確認できませんでした。入力を保持しています。同じ内容で再送できます。",
      );
    }
  }
  async function manage(
    id: string,
    action: ManageAction,
    extra: Record<string, unknown> = {},
  ) {
    return mutation(async () => {
      const updated = await deskApi.manage(id, action, extra);
      putSessions(
        sessionsRef.current.map((s) =>
          s.id === id ? { ...s, ...updated } : s,
        ),
      );
      const t = cache.current.get(id);
      if (t) remember({ ...t, ...updated });
      if (conversationRef.current?.id === id)
        putConversation({ ...conversationRef.current, ...updated });
      return updated;
    });
  }
  const current =
    sessions.find((s) => s.id === selected) || conversation || undefined;
  return {
    sessions,
    selected,
    conversation,
    current,
    draft,
    changeDraft,
    loading,
    busy,
    error,
    connected,
    filter,
    setFilter,
    search,
    setSearch,
    seen,
    syncError,
    select,
    create,
    send,
    manage,
    refresh,
  };
}

import type { Message, Session, Filter } from "../types";
export function pendingReplies(messages: Message[]) {
  const positions = new Map(messages.map((m, i) => [m.id, i]));
  let completed = -1;
  messages.forEach((m, i) => {
    if (m.role !== "dot") return;
    const target = positions.get(m.replyTo || "");
    if (target !== undefined && messages[target].role === "user")
      completed = Math.max(completed, target);
    else if (!m.replyTo) completed = Math.max(completed, i - 1);
  });
  return messages.filter((m, i) => m.role === "user" && i > completed);
}
export function summary(messages: Message[]) {
  return {
    pendingCount: pendingReplies(messages).length,
    lastReplyId: messages.filter((m) => m.role === "dot").at(-1)?.id || null,
    messageCount: messages.length,
  };
}
export function visibleSessions(
  sessions: Session[],
  filter: Filter,
  search: string,
) {
  return sessions
    .filter(
      (s) =>
        (filter === "trash"
          ? !!s.deletedAt
          : !s.deletedAt &&
            (filter === "archived" ? !!s.archived : !s.archived)) &&
        s.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => Number(b.pinned || 0) - Number(a.pinned || 0));
}
export function isReadOnly(t: Session | undefined) {
  return !!(t?.deletedAt || t?.archived);
}
export function statusLabel(s: Session, seen: string | undefined) {
  const unread =
    !!s.lastReplyId && seen !== undefined && seen !== s.lastReplyId;
  return unread
    ? { text: s.pendingCount ? "新着 · 返信待ち" : "新着返信", state: "unread" }
    : s.pendingCount
      ? { text: "返信待ち", state: "waiting" }
      : {
          text: s.lastReplyId
            ? "返信済み"
            : s.messageCount
              ? "送信済み"
              : "未開始",
          state: "idle",
        };
}

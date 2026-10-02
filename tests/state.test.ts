import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pendingReplies,
  summary,
  visibleSessions,
  isReadOnly,
  statusLabel,
} from "../lib/client/state.ts";
const u = (id: string) => ({
  id,
  role: "user" as const,
  body: id,
  created: new Date().toISOString(),
});
const r = (id: string, replyTo: string | null) => ({
  id,
  role: "dot" as const,
  body: id,
  created: new Date().toISOString(),
  replyTo,
});
test("latest reply closes preceding backlog", () =>
  assert.deepEqual(pendingReplies([u("a"), u("b"), r("x", "b")]), []));
test("late reply keeps newer pending turn", () =>
  assert.deepEqual(
    pendingReplies([u("a"), u("b"), r("x", "a")]).map((m) => m.id),
    ["b"],
  ));
test("legacy reply closes only preceding turns", () =>
  assert.deepEqual(
    pendingReplies([u("a"), r("x", null), u("b")]).map((m) => m.id),
    ["b"],
  ));
test("summary exposes accurate count and reply", () =>
  assert.deepEqual(summary([u("a"), r("r", "a"), u("b")]), {
    pendingCount: 1,
    lastReplyId: "r",
    messageCount: 3,
  }));
test("filter and pin ordering preserve input", () => {
  const list = [
    { id: "a", title: "A" },
    { id: "b", title: "B", pinned: 1 },
    { id: "c", title: "C", archived: 1 },
    { id: "d", title: "D", deletedAt: "date" },
  ];
  assert.deepEqual(
    visibleSessions(list, "active", "").map((s) => s.id),
    ["b", "a"],
  );
  assert.equal(visibleSessions(list, "archived", "c")[0].id, "c");
  assert.equal(visibleSessions(list, "trash", "")[0].id, "d");
  assert.equal(list[0].id, "a");
});
test("archived and deleted are readonly", () => {
  assert.ok(isReadOnly({ id: "a", title: "A", archived: 1 }));
  assert.ok(isReadOnly({ id: "a", title: "A", deletedAt: "x" }));
  assert.equal(isReadOnly({ id: "a", title: "A" }), false);
});
test("unread plus pending is distinct", () =>
  assert.equal(
    statusLabel(
      { id: "a", title: "A", lastReplyId: "r2", pendingCount: 1 },
      "r1",
    ).text,
    "新着 · 返信待ち",
  ));

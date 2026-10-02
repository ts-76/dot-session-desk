import type { Row } from "./data.ts";
import type { SessionProgress } from "../types.ts";
import { all, one, run, text, fail, date, thread } from "./data.ts";

export function progressFromRow(row: Row): SessionProgress {
  return {
    ...JSON.parse(row.payload),
    version: row.version,
    updatedAt: row.updated,
  };
}
export async function readProgress(db: D1Database, owner: string, id: string) {
  const row = await one(
    db,
    "SELECT payload,version,updated FROM progress_updates WHERE owner=? AND thread=? ORDER BY version DESC LIMIT 1",
    owner,
    id,
  );
  return row ? progressFromRow(row) : null;
}
export async function attachProgress(
  db: D1Database,
  owner: string,
  threads: Row[],
) {
  const rows = await all(
    db,
    "SELECT p.* FROM progress_updates p WHERE p.owner=? AND p.version=(SELECT MAX(q.version) FROM progress_updates q WHERE q.owner=p.owner AND q.thread=p.thread)",
    owner,
  );
  const byThread = new Map(
    rows.map((row) => [row.thread, progressFromRow(row)]),
  );
  return threads.map((row) => ({
    ...row,
    progress: byThread.get(row.id) || null,
  }));
}
function field(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max)
    fail(400, "Invalid progress text");
  return value.trim();
}
function list(value: unknown, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems)
    fail(400, "Invalid progress list");
  return value.map((item) => text(item, 500));
}
function validated(a: Row) {
  const keys = [
    "thread_id",
    "expected_version",
    "update_key",
    "status",
    "completed",
    "current",
    "blockers",
    "user_actions",
    "next_step",
  ];
  if (
    !a ||
    typeof a !== "object" ||
    Array.isArray(a) ||
    Object.keys(a).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(a, key)) ||
    Object.keys(a).some((key) => !keys.includes(key))
  )
    fail(400, "Invalid progress fields");
  if (
    !Number.isSafeInteger(a.expected_version) ||
    a.expected_version < 0 ||
    a.expected_version >= Number.MAX_SAFE_INTEGER
  )
    fail(400, "Invalid expected_version");
  if (
    !["in_progress", "blocked", "needs_input", "complete", "paused"].includes(
      a.status,
    )
  )
    fail(400, "Invalid progress status");
  const progress = {
    status: a.status as SessionProgress["status"],
    completed: list(a.completed, 20),
    current: field(a.current, 1000),
    blockers: list(a.blockers, 10),
    userActions: list(a.user_actions, 10),
    nextStep: field(a.next_step, 1000),
  };
  if (progress.status === "needs_input" && !progress.userActions.length)
    fail(400, "needs_input requires user_actions");
  if (progress.userActions.length && progress.status !== "needs_input")
    fail(400, "user_actions requires needs_input status");
  if (progress.status === "blocked" && !progress.blockers.length)
    fail(400, "blocked requires blockers");
  if (progress.status === "in_progress" && !progress.current)
    fail(400, "in_progress requires current work");
  if (
    progress.status === "complete" &&
    (progress.current ||
      progress.blockers.length ||
      progress.userActions.length)
  )
    fail(400, "complete cannot contain unresolved work");
  const payload = JSON.stringify(progress);
  if (payload.length > 16000) fail(400, "Progress too large");
  return {
    id: text(a.thread_id, 100),
    key: text(a.update_key, 200),
    expected: a.expected_version as number,
    payload,
  };
}
export async function updateProgress(db: D1Database, owner: string, args: Row) {
  const { id, key, expected, payload } = validated(args);
  await thread(db, owner, id);
  // One INSERT is the CAS and idempotency transaction. Unique constraints guard
  // simultaneous writers; no read-then-update window and no D1 batch required.
  const inserted = await run(
    db,
    `INSERT OR IGNORE INTO progress_updates(thread,owner,version,updateKey,expectedVersion,payload,updated)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM threads WHERE id=? AND owner=?)
    AND COALESCE((SELECT MAX(version) FROM progress_updates WHERE thread=? AND owner=?),0)=?`,
    id,
    owner,
    expected + 1,
    key,
    expected,
    payload,
    date(),
    id,
    owner,
    id,
    owner,
    expected,
  );
  const saved = await one(
    db,
    "SELECT * FROM progress_updates WHERE thread=? AND owner=? AND updateKey=?",
    id,
    owner,
    key,
  );
  if (saved) {
    if (saved.payload !== payload || saved.expectedVersion !== expected)
      fail(409, "Progress update_key reused with different request");
    return {
      progress: progressFromRow(saved),
      duplicate: inserted.meta.changes === 0,
    };
  }
  const current = await readProgress(db, owner, id);
  throw Object.assign(
    new Error(
      "Progress version conflict; read_thread and retry with a new update_key",
    ),
    { status: 409, rpcCode: -32009, currentVersion: current?.version || 0 },
  );
}

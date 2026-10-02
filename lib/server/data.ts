export type Row = Record<string, any>;
export interface Env {
  DB: D1Database;
  // Opt in only behind a verified owner-private Sites gateway.
  SESSION_DESK_AUTH_BOUNDARY?: string;
  SESSION_DESK_ORIGIN?: string;
  SESSION_DESK_ENABLE_BRIDGE?: string;
}
export interface Context {
  waitUntil(p: Promise<unknown>): void;
}
export function configuredOrigin(env: Env): string | null {
  try {
    const url = new URL(env.SESSION_DESK_ORIGIN || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname.endsWith(".invalid")
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export const EVENT = "message.created";
export const js = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
export const uid = () => crypto.randomUUID();
export const date = () => new Date().toISOString();
export function fail(s: number, m: string): never {
  throw Object.assign(new Error(m), { status: s });
}
export const text = (v: unknown, max = 12000) =>
  typeof v === "string" && v.trim() && v.length <= max
    ? v.trim()
    : fail(400, "入力内容を確認してください");
export const one = (db: D1Database, sql: string, ...v: unknown[]) =>
  db
    .prepare(sql)
    .bind(...v)
    .first<Row>();
export const all = async (db: D1Database, sql: string, ...v: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...v)
      .all<Row>()
  ).results;
export const run = (db: D1Database, sql: string, ...v: unknown[]) =>
  db
    .prepare(sql)
    .bind(...v)
    .run();
export async function thread(db: D1Database, owner: string, id: string) {
  const t = await one(
    db,
    "SELECT * FROM threads WHERE id=? AND owner=?",
    id,
    owner,
  );
  if (!t) fail(404, "会話が見つかりません");
  return t;
}
export async function readThread(db: D1Database, owner: string, id: string) {
  const t = await thread(db, owner, id);
  return {
    ...t,
    messages: await all(
      db,
      "SELECT id,role,body,COALESCE(replyTo,followupTo) AS replyTo,created FROM messages WHERE thread=? AND owner=? ORDER BY created,rowid",
      id,
      owner,
    ),
  };
}
export function summarizeMessages(messages: Row[]) {
  const positions = new Map(messages.map((m, i) => [m.id, i]));
  let completedThrough = -1,
    lastReplyId = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "dot") continue;
    lastReplyId = m.id;
    const target = positions.get(m.replyTo);
    if (target !== undefined && messages[target].role === "user")
      completedThrough = Math.max(completedThrough, target);
    else if (!m.replyTo) completedThrough = Math.max(completedThrough, i - 1);
  }
  return {
    pendingCount: messages.filter(
      (m, i) => m.role === "user" && i > completedThrough,
    ).length,
    lastReplyId,
    messageCount: messages.length,
  };
}
export async function listThreadSummaries(db: D1Database, owner: string) {
  const threads = await all(
    db,
    "SELECT * FROM threads WHERE owner=? ORDER BY created DESC",
    owner,
  );
  const rows = await all(
    db,
    "SELECT id,thread,role,COALESCE(replyTo,followupTo) AS replyTo,created FROM messages WHERE owner=? ORDER BY created,rowid",
    owner,
  );
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!groups.has(row.thread)) groups.set(row.thread, []);
    groups.get(row.thread)!.push(row);
  }
  return threads.map((t) => ({
    ...t,
    ...summarizeMessages(groups.get(t.id) || []),
  }));
}
export async function appendUser(
  db: D1Database,
  owner: string,
  id: string,
  body: unknown,
  messageId: unknown,
) {
  const target = await thread(db, owner, id);
  if (target.deletedAt || target.archived)
    fail(409, "復元してから送信してください");
  body = text(body);
  messageId = text(messageId, 100);
  const old = await one(db, "SELECT * FROM messages WHERE id=?", messageId);
  if (old) {
    if (
      old.owner !== owner ||
      old.thread !== id ||
      old.body !== body ||
      old.role !== "user"
    )
      fail(409, "同じIDが別の送信に使われています");
    return old;
  }
  const created = date();
  const inserted = await run(
    db,
    "INSERT INTO messages(id,thread,owner,role,body,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM threads WHERE id=? AND owner=? AND archived=0 AND deletedAt IS NULL)",
    messageId,
    id,
    owner,
    "user",
    body,
    created,
    id,
    owner,
  );
  if (inserted.meta?.changes === 0) fail(409, "復元してから送信してください");
  return { id: messageId, thread: id, owner, role: "user", body, created };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "./lib/server/http.ts";
import { validateCallback } from "./lib/server/notifications.ts";
function db() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("drizzle/" + f, "utf8"));
  return {
    prepare(sql) {
      return {
        bind(...v) {
          const s = db.prepare(sql);
          return {
            first: async () => s.get(...v) || null,
            all: async () => ({ results: s.all(...v) }),
            run: async () => ({ meta: { changes: s.run(...v).changes } }),
          };
        },
      };
    },
  };
}
// Isolated gateway simulation; these non-secret settings never reach deployment.
function testEnv() {
  return {
    DB: db(),
    SESSION_DESK_AUTH_BOUNDARY: "sites-owner-private",
    SESSION_DESK_ORIGIN: "https://session-desk.example.test",
    SESSION_DESK_ENABLE_BRIDGE: "true",
  };
}
const base = "https://session-desk.example.test";
function req(path, body, owner = "a") {
  return new Request(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(owner ? { "oai-authenticated-user-id": owner } : {}),
      origin: base,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = {
  waitUntil(p) {
    p.catch(() => {});
  },
};
test("auth required for private data", async () => {
  const r = await worker.fetch(req("/api/threads", null, null), testEnv(), ctx);
  assert.equal(r.status, 401);
});
test("thread/message persists and duplicate guarded; owners isolated", async () => {
  const env = testEnv();
  const a = await (
    await worker.fetch(req("/api/threads", { title: "A" }), env, ctx)
  ).json();
  const b = await (
    await worker.fetch(req("/api/threads", { title: "B" }), env, ctx)
  ).json();
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await worker.fetch(
          req("/api/threads/" + a.id, { text: "Hello", id: "m1" }),
          env,
          ctx,
        )
      ).status,
      200,
    );
  let t = await (
    await worker.fetch(req("/api/threads/" + a.id), env, ctx)
  ).json();
  assert.equal(t.messages.length, 1);
  assert.equal(
    (await worker.fetch(req("/api/threads/" + a.id, null, "other"), env, ctx))
      .status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/api/threads/" + b.id, { text: "Hello", id: "m1" }),
        env,
        ctx,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(base + "/api/threads", {
          method: "POST",
          headers: {
            "oai-authenticated-user-id": "a",
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: '{"title":"bad"}',
        }),
        env,
        ctx,
      )
    ).status,
    403,
  );
});
test("MCP reply targets actual user message and is idempotent", async () => {
  const env = testEnv();
  const t = await (
    await worker.fetch(req("/api/threads", { title: "T" }), env, ctx)
  ).json();
  await worker.fetch(
    req("/api/threads/" + t.id, { text: "question", id: "m1" }),
    env,
    ctx,
  );
  const rpc = (name, args) =>
    worker.fetch(
      req("/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      env,
      ctx,
    );
  const args = { thread_id: t.id, reply_to: "m1", text: "actual reply" };
  const first = await (await rpc("append_reply", args)).json();
  assert.ok(first.result);
  const second = await (await rpc("append_reply", args)).json();
  assert.equal(JSON.parse(second.result.content[0].text).duplicate, true);
  const missing = await (
    await rpc("append_reply", { ...args, reply_to: "missing" })
  ).json();
  assert.ok(missing.error);
  const pending = await (await rpc("list_pending", {})).json();
  assert.deepEqual(JSON.parse(pending.result.content[0].text), []);
});
test("callbacks fail closed outside official exact hosts", () => {
  for (const u of [
    "http://chatgpt.com/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://chatgpt.com.evil.example/a",
    "https://user@chatgpt.com/a",
    "https://chatgpt.com:8443/a",
  ])
    assert.throws(() => validateCallback(u));
  assert.equal(
    validateCallback("https://chatgpt.com/callback"),
    "https://chatgpt.com/callback",
  );
  assert.equal(
    validateCallback("https://connectors.api.openai.com/callback"),
    "https://connectors.api.openai.com/callback",
  );
});
test("discovery only contains tool and event schema", async () => {
  const env = testEnv();
  const r = await worker.fetch(
    req("/mcp", { jsonrpc: "2.0", id: 1, method: "events/list" }, null),
    env,
    ctx,
  );
  const d = await r.json();
  assert.equal(d.result.events[0].name, "message.created");
  assert.deepEqual(d.result.events[0].inputSchema.required, []);
});
test("service bridge never infers owner and rejects cross-origin requests", async () => {
  const env = testEnv();
  const br = (body, owner = "a") =>
    worker.fetch(req("/bridge", body, owner), env, ctx);
  assert.equal((await br({ action: "list_pending" }, null)).status, 401);
  await worker.fetch(req("/api/threads", { title: "T" }), env, ctx);
  assert.equal((await br({ action: "list_pending" }, null)).status, 401);
  assert.deepEqual(await (await br({ action: "list_pending" })).json(), []);
  assert.equal(
    (
      await worker.fetch(
        new Request(base + "/bridge", {
          method: "POST",
          headers: {
            "oai-authenticated-user-id": "a",
            "content-type": "application/json",
            origin: "https://evil.example",
          },
          body: JSON.stringify({ action: "list_pending" }),
        }),
        env,
        ctx,
      )
    ).status,
    403,
  );
  assert.equal((await br({ action: "invalid" }, "a")).status, 400);
});
test("webhook verification uses edge-supported no-follow policy and persists subscription", async () => {
  const env = testEnv(),
    original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, "manual");
    assert.equal(new URL(url).hostname, "connectors.api.openai.com");
    assert.ok(options.headers["webhook-signature"].startsWith("v1,"));
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
    });
  };
  try {
    const r = await worker.fetch(
      req("/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "events/subscribe",
        params: {
          name: "message.created",
          arguments: {},
          delivery: {
            mode: "webhook",
            url: "https://connectors.api.openai.com/callback",
            // Deterministic dummy HMAC fixture, never a real subscription key.
            secret: "whsec_" + Buffer.alloc(32, 1).toString("base64"),
          },
        },
      }),
      env,
      ctx,
    );
    const data = await r.json();
    assert.ok(data.result?.id, data.error?.message);
    const status = await (
      await worker.fetch(req("/api/status"), env, ctx)
    ).json();
    assert.equal(status.connected, true);
  } finally {
    globalThis.fetch = original;
  }
});
test("thread summaries expose reply status only for authenticated owner", async () => {
  const env = testEnv();
  const a = await (
    await worker.fetch(req("/api/threads", { title: "A" }), env, ctx)
  ).json();
  await worker.fetch(
    req("/api/threads", { title: "Private B" }, "b"),
    env,
    ctx,
  );
  await worker.fetch(
    req("/api/threads/" + a.id, { text: "first", id: "old" }),
    env,
    ctx,
  );
  await worker.fetch(
    req("/api/threads/" + a.id, { text: "latest", id: "latest" }),
    env,
    ctx,
  );
  let summaries = await (
    await worker.fetch(req("/api/threads"), env, ctx)
  ).json();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].pendingCount, 2);
  assert.equal(summaries[0].lastReplyId, null);
  const result = await (
    await worker.fetch(
      req("/bridge", {
        action: "append_reply",
        arguments: { thread_id: a.id, reply_to: "latest", text: "done" },
      }),
      env,
      ctx,
    )
  ).json();
  summaries = await (await worker.fetch(req("/api/threads"), env, ctx)).json();
  assert.equal(summaries[0].pendingCount, 0);
  assert.equal(summaries[0].lastReplyId, result.id);
  assert.equal(summaries[0].messageCount, 3);
  assert.equal("messages" in summaries[0], false);
  const other = await (
    await worker.fetch(req("/api/threads", null, "b"), env, ctx)
  ).json();
  assert.equal(other.length, 1);
  assert.equal(other[0].messageCount, 0);
});
test("session management persists metadata and soft deletion is fully recoverable", async () => {
  const env = testEnv();
  const t = await (
    await worker.fetch(req("/api/threads", { title: "Original" }), env, ctx)
  ).json();
  const path = "/api/threads/" + t.id;
  await worker.fetch(req(path, { id: "u1", text: "Keep me" }), env, ctx);
  const manage = async (body, owner = "a") =>
    worker.fetch(req(path + "/manage", body, owner), env, ctx);
  assert.equal(
    (await manage({ action: "rename", title: "Private" }, "b")).status,
    404,
  );
  assert.equal((await manage({ action: "rename", title: "  " })).status, 400);
  assert.equal((await manage({ action: "pin", value: "false" })).status, 400);
  assert.equal((await manage({ action: "purge" })).status, 400);
  assert.equal(
    (await (await manage({ action: "rename", title: "Renamed" })).json()).title,
    "Renamed",
  );
  assert.equal(
    (await (await manage({ action: "pin", value: true })).json()).pinned,
    1,
  );
  assert.equal(
    (await (await manage({ action: "archive", value: true })).json()).archived,
    1,
  );
  assert.equal(
    (await worker.fetch(req(path, { id: "u2", text: "blocked" }), env, ctx))
      .status,
    409,
  );
  let trash = await (await manage({ action: "trash" })).json();
  assert.ok(trash.deletedAt);
  assert.equal(
    (await (await manage({ action: "trash" })).json()).deletedAt,
    trash.deletedAt,
  );
  assert.equal(
    (await worker.fetch(req(path, { id: "u3", text: "blocked" }), env, ctx))
      .status,
    409,
  );
  const pending = await (
    await worker.fetch(req("/bridge", { action: "list_pending" }), env, ctx)
  ).json();
  assert.deepEqual(pending, []);
  const sessions = await (
    await worker.fetch(req("/bridge", { action: "list_sessions" }), env, ctx)
  ).json();
  assert.deepEqual(sessions, []);
  const restored = await (await manage({ action: "restore" })).json();
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.archived, 0);
  assert.equal(restored.title, "Renamed");
  assert.equal(restored.pinned, 1);
  const history = await (await worker.fetch(req(path), env, ctx)).json();
  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0].body, "Keep me");
  assert.equal(
    (await worker.fetch(req(path, { id: "u4", text: "restored" }), env, ctx))
      .status,
    200,
  );
});
test("late reply is retained in trash for later recovery without emitting a new event", async () => {
  const env = testEnv();
  const t = await (
    await worker.fetch(req("/api/threads", { title: "T" }), env, ctx)
  ).json();
  const path = "/api/threads/" + t.id;
  await worker.fetch(req(path, { id: "u", text: "question" }), env, ctx);
  await worker.fetch(req(path + "/manage", { action: "trash" }), env, ctx);
  assert.equal(
    (
      await worker.fetch(
        req("/bridge", {
          action: "append_reply",
          arguments: { thread_id: t.id, reply_to: "u", text: "answer" },
        }),
        env,
        ctx,
      )
    ).status,
    200,
  );
  await worker.fetch(req(path + "/manage", { action: "restore" }), env, ctx);
  const history = await (await worker.fetch(req(path), env, ctx)).json();
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[1].body, "answer");
});
test("progress updates are idempotent and do not close newer unanswered messages", async () => {
  const env = testEnv();
  const t = await (
    await worker.fetch(req("/api/threads", { title: "T" }), env, ctx)
  ).json();
  const path = "/api/threads/" + t.id;
  await worker.fetch(req(path, { id: "old", text: "task" }), env, ctx);
  await worker.fetch(
    req("/bridge", {
      action: "append_reply",
      arguments: { thread_id: t.id, reply_to: "old", text: "started" },
    }),
    env,
    ctx,
  );
  await worker.fetch(req(path, { id: "new", text: "new question" }), env, ctx);
  const b = {
    action: "append_update",
    arguments: {
      thread_id: t.id,
      reply_to: "old",
      update_key: "completed-1",
      text: "completed",
    },
  };
  assert.equal(
    (await (await worker.fetch(req("/bridge", b), env, ctx)).json()).duplicate,
    false,
  );
  assert.equal(
    (await (await worker.fetch(req("/bridge", b), env, ctx)).json()).duplicate,
    true,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/bridge", {
          ...b,
          arguments: { ...b.arguments, text: "changed" },
        }),
        env,
        ctx,
      )
    ).status,
    409,
  );
  const summary = await (
    await worker.fetch(req("/api/threads"), env, ctx)
  ).json();
  assert.equal(summary[0].pendingCount, 1);
  const history = await (await worker.fetch(req(path), env, ctx)).json();
  assert.equal(history.messages.at(-1).replyTo, "old");
  assert.equal(
    (await worker.fetch(req("/bridge", b, "b"), env, ctx)).status,
    404,
  );
});

test("public template rejects forged auth headers on every data route before DB access", async () => {
  const unreachableDB = {
    prepare() {
      throw new Error("DB must not be accessed");
    },
  };
  for (const path of ["/api/threads", "/mcp", "/bridge"]) {
    for (const settings of [
      {},
      {
        SESSION_DESK_AUTH_BOUNDARY: "public-worker",
        SESSION_DESK_ORIGIN: base,
      },
      { SESSION_DESK_AUTH_BOUNDARY: "sites-owner-private" },
      {
        SESSION_DESK_AUTH_BOUNDARY: "sites-owner-private",
        SESSION_DESK_ORIGIN: "https://different.example.test",
      },
      {
        SESSION_DESK_AUTH_BOUNDARY: "sites-owner-private",
        SESSION_DESK_ORIGIN: "https://example.invalid",
      },
    ]) {
      const r = await worker.fetch(
        req(path, { action: "list_pending" }),
        { DB: unreachableDB, ...settings },
        ctx,
      );
      assert.equal(r.status, 503);
    }
  }
});
test("bridge requires a separate opt-in even in Sites mode", async () => {
  const env = testEnv();
  delete env.SESSION_DESK_ENABLE_BRIDGE;
  assert.equal(
    (await worker.fetch(req("/bridge", { action: "list_pending" }), env, ctx))
      .status,
    403,
  );
});

// Fictional progress facts, never a record of a real user's work.
const progressArgs = (id, overrides = {}) => ({
  thread_id: id,
  expected_version: 0,
  update_key: "fixture-start",
  status: "in_progress",
  completed: ["サンプル画面を確認"],
  current: "テスト用の表示を調整",
  blockers: [],
  user_actions: [],
  next_step: "サンプル試験を確認",
  ...overrides,
});
async function newThread(env, owner = "a") {
  return (
    await worker.fetch(
      req("/api/threads", { title: "Progress fixture" }, owner),
      env,
      ctx,
    )
  ).json();
}
async function progressRpc(env, name, args, owner = "a", context = ctx) {
  const response = await worker.fetch(
    req(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      owner,
    ),
    env,
    context,
  );
  const body = await response.json();
  return body.error
    ? { error: body.error }
    : JSON.parse(body.result.content[0].text);
}

test("progress migration adds tables without changing existing conversation data", () => {
  const memory = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((file) => /^000[0-2].*\.sql$/.test(file))
    .sort())
    memory.exec(readFileSync("drizzle/" + file, "utf8"));
  memory.exec(
    "INSERT INTO threads(id,owner,title,created) VALUES('old','a','Keep','fixture-date'); INSERT INTO messages(id,thread,owner,role,body,created) VALUES('old-message','old','a','user','Keep body','fixture-date')",
  );
  memory.exec(readFileSync("drizzle/0003_session_progress.sql", "utf8"));
  assert.equal(
    memory.prepare("SELECT body FROM messages WHERE id='old-message'").get()
      .body,
    "Keep body",
  );
  assert.equal(
    memory.prepare("SELECT count(*) AS n FROM progress_updates").get().n,
    0,
  );
  memory.close();
});

test("unregistered progress is null in browser and MCP reads; tool is discoverable", async () => {
  const env = testEnv(),
    t = await newThread(env);
  const read = await progressRpc(env, "read_thread", { thread_id: t.id });
  assert.equal(read.progress, null);
  const sessions = await progressRpc(env, "list_sessions", {});
  assert.equal(sessions[0].progress, null);
  const discovery = await (
    await worker.fetch(
      req("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, null),
      env,
      ctx,
    )
  ).json();
  const tool = discovery.result.tools.find(
    (tool) => tool.name === "update_progress",
  );
  assert.equal(tool.annotations.idempotentHint, true);
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test("structured progress persists with version and server time and emits no reply or event", async () => {
  const env = testEnv(),
    t = await newThread(env);
  let scheduled = 0;
  const result = await progressRpc(
    env,
    "update_progress",
    progressArgs(t.id),
    "a",
    {
      waitUntil() {
        scheduled++;
      },
    },
  );
  assert.equal(scheduled, 0);
  assert.equal(result.duplicate, false);
  assert.equal(result.progress.version, 1);
  assert.ok(Number.isFinite(Date.parse(result.progress.updatedAt)));
  assert.deepEqual(result.progress.completed, ["サンプル画面を確認"]);
  const read = await (
    await worker.fetch(req("/api/threads/" + t.id), env, ctx)
  ).json();
  assert.deepEqual(read.progress, result.progress);
  assert.equal(read.messages.length, 0);
  assert.equal(
    (
      await env.DB.prepare("SELECT count(*) AS n FROM deliveries")
        .bind()
        .first()
    ).n,
    0,
  );
  assert.equal(
    (await progressRpc(env, "list_sessions", {}))[0].progress.version,
    1,
  );
  assert.equal(
    (await (await worker.fetch(req("/api/threads"), env, ctx)).json())[0]
      .progress.version,
    1,
  );
});

test("progress retries preserve time, old retries cannot overwrite newer status, reused keys conflict", async () => {
  const env = testEnv(),
    t = await newThread(env),
    args = progressArgs(t.id);
  const first = await progressRpc(env, "update_progress", args);
  const retry = await progressRpc(env, "update_progress", args);
  assert.equal(retry.duplicate, true);
  assert.deepEqual(retry.progress, first.progress);
  const newer = await progressRpc(
    env,
    "update_progress",
    progressArgs(t.id, {
      expected_version: 1,
      update_key: "fixture-input",
      status: "needs_input",
      current: "",
      user_actions: ["テスト用の表示案を選んでください"],
    }),
  );
  assert.equal(newer.progress.version, 2);
  assert.equal(
    (await progressRpc(env, "update_progress", args)).duplicate,
    true,
  );
  assert.equal(
    (await progressRpc(env, "read_thread", { thread_id: t.id })).progress
      .status,
    "needs_input",
  );
  assert.equal(
    (
      await progressRpc(env, "update_progress", {
        ...args,
        current: "Different",
      })
    ).error.data.status,
    409,
  );
  assert.equal(
    (
      await progressRpc(env, "update_progress", {
        ...args,
        expected_version: 2,
      })
    ).error.data.status,
    409,
  );
});

test("simultaneous progress writers use atomic CAS and simultaneous retries are idempotent", async () => {
  const env = testEnv(),
    t = await newThread(env);
  const results = await Promise.all(
    ["fixture-one", "fixture-two"].map((key) =>
      progressRpc(
        env,
        "update_progress",
        progressArgs(t.id, { update_key: key }),
      ),
    ),
  );
  assert.equal(results.filter((result) => result.error).length, 1);
  const conflict = results.find((result) => result.error).error;
  assert.equal(conflict.code, -32009);
  assert.equal(conflict.data.status, 409);
  assert.equal(conflict.data.current_version, 1);
  const same = progressArgs(t.id, {
    expected_version: 1,
    update_key: "fixture-same",
  });
  const retries = await Promise.all([
    progressRpc(env, "update_progress", same),
    progressRpc(env, "update_progress", same),
  ]);
  assert.deepEqual(retries.map((result) => result.duplicate).sort(), [
    false,
    true,
  ]);
  assert.equal(
    (await progressRpc(env, "read_thread", { thread_id: t.id })).progress
      .version,
    2,
  );
});

test("progress validation and owner scope reject unauthorized or malformed updates", async () => {
  const env = testEnv(),
    t = await newThread(env),
    args = progressArgs(t.id);
  assert.equal(
    (await progressRpc(env, "update_progress", args, "other")).error.data
      .status,
    404,
  );
  assert.equal(
    (await progressRpc(env, "update_progress", args, null)).error.data.status,
    401,
  );
  for (const overrides of [
    { expected_version: -1 },
    { expected_version: "0" },
    { expected_version: 0.5 },
    { status: "unknown" },
    { completed: "wrong" },
    { completed: [""] },
    { current: "x".repeat(1001) },
    { blockers: Array(11).fill("x") },
    { status: "blocked", blockers: [] },
    { status: "needs_input", user_actions: [] },
    { status: "complete", current: "still working" },
    { user_actions: ["Choose"] },
    { owner: "other" },
    { updatedAt: "invented" },
  ])
    assert.equal(
      (await progressRpc(env, "update_progress", { ...args, ...overrides }))
        .error.data.status,
      400,
    );
  assert.equal(
    (await progressRpc(env, "read_thread", { thread_id: t.id })).progress,
    null,
  );
});

test("progress is isolated between owners and retains independent unanswered message state", async () => {
  const env = testEnv(),
    t = await newThread(env),
    other = await newThread(env, "other");
  await worker.fetch(
    req("/api/threads/" + t.id, {
      id: "progress-question",
      text: "Fixture question",
    }),
    env,
    ctx,
  );
  const args = progressArgs(t.id, {
    status: "complete",
    current: "",
    next_step: "",
  });
  await progressRpc(env, "update_progress", args);
  assert.equal((await progressRpc(env, "list_pending", {})).length, 1);
  const list = await (await worker.fetch(req("/api/threads"), env, ctx)).json();
  assert.equal(list[0].pendingCount, 1);
  assert.equal(list[0].progress.status, "complete");
  const otherList = await progressRpc(env, "list_sessions", {}, "other");
  assert.equal(otherList.length, 1);
  assert.equal(otherList[0].id, other.id);
  assert.equal(otherList[0].progress, null);
  assert.equal(
    (await progressRpc(env, "read_thread", { thread_id: t.id }, "other")).error
      .data.status,
    404,
  );
});

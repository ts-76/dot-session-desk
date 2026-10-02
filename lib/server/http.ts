import type { Row, Env, Context } from "./data.ts";
import {
  configuredOrigin,
  EVENT,
  js,
  uid,
  date,
  fail,
  text,
  one,
  all,
  run,
  thread,
  readThread,
  listThreadSummaries,
  appendUser,
} from "./data.ts";
import { deliver } from "./notifications.ts";
import { mcp, callTool } from "./mcp.ts";
export default {
  async fetch(request: Request, env: Env, ctx: Context) {
    const url = new URL(request.url);
    const owner = request.headers.get("oai-authenticated-user-id");
    try {
      // A header is not proof of authentication on a directly exposed Worker.
      // The public template fails closed until the operator verifies the Sites
      // gateway strips client headers, authenticates callers, and prevents bypass.
      const origin = configuredOrigin(env);
      if (
        env.SESSION_DESK_AUTH_BOUNDARY !== "sites-owner-private" ||
        !origin ||
        url.origin !== origin
      )
        fail(503, "Verified owner-private Sites boundary is not configured");
      if (url.pathname === "/bridge") {
        if (env.SESSION_DESK_ENABLE_BRIDGE !== "true")
          fail(403, "Service bridge is disabled");
        // Sites-only: service dispatch must supply an authenticated owner.
        if (
          request.method !== "POST" ||
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          return js({ error: "Method or content type rejected" }, 405);
        if (
          request.headers.get("origin") &&
          request.headers.get("origin") !== origin
        )
          return js({ error: "Origin rejected" }, 403);
        const principal = owner;
        if (!principal) fail(401, "Authenticated owner required");
        const body = (await request.json()) as Row;
        if (
          ![
            "list_sessions",
            "read_thread",
            "list_pending",
            "append_reply",
            "append_update",
          ].includes(body.action)
        )
          fail(400, "Unknown action");
        if (!principal) fail(403, "Owner unavailable");
        return js(
          await callTool(env.DB, principal, body.action, body.arguments || {}),
        );
      }
      if (url.pathname === "/mcp") {
        if (request.method !== "POST")
          return new Response(null, { status: 405 });
        if (
          !request.headers
            .get("content-type")
            ?.startsWith("application/json") ||
          (request.headers.get("origin") &&
            request.headers.get("origin") !== origin)
        )
          return js({ error: "Origin or content type rejected" }, 403);
        return await mcp(request, env, owner);
      }
      if (!url.pathname.startsWith("/api/"))
        return js({ error: "Not found" }, 404);
      if (!owner) fail(401, "ログインしてください");
      if (
        request.method === "POST" &&
        (request.headers.get("origin") !== origin ||
          !request.headers.get("content-type")?.startsWith("application/json"))
      )
        fail(403, "Origin rejected");
      if (url.pathname === "/api/status") {
        const sub = await one(
          env.DB,
          "SELECT count(*) AS count FROM subscriptions WHERE owner=? AND expires>?",
          owner,
          Date.now(),
        );
        return js({ connected: (sub?.count || 0) > 0 });
      }
      if (url.pathname === "/api/threads" && request.method === "GET")
        return js(await listThreadSummaries(env.DB, owner));
      if (url.pathname === "/api/threads" && request.method === "POST") {
        const b = (await request.json()) as Row,
          title = text(b.title, 200),
          id = uid();
        await run(
          env.DB,
          "INSERT INTO threads(id,owner,title,created) VALUES(?,?,?,?)",
          id,
          owner,
          title,
          date(),
        );
        return js({ id, title });
      }
      const manage = url.pathname.match(
        /^\/api\/threads\/([a-zA-Z0-9-]+)\/manage$/,
      );
      if (manage && request.method === "POST") {
        const id = manage[1],
          t = await thread(env.DB, owner, id),
          b = (await request.json()) as Row;
        if (b.action === "rename") {
          await run(
            env.DB,
            "UPDATE threads SET title=? WHERE id=? AND owner=?",
            text(b.title, 200),
            id,
            owner,
          );
        } else if (b.action === "pin") {
          if (typeof b.value !== "boolean") fail(400, "Invalid value");
          await run(
            env.DB,
            "UPDATE threads SET pinned=? WHERE id=? AND owner=?",
            Number(b.value),
            id,
            owner,
          );
        } else if (b.action === "archive") {
          if (typeof b.value !== "boolean") fail(400, "Invalid value");
          await run(
            env.DB,
            "UPDATE threads SET archived=? WHERE id=? AND owner=?",
            Number(b.value),
            id,
            owner,
          );
        } else if (b.action === "trash") {
          await run(
            env.DB,
            "UPDATE threads SET deletedAt=COALESCE(deletedAt,?) WHERE id=? AND owner=?",
            date(),
            id,
            owner,
          );
        } else if (b.action === "restore") {
          await run(
            env.DB,
            "UPDATE threads SET deletedAt=NULL,archived=0 WHERE id=? AND owner=?",
            id,
            owner,
          );
        } else fail(400, "Unknown action");
        return js(await thread(env.DB, owner, id));
      }
      const match = url.pathname.match(/^\/api\/threads\/([a-zA-Z0-9-]+)$/);
      if (match && request.method === "GET")
        return js(await readThread(env.DB, owner, match[1]));
      if (match && request.method === "POST") {
        if (Number(request.headers.get("content-length") || 0) > 20000)
          fail(413, "Message too large");
        const b = (await request.json()) as Row;
        const m = await appendUser(env.DB, owner, match[1], b.text, b.id);
        ctx.waitUntil(deliver(env.DB, owner, m, origin));
        return js({ id: m.id, saved: true });
      }
      return js({ error: "Not found" }, 404);
    } catch (e: any) {
      return js(
        {
          error: e.status
            ? e.message
            : "保存または取得に失敗しました。入力を残して再試行してください",
        },
        e.status || 500,
      );
    }
  },
};

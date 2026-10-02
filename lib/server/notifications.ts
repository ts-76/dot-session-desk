import type { Row, Env, Context } from "./data.ts";
import {
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
export function validateCallback(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.port ||
    !["chatgpt.com", "api.openai.com", "connectors.api.openai.com"].includes(
      u.hostname,
    )
  )
    fail(400, "Callback host is not in the official allowlist");
  return u.href;
}
function secretBytes(secret: unknown) {
  if (typeof secret !== "string" || !secret.startsWith("whsec_"))
    fail(400, "Invalid signing secret");
  let a;
  try {
    a = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
  } catch {
    fail(400, "Invalid signing secret");
  }
  if (a.length < 24 || a.length > 64) fail(400, "Invalid signing secret");
  return a;
}
async function signedPost(sub: Row, data: unknown, eventId: string) {
  const url = validateCallback(sub.url);
  const body = JSON.stringify(data),
    stamp = String(Math.floor(Date.now() / 1000));
  console.info(
    JSON.stringify({
      callback_phase: "signing",
      timeout_api: typeof AbortSignal.timeout,
    }),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes(sub.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${eventId}.${stamp}.${body}`),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(raw)));
  console.info(JSON.stringify({ callback_phase: "sending" }));
  return fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    headers: {
      "content-type": "application/json",
      "webhook-id": eventId,
      "webhook-timestamp": stamp,
      "webhook-signature": `v1,${signature}`,
      "X-MCP-Subscription-Id": sub.id,
    },
    body,
  });
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function equal(a: unknown, b: unknown) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let n = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    n |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return n === 0;
}
export async function subscribe(db: D1Database, owner: string, p: Row) {
  if (
    p.name !== EVENT ||
    p.delivery?.mode !== "webhook" ||
    Object.keys(p.arguments || {}).length
  )
    fail(400, "Unsupported event arguments");
  console.info(
    JSON.stringify({ callback_host: new URL(p.delivery.url).hostname }),
  );
  const url = validateCallback(p.delivery.url);
  secretBytes(p.delivery.secret);
  const id = "sub_" + (await digest(JSON.stringify([owner, url, EVENT])));
  const sub = { id, url, secret: p.delivery.secret };
  const challenge = uid();
  let response;
  try {
    response = await signedPost(
      sub,
      { type: "verification", challenge },
      "verify_" + uid(),
    );
    console.info(JSON.stringify({ callback_verify_status: response.status }));
    const verification = (await response.json()) as Row;
    console.info(
      JSON.stringify({
        callback_response_fields: Object.keys(verification),
        callback_challenge_matches: equal(verification.challenge, challenge),
      }),
    );
    if (!response.ok || !equal(verification.challenge, challenge))
      throw new Error();
  } catch (error: any) {
    console.error(
      JSON.stringify({
        callback_exception_name: error?.name,
        callback_exception_message: String(error?.message || "")
          .replace(/https?:\/\/[^\s]+/g, "[url]")
          .slice(0, 160),
      }),
    );
    throw Object.assign(
      new Error(
        "Callback verification failed: " +
          String(error?.name || "Error") +
          ": " +
          String(error?.message || "")
            .replace(/https?:\/\/[^\s]+/g, "[url]")
            .slice(0, 160),
      ),
      { rpcCode: -32015 },
    );
  }
  const expires =
    Date.now() +
    Math.max(60000, Math.min(Number(p.ttlMs) || 86400000, 86400000));
  await run(
    db,
    "INSERT INTO subscriptions(id,owner,url,secret,expires) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,expires=excluded.expires",
    id,
    owner,
    url,
    sub.secret,
    expires,
  );
  return {
    id,
    refreshBefore: new Date(expires).toISOString(),
    cursor: null,
    truncated: false,
  };
}
export async function deliver(
  db: D1Database,
  owner: string,
  m: Row,
  origin: string,
) {
  const subs = await all(
    db,
    "SELECT * FROM subscriptions WHERE owner=? AND expires>?",
    owner,
    Date.now(),
  );
  for (const sub of subs) {
    const eid = "evt_" + (await digest(sub.id + ":" + m.id));
    await run(
      db,
      "INSERT OR IGNORE INTO deliveries(id,subscription,message,status,attempts,updated) VALUES(?,?,?,?,?,?)",
      eid,
      sub.id,
      m.id,
      "pending",
      0,
      date(),
    );
    const d = await one(db, "SELECT * FROM deliveries WHERE id=?", eid);
    if (!d || d.status === "accepted" || d.attempts >= 3) continue;
    const event = {
      eventId: eid,
      name: EVENT,
      timestamp: m.created,
      data: {
        thread_id: m.thread,
        message_id: m.id,
        url: origin + "/#" + m.thread,
      },
      cursor: null,
    };
    for (let attempt = d.attempts; attempt < 3; attempt++) {
      let status = 0;
      try {
        status = (await signedPost(sub, event, eid)).status;
      } catch {}
      await run(
        db,
        "UPDATE deliveries SET status=?,attempts=?,updated=? WHERE id=?",
        status >= 200 && status < 300 ? "accepted" : "failed",
        attempt + 1,
        date(),
        eid,
      );
      if ((status >= 200 && status < 300) || status === 410 || status === 413)
        break;
      if (attempt < 2)
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

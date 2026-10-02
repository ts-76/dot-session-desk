import type { Conversation, Session, ManageAction } from "../types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const c = new AbortController();
  const abort = () => c.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) c.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const r = await fetch(path, {
      cache: "no-store",
      signal: c.signal,
      ...(body !== undefined
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    let data;
    try {
      data = await r.json();
    } catch {
      throw new ApiError("ログイン状態または接続を確認してください", r.status);
    }
    if (!r.ok)
      throw new ApiError(
        (data as { error?: string })?.error || "処理できませんでした",
        r.status,
      );
    return data as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const deskApi = {
  list: () => request<Session[]>("/api/threads"),
  status: () => request<{ connected: boolean }>("/api/status"),
  read: (id: string, signal?: AbortSignal) =>
    request<Conversation>(
      "/api/threads/" + encodeURIComponent(id),
      undefined,
      signal,
    ),
  create: (title: string) => request<Session>("/api/threads", { title }),
  send: (id: string, text: string, messageId: string) =>
    request("/api/threads/" + encodeURIComponent(id), { text, id: messageId }),
  manage: (
    id: string,
    action: ManageAction,
    extra: Record<string, unknown> = {},
  ) =>
    request<Session>("/api/threads/" + encodeURIComponent(id) + "/manage", {
      action,
      ...extra,
    }),
};

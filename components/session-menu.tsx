"use client";
import { useRef, useState } from "react";
import type { Session, ManageAction } from "../lib/types";
export function SessionMenu({
  session,
  busy,
  onManage,
}: {
  session: Session | undefined;
  busy: boolean;
  onManage: (
    id: string,
    a: ManageAction,
    extra?: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  const menu = useRef<HTMLDetailsElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    [target, setTarget] = useState<{
      id: string;
      action: "rename" | "trash";
    } | null>(null),
    [title, setTitle] = useState(""),
    [error, setError] = useState("");
  if (!session) return null;
  function open(action: "rename" | "trash") {
    if (!session) return;
    setTarget({ id: session.id, action });
    setTitle(session.title);
    setError("");
    if (menu.current) menu.current.open = false;
    dialog.current?.showModal();
  }
  async function act(a: ManageAction, extra = {}) {
    try {
      await onManage(session!.id, a, extra);
      if (menu.current) menu.current.open = false;
    } catch {}
  }
  return (
    <>
      <details ref={menu} className="session-tools">
        <summary aria-label="セッションの操作">···</summary>
        <div className="tool-menu">
          <button disabled={busy} onClick={() => open("rename")}>
            名前を変更
          </button>
          {!session.deletedAt && (
            <>
              <button
                disabled={busy}
                onClick={() => act("pin", { value: !session.pinned })}
              >
                {session.pinned ? "ピン留めを解除" : "ピン留め"}
              </button>
              <button
                disabled={busy}
                onClick={() => act("archive", { value: !session.archived })}
              >
                {session.archived ? "アーカイブを解除" : "アーカイブ"}
              </button>
              <button disabled={busy} onClick={() => open("trash")}>
                ゴミ箱へ移動
              </button>
            </>
          )}
          {session.deletedAt && (
            <button disabled={busy} onClick={() => act("restore")}>
              復元
            </button>
          )}
        </div>
      </details>
      <dialog
        ref={dialog}
        aria-labelledby="dialog-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!target || busy) return;
            try {
              await onManage(
                target.id,
                target.action,
                target.action === "rename" ? { title } : {},
              );
              dialog.current?.close();
            } catch (e) {
              setError(e instanceof Error ? e.message : "保存できませんでした");
            }
          }}
        >
          <h2 id="dialog-title">
            {target?.action === "rename" ? "名前を変更" : "ゴミ箱へ移動"}
          </h2>
          {target?.action === "rename" ? (
            <>
              <label htmlFor="rename-title">会話の名前</label>
              <input
                id="rename-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </>
          ) : (
            <p>
              「{title}
              」をゴミ箱へ移動します。会話は残り、後から復元できます。進行中の処理は停止しません。
            </p>
          )}
          <p role="alert">{error}</p>
          <div className="dialog-actions">
            <button
              className="quiet"
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              キャンセル
            </button>
            <button
              className="action"
              disabled={busy || (target?.action === "rename" && !title.trim())}
            >
              {target?.action === "rename" ? "保存" : "ゴミ箱へ移動"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

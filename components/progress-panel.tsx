"use client";
import { useEffect, useState } from "react";
import type { SessionProgress } from "../lib/types";
import { progressLabels } from "../lib/client/progress";
import { ProgressIndicator } from "./progress-indicator";

export function ProgressPanel({
  progress,
  selected,
  loading,
  syncError,
}: {
  progress: SessionProgress | null | undefined;
  selected: string;
  loading: boolean;
  syncError: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [selected]);
  if (!selected) return null;
  const label = progress
    ? progressLabels[progress.status]
    : loading
      ? "確認中"
      : "未登録";
  function items(values: string[], empty: string) {
    return values.length ? (
      <ul>
        {values.map((value, index) => (
          <li key={index}>{value}</li>
        ))}
      </ul>
    ) : (
      <span className="progress-empty">{empty}</span>
    );
  }
  return (
    <details
      className="session-progress"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-label={
          "作業進捗: " + label + "。詳細を" + (open ? "閉じる" : "開く")
        }
      >
        <ProgressIndicator status={progress?.status} decorative />
        <span className="progress-state" data-status={progress?.status}>
          {label}
        </span>
        <span className="progress-summary-meta">
          {syncError && (
            <span className="progress-sync-warning">同期未確認</span>
          )}
          {progress && (
            <time
              dateTime={progress.updatedAt}
              aria-label={
                "最終更新 " +
                new Date(progress.updatedAt).toLocaleString("ja-JP")
              }
            >
              {new Date(progress.updatedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </span>
      </summary>
      <div
        className="progress-body"
        role="region"
        aria-label="セッションの進捗"
      >
        <p className="progress-note">dotが保存した作業進捗 · 返信状況とは別</p>
        {syncError && (
          <p className="progress-stale" role="status">
            更新を確認できません。前回取得した進捗を表示しています。
          </p>
        )}
        {progress ? (
          <>
            <dl>
              <div>
                <dt>完了したこと</dt>
                <dd>{items(progress.completed, "完了事項の登録なし")}</dd>
              </div>
              <div>
                <dt>現在の作業</dt>
                <dd>
                  {progress.current || (
                    <span className="progress-empty">現在作業の登録なし</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>ブロッカー</dt>
                <dd>{items(progress.blockers, "登録されたブロッカーなし")}</dd>
              </div>
              <div
                className={
                  progress.userActions.length ? "progress-attention" : undefined
                }
              >
                <dt>あなたの対応・判断</dt>
                <dd>{items(progress.userActions, "対応・判断の依頼なし")}</dd>
              </div>
              <div>
                <dt>次の一手</dt>
                <dd>
                  {progress.nextStep || (
                    <span className="progress-empty">次の一手の登録なし</span>
                  )}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p>
            {loading
              ? "進捗を確認中です。"
              : "進捗は未登録です。作業の完了やブロッカーを推測して表示しません。"}
          </p>
        )}
      </div>
    </details>
  );
}

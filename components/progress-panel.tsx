"use client";
import { useEffect, useState } from "react";
import type { SessionProgress } from "../lib/types";
import { progressLabels } from "../lib/client/progress";

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
    setOpen(!window.matchMedia("(max-width: 760px)").matches);
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
      <summary>
        <strong>進捗</strong>
        <span className="progress-state" data-status={progress?.status}>
          {label}
        </span>
        <span className="progress-detail-hint" aria-hidden="true">
          詳細
        </span>
      </summary>
      <div
        className="progress-body"
        role="region"
        aria-label="セッションの進捗"
      >
        <p className="progress-note">
          dotが登録した作業状況です。返信待ちとは別の情報です。
        </p>
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
            <p className="progress-updated">
              最終更新{" "}
              <time dateTime={progress.updatedAt}>
                {new Date(progress.updatedAt).toLocaleString("ja-JP")}
              </time>
            </p>
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

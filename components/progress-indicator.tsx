import type { SessionProgress } from "../lib/types";
import { progressLabels } from "../lib/client/progress";

export function ProgressIndicator({
  status,
  id,
  decorative = false,
}: {
  status?: SessionProgress["status"];
  id?: string;
  decorative?: boolean;
}) {
  const label =
    "作業進捗: " +
    (status ? progressLabels[status] : "未登録") +
    "（返信状況とは別）";
  const wave = !status || status === "in_progress";
  return (
    <span
      id={id}
      className="progress-indicator"
      data-status={status || "unregistered"}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        focusable="false"
      >
        {wave ? (
          <path
            d="M 13.80 8.00 L 13.60 8.55 L 13.10 9.01 L 12.57 9.39 L 12.25 9.76 L 12.21 10.25 L 12.32 10.89 L 12.35 11.57 L 12.10 12.10 L 11.57 12.35 L 10.89 12.32 L 10.25 12.21 L 9.76 12.25 L 9.39 12.57 L 9.01 13.10 L 8.55 13.60 L 8.00 13.80 L 7.45 13.60 L 6.99 13.10 L 6.61 12.57 L 6.24 12.25 L 5.75 12.21 L 5.11 12.32 L 4.43 12.35 L 3.90 12.10 L 3.65 11.57 L 3.68 10.89 L 3.79 10.25 L 3.75 9.76 L 3.43 9.39 L 2.90 9.01 L 2.40 8.55 L 2.20 8.00 L 2.40 7.45 L 2.90 6.99 L 3.43 6.61 L 3.75 6.24 L 3.79 5.75 L 3.68 5.11 L 3.65 4.43 L 3.90 3.90 L 4.43 3.65 L 5.11 3.68 L 5.75 3.79 L 6.24 3.75 L 6.61 3.43 L 6.99 2.90 L 7.45 2.40 L 8.00 2.20 L 8.55 2.40 L 9.01 2.90 L 9.39 3.43 L 9.76 3.75 L 10.25 3.79 L 10.89 3.68 L 11.57 3.65 L 12.10 3.90 L 12.35 4.43 L 12.32 5.11 L 12.21 5.75 L 12.25 6.24 L 12.57 6.61 L 13.10 6.99 L 13.60 7.45 L 13.80 8.00 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx="8" cy="8" r="4.5" fill="currentColor" />
        )}
      </svg>
    </span>
  );
}

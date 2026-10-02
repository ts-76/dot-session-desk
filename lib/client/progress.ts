import type { SessionProgress } from "../types";
export const progressLabels: Record<SessionProgress["status"], string> = {
  in_progress: "作業中",
  blocked: "ブロッカーあり",
  needs_input: "ユーザー判断待ち",
  complete: "完了",
  paused: "一時停止",
};

// A different symbol per state keeps meaning available without color.
export const progressSymbols: Record<
  SessionProgress["status"] | "unregistered",
  string
> = {
  complete: "✓",
  needs_input: "?",
  blocked: "!",
  in_progress: "↻",
  paused: "Ⅱ",
  unregistered: "–",
};

import type { SessionProgress } from "../types";
export const progressLabels: Record<SessionProgress["status"], string> = {
  in_progress: "作業中",
  blocked: "ブロッカーあり",
  needs_input: "ユーザー判断待ち",
  complete: "完了",
  paused: "一時停止",
};

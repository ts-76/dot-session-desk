export interface SessionProgress {
  status: "in_progress" | "blocked" | "needs_input" | "complete" | "paused";
  completed: string[];
  current: string;
  blockers: string[];
  userActions: string[];
  nextStep: string;
  version: number;
  updatedAt: string;
}
export interface Message {
  id: string;
  role: "user" | "dot";
  body: string;
  replyTo?: string | null;
  created: string;
}
export interface Session {
  id: string;
  title: string;
  created?: string;
  pinned?: number;
  archived?: number;
  deletedAt?: string | null;
  pendingCount?: number;
  lastReplyId?: string | null;
  messageCount?: number;
  progress?: SessionProgress | null;
}
export interface Conversation extends Session {
  messages: Message[];
}
export type Filter = "active" | "archived" | "trash";
export type ManageAction = "rename" | "pin" | "archive" | "trash" | "restore";

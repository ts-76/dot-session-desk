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
}
export interface Conversation extends Session {
  messages: Message[];
}
export type Filter = "active" | "archived" | "trash";
export type ManageAction = "rename" | "pin" | "archive" | "trash" | "restore";

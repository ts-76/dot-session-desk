import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const threads = sqliteTable(
  "threads",
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    title: text().notNull(),
    created: text().notNull(),
    pinned: integer().notNull().default(0),
    archived: integer().notNull().default(0),
    deletedAt: text(),
  },
  (t) => [index("threads_owner").on(t.owner)],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text().primaryKey(),
    thread: text()
      .notNull()
      .references(() => threads.id),
    owner: text().notNull(),
    role: text().notNull(),
    body: text().notNull(),
    replyTo: text(),
    followupTo: text(),
    created: text().notNull(),
  },
  (t) => [
    index("messages_thread").on(t.thread, t.created),
    uniqueIndex("messages_reply").on(t.replyTo),
  ],
);
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    url: text().notNull(),
    secret: text().notNull(),
    expires: integer().notNull(),
  },
  (t) => [index("subscriptions_owner").on(t.owner)],
);
export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text().primaryKey(),
    subscription: text().notNull(),
    message: text().notNull(),
    status: text().notNull(),
    attempts: integer().notNull().default(0),
    updated: text().notNull(),
  },
  (t) => [index("deliveries_subscription").on(t.subscription)],
);

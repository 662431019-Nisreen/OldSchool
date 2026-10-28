import { sqliteTable, text, integer, index, blob } from "drizzle-orm/sqlite-core";
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    token: text("token").notNull().unique(),
    owner: text("owner").notNull(),
    idem: text("idem").notNull().unique(),
    payload: text("payload").notNull(),
    total: integer("total").notNull(),
    status: text("status").notNull().default("waiting"),
    payment: text("payment").notNull().default("unpaid"),
    version: integer("version").notNull().default(0),
    created: text("created").notNull(),
  },
  (table) => [
    index("orders_owner_id_idx").on(table.owner, table.id),
    index("orders_created_idx").on(table.created),
  ],
);
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  salt: text("salt").notNull(),
  hash: text("hash").notNull(),
  active: integer("active").notNull().default(1),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expires: integer("expires").notNull(),
});
export const audit = sqliteTable(
  "audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    created: text("created").notNull(),
  },
  (table) => [
    index("audit_login_attempt_idx").on(
      table.action,
      table.target,
      table.created,
    ),
  ],
);
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("subscriptions_owner_idx").on(table.owner)],
);

export const pushOrderDevices = sqliteTable(
  "push_order_devices",
  {
    id: text("id").primaryKey(),
    orderId: integer("order_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    created: integer("created").notNull(),
  },
  (table) => [
    index("push_order_devices_order_subscription_idx").on(
      table.orderId,
      table.subscriptionId,
    ),
    index("push_order_devices_subscription_idx").on(table.subscriptionId),
    index("push_order_devices_created_idx").on(table.created),
  ],
);
export const pushEvents = sqliteTable(
  "push_events",
  {
    id: text("id").primaryKey(),
    orderId: integer("order_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    created: integer("created").notNull(),
    message: text("message").notNull().default(""),
  },
  (table) => [
    index("push_events_status_created_idx").on(table.status, table.created),
    index("push_events_order_created_idx").on(table.orderId, table.created),
    index("push_events_created_idx").on(table.created),
  ],
);
export const pushDeliveries = sqliteTable(
  "push_deliveries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    orderId: integer("order_id").notNull(),
    device: text("device").notNull(),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    error: text("error").notNull().default(""),
    created: integer("created").notNull(),
  },
  (table) => [
    index("push_deliveries_order_created_idx").on(table.orderId, table.created),
    index("push_deliveries_created_idx").on(table.created),
  ],
);

export const staffPushDevices = sqliteTable("staff_push_devices", {
  deviceKey: text("device_key"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  value: text("value").notNull(),
  created: integer("created").notNull(),
});

// Standalone Cloudflare Free uploads use D1 instead of an R2 subscription.
// Migration 0005 also enforces file and total limits with atomic SQL triggers.
export const uploadedImages = sqliteTable("uploaded_images", {
  key: text("key").primaryKey(),
  mime: text("mime").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  bytes: integer("bytes").notNull(),
  created: integer("created").notNull(),
});
export const imageStorage = sqliteTable("image_storage", {
  id: integer("id").primaryKey(),
  bytes: integer("bytes").notNull().default(0),
});

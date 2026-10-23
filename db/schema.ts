import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const orders = sqliteTable("orders", {
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
});
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
export const audit = sqliteTable("audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  created: text("created").notNull(),
});
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  value: text("value").notNull(),
});

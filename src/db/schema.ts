import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  unique,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["owner", "admin", "sales", "editor"]);
export const payType = pgEnum("pay_type", ["hourly", "quota", "both"]);
export const deliverableType = pgEnum("deliverable_type", ["DLP", "PPT", "COT_DLP", "COT_PPT"]);
export const itemStatus = pgEnum("item_status", [
  "available",
  "claimed",
  "in_review",
  "revision",
  "approved",
  "uploaded",
  "cancelled",
]);
export const notificationType = pgEnum("notification_type", ["revision_requested", "approved", "unapproved"]);
export const orderType = pgEnum("order_type", ["rush", "regular"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull(),
  payType: payType("pay_type").notNull(),
  // Pay rates in PHP, owner-visible only. hourlyRate applies to approved hours
  // (hourly/both staff); cycleRate applies to each completed 21-point cycle
  // (quota/both staff). A "both" staff member earns from both.
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("0"),
  cycleRate: numeric("cycle_rate", { precision: 10, scale: 2 }).notNull().default("0"),
  // Cash advance to deduct from this payout, editable by the owner. Owner-only.
  cashAdvance: numeric("cash_advance", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const terms = pgTable("terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  schoolYear: text("school_year").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(false),
});

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  shortCode: text("short_code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const termOfferings = pgTable(
  "term_offerings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    grade: integer("grade").notNull(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
  },
  (t) => [
    unique("term_offerings_term_grade_subject_key").on(t.termId, t.grade, t.subjectId),
    check("term_offerings_grade_check", sql`${t.grade} between 1 and 12`),
  ],
);

export const termWeeks = pgTable(
  "term_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    uploadDeadline: date("upload_deadline").notNull(),
  },
  (t) => [
    unique("term_weeks_term_week_key").on(t.termId, t.weekNumber),
    check("term_weeks_week_number_check", sql`${t.weekNumber} between 1 and 10`),
  ],
);

export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    grade: integer("grade").notNull(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    weekNumber: integer("week_number").notNull(),
    type: deliverableType("type").notNull(),
    status: itemStatus("status").notNull().default("available"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    dueDate: date("due_date").notNull(),
    pointsValue: numeric("points_value", { precision: 4, scale: 2 }).notNull(),
    pointsAwarded: numeric("points_awarded", { precision: 4, scale: 2 }),
    fileUrl: text("file_url"),
    notes: text("notes"),
    revisionCount: integer("revision_count").notNull().default(0),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("work_items_natural_key").on(t.termId, t.grade, t.subjectId, t.weekNumber, t.type),
    index("work_items_term_status_idx").on(t.termId, t.status),
    index("work_items_assignee_status_idx").on(t.assigneeId, t.status),
    index("work_items_term_week_grade_idx").on(t.termId, t.weekNumber, t.grade),
    check("work_items_week_number_check", sql`${t.weekNumber} between 1 and 10`),
  ],
);

export const workItemEvents = pgTable("work_item_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workItemId: uuid("work_item_id")
    .notNull()
    .references(() => workItems.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  fromStatus: itemStatus("from_status"),
  toStatus: itemStatus("to_status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotaCycles = pgTable(
  "quota_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editorId: uuid("editor_id")
      .notNull()
      .references(() => users.id),
    cycleNumber: integer("cycle_number").notNull(),
    targetPoints: numeric("target_points", { precision: 5, scale: 2 }).notNull().default("21"),
    pointsTotal: numeric("points_total", { precision: 5, scale: 2 }).notNull().default("0"),
    carriedIn: numeric("carried_in", { precision: 5, scale: 2 }).notNull().default("0"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    isClosed: boolean("is_closed").notNull().default(false),
  },
  (t) => [unique("quota_cycles_editor_cycle_key").on(t.editorId, t.cycleNumber)],
);

export const quotaCycleItems = pgTable(
  "quota_cycle_items",
  {
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => quotaCycles.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    points: numeric("points", { precision: 4, scale: 2 }).notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workItemId] })],
);

/**
 * Owner-entered manual point corrections for an editor (e.g. bonus points, or
 * docking points). Each row is applied to the editor's open quota cycle at the
 * time of entry (so completion and salary stay consistent) and kept here as an
 * audit trail: who made it, when, how much, and why. Positive adds points,
 * negative removes them.
 */
export const pointAdjustments = pgTable(
  "point_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editorId: uuid("editor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The open cycle the correction landed in, so the record ties back to a cycle.
    cycleId: uuid("cycle_id").references(() => quotaCycles.id, { onDelete: "set null" }),
    points: numeric("points", { precision: 5, scale: 2 }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("point_adjustments_editor_created_idx").on(t.editorId, t.createdAt)],
);

export const timeLogs = pgTable(
  "time_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workDate: date("work_date").notNull(),
    // Null while a clock-in session is still open; set from the clock-out
    // timestamp minus clock-in. Legacy manual entries set it directly.
    hours: numeric("hours", { precision: 5, scale: 2 }),
    clockIn: timestamp("clock_in", { withTimezone: true }),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    note: text("note"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("time_logs_hours_check", sql`${t.hours} is null or (${t.hours} > 0 and ${t.hours} <= 24)`)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    message: text("message").notNull(),
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_unread_idx").on(t.userId, t.readAt)],
);

/**
 * Customized-order (COT) requests captured from the customer Google Form.
 * Each order spawns two independent deliverables (COT_DLP and COT_PPT) in
 * custom_order_items. Kept separate from the term/week catalog in work_items.
 */
export const customOrders = pgTable("custom_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Dedupe key from the form (e.g. response timestamp) so re-posts don't double.
  externalId: text("external_id").unique(),
  customerName: text("customer_name").notNull(),
  grade: integer("grade"),
  subjectName: text("subject_name"),
  topic: text("topic"),
  competency: text("competency"),
  indicator: text("indicator"),
  // "Lesson For" from the order form — typically "Reclass" or "Demo".
  lessonFor: text("lesson_for"),
  notes: text("notes"),
  payment: numeric("payment", { precision: 10, scale: 2 }),
  orderType: orderType("order_type").notNull().default("regular"),
  orderDate: date("order_date").notNull(),
  deadline: date("deadline").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customOrderItems = pgTable(
  "custom_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => customOrders.id, { onDelete: "cascade" }),
    type: deliverableType("type").notNull(),
    status: itemStatus("status").notNull().default("available"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    fileUrl: text("file_url"),
    pointsValue: numeric("points_value", { precision: 4, scale: 2 }).notNull().default("0.5"),
    pointsAwarded: numeric("points_awarded", { precision: 4, scale: 2 }),
    // Which quota cycle the approval points landed in, so an un-approval can
    // reverse them from the right cycle.
    awardedCycleId: uuid("awarded_cycle_id").references(() => quotaCycles.id),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("custom_order_items_order_type_key").on(t.orderId, t.type)],
);

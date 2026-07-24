import type { workItems } from "@/db/schema";

export type ItemStatus = (typeof workItems.$inferSelect)["status"];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  available: "Available",
  claimed: "Claimed",
  in_review: "In review",
  revision: "Revision",
  approved: "Approved",
  uploaded: "Uploaded",
  cancelled: "Cancelled",
};

// Tailwind utility class names generated from the --color-status-* theme tokens in globals.css.
export const STATUS_DOT_CLASS: Record<ItemStatus, string> = {
  available: "bg-status-available",
  claimed: "bg-status-claimed",
  in_review: "bg-status-review",
  revision: "bg-status-review",
  approved: "bg-status-approved",
  uploaded: "bg-status-uploaded",
  cancelled: "bg-muted-foreground",
};

export const STATUS_BADGE_CLASS: Record<ItemStatus, string> = {
  available: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  claimed: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  revision: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  uploaded: "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-200 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-500",
};

export const DELIVERABLE_POINTS: Record<"DLP" | "COT", number> = {
  DLP: 1,
  COT: 0.5,
};

export const WEEK_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

export const DEFAULT_WIP_LIMIT = 5;
export const DEFAULT_QUOTA_SIZE = 21;

export const ALL_GRADES = [2, 3, 4, 5, 6, 7, 8, 10];

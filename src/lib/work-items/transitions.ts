import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems, workItemEvents, users } from "@/db/schema";
import type { AppUser } from "@/lib/auth";
import { getWipLimit } from "@/lib/settings";
import { awardPointsForApproval, reverseApprovalPoints } from "@/lib/quota/cycles";
import { createNotification } from "@/lib/notifications/create";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";

function itemLabel(item: { grade: number; weekNumber: number; type: WorkItem["type"] }) {
  return `Grade ${item.grade} Week ${item.weekNumber} ${DELIVERABLE_TYPE_LABELS[item.type]}`;
}

type WorkItem = typeof workItems.$inferSelect;

export type TransitionError =
  | { code: "not_found"; message: string }
  | { code: "forbidden"; message: string }
  | { code: "invalid"; message: string }
  | { code: "wip_limit"; message: string }
  | { code: "conflict"; message: string };

export type TransitionResult =
  | { ok: true; item: WorkItem }
  | { ok: false; error: TransitionError };

type ClaimInput = { action: "claim"; itemId: string; actor: AppUser };
type AssignInput = {
  action: "assign";
  itemId: string;
  actor: AppUser;
  assigneeId: string;
  overrideWip?: boolean;
};
type SubmitInput = {
  action: "submit";
  itemId: string;
  actor: AppUser;
  fileUrl: string;
  notes?: string;
};
type RequestRevisionInput = {
  action: "request_revision";
  itemId: string;
  actor: AppUser;
  note: string;
};
type ApproveInput = { action: "approve"; itemId: string; actor: AppUser };
type UnapproveInput = { action: "unapprove"; itemId: string; actor: AppUser };
type UploadInput = { action: "upload"; itemId: string; actor: AppUser };
type ReleaseInput = { action: "release"; itemId: string; actor: AppUser; note?: string };
type CancelInput = { action: "cancel"; itemId: string; actor: AppUser; note?: string };

export type TransitionInput =
  | ClaimInput
  | AssignInput
  | SubmitInput
  | RequestRevisionInput
  | ApproveInput
  | UnapproveInput
  | UploadInput
  | ReleaseInput
  | CancelInput;

const ADMIN_ROLES = ["owner", "admin"] as const;

function isAdmin(actor: AppUser) {
  return (ADMIN_ROLES as readonly string[]).includes(actor.role);
}

async function logEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  workItemId: string,
  actorId: string,
  fromStatus: WorkItem["status"] | null,
  toStatus: WorkItem["status"],
  note?: string | null,
) {
  await tx.insert(workItemEvents).values({
    workItemId,
    actorId,
    fromStatus,
    toStatus,
    note: note ?? null,
  });
}

async function assertUnderWipLimit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  editorId: string,
) {
  const limit = await getWipLimit(tx);
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(workItems)
    .where(and(eq(workItems.assigneeId, editorId), inArray(workItems.status, ["claimed", "revision"])));

  if (count >= limit) {
    throw new WipLimitExceeded(limit);
  }
}

class WipLimitExceeded extends Error {
  limit: number;
  constructor(limit: number) {
    super(`WIP limit of ${limit} reached`);
    this.limit = limit;
  }
}

/**
 * Single entry point for every work-item status change (spec §10: "Mutations
 * via Server Actions; all state transitions go through a single
 * transitionWorkItem() service so the event log and point logic can never be
 * bypassed"). Every branch below writes to work_item_events in the same
 * transaction as the status change.
 */
export async function transitionWorkItem(input: TransitionInput): Promise<TransitionResult> {
  try {
    return await db.transaction(async (tx) => {
      switch (input.action) {
        case "claim": {
          if (input.actor.role !== "editor") {
            return forbidden("Only editors can self-claim a work item.");
          }
          await assertUnderWipLimit(tx, input.actor.id);

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "claimed",
              assigneeId: input.actor.id,
              claimedAt: new Date(),
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.status, "available"), isNull(workItems.assigneeId)))
            .returning();

          if (!updated) {
            return await conflictMessage(tx, input.itemId);
          }
          await logEvent(tx, input.itemId, input.actor.id, "available", "claimed");
          return { ok: true, item: updated };
        }

        case "assign": {
          if (!isAdmin(input.actor)) {
            return forbidden("Only admins can assign a work item to someone else.");
          }
          if (!input.overrideWip) {
            await assertUnderWipLimit(tx, input.assigneeId);
          }

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "claimed",
              assigneeId: input.assigneeId,
              claimedAt: new Date(),
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.status, "available"), isNull(workItems.assigneeId)))
            .returning();

          if (!updated) {
            return await conflictMessage(tx, input.itemId);
          }
          await logEvent(tx, input.itemId, input.actor.id, "available", "claimed");
          return { ok: true, item: updated };
        }

        case "submit": {
          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.assigneeId !== input.actor.id) {
            return forbidden("You can only submit work items assigned to you.");
          }
          if (current.status !== "claimed" && current.status !== "revision") {
            return invalid(`Cannot submit an item in status "${current.status}".`);
          }
          if (!input.fileUrl.trim()) {
            return invalid("A file link is required to submit.");
          }

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "in_review",
              submittedAt: new Date(),
              fileUrl: input.fileUrl,
              notes: input.notes ?? current.notes,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          await logEvent(tx, input.itemId, input.actor.id, current.status, "in_review");
          return { ok: true, item: updated };
        }

        case "request_revision": {
          if (!isAdmin(input.actor)) return forbidden("Only admins can request a revision.");
          if (!input.note.trim()) return invalid("A note is required when requesting a revision.");

          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.status !== "in_review") {
            return invalid(`Cannot request revision on an item in status "${current.status}".`);
          }

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "revision",
              revisionCount: sql`${workItems.revisionCount} + 1`,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          if (current.assigneeId) {
            await createNotification(
              tx,
              current.assigneeId,
              "revision_requested",
              `Revision requested on your ${itemLabel(current)}: ${input.note}`,
              input.itemId,
            );
          }
          await logEvent(tx, input.itemId, input.actor.id, "in_review", "revision", input.note);
          return { ok: true, item: updated };
        }

        case "approve": {
          if (!isAdmin(input.actor)) return forbidden("Only admins can approve a work item.");

          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.status !== "in_review") {
            return invalid(`Cannot approve an item in status "${current.status}".`);
          }
          if (!current.assigneeId) return invalid("Cannot approve an item with no assignee.");

          // Points are awarded here, not at upload (spec §6.4 DECISION): an
          // editor's pay shouldn't depend on how fast an admin publishes.
          const [updated] = await tx
            .update(workItems)
            .set({
              status: "approved",
              approvedAt: new Date(),
              pointsAwarded: current.pointsValue,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          await awardPointsForApproval(tx, current.assigneeId, input.itemId, Number(current.pointsValue));
          await createNotification(
            tx,
            current.assigneeId,
            "approved",
            `Your ${itemLabel(current)} was approved (+${current.pointsValue} pts).`,
            input.itemId,
          );
          await logEvent(tx, input.itemId, input.actor.id, "in_review", "approved");
          return { ok: true, item: updated };
        }

        case "unapprove": {
          if (!isAdmin(input.actor)) return forbidden("Only admins can un-approve a work item.");

          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.status !== "approved") {
            return invalid(`Cannot un-approve an item in status "${current.status}".`);
          }

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "in_review",
              approvedAt: null,
              pointsAwarded: null,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          await reverseApprovalPoints(tx, input.itemId);
          if (current.assigneeId) {
            await createNotification(
              tx,
              current.assigneeId,
              "unapproved",
              `Approval reversed on your ${itemLabel(current)}. It's back in review.`,
              input.itemId,
            );
          }
          await logEvent(tx, input.itemId, input.actor.id, "approved", "in_review", "Approval reversed.");
          return { ok: true, item: updated };
        }

        case "upload": {
          if (!isAdmin(input.actor)) return forbidden("Only admins can mark a work item as uploaded.");

          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.status !== "approved") {
            return invalid(`Cannot mark an item in status "${current.status}" as uploaded.`);
          }

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "uploaded",
              uploadedAt: new Date(),
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          await logEvent(tx, input.itemId, input.actor.id, "approved", "uploaded");
          return { ok: true, item: updated };
        }

        case "release": {
          if (!isAdmin(input.actor)) return forbidden("Only admins can release a work item.");

          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.status === "available" || current.status === "cancelled") {
            return invalid(`Item is already in status "${current.status}".`);
          }

          const [updated] = await tx
            .update(workItems)
            .set({
              status: "available",
              assigneeId: null,
              claimedAt: null,
              submittedAt: null,
              approvedAt: null,
              uploadedAt: null,
              pointsAwarded: null,
              version: sql`${workItems.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          if (current.status === "approved" || current.status === "uploaded") {
            await reverseApprovalPoints(tx, input.itemId);
          }
          await logEvent(tx, input.itemId, input.actor.id, current.status, "available", input.note);
          return { ok: true, item: updated };
        }

        case "cancel": {
          if (!isAdmin(input.actor)) return forbidden("Only admins can cancel a work item.");

          const current = await tx.query.workItems.findFirst({ where: eq(workItems.id, input.itemId) });
          if (!current) return notFound();
          if (current.status === "uploaded" || current.status === "cancelled") {
            return invalid(`Cannot cancel an item in status "${current.status}".`);
          }

          const [updated] = await tx
            .update(workItems)
            .set({ status: "cancelled", version: sql`${workItems.version} + 1`, updatedAt: new Date() })
            .where(and(eq(workItems.id, input.itemId), eq(workItems.version, current.version)))
            .returning();

          if (!updated) return await conflictMessage(tx, input.itemId);
          await logEvent(tx, input.itemId, input.actor.id, current.status, "cancelled", input.note);
          return { ok: true, item: updated };
        }
      }
    });
  } catch (err) {
    if (err instanceof WipLimitExceeded) {
      return {
        ok: false,
        error: { code: "wip_limit", message: `You already have ${err.limit} items in progress. Finish or release one before claiming another.` },
      };
    }
    throw err;
  }
}

function forbidden(message: string): TransitionResult {
  return { ok: false, error: { code: "forbidden", message } };
}
function invalid(message: string): TransitionResult {
  return { ok: false, error: { code: "invalid", message } };
}
function notFound(): TransitionResult {
  return { ok: false, error: { code: "not_found", message: "Work item not found." } };
}

async function conflictMessage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  itemId: string,
): Promise<TransitionResult> {
  const current = await tx
    .select({ status: workItems.status, assigneeName: users.fullName })
    .from(workItems)
    .leftJoin(users, eq(users.id, workItems.assigneeId))
    .where(eq(workItems.id, itemId))
    .limit(1);

  const row = current[0];
  if (!row) return notFound();

  const who = row.assigneeName ? ` by ${row.assigneeName}` : "";
  return {
    ok: false,
    error: {
      code: "conflict",
      message: `This item was already ${row.status === "claimed" ? "claimed" : "updated"}${who}. Refresh the board to see the latest state.`,
    },
  };
}

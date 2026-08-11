import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrders, customOrderItems } from "@/db/schema";
import { awardPointsForCotItem, reverseCotItemPoints } from "@/lib/quota/cycles";
import { computeDeadline, type OrderType } from "@/lib/cot/deadline";
import { DELIVERABLE_POINTS } from "@/lib/constants";

export type CotActor = { id: string; role: "owner" | "admin" | "sales" | "editor" };

function isAdmin(role: string) {
  return role === "owner" || role === "admin";
}

export type CreateCotOrderInput = {
  externalId?: string | null;
  customerName: string;
  grade?: number | null;
  subjectName?: string | null;
  topic?: string | null;
  competency?: string | null;
  indicator?: string | null;
  lessonFor?: string | null;
  notes?: string | null;
  payment?: number | null;
  orderType: OrderType;
  orderDate: string; // YYYY-MM-DD
};

export type CotResult = { ok: true; id?: string } | { ok: false; message: string };

/**
 * Creates a COT order and its two deliverables (COT_DLP + COT_PPT). Idempotent
 * on externalId so a re-sent form response doesn't duplicate the order.
 */
export async function createCotOrder(input: CreateCotOrderInput): Promise<CotResult> {
  if (!input.customerName?.trim()) return { ok: false, message: "Customer name is required." };
  if (!input.orderDate) return { ok: false, message: "Order date is required." };

  if (input.externalId) {
    const [existing] = await db
      .select({ id: customOrders.id })
      .from(customOrders)
      .where(eq(customOrders.externalId, input.externalId))
      .limit(1);
    if (existing) {
      // Already imported. Re-running the backfill after adding a new form
      // column (e.g. "Lesson For") should fill that value in on existing
      // orders — but must NOT disturb the deliverables, their statuses, or
      // any admin edits to grade/subject/topic. So we only sync lessonFor.
      await db
        .update(customOrders)
        .set({ lessonFor: input.lessonFor ?? null })
        .where(eq(customOrders.id, existing.id));
      return { ok: true, id: existing.id };
    }
  }

  const deadline = computeDeadline(input.orderDate, input.orderType);

  const id = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(customOrders)
      .values({
        externalId: input.externalId ?? null,
        customerName: input.customerName.trim(),
        grade: input.grade ?? null,
        subjectName: input.subjectName ?? null,
        topic: input.topic ?? null,
        competency: input.competency ?? null,
        indicator: input.indicator ?? null,
        lessonFor: input.lessonFor ?? null,
        notes: input.notes ?? null,
        payment: input.payment != null ? String(input.payment) : null,
        orderType: input.orderType,
        orderDate: input.orderDate,
        deadline,
      })
      .returning({ id: customOrders.id });

    await tx.insert(customOrderItems).values([
      { orderId: order.id, type: "COT_DLP", pointsValue: String(DELIVERABLE_POINTS.COT_DLP) },
      { orderId: order.id, type: "COT_PPT", pointsValue: String(DELIVERABLE_POINTS.COT_PPT) },
    ]);

    return order.id;
  });

  return { ok: true, id };
}

/** Atomically claims an available COT item for the actor (no double-assignment). */
export async function claimCotItem(itemId: string, actor: CotActor): Promise<CotResult> {
  const result = await db
    .update(customOrderItems)
    .set({ status: "claimed", assigneeId: actor.id, claimedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customOrderItems.id, itemId), eq(customOrderItems.status, "available")))
    .returning({ id: customOrderItems.id });

  if (result.length === 0) return { ok: false, message: "That item was just claimed by someone else." };
  return { ok: true };
}

/** Owner/admin deletes an order (and its two items). Any awarded points are reversed first. */
export async function deleteCotOrder(orderId: string, actor: CotActor): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can delete an order." };

  return db.transaction(async (tx) => {
    const items = await tx.select().from(customOrderItems).where(eq(customOrderItems.orderId, orderId));
    for (const it of items) {
      if (it.status === "approved" && it.awardedCycleId && it.pointsAwarded) {
        await reverseCotItemPoints(tx, it.awardedCycleId, Number(it.pointsAwarded));
      }
    }
    // custom_order_items rows cascade away with the order.
    await tx.delete(customOrders).where(eq(customOrders.id, orderId));
    return { ok: true };
  });
}

/** Owner/admin switches an order between Rush and Regular, recomputing the deadline. */
export async function setCotOrderType(orderId: string, type: OrderType, actor: CotActor): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can change the order type." };

  const [order] = await db.select().from(customOrders).where(eq(customOrders.id, orderId)).limit(1);
  if (!order) return { ok: false, message: "Order not found." };

  await db
    .update(customOrders)
    .set({ orderType: type, deadline: computeDeadline(order.orderDate, type) })
    .where(eq(customOrders.id, orderId));
  return { ok: true };
}

/** Owner/admin edits an order's grade, subject, topic, and lesson-for (customers sometimes revise). */
export async function updateCotOrderDetails(
  orderId: string,
  patch: {
    grade: number | null;
    subjectName: string | null;
    topic: string | null;
    lessonFor: string | null;
    deadline?: string | null;
    workKind?: "new" | "align";
  },
  actor: CotActor,
): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can edit an order." };
  if (patch.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(patch.deadline)) {
    return { ok: false, message: "Invalid deadline." };
  }

  await db
    .update(customOrders)
    .set({
      grade: patch.grade,
      subjectName: patch.subjectName,
      topic: patch.topic,
      lessonFor: patch.lessonFor,
      // Only overwrite the deadline / work kind when provided.
      ...(patch.deadline ? { deadline: patch.deadline } : {}),
      ...(patch.workKind ? { workKind: patch.workKind } : {}),
    })
    .where(eq(customOrders.id, orderId));
  return { ok: true };
}

/** Owner/admin assigns (or reassigns) an editor to a COT item directly. */
export async function assignCotItem(itemId: string, editorId: string, actor: CotActor): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can assign." };
  if (!editorId) return { ok: false, message: "Choose an editor to assign." };

  const [item] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, itemId)).limit(1);
  if (!item) return { ok: false, message: "Item not found." };
  if (item.status === "approved") return { ok: false, message: "This item is already approved." };

  await db
    .update(customOrderItems)
    .set({ status: "claimed", assigneeId: editorId, claimedAt: new Date(), updatedAt: new Date() })
    .where(eq(customOrderItems.id, itemId));
  return { ok: true };
}

/** Releases a claimed item back to available (assignee or admin). */
export async function releaseCotItem(itemId: string, actor: CotActor): Promise<CotResult> {
  const [item] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, itemId)).limit(1);
  if (!item) return { ok: false, message: "Item not found." };
  if (item.assigneeId !== actor.id && !isAdmin(actor.role)) {
    return { ok: false, message: "You can only release your own item." };
  }
  if (item.status !== "claimed" && item.status !== "in_review") {
    return { ok: false, message: "Only a claimed item can be released." };
  }

  await db
    .update(customOrderItems)
    .set({ status: "available", assigneeId: null, claimedAt: null, submittedAt: null, fileUrl: null, updatedAt: new Date() })
    .where(eq(customOrderItems.id, itemId));
  return { ok: true };
}

/** Submits a claimed item for review with the finished file (assignee only). */
export async function submitCotItem(itemId: string, actor: CotActor, fileUrl: string): Promise<CotResult> {
  if (!fileUrl?.trim()) return { ok: false, message: "A file link is required to submit." };
  const [item] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, itemId)).limit(1);
  if (!item) return { ok: false, message: "Item not found." };
  if (item.assigneeId !== actor.id) return { ok: false, message: "Only the assignee can submit this item." };
  if (item.status !== "claimed" && item.status !== "revision") {
    return { ok: false, message: "Only a claimed item can be submitted." };
  }

  await db
    .update(customOrderItems)
    .set({ status: "in_review", submittedAt: new Date(), fileUrl: fileUrl.trim(), updatedAt: new Date() })
    .where(eq(customOrderItems.id, itemId));
  return { ok: true };
}

/** Approves a submitted item and awards its points into the assignee's quota cycle (admin only). */
export async function approveCotItem(itemId: string, actor: CotActor): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can approve." };

  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(customOrderItems).where(eq(customOrderItems.id, itemId)).limit(1);
    if (!item) return { ok: false, message: "Item not found." };
    if (item.status !== "in_review") return { ok: false, message: "Only a submitted item can be approved." };
    if (!item.assigneeId) return { ok: false, message: "This item has no assignee." };

    const points = Number(item.pointsValue);
    const cycleId = await awardPointsForCotItem(tx, item.assigneeId, points);

    await tx
      .update(customOrderItems)
      .set({
        status: "approved",
        approvedAt: new Date(),
        pointsAwarded: String(points),
        awardedCycleId: cycleId,
        updatedAt: new Date(),
      })
      .where(eq(customOrderItems.id, itemId));

    return { ok: true };
  });
}

/** Sends a submitted COT deliverable back to its assignee for revision (admin only). */
export async function requestCotRevisionItem(itemId: string, actor: CotActor): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can request revisions." };

  const [item] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, itemId)).limit(1);
  if (!item) return { ok: false, message: "Item not found." };
  if (item.status !== "in_review") return { ok: false, message: "Only a submitted item can be sent back." };

  await db.update(customOrderItems).set({ status: "revision", updatedAt: new Date() }).where(eq(customOrderItems.id, itemId));
  return { ok: true };
}

/** Reverses an approval and its points (admin only). */
export async function unapproveCotItem(itemId: string, actor: CotActor): Promise<CotResult> {
  if (!isAdmin(actor.role)) return { ok: false, message: "Only owners and admins can un-approve." };

  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(customOrderItems).where(eq(customOrderItems.id, itemId)).limit(1);
    if (!item) return { ok: false, message: "Item not found." };
    if (item.status !== "approved") return { ok: false, message: "Only an approved item can be un-approved." };

    if (item.awardedCycleId && item.pointsAwarded) {
      await reverseCotItemPoints(tx, item.awardedCycleId, Number(item.pointsAwarded));
    }

    await tx
      .update(customOrderItems)
      .set({ status: "in_review", approvedAt: null, pointsAwarded: null, awardedCycleId: null, updatedAt: new Date() })
      .where(eq(customOrderItems.id, itemId));

    return { ok: true };
  });
}

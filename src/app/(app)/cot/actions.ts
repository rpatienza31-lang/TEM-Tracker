"use server";

import { revalidatePath } from "next/cache";

import { requireRole, requireUser } from "@/lib/auth";
import {
  approveCotItem,
  assignCotItem,
  backjobCotItem,
  claimCotItem,
  createCotOrder,
  deleteCotOrder,
  releaseCotItem,
  requestCotRevisionItem,
  setCotOrderType,
  submitCotItem,
  unapproveCotItem,
  updateCotOrderDetails,
  type CotResult,
} from "@/lib/cot/service";
import { type OrderType } from "@/lib/cot/deadline";

function actorOf(user: Awaited<ReturnType<typeof requireUser>>) {
  return { id: user.id, role: user.role };
}

export type NewCotState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Owner/admin manually adds a COT order that didn't come through the sheet
 * intake (e.g. a missed or rejected form row). Mirrors the intake fields.
 */
export async function createCotOrderAction(_prev: NewCotState, formData: FormData): Promise<NewCotState> {
  await requireRole("owner", "admin");
  const customerName = String(formData.get("customerName") ?? "").trim();
  const orderDate = String(formData.get("orderDate") ?? "").trim();
  if (!customerName) return { status: "error", message: "Customer name is required." };
  if (!orderDate) return { status: "error", message: "Order date is required." };

  const gradeRaw = String(formData.get("grade") ?? "").trim();
  const lessonForRaw = String(formData.get("lessonFor") ?? "").trim();

  const result = await createCotOrder({
    customerName,
    grade: gradeRaw ? Number(gradeRaw) : null,
    subjectName: String(formData.get("subjectName") ?? "").trim() || null,
    topic: String(formData.get("topic") ?? "").trim() || null,
    competency: String(formData.get("competency") ?? "").trim() || null,
    indicator: String(formData.get("indicator") ?? "").trim() || null,
    lessonFor: lessonForRaw || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    orderType: (String(formData.get("orderType") ?? "regular") as OrderType) === "rush" ? "rush" : "regular",
    orderDate,
  });

  if (!result.ok) return { status: "error", message: result.message ?? "Could not add the order." };
  revalidatePath("/cot");
  revalidatePath("/schedule");
  return { status: "ok", message: `Added COT order for ${customerName}.` };
}

export async function claimCotAction(itemId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await claimCotItem(itemId, actorOf(user));
  if (result.ok) revalidatePath("/cot");
  return result;
}

export async function deleteCotOrderAction(orderId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await deleteCotOrder(orderId, actorOf(user));
  if (result.ok) {
    revalidatePath("/cot");
    revalidatePath("/cot/library");
    revalidatePath("/productivity");
  }
  return result;
}

export async function setCotOrderTypeAction(orderId: string, type: OrderType): Promise<CotResult> {
  const user = await requireUser();
  const result = await setCotOrderType(orderId, type, actorOf(user));
  if (result.ok) revalidatePath("/cot");
  return result;
}

export async function updateCotOrderAction(
  orderId: string,
  grade: number | null,
  subjectName: string | null,
  topic: string | null,
  lessonFor: string | null,
  deadline?: string | null,
  workKind?: "new" | "align",
): Promise<CotResult> {
  const user = await requireUser();
  const result = await updateCotOrderDetails(
    orderId,
    { grade, subjectName, topic, lessonFor, deadline, workKind },
    actorOf(user),
  );
  if (result.ok) {
    revalidatePath("/cot");
    revalidatePath("/cot/library");
    // The deadline drives the Project Schedule.
    revalidatePath("/schedule");
  }
  return result;
}

export async function assignCotAction(itemId: string, editorId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await assignCotItem(itemId, editorId, actorOf(user));
  if (result.ok) revalidatePath("/cot");
  return result;
}

export async function releaseCotAction(itemId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await releaseCotItem(itemId, actorOf(user));
  if (result.ok) revalidatePath("/cot");
  return result;
}

export async function submitCotAction(itemId: string, fileUrl: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await submitCotItem(itemId, actorOf(user), fileUrl);
  if (result.ok) revalidatePath("/cot");
  return result;
}

export async function approveCotAction(itemId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await approveCotItem(itemId, actorOf(user));
  if (result.ok) {
    revalidatePath("/cot");
    revalidatePath("/cot/library");
    revalidatePath("/productivity");
    revalidatePath("/review");
  }
  return result;
}

export async function requestCotRevisionAction(itemId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await requestCotRevisionItem(itemId, actorOf(user));
  if (result.ok) {
    revalidatePath("/cot");
    revalidatePath("/review");
  }
  return result;
}

export async function backjobCotAction(itemId: string, newDate: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await backjobCotItem(itemId, actorOf(user), newDate || null);
  if (result.ok) {
    revalidatePath("/cot");
    revalidatePath("/cot/library");
    revalidatePath("/schedule");
    revalidatePath("/review");
    revalidatePath("/productivity");
  }
  return result;
}

export async function unapproveCotAction(itemId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await unapproveCotItem(itemId, actorOf(user));
  if (result.ok) {
    revalidatePath("/cot");
    revalidatePath("/cot/library");
    revalidatePath("/productivity");
  }
  return result;
}

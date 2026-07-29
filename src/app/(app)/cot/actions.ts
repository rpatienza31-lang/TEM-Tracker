"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  approveCotItem,
  assignCotItem,
  claimCotItem,
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
): Promise<CotResult> {
  const user = await requireUser();
  const result = await updateCotOrderDetails(orderId, { grade, subjectName, topic }, actorOf(user));
  if (result.ok) revalidatePath("/cot");
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

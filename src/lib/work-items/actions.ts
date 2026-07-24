"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { transitionWorkItem, type TransitionResult } from "@/lib/work-items/transitions";

function refresh() {
  revalidatePath("/board");
  revalidatePath("/matrix");
  revalidatePath("/my-work");
  revalidatePath("/review");
  revalidatePath("/productivity");
  revalidatePath("/");
}

export async function claimItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "claim", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function assignItemAction(
  itemId: string,
  assigneeId: string,
  overrideWip = false,
): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "assign", itemId, actor, assigneeId, overrideWip });
  if (result.ok) refresh();
  return result;
}

export async function releaseItemAction(itemId: string, note?: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "release", itemId, actor, note });
  if (result.ok) refresh();
  return result;
}

export async function submitItemAction(
  itemId: string,
  data: { dlpUrl: string; pptUrl?: string; notes?: string },
): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "submit", itemId, actor, ...data });
  if (result.ok) refresh();
  return result;
}

export async function requestRevisionAction(itemId: string, note: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "request_revision", itemId, actor, note });
  if (result.ok) refresh();
  return result;
}

export async function approveItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "approve", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function unapproveItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "unapprove", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function uploadItemAction(itemId: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "upload", itemId, actor });
  if (result.ok) refresh();
  return result;
}

export async function cancelItemAction(itemId: string, note?: string): Promise<TransitionResult> {
  const actor = await requireUser();
  const result = await transitionWorkItem({ action: "cancel", itemId, actor, note });
  if (result.ok) refresh();
  return result;
}

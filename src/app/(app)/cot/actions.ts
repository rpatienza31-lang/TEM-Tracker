"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  approveCotItem,
  claimCotItem,
  releaseCotItem,
  submitCotItem,
  unapproveCotItem,
  type CotResult,
} from "@/lib/cot/service";

function actorOf(user: Awaited<ReturnType<typeof requireUser>>) {
  return { id: user.id, role: user.role };
}

export async function claimCotAction(itemId: string): Promise<CotResult> {
  const user = await requireUser();
  const result = await claimCotItem(itemId, actorOf(user));
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

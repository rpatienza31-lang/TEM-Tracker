"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/queries";

export async function markNotificationReadAction(notificationId: string) {
  const actor = await requireUser();
  await markNotificationRead(actor.id, notificationId);
  revalidatePath("/");
}

export async function markAllNotificationsReadAction() {
  const actor = await requireUser();
  await markAllNotificationsRead(actor.id);
  revalidatePath("/");
}

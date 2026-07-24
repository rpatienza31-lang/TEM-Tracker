import { db } from "@/db/client";
import { notifications } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createNotification(
  tx: Tx,
  userId: string,
  type: (typeof notifications.$inferInsert)["type"],
  message: string,
  workItemId?: string,
) {
  await tx.insert(notifications).values({ userId, type, message, workItemId: workItemId ?? null });
}

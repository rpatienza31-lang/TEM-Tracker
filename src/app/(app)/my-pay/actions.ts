"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { confirmPaymentReceived } from "@/lib/payroll/payments";

/** The signed-in employee confirms they received one of their own payouts. */
export async function confirmPaymentReceivedAction(paymentId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const result = await confirmPaymentReceived(paymentId, user.id);
  if (result.ok) {
    revalidatePath("/my-pay");
    revalidatePath("/payroll/history");
  }
  return result;
}

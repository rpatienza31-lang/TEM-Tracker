import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { getPaymentHistory } from "@/lib/payroll/payments";
import { PaymentHistoryList } from "./history-list";

export default async function PaymentHistoryPage() {
  await requireRole("owner");
  const payments = await getPaymentHistory();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Payment history</h1>
          <p className="text-sm text-muted-foreground">
            Every recorded quota payout — who was paid, when, how much, and the projects it covered. Search a name to
            check whether someone has already been paid.
          </p>
        </div>
        <Link href="/payroll" className="text-sm text-primary underline">
          ← Back to Payroll
        </Link>
      </div>

      <PaymentHistoryList payments={payments} />
    </div>
  );
}

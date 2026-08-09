import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { getPayrollReport } from "@/lib/payroll/report";
import { renderPayslipHtml } from "@/lib/payroll/payslip-html";
import { buildPayslipDetail } from "@/lib/payroll/payslip-detail";
import { PrintButton } from "./print-button";
import { EmailPayslipButton } from "./email-button";

type SearchParams = { from?: string; to?: string };

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("owner");
  const { userId } = await params;
  const sp = await searchParams;
  const defaults = defaultRange();
  const from = sp.from || defaults.from;
  const to = sp.to || defaults.to;

  const report = await getPayrollReport(from, to);
  const slip = report.payslips.find((p) => p.userId === userId);
  const quota = report.quotaRows.find((r) => r.userId === userId);
  const hourly = report.hourlyRows.find((r) => r.userId === userId);

  if (!slip) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          No payslip for this staff member in {from} → {to}.
        </p>
        <Link href="/payroll" className="text-sm text-primary underline">
          Back to Payroll
        </Link>
      </div>
    );
  }

  const { hourlySessions, quotaItems } = await buildPayslipDetail({ userId, from, to, quota, hourly, slip });

  const html = renderPayslipHtml({
    fullName: slip.fullName,
    from,
    to,
    quota: quota
      ? { points: quota.pointsUnpaid, perSubjectRate: quota.perSubjectRate, amount: slip.quotaSalary }
      : undefined,
    hourly: hourly ? { hours: hourly.hoursUnpaid, rate: hourly.rate, amount: slip.hourlySalary } : undefined,
    gross: slip.gross,
    cashAdvance: slip.cashAdvance,
    net: slip.net,
    hourlySessions,
    quotaItems,
  });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/payroll" className="text-sm text-primary underline">
          ← Back to Payroll
        </Link>
        <div className="flex items-center gap-2">
          <EmailPayslipButton userId={userId} from={from} to={to} />
          <PrintButton />
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { getPayrollReport } from "@/lib/payroll/report";
import { renderPayslipHtml } from "@/lib/payroll/payslip-html";
import { buildPayslipDetail } from "@/lib/payroll/payslip-detail";
import { PrintButton } from "./print-button";
import { EmailPayslipButton } from "./email-button";

type SearchParams = { from?: string; to?: string; include?: string };

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
  // What to pay this period: both, quota only, or hourly only.
  const include = sp.include === "quota" || sp.include === "hourly" ? sp.include : "both";
  const includeQuota = include !== "hourly";
  const includeHourly = include !== "quota";

  const report = await getPayrollReport(from, to);
  const slip = report.payslips.find((p) => p.userId === userId);
  const quota = includeQuota ? report.quotaRows.find((r) => r.userId === userId) : undefined;
  const hourly = includeHourly ? report.hourlyRows.find((r) => r.userId === userId) : undefined;

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

  // Recompute the totals for the chosen components so an hourly-only (or
  // quota-only) slip pays exactly that.
  const quotaAmount = includeQuota ? slip.quotaSalary : 0;
  const hourlyAmount = includeHourly ? slip.hourlySalary : 0;
  const gross = quotaAmount + hourlyAmount;
  const net = gross - slip.cashAdvance;

  const html = renderPayslipHtml({
    fullName: slip.fullName,
    from,
    to,
    quota: quota
      ? { points: quota.pointsPayable, perSubjectRate: quota.perSubjectRate, amount: quotaAmount }
      : undefined,
    hourly: hourly ? { hours: hourly.hoursUnpaid, rate: hourly.rate, amount: hourlyAmount } : undefined,
    gross,
    cashAdvance: slip.cashAdvance,
    net,
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
          <EmailPayslipButton userId={userId} from={from} to={to} include={include} />
          <PrintButton />
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

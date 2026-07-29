import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { getPayrollReport } from "@/lib/payroll/report";
import { PrintButton } from "./print-button";

type SearchParams = { from?: string; to?: string };

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

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
        <p className="text-sm text-muted-foreground">No payslip for this staff member in {from} → {to}.</p>
        <Link href="/payroll" className="text-sm text-primary underline">
          Back to Payroll
        </Link>
      </div>
    );
  }

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/payroll" className="text-sm text-primary underline">
          ← Back to Payroll
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border p-6">
        <div className="border-b pb-4">
          <h1 className="text-lg font-semibold">TEM — Teacher Eva &amp; Manuel Educational Services</h1>
          <p className="text-sm text-muted-foreground">Payslip</p>
        </div>

        <div className="grid grid-cols-2 gap-2 py-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Employee</p>
            <p className="font-medium">{slip.fullName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pay period</p>
            <p className="font-medium">{from} → {to}</p>
          </div>
        </div>

        <div className="border-t py-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Earnings</p>
          {quota && quota.cyclesCompleted > 0 && (
            <Row
              label={`Quota — ${quota.cyclesCompleted} cycle(s) × ${peso.format(quota.rate)}`}
              value={peso.format(slip.quotaSalary)}
            />
          )}
          {hourly && hourly.approvedHours > 0 && (
            <Row
              label={`Hourly — ${hourly.approvedHours.toFixed(2)} hr × ${peso.format(hourly.rate)}`}
              value={peso.format(slip.hourlySalary)}
            />
          )}
          {slip.quotaSalary === 0 && slip.hourlySalary === 0 && (
            <p className="text-muted-foreground">No earnings recorded this period.</p>
          )}
          <div className="mt-1 border-t pt-1">
            <Row label="Gross pay" value={peso.format(slip.gross)} strong />
          </div>
        </div>

        <div className="border-t py-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Deductions</p>
          <Row label="Cash advance (CA)" value={`− ${peso.format(slip.cashAdvance)}`} />
        </div>

        <div className="border-t-2 border-foreground py-3">
          <Row label="NET PAY" value={peso.format(slip.net)} strong />
        </div>

        <p className="pt-2 text-xs text-muted-foreground">
          Generated {new Date().toISOString().slice(0, 10)}. Amounts in Philippine peso.
        </p>
      </div>
    </div>
  );
}

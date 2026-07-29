import { formatInTimeZone } from "date-fns-tz";

import { requireRole } from "@/lib/auth";
import { getActiveClockIns, getPendingTimeLogs } from "@/lib/time-logs/queries";
import { getPayrollReport } from "@/lib/payroll/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingApprovals } from "./pending-approvals";
import { ActiveClockIns } from "./active-clock-ins";
import { RateCell } from "./rate-cell";
import { CashAdvanceCell } from "./cash-advance-cell";

type SearchParams = { from?: string; to?: string };

const PH_TZ = "Asia/Manila";
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const phTime = (d: Date | null) => (d ? formatInTimeZone(new Date(d), PH_TZ, "h:mm a") : null);

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole("owner", "admin");
  const isOwner = user.role === "owner";
  const sp = await searchParams;
  const defaults = defaultRange();
  const from = sp.from || defaults.from;
  const to = sp.to || defaults.to;

  const [pending, report, activeClockIns] = await Promise.all([
    getPendingTimeLogs(),
    getPayrollReport(from, to),
    getActiveClockIns(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Payroll Period</h1>
        <p className="text-sm text-muted-foreground">
          Quota staff show cycles completed, points earned, and remainder carried; hourly staff show approved hours.
          {isOwner && " Salary is computed from each staff member's rate."}
        </p>
      </div>

      <ActiveClockIns
        active={activeClockIns
          .filter((a) => a.clockIn)
          .map((a) => ({
            id: a.id,
            userName: a.userName,
            clockInIso: new Date(a.clockIn as Date).toISOString(),
            clockInLabel: formatInTimeZone(new Date(a.clockIn as Date), PH_TZ, "MMM d, h:mm a"),
          }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Time logs awaiting approval ({pending.length})</h2>
        <PendingApprovals
          logs={pending.map((p) => ({
            id: p.id,
            userName: p.userName,
            workDate: p.workDate,
            timeIn: phTime(p.clockIn),
            timeOut: phTime(p.clockOut),
            hours: p.hours,
            note: p.note,
          }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Payroll report</h2>
          {isOwner && (
            <Card className="min-w-[180px]">
              <CardHeader className="pb-1">
                <CardDescription>Total salary this period</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{peso.format(report.totalSalary)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {from} → {to}
              </CardContent>
            </Card>
          )}
        </div>

        <form className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="from">
              From
            </label>
            <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="to">
              To
            </label>
            <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
          </div>
          <Button type="submit" variant="secondary">
            Update
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/payroll/export?from=${from}&to=${to}`}>Export CSV</a>
          </Button>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Quota staff</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Cycles completed</TableHead>
                <TableHead>Points earned</TableHead>
                <TableHead>Remainder carried</TableHead>
                {isOwner && <TableHead>Rate (₱ / cycle)</TableHead>}
                {isOwner && <TableHead className="text-right">Salary</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.quotaRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>{row.fullName}</TableCell>
                  <TableCell>{row.cyclesCompleted}</TableCell>
                  <TableCell>{row.pointsEarned.toFixed(1)}</TableCell>
                  <TableCell>{row.remainderCarried.toFixed(1)}</TableCell>
                  {isOwner && (
                    <TableCell>
                      <RateCell userId={row.userId} rate={row.rate} field="cycle" />
                    </TableCell>
                  )}
                  {isOwner && <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>}
                </TableRow>
              ))}
              {report.quotaRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isOwner ? 6 : 4} className="text-center text-muted-foreground">
                    No editors yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Hourly staff</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Approved hours</TableHead>
                {isOwner && <TableHead>Rate (₱ / hour)</TableHead>}
                {isOwner && <TableHead className="text-right">Salary</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.hourlyRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>{row.fullName}</TableCell>
                  <TableCell>{row.approvedHours.toFixed(2)}</TableCell>
                  {isOwner && (
                    <TableCell>
                      <RateCell userId={row.userId} rate={row.rate} field="hourly" />
                    </TableCell>
                  )}
                  {isOwner && <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>}
                </TableRow>
              ))}
              {report.hourlyRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isOwner ? 4 : 2} className="text-center text-muted-foreground">
                    No hourly staff yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {isOwner && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Payslips</h2>
              <p className="text-sm text-muted-foreground">
                Gross combines quota and hourly pay; net is gross minus the editable cash advance (CA).
              </p>
            </div>
            <Card className="min-w-[180px]">
              <CardHeader className="pb-1">
                <CardDescription>Total net this period</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{peso.format(report.totalNet)}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {from} → {to}
              </CardContent>
            </Card>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quota</TableHead>
                <TableHead className="text-right">Hourly</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead>Cash advance (CA)</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.payslips.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell>{p.fullName}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso.format(p.quotaSalary)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso.format(p.hourlySalary)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso.format(p.gross)}</TableCell>
                  <TableCell>
                    <CashAdvanceCell userId={p.userId} amount={p.cashAdvance} />
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{peso.format(p.net)}</TableCell>
                  <TableCell>
                    <a
                      href={`/payroll/payslip/${p.userId}?from=${from}&to=${to}`}
                      target="_blank"
                      rel="noopener"
                      className="text-sm text-primary underline"
                    >
                      Payslip
                    </a>
                  </TableCell>
                </TableRow>
              ))}
              {report.payslips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No payslips for this period yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

import { requireRole } from "@/lib/auth";
import { getPendingTimeLogs } from "@/lib/time-logs/queries";
import { getPayrollReport } from "@/lib/payroll/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PendingApprovals } from "./pending-approvals";

type SearchParams = { from?: string; to?: string };

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("owner", "admin");
  const sp = await searchParams;
  const defaults = defaultRange();
  const from = sp.from || defaults.from;
  const to = sp.to || defaults.to;

  const [pending, report] = await Promise.all([getPendingTimeLogs(), getPayrollReport(from, to)]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Payroll Period</h1>
        <p className="text-sm text-muted-foreground">
          Quota staff show cycles completed, points earned, and remainder carried; hourly staff show approved hours.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Time logs awaiting approval ({pending.length})</h2>
        <PendingApprovals
          logs={pending.map((p) => ({ id: p.id, userName: p.userName, workDate: p.workDate, hours: p.hours, note: p.note }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Payroll report</h2>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.quotaRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>{row.fullName}</TableCell>
                  <TableCell>{row.cyclesCompleted}</TableCell>
                  <TableCell>{row.pointsEarned.toFixed(1)}</TableCell>
                  <TableCell>{row.remainderCarried.toFixed(1)}</TableCell>
                </TableRow>
              ))}
              {report.quotaRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.hourlyRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>{row.fullName}</TableCell>
                  <TableCell>{row.approvedHours.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {report.hourlyRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No hourly staff yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

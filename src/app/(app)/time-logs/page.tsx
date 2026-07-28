import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

import { requireUser } from "@/lib/auth";
import { getActiveTimeLog, getMyTimeLogs } from "@/lib/time-logs/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClockWidget } from "./clock-widget";
import { LogRow } from "./log-row";

const PH_TZ = "Asia/Manila";

export default async function TimeLogsPage() {
  const user = await requireUser();
  if (user.payType !== "hourly") redirect("/");

  const [logs, active] = await Promise.all([getMyTimeLogs(user.id), getActiveTimeLog(user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">My Hours</h1>
        <p className="text-sm text-muted-foreground">
          Clock in when you start and clock out when you finish — your hours are timed automatically in Philippine time.
          An admin approves them before they count toward payroll.
        </p>
      </div>

      <ClockWidget
        active={
          active?.clockIn
            ? {
                clockInIso: new Date(active.clockIn).toISOString(),
                clockInLabel: formatInTimeZone(new Date(active.clockIn), PH_TZ, "MMM d, h:mm a"),
              }
            : null
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Time in</TableHead>
            <TableHead>Time out</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <LogRow
              key={log.id}
              log={{
                id: log.id,
                workDate: log.workDate,
                hours: log.hours,
                timeIn: log.clockIn ? formatInTimeZone(new Date(log.clockIn), PH_TZ, "h:mm a") : null,
                timeOut: log.clockOut ? formatInTimeZone(new Date(log.clockOut), PH_TZ, "h:mm a") : null,
                approvedAt: log.approvedAt,
              }}
            />
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No hours logged yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

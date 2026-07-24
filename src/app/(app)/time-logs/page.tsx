import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getMyTimeLogs } from "@/lib/time-logs/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogForm } from "./log-form";
import { LogRow } from "./log-row";

export default async function TimeLogsPage() {
  const user = await requireUser();
  if (user.payType !== "hourly") redirect("/");

  const logs = await getMyTimeLogs(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">My Hours</h1>
        <p className="text-sm text-muted-foreground">
          Daily hour entry — no clock-in/clock-out timer. An admin approves logs before they count toward payroll.
        </p>
      </div>

      <LogForm />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No hours logged yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

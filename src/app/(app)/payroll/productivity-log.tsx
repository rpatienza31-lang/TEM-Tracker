import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  id: string;
  userName: string;
  workDate: string;
  timeOut: string | null;
  hours: string | null;
  productivity: string;
};

/** Admin view of the productivity reports staff submit at clock-out. */
export function ProductivityLog({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">Staff</TableHead>
          <TableHead className="w-28">Date</TableHead>
          <TableHead className="w-24">Clock out</TableHead>
          <TableHead className="w-20">Hours</TableHead>
          <TableHead>What they did</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.userName}</TableCell>
            <TableCell className="text-muted-foreground">{r.workDate}</TableCell>
            <TableCell className="text-muted-foreground">{r.timeOut ?? "—"}</TableCell>
            <TableCell className="tabular-nums">{r.hours ?? "—"}</TableCell>
            <TableCell className="whitespace-pre-wrap">{r.productivity}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No productivity reports for this date range.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

import { requireUser } from "@/lib/auth";
import { getCotLibrary } from "@/lib/cot/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function CotLibraryPage() {
  await requireUser();
  const orders = await getCotLibrary();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Available Library</h1>
        <p className="text-sm text-muted-foreground">
          Finished customized orders — the grades, subjects, topics, competencies, and indicators already produced.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grade</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead>Competency</TableHead>
            <TableHead>Indicator</TableHead>
            <TableHead>Files</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{o.grade ?? "—"}</TableCell>
              <TableCell>{o.subjectName ?? "—"}</TableCell>
              <TableCell>{o.topic ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{o.competency ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{o.indicator ?? "—"}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {o.items.map((i) =>
                    i.fileUrl ? (
                      <a key={i.id} href={i.fileUrl} target="_blank" rel="noopener" className="text-xs text-accent underline">
                        {i.type === "COT_DLP" ? "DLP" : "PPT"}
                      </a>
                    ) : null,
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No completed orders yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { getMyWorkItems } from "@/lib/work-items/queries";
import { getMyCotItems } from "@/lib/cot/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/work-items/status-badge";
import { SubmitDialog } from "@/components/work-items/submit-dialog";
import { CotSubmitDialog } from "./cot-submit-dialog";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";

function isOverdue(dueDate: string | null, status: string) {
  return (
    !!dueDate &&
    dueDate < new Date().toISOString().slice(0, 10) &&
    status !== "approved" &&
    status !== "uploaded" &&
    status !== "cancelled"
  );
}

export default async function MyWorkPage() {
  const user = await requireUser();

  const [active, submitted, history, cotItems] = await Promise.all([
    getMyWorkItems(user.id, ["claimed", "revision"]),
    getMyWorkItems(user.id, ["in_review"]),
    getMyWorkItems(user.id, ["approved", "uploaded"]),
    getMyCotItems(user.id, ["claimed", "in_review", "revision"]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">My Work</h1>
        <p className="text-sm text-muted-foreground">
          See <Link href="/productivity" className="underline">Productivity &amp; Quota</Link> for your cycle progress and point totals.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Claimed &amp; revisions ({active.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} overdue={isOverdue(item.dueDate, item.status)} />
                </TableCell>
                <TableCell>{item.dueDate ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <SubmitDialog itemId={item.id} type={item.type} label="Submit" />
                </TableCell>
              </TableRow>
            ))}
            {active.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nothing claimed right now — grab an item from the Work Board.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">COT orders assigned to you ({cotItems.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Grade / Subject / Topic</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cotItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.customerName}</TableCell>
                <TableCell>{[item.subjectName, item.topic].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} overdue={isOverdue(item.deadline, item.status)} />
                </TableCell>
                <TableCell>{item.deadline}</TableCell>
                <TableCell>
                  {item.status === "claimed" || item.status === "revision" ? (
                    <CotSubmitDialog itemId={item.id} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Submitted — awaiting review</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {cotItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No COT orders assigned to you.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Awaiting review ({submitted.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submitted.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell className="text-muted-foreground">Pending admin review</TableCell>
              </TableRow>
            ))}
            {submitted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nothing awaiting review.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">History ({history.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>{item.pointsAwarded ?? "—"}</TableCell>
              </TableRow>
            ))}
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No approved or uploaded items yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BulkActionButton } from "@/components/work-items/bulk-action-button";
import { RequestRevisionDialog } from "@/components/work-items/request-revision-dialog";
import { approveItemAction, unapproveItemAction, uploadItemAction } from "@/lib/work-items/actions";
import { approveCotAction, requestCotRevisionAction } from "@/app/(app)/cot/actions";
import { useWorkItemsRealtime } from "@/hooks/use-work-items-realtime";
import type { BoardItem } from "@/lib/work-items/queries";
import type { CotReviewItem } from "@/lib/cot/queries";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";

function uniqueSorted<T>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

export function ReviewClient({
  inReview,
  readyToUpload,
  cotInReview,
}: {
  inReview: BoardItem[];
  readyToUpload: BoardItem[];
  cotInReview: CotReviewItem[];
}) {
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [week, setWeek] = useState("");
  const [type, setType] = useState("");
  useWorkItemsRealtime();

  const options = useMemo(
    () => ({
      grades: uniqueSorted(inReview.map((i) => String(i.grade))),
      subjects: uniqueSorted(inReview.map((i) => i.subjectName)),
      weeks: uniqueSorted(inReview.map((i) => String(i.weekNumber))),
      types: uniqueSorted(inReview.map((i) => i.type)),
    }),
    [inReview],
  );

  const filteredInReview = useMemo(() => {
    const query = q.trim().toLowerCase();
    return inReview.filter(
      (i) =>
        (!query || (i.assigneeName ?? "").toLowerCase().includes(query)) &&
        (!grade || String(i.grade) === grade) &&
        (!subject || i.subjectName === subject) &&
        (!week || String(i.weekNumber) === week) &&
        (!type || i.type === type),
    );
  }, [inReview, q, grade, subject, week, type]);

  function toggleUpload(id: string, checked: boolean) {
    setSelectedUploads((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Review Queue</h1>
        <p className="text-sm text-muted-foreground">Submissions awaiting review, oldest first.</p>
      </div>

      {banner && (
        <div className="rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2 text-sm text-status-approved">
          {banner}
          <button className="ml-2 underline" onClick={() => setBanner(null)}>
            dismiss
          </button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          In review ({filteredInReview.length}
          {filteredInReview.length !== inReview.length ? ` of ${inReview.length}` : ""})
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search staff name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-48"
          />
          <FilterSelect label="Grade" value={grade} onChange={setGrade} options={options.grades} render={(g) => `Grade ${g}`} />
          <FilterSelect label="Subject" value={subject} onChange={setSubject} options={options.subjects} />
          <FilterSelect label="Week" value={week} onChange={setWeek} options={options.weeks} render={(w) => `Wk ${w}`} />
          <FilterSelect
            label="Type"
            value={type}
            onChange={setType}
            options={options.types}
            render={(t) => DELIVERABLE_TYPE_LABELS[t as keyof typeof DELIVERABLE_TYPE_LABELS] ?? t}
          />
          {(q || grade || subject || week || type) && (
            <button
              className="text-sm text-muted-foreground underline"
              onClick={() => {
                setQ("");
                setGrade("");
                setSubject("");
                setWeek("");
                setType("");
              }}
            >
              Clear
            </button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Editor</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInReview.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{item.assigneeName}</TableCell>
                <TableCell>
                  {item.fileUrl && (
                    <a className="text-primary underline" href={item.fileUrl} target="_blank" rel="noreferrer">
                      File
                    </a>
                  )}
                </TableCell>
                <TableCell className="flex flex-wrap gap-1">
                  <BulkActionButton
                    itemIds={[item.id]}
                    label="Approve"
                    pendingLabel="…"
                    variant="default"
                    action={approveItemAction}
                    onDone={setBanner}
                  />
                  <RequestRevisionDialog itemId={item.id} onDone={setBanner} />
                </TableCell>
              </TableRow>
            ))}
            {filteredInReview.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {inReview.length === 0 ? "Nothing waiting on review." : "No items match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">COT deliverables in review ({cotInReview.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Subject / Topic</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Editor</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cotInReview.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.customerName}</TableCell>
                <TableCell>{[item.subjectName, item.topic].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{item.assigneeName}</TableCell>
                <TableCell>{item.deadline}</TableCell>
                <TableCell>
                  {item.fileUrl && (
                    <a className="text-primary underline" href={item.fileUrl} target="_blank" rel="noreferrer">
                      File
                    </a>
                  )}
                </TableCell>
                <TableCell>
                  <CotReviewActions itemId={item.id} onDone={setBanner} />
                </TableCell>
              </TableRow>
            ))}
            {cotInReview.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No COT deliverables awaiting review.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Ready to upload ({readyToUpload.length})</h2>
          <BulkActionButton
            itemIds={[...selectedUploads]}
            label="Mark selected as uploaded"
            pendingLabel="Uploading…"
            variant="default"
            action={uploadItemAction}
            onDone={setBanner}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Grade</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Editor</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {readyToUpload.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox checked={selectedUploads.has(item.id)} onCheckedChange={(c) => toggleUpload(item.id, c === true)} />
                </TableCell>
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{item.assigneeName}</TableCell>
                <TableCell className="text-muted-foreground">{item.pointsValue} pts</TableCell>
                <TableCell>
                  <BulkActionButton
                    itemIds={[item.id]}
                    label="Unapprove"
                    pendingLabel="…"
                    action={unapproveItemAction}
                    onDone={setBanner}
                  />
                </TableCell>
              </TableRow>
            ))}
            {readyToUpload.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nothing approved and waiting to publish.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function CotReviewActions({ itemId, onDone }: { itemId: string; onDone: (m: string) => void }) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string }>, okMessage: string) {
    startTransition(async () => {
      const result = await action();
      onDone(result.ok ? okMessage : (result.message ?? "Something went wrong."));
    });
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={pending} onClick={() => run(() => approveCotAction(itemId), "COT deliverable approved.")}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => requestCotRevisionAction(itemId), "Sent back for revision.")}
      >
        Request revision
      </Button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All {label.toLowerCase()}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {render ? render(o) : o}
        </option>
      ))}
    </select>
  );
}

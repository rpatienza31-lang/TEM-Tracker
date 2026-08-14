"use client";

import { useMemo, useState, useTransition } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { BulkActionButton } from "@/components/work-items/bulk-action-button";
import { RequestRevisionDialog } from "@/components/work-items/request-revision-dialog";
import { approveItemAction, unapproveItemAction, uploadItemAction } from "@/lib/work-items/actions";
import { approveCotAction } from "@/app/(app)/cot/actions";
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
  inRevision,
  cotInRevision,
}: {
  inReview: BoardItem[];
  readyToUpload: BoardItem[];
  cotInReview: CotReviewItem[];
  inRevision: BoardItem[];
  cotInRevision: CotReviewItem[];
}) {
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [selectedReview, setSelectedReview] = useState<Set<string>>(new Set());
  const [selectedCot, setSelectedCot] = useState<Set<string>>(new Set());
  const [cotPending, startCotTransition] = useTransition();
  // Default deadline offered when sending an item back (editors can change it).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  // Rows just approved in this table — kept in place with a "Mark as uploaded"
  // button so you don't have to scroll to the section below.
  const [approvedInline, setApprovedInline] = useState<Map<string, BoardItem>>(new Map());
  const addApproved = (item: BoardItem) => setApprovedInline((m) => new Map(m).set(item.id, item));
  const removeApproved = (id: string) =>
    setApprovedInline((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  const [editor, setEditor] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [week, setWeek] = useState("");
  const [type, setType] = useState("");
  useWorkItemsRealtime();

  const options = useMemo(
    () => ({
      // Editor/grade/etc. lists span every table so the filters work across the
      // whole queue, including the back-jobs (revision) section.
      editors: uniqueSorted(
        [
          ...inReview.map((i) => i.assigneeName),
          ...cotInReview.map((i) => i.assigneeName),
          ...inRevision.map((i) => i.assigneeName),
          ...cotInRevision.map((i) => i.assigneeName),
        ].filter((n): n is string => !!n),
      ),
      grades: uniqueSorted([...inReview, ...inRevision].map((i) => String(i.grade))),
      subjects: uniqueSorted([...inReview, ...inRevision].map((i) => i.subjectName)),
      weeks: uniqueSorted([...inReview, ...inRevision].map((i) => String(i.weekNumber))),
      types: uniqueSorted([...inReview, ...inRevision].map((i) => i.type)),
    }),
    [inReview, cotInReview, inRevision, cotInRevision],
  );

  const filteredInReview = useMemo(() => {
    return inReview.filter(
      (i) =>
        (!editor || i.assigneeName === editor) &&
        (!grade || String(i.grade) === grade) &&
        (!subject || i.subjectName === subject) &&
        (!week || String(i.weekNumber) === week) &&
        (!type || i.type === type),
    );
  }, [inReview, editor, grade, subject, week, type]);

  const filteredCot = useMemo(
    () => cotInReview.filter((i) => (!editor || i.assigneeName === editor) && (!type || i.type === type)),
    [cotInReview, editor, type],
  );

  const filteredRevision = useMemo(() => {
    return inRevision.filter(
      (i) =>
        (!editor || i.assigneeName === editor) &&
        (!grade || String(i.grade) === grade) &&
        (!subject || i.subjectName === subject) &&
        (!week || String(i.weekNumber) === week) &&
        (!type || i.type === type),
    );
  }, [inRevision, editor, grade, subject, week, type]);

  const filteredCotRevision = useMemo(
    () => cotInRevision.filter((i) => (!editor || i.assigneeName === editor) && (!type || i.type === type)),
    [cotInRevision, editor, type],
  );

  const revisionCount = filteredRevision.length + filteredCotRevision.length;
  const revisionTotal = inRevision.length + cotInRevision.length;

  function toggleUpload(id: string, checked: boolean) {
    setSelectedUploads((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleInSet(setter: typeof setSelectedReview, id: string, checked: boolean) {
    setter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const reviewIds = filteredInReview.map((i) => i.id);
  const allReviewSelected = reviewIds.length > 0 && reviewIds.every((id) => selectedReview.has(id));
  const cotIds = filteredCot.map((i) => i.id);
  const allCotSelected = cotIds.length > 0 && cotIds.every((id) => selectedCot.has(id));
  const uploadIds = readyToUpload.map((i) => i.id);
  const allUploadsSelected = uploadIds.length > 0 && uploadIds.every((id) => selectedUploads.has(id));

  // COT approvals return a different result shape, so bulk-approve them directly.
  function approveSelectedCot() {
    const ids = [...selectedCot];
    if (ids.length === 0) return;
    startCotTransition(async () => {
      const results = await Promise.all(ids.map((id) => approveCotAction(id)));
      const failed = results.filter((r) => !r.ok).length;
      setBanner(
        failed > 0
          ? `${ids.length - failed} approved, ${failed} failed.`
          : `Approved ${ids.length} COT deliverable${ids.length > 1 ? "s" : ""}.`,
      );
      setSelectedCot(new Set());
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
          <FilterSelect label="Editor" allLabel="All editors" value={editor} onChange={setEditor} options={options.editors} />
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
          {(editor || grade || subject || week || type) && (
            <button
              className="text-sm text-muted-foreground underline"
              onClick={() => {
                setEditor("");
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

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">{selectedReview.size} selected</span>
          <BulkActionButton
            itemIds={[...selectedReview]}
            label="Approve selected"
            pendingLabel="Approving…"
            variant="default"
            action={approveItemAction}
            onDone={(m) => {
              setBanner(m);
              setSelectedReview(new Set());
            }}
          />
          <button
            className="text-sm text-primary underline disabled:opacity-40"
            disabled={reviewIds.length === 0 || allReviewSelected}
            onClick={() => setSelectedReview(new Set(reviewIds))}
          >
            Select all ({reviewIds.length})
          </button>
          <button
            className="text-sm text-muted-foreground underline disabled:opacity-40"
            disabled={selectedReview.size === 0}
            onClick={() => setSelectedReview(new Set())}
          >
            Uncheck all
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={allReviewSelected} onCheckedChange={() => setSelectedReview(allReviewSelected ? new Set() : new Set(reviewIds))} aria-label="Select all" />
              </TableHead>
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
            {/* Just-approved rows, kept here with a Mark-as-uploaded button. */}
            {[...approvedInline.values()].map((item) => (
              <TableRow key={`approved-${item.id}`} className="bg-emerald-50/70 dark:bg-emerald-950/20">
                <TableCell />
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
                <TableCell className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Approved
                  </span>
                  <RowUpload
                    id={item.id}
                    onUploaded={(id) => {
                      removeApproved(id);
                      setBanner("Marked as uploaded.");
                    }}
                    onError={setBanner}
                  />
                  <button className="text-xs text-muted-foreground underline" onClick={() => removeApproved(item.id)}>
                    dismiss
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {filteredInReview
              .filter((item) => !approvedInline.has(item.id))
              .map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox checked={selectedReview.has(item.id)} onCheckedChange={(c) => toggleInSet(setSelectedReview, item.id, c === true)} />
                  </TableCell>
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
                    <RowApprove
                      item={item}
                      onApproved={(it) => {
                        addApproved(it);
                        setBanner("Approved — now mark it uploaded.");
                      }}
                      onError={setBanner}
                    />
                    <RequestRevisionDialog itemId={item.id} onDone={setBanner} defaultDate={item.dueDate ?? today} />
                  </TableCell>
                </TableRow>
              ))}
            {filteredInReview.length === 0 && approvedInline.size === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {inReview.length === 0 ? "Nothing waiting on review." : "No items match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          COT deliverables in review ({filteredCot.length}
          {filteredCot.length !== cotInReview.length ? ` of ${cotInReview.length}` : ""})
        </h2>
        {filteredCot.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">{selectedCot.size} selected</span>
            <Button size="sm" disabled={cotPending || selectedCot.size === 0} onClick={approveSelectedCot}>
              {cotPending ? "Approving…" : "Approve selected"}
            </Button>
            <button
              className="text-sm text-primary underline disabled:opacity-40"
              disabled={cotIds.length === 0 || allCotSelected}
              onClick={() => setSelectedCot(new Set(cotIds))}
            >
              Select all ({cotIds.length})
            </button>
            <button
              className="text-sm text-muted-foreground underline disabled:opacity-40"
              disabled={selectedCot.size === 0}
              onClick={() => setSelectedCot(new Set())}
            >
              Uncheck all
            </button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={allCotSelected} onCheckedChange={() => setSelectedCot(allCotSelected ? new Set() : new Set(cotIds))} aria-label="Select all" />
              </TableHead>
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
            {filteredCot.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox checked={selectedCot.has(item.id)} onCheckedChange={(c) => toggleInSet(setSelectedCot, item.id, c === true)} />
                </TableCell>
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
                  <CotReviewActions itemId={item.id} onDone={setBanner} defaultDate={item.deadline} />
                </TableCell>
              </TableRow>
            ))}
            {filteredCot.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {cotInReview.length === 0 ? "No COT deliverables awaiting review." : "No COT items match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-red-600">
          Back jobs — sent for revision ({revisionCount}
          {revisionCount !== revisionTotal ? ` of ${revisionTotal}` : ""})
        </h2>
        <p className="text-sm text-muted-foreground">
          These are with the editor to fix. They&apos;ll return here once resubmitted. Uses the same filters above.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade / Customer</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Week / Topic</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Editor</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRevision.map((item) => (
              <TableRow key={item.id} className="bg-red-50/40 dark:bg-red-950/10">
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{item.assigneeName}</TableCell>
                <TableCell className="text-muted-foreground">Catalog</TableCell>
                <TableCell>
                  {item.fileUrl && (
                    <a className="text-primary underline" href={item.fileUrl} target="_blank" rel="noreferrer">
                      File
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredCotRevision.map((item) => (
              <TableRow key={item.id} className="bg-red-50/40 dark:bg-red-950/10">
                <TableCell>{item.customerName}</TableCell>
                <TableCell>{item.subjectName ?? "—"}</TableCell>
                <TableCell>{item.topic ?? "—"}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{item.assigneeName}</TableCell>
                <TableCell className="text-muted-foreground">COT</TableCell>
                <TableCell>
                  {item.fileUrl && (
                    <a className="text-primary underline" href={item.fileUrl} target="_blank" rel="noreferrer">
                      File
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {revisionCount === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {revisionTotal === 0 ? "No back jobs right now." : "No back jobs match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Ready to upload ({readyToUpload.length})</h2>
          <BulkActionButton
            itemIds={[...selectedUploads]}
            label="Mark selected as uploaded"
            pendingLabel="Uploading…"
            variant="default"
            action={uploadItemAction}
            onDone={(m) => {
              setBanner(m);
              setSelectedUploads(new Set());
            }}
          />
          <button
            className="text-sm text-primary underline disabled:opacity-40"
            disabled={uploadIds.length === 0 || allUploadsSelected}
            onClick={() => setSelectedUploads(new Set(uploadIds))}
          >
            Select all ({uploadIds.length})
          </button>
          <button
            className="text-sm text-muted-foreground underline disabled:opacity-40"
            disabled={selectedUploads.size === 0}
            onClick={() => setSelectedUploads(new Set())}
          >
            Uncheck all
          </button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allUploadsSelected}
                  onCheckedChange={() => setSelectedUploads(allUploadsSelected ? new Set() : new Set(uploadIds))}
                  aria-label="Select all"
                />
              </TableHead>
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

function RowApprove({
  item,
  onApproved,
  onError,
}: {
  item: BoardItem;
  onApproved: (item: BoardItem) => void;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await approveItemAction(item.id);
          if (r.ok) onApproved(item);
          else onError(r.error.message);
        })
      }
    >
      {pending ? "…" : "Approve"}
    </Button>
  );
}

function RowUpload({
  id,
  onUploaded,
  onError,
}: {
  id: string;
  onUploaded: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="default"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await uploadItemAction(id);
          if (r.ok) onUploaded(id);
          else onError(r.error.message);
        })
      }
    >
      {pending ? "…" : "Mark as uploaded"}
    </Button>
  );
}

function CotReviewActions({
  itemId,
  onDone,
  defaultDate,
}: {
  itemId: string;
  onDone: (m: string) => void;
  defaultDate?: string;
}) {
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
      <RequestRevisionDialog itemId={itemId} kind="cot" onDone={onDone} defaultDate={defaultDate} />
    </div>
  );
}

function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  allLabel?: string;
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
      <option value="">{allLabel ?? `All ${label.toLowerCase()}`}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {render ? render(o) : o}
        </option>
      ))}
    </select>
  );
}

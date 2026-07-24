"use client";

import { useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionButton } from "@/components/work-items/bulk-action-button";
import { RequestRevisionDialog } from "@/components/work-items/request-revision-dialog";
import { approveItemAction, unapproveItemAction, uploadItemAction } from "@/lib/work-items/actions";
import { useWorkItemsRealtime } from "@/hooks/use-work-items-realtime";
import type { BoardItem } from "@/lib/work-items/queries";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";

export function ReviewClient({ inReview, readyToUpload }: { inReview: BoardItem[]; readyToUpload: BoardItem[] }) {
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  useWorkItemsRealtime();

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
        <h2 className="text-lg font-semibold">In review ({inReview.length})</h2>
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
            {inReview.map((item) => (
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
            {inReview.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nothing waiting on review.
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

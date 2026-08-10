"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/work-items/status-badge";
import { ClaimButton } from "@/components/work-items/claim-button";
import { SubmitDialog } from "@/components/work-items/submit-dialog";
import { AssignDialog } from "@/components/work-items/assign-dialog";
import { BulkActionButton } from "@/components/work-items/bulk-action-button";
import { releaseItemAction, uploadItemAction } from "@/lib/work-items/actions";
import { removeSubjectFromGradeAction } from "./actions";
import { useWorkItemsRealtime } from "@/hooks/use-work-items-realtime";
import { ALL_DELIVERABLE_TYPES, DELIVERABLE_TYPE_LABELS, WEEK_NUMBERS, type DeliverableType, type ItemStatus } from "@/lib/constants";
import type { BoardItem } from "@/lib/work-items/queries";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Editor = { id: string; fullName: string };

const CELL_CLASS: Record<ItemStatus, string> = {
  available: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  claimed: "bg-blue-500 text-white",
  in_review: "bg-amber-400 text-amber-950",
  revision: "bg-amber-400 text-amber-950",
  approved: "bg-green-500 text-white",
  uploaded: "bg-green-800 text-white",
  cancelled: "bg-gray-100 text-gray-400 dark:bg-gray-900",
};

function initials(name: string | null) {
  if (!name) return "";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isOverdue(item: BoardItem) {
  return (
    !!item.dueDate &&
    item.dueDate < new Date().toISOString().slice(0, 10) &&
    item.status !== "uploaded" &&
    item.status !== "cancelled"
  );
}

export function MatrixClient({
  terms,
  termId,
  grades,
  grade,
  type,
  subjects,
  items,
  editors,
  currentUser,
}: {
  terms: Option[];
  termId?: string;
  grades: number[];
  grade?: number;
  type: DeliverableType;
  subjects: { id: string; name: string; shortCode: string }[];
  items: BoardItem[];
  editors: Editor[];
  currentUser: { id: string; role: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  useWorkItemsRealtime(termId);

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";

  function removeSubject(subjectId: string, subjectName: string) {
    if (!termId || grade === undefined) return;
    if (!window.confirm(`Remove ${subjectName} from Grade ${grade}? This deletes its work items for all weeks and types.`)) {
      return;
    }
    setBanner(null);
    startRemoving(async () => {
      const result = await removeSubjectFromGradeAction(termId, grade, subjectId);
      if (result.ok) {
        setBanner(`Removed ${subjectName} from Grade ${grade}.`);
        router.refresh();
      } else {
        setBanner(result.message);
      }
    });
  }

  const grid = useMemo(() => {
    const map = new Map<string, BoardItem>();
    for (const item of items) map.set(`${item.subjectId}|${item.weekNumber}`, item);
    return map;
  }, [items]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Matrix View</h1>
        <p className="text-sm text-muted-foreground">Coverage at a glance — check here before assigning anything.</p>
      </div>

      {banner && (
        <div className="rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2 text-sm text-status-approved">
          {banner}
          <button className="ml-2 underline" onClick={() => setBanner(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={termId ?? ""}
          onChange={(e) => setParam("term", e.target.value)}
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={grade ?? ""}
          onChange={(e) => setParam("grade", e.target.value)}
        >
          {grades.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-md border border-input">
          {ALL_DELIVERABLE_TYPES.map((t) => (
            <button
              key={t}
              className={cn("px-3 py-1.5 text-sm", type === t ? "bg-primary text-primary-foreground" : "bg-background")}
              onClick={() => setParam("type", t)}
            >
              {DELIVERABLE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <LegendDot className="bg-gray-300" label="Available" />
        <LegendDot className="bg-blue-500" label="Claimed" />
        <LegendDot className="bg-amber-400" label="In review / revision" />
        <LegendDot className="bg-green-500" label="Approved" />
        <LegendDot className="bg-green-800" label="Uploaded" />
        <LegendDot className="bg-white ring-2 ring-status-overdue" label="Overdue" />
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background p-2 text-left">Subject</th>
              {WEEK_NUMBERS.map((w) => (
                <th key={w} className="p-2 text-center font-medium">
                  Wk {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.id}>
                <td className="sticky left-0 whitespace-nowrap bg-background p-2 font-medium">
                  <span className="flex items-center gap-2">
                    {subject.name}
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => removeSubject(subject.id, subject.name)}
                        title={`Remove ${subject.name} from Grade ${grade}`}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </td>
                {WEEK_NUMBERS.map((week) => {
                  const item = grid.get(`${subject.id}|${week}`);
                  if (!item) {
                    return (
                      <td key={week} className="p-1 text-center">
                        <div className="mx-auto h-9 w-14 rounded border border-dashed border-border" title="Not generated" />
                      </td>
                    );
                  }
                  const overdue = isOverdue(item);
                  return (
                    <td key={week} className="p-1 text-center">
                      <button
                        onClick={() => setSelectedItem(item)}
                        className={cn(
                          "mx-auto flex h-9 w-14 items-center justify-center rounded text-xs font-semibold",
                          CELL_CLASS[item.status],
                          overdue && "ring-2 ring-status-overdue",
                        )}
                        title={`${subject.name} · Week ${week} · ${item.status}`}
                      >
                        {initials(item.assigneeName)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr>
                <td colSpan={11} className="p-4 text-center text-muted-foreground">
                  No subjects offered for this grade yet — use the catalog generator.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent>
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Grade {selectedItem.grade} · {selectedItem.subjectName} · Week {selectedItem.weekNumber} ·{" "}
                  {DELIVERABLE_TYPE_LABELS[selectedItem.type]}
                </DialogTitle>
                <DialogDescription>{selectedItem.dueDate ? `Due ${selectedItem.dueDate}` : "No deadline set"}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedItem.status} overdue={isOverdue(selectedItem)} />
                  <span className="text-muted-foreground">{selectedItem.assigneeName ?? "Unassigned"}</span>
                </div>
                <p className="text-muted-foreground">Points: {selectedItem.pointsValue}</p>
                {selectedItem.fileUrl && (
                  <a className="text-primary underline" href={selectedItem.fileUrl} target="_blank" rel="noreferrer">
                    File link
                  </a>
                )}
              </div>
              <DialogFooter className="flex-wrap justify-start gap-2">
                {currentUser.role === "editor" && selectedItem.status === "available" && (
                  <ClaimButton itemId={selectedItem.id} onError={(m) => setBanner(m)} />
                )}
                {currentUser.role === "editor" &&
                  selectedItem.assigneeId === currentUser.id &&
                  (selectedItem.status === "claimed" || selectedItem.status === "revision") && (
                    <SubmitDialog itemId={selectedItem.id} type={selectedItem.type} label="Submit" onError={(m) => setBanner(m)} />
                  )}
                {isAdmin && selectedItem.status === "available" && (
                  <AssignDialog itemIds={[selectedItem.id]} editors={editors} label="Assign" onDone={(m) => { setBanner(m); setSelectedItem(null); }} />
                )}
                {isAdmin && selectedItem.status !== "available" && selectedItem.status !== "cancelled" && (
                  <BulkActionButton
                    itemIds={[selectedItem.id]}
                    label="Release"
                    pendingLabel="…"
                    action={(id) => releaseItemAction(id)}
                    onDone={(m) => { setBanner(m); setSelectedItem(null); }}
                  />
                )}
                {isAdmin && selectedItem.status === "approved" && (
                  <BulkActionButton
                    itemIds={[selectedItem.id]}
                    label="Mark uploaded"
                    pendingLabel="…"
                    action={uploadItemAction}
                    onDone={(m) => { setBanner(m); setSelectedItem(null); }}
                  />
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-3 w-3 rounded-full", className)} />
      {label}
    </span>
  );
}

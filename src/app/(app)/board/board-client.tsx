"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/work-items/status-badge";
import { ClaimButton } from "@/components/work-items/claim-button";
import { SubmitDialog } from "@/components/work-items/submit-dialog";
import { AssignDialog } from "@/components/work-items/assign-dialog";
import { BulkActionButton } from "@/components/work-items/bulk-action-button";
import { releaseItemAction, uploadItemAction } from "@/lib/work-items/actions";
import { useWorkItemsRealtime } from "@/hooks/use-work-items-realtime";
import { ALL_DELIVERABLE_TYPES, ALL_GRADES, DELIVERABLE_TYPE_LABELS, STATUS_LABELS, WEEK_NUMBERS, type ItemStatus } from "@/lib/constants";
import type { BoardItem } from "@/lib/work-items/queries";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Staff = { id: string; fullName: string; role: string };

const STATUSES: ItemStatus[] = ["available", "claimed", "in_review", "revision", "approved", "uploaded", "cancelled"];

function isOverdue(item: BoardItem) {
  return item.dueDate < new Date().toISOString().slice(0, 10) && item.status !== "uploaded" && item.status !== "cancelled";
}

export function BoardClient({
  items,
  terms,
  subjects,
  staff,
  currentUser,
}: {
  items: BoardItem[];
  terms: Option[];
  subjects: Option[];
  staff: Staff[];
  currentUser: { id: string; role: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  useWorkItemsRealtime(searchParams.get("term") ?? undefined);

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";
  const editors = useMemo(() => staff.filter((s) => s.role === "editor"), [staff]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectedIds = [...selected];
  const selectedApprovedIds = items.filter((i) => selected.has(i.id) && i.status === "approved").map((i) => i.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Work Board</h1>
        <p className="text-sm text-muted-foreground">Every deliverable in a term, live-updating as staff claim and submit.</p>
      </div>

      {banner && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            banner.kind === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-status-approved/40 bg-status-approved/10 text-status-approved",
          )}
        >
          {banner.message}
          <button className="ml-2 underline" onClick={() => setBanner(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("term") ?? ""}
          onChange={(e) => setParam("term", e.target.value)}
        >
          <option value="">All terms</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("grade") ?? ""}
          onChange={(e) => setParam("grade", e.target.value)}
        >
          <option value="">All grades</option>
          {ALL_GRADES.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("subject") ?? ""}
          onChange={(e) => setParam("subject", e.target.value)}
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("week") ?? ""}
          onChange={(e) => setParam("week", e.target.value)}
        >
          <option value="">All weeks</option>
          {WEEK_NUMBERS.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("type") ?? ""}
          onChange={(e) => setParam("type", e.target.value)}
        >
          <option value="">Any type</option>
          {ALL_DELIVERABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DELIVERABLE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={searchParams.get("assignee") ?? ""}
          onChange={(e) => setParam("assignee", e.target.value)}
        >
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <Checkbox
            checked={searchParams.get("availableOnly") === "1"}
            onCheckedChange={(c) => setParam("availableOnly", c ? "1" : null)}
          />
          Available only
        </label>
        <label className="flex items-center gap-1 text-sm">
          <Checkbox
            checked={searchParams.get("overdueOnly") === "1"}
            onCheckedChange={(c) => setParam("overdueOnly", c ? "1" : null)}
          />
          Overdue only
        </label>
      </div>

      {isAdmin && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 p-2">
          <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
          <AssignDialog itemIds={selectedIds} editors={editors} label="Bulk assign" onDone={(m) => setBanner({ kind: "success", message: m })} />
          <BulkActionButton
            itemIds={selectedIds}
            label="Bulk release"
            pendingLabel="Releasing…"
            action={(id) => releaseItemAction(id)}
            onDone={(m) => setBanner({ kind: "success", message: m })}
          />
          <BulkActionButton
            itemIds={selectedApprovedIds}
            label="Bulk mark uploaded"
            pendingLabel="Uploading…"
            action={uploadItemAction}
            onDone={(m) => setBanner({ kind: "success", message: m })}
          />
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {isAdmin && <TableHead className="w-8" />}
            <TableHead>Grade</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Week</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Points</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const overdue = isOverdue(item);
            const isMine = item.assigneeId === currentUser.id;
            return (
              <TableRow key={item.id}>
                {isAdmin && (
                  <TableCell>
                    <Checkbox checked={selected.has(item.id)} onCheckedChange={(c) => toggleSelected(item.id, c === true)} />
                  </TableCell>
                )}
                <TableCell>{item.grade}</TableCell>
                <TableCell>{item.subjectName}</TableCell>
                <TableCell>Wk {item.weekNumber}</TableCell>
                <TableCell>{DELIVERABLE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} overdue={overdue} />
                </TableCell>
                <TableCell>{item.assigneeName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className={cn(overdue && "font-medium text-destructive")}>{item.dueDate}</TableCell>
                <TableCell>{item.pointsValue}</TableCell>
                <TableCell className="flex flex-wrap gap-1">
                  {currentUser.role === "editor" && item.status === "available" && (
                    <ClaimButton itemId={item.id} onError={(m) => setBanner({ kind: "error", message: m })} />
                  )}
                  {currentUser.role === "editor" && isMine && (item.status === "claimed" || item.status === "revision") && (
                    <SubmitDialog
                      itemId={item.id}
                      type={item.type}
                      label="Submit"
                      onError={(m) => setBanner({ kind: "error", message: m })}
                    />
                  )}
                  {isAdmin && item.status !== "available" && item.status !== "cancelled" && (
                    <BulkActionButton
                      itemIds={[item.id]}
                      label="Release"
                      pendingLabel="…"
                      action={(id) => releaseItemAction(id)}
                      onDone={(m) => setBanner({ kind: "success", message: m })}
                    />
                  )}
                  {isAdmin && item.status === "available" && (
                    <AssignDialog itemIds={[item.id]} editors={editors} label="Assign" onDone={(m) => setBanner({ kind: "success", message: m })} />
                  )}
                  {isAdmin && item.status === "approved" && (
                    <BulkActionButton
                      itemIds={[item.id]}
                      label="Mark uploaded"
                      pendingLabel="…"
                      action={uploadItemAction}
                      onDone={(m) => setBanner({ kind: "success", message: m })}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={isAdmin ? 10 : 9} className="text-center text-muted-foreground">
                No work items match these filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

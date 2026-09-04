"use client";

import { Fragment, useActionState, useState, useTransition } from "react";

import { DELIVERABLE_TYPE_LABELS, type DeliverableType } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RateCell } from "./rate-cell";
import { AdjustPointsForm } from "./adjust-points-form";
import { ReconcileForm } from "./reconcile-form";
import {
  editLinePointsAction,
  markQuotaPaidAction,
  removeLineAction,
  removeLinesAction,
  type SetRateState,
} from "./actions";

export type BreakdownLine = {
  kind: "catalog" | "cot" | "adjustment";
  refId: string;
  type: DeliverableType | null;
  title: string;
  subtitle: string | null;
  points: number;
  dateIso: string;
};

export type QuotaRow = {
  userId: string;
  fullName: string;
  cycleNumber: number;
  pointsEarned: number;
  pointsPaid: number;
  pointsUnpaid: number;
  completedCycles: number;
  quotaReached: boolean;
  remainderCarried: number;
  rate: number;
  perSubjectRate: number;
  salary: number;
  isPaid: boolean;
  lastPaidAt: string | null;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const paidFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

const payInitial: SetRateState = { status: "idle" };

/**
 * Owner control that pays an editor's unpaid completed cycles and records the
 * payout so they are never paid twice. Shows a "Paid" state once nothing is due.
 */
function MarkPaidButton({
  userId,
  salary,
  isPaid,
  lastPaidAt,
  pointsUnpaid,
  perSubjectRate,
  quotaSize,
  from,
  to,
}: {
  userId: string;
  salary: number;
  isPaid: boolean;
  lastPaidAt: string | null;
  pointsUnpaid: number;
  perSubjectRate: number;
  quotaSize: number;
  from: string;
  to: string;
}) {
  const [state, formAction, pending] = useActionState(markQuotaPaidAction, payInitial);
  // When over one cycle, default to paying exactly one cycle (e.g. 21) so the
  // excess carries over; otherwise pay the whole balance.
  const defaultPoints = pointsUnpaid > quotaSize ? quotaSize : Math.round(pointsUnpaid * 10) / 10;
  const [points, setPoints] = useState(defaultPoints);

  if (isPaid) {
    return (
      <span className="text-xs text-status-approved">
        Paid{lastPaidAt ? ` · ${paidFmt.format(new Date(lastPaidAt))}` : ""} ✓
      </span>
    );
  }
  if (salary <= 0) return <span className="text-xs text-muted-foreground">—</span>;

  const amount = Math.round(Math.min(points, pointsUnpaid) * perSubjectRate * 100) / 100;
  const carried = Math.round((pointsUnpaid - Math.min(points, pointsUnpaid)) * 10) / 10;

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (!window.confirm(`Pay ${points} pt(s) = ${peso.format(amount)} to this editor?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="points" value={points} />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step="0.5"
          min={0.5}
          max={pointsUnpaid}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          className="h-8 w-16 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums"
          aria-label="Points to pay"
        />
        <span className="text-xs text-muted-foreground">pts</span>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || points <= 0}>
          {pending ? "Saving…" : "Mark paid"}
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {peso.format(amount)}
        {carried > 0 && ` · ${carried} pt${carried === 1 ? "" : "s"} carries over`}
        {points < pointsUnpaid && (
          <button type="button" onClick={() => setPoints(Math.round(pointsUnpaid * 10) / 10)} className="ml-1.5 text-primary underline">
            pay all
          </button>
        )}
      </div>
      {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}

function lineLabel(line: BreakdownLine) {
  if (line.type) return DELIVERABLE_TYPE_LABELS[line.type];
  return "Adjustment";
}

const removeInitial: SetRateState = { status: "idle" };

/**
 * Owner control to edit one line's point value in place. Saving updates the
 * line's source row and adjusts the cycle it landed in, so the figure — and the
 * editor's total — changes directly, with no offsetting entry.
 */
function EditableLinePoints({
  kind,
  refId,
  points,
}: {
  kind: BreakdownLine["kind"];
  refId: string;
  points: number;
}) {
  const [state, formAction, pending] = useActionState(editLinePointsAction, removeInitial);
  const [value, setValue] = useState(points.toString());
  const parsed = Number(value);
  const dirty = value.trim() !== points.toString() && Number.isFinite(parsed) && parsed !== points;

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="refId" value={refId} />
      <Input
        name="newPoints"
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-16 text-right tabular-nums"
        aria-label="Points for this line"
      />
      {dirty && (
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="h-7 px-2 text-xs">
          {pending ? "…" : "Save"}
        </Button>
      )}
      {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}

/**
 * Owner control that truly removes a project line: reverses its points and drops
 * the source row, so the line disappears from the breakdown.
 */
function RemoveLineButton({ kind, refId, label }: { kind: BreakdownLine["kind"]; refId: string; label: string }) {
  const [state, formAction, pending] = useActionState(removeLineAction, removeInitial);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Remove "${label}" from this editor's points? This deletes the credit.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="refId" value={refId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      {state.status === "error" && <span className="ml-1 text-xs text-destructive">{state.message}</span>}
    </form>
  );
}

/**
 * The expanded breakdown for one editor: the itemized unpaid projects, with
 * owner tools to correct or remove them. Owners can tick lines and remove many
 * at once — handy for COT already paid outside the app.
 */
function BreakdownPanel({ row, lines, isOwner }: { row: QuotaRow; lines: BreakdownLine[]; isOwner: boolean }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allSelected = lines.length > 0 && selected.size === lines.length;

  function toggle(i: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(i);
      else next.delete(i);
      return next;
    });
  }

  function removeSelected() {
    const chosen = [...selected].map((i) => ({ kind: lines[i].kind, refId: lines[i].refId }));
    if (chosen.length === 0) return;
    if (!window.confirm(`Remove ${chosen.length} selected line(s)? This deletes the credits.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeLinesAction(chosen);
      setSelected(new Set());
      if (!res.ok) setError(res.message ?? "Could not remove the lines.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Unpaid projects — {row.pointsUnpaid.toFixed(1)} of {row.pointsEarned.toFixed(1)} earned
          {row.pointsPaid > 0 && (
            <span className="font-normal normal-case">
              {" · "}
              {row.pointsPaid.toFixed(1)} already paid — see{" "}
              <a href="/payroll/history" className="text-primary underline">
                Payment history
              </a>
            </span>
          )}
        </div>
        {isOwner && lines.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || selected.size === 0}
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={removeSelected}
            >
              {pending ? "Removing…" : "Remove selected"}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No point-earning items in this period.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {isOwner && (
            <li className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(lines.map((_, i) => i)))}
                aria-label="Select all"
              />
              Select all
            </li>
          )}
          {lines.map((line, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-md bg-background px-3 py-2 text-sm">
              {/* Controls on their own row so they stay visible no matter how long the title is. */}
              <div className="flex items-center gap-2">
                {isOwner && (
                  <Checkbox
                    checked={selected.has(i)}
                    onCheckedChange={(c) => toggle(i, c === true)}
                    aria-label="Select line"
                  />
                )}
                <Badge variant={line.kind === "adjustment" ? "outline" : "secondary"}>{lineLabel(line)}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{dateFmt.format(new Date(line.dateIso))}</span>
                {isOwner && line.refId ? (
                  // Owner can edit any line's points in place — e.g. drop a COT
                  // to 0.2 when it's an alignment only.
                  <EditableLinePoints kind={line.kind} refId={line.refId} points={line.points} />
                ) : (
                  <span className={`w-12 text-right tabular-nums ${line.points < 0 ? "text-destructive" : ""}`}>
                    {signed(line.points)}
                  </span>
                )}
                {isOwner && (
                  <RemoveLineButton
                    kind={line.kind}
                    refId={line.refId}
                    label={line.subtitle ? `${lineLabel(line)} — ${line.subtitle}` : lineLabel(line)}
                  />
                )}
              </div>
              <span className="break-words pl-6 text-muted-foreground">{line.subtitle ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <ReconcileForm editorId={row.userId} cycleNumber={row.cycleNumber} currentPoints={row.pointsUnpaid} />
      )}
      {isOwner && <AdjustPointsForm editorId={row.userId} editorName={row.fullName} />}
    </div>
  );
}

/**
 * Quota-staff payroll table. Each "Points earned" cell expands to reveal the
 * itemized projects (catalog + COT approvals) and any manual adjustments that
 * make up the figure. The owner additionally gets an inline form to correct an
 * editor's points; those corrections are logged and feed back into the totals.
 */
export function QuotaStaffTable({
  rows,
  breakdown,
  isOwner,
  from,
  to,
}: {
  rows: QuotaRow[];
  breakdown: Record<string, BreakdownLine[]>;
  isOwner: boolean;
  from: string;
  to: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const colSpan = isOwner ? 7 : 4;

  return (
    <div className="overflow-x-auto">
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Unpaid points</TableHead>
          <TableHead>Quota (÷21)</TableHead>
          <TableHead>Remainder</TableHead>
          {isOwner && <TableHead>Rate (₱ / subject)</TableHead>}
          {isOwner && <TableHead className="text-right">Salary</TableHead>}
          {isOwner && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const lines = breakdown[row.userId] ?? [];
          const isOpen = openId === row.userId;
          const canExpand = lines.length > 0 || isOwner;
          return (
            <Fragment key={row.userId}>
              <TableRow>
                <TableCell>{row.fullName}</TableCell>
                <TableCell>
                  {canExpand ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : row.userId)}
                      className="inline-flex items-center gap-1 rounded text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      aria-expanded={isOpen}
                    >
                      <span className="tabular-nums">{row.pointsUnpaid.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.pointsPaid > 0 ? `(of ${row.pointsEarned.toFixed(1)}) ` : ""}
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    <span className="tabular-nums">{row.pointsUnpaid.toFixed(1)}</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  <span className="text-muted-foreground">#{row.cycleNumber} · </span>
                  {row.quotaReached ? (
                    <span className="text-status-approved">✓ {row.pointsUnpaid.toFixed(0)}/21</span>
                  ) : (
                    <span className="text-muted-foreground">{row.pointsUnpaid.toFixed(0)}/21</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{row.remainderCarried.toFixed(1)}</TableCell>
                {isOwner && (
                  <TableCell>
                    <RateCell userId={row.userId} rate={row.rate} field="cycle" />
                    <span className="ml-1 text-xs text-muted-foreground">= {peso.format(row.perSubjectRate)}/pt</span>
                  </TableCell>
                )}
                {isOwner && (
                  <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>
                )}
                {isOwner && (
                  <TableCell>
                    <MarkPaidButton
                      userId={row.userId}
                      salary={row.salary}
                      isPaid={row.isPaid}
                      lastPaidAt={row.lastPaidAt}
                      pointsUnpaid={row.pointsUnpaid}
                      perSubjectRate={row.perSubjectRate}
                      quotaSize={row.perSubjectRate > 0 ? Math.round(row.rate / row.perSubjectRate) : 21}
                      from={from}
                      to={to}
                    />
                  </TableCell>
                )}
              </TableRow>
              {isOpen && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={colSpan} className="py-3">
                    <BreakdownPanel row={row} lines={lines} isOwner={isOwner} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
              No editors yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      </Table>
    </div>
  );
}

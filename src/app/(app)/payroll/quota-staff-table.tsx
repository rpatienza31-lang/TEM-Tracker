"use client";

import { Fragment, useActionState, useState } from "react";

import { DELIVERABLE_TYPE_LABELS, type DeliverableType } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RateCell } from "./rate-cell";
import { AdjustPointsForm } from "./adjust-points-form";
import { adjustPointsAction, editLinePointsAction, type SetRateState } from "./actions";

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
  cyclesCompleted: number;
  pointsEarned: number;
  remainderCarried: number;
  rate: number;
  salary: number;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

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
        step="0.1"
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
 * Owner control to take a wrongly-counted project out of an editor's points.
 * It records a compensating correction (the line's points, negated) rather than
 * touching the underlying approval, so the change is auditable and reversible;
 * the correction shows as its own "Removed: …" line and nets the total.
 */
function RemoveLineButton({ editorId, points, label }: { editorId: string; points: number; label: string }) {
  const [state, formAction, pending] = useActionState(adjustPointsAction, removeInitial);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Remove "${label}" (${signed(points)}) from this editor's points? A compensating correction will be recorded.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="editorId" value={editorId} />
      <input type="hidden" name="points" value={String(-points)} />
      <input type="hidden" name="note" value={`Removed: ${label}`} />
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
 * Quota-staff payroll table. Each "Points earned" cell expands to reveal the
 * itemized projects (catalog + COT approvals) and any manual adjustments that
 * make up the figure. The owner additionally gets an inline form to correct an
 * editor's points; those corrections are logged and feed back into the totals.
 */
export function QuotaStaffTable({
  rows,
  breakdown,
  isOwner,
}: {
  rows: QuotaRow[];
  breakdown: Record<string, BreakdownLine[]>;
  isOwner: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const colSpan = isOwner ? 6 : 4;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Cycles completed</TableHead>
          <TableHead>Points earned</TableHead>
          <TableHead>Remainder carried</TableHead>
          {isOwner && <TableHead>Rate (₱ / cycle)</TableHead>}
          {isOwner && <TableHead className="text-right">Salary</TableHead>}
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
                <TableCell>{row.cyclesCompleted}</TableCell>
                <TableCell>
                  {canExpand ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : row.userId)}
                      className="inline-flex items-center gap-1 rounded text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      aria-expanded={isOpen}
                    >
                      <span className="tabular-nums">{row.pointsEarned.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">
                        ({lines.length} {lines.length === 1 ? "item" : "items"}) {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    <span className="tabular-nums">{row.pointsEarned.toFixed(1)}</span>
                  )}
                </TableCell>
                <TableCell>{row.remainderCarried.toFixed(1)}</TableCell>
                {isOwner && (
                  <TableCell>
                    <RateCell userId={row.userId} rate={row.rate} field="cycle" />
                  </TableCell>
                )}
                {isOwner && (
                  <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>
                )}
              </TableRow>
              {isOpen && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={colSpan} className="py-3">
                    <div className="flex flex-col gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Projects behind {row.pointsEarned.toFixed(1)} points
                      </div>
                      {lines.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No point-earning items in this period.</p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {lines.map((line, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Badge variant={line.kind === "adjustment" ? "outline" : "secondary"}>
                                  {lineLabel(line)}
                                </Badge>
                                <span className="truncate text-muted-foreground">{line.subtitle ?? "—"}</span>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                  {dateFmt.format(new Date(line.dateIso))}
                                </span>
                                {isOwner && line.kind === "adjustment" ? (
                                  <EditableLinePoints kind={line.kind} refId={line.refId} points={line.points} />
                                ) : (
                                  <span
                                    className={`w-12 text-right tabular-nums ${
                                      line.points < 0 ? "text-destructive" : ""
                                    }`}
                                  >
                                    {signed(line.points)}
                                  </span>
                                )}
                                {isOwner && (
                                  <RemoveLineButton
                                    editorId={row.userId}
                                    points={line.points}
                                    label={line.subtitle ? `${lineLabel(line)} — ${line.subtitle}` : lineLabel(line)}
                                  />
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      {isOwner && <AdjustPointsForm editorId={row.userId} editorName={row.fullName} />}
                    </div>
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
  );
}

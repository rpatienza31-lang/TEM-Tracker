"use client";

import { useActionState, useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setSubjectActiveAction, setSubjectPointsAction, type SubjectPointsState } from "./actions";

const initial: SubjectPointsState = { status: "idle" };

/**
 * Owner-only inline editor for a subject's DLP and PPT point values. Inputs sit
 * in their own table cells but post together via a shared form (referenced by
 * id). The Save button appears once a value changes; a brief "Saved" confirms.
 */
function SubjectPointsEditor({ subjectId, dlp, ppt }: { subjectId: string; dlp: number; ppt: number }) {
  const [state, formAction, pending] = useActionState(setSubjectPointsAction, initial);
  const [dlpValue, setDlpValue] = useState(dlp.toString());
  const [pptValue, setPptValue] = useState(ppt.toString());
  const dirty = dlpValue.trim() !== dlp.toString() || pptValue.trim() !== ppt.toString();
  const saved = state.status === "ok" && !dirty;
  const formId = `sp-${subjectId}`;

  return (
    <>
      <TableCell>
        <input type="hidden" name="subjectId" value={subjectId} form={formId} />
        <Input
          name="DLP"
          form={formId}
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          value={dlpValue}
          onChange={(e) => setDlpValue(e.target.value)}
          className="w-20"
          aria-label="DLP points"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            name="PPT"
            form={formId}
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={pptValue}
            onChange={(e) => setPptValue(e.target.value)}
            className="w-20"
            aria-label="PPT points"
          />
          <form id={formId} action={formAction} className="contents">
            {dirty && (
              <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            )}
          </form>
          {saved && <span className="text-xs text-status-approved">Saved ✓</span>}
          {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
        </div>
      </TableCell>
    </>
  );
}

export function SubjectRow({
  subject,
  isOwner,
  dlpPoints,
  pptPoints,
}: {
  subject: { id: string; name: string; shortCode: string; isActive: boolean };
  isOwner: boolean;
  dlpPoints: number;
  pptPoints: number;
}) {
  const [isActive, setIsActive] = useState(subject.isActive);
  const [, startTransition] = useTransition();

  return (
    <TableRow className={!isActive ? "opacity-50" : undefined}>
      <TableCell>{subject.name}</TableCell>
      <TableCell className="text-muted-foreground">{subject.shortCode}</TableCell>
      {isOwner && <SubjectPointsEditor subjectId={subject.id} dlp={dlpPoints} ppt={pptPoints} />}
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !isActive;
            setIsActive(next);
            startTransition(() => setSubjectActiveAction(subject.id, next));
          }}
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

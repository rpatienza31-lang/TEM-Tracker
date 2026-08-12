"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCotOrderAction, type NewCotState } from "./actions";

const initial: NewCotState = { status: "idle" };

/**
 * Manual entry for a COT order that didn't come through the Google-sheet intake
 * (a missed or rejected form row). Creates the order plus its DLP + PPT items.
 */
export function NewCotOrderForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCotOrderAction, initial);

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Add a COT order manually</h2>
          <p className="text-xs text-muted-foreground">For orders that didn&apos;t come through the customer form.</p>
        </div>
        <Button variant={open ? "ghost" : "secondary"} size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "+ New COT order"}
        </Button>
      </div>

      {open && (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer name *">
              <Input name="customerName" required placeholder="e.g. Zara Palomares" />
            </Field>
            <Field label="Order date *">
              <Input name="orderDate" type="date" required />
            </Field>
            <Field label="Order type">
              <select name="orderType" defaultValue="regular" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="regular">Regular (7 days)</option>
                <option value="rush">Rush (5 days)</option>
              </select>
            </Field>
            <Field label="Grade">
              <Input name="grade" type="number" placeholder="e.g. 6" />
            </Field>
            <Field label="Subject">
              <Input name="subjectName" placeholder="e.g. Science" />
            </Field>
            <Field label="Lesson For">
              <select name="lessonFor" defaultValue="" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">—</option>
                <option value="Reclass">Reclass</option>
                <option value="Demo">Demo</option>
              </select>
            </Field>
            <Field label="Topic" className="sm:col-span-2 lg:col-span-3">
              <Input name="topic" placeholder="Lesson topic" />
            </Field>
            <Field label="Competency" className="sm:col-span-2 lg:col-span-3">
              <Input name="competency" placeholder="Optional" />
            </Field>
            <Field label="Indicator">
              <Input name="indicator" placeholder="Optional" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Input name="notes" placeholder="Optional" />
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add order"}
            </Button>
            {state.status === "ok" && <span className="text-sm text-status-approved">{state.message}</span>}
            {state.status === "error" && <span className="text-sm text-destructive">{state.message}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            This creates the order with its COT (DLP) and COT (PPT) deliverables, ready to assign.
          </p>
        </form>
      )}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </label>
  );
}

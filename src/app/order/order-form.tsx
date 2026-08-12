"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPublicCotOrder, type PublicOrderState } from "./actions";

const initial: PublicOrderState = { status: "idle" };

export function OrderForm({ requireCode }: { requireCode: boolean }) {
  const [state, formAction, pending] = useActionState(submitPublicCotOrder, initial);

  if (state.status === "ok") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="text-4xl">✅</span>
        <h2 className="text-lg font-semibold">Order received!</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <a href="/order" className="text-sm text-primary underline">
          Submit another order
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      {/* Honeypot — hidden from people, catches bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {requireCode && (
        <Field label="Access code" required>
          <Input name="accessCode" required placeholder="Enter the code you were given" />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name" required>
          <Input name="customerName" required placeholder="Full name" />
        </Field>
        <Field label="Contact (FB / email / mobile)">
          <Input name="contact" placeholder="So we can reach you" />
        </Field>
        <Field label="Grade level">
          <Input name="grade" inputMode="numeric" placeholder="e.g. 6" />
        </Field>
        <Field label="Subject">
          <Input name="subjectName" placeholder="e.g. Science" />
        </Field>
        <Field label="Lesson for">
          <select name="lessonFor" defaultValue="" className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">—</option>
            <option value="Reclass">Reclass / Demo teaching</option>
            <option value="Demo">Demo</option>
          </select>
        </Field>
        <Field label="Type">
          <select name="orderType" defaultValue="regular" className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="regular">Regular (7 days)</option>
            <option value="rush">Rush (5 days)</option>
          </select>
        </Field>
        <Field label="Topic / lesson" className="sm:col-span-2">
          <Input name="topic" placeholder="What lesson do you need?" />
        </Field>
        <Field label="Competency" className="sm:col-span-2">
          <Input name="competency" placeholder="Optional — from the curriculum guide" />
        </Field>
        <Field label="Indicator">
          <Input name="indicator" placeholder="Optional" />
        </Field>
        <Field label="Notes / other details" className="sm:col-span-2">
          <Input name="notes" placeholder="Anything else we should know" />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Submitting…" : "Submit order"}
        </Button>
        {state.status === "error" && <span className="text-sm text-destructive">{state.message}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </label>
  );
}

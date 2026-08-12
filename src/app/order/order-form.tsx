"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPublicCotOrder, type PublicOrderState } from "./actions";

const initial: PublicOrderState = { status: "idle" };

const TERMS = ["Term 1", "Term 2", "Term 3"];
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
const WEEKS = Array.from({ length: 13 }, (_, i) => i + 1);
const LESSON_FOR = ["Demo", "Reclass", "RQA"];
const INDICATORS = [
  "Teacher I",
  "Teacher II",
  "Teacher III",
  "Teacher IV",
  "Teacher V",
  "Teacher VI",
  "Teacher VII",
  "Master Teacher I",
  "Master Teacher II",
  "Master Teacher III",
];
const LEARNERS = ["Beginner", "Average", "Advanced"];

const selectClass = "h-10 rounded-md border border-input bg-background px-2 text-sm";

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

      <Field
        label="Facebook name"
        required
        hint="Please put your EXACT Facebook name, not your full name, so we can easily find you on the list."
      >
        <Input name="customerName" required placeholder="Exact Facebook name" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Term" required>
          <select name="term" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Select term
            </option>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grade" required>
          <select name="grade" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Select grade
            </option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject" required>
          <Input name="subjectName" required placeholder="e.g. Science" />
        </Field>
        <Field label="Week" required>
          <select name="week" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Select week
            </option>
            {WEEKS.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Topic" required className="sm:col-span-2">
          <Input name="topic" required placeholder="Lesson topic" />
        </Field>
        <Field label="Learning Competency" required className="sm:col-span-2">
          <Input name="competency" required placeholder="From the curriculum guide" />
        </Field>
        <Field label="Lesson For" required>
          <select name="lessonFor" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Select
            </option>
            {LESSON_FOR.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type" required>
          <select name="orderType" defaultValue="regular" className={selectClass}>
            <option value="regular">Regular (7 days)</option>
            <option value="rush">Rush (5 days)</option>
          </select>
        </Field>
      </div>

      <Field label="Type of learners" required hint="Check all that apply (at least one).">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          {LEARNERS.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="learners" value={l} className="h-4 w-4" />
              {l}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            Others:
            <Input name="learnersOther" placeholder="specify" className="h-8 w-40" />
          </label>
        </div>
      </Field>

      <Field
        label="Indicator"
        required
        hint="This is important so we can align the correct indicators with your lesson plan."
      >
        <select name="indicator" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            Select indicator
          </option>
          {INDICATORS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="DepEd email or Gmail"
        required
        hint="We'll send important emails to the address given above. Please make sure it's correct."
      >
        <Input name="email" type="email" required placeholder="name@example.com" />
      </Field>

      <Field label="Note">
        <Input name="notes" placeholder="Anything else we should know" />
      </Field>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium">🚫 Refund Policy</p>
        <p className="mt-0.5 text-muted-foreground">Please keep in mind that we do not provide refunds.</p>
        <label className="mt-2 flex items-center gap-2 font-medium">
          <input type="checkbox" name="refundAgree" required className="h-4 w-4" />
          I agree to the Refund Policy <span className="text-destructive">*</span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Submitting…" : "Submit order"}
        </Button>
        {state.status === "error" && <span className="text-sm text-destructive">{state.message}</span>}
      </div>

      {/* Contact footer */}
      <div className="mt-2 flex flex-col items-center gap-3 border-t border-border pt-5 text-center">
        <p className="text-sm font-medium">
          For inquiries or updates, please message us through our official Facebook account only.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/order-connect.png"
          alt="Connect with us — Teacher Eva &amp; Teacher Manuel on Facebook"
          className="w-full max-w-xl rounded-lg"
          // Hide gracefully until the image file is added to /public.
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCotOrderAction, setCotOrderTypeAction, updateCotOrderAction } from "./actions";

type Order = {
  id: string;
  orderType: "rush" | "regular";
  workKind: "new" | "align";
  grade: number | null;
  subjectName: string | null;
  topic: string | null;
  lessonFor: string | null;
  deadline: string;
  customerName: string;
};

export function CotOrderEdit({ order }: { order: Order }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(order.grade != null ? String(order.grade) : "");
  const [subject, setSubject] = useState(order.subjectName ?? "");
  const [topic, setTopic] = useState(order.topic ?? "");
  const [lessonFor, setLessonFor] = useState(order.lessonFor ?? "");
  const [deadline, setDeadline] = useState(order.deadline);
  const [workKind, setWorkKind] = useState<"new" | "align">(order.workKind);

  const other = order.orderType === "rush" ? "regular" : "rush";

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
      else setOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Owner / admin:</span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setCotOrderTypeAction(order.id, other))}
        >
          Switch to {other === "rush" ? "Rush (5 days)" : "Regular (7 days)"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Edit details"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            if (window.confirm(`Delete the COT order for ${order.customerName}? This cannot be undone.`)) {
              run(() => deleteCotOrderAction(order.id));
            }
          }}
        >
          Delete
        </Button>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`grade-${order.id}`}>
              Grade
            </Label>
            <Input
              id={`grade-${order.id}`}
              type="number"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="h-8 w-20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`subject-${order.id}`}>
              Subject
            </Label>
            <Input
              id={`subject-${order.id}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`topic-${order.id}`}>
              Topic
            </Label>
            <Input
              id={`topic-${order.id}`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-8 w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`lessonfor-${order.id}`}>
              Lesson For
            </Label>
            <select
              id={`lessonfor-${order.id}`}
              value={lessonFor}
              onChange={(e) => setLessonFor(e.target.value)}
              className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">—</option>
              <option value="Reclass">Reclass</option>
              <option value="Demo">Demo</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`workkind-${order.id}`}>
              Work
            </Label>
            <select
              id={`workkind-${order.id}`}
              value={workKind}
              onChange={(e) => setWorkKind(e.target.value as "new" | "align")}
              className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="new">New</option>
              <option value="align">Align only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`deadline-${order.id}`}>
              Deadline (schedule)
            </Label>
            <Input
              id={`deadline-${order.id}`}
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-8 w-40"
            />
          </div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                updateCotOrderAction(
                  order.id,
                  grade.trim() ? Number(grade) : null,
                  subject.trim() || null,
                  topic.trim() || null,
                  lessonFor.trim() || null,
                  deadline || null,
                  workKind,
                ),
              )
            }
          >
            Save
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCotOrderTypeAction, updateCotOrderAction } from "./actions";

type Order = {
  id: string;
  orderType: "rush" | "regular";
  grade: number | null;
  subjectName: string | null;
  topic: string | null;
};

export function CotOrderEdit({ order }: { order: Order }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(order.grade != null ? String(order.grade) : "");
  const [subject, setSubject] = useState(order.subjectName ?? "");
  const [topic, setTopic] = useState(order.topic ?? "");

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
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                updateCotOrderAction(order.id, grade.trim() ? Number(grade) : null, subject.trim() || null, topic.trim() || null),
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

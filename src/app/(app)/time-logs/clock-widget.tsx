"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { clockInAction, clockOutAction } from "@/lib/time-logs/actions";

type Active = { clockInIso: string; clockInLabel: string };

/**
 * Clock In / Clock Out for hourly staff. The recorded time comes from the
 * server (Philippine time); the on-screen elapsed counter is display only.
 */
export function ClockWidget({ active }: { active: Active | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [productivity, setProductivity] = useState("");

  useEffect(() => {
    if (!active) return;
    const start = new Date(active.clockInIso).getTime();
    const tick = () => {
      const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      setElapsed(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
    });
  }

  if (active) {
    const canClockOut = productivity.trim().length > 0;
    return (
      <Card className="border-status-approved/40 bg-status-approved/5">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Clocked in at {active.clockInLabel}</p>
              <p className="text-2xl font-semibold tabular-nums">{elapsed || "0h 00m 00s"}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="productivity">
              Productivity today <span className="text-destructive">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              What did you work on / finish today? Required before you can clock out.
            </p>
            <Textarea
              id="productivity"
              value={productivity}
              onChange={(e) => setProductivity(e.target.value)}
              placeholder="e.g. Finished Grade 3 AralMath Week 7 DLP, started Week 8…"
              rows={3}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col items-end gap-1">
            <Button onClick={() => run(() => clockOutAction(productivity))} disabled={pending || !canClockOut}>
              {pending ? "Clocking out…" : "Clock Out"}
            </Button>
            {!canClockOut && (
              <span className="text-xs text-muted-foreground">Write your productivity above to enable Clock Out.</span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div>
          <p className="text-sm font-medium">You are clocked out</p>
          <p className="text-sm text-muted-foreground">Press Clock In when you start work.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => run(clockInAction)} disabled={pending}>
            {pending ? "Clocking in…" : "Clock In"}
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

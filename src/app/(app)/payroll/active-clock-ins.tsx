"use client";

import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";

type Active = { id: string; userName: string; clockInIso: string; clockInLabel: string };

function elapsed(fromIso: string, now: number) {
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** Live list of staff currently clocked in and how long they've been working. */
export function ActiveClockIns({ active }: { active: Active[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Clocked in now ({active.length})</h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one is clocked in right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((a) => (
            <Card key={a.id} className="border-status-approved/40 bg-status-approved/5">
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{a.userName}</p>
                  <p className="text-xs text-muted-foreground">Since {a.clockInLabel}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{elapsed(a.clockInIso, now)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

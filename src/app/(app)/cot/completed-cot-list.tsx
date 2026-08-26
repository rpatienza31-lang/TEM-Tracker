"use client";

import { useMemo, useState, useTransition } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { type CotOrderView } from "@/lib/cot/queries";
import { backjobCotAction } from "./actions";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function todayPH() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function shortType(type: CotOrderView["items"][number]["type"]) {
  return type === "COT_DLP" || type === "DLP" ? "DLP" : "PPT";
}

/** Per-deliverable "send back as a back job" control (independent DLP/PPT). */
function BackjobControl({ itemId, label }: { itemId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayPH());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-red-600"
      >
        Send {label} to back job
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-red-300 bg-red-50/60 p-2 dark:border-red-800 dark:bg-red-950/30">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        New deadline
        <input
          type="date"
          value={date}
          disabled={pending}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 w-[8rem] rounded border border-input bg-background px-1 text-xs"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !date}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await backjobCotAction(itemId, date);
              if (!r.ok) setError(r.message ?? "Could not send back.");
              else setOpen(false);
            })
          }
          className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Confirm back job"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground underline">
          cancel
        </button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/**
 * Read-only archive of completed COT orders (transaction history). Collapsed
 * rows expand to show every detail — customer, curriculum info, who produced
 * each deliverable, and the finished files — so a done order stays viewable.
 */
export function CompletedCotList({
  orders,
  isOwner,
  isAdmin,
}: {
  orders: CotOrderView[];
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.customerName, o.subjectName, o.topic, o.competency, o.indicator, o.grade ? `grade ${o.grade}` : ""]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [orders, query]);

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search customer, subject, topic, grade…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {orders.length} completed order{orders.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {orders.length === 0 ? "No completed COT orders yet." : "No completed orders match your search."}
        </p>
      )}

      {filtered.map((o) => {
        const isOpen = expanded.has(o.id);
        return (
          <Card key={o.id} className="border-l-4 border-l-emerald-500">
            <CardHeader
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(o.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(o.id);
                }
              }}
              className="cursor-pointer select-none pb-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground" aria-hidden>
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className={`font-semibold ${isOpen ? "text-xl" : "text-base"}`}>{o.customerName}</span>
                  <Badge variant="outline" className="uppercase">
                    {o.orderType}
                  </Badge>
                  {o.lessonFor && <Badge variant="secondary">{o.lessonFor}</Badge>}
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Completed
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">Ordered {o.orderDate}</span>
              </div>
              <p className={`text-muted-foreground ${isOpen ? "text-base" : "text-sm"}`}>
                {[o.grade ? `Grade ${o.grade}` : null, o.subjectName, o.topic].filter(Boolean).join(" · ") || "—"}
              </p>
            </CardHeader>

            {isOpen && (
              <CardContent className="flex flex-col gap-4">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-base sm:grid-cols-2">
                  {o.competency && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Competency</dt>
                      <dd className="font-medium">{o.competency}</dd>
                    </div>
                  )}
                  {o.indicator && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Indicator</dt>
                      <dd className="font-medium">{o.indicator}</dd>
                    </div>
                  )}
                  {o.lessonFor && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Lesson For</dt>
                      <dd className="font-medium">{o.lessonFor}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm text-muted-foreground">Ordered</dt>
                    <dd className="font-medium">{o.orderDate}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Deadline</dt>
                    <dd className="font-medium">{o.deadline}</dd>
                  </div>
                  {isOwner && o.payment && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Payment</dt>
                      <dd className="font-medium">{peso.format(Number(o.payment))}</dd>
                    </div>
                  )}
                </dl>
                {o.notes && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Note</dt>
                    <dd className="whitespace-pre-line text-base">{o.notes}</dd>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Deliverables</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {o.items.map((it) => (
                      <div key={it.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">COT ({shortType(it.type)})</span>
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            {it.status === "uploaded" ? "Uploaded" : "Approved"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">Editor: </span>
                          {it.assigneeName ?? "—"}
                        </p>
                        {it.fileUrl && (
                          <a
                            className="mt-1 inline-block text-sm text-primary underline"
                            href={it.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open file
                          </a>
                        )}
                        {isAdmin && <BackjobControl itemId={it.id} label={`COT (${shortType(it.type)})`} />}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

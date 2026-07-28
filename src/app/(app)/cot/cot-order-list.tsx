"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { type CotOrderView } from "@/lib/cot/queries";
import { type PriorityLevel } from "@/lib/cot/deadline";
import { CotItemControls, type EditorOption } from "./cot-item-controls";
import { CotOrderEdit } from "./cot-order-edit";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const PRIORITY_CLASS: Record<PriorityLevel, string> = {
  overdue: "border-l-red-600 bg-red-50 dark:bg-red-950/30",
  red: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  alert: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/20",
  normal: "border-l-transparent",
};

const PRIORITY_BADGE: Record<PriorityLevel, string> = {
  overdue: "bg-red-600 text-white",
  red: "bg-red-500 text-white",
  alert: "bg-amber-500 text-white",
  normal: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function daysLabel(level: PriorityLevel, daysLeft: number) {
  if (level === "overdue") return `${Math.abs(daysLeft)}d overdue`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

export function CotOrderList({
  orders,
  editors,
  isAdmin,
  isOwner,
  canClaim,
}: {
  orders: CotOrderView[];
  editors: EditorOption[];
  isAdmin: boolean;
  isOwner: boolean;
  canClaim: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.customerName, o.subjectName, o.topic, o.competency, o.indicator, o.grade ? `grade ${o.grade}` : ""]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
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

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {orders.length === 0 ? "No open COT orders right now." : "No orders match your search."}
        </p>
      )}

      {filtered.map((o) => (
        <Card key={o.id} className={`border-l-4 ${PRIORITY_CLASS[o.priority]}`}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{o.customerName}</span>
                <Badge variant="outline" className="uppercase">
                  {o.orderType}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={PRIORITY_BADGE[o.priority]}>{daysLabel(o.priority, o.daysLeft)}</Badge>
                <span className="text-xs text-muted-foreground">Deadline {o.deadline}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {[o.grade ? `Grade ${o.grade}` : null, o.subjectName, o.topic].filter(Boolean).join(" · ") || "—"}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {o.competency && (
                <div>
                  <dt className="text-xs text-muted-foreground">Competency</dt>
                  <dd>{o.competency}</dd>
                </div>
              )}
              {o.indicator && (
                <div>
                  <dt className="text-xs text-muted-foreground">Indicator</dt>
                  <dd>{o.indicator}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Ordered</dt>
                <dd>{o.orderDate}</dd>
              </div>
              {isOwner && o.payment && (
                <div>
                  <dt className="text-xs text-muted-foreground">Payment</dt>
                  <dd>{peso.format(Number(o.payment))}</dd>
                </div>
              )}
            </dl>
            {o.notes && <p className="text-sm text-muted-foreground">Note: {o.notes}</p>}

            {isAdmin && (
              <CotOrderEdit
                order={{
                  id: o.id,
                  orderType: o.orderType,
                  grade: o.grade,
                  subjectName: o.subjectName,
                  topic: o.topic,
                  customerName: o.customerName,
                }}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {o.items.map((item) => (
                <CotItemControls key={item.id} item={item} isAdmin={isAdmin} canClaim={canClaim} editors={editors} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

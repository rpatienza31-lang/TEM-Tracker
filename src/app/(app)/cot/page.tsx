import { requireUser } from "@/lib/auth";
import { getActiveCotOrders } from "@/lib/cot/queries";
import { type PriorityLevel } from "@/lib/cot/deadline";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CotItemControls } from "./cot-item-controls";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const PRIORITY: Record<PriorityLevel, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "border-l-red-600 bg-red-50 dark:bg-red-950/30" },
  red: { label: "Due now", className: "border-l-red-500 bg-red-50 dark:bg-red-950/20" },
  alert: { label: "Soon", className: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/20" },
  normal: { label: "On track", className: "border-l-transparent" },
};

function priorityBadge(level: PriorityLevel, daysLeft: number) {
  const map: Record<PriorityLevel, string> = {
    overdue: "bg-red-600 text-white",
    red: "bg-red-500 text-white",
    alert: "bg-amber-500 text-white",
    normal: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  const text =
    level === "overdue"
      ? `${Math.abs(daysLeft)}d overdue`
      : daysLeft === 0
        ? "Due today"
        : daysLeft === 1
          ? "1 day left"
          : `${daysLeft} days left`;
  return <Badge className={map[level]}>{text}</Badge>;
}

export default async function CotOrdersPage() {
  const user = await requireUser();
  const isAdmin = user.role === "owner" || user.role === "admin";
  const isOwner = user.role === "owner";
  const canClaim = user.role === "editor" || isAdmin;
  const orders = await getActiveCotOrders();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">COT Orders</h1>
        <p className="text-sm text-muted-foreground">
          Customized orders from the customer form. Rush = 5 days, Regular = 7 days. Claim the COT (DLP) and COT (PPT)
          separately — each is worth 0.5 points on approval.
        </p>
      </div>

      {orders.length === 0 && <p className="text-sm text-muted-foreground">No open COT orders right now.</p>}

      <div className="flex flex-col gap-4">
        {orders.map((o) => {
          const p = PRIORITY[o.priority];
          return (
            <Card key={o.id} className={`border-l-4 ${p.className}`}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.customerName}</span>
                    <Badge variant="outline" className="uppercase">
                      {o.orderType}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {priorityBadge(o.priority, o.daysLeft)}
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

                <div className="grid gap-3 sm:grid-cols-2">
                  {o.items.map((item) => (
                    <CotItemControls key={item.id} item={item} isAdmin={isAdmin} canClaim={canClaim} />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

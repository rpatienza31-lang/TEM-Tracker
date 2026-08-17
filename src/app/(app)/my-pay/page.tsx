import { formatInTimeZone } from "date-fns-tz";

import { requireUser } from "@/lib/auth";
import { getMyPayments } from "@/lib/payroll/payments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmReceivedButton } from "./confirm-button";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function fmtDate(d: Date | string) {
  return formatInTimeZone(new Date(d), "Asia/Manila", "MMM d, yyyy");
}

export default async function MyPayPage() {
  const user = await requireUser();
  const payments = await getMyPayments(user.id);

  const pending = payments.filter((p) => !p.receivedAt).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">My Pay</h1>
        <p className="text-sm text-muted-foreground">
          Your recorded payouts. Confirm once you&apos;ve received the amount so it&apos;s marked in the system.
        </p>
      </div>

      {pending > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          You have {pending} payout{pending === 1 ? "" : "s"} awaiting your confirmation.
        </div>
      )}

      {payments.length === 0 && <p className="text-muted-foreground">No payouts recorded yet.</p>}

      <div className="flex flex-col gap-3">
        {payments.map((p) => {
          const net = Number(p.amount) - Number(p.cashAdvance);
          const received = !!p.receivedAt;
          return (
            <Card key={p.id} className={received ? "border-emerald-200 dark:border-emerald-900" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    {peso.format(net)}
                    <Badge variant="outline" className="uppercase">
                      {p.kind === "hourly" ? "Hourly" : "Quota"}
                    </Badge>
                  </span>
                  {received ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      ✓ Received {fmtDate(p.receivedAt!)}
                    </span>
                  ) : (
                    <ConfirmReceivedButton paymentId={p.id} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Period</dt>
                    <dd>{p.periodFrom && p.periodTo ? `${p.periodFrom} → ${p.periodTo}` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{p.kind === "hourly" ? "Hours" : "Points"}</dt>
                    <dd>{Number(p.points)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Gross</dt>
                    <dd>{peso.format(Number(p.amount))}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Cash advance</dt>
                    <dd>{Number(p.cashAdvance) > 0 ? `− ${peso.format(Number(p.cashAdvance))}` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Paid on</dt>
                    <dd>{fmtDate(p.paidAt)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";

import { requireEditorialUser } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getActiveCotOrders, getCompletedCotOrders } from "@/lib/cot/queries";
import { cn } from "@/lib/utils";
import { CotOrderList } from "./cot-order-list";
import { CompletedCotList } from "./completed-cot-list";
import { NewCotOrderForm } from "./new-cot-order-form";

type SearchParams = { view?: string };

export default async function CotOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireEditorialUser();
  const isAdmin = user.role === "owner" || user.role === "admin";
  const isOwner = user.role === "owner";
  const canClaim = user.role === "editor" || isAdmin;
  const sp = await searchParams;
  const view = sp.view === "completed" ? "completed" : "open";

  const [orders, completed, editors] = await Promise.all([
    view === "open" ? getActiveCotOrders() : Promise.resolve([]),
    view === "completed" ? getCompletedCotOrders() : Promise.resolve([]),
    isAdmin && view === "open"
      ? db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(and(eq(users.isActive, true), ne(users.role, "staff")))
          .orderBy(asc(users.fullName))
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">COT Orders</h1>
        <p className="text-sm text-muted-foreground">
          Customized orders from the customer form. Rush = 5 days, Regular = 7 days. Claim the COT (DLP) and COT (PPT)
          separately — each is worth 0.5 points on approval.
        </p>
      </div>

      {/* Open vs Completed tabs */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: "open", label: "Open orders", href: "/cot" },
            { key: "completed", label: "Completed", href: "/cot?view=completed" },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              view === t.key ? "border-foreground bg-foreground text-background" : "hover:bg-accent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {view === "open" ? (
        <>
          {isAdmin && <NewCotOrderForm />}
          <CotOrderList orders={orders} editors={editors} isAdmin={isAdmin} isOwner={isOwner} canClaim={canClaim} />
        </>
      ) : (
        <CompletedCotList orders={completed} isOwner={isOwner} isAdmin={isAdmin} />
      )}
    </div>
  );
}

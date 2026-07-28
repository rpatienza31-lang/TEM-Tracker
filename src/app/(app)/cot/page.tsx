import { asc, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getActiveCotOrders } from "@/lib/cot/queries";
import { CotOrderList } from "./cot-order-list";

export default async function CotOrdersPage() {
  const user = await requireUser();
  const isAdmin = user.role === "owner" || user.role === "admin";
  const isOwner = user.role === "owner";
  const canClaim = user.role === "editor" || isAdmin;

  const [orders, editors] = await Promise.all([
    getActiveCotOrders(),
    isAdmin
      ? db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(eq(users.isActive, true))
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

      <CotOrderList orders={orders} editors={editors} isAdmin={isAdmin} isOwner={isOwner} canClaim={canClaim} />
    </div>
  );
}

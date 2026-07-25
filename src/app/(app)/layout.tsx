import { asc } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { DevPreviewSwitcher } from "@/components/dev-preview-switcher";
import { getLiveAlertsForUser, getNotificationsForBell } from "@/lib/notifications/queries";
import { DEV_PREVIEW_ENABLED } from "@/lib/dev-preview";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ items, unreadCount }, liveAlerts, previewUsers] = await Promise.all([
    getNotificationsForBell(user.id),
    getLiveAlertsForUser(user),
    DEV_PREVIEW_ENABLED
      ? db.select({ email: users.email, fullName: users.fullName, role: users.role }).from(users).orderBy(asc(users.role), asc(users.fullName))
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      {DEV_PREVIEW_ENABLED && <DevPreviewSwitcher users={previewUsers} currentEmail={user.email} />}
      <div className="flex flex-1 flex-col">
        <AppShell
          user={{ id: user.id, fullName: user.fullName, role: user.role, payType: user.payType }}
          notifications={items}
          unreadCount={unreadCount}
          liveAlerts={liveAlerts}
        >
          {children}
        </AppShell>
      </div>
    </div>
  );
}

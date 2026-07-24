import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { getLiveAlertsForUser, getNotificationsForBell } from "@/lib/notifications/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ items, unreadCount }, liveAlerts] = await Promise.all([
    getNotificationsForBell(user.id),
    getLiveAlertsForUser(user),
  ]);

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, role: user.role, payType: user.payType }}
      notifications={items}
      unreadCount={unreadCount}
      liveAlerts={liveAlerts}
    >
      {children}
    </AppShell>
  );
}

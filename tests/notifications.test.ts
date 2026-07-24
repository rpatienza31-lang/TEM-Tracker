import { beforeEach, describe, expect, it } from "vitest";

import { getNotificationsForBell, markNotificationRead } from "@/lib/notifications/queries";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

describe("in-app notifications", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("notifies the assignee when a revision is requested", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });

    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/f" });
    await transitionWorkItem({ action: "request_revision", itemId: item.id, actor: admin, note: "Fix the title." });

    const { items, unreadCount } = await getNotificationsForBell(editor.id);
    expect(unreadCount).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("revision_requested");
    expect(items[0].message).toContain("Fix the title.");
  });

  it("notifies the assignee when their item is approved, and marking it read clears the unread count", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const item = await makeWorkItem({ termId: term.id, subjectId: subject.id });

    await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
    await transitionWorkItem({ action: "submit", itemId: item.id, actor: editor, fileUrl: "https://x.test/f" });
    await transitionWorkItem({ action: "approve", itemId: item.id, actor: { id: admin.id, role: "admin" } as never });

    const before = await getNotificationsForBell(editor.id);
    expect(before.unreadCount).toBe(1);
    expect(before.items[0].type).toBe("approved");

    await markNotificationRead(editor.id, before.items[0].id);

    const after = await getNotificationsForBell(editor.id);
    expect(after.unreadCount).toBe(0);
  });
});

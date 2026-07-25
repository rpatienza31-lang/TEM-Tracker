"use client";

import { useTransition } from "react";

import { setPreviewUserAction } from "@/app/dev-preview/actions";

type PreviewUser = { email: string; fullName: string; role: string };

export function DevPreviewSwitcher({ users, currentEmail }: { users: PreviewUser[]; currentEmail: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 bg-amber-100 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-semibold">Preview mode</span>
      <span className="hidden sm:inline">— viewing as</span>
      <select
        className="rounded border border-amber-300 bg-white px-2 py-0.5 text-amber-900 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100"
        value={currentEmail}
        disabled={isPending}
        onChange={(e) => startTransition(() => setPreviewUserAction(e.target.value))}
      >
        {users.map((u) => (
          <option key={u.email} value={u.email}>
            {u.fullName} ({u.role})
          </option>
        ))}
      </select>
      <span className="hidden text-amber-700 dark:text-amber-400 md:inline">
        dev-only auth bypass — no Supabase required
      </span>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { emailPayslipAction } from "../../actions";

export function EmailPayslipButton({
  userId,
  from,
  to,
  include = "both",
  payAllQuota = false,
}: {
  userId: string;
  from: string;
  to: string;
  include?: "both" | "quota" | "hourly";
  payAllQuota?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function send() {
    setMsg(null);
    startTransition(async () => {
      const result = await emailPayslipAction(userId, from, to, include, payAllQuota);
      setMsg({ ok: result.ok, text: result.ok ? "Payslip emailed to the employee." : (result.message ?? "Failed to send.") });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={send} disabled={pending}>
        {pending ? "Sending…" : "Email to employee"}
      </Button>
      {msg && <span className={`text-xs ${msg.ok ? "text-status-approved" : "text-destructive"}`}>{msg.text}</span>}
    </div>
  );
}

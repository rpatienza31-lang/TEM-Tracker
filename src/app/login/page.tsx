"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";

import { sendMagicLink, signInWithPassword, type LoginState, type PasswordLoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: LoginState = { status: "idle" };
const initialPasswordState: PasswordLoginState = { status: "idle" };

function LinkErrorNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("error") !== "invalid_link") return null;
  const reason = searchParams.get("reason");
  return (
    <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      That sign-in link didn&apos;t work{reason ? ` (${reason})` : ""}. Magic links are single-use and expire — sign in
      with your password below instead.
    </p>
  );
}

export default function LoginPage() {
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, initialPasswordState);
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, initialState);
  const [showMagicLink, setShowMagicLink] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>TEM Tracker</CardTitle>
          <CardDescription>Sign in with your work email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LinkErrorNotice />
          </Suspense>

          <form action={pwAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@temtracker.com" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" disabled={pwPending}>
              {pwPending ? "Signing in…" : "Sign in"}
            </Button>
            {pwState.status === "error" && <p className="text-sm text-destructive">{pwState.message}</p>}
          </form>

          <div className="mt-6 border-t pt-4">
            {!showMagicLink ? (
              <button
                type="button"
                onClick={() => setShowMagicLink(true)}
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Forgot your password? Email me a sign-in link instead
              </button>
            ) : (
              <form action={linkAction} className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  We&apos;ll email a one-time sign-in link to your work email.
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input id="magic-email" name="email" type="email" placeholder="you@temtracker.com" required />
                </div>
                <Button type="submit" variant="secondary" disabled={linkPending}>
                  {linkPending ? "Sending…" : "Send magic link"}
                </Button>
                {linkState.status === "sent" && <p className="text-sm text-status-approved">{linkState.message}</p>}
                {linkState.status === "error" && <p className="text-sm text-destructive">{linkState.message}</p>}
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

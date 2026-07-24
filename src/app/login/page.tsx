"use client";

import { useActionState } from "react";

import { sendMagicLink, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: LoginState = { status: "idle" };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>TEM Tracker</CardTitle>
          <CardDescription>Sign in with a magic link sent to your work email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@temtracker.com" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send magic link"}
            </Button>
            {state.status === "sent" && <p className="text-sm text-status-approved">{state.message}</p>}
            {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

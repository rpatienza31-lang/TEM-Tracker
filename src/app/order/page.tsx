import type { Metadata } from "next";

import { OrderForm } from "./order-form";

export const metadata: Metadata = {
  title: "Order a Custom Lesson (COT) · TEM",
  description: "Request a customized lesson plan from Teacher Eva & Manuel Educational Services.",
};

export default function PublicOrderPage() {
  const requireCode = !!process.env.COT_PUBLIC_CODE;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Order a Customized Lesson (COT)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Teacher Eva &amp; Manuel Educational Services — fill this in and our team will prepare your DLP and PPT.
        </p>
      </div>

      <OrderForm requireCode={requireCode} />

      <p className="text-center text-xs text-muted-foreground">
        Regular orders are ready in 7 days, rush in 5. We&apos;ll reach you using the contact you provide.
      </p>
    </main>
  );
}

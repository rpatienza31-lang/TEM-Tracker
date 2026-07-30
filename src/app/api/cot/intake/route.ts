import { NextResponse, type NextRequest } from "next/server";

import { createCotOrder } from "@/lib/cot/service";
import { phToday, type OrderType } from "@/lib/cot/deadline";

/**
 * Intake webhook for COT customer orders. A Google Apps Script bound to the
 * order form/sheet POSTs each new response here as JSON, authenticated with a
 * shared secret (COT_INTAKE_SECRET) sent in the `x-cot-secret` header or a
 * `secret` field. Idempotent on `externalId`.
 */
function normalizeOrderType(raw: unknown): OrderType {
  return String(raw ?? "").toLowerCase().includes("rush") ? "rush" : "regular";
}

/** Normalizes the form's "Lesson For" answer to "Reclass" or "Demo" when recognizable. */
function normalizeLessonFor(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("reclass")) return "Reclass";
  if (lower.includes("demo")) return "Demo";
  return s;
}

function parseGrade(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const m = String(raw).match(/\d+/);
  return m ? Number(m[0]) : null;
}

function parsePayment(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseOrderDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return phToday();
}

export async function POST(request: NextRequest) {
  const secret = process.env.COT_INTAKE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Intake is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const provided = request.headers.get("x-cot-secret") ?? (typeof body.secret === "string" ? body.secret : "");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const customerName = String(body.customerName ?? body.fbName ?? body.name ?? "").trim();
  if (!customerName) {
    return NextResponse.json({ ok: false, error: "customerName is required." }, { status: 400 });
  }

  const result = await createCotOrder({
    externalId: body.externalId != null ? String(body.externalId) : null,
    customerName,
    grade: parseGrade(body.grade),
    subjectName: body.subject != null ? String(body.subject) : body.subjectName != null ? String(body.subjectName) : null,
    topic: body.topic != null ? String(body.topic) : null,
    competency: body.competency != null ? String(body.competency) : null,
    indicator: body.indicator != null ? String(body.indicator) : null,
    lessonFor: normalizeLessonFor(body.lessonFor ?? body.lesson_for ?? body["lessonFor"]),
    notes: body.notes != null ? String(body.notes) : null,
    payment: parsePayment(body.payment),
    orderType: normalizeOrderType(body.orderType ?? body.type),
    orderDate: parseOrderDate(body.orderDate ?? body.date ?? body.timestamp),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}

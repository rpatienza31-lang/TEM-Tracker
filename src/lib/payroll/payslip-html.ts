const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export type PayslipSession = { dateLabel: string; timeIn: string; timeOut: string; hours: number };
export type PayslipItem = { label: string; detail: string | null; points: number; dateLabel: string };

export type PayslipData = {
  fullName: string;
  from: string;
  to: string;
  quota?: { points: number; perSubjectRate: number; amount: number };
  hourly?: { hours: number; rate: number; amount: number };
  gross: number;
  cashAdvance: number;
  net: number;
  // Page-2 detail: the clock-in/out sessions (hourly) or credited projects (quota).
  hourlySessions?: PayslipSession[];
  quotaItems?: PayslipItem[];
};

const BRAND = "#0f766e"; // deep teal
const INK = "#14201f";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const num = (n: number, d = 2) => n.toFixed(d);

function th(label: string, align = "left") {
  return `<th style="text-align:${align};padding:6px 8px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};">${label}</th>`;
}
function td(content: string, align = "left", bold = false) {
  return `<td style="text-align:${align};padding:7px 8px;font-size:13px;color:${INK};border-bottom:1px solid ${LINE};font-variant-numeric:tabular-nums;${bold ? "font-weight:700;" : ""}">${content}</td>`;
}

/** The second page: clock-in/out sessions (hourly) and/or credited projects (quota). */
function detailPage(d: PayslipData): string {
  const blocks: string[] = [];

  if (d.hourlySessions && d.hourlySessions.length > 0) {
    const total = d.hourlySessions.reduce((s, x) => s + x.hours, 0);
    const rows = d.hourlySessions
      .map(
        (s) =>
          `<tr>${td(esc(s.dateLabel))}${td(esc(s.timeIn), "left")}${td(esc(s.timeOut), "left")}${td(num(s.hours), "right")}</tr>`,
      )
      .join("");
    blocks.push(`
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin-bottom:6px;">Approved clock-in / clock-out</div>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>${th("Date")}${th("Time in")}${th("Time out")}${th("Hours", "right")}</tr>
        ${rows}
        <tr><td colspan="3" style="padding:8px;font-size:13px;font-weight:700;color:${INK};">Total hours</td><td style="padding:8px;text-align:right;font-size:13px;font-weight:700;color:${INK};font-variant-numeric:tabular-nums;">${num(total)}</td></tr>
      </table>`);
  }

  if (d.quotaItems && d.quotaItems.length > 0) {
    const total = d.quotaItems.reduce((s, x) => s + x.points, 0);
    const rows = d.quotaItems
      .map(
        (it) =>
          `<tr>${td(`${esc(it.label)}${it.detail ? ` <span style="color:${MUTED};">· ${esc(it.detail)}</span>` : ""}`)}${td(esc(it.dateLabel), "left")}${td(num(it.points, 1), "right")}</tr>`,
      )
      .join("");
    blocks.push(`
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin:${blocks.length ? "22px" : "0"} 0 6px;">Projects credited to points</div>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>${th("Project")}${th("Date")}${th("Points", "right")}</tr>
        ${rows}
        <tr><td colspan="2" style="padding:8px;font-size:13px;font-weight:700;color:${INK};">Total points</td><td style="padding:8px;text-align:right;font-size:13px;font-weight:700;color:${INK};font-variant-numeric:tabular-nums;">${num(total, 1)}</td></tr>
      </table>`);
  }

  if (blocks.length === 0) return "";

  return `
<div style="page-break-before:always;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:24px auto 0;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
  <div style="background:${BRAND};padding:18px 28px;color:#ffffff;">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">Payslip detail</div>
    <div style="font-size:15px;font-weight:700;margin-top:2px;">${esc(d.fullName)} · ${d.from} → ${d.to}</div>
  </div>
  <div style="padding:22px 28px;">
    ${blocks.join("")}
  </div>
</div>`;
}

function earningRow(label: string, sub: string, amount: number) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};">
        <div style="font-size:14px;color:${INK};">${label}</div>
        <div style="font-size:12px;color:${MUTED};">${sub}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};text-align:right;font-size:14px;color:${INK};font-variant-numeric:tabular-nums;white-space:nowrap;">${peso.format(amount)}</td>
    </tr>`;
}

/**
 * Renders a self-contained, email-safe payslip as an HTML string (inline
 * styles, table layout). Used both for the on-screen payslip and the emailed
 * copy so they always match.
 */
export function renderPayslipHtml(d: PayslipData): string {
  const earnings: string[] = [];
  if (d.quota && d.quota.amount > 0) {
    earnings.push(
      earningRow("Quota output", `${d.quota.points} point(s) × ${peso.format(d.quota.perSubjectRate)}`, d.quota.amount),
    );
  }
  if (d.hourly && d.hourly.amount > 0) {
    earnings.push(earningRow("Hourly work", `${d.hourly.hours.toFixed(2)} hr × ${peso.format(d.hourly.rate)}`, d.hourly.amount));
  }
  if (earnings.length === 0) {
    earnings.push(
      `<tr><td colspan="2" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED};">No earnings recorded this period.</td></tr>`,
    );
  }

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
  <div style="background:${BRAND};padding:24px 28px;color:#ffffff;">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">Payslip</div>
    <div style="font-size:18px;font-weight:700;margin-top:4px;">TEM — Teacher Eva &amp; Manuel Educational Services</div>
  </div>

  <div style="padding:24px 28px;">
    <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:18px;">
      <tr>
        <td style="vertical-align:top;">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">Employee</div>
          <div style="font-size:15px;font-weight:600;color:${INK};">${d.fullName}</div>
        </td>
        <td style="vertical-align:top;text-align:right;">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">Pay period</div>
          <div style="font-size:15px;font-weight:600;color:${INK};">${d.from} → ${d.to}</div>
        </td>
      </tr>
    </table>

    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin-bottom:4px;">Earnings</div>
    <table role="presentation" width="100%" style="border-collapse:collapse;">
      ${earnings.join("")}
      <tr>
        <td style="padding:12px 0 0;font-size:14px;font-weight:700;color:${INK};">Gross pay</td>
        <td style="padding:12px 0 0;text-align:right;font-size:14px;font-weight:700;color:${INK};font-variant-numeric:tabular-nums;">${peso.format(d.gross)}</td>
      </tr>
    </table>

    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin:20px 0 4px;">Deductions</div>
    <table role="presentation" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;font-size:14px;color:${INK};">Cash advance (CA)</td>
        <td style="padding:8px 0;text-align:right;font-size:14px;color:#b91c1c;font-variant-numeric:tabular-nums;">− ${peso.format(d.cashAdvance)}</td>
      </tr>
    </table>

    <div style="margin-top:18px;background:#f0fdfa;border:1px solid ${BRAND}33;border-radius:10px;padding:16px 18px;">
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">Net pay</td>
          <td style="text-align:right;font-size:24px;font-weight:800;color:${BRAND};font-variant-numeric:tabular-nums;">${peso.format(d.net)}</td>
        </tr>
      </table>
    </div>

    <div style="margin-top:18px;font-size:11px;color:${MUTED};">
      Generated ${new Date().toISOString().slice(0, 10)} · Amounts in Philippine peso. This is a computer-generated payslip.
    </div>
  </div>
</div>
${detailPage(d)}`;
}

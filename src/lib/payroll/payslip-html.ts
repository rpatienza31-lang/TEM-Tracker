const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export type PayslipData = {
  fullName: string;
  from: string;
  to: string;
  quota?: { cycles: number; rate: number; amount: number };
  hourly?: { hours: number; rate: number; amount: number };
  gross: number;
  cashAdvance: number;
  net: number;
};

const BRAND = "#0f766e"; // deep teal
const INK = "#14201f";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

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
      earningRow("Quota output", `${d.quota.cycles.toFixed(2)} cycle(s) × ${peso.format(d.quota.rate)}`, d.quota.amount),
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
</div>`;
}

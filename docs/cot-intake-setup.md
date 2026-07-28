# COT Order Intake — Google Form → App

New customer orders from your Google Form flow into the app automatically. A
small Google Apps Script on your responses sheet posts each submission to the
app's intake webhook (`/api/cot/intake`), authenticated with a shared secret.

## 1. Set the shared secret on Vercel

1. Pick any long random string as your secret (e.g. from a password generator).
2. Vercel → project → **Settings → Environment Variables** → add:
   - **Name:** `COT_INTAKE_SECRET`
   - **Value:** your secret
   - Apply to **Production**.
3. **Redeploy** so the new variable takes effect.

## 2. Add the Apps Script to your responses sheet

Open the Google Sheet that collects the form responses →
**Extensions → Apps Script** → paste the script below → **Save**.

- Replace `SECRET` with the exact same value you set on Vercel.
- Adjust `FIELD_MAP` so the right side matches your form's **question titles**.

```javascript
// TEM Tracker — COT order intake
const WEBHOOK_URL = "https://tem-tracker-zzh5.vercel.app/api/cot/intake";
const SECRET = "PASTE_THE_SAME_SECRET_AS_VERCEL";

// Map app fields (left) to YOUR form's question titles (right).
const FIELD_MAP = {
  customerName: "Facebook Name",
  grade: "Grade",
  subject: "Subject",
  topic: "Topic",
  competency: "Competency",
  indicator: "Indicator",
  notes: "Notes",
  payment: "Payment",
  orderType: "Order Type", // the answer should contain "Rush" or "Regular"
};

function onFormSubmit(e) {
  const nv = e.namedValues || {};
  const get = (title) => (nv[title] && nv[title].length ? String(nv[title][0]).trim() : "");

  const payload = {
    secret: SECRET,
    externalId: e.range ? e.range.getSheet().getName() + "!" + e.range.getRow() : String(Date.now()),
    customerName: get(FIELD_MAP.customerName),
    grade: get(FIELD_MAP.grade),
    subject: get(FIELD_MAP.subject),
    topic: get(FIELD_MAP.topic),
    competency: get(FIELD_MAP.competency),
    indicator: get(FIELD_MAP.indicator),
    notes: get(FIELD_MAP.notes),
    payment: get(FIELD_MAP.payment),
    orderType: get(FIELD_MAP.orderType),
    orderDate: Utilities.formatDate(new Date(), "Asia/Manila", "yyyy-MM-dd"),
  };

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "x-cot-secret": SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
```

## 3. Add the trigger

In the Apps Script editor → **Triggers** (clock icon) → **Add Trigger**:

- Function: **onFormSubmit**
- Event source: **From spreadsheet**
- Event type: **On form submit**

Authorize when prompted. Done — every new form submission now creates a COT
order with two deliverables (COT DLP + COT PPT) and its deadline
(Rush = 5 days, Regular = 7 days).

## Testing

Submit a test response to your form. Within a few seconds it should appear on
the **COT Orders** page in the app. If it doesn't, open the Apps Script editor →
**Executions** to see the error (usually a wrong secret or a `FIELD_MAP` title
that doesn't match a form question exactly).

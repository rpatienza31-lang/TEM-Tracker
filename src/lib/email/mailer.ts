import nodemailer from "nodemailer";

/**
 * Sends mail through Gmail SMTP using the same account/App Password set up for
 * Supabase auth email. Configure GMAIL_USER and GMAIL_APP_PASSWORD in the
 * environment. Returns a friendly result rather than throwing.
 */
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; message?: string }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return { ok: false, message: "Email is not configured yet (GMAIL_USER / GMAIL_APP_PASSWORD)." };
  }

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transport.sendMail({
      from: `TEM Tracker <${user}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to send email." };
  }
}

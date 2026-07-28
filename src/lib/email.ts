import nodemailer from "nodemailer";
import { getDb, ObjectId } from "./mongodb";

export type SendEmailInput = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  emailType: string;
  sentById?: string;
};

interface EmailLogDoc {
  _id?: ObjectId;
  toEmail: string;
  ccEmail?: string;
  subject: string;
  body: string;
  emailType: string;
  sentById?: string;
  status: "PENDING" | "SENT" | "FAILED" | "SIMULATED";
  error?: string;
  sentAt?: Date;
  createdAt: Date;
}

type EmailProvider = "resend" | "smtp" | "none";

/**
 * Pick the delivery provider. Resend uses HTTPS (port 443) so it works on
 * hosts that block outbound SMTP ports (e.g. Render's free tier). SMTP is kept
 * as a fallback for local development where Gmail SMTP is reachable.
 */
export function getEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return "none";
}

export function isEmailConfigured(): boolean {
  return getEmailProvider() !== "none";
}

/** Backwards-compatible alias used by existing callers. */
export function isSmtpConfigured(): boolean {
  return isEmailConfigured();
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendViaResend(from: string, input: SendEmailInput): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      cc: input.cc || undefined,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${detail || res.statusText}`);
  }
}

export async function sendEmail(input: SendEmailInput) {
  const from =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "noreply@daichi.local";
  const db = await getDb();
  const emailLogsCol = db.collection<EmailLogDoc>("emailLogs");

  const now = new Date();
  const logDoc: EmailLogDoc = {
    toEmail: input.to,
    ccEmail: input.cc,
    subject: input.subject,
    body: input.html,
    emailType: input.emailType,
    sentById: input.sentById,
    status: "PENDING",
    createdAt: now,
  };

  const insertResult = await emailLogsCol.insertOne(logDoc);
  const logId = insertResult.insertedId;

  const provider = getEmailProvider();

  if (provider === "none") {
    await emailLogsCol.updateOne(
      { _id: logId },
      {
        $set: {
          status: "SIMULATED",
          sentAt: new Date(),
          error:
            "Email not configured — saved to log only (set RESEND_API_KEY, or SMTP_* for local dev)",
        },
      }
    );
    return { ok: true, simulated: true, logId: logId.toString() };
  }

  try {
    if (provider === "resend") {
      await sendViaResend(from, input);
    } else {
      const transport = getTransport()!;
      await transport.sendMail({
        from,
        to: input.to,
        cc: input.cc || undefined,
        subject: input.subject,
        html: input.html,
      });
    }
    await emailLogsCol.updateOne(
      { _id: logId },
      { $set: { status: "SENT", sentAt: new Date() } }
    );
    return { ok: true, simulated: false, logId: logId.toString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    await emailLogsCol.updateOne(
      { _id: logId },
      { $set: { status: "FAILED", error: message } }
    );
    return { ok: false, error: message, logId: logId.toString() };
  }
}

export async function getManagementReportEmails(): Promise<string[]> {
  const db = await getDb();
  const settingsCol = db.collection<{ key: string; value: string }>("appSettings");
  const setting = await settingsCol.findOne({ key: "management_report_emails" });
  if (setting?.value) {
    return setting.value
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }
  const adminEmail = process.env.MANAGEMENT_REPORT_EMAIL;
  return adminEmail ? [adminEmail] : [];
}

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

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(input: SendEmailInput) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@daichi.local";
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

  const transport = getTransport();

  if (!transport) {
    await emailLogsCol.updateOne(
      { _id: logId },
      {
        $set: {
          status: "SIMULATED",
          sentAt: new Date(),
          error: "SMTP not configured — saved to email log only (set SMTP_* in .env)",
        },
      }
    );
    return { ok: true, simulated: true, logId: logId.toString() };
  }

  try {
    await transport.sendMail({
      from,
      to: input.to,
      cc: input.cc || undefined,
      subject: input.subject,
      html: input.html,
    });
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

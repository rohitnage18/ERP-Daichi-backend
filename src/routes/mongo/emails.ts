import { Router } from "express";
import { hash } from "bcryptjs";
import { getDb, User } from "../../lib/mongodb";
import { sendEmail, isEmailConfigured, getEmailProvider } from "../../lib/email";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/status", requireRole("MANAGEMENT_ADMIN"), async (_req, res) => {
  const provider = getEmailProvider();
  return res.json({
    emailConfigured: isEmailConfigured(),
    smtpConfigured: isEmailConfigured(),
    provider,
    from:
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      null,
  });
});

router.get("/logs", requireRole("MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const db = await getDb();
    const logs = await db
      .collection("emailLogs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return res.json(
      logs.map((log) => ({
        id: log._id?.toString(),
        toEmail: log.toEmail,
        ccEmail: log.ccEmail,
        subject: log.subject,
        emailType: log.emailType,
        status: log.status,
        error: log.error,
        sentAt: log.sentAt,
        createdAt: log.createdAt,
      }))
    );
  } catch (error) {
    console.error("Email logs error:", error);
    return res.status(500).json({ error: "Failed to load email logs" });
  }
});

router.post("/send", requireRole("MANAGEMENT_ADMIN", "ACCOUNT"), async (req, res) => {
  try {
    const { to, cc, subject, body, emailType } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "to, subject, and body are required" });
    }

    const html = body.includes("<") ? body : `<p>${String(body).replace(/\n/g, "<br/>")}</p>`;
    const result = await sendEmail({
      to,
      cc,
      subject,
      html,
      emailType: emailType || "CUSTOM",
      sentById: req.user!.id,
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: result.simulated
        ? "Saved to log (configure SMTP_* in backend .env to send real emails)"
        : "Email sent successfully",
    });
  } catch (error) {
    console.error("Email send error:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
});

function inviteEmailHtml(fullName: string, email: string, password: string) {
  const appUrl = process.env.FRONTEND_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `
      <div style="font-family: Arial, sans-serif; max-width: 520px;">
        <h2 style="color: #14532D;">Welcome to Daichi AgriFlow ERP</h2>
        <p>Hello ${fullName},</p>
        <p>Your account is ready. Use the details below to sign in:</p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary password:</strong> ${password}</li>
          <li><strong>Login:</strong> <a href="${appUrl}/login">${appUrl}/login</a></li>
        </ul>
        <p>Please change your password after first login.</p>
        <p style="color: #64748b; font-size: 12px;">Daichi International — Pune</p>
      </div>
    `;
}

router.post("/invite", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const {
      fullName,
      email: emailRaw,
      phone,
      employeeId: employeeIdRaw,
      role,
      zoneId,
      zoneName,
      temporaryPassword,
      resend,
    } = req.body;

    if (!fullName || !emailRaw || !phone || !employeeIdRaw || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const email = String(emailRaw).trim().toLowerCase();
    const employeeId = String(employeeIdRaw).trim();
    const db = await getDb();
    const usersCol = db.collection<User>("users");

    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing =
      (await usersCol.findOne({ email })) ||
      (await usersCol.findOne({ email: { $regex: `^${escaped}$`, $options: "i" } }));

    const password = temporaryPassword || `Daichi@${Math.random().toString(36).slice(2, 8)}`;
    const hashed = await hash(password, 12);
    const now = new Date();

    if (existing) {
      if (!resend) {
        return res.status(409).json({
          error: `${existing.fullName} is already registered with ${email}. Use a different email, or resend login details.`,
          code: "EMAIL_EXISTS",
          existing: {
            id: existing._id?.toString(),
            fullName: existing.fullName,
            email: existing.email,
            role: existing.role,
            status: existing.status,
          },
        });
      }

      await usersCol.updateOne(
        { _id: existing._id },
        {
          $set: {
            password: hashed,
            status: "ACTIVE",
            updatedAt: now,
          },
        }
      );

      const emailResult = await sendEmail({
        to: existing.email || email,
        subject: "Your Daichi AgriFlow ERP login details",
        html: inviteEmailHtml(existing.fullName || fullName, existing.email || email, password),
        emailType: "USER_INVITE",
        sentById: req.user!.id,
      });

      return res.json({
        resent: true,
        user: {
          id: existing._id?.toString(),
          email: existing.email || email,
          fullName: existing.fullName,
          role: existing.role,
        },
        emailResult,
        temporaryPassword: emailResult.simulated ? password : undefined,
      });
    }

    const existingEmp = await usersCol.findOne({ employeeId });
    if (existingEmp) {
      return res.status(409).json({
        error: `Employee ID "${employeeId}" is already used by ${existingEmp.fullName}. Choose a different ID.`,
        code: "EMPLOYEE_ID_EXISTS",
      });
    }

    const user: User = {
      fullName: String(fullName).trim(),
      email,
      phone: String(phone).trim(),
      employeeId,
      role,
      zoneId: zoneId || undefined,
      zoneName: zoneName || undefined,
      password: hashed,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    const result = await usersCol.insertOne(user);

    const emailResult = await sendEmail({
      to: email,
      subject: "Your Daichi AgriFlow ERP account",
      html: inviteEmailHtml(user.fullName, email, password),
      emailType: "USER_INVITE",
      sentById: req.user!.id,
    });

    return res.json({
      user: {
        id: result.insertedId.toString(),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      emailResult,
      temporaryPassword: emailResult.simulated ? password : undefined,
    });
  } catch (error: unknown) {
    const err = error as { code?: number; keyPattern?: Record<string, number> };
    if (err?.code === 11000) {
      const field = err.keyPattern?.email
        ? "email"
        : err.keyPattern?.employeeId
          ? "employee ID"
          : "details";
      return res.status(409).json({
        error: `A user with this ${field} already exists.`,
        code: "DUPLICATE",
      });
    }
    console.error("Invite error:", error);
    return res.status(500).json({ error: "Failed to invite user" });
  }
});

export default router;

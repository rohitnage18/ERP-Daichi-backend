import { Router } from "express";
import { hash } from "bcryptjs";
import prisma from "../lib/prisma";
import { sendEmail } from "../lib/email";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/send", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const { to, cc, subject, body, emailType } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: "to, subject, and body are required",
      });
    }

    const html = body.includes("<") ? body : `<p>${body.replace(/\n/g, "<br/>")}</p>`;
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

    return res.json(result);
  } catch (e) {
    console.error("Email send error:", e);
    return res.status(500).json({ error: "Failed to send email" });
  }
});

router.post("/invite", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      employeeId,
      role,
      zoneId,
      temporaryPassword,
    } = req.body;

    if (!fullName || !email || !phone || !employeeId || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const password = temporaryPassword || `Daichi@${Math.random().toString(36).slice(2, 8)}`;
    const hashed = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        employeeId,
        role,
        zoneId: zoneId || null,
        password: hashed,
        status: "ACTIVE",
      },
    });

    const appUrl = process.env.FRONTEND_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px;">
        <h2 style="color: #1e40af;">Welcome to Daichi AgriFlow ERP</h2>
        <p>Hello ${fullName},</p>
        <p>Your account has been created. Use the details below to sign in:</p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary password:</strong> ${password}</li>
          <li><strong>Login:</strong> <a href="${appUrl}/login">${appUrl}/login</a></li>
        </ul>
        <p>Please change your password after first login.</p>
        <p style="color: #64748b; font-size: 12px;">Daichi International — Pune</p>
      </div>
    `;

    const emailResult = await sendEmail({
      to: email,
      subject: "Your Daichi AgriFlow ERP account",
      html,
      emailType: "USER_INVITE",
      sentById: req.user!.id,
    });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      emailResult,
      temporaryPassword: emailResult.simulated ? password : undefined,
    });
  } catch (e) {
    console.error("Invite error:", e);
    return res.status(500).json({ error: "Failed to invite user" });
  }
});

export default router;

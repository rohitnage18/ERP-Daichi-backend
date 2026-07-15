import { Router } from "express";
import {
  buildMonthlyManagementReportHtml,
  getAgingReport,
  getZoneSalesReport,
} from "../lib/reports";
import { getManagementReportEmails, sendEmail } from "../lib/email";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/sales", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const monthParam = req.query.month as string | undefined;
    const month = monthParam ? new Date(monthParam) : new Date();
    const data = await getZoneSalesReport(month);
    return res.json(data);
  } catch (e) {
    console.error("Sales report error:", e);
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/aging", requireRole("MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const data = await getAgingReport();
    return res.json(data);
  } catch (e) {
    console.error("Aging report error:", e);
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

router.post("/monthly", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const body = req.body ?? {};
    const recipients: string[] =
      body.recipients?.length > 0 ? body.recipients : await getManagementReportEmails();

    if (recipients.length === 0) {
      return res.status(400).json({
        error: "No recipients. Set MANAGEMENT_REPORT_EMAIL in .env or add emails in Settings.",
      });
    }

    const html = await buildMonthlyManagementReportHtml();
    const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
    const subject = `Daichi International — Management Report (${monthLabel})`;

    const results = [];
    for (const to of recipients) {
      const result = await sendEmail({
        to,
        subject,
        html,
        emailType: "MONTHLY_REPORT",
        sentById: req.user!.id,
      });
      results.push({ to, ...result });
    }

    return res.json({ sent: results });
  } catch (e) {
    console.error("Monthly report error:", e);
    return res.status(500).json({ error: "Failed to send report" });
  }
});

router.get("/monthly", requireRole("MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const html = await buildMonthlyManagementReportHtml();
    return res.json({ previewHtml: html });
  } catch (e) {
    console.error("Monthly report preview error:", e);
    return res.status(500).json({ error: "Failed to build preview" });
  }
});

export default router;

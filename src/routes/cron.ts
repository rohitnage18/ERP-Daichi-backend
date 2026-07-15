import { Router } from "express";
import { buildMonthlyManagementReportHtml } from "../lib/reports";
import { getManagementReportEmails, sendEmail } from "../lib/email";

const router = Router();

router.get("/monthly-report", async (req, res) => {
  const secret = req.headers.authorization;
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const recipients = await getManagementReportEmails();
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients configured" });
    }

    const html = await buildMonthlyManagementReportHtml();
    const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
    const subject = `Daichi International — Management Report (${monthLabel})`;

    const results = [];
    for (const to of recipients) {
      results.push(
        await sendEmail({ to, subject, html, emailType: "MONTHLY_REPORT_CRON" })
      );
    }

    return res.json({ sent: results.length, results });
  } catch (e) {
    console.error("Cron monthly report error:", e);
    return res.status(500).json({ error: "Cron failed" });
  }
});

export default router;

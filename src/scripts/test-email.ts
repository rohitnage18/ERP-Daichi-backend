import "dotenv/config";
import nodemailer from "nodemailer";

async function main() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  console.log("SMTP config:", {
    host,
    port,
    user,
    pass: pass ? `set (${pass.length} chars)` : "MISSING",
    from,
  });

  if (!host || !user || !pass) {
    console.error("SMTP not fully configured — aborting.");
    process.exit(1);
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  console.log("\nVerifying SMTP connection/auth...");
  await transport.verify();
  console.log("VERIFY OK — credentials accepted by Gmail.");

  const to = process.argv[2] || user;
  console.log(`\nSending test email to: ${to}`);
  const info = await transport.sendMail({
    from,
    to,
    subject: "Daichi ERP SMTP test",
    html: `<p>SMTP test at ${new Date().toISOString()}</p>`,
  });
  console.log("SENT OK:", info.messageId, info.response);
}

main().catch((err) => {
  console.error("EMAIL TEST FAILED:", err?.message || err);
  process.exit(1);
});

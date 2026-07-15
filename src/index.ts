import "dotenv/config";
import express from "express";
import cors from "cors";
import { mongoApiRouter } from "./routes/mongo";
import { connectMongoDB } from "./lib/mongodb";
import { startDaichiDealerScheduler } from "./lib/daichi-sync-mongo";
import daichiSyncRouter from "./routes/daichiSync";
import daichiDealersRouter from "./routes/daichiDealers";
import exportsRouter from "./routes/exports";

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

function getAllowedOrigins(): string[] {
  const extra = (process.env.FRONTEND_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [frontendUrl, ...extra].filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return true;
  if (/^https:\/\/[\w-]+--[\w-]+\.vercel\.app$/.test(origin)) return true;
  return getAllowedOrigins().includes(origin);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "daichi-api", database: "mongodb" });
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "daichi-api",
    health: "/health",
    api: "/api",
  });
});

app.use("/api", mongoApiRouter);

app.use("/api/sync/daichi", daichiSyncRouter);
app.use("/api/daichi-dealers", daichiDealersRouter);
app.use("/api/exports", exportsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

async function startServer() {
  try {
    await connectMongoDB();
    console.log("MongoDB connected successfully");

    const server = app.listen(port, () => {
      console.log(`Daichi API running on http://localhost:${port}`);
      console.log(`Database: MongoDB Atlas`);
      startDaichiDealerScheduler();
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${port} is already in use. Run: npm run predev  (or stop the other backend on port ${port})`
        );
      } else {
        console.error("Server failed to start:", err.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

import authRoutes from "./routes/auth.routes.js";
import workspacesRoutes from "./routes/workspaces.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import foldersRoutes from "./routes/folders.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import searchRoutes from "./routes/search.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

/**
 * The Express app, with no server attached.
 *
 * Kept separate from server.js so tests can mount it on an ephemeral
 * port instead of fighting the dev server for :4000.
 */
export function createApp() {
  const app = express();

  // Render and similar put a proxy in front, so req.ip would otherwise
  // be the proxy's address and every visitor would share one rate-limit
  // bucket. Only enabled when TRUST_PROXY is set, since trusting the
  // header without a proxy lets anyone spoof their IP.
  if (env.trustProxy) app.set("trust proxy", 1);

  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));

  /**
   * Health check that names what's broken.
   *
   * A single ok/not-ok tells you nothing useful at 3am. This reports
   * each dependency separately, so a failed question can be traced to
   * the database or the AI service without reading three terminals.
   */
  app.get("/health", async (req, res) => {
    const checks = {};

    try {
      await pool.query("SELECT 1");
      checks.database = "ok";
    } catch (err) {
      checks.database = `unreachable: ${err.message}`;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`${env.aiServiceUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);

      const body = await response.json().catch(() => ({}));
      checks.ai_service = response.ok ? (body.status || "ok") : `error ${response.status}`;
    } catch (err) {
      checks.ai_service = err.name === "AbortError" ? "timed out" : "unreachable";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", ...checks });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/workspaces", workspacesRoutes);
  app.use("/api/documents", documentsRoutes);
  app.use("/api/folders", foldersRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/analytics", analyticsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

import authRoutes from "./routes/auth.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import foldersRoutes from "./routes/folders.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import searchRoutes from "./routes/search.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/folders", foldersRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () =>
  console.log(`API listening on http://localhost:${env.port}`)
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}

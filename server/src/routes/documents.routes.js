import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireDocumentPermission } from "../middleware/authorize.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import * as docs from "../controllers/documents.controller.js";
import * as sharing from "../controllers/sharing.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes },
});

const router = Router();
router.use(authenticate);

// The limiter runs before multer, so a rejected request doesn't waste
// time reading the file body into memory first.
router.post("/", uploadLimiter, upload.single("file"), docs.upload);
router.get("/", docs.list);

// Every :id route resolves the caller's permission first.
router.get("/:id",            requireDocumentPermission("view"),     docs.detail);
router.get("/:id/status",     requireDocumentPermission("view"),     docs.status);
router.get("/:id/download",   requireDocumentPermission("download"), docs.download);
router.post("/:id/summary",   requireDocumentPermission("view"),     docs.summarize);
router.post("/:id/retry",     uploadLimiter, requireDocumentPermission("edit"), docs.retry);
router.patch("/:id/folder",   requireDocumentPermission("edit"),     docs.move);
router.post("/:id/tags",      requireDocumentPermission("edit"),     docs.tag);
router.delete("/:id",         requireDocumentPermission("admin"),    docs.remove);

// Sharing lives under the document it applies to.
router.post("/:id/share",                 requireDocumentPermission("admin"), sharing.share);
router.get("/:id/permissions",            requireDocumentPermission("admin"), sharing.list);
router.delete("/:id/permissions/:userId", requireDocumentPermission("admin"), sharing.revoke);

export default router;
import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireWorkspace, requireDocumentPermission } from "../middleware/authorize.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import * as docs from "../controllers/documents.controller.js";
import * as sharing from "../controllers/sharing.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes },
});

const router = Router();
router.use(authenticate);

// Listing and uploading name a workspace; membership is checked first.
// Viewers can read the list but not add to it.
router.get("/", requireWorkspace(), docs.list);
router.post("/", uploadLimiter, upload.single("file"), requireWorkspace("member"), docs.upload);

// Every :id route resolves the caller's permission on that document,
// which includes membership of the document's own workspace. Every
// member has 'view'; anything beyond that comes from being the
// document's owner, a workspace admin, or an explicit share.
//
// Downloading needs only 'view': a student who can read the notes in
// the app can have the PDF too. Restricting the file while showing its
// contents would be theatre, not security.
router.get("/:id",            requireDocumentPermission("view"),  docs.detail);
router.get("/:id/status",     requireDocumentPermission("view"),  docs.status);
router.get("/:id/download",   requireDocumentPermission("view"),  docs.download);
router.post("/:id/summary",   requireDocumentPermission("view"),  docs.summarize);
router.post("/:id/retry",     uploadLimiter, requireDocumentPermission("edit"), docs.retry);
router.patch("/:id/folder",   requireDocumentPermission("edit"),  docs.move);
router.post("/:id/tags",      requireDocumentPermission("edit"),  docs.tag);
router.delete("/:id",         requireDocumentPermission("admin"), docs.remove);

// Sharing lives under the document it applies to.
router.post("/:id/share",                 requireDocumentPermission("admin"), sharing.share);
router.get("/:id/permissions",            requireDocumentPermission("admin"), sharing.list);
router.delete("/:id/permissions/:userId", requireDocumentPermission("admin"), sharing.revoke);

export default router;
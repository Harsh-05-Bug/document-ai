import { asyncHandler, ApiError } from "../utils/ApiError.js";
import { storage, buildStorageKey } from "../storage/index.js";
import * as docs from "../services/document.service.js";
import { getAccessibleDocumentIds } from "../services/permission.service.js";
import { requestIngest, requestSummary } from "../services/aiClient.service.js";
import { logAudit } from "../services/audit.service.js";

const ACCEPTED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

export const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest("Choose a file to upload");
  if (!ACCEPTED.has(req.file.mimetype)) {
    throw ApiError.badRequest("Supported formats: PDF, DOCX, XLSX, TXT, CSV, MD");
  }

  const storageKey = buildStorageKey(req.user.id, req.file.originalname);
  await storage.put(storageKey, req.file.buffer, req.file.mimetype);

  const doc = await docs.createDocumentRecord({
    ownerId: req.user.id,
    filename: req.file.originalname,
    storageKey,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    folderId: req.body.folderId,
    category: req.body.category,
    department: req.user.department,
  });

  // The ai-service acknowledges immediately and processes in the
  // background, so a 40MB PDF doesn't hold the HTTP request open.
  requestIngest({
    documentId: doc.id, storageKey, mimeType: doc.mime_type,
  }).catch(async (err) => {
    console.error("ingest dispatch failed", err);
    await docs.markFailed(doc.id, err.message);
  });

  logAudit({ userId: req.user.id, action: "document.upload", documentId: doc.id,
    metadata: { filename: doc.filename, size_bytes: doc.size_bytes } });

  res.status(201).json(doc);
});

export const list = asyncHandler(async (req, res) => {
  const ids = await getAccessibleDocumentIds(req.user);
  res.json(await docs.listDocumentsForIds(ids, {
    folderId: req.query.folderId, status: req.query.status, tag: req.query.tag,
  }));
});

export const detail = asyncHandler(async (req, res) => {
  const doc = await docs.getDocument(req.params.id);
  logAudit({ userId: req.user.id, action: "document.view", documentId: doc.id });
  res.json({ ...doc, permission: req.documentPermission });
});

export const status = asyncHandler(async (req, res) => {
  const doc = await docs.getDocument(req.params.id);
  res.json({ id: doc.id, status: doc.status, chunk_count: doc.chunk_count, error: doc.error });
});

export const download = asyncHandler(async (req, res) => {
  const doc = await docs.getDocument(req.params.id);
  const stream = await storage.getStream(doc.storage_key);

  logAudit({ userId: req.user.id, action: "document.download", documentId: doc.id });
  res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});

export const remove = asyncHandler(async (req, res) => {
  const deleted = await docs.deleteDocument(req.params.id);
  if (deleted?.storage_key) await storage.remove(deleted.storage_key).catch(console.error);
  logAudit({ userId: req.user.id, action: "document.delete", documentId: req.params.id });
  res.status(204).end();
});

export const move = asyncHandler(async (req, res) => {
  res.json(await docs.moveToFolder(req.params.id, req.body.folderId));
});

export const tag = asyncHandler(async (req, res) => {
  const names = Array.isArray(req.body.tags) ? req.body.tags : [req.body.tag];
  res.status(201).json({ tags: await docs.addTags(req.params.id, names) });
});

export const summarize = asyncHandler(async (req, res) => {
  const doc = await docs.getDocument(req.params.id);
  if (doc.status !== "ready") throw ApiError.badRequest("This document is still being processed");

  if (doc.summary && !req.query.refresh) return res.json({ summary: doc.summary, cached: true });

  const { summary } = await requestSummary({ documentId: doc.id });
  await docs.saveSummary(doc.id, summary);
  logAudit({ userId: req.user.id, action: "document.summarize", documentId: doc.id });
  res.json({ summary, cached: false });
});

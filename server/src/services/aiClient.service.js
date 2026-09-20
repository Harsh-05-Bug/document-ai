import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Thin client for the Python AI service. Every call carries the shared
 * internal key — the ai-service is not meant to be reachable by browsers.
 */
async function post(path, body, { timeoutMs = 60_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${env.aiServiceUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": env.internalApiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ApiError(502, `AI service error (${res.status})`, detail.slice(0, 500));
    }
    return res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new ApiError(504, "The AI service took too long to respond");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const requestIngest = ({ documentId, storageKey, mimeType }) =>
  post("/internal/ingest", {
    document_id: documentId, storage_key: storageKey, mime_type: mimeType,
  }, { timeoutMs: 15_000 });

export const requestQuery = ({ question, allowedDocumentIds, topK }) =>
  post("/internal/query", {
    question, allowed_document_ids: allowedDocumentIds, top_k: topK,
  });

export const requestSemanticSearch = ({ question, allowedDocumentIds, topK }) =>
  post("/internal/search", {
    question, allowed_document_ids: allowedDocumentIds, top_k: topK,
  });

export const requestSummary = ({ documentId }) =>
  post("/internal/summarize", { document_id: documentId }, { timeoutMs: 120_000 });

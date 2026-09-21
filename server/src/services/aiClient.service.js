import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Thin client for the Python AI service. Every call carries the shared
 * internal key — the ai-service is not meant to be reachable by browsers.
 */
const internalHeaders = () => ({
  "Content-Type": "application/json",
  "X-Internal-Key": env.internalApiKey,
});

async function post(path, body, { timeoutMs = 60_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${env.aiServiceUrl}${path}`, {
      method: "POST",
      headers: internalHeaders(),
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

export const requestQuery = ({ question, allowedDocumentIds, topK, history = [] }) =>
  post("/internal/query", {
    question, allowed_document_ids: allowedDocumentIds, top_k: topK, history,
  });

/**
 * Streaming version of requestQuery. Yields one parsed event at a time
 * ({ type: "meta" | "delta" | "done" | "error", ... }) as the AI service
 * sends them, one JSON object per line.
 *
 * If the AI service fails before streaming starts, this throws an
 * ApiError just like requestQuery, so callers can still answer with a
 * normal HTTP error.
 */
export async function* streamQuery({ question, allowedDocumentIds, topK, history = [] }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${env.aiServiceUrl}/internal/query/stream`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        question, allowed_document_ids: allowedDocumentIds, top_k: topK, history,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ApiError(502, `AI service error (${res.status})`, detail.slice(0, 500));
    }

    // Network chunks don't line up with event boundaries, so buffer text
    // and only parse complete lines.
    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });

      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line);
      }
    }

    if (buffer.trim()) yield JSON.parse(buffer);
  } catch (err) {
    if (err.name === "AbortError") throw new ApiError(504, "The AI service took too long to respond");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const requestSemanticSearch = ({ question, allowedDocumentIds, topK }) =>
  post("/internal/search", {
    question, allowed_document_ids: allowedDocumentIds, top_k: topK,
  });

export const requestSummary = ({ documentId }) =>
  post("/internal/summarize", { document_id: documentId }, { timeoutMs: 120_000 });
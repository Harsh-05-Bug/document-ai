import { asyncHandler } from "../utils/ApiError.js";
import { keywordSearch } from "../services/search.service.js";
import { getAccessibleDocumentIds } from "../services/permission.service.js";
import { requestSemanticSearch } from "../services/aiClient.service.js";

/**
 * Search is a second path to the same content as the question endpoint,
 * so it carries the same boundary: the id list comes from the caller's
 * membership of req.workspaceId, and the vector search is filtered by
 * that list before ranking.
 */

export const keyword = asyncHandler(async (req, res) => {
  const ids = await getAccessibleDocumentIds(req.user, req.workspaceId);
  res.json(await keywordSearch(ids, req.query.q));
});

export const semantic = asyncHandler(async (req, res) => {
  const ids = await getAccessibleDocumentIds(req.user, req.workspaceId);
  if (!ids.length) return res.json([]);

  const result = await requestSemanticSearch({
    question: req.query.q, allowedDocumentIds: ids, topK: Number(req.query.k) || 8,
  });
  res.json(result.results);
});

/**
 * Hybrid: keyword hits and vector hits merged with reciprocal rank
 * fusion, which needs no score normalisation between the two systems.
 */
export const hybrid = asyncHandler(async (req, res) => {
  const q = req.query.q;
  const ids = await getAccessibleDocumentIds(req.user, req.workspaceId);
  if (!q?.trim() || !ids.length) return res.json([]);

  const [kw, vec] = await Promise.all([
    keywordSearch(ids, q, 20),
    requestSemanticSearch({ question: q, allowedDocumentIds: ids, topK: 20 })
      .then((r) => r.results)
      .catch(() => []),
  ]);

  const K = 60;
  const merged = new Map();
  const fuse = (list, key, extra) =>
    list.forEach((item, i) => {
      const id = item[key];
      const entry = merged.get(id) || { document_id: id, score: 0, ...extra(item) };
      entry.score += 1 / (K + i + 1);
      merged.set(id, { ...entry, ...extra(item, entry) });
    });

  fuse(kw, "id", (item) => ({
    filename: item.filename, snippet: item.snippet, page_number: item.page_number, keyword_hit: true,
  }));
  fuse(vec, "document_id", (item, entry) => ({
    filename: entry?.filename || item.filename,
    snippet: entry?.snippet || item.content?.slice(0, 240),
    page_number: entry?.page_number ?? item.page_number,
    semantic_hit: true,
    similarity: item.similarity,
  }));

  res.json([...merged.values()].sort((a, b) => b.score - a.score).slice(0, 20));
});
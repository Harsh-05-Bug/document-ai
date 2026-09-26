import { asyncHandler } from "../utils/ApiError.js";
import * as analytics from "../services/analytics.service.js";
import { getAccessibleDocumentIds } from "../services/permission.service.js";

/** Counts cover one workspace: its documents, and your questions in it. */
export const dashboard = asyncHandler(async (req, res) => {
  const ids = await getAccessibleDocumentIds(req.user, req.workspaceId);
  const [totals, top, questions, categories, timeline] = await Promise.all([
    analytics.overview(ids, req.user.id, req.workspaceId),
    analytics.topDocuments(ids),
    analytics.topQuestions(req.user.id, req.workspaceId),
    analytics.categoryBreakdown(ids),
    analytics.activity(req.user.id, req.workspaceId),
  ]);
  res.json({ ...totals, top_documents: top, top_questions: questions,
    categories, activity: timeline });
});
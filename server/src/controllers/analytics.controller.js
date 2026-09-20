import { asyncHandler } from "../utils/ApiError.js";
import * as analytics from "../services/analytics.service.js";
import { getAccessibleDocumentIds } from "../services/permission.service.js";

export const dashboard = asyncHandler(async (req, res) => {
  const ids = await getAccessibleDocumentIds(req.user);
  const [totals, top, questions, categories, timeline] = await Promise.all([
    analytics.overview(ids, req.user.id),
    analytics.topDocuments(ids),
    analytics.topQuestions(req.user.id),
    analytics.categoryBreakdown(ids),
    analytics.activity(req.user.id),
  ]);
  res.json({ ...totals, top_documents: top, top_questions: questions,
    categories, activity: timeline });
});

import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireWorkspace } from "../middleware/authorize.js";
import * as search from "../controllers/search.controller.js";

const router = Router();
router.use(authenticate);
// Every search names a workspace; membership is checked before the query runs.
router.use(requireWorkspace());

router.get("/", search.keyword);          // filename, category, chunk full-text
router.get("/semantic", search.semantic); // pure vector similarity
router.get("/hybrid", search.hybrid);     // both, fused

export default router;
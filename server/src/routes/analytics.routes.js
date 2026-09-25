import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireWorkspace } from "../middleware/authorize.js";
import { dashboard } from "../controllers/analytics.controller.js";

const router = Router();
router.use(authenticate);
router.get("/overview", requireWorkspace(), dashboard);

export default router;
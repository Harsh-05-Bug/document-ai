import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { register, login, me } from "../controllers/auth.controller.js";

const router = Router();

// Limited per IP: brute-force protection, not quota protection.
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

router.get("/me", authenticate, me);

// People to share with now live under the workspace that scopes them:
// GET /api/workspaces/:workspaceId/people

export default router;
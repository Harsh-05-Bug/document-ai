import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { register, login, me, users } from "../controllers/auth.controller.js";

const router = Router();

// Limited per IP: brute-force protection, not quota protection.
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

router.get("/me", authenticate, me);
router.get("/users", authenticate, users);

export default router;
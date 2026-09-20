import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { register, login, me, users } from "../controllers/auth.controller.js";

const router = Router();
router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticate, me);
router.get("/users", authenticate, users);

export default router;

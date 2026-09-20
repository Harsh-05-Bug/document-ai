import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import * as chat from "../controllers/chat.controller.js";

const router = Router();
router.use(authenticate);

router.get("/sessions", chat.listSessions);
router.post("/sessions", chat.createSession);
router.get("/sessions/:sessionId", chat.getSession);
router.post("/sessions/:sessionId/messages", chat.ask);

export default router;

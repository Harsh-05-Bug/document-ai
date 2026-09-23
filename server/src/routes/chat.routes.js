import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { questionLimiter } from "../middleware/rateLimit.js";
import * as chat from "../controllers/chat.controller.js";

const router = Router();
router.use(authenticate);

router.get("/sessions", chat.listSessions);
router.post("/sessions", chat.createSession);
router.get("/sessions/:sessionId", chat.getSession);
router.patch("/sessions/:sessionId", chat.renameSession);
router.delete("/sessions/:sessionId", chat.deleteSession);

// Both ask paths cost an embedding plus a completion, so they share
// one counter — switching to the streaming endpoint isn't a way around it.
router.post("/sessions/:sessionId/messages", questionLimiter, chat.ask);
router.post("/sessions/:sessionId/messages/stream", questionLimiter, chat.askStream);

export default router;
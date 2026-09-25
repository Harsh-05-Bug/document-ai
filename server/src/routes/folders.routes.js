import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireWorkspace } from "../middleware/authorize.js";
import * as folders from "../controllers/folders.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", requireWorkspace(), folders.list);
router.post("/", requireWorkspace("member"), folders.create);

// Deleting names the workspace in the query string so membership is
// checked before the folder id is even looked up.
router.delete("/:id", requireWorkspace("member"), folders.remove);

export default router;
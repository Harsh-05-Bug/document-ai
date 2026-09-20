import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import * as folders from "../controllers/folders.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", folders.list);
router.post("/", folders.create);
router.delete("/:id", folders.remove);

export default router;

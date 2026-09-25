import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireWorkspace } from "../middleware/authorize.js";
import * as ws from "../controllers/workspaces.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", ws.list);
router.post("/", ws.create);

// Joining happens before membership exists, so it can't require it.
router.post("/join/:token", ws.join);

// Everything below names a workspace in the path; requireWorkspace
// resolves it and confirms membership before any handler runs.
router.get("/:workspaceId/members", requireWorkspace(), ws.members);
router.get("/:workspaceId/people",  requireWorkspace(), ws.people);

router.patch("/:workspaceId/members/:userId",  requireWorkspace("owner"), ws.updateMember);
router.delete("/:workspaceId/members/:userId", requireWorkspace("owner"), ws.removeMember);

router.get("/:workspaceId/invites",             requireWorkspace("admin"), ws.listInvites);
router.post("/:workspaceId/invites",            requireWorkspace("admin"), ws.createInvite);
router.delete("/:workspaceId/invites/:inviteId", requireWorkspace("admin"), ws.revokeInvite);

export default router;
import { asyncHandler } from "../utils/ApiError.js";
import * as folders from "../services/folder.service.js";

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await folders.createFolder({
    name: req.body.name,
    parentId: req.body.parentId,
    ownerId: req.user.id,
    // requireWorkspace('member') has already confirmed membership.
    workspaceId: req.workspaceId,
  }));
});

/** Folders are shared within a workspace, like the documents in them. */
export const list = asyncHandler(async (req, res) => {
  res.json(await folders.listFolders(req.workspaceId));
});

export const remove = asyncHandler(async (req, res) => {
  await folders.deleteFolder(req.params.id, req.workspaceId);
  res.status(204).end();
});
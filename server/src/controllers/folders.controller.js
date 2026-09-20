import { asyncHandler } from "../utils/ApiError.js";
import * as folders from "../services/folder.service.js";

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await folders.createFolder({
    name: req.body.name, parentId: req.body.parentId, ownerId: req.user.id,
  }));
});

export const list = asyncHandler(async (req, res) => {
  res.json(await folders.listFolders(req.user.id));
});

export const remove = asyncHandler(async (req, res) => {
  await folders.deleteFolder(req.params.id, req.user.id);
  res.status(204).end();
});

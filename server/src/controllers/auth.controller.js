import { asyncHandler } from "../utils/ApiError.js";
import { registerUser, loginUser, getUserById } from "../services/auth.service.js";
import { listWorkspacesForUser } from "../services/workspace.service.js";

export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await registerUser(req.body));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await loginUser(req.body));
});

/** The signed-in user, plus every workspace they belong to. */
export const me = asyncHandler(async (req, res) => {
  const user = await getUserById(req.user.id);
  const workspaces = await listWorkspacesForUser(req.user.id);
  res.json({ user, workspaces });
});
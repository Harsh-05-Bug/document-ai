import { asyncHandler } from "../utils/ApiError.js";
import { registerUser, loginUser, getUserById, listUsers } from "../services/auth.service.js";

export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await registerUser(req.body));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await loginUser(req.body));
});

export const me = asyncHandler(async (req, res) => {
  res.json(await getUserById(req.user.id));
});

/** Used by the share dialog to pick a colleague. */
export const users = asyncHandler(async (req, res) => {
  res.json(await listUsers());
});

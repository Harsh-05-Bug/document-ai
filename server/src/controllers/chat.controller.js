import { asyncHandler } from "../utils/ApiError.js";
import * as chat from "../services/chat.service.js";

export const createSession = asyncHandler(async (req, res) => {
  res.status(201).json(await chat.createSession(req.user.id, req.body.title));
});

export const listSessions = asyncHandler(async (req, res) => {
  res.json(await chat.listSessions(req.user.id));
});

export const getSession = asyncHandler(async (req, res) => {
  res.json(await chat.getSessionWithMessages(req.params.sessionId, req.user.id));
});

export const ask = asyncHandler(async (req, res) => {
  res.json(await chat.askQuestion({
    user: req.user,
    sessionId: req.params.sessionId,
    question: req.body.question,
    documentId: req.body.documentId,
  }));
});

import { ApiError, asyncHandler } from "../utils/ApiError.js";
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

export const renameSession = asyncHandler(async (req, res) => {
  res.json(await chat.renameSession(req.params.sessionId, req.user.id, req.body.title));
});

export const deleteSession = asyncHandler(async (req, res) => {
  await chat.deleteSession(req.params.sessionId, req.user.id);
  res.status(204).end();
});

export const ask = asyncHandler(async (req, res) => {
  res.json(await chat.askQuestion({
    user: req.user,
    sessionId: req.params.sessionId,
    question: req.body.question,
    documentId: req.body.documentId,
  }));
});

/**
 * Streams the answer to the browser as Server-Sent Events.
 *
 * Headers are sent lazily, on the first event. Until then nothing has
 * been written, so a permission failure or an AI-service outage still
 * becomes a normal JSON error with the right status code. Once the
 * stream has started, the status can no longer change, so errors are
 * sent as an "error" event instead.
 */
export const askStream = async (req, res, next) => {
  let started = false;

  const send = (event) => {
    if (!started) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Stops proxies such as nginx from buffering the whole response.
        "X-Accel-Buffering": "no",
      });
      started = true;
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await chat.askQuestionStream({
      user: req.user,
      sessionId: req.params.sessionId,
      question: req.body.question,
      documentId: req.body.documentId,
      onEvent: send,
    });
    res.end();
  } catch (err) {
    if (!started) return next(err);

    console.error(err);
    // Only show messages meant for users; hide internal details.
    const message =
      err instanceof ApiError && err.status < 500
        ? err.message
        : "Something went wrong while writing the answer. Please try again.";
    send({ type: "error", message });
    res.end();
  }
};
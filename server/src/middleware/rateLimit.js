import { ApiError } from "../utils/ApiError.js";

/**
 * Fixed-window rate limiting, in memory.
 *
 * Each key gets a counter and a window expiry. When the window passes,
 * the counter resets. Simple, and adequate for a single instance.
 *
 * Deliberate trade-offs:
 *  - In memory, so counts reset on restart and aren't shared between
 *    instances. Running more than one process needs Redis instead.
 *  - Fixed windows allow a burst across a boundary (20 at 10:59, 20 at
 *    11:00). A sliding window avoids that at the cost of more state.
 *    For protecting an API quota, the fixed window is enough.
 */

const buckets = new Map();

// Drop expired entries periodically so the map doesn't grow forever.
// unref() lets the process exit even with this timer pending — without
// it, the test suite would hang.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();

/**
 * @param {object}   options
 * @param {number}   options.limit     requests allowed per window
 * @param {number}   options.windowMs  window length in milliseconds
 * @param {string}   options.name      prefix, so different limiters don't share counters
 * @param {function} [options.keyOf]   what to count by; defaults to the user id
 * @param {string}   [options.message] what the user is told when they hit it
 */
export function rateLimit({ limit, windowMs, name, keyOf, message }) {
  const identify = keyOf || ((req) => req.user?.id || req.ip);

  return (req, res, next) => {
    const key = `${name}:${identify(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return next(
        new ApiError(
          429,
          message || "Too many requests. Please wait a moment and try again.",
          `Try again in ${retryAfter}s`
        )
      );
    }

    next();
  };
}

/** Questions are the expensive path: each one costs an embedding plus a completion. */
export const questionLimiter = rateLimit({
  name: "question",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  message: "You've asked a lot of questions in a short time. Please wait a few minutes.",
});

/** Uploads cost embeddings for every chunk, plus storage. */
export const uploadLimiter = rateLimit({
  name: "upload",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  message: "Too many uploads in a short time. Please wait a few minutes.",
});

/**
 * Login is limited per IP rather than per user: someone guessing
 * passwords doesn't have an account yet, and limiting by the submitted
 * email would let an attacker lock a real user out of their own account.
 */
export const authLimiter = rateLimit({
  name: "auth",
  limit: 10,
  windowMs: 15 * 60 * 1000,
  keyOf: (req) => req.ip,
  message: "Too many sign-in attempts. Please wait a few minutes.",
});
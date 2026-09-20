export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = "Not authenticated") { return new ApiError(401, msg); }
  static forbidden(msg = "You don't have access to this document") { return new ApiError(403, msg); }
  static notFound(msg = "Not found") { return new ApiError(404, msg); }
  static conflict(msg) { return new ApiError(409, msg); }
}

/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

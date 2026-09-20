export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // multer surfaces upload problems as its own error class
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "That file is larger than the 25 MB limit" });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "Something went wrong on our side" : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}

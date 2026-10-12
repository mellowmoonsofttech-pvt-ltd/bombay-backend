
export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "This origin is not allowed",
    });
  }

  if (
    err.name === "ValidationError" ||
    err.name === "CastError" ||
    err.name === "SyntaxError" && err.status === 400
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with this unique value already exists",
    });
  }

  console.error("Backend error:", err.message);

  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 500
      ? err.statusCode
      : 500;

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode < 500
        ? err.message
        : "Internal server error",
  });
}

export function errorMiddleware(error, req, res, next) {
  const statusCode =
    error.type === "entity.parse.failed"
      ? 400
      : error.statusCode ?? (error.code === 11000 ? 409 : 500);
  const code =
    error.type === "entity.parse.failed"
      ? "INVALID_JSON"
      : error.code === 11000
        ? "RESOURCE_ALREADY_EXISTS"
        : error.code ?? "INTERNAL_SERVER_ERROR";
  const message =
    error.type === "entity.parse.failed"
      ? "The request body contains invalid JSON."
      : error.code === 11000
        ? "The requested resource already exists."
        : statusCode >= 500 && process.env.NODE_ENV === "production"
      ? "An unexpected error occurred."
      : error.message ?? "An unexpected error occurred.";

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

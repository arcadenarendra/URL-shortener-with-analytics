function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAllowedCorsOrigins() {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getJsonBodyLimit() {
  return process.env.JSON_BODY_LIMIT ?? "10kb";
}

export function getUrlCreationRateLimitConfig() {
  return {
    windowMs: parsePositiveInteger(
      process.env.URL_CREATION_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
    ),
    limit: parsePositiveInteger(process.env.URL_CREATION_RATE_LIMIT_MAX, 30),
  };
}

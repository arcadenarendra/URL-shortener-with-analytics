import { rateLimit } from "express-rate-limit";
import { getUrlCreationRateLimitConfig } from "../config/http.js";

export const urlCreationRateLimit = rateLimit({
  ...getUrlCreationRateLimitConfig(),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many URL creation requests. Please try again later.",
    },
  },
});

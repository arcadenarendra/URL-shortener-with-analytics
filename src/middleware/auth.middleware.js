import jwt from "jsonwebtoken";
import { getJwtSecret } from "../services/auth.service.js";
import { ApiError } from "../utils/ApiError.js";

export function requireAuth(req, res, next) {
  const authorization = req.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      throw new Error("Invalid token payload.");
    }
    req.user = { id: payload.sub };
    next();
  } catch {
    next(new ApiError(401, "INVALID_TOKEN", "The authentication token is invalid."));
  }
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import healthRouter from "./routes/health.routes.js";
import urlRouter from "./routes/url.routes.js";
import redirectRouter from "./routes/redirect.routes.js";
import authRouter from "./routes/auth.routes.js";
import { ApiError } from "./utils/ApiError.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import {
  getAllowedCorsOrigins,
  getJsonBodyLimit,
} from "./config/http.js";

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedCorsOrigins();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new ApiError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed."));
      },
    }),
  );
  app.use(express.json({ limit: getJsonBodyLimit() }));

  app.use("/health", healthRouter);
  app.use("/api/v1/urls", urlRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/", redirectRouter);

  app.use((req, res, next) => {
    next(new ApiError(404, "ROUTE_NOT_FOUND", "The requested route was not found."));
  });

  app.use(errorMiddleware);

  return app;
}

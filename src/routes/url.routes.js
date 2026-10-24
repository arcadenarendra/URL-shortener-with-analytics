import { Router } from "express";
import { createUrlController } from "../controllers/url.controller.js";
import { createUrlSchema, updateUrlSchema } from "../validators/url.validator.js";
import { ApiError } from "../utils/ApiError.js";
import { urlCreationRateLimit } from "../middleware/rateLimit.middleware.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  deleteOwnedUrl,
  getOwnedUrl,
  listUrls,
  updateOwnedUrl,
} from "../services/url.service.js";
import { statsController } from "../controllers/analytics.controller.js";

const urlRouter = Router();

urlRouter.post("/", urlCreationRateLimit, (req, res, next) => {
  const result = createUrlSchema.safeParse(req.body);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    next(new ApiError(400, "VALIDATION_ERROR", message));
    return;
  }

  req.body = result.data;
  createUrlController(req, res, next);
});

urlRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, data: await listUrls(req.user.id, req.query) });
  } catch (error) {
    next(error);
  }
});

urlRouter.get("/:code/stats", requireAuth, statsController);

urlRouter.get("/:code", requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, data: { url: await getOwnedUrl(req.user.id, req.params.code) } });
  } catch (error) {
    next(error);
  }
});

urlRouter.patch("/:code", requireAuth, async (req, res, next) => {
  try {
    const result = updateUrlSchema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      next(new ApiError(400, "VALIDATION_ERROR", message));
      return;
    }
    res.json({
      success: true,
      data: { url: await updateOwnedUrl(req.user.id, req.params.code, result.data) },
    });
  } catch (error) {
    next(error);
  }
});

urlRouter.delete("/:code", requireAuth, async (req, res, next) => {
  try {
    await deleteOwnedUrl(req.user.id, req.params.code);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default urlRouter;

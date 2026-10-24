import { Router } from "express";
import { ApiError } from "../utils/ApiError.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  loginController,
  meController,
  registerController,
} from "../controllers/auth.controller.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      next(new ApiError(400, "VALIDATION_ERROR", message));
      return;
    }
    req.body = result.data;
    next();
  };
}

const authRouter = Router();
authRouter.post("/register", validate(registerSchema), registerController);
authRouter.post("/login", validate(loginSchema), loginController);
authRouter.get("/me", requireAuth, meController);

export default authRouter;

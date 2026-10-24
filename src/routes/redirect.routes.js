import { Router } from "express";
import { redirectController } from "../controllers/redirect.controller.js";

const redirectRouter = Router();

redirectRouter.get("/:code", redirectController);

export default redirectRouter;

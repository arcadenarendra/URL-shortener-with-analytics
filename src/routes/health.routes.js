import { Router } from "express";
import mongoose from "mongoose";

const healthRouter = Router();

healthRouter.get("/", (req, res) => {
  const databaseState = mongoose.connection.readyState === 1 ? "up" : "down";

  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      database: databaseState,
      timestamp: new Date().toISOString(),
    },
  });
});

export default healthRouter;

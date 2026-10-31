import "dotenv/config";
import http from "node:http";
import { createApp } from "./app.js";
import {
  connectToDatabase,
  disconnectFromDatabase,
} from "./config/database.js";
import { disconnectFromRedis } from "./config/redis.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = createApp();
let server;

async function startServer() {
  await connectToDatabase(process.env.MONGODB_URI);

  server = http.createServer(app);
  server.listen(port, "0.0.0.0", () => {
    console.log(`URL shortener API listening on port ${port}.`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully.`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await disconnectFromDatabase();
  await disconnectFromRedis();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

startServer().catch((error) => {
  console.error("Failed to start server.", error);
  process.exit(1);
});

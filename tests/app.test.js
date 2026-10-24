import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

function appRequest() {
  return request(createApp());
}

describe("HTTP API boundary", () => {
  it("returns health status and security headers", async () => {
    const response = await appRequest().get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("returns a safe validation error for malformed URL input", async () => {
    const response = await appRequest()
      .post("/api/v1/urls")
      .send({ originalUrl: "not-a-url" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a safe error for malformed JSON", async () => {
    const response = await appRequest()
      .post("/api/v1/urls")
      .set("Content-Type", "application/json")
      .send("{invalid");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("does not let the redirect route capture protected API paths", async () => {
    const response = await appRequest().get("/api/v1/urls/example");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("protects analytics statistics with authentication", async () => {
    const response = await appRequest().get("/api/v1/urls/example/stats");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});

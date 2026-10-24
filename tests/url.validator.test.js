import { describe, expect, it } from "vitest";
import { createUrlSchema } from "../src/validators/url.validator.js";

describe("URL creation validation", () => {
  it("accepts HTTP and HTTPS destinations", () => {
    expect(
      createUrlSchema.safeParse({ originalUrl: "http://example.com" }).success,
    ).toBe(true);
    expect(
      createUrlSchema.safeParse({ originalUrl: "https://example.com" }).success,
    ).toBe(true);
  });

  it("rejects malformed and unsupported destination URLs", () => {
    for (const originalUrl of ["not-a-url", "javascript:alert(1)", "ftp://example.com"]) {
      expect(createUrlSchema.safeParse({ originalUrl }).success).toBe(false);
    }
  });

  it("rejects unknown fields and past expiration dates", () => {
    expect(
      createUrlSchema.safeParse({
        originalUrl: "https://example.com",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      createUrlSchema.safeParse({
        originalUrl: "https://example.com",
        expiresAt: "2020-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});

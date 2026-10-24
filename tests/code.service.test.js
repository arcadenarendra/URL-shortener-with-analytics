import { describe, expect, it, vi } from "vitest";
import {
  generateAvailableCode,
  generateCode,
  validateCustomAlias,
} from "../src/services/code.service.js";

describe("code service", () => {
  it("generates URL-safe codes with the configured default length", () => {
    const code = generateCode();

    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code).toHaveLength(7);
  });

  it("rejects invalid and reserved aliases", () => {
    expect(validateCustomAlias("valid_42")).toBe(true);
    expect(validateCustomAlias("api")).toBe(false);
    expect(validateCustomAlias("bad alias")).toBe(false);
    expect(validateCustomAlias("abc")).toBe(false);
  });

  it("retries collisions and returns the first available code", async () => {
    const codeExists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(generateAvailableCode(codeExists)).resolves.toHaveLength(7);
    expect(codeExists).toHaveBeenCalledTimes(2);
  });

  it("fails after the configured retry limit", async () => {
    vi.stubEnv("MAX_CODE_GENERATION_ATTEMPTS", "2");

    await expect(generateAvailableCode(() => true)).rejects.toThrow(
      "after 2 attempts",
    );

    vi.unstubAllEnvs();
  });
});

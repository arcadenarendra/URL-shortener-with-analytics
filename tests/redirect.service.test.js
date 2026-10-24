import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneAndUpdate = vi.fn();

vi.mock("../src/models/url.model.js", () => ({
  default: {
    findOneAndUpdate,
  },
}));

const { resolveAndRecordRedirect } = await import(
  "../src/services/redirect.service.js"
);

describe("redirect service", () => {
  beforeEach(() => {
    findOneAndUpdate.mockReset();
  });

  it("returns the destination after atomically recording a click", async () => {
    findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: "url-id",
        originalUrl: "https://example.com",
      }),
    });

    await expect(resolveAndRecordRedirect("abc1234")).resolves.toEqual({
      id: "url-id",
      originalUrl: "https://example.com",
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        shortCode: "abc1234",
        isActive: true,
      }),
      { $inc: { clickCount: 1 } },
      expect.objectContaining({ new: true }),
    );
  });

  it.each(["missing", "expired", "inactive"])(
    "returns URL_NOT_FOUND for %s links",
    async () => {
      findOneAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(resolveAndRecordRedirect("abc1234")).rejects.toMatchObject({
        statusCode: 404,
        code: "URL_NOT_FOUND",
      });
    },
  );
});

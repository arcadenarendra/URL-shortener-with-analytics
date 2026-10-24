import { describe, expect, it } from "vitest";
import ClickEvent from "../src/models/clickEvent.model.js";

describe("click event model", () => {
  it("defines the URL and time indexes used by analytics queries", () => {
    expect(ClickEvent.schema.indexes()).toContainEqual([
      { urlId: 1, clickedAt: -1 },
      { background: true },
    ]);
    expect(ClickEvent.schema.path("referrer").options.maxlength).toBe(2048);
    expect(ClickEvent.schema.path("userAgent").options.maxlength).toBe(512);
  });
});

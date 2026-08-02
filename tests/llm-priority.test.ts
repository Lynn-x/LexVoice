import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

import { getLlmRequestPriority } from "../src/llm/core";

describe("getLlmRequestPriority", () => {
  it("keeps explicit user work ahead of normal and background work", () => {
    expect(getLlmRequestPriority({ priority: "user" })).toBe(0);
    expect(getLlmRequestPriority({ priority: "normal" })).toBe(1);
    expect(getLlmRequestPriority({ priority: "background" })).toBe(2);
  });

  it("keeps optional suggestions below the realtime outline", () => {
    expect(getLlmRequestPriority({ priority: "idle" })).toBe(3);
    expect(getLlmRequestPriority({ priority: "suggestion" })).toBe(3);
    expect(getLlmRequestPriority({ priority: "optional" })).toBe(3);
  });
});

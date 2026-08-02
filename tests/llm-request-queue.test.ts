import { describe, expect, it, vi } from "vitest";
import { LlmRequestQueue } from "../src/llm/request-queue";

describe("LlmRequestQueue", () => {
  it("removes an aborted request before it starts", async () => {
    const queue = new LlmRequestQueue();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = queue.enqueue(1, async () => {
      await firstGate;
      return "first";
    });
    const controller = new AbortController();
    const secondRun = vi.fn(async () => "second");
    const second = queue.enqueue(2, secondRun, controller.signal);

    controller.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(secondRun).not.toHaveBeenCalled();
    expect(queue.items).toHaveLength(0);

    releaseFirst();
    await expect(first).resolves.toBe("first");
  });

  it("rejects an already-aborted request without enqueueing it", async () => {
    const queue = new LlmRequestQueue();
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(async () => "never");

    await expect(queue.enqueue(1, run, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
    expect(queue.items).toHaveLength(0);
  });

  it("keeps interactive work ahead of a background outline before the wait limit", async () => {
    let now = 0;
    const queue = new LlmRequestQueue({
      now: () => now,
      backgroundMaxWaitMs: 15_000,
    });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = queue.enqueue(1, async () => {
      await firstGate;
      order.push("first");
    });
    const outline = queue.enqueue(2, async () => {
      order.push("outline");
    });
    now = 10_000;
    const question = queue.enqueue(0, async () => {
      order.push("question");
    });

    releaseFirst();
    await Promise.all([first, outline, question]);

    expect(order).toEqual(["first", "question", "outline"]);
  });

  it("runs an overdue background outline before newer interactive work", async () => {
    let now = 0;
    const queue = new LlmRequestQueue({
      now: () => now,
      backgroundMaxWaitMs: 15_000,
    });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = queue.enqueue(1, async () => {
      await firstGate;
      order.push("first");
    });
    const outline = queue.enqueue(2, async () => {
      order.push("outline");
    });
    now = 16_000;
    const question = queue.enqueue(0, async () => {
      order.push("question");
    });
    const suggestion = queue.enqueue(3, async () => {
      order.push("suggestion");
    });

    releaseFirst();
    await Promise.all([first, outline, question, suggestion]);

    expect(order).toEqual(["first", "outline", "question", "suggestion"]);
  });

  it("runs an overdue outline during sustained interactive traffic", async () => {
    let now = 0;
    const queue = new LlmRequestQueue({
      now: () => now,
      backgroundMaxWaitMs: 15_000,
    });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = queue.enqueue(1, async () => {
      await firstGate;
      order.push("first");
    });
    const outline = queue.enqueue(2, async () => {
      order.push("outline");
    });

    now = 16_000;
    const questions = [1, 2, 3].map((index) => queue.enqueue(0, async () => {
      order.push(`question-${index}`);
    }));

    releaseFirst();
    await Promise.all([first, outline, ...questions]);

    expect(order).toEqual(["first", "outline", "question-1", "question-2", "question-3"]);
  });
});

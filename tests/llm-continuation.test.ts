import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

import { callLlmWithContinuation } from "../src/llm/core";

function jsonResponse(content, finishReason) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }],
    }),
    text: async () => "",
  };
}

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify({ error: { message } }),
  };
}

function makePlugin() {
  return {
    settings: {
      llmEndpoint: "https://api.deepseek.com/v1",
      llmApiKey: "test-key",
      llmModel: "model",
    },
    addTaskMeter: vi.fn(),
  };
}

describe("callLlmWithContinuation", () => {
  let fetchMock;
  let previousWindow;

  beforeEach(() => {
    previousWindow = globalThis.window;
    fetchMock = vi.fn();
    globalThis.window = { fetch: fetchMock, setTimeout, clearTimeout };
  });

  afterEach(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  it("拼接有正文但被长度上限截断的后续输出", async () => {
    const requestBodies = [];
    fetchMock.mockImplementation(async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      return requestBodies.length === 1
        ? jsonResponse("正文", "length")
        : jsonResponse("后半", "stop");
    });
    const optionReceivers = [];
    const options = {
      stream: false,
      noRetry: true,
      skipQueue: true,
      get thinkingMode() {
        optionReceivers.push(this);
        return "reasoning";
      },
    };

    const result = await callLlmWithContinuation(makePlugin(), "系统提示", "原始任务", options);

    expect(result).toEqual({
      text: "正文后半",
      finishReason: "stop",
      truncated: false,
      continuations: 1,
    });
    expect(requestBodies[1].messages[2]).toEqual({ role: "assistant", content: "正文" });
    expect(optionReceivers[1]).toBe(options);
  });

  it("空输出被截断时关闭思考模式重试原始任务", async () => {
    const requestBodies = [];
    fetchMock.mockImplementation(async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      return requestBodies.length === 1
        ? jsonResponse("", "length")
        : jsonResponse("完整正文", "stop");
    });

    const result = await callLlmWithContinuation(makePlugin(), "系统提示", "原始任务", {
      stream: false,
      noRetry: true,
      skipQueue: true,
      thinkingMode: "reasoning",
    });

    expect(result).toEqual({
      text: "完整正文",
      finishReason: "stop",
      truncated: false,
      continuations: 0,
    });
    expect(requestBodies[1].messages).toEqual(requestBodies[0].messages);
    expect(requestBodies[1].thinking).toEqual({ type: "disabled" });
  });

  it("fast 重试仍被截断时继续拼接已获得的正文", async () => {
    const requestBodies = [];
    fetchMock.mockImplementation(async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      if (requestBodies.length === 1) return jsonResponse("", "length");
      if (requestBodies.length === 2) return jsonResponse("部分", "length");
      return jsonResponse("后续", "stop");
    });

    const result = await callLlmWithContinuation(makePlugin(), "系统提示", "原始任务", {
      stream: false,
      noRetry: true,
      skipQueue: true,
      thinkingMode: "reasoning",
    });

    expect(result).toEqual({
      text: "部分后续",
      finishReason: "stop",
      truncated: false,
      continuations: 1,
    });
    expect(requestBodies[2].thinking).toEqual({ type: "disabled" });
    expect(requestBodies[2].messages[2]).toEqual({ role: "assistant", content: "部分" });
  });

  it("fast 重试失败时使用没有 assistant 预填的完整回答兜底", async () => {
    const requestBodies = [];
    fetchMock.mockImplementation(async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      if (requestBodies.length === 1) return jsonResponse("", "length");
      if (requestBodies.length === 2) return errorResponse(400, "retry failed");
      return jsonResponse("完整回答", "stop");
    });

    const result = await callLlmWithContinuation(makePlugin(), "系统提示", "原始任务", {
      stream: false,
      noRetry: true,
      skipQueue: true,
      thinkingMode: "reasoning",
    });

    expect(result.text).toBe("完整回答");
    expect(result.continuations).toBe(1);
    expect(requestBodies[2].messages.some((message) => message.role === "assistant")).toBe(false);
    expect(requestBodies[2].messages[2].content).toContain("请忽略截断状态，直接完整回答原始任务");
  });

  it("空响应始终被截断时仍在有界次数内终止", async () => {
    let requestCount = 0;
    fetchMock.mockImplementation(async () => {
      requestCount++;
      return jsonResponse("", "length");
    });
    const maxContinuations = 2;

    const result = await callLlmWithContinuation(makePlugin(), "系统提示", "原始任务", {
      stream: false,
      noRetry: true,
      skipQueue: true,
      thinkingMode: "reasoning",
    }, { maxContinuations });

    expect(result.continuations).toBeLessThanOrEqual(maxContinuations);
    expect(requestCount).toBeLessThanOrEqual(2 + maxContinuations);
  });
});

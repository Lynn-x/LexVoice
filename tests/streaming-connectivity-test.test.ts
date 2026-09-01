import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ Platform: { isMobile: false, isMobileApp: false, isDesktopApp: true } }));

import {
  createStreamingTranscriptionClient,
  isStreamingTranscribeProfile,
  testStreamingTranscribeConnectivity,
} from "../src/asr/clients";
import { getServiceEndpointSecurityIssue } from "../src/shared/util-llm-endpoint";

const streamingProfile = { transcribeMode: "streaming", streamProtocol: "openai-realtime-transcription" };
const segmentedProfile = { transcribeMode: "segmented" };
const wssProvider = { endpoint: "wss://asr.example/v1/realtime?model=qwen3-asr", apiKey: "k", model: "qwen3-asr" };

// 每帧 wait 都立即返回，测试不必真的等 1.2 秒。
const noWait = () => Promise.resolve();

function fakeClient(overrides = {}) {
  const calls = { connect: 0, frames: 0, finish: 0, safeClose: 0 };
  const client = Object.assign({
    sampleRate: 24000,
    connect: () => { calls.connect++; return Promise.resolve(); },
    sendAudioFrame: () => { calls.frames++; },
    finish: () => { calls.finish++; return Promise.resolve(); },
    getFullText: () => "",
    _safeClose: () => { calls.safeClose++; },
  }, overrides);
  return { client, calls };
}

describe("streaming ASR connectivity self-test", () => {
  it("keeps the wss:// endpoint off the HTTP upload path that rejects it", () => {
    // 连通性测试此前无条件走 transcribeAudio()，也就是这条 "http" 校验——流式服务必挂在这里。
    expect(getServiceEndpointSecurityIssue(wssProvider.endpoint, "http", "转写服务地址"))
      .toContain("协议不受支持");
    expect(getServiceEndpointSecurityIssue(wssProvider.endpoint, "websocket", "实时转写服务地址"))
      .toBe("");
    expect(isStreamingTranscribeProfile(streamingProfile)).toBe(true);
    expect(isStreamingTranscribeProfile(segmentedProfile)).toBe(false);
    expect(isStreamingTranscribeProfile(null)).toBe(false);
  });

  it("connects, streams one second of silence, and closes the session", async () => {
    const { client, calls } = fakeClient();
    const text = await testStreamingTranscribeConnectivity(streamingProfile, wssProvider, {
      createClient: () => client,
      wait: noWait,
    });
    expect(calls.connect).toBe(1);
    expect(calls.frames).toBe(10); // 10 帧 × 100ms = 1 秒
    expect(calls.finish).toBe(1);
    // 静音不触发 VAD，空文本是成功结果：验的是连得上，不是认得出。
    expect(text).toBe("");
  });

  it("surfaces a server-side rejection that only arrives after the first audio frame", async () => {
    let onErrorCb;
    let frames = 0;
    const { client, calls } = fakeClient({
      sendAudioFrame: () => { frames++; if (onErrorCb) onErrorCb(new Error("OpenAI Realtime 错误：unknown model")); },
    });
    await expect(testStreamingTranscribeConnectivity(streamingProfile, wssProvider, {
      createClient: (_p, _v, cbs) => { onErrorCb = cbs.onError; return client; },
      wait: noWait,
    })).rejects.toThrow("unknown model");
    expect(frames).toBe(1); // 收到 error 后不再继续灌音频
    expect(calls.finish).toBe(1);
  });

  it("does not wait on finish() when the handshake itself failed", async () => {
    const { client, calls } = fakeClient({
      connect: () => Promise.reject(new Error("实时转写服务地址协议不受支持")),
    });
    await expect(testStreamingTranscribeConnectivity(streamingProfile, wssProvider, {
      createClient: () => client,
      wait: noWait,
    })).rejects.toThrow("实时转写服务地址协议不受支持");
    expect(calls.finish).toBe(0); // 否则白等客户端 5 秒的收网超时
    expect(calls.safeClose).toBe(1);
  });

  it("routes each streaming protocol to its own client and passes the endpoint through unchanged", () => {
    const cbs = { onPartial() {}, onError() {}, onClosed() {} };
    const realtime = createStreamingTranscriptionClient(streamingProfile, wssProvider, cbs);
    expect(realtime.constructor.name).toBe("OpenAIRealtimeTranscriptionClient");
    expect(realtime.endpoint).toBe(wssProvider.endpoint);
    expect(realtime.sampleRate).toBe(24000);

    const translate = createStreamingTranscriptionClient(
      { streamProtocol: "openai-realtime-translation" },
      { endpoint: "wss://asr.example/v1/realtime/translations", model: "m", targetLanguage: "zh" },
      cbs,
    );
    expect(translate.constructor.name).toBe("OpenAIRealtimeTranslationClient");
    expect(translate.targetLanguage).toBe("zh");

    const dashscope = createStreamingTranscriptionClient(
      { streamProtocol: "dashscope-ws" },
      { endpoint: "wss://dashscope.example/api-ws/v1/inference", model: "paraformer-realtime-v2" },
      cbs,
    );
    expect(dashscope.constructor.name).toBe("DashScopeStreamingClient");
    expect(dashscope.sampleRate).toBe(16000);
  });
});

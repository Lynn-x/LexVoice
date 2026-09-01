/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck — JS 风格协议类（构造器赋值、无 TS 字段声明）；已用 tsc 确认无漏引用(TS2304=0)，余者皆类字段类型噪音，故与 main.ts 同档跳过。
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import { assertSafeServiceEndpoint } from '../shared/util-llm-endpoint';
import { isLexVoiceMobileRuntime } from '../shared/util-platform';

let nodeWebSocketCtorPromise = null;

async function getNodeWebSocketCtor() {
  if (isLexVoiceMobileRuntime()) return null;
  if (!nodeWebSocketCtorPromise) {
    nodeWebSocketCtorPromise = import('ws')
      .then((wsModule) => wsModule && (wsModule.WebSocket || wsModule.default || wsModule))
      .catch(() => null);
  }
  return nodeWebSocketCtorPromise;
}

async function requireHeaderCapableWebSocket(serviceLabel) {
  const WSCtor = await getNodeWebSocketCtor();
  if (WSCtor) return WSCtor;
  throw new Error(`${serviceLabel}的实时流式转写需要桌面端 WebSocket；移动端请改用分段转写或整段音频转写。`);
}

export class DashScopeStreamingClient {
  constructor(opts) {
    this.endpoint = opts.endpoint || "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
    this.apiKey = opts.apiKey;
    this.model = opts.model || "paraformer-realtime-v2";
    this.language = String(opts.language || "").trim().toLowerCase();
    this.sampleRate = opts.sampleRate || 16000;
    this.onPartial = opts.onPartial || (() => { /* intentionally empty */ });
    this.onError = opts.onError || ((e) => console.error("[DashScopeStream]", e));
    this.onClosed = opts.onClosed || (() => { /* intentionally empty */ });
    this.taskId = "lvtask-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    this.ws = null;
    this.started = false;
    this.finishing = false;
    this.closed = false;
    this._finalizedText = "";
    this._currentPartial = "";
  }
  async connect() {
    assertSafeServiceEndpoint(this.endpoint, "websocket", "实时转写服务地址");
    if (!this.apiKey) throw new Error("DashScope API Key 未配置");
    const WSCtor = await requireHeaderCapableWebSocket("DashScope");
    return new Promise((resolve, reject) => {
      let resolved = false;
      try {
        this.ws = new WSCtor(this.endpoint, {
          // 文档要求：Authorization: Bearer <key>（大写 Bearer），握手阶段校验；X-DashScope-DataInspection 文档说"如非必要勿开"，不发。
          headers: { Authorization: "Bearer " + this.apiKey },
          handshakeTimeout: 8000,
        });
      } catch (e) { reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e))); return; }
      try { this.ws.binaryType = "arraybuffer"; } catch { /* intentionally empty */ }

      const onOpen = () => {
        const runTask = {
          header: { action: "run-task", task_id: this.taskId, streaming: "duplex" },
          payload: {
            task_group: "audio", task: "asr", function: "recognition",
            model: this.model,
            parameters: {
              format: "pcm", sample_rate: this.sampleRate,
              disfluency_removal_enabled: false,
              // 明确语种能提升准确率（官方文档）：用户设置了 zh/en/ja 就单一语种，否则中英混合兜底
              language_hints: (this.language === "zh" || this.language === "en" || this.language === "ja") ? [this.language] : ["zh", "en"],
            },
            input: {},
          },
        };
        try { this.ws.send(JSON.stringify(runTask)); }
        catch (e) { if (!resolved) { resolved = true; reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e))); } }
      };
      const onMessage = (data) => {
        const text = (typeof data === "string") ? data
          : (data && data.toString ? data.toString("utf8") : "");
        if (!text || text[0] !== "{") return;
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        const ev = msg.header && msg.header.event;
        if (ev === "task-started") {
          this.started = true;
          if (!resolved) { resolved = true; resolve(); }
        } else if (ev === "result-generated") {
          this._handleResult(msg.payload);
        } else if (ev === "task-finished") {
          this._safeClose();
        } else if (ev === "task-failed") {
          const err = (msg.header && (msg.header.error_message || msg.header.error_code)) || JSON.stringify(msg);
          this.onError(new Error("DashScope task-failed: " + err));
          if (!resolved) { resolved = true; reject(new Error(err)); }
          this._safeClose();
        }
      };
      const onError = (e) => {
        const err = e instanceof Error ? e : new Error("WebSocket 错误：" + (e && e.message || "未知"));
        this.onError(err);
        if (!resolved) { resolved = true; reject(err); }
      };
      const onClose = () => {
        this.closed = true;
        // 连接在 task-started 之前就被关闭（密钥无效 / 模型未开通 / 地址错误等）→ 让 connect() 拒绝，
        // 否则 Promise 既不 resolve 也不 reject，start() 会永久挂起、按钮彻底失灵。
        if (!resolved) { resolved = true; reject(new Error("连接被服务端关闭：请检查密钥是否有效、Fun-ASR/Paraformer 是否已开通、地址是否为 wss://…/api-ws/v1/inference")); }
        this.onClosed({ finalText: this.getFullText() });
      };
      if (typeof this.ws.on === "function") {
        this.ws.on("open", onOpen);
        this.ws.on("message", onMessage);
        this.ws.on("error", onError);
        this.ws.on("close", onClose);
      } else {
        this.ws.onopen = onOpen;
        this.ws.onmessage = (ev) => onMessage(ev.data);
        this.ws.onerror = onError;
        this.ws.onclose = onClose;
      }
    });
  }
  _handleResult(payload) {
    if (!payload) return;
    const sentence = (payload.output || {}).sentence;
    if (!sentence) return;
    if (sentence.heartbeat === true) return; // 心跳包（sentence_id=0），按文档跳过
    const text = String(sentence.text || "");
    // 只认 sentence_end 判终句：中间结果也可能带 end_time，拿它当结束信号会把半句提前 finalize、造成整句重复。
    const isEnd = sentence.sentence_end === true;
    if (isEnd) {
      this._finalizedText += text;
      this._currentPartial = "";
          this.onPartial(this.getFullText(), true, text); // 第三参=当前句，供实时字幕只显示当前内容
    } else {
      this._currentPartial = text;
      this.onPartial(this.getFullText(), false, text);
    }
  }
  getFullText() {
    return (this._finalizedText + this._currentPartial).trim();
  }
  sendAudioFrame(arrayBuffer) {
    if (!this.ws || !this.started) return;
    const state = (this.ws.readyState != null) ? this.ws.readyState : 1;
    if (state !== 1) return;
    try { this.ws.send(arrayBuffer); } catch (e) { console.warn("[DashScopeStream] send failed", e); }
  }
  async finish() {
    if (this.finishing || this.closed) return;
    this.finishing = true;
    try {
      if (this.ws && (this.ws.readyState == null || this.ws.readyState === 1)) {
        this.ws.send(JSON.stringify({
          header: { action: "finish-task", task_id: this.taskId, streaming: "duplex" },
          payload: { input: {} },
        }));
      }
    } catch { /* intentionally empty */ }
    return new Promise((resolve) => {
      const t = window.setTimeout(() => { this._safeClose(); resolve(); }, 5000);
      const orig = this.onClosed;
      this.onClosed = (info) => { window.clearTimeout(t); orig(info); resolve(); };
    });
  }
  _safeClose() {
    try { if (this.ws) this.ws.close(); } catch { /* intentionally empty */ }
  }
}

export class OpenAIRealtimeTranscriptionClient {
  constructor(opts) {
    this.endpoint = opts.endpoint || "wss://api.openai.com/v1/realtime";
    this.apiKey = opts.apiKey;
    this.model = opts.model || "gpt-realtime-whisper";
    this.language = opts.language || "";
    this.sampleRate = 24000;
    this.onPartial = opts.onPartial || (() => { /* intentionally empty */ });
    this.onError = opts.onError || ((e) => console.error("[OpenAIRealtime]", e));
    this.onClosed = opts.onClosed || (() => { /* intentionally empty */ });
    this.ws = null;
    this.opened = false;
    this.finishing = false;
    this.closed = false;
    this._finalizedText = "";
    this._partialByItem = new Map();
  }
  async connect() {
    assertSafeServiceEndpoint(this.endpoint, "websocket", "实时转写服务地址");
    if (!this.apiKey) throw new Error("OpenAI API Key 未配置");
    const WSCtor = await requireHeaderCapableWebSocket("OpenAI Realtime");
    return new Promise((resolve, reject) => {
      let resolved = false;
      try {
        this.ws = new WSCtor(this.endpoint, {
          headers: {
            Authorization: "Bearer " + this.apiKey,
            "OpenAI-Beta": "realtime=v1",
          },
          handshakeTimeout: 10000,
        });
      } catch (e) { reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e))); return; }
      try { this.ws.binaryType = "arraybuffer"; } catch { /* intentionally empty */ }

      const sendUpdate = () => {
        const sessionUpdate = {
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: this.sampleRate },
                transcription: Object.assign(
                  { model: this.model },
                  this.language ? { language: this.language } : {}
                ),
                turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 500 },
              },
            },
          },
        };
        try { this.ws.send(JSON.stringify(sessionUpdate)); }
        catch (e) { if (!resolved) { resolved = true; reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e))); } }
      };
      const onOpen = () => {
        this.opened = true;
        sendUpdate();
        if (!resolved) { resolved = true; resolve(); }
      };
      const onMessage = (data) => {
        const text = (typeof data === "string") ? data
          : (data && data.toString ? data.toString("utf8") : "");
        if (!text || text[0] !== "{") return;
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        const t = msg.type;
        if (t === "conversation.item.input_audio_transcription.delta") {
          const id = msg.item_id || "";
          const cur = this._partialByItem.get(id) || "";
          this._partialByItem.set(id, cur + (msg.delta || ""));
          this.onPartial(this.getFullText(), false);
        } else if (t === "conversation.item.input_audio_transcription.completed") {
          const id = msg.item_id || "";
          const final = (msg.transcript != null ? msg.transcript : this._partialByItem.get(id) || "").trim();
          this._partialByItem.delete(id);
          if (final) this._finalizedText += (this._finalizedText ? "\n" : "") + final;
          this.onPartial(this.getFullText(), true);
        } else if (t === "error") {
          const errMsg = (msg.error && (msg.error.message || msg.error.code)) || JSON.stringify(msg);
          this.onError(new Error("OpenAI Realtime 错误：" + errMsg));
        }
      };
      const onError = (e) => {
        const err = e instanceof Error ? e : new Error("WebSocket 错误：" + (e && e.message || "未知"));
        this.onError(err);
        if (!resolved) { resolved = true; reject(err); }
      };
      const onClose = () => {
        this.closed = true;
        // 连接在 task-started 之前就被关闭（密钥无效 / 模型未开通 / 地址错误等）→ 让 connect() 拒绝，
        // 否则 Promise 既不 resolve 也不 reject，start() 会永久挂起、按钮彻底失灵。
        if (!resolved) { resolved = true; reject(new Error("连接被服务端关闭：请检查访问密钥是否有效、账户是否有 Realtime 权限；官方地址为 wss://api.openai.com/v1/realtime，自建或中转服务请填完整路径，很多实现还要求带上 ?model=<模型名>")); }
        this.onClosed({ finalText: this.getFullText() });
      };
      if (typeof this.ws.on === "function") {
        this.ws.on("open", onOpen);
        this.ws.on("message", onMessage);
        this.ws.on("error", onError);
        this.ws.on("close", onClose);
      } else {
        this.ws.onopen = onOpen;
        this.ws.onmessage = (ev) => onMessage(ev.data);
        this.ws.onerror = onError;
        this.ws.onclose = onClose;
      }
    });
  }
  getFullText() {
    let partial = "";
    for (const v of this._partialByItem.values()) partial += v;
    const sep = (this._finalizedText && partial) ? "\n" : "";
    return (this._finalizedText + sep + partial).trim();
  }
  sendAudioFrame(arrayBuffer) {
    if (!this.ws || !this.opened) return;
    const state = (this.ws.readyState != null) ? this.ws.readyState : 1;
    if (state !== 1) return;
    try {
      const b64 = lexvoiceArrayBufferToBase64(arrayBuffer);
      this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
    } catch (e) { console.warn("[OpenAIRealtime] send failed", e); }
  }
  async finish() {
    if (this.finishing || this.closed) return;
    this.finishing = true;
    try {
      if (this.ws && (this.ws.readyState == null || this.ws.readyState === 1)) {
        this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      }
    } catch { /* intentionally empty */ }
    return new Promise((resolve) => {
      const t = window.setTimeout(() => { this._safeClose(); resolve(); }, 5000);
      const orig = this.onClosed;
      this.onClosed = (info) => { window.clearTimeout(t); orig(info); resolve(); };
    });
  }
  _safeClose() { try { if (this.ws) this.ws.close(); } catch { /* intentionally empty */ } }
}

export class OpenAIRealtimeTranslationClient {
  constructor(opts) {
    this.endpointBase = opts.endpoint || "wss://api.openai.com/v1/realtime/translations";
    this.apiKey = opts.apiKey;
    this.model = opts.model || "gpt-realtime-translate";
    this.targetLanguage = opts.targetLanguage || opts.language || "zh";
    this.sampleRate = 24000;
    this.onPartial = opts.onPartial || (() => { /* intentionally empty */ });
    this.onError = opts.onError || ((e) => console.error("[OpenAITranslate]", e));
    this.onClosed = opts.onClosed || (() => { /* intentionally empty */ });
    this.ws = null;
    this.opened = false;
    this.finishing = false;
    this.closed = false;
    this._sourceText = "";
    this._translatedText = "";
    this._sourcePartial = "";
    this._translatedPartial = "";
  }
  async connect() {
    assertSafeServiceEndpoint(this.endpointBase, "websocket", "实时翻译服务地址");
    if (!this.apiKey) throw new Error("OpenAI API Key 未配置");
    const WSCtor = await requireHeaderCapableWebSocket("OpenAI Realtime 翻译");
    const sep = this.endpointBase.indexOf("?") >= 0 ? "&" : "?";
    const url = this.endpointBase + sep + "model=" + encodeURIComponent(this.model);
    return new Promise((resolve, reject) => {
      let resolved = false;
      try {
        this.ws = new WSCtor(url, {
          headers: {
            Authorization: "Bearer " + this.apiKey,
            "OpenAI-Beta": "realtime=v1",
          },
          handshakeTimeout: 10000,
        });
      } catch (e) { reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e))); return; }
      try { this.ws.binaryType = "arraybuffer"; } catch { /* intentionally empty */ }

      const sendUpdate = () => {
        const sessionUpdate = {
          type: "session.update",
          session: { audio: { output: { language: this.targetLanguage } } },
        };
        try { this.ws.send(JSON.stringify(sessionUpdate)); }
        catch (e) { if (!resolved) { resolved = true; reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : JSON.stringify(e))); } }
      };
      const onOpen = () => {
        this.opened = true;
        sendUpdate();
        if (!resolved) { resolved = true; resolve(); }
      };
      const onMessage = (data) => {
        const text = (typeof data === "string") ? data
          : (data && data.toString ? data.toString("utf8") : "");
        if (!text || text[0] !== "{") return;
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        const t = msg.type;
        if (t === "session.input_transcript.delta") {
          this._sourcePartial += (msg.delta || "");
          this.onPartial(this.getFullText(), false);
        } else if (t === "session.input_transcript.completed" || t === "session.input_transcript.done") {
          const final = String(msg.transcript != null ? msg.transcript : this._sourcePartial).trim();
          if (final) this._sourceText += (this._sourceText ? "\n" : "") + final;
          this._sourcePartial = "";
          this.onPartial(this.getFullText(), true);
        } else if (t === "session.output_transcript.delta") {
          this._translatedPartial += (msg.delta || "");
          this.onPartial(this.getFullText(), false);
        } else if (t === "session.output_transcript.completed" || t === "session.output_transcript.done") {
          const final = String(msg.transcript != null ? msg.transcript : this._translatedPartial).trim();
          if (final) this._translatedText += (this._translatedText ? "\n" : "") + final;
          this._translatedPartial = "";
          this.onPartial(this.getFullText(), true);
        } else if (t === "session.output_audio.delta" || t === "session.output_audio.done") {
          // 丢弃合成语音
        } else if (t === "error") {
          const errMsg = (msg.error && (msg.error.message || msg.error.code)) || JSON.stringify(msg);
          this.onError(new Error("OpenAI Realtime 翻译错误：" + errMsg));
        }
      };
      const onError = (e) => {
        const err = e instanceof Error ? e : new Error("WebSocket 错误：" + (e && e.message || "未知"));
        this.onError(err);
        if (!resolved) { resolved = true; reject(err); }
      };
      const onClose = () => {
        this.closed = true;
        // 与另两个客户端同款守卫：open 前被关必须 reject，否则 connect() 永久挂起、调用方按钮失灵。
        if (!resolved) { resolved = true; reject(new Error("连接被服务端关闭：请检查 OpenAI API Key 是否有效、账户是否有 Realtime 翻译权限")); }
        this.onClosed({
          finalText: this.getFullText(),
          sourceText: this.getSourceText(),
          translatedText: this.getTranslatedText(),
        });
      };
      if (typeof this.ws.on === "function") {
        this.ws.on("open", onOpen);
        this.ws.on("message", onMessage);
        this.ws.on("error", onError);
        this.ws.on("close", onClose);
      } else {
        this.ws.onopen = onOpen;
        this.ws.onmessage = (ev) => onMessage(ev.data);
        this.ws.onerror = onError;
        this.ws.onclose = onClose;
      }
    });
  }
  getSourceText() {
    const sep = (this._sourceText && this._sourcePartial) ? "\n" : "";
    return (this._sourceText + sep + this._sourcePartial).trim();
  }
  getTranslatedText() {
    const sep = (this._translatedText && this._translatedPartial) ? "\n" : "";
    return (this._translatedText + sep + this._translatedPartial).trim();
  }
  getFullText() {
    const src = this.getSourceText();
    const tgt = this.getTranslatedText();
    if (!src && !tgt) return "";
    if (!src) return tgt;
    if (!tgt) return src;
    return `**译文（${this.targetLanguage}）**\n\n${tgt}\n\n**原文**\n\n${src}`;
  }
  sendAudioFrame(arrayBuffer) {
    if (!this.ws || !this.opened) return;
    const state = (this.ws.readyState != null) ? this.ws.readyState : 1;
    if (state !== 1) return;
    try {
      const b64 = lexvoiceArrayBufferToBase64(arrayBuffer);
      this.ws.send(JSON.stringify({ type: "session.input_audio_buffer.append", audio: b64 }));
    } catch (e) { console.warn("[OpenAITranslate] send failed", e); }
  }
  async finish() {
    if (this.finishing || this.closed) return;
    this.finishing = true;
    return new Promise((resolve) => {
      const t = window.setTimeout(() => { this._safeClose(); resolve(); }, 5000);
      const orig = this.onClosed;
      this.onClosed = (info) => { window.clearTimeout(t); orig(info); resolve(); };
    });
  }
  _safeClose() { try { if (this.ws) this.ws.close(); } catch { /* intentionally empty */ } }
}

// ============================================================
// 流式转写客户端工厂：根据 profile.streamProtocol 返回对应实现
// 所有客户端遵守相同接口：connect / sendAudioFrame / finish / getFullText
// 回调：onPartial(text, isFinal) / onError(err) / onClosed(info)
// ============================================================
export function createStreamingTranscriptionClient(profile, provider, callbacks) {
  const opts = Object.assign({}, callbacks || {}, {
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
    language: provider.language,
    targetLanguage: provider.targetLanguage,
  });
  switch (profile.streamProtocol) {
    case "openai-realtime-transcription":
      return new OpenAIRealtimeTranscriptionClient(opts);
    case "openai-realtime-translation":
      return new OpenAIRealtimeTranslationClient(opts);
    case "dashscope-ws":
    default:
      return new DashScopeStreamingClient(opts);
  }
}

export function isStreamingTranscribeProfile(profile) {
  return !!(profile && profile.transcribeMode === "streaming");
}

// 静音探针节奏：10 帧 × 100ms = 1 秒音频，与切片路径的 1 秒静音自检等价。
const STREAMING_PROBE_FRAME_MS = 100;
const STREAMING_PROBE_FRAMES = 10;
// 模型名写错、账号无权限这类拒绝，服务端通常要等收到首帧音频之后才回 error 事件，送完还得再等一会儿。
const STREAMING_PROBE_GRACE_MS = 1200;

// 流式服务的连通性自检。这类服务端点是 wss://，走不了 transcribeAudio() 的 HTTP 上传
// （会被 assertSafeServiceEndpoint 挡成「转写服务地址协议不受支持」），必须用录音时同一套
// 客户端建连，才能真正验证握手、鉴权与会话协商。送进去的是静音，VAD 不会出字，
// 返回空文本属于正常结果——这里要的是「连得上」，不是「认得出」。
export async function testStreamingTranscribeConnectivity(profile, provider, deps?) {
  const createClient = (deps && deps.createClient) || createStreamingTranscriptionClient;
  const wait = (deps && deps.wait) || ((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)));
  const errors = [];
  const client = createClient(profile, provider, {
    onPartial: () => { /* intentionally empty */ },
    onError: (e) => { errors.push(e instanceof Error ? e : new Error(String((e && e.message) || e))); },
    onClosed: () => { /* intentionally empty */ },
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const sampleRate = Number(client.sampleRate) || 16000;
    // 16-bit 单声道全 0 = 静音；每次 slice(0) 交出独立副本，避免客户端持有同一段 buffer。
    const silence = new ArrayBuffer(Math.round(sampleRate * 2 * STREAMING_PROBE_FRAME_MS / 1000));
    for (let i = 0; i < STREAMING_PROBE_FRAMES && !errors.length; i++) {
      client.sendAudioFrame(silence.slice(0));
      await wait(STREAMING_PROBE_FRAME_MS);
    }
    if (!errors.length) await wait(STREAMING_PROBE_GRACE_MS);
    if (errors.length) throw errors[0];
    return client.getFullText();
  } finally {
    // connect() 失败时底层 socket 已被 ws 关掉，再 await finish() 只会白等它 5 秒的收网超时。
    if (connected) { try { await client.finish(); } catch { /* intentionally empty */ } }
    else if (typeof client._safeClose === "function") { try { client._safeClose(); } catch { /* intentionally empty */ } }
  }
}

export class PcmStreamEncoder {
  constructor(stream, opts) {
    this.stream = stream;
    this.targetSampleRate = (opts && opts.sampleRate) || 16000;
    this.onFrame = (opts && opts.onFrame) || (() => { /* intentionally empty */ });
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this._sourceSampleRate = 0;
  }
  start() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new Ctx();
    this._sourceSampleRate = this.audioContext.sampleRate;
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const down = this._downsample(input, this._sourceSampleRate, this.targetSampleRate);
      const pcm16 = this._floatTo16BitPCM(down);
      this.onFrame(pcm16.buffer);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }
  _downsample(buffer, sourceRate, targetRate) {
    if (sourceRate === targetRate) return buffer;
    const ratio = sourceRate / targetRate;
    const newLen = Math.floor(buffer.length / ratio);
    const out = new Float32Array(newLen);
    let outIdx = 0; let inIdx = 0;
    while (outIdx < newLen) {
      const nextInIdx = Math.floor((outIdx + 1) * ratio);
      let acc = 0; let count = 0;
      for (let i = inIdx; i < nextInIdx && i < buffer.length; i++) { acc += buffer[i]; count++; }
      out[outIdx] = count > 0 ? acc / count : 0;
      outIdx++;
      inIdx = nextInIdx;
    }
    return out;
  }
  _floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }
  stop() {
    try { if (this.processor) this.processor.disconnect(); } catch { /* intentionally empty */ }
    try { if (this.source) this.source.disconnect(); } catch { /* intentionally empty */ }
    try { if (this.audioContext) this.audioContext.close(); } catch { /* intentionally empty */ }
    this.processor = null;
    this.source = null;
    this.audioContext = null;
  }
}

export function lexvoiceArrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

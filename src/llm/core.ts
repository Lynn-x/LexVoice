/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { normalizeLlmEndpoint, isLocalLlmEndpoint, isPoeLlmEndpoint, isMoonshotKimiModel, buildLlmHeaders, comparableLlmEndpoint, isPrivateNetworkHost } from '../shared/util-llm-endpoint';
import { delayMs } from '../shared/util-audio';
import { extractLlmContent } from '../shared/util-json';
import { diagnosticError } from '../shared/util-key-diag';
import { withPromiseTimeout, getHeaderValue, parseRetryAfterMs, parseRequestUrlJson, getRequestUrlText } from '../shared/util-http';
import { getBriefingMergeMaxTokens, getLlmOutputCeiling } from './config';

export class LlmRequestQueue {
  items: any[];
  running: number;
  seq: number;
  constructor() {
    this.items = [];
    this.running = 0;
    this.seq = 0;
  }
  enqueue(priority, run) {
    return new Promise((resolve, reject) => {
      this.items.push({
        priority: Number(priority) || 1,
        seq: ++this.seq,
        run,
        resolve,
        reject,
      });
      this.pump();
    });
  }
  pump() {
    if (this.running > 0) return;
    const next = this.items
      .sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq))
      .shift();
    if (!next) return;
    this.running += 1;
    Promise.resolve()
      .then(next.run)
      .then(next.resolve, next.reject)
      .finally(() => {
        this.running = Math.max(0, this.running - 1);
        this.pump();
      });
  }
}

export const LLM_REQUEST_QUEUE = new LlmRequestQueue();

export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 180 * 1000;

export function resolveLlmRequestTimeoutMs(options) {
  const hasTimeout = options && Object.prototype.hasOwnProperty.call(options, "timeoutMs");
  const value = hasTimeout ? Number(options.timeoutMs) : NaN;
  if (Number.isFinite(value) && value > 0) return Math.max(1000, Math.round(value));
  if (hasTimeout && value === 0 && options && options.allowNoTimeout === true) return 0;
  return DEFAULT_LLM_REQUEST_TIMEOUT_MS;
}

export function getLlmRetryAfterMsFromHeaders(headers) {
  const retryAfter = parseRetryAfterMs(getHeaderValue(headers, "retry-after"));
  if (retryAfter > 0) return retryAfter;
  return parseRetryAfterMs(getHeaderValue(headers, "x-ratelimit-reset-requests"));
}

export function decorateLlmHttpDetail(status, detail, endpoint) {
  const base = String(detail || "").trim();
  if (!isPoeLlmEndpoint(endpoint)) return base;
  const code = Number(status) || 0;
  let hint = "";
  if (code === 400 || code === 404) {
    hint = "Poe 的 model 必须填写 Poe bot 名，且区分大小写；请点「获取可用模型」从列表中选择。";
  } else if (code === 401 || code === 403) {
    hint = "请检查 Poe API Key 是否有效，且已按 Bearer token 使用。";
  } else if (code === 402) {
    hint = "Poe 积分或订阅额度不足，请到 Poe 账户检查额度。";
  } else if (code === 413) {
    hint = "本次请求上下文可能超过 Poe 目标 bot 的限制，请缩短输入或换更长上下文的 bot。";
  } else if (code === 429 || code === 503 || code === 529) {
    hint = "Poe 当前限流或服务繁忙；LexVoice 会按服务端 Retry-After 退避后重试一次。";
  }
  if (!hint) return base;
  return base ? `${base}。${hint}` : hint;
}

export async function readLlmError(res) {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    const detail = json && (json.error && json.error.message || json.message || json.detail);
    if (detail) return String(detail).slice(0, 500);
  } catch {}
  return text.slice(0, 500);
}

export function createLlmHttpError(status, detail, endpoint, headers) {
  const cleanDetail = decorateLlmHttpDetail(status, detail, endpoint).slice(0, 500);
  const err = new Error(`LLM 调用失败 ${status}：${cleanDetail}`) as any;
  err.status = status;
  err.statusDetail = cleanDetail;
  err.retryAfterMs = getLlmRetryAfterMsFromHeaders(headers);
  err.nonRetryable = isNonRetryableLlmHttpFailure(status, cleanDetail);
  return err;
}

export function pickLlmRequestError(fetchError, fallbackError) {
  const fallbackMessage = String((fallbackError && fallbackError.message) || fallbackError || "");
  const fetchMessage = String((fetchError && fetchError.message) || fetchError || "");
  if (fallbackError && (fallbackError.status || /LLM 调用失败\s+\d+/.test(fallbackMessage))) return fallbackError;
  if (/Obsidian requestUrl 不可用/.test(fallbackMessage)) return fetchError;
  if (/Failed to fetch/i.test(fetchMessage) && fallbackMessage) return fallbackError;
  return fetchError || fallbackError;
}

export function countLlmMessageChars(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, msg) => {
    const content = msg && msg.content;
    if (typeof content === "string") return sum + content.length;
    if (Array.isArray(content)) {
      return sum + content.reduce((n, part) => {
        if (typeof part === "string") return n + part.length;
        if (!part || typeof part !== "object") return n;
        return n + String(part.text || part.content || "").length;
      }, 0);
    }
    return sum;
  }, 0);
}

export async function logLlmRequestDiagnostic(plugin, level, code, message, data) {
  try {
    if (plugin && typeof plugin.logDiagnostic === "function") {
      await plugin.logDiagnostic(level, code, message, data);
    }
  } catch (e) {
    console.warn("[LexVoice] llm diagnostic failed", e);
  }
}

export async function requestLlmChatCompletionViaObsidian(endpoint, headers, payloadText, timeoutMs) {
  if (!obsidian || typeof obsidian.requestUrl !== "function") {
    throw new Error("Obsidian requestUrl 不可用");
  }
  const request = obsidian.requestUrl({
    url: endpoint,
    method: "POST",
    headers,
    body: payloadText,
    throw: false,
  });
  const response = await withPromiseTimeout(request, timeoutMs, () => new Error(`LLM 兜底调用超时：${Math.round(timeoutMs / 1000)} 秒内没有响应`));
  const status = Number(response && response.status) || 0;
  if (status && (status < 200 || status >= 300)) {
    const text = getRequestUrlText(response);
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json && (json.error && json.error.message || json.message || json.detail) || text;
    } catch {}
    throw createLlmHttpError(status, detail, endpoint, response && response.headers);
  }
  return parseRequestUrlJson(response);
}

export function getLlmRequestPriority(options) {
  const raw = String((options && (options.priority || options.llmPriority)) || "").toLowerCase();
  if (/^(user|interactive|high)$/.test(raw)) return 0;
  if (/^(background|silent|low)$/.test(raw)) return 2;
  return 1;
}

export function runQueuedLlmRequest(options, run) {
  if (options && options.skipQueue) return run();
  return LLM_REQUEST_QUEUE.enqueue(getLlmRequestPriority(options || {}), run);
}

export function accumulateLlmSseDataLine(line, state) {
  const t = String(line || "").replace(/\r$/, "").trim();
  if (!t || t.indexOf("data:") !== 0) return false;
  const data = t.slice(5).trim();
  if (data === "[DONE]") { state.done = true; return false; }
  let obj;
  try { obj = JSON.parse(data); } catch { return false; }
  const choice = obj && obj.choices && obj.choices[0];
  if (choice && choice.finish_reason) state.finishReason = String(choice.finish_reason);
  const piece = choice && ((choice.delta && choice.delta.content) || (choice.message && choice.message.content));
  if (piece) { state.content += piece; return true; }
  return false;
}

export async function readLlmSseStream(res, onActivity) {
  const state = { content: "", done: false, finishReason: "" };
  let raw = "";
  // 环境不支持流式 reader：退回整体读取后按 SSE 文本逐行解析。
  if (!res.body || typeof res.body.getReader !== "function") {
    raw = await res.text();
    if (typeof onActivity === "function") onActivity();
    for (const line of String(raw).split(/\n/)) {
      accumulateLlmSseDataLine(line, state);
      if (state.done) break;
    }
    return finalizeLlmSseContent(state, raw);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk && chunk.done) break;
      if (typeof onActivity === "function") onActivity();
      const text = decoder.decode(chunk.value, { stream: true });
      raw += text;
      buffer += text;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        accumulateLlmSseDataLine(line, state);
        if (state.done) return finalizeLlmSseContent(state, raw);
      }
    }
    if (buffer) accumulateLlmSseDataLine(buffer, state);
  } catch (e) {
    // 流被中断（空闲超时 abort / 网络断）：已收到的内容不浪费。中断本身也是一种截断，标记 aborted。
    const partial = finalizeLlmSseContent(state, raw);
    if (partial.content) { if (!partial.finishReason) partial.finishReason = "aborted"; return partial; }
    throw e;
  } finally {
    // 释放 reader：abort / 提前 return / 异常时若不释放，底层流锁与句柄会泄漏（依赖 GC 不确定回收）。
    try { reader.cancel().catch(() => {}); } catch {}
  }
  return finalizeLlmSseContent(state, raw);
}

export function finalizeLlmSseContent(state, raw) {
  if (state.content) return { content: state.content, finishReason: state.finishReason || "" };
  const trimmed = String(raw || "").trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      const c = obj && obj.choices && obj.choices[0];
      const msg = c && ((c.message && c.message.content) || (c.delta && c.delta.content));
      if (msg) return { content: msg, finishReason: (c && c.finish_reason) ? String(c.finish_reason) : "" };
    } catch {}
  }
  return { content: state.content, finishReason: state.finishReason || "" };
}

export async function requestLlmChatCompletion(plugin, messages, options) {
  const { llmEndpoint, llmApiKey, llmModel } = plugin.settings;
  const endpoint = normalizeLlmEndpoint(llmEndpoint);
  if (!endpoint) throw new Error("大模型服务地址未配置");
  if (!llmModel) throw new Error("大模型名称未配置");
  if (!llmApiKey && !isLocalLlmEndpoint(endpoint)) {
    throw new Error("大模型访问密钥未配置；只有本地 localhost 服务可以留空");
  }
  // 流式默认开启（opt-out：显式传 stream:false 才关）。流式 + 空闲超时能避免"服务端算完计费、
  // 客户端却因总超时 abort 丢结果"的浪费——这对所有 LLM 调用（merge / 大纲 / 沉淀 / 词汇 / 问答）都适用。
  // 对调用方透明：callLlm 拿到的仍是 {choices:[{message:{content}}]}，extractLlmContent 取值一致；
  // 端点若忽略 stream 参数返回普通 JSON，finalizeLlmSseContent 兜底按普通响应解析。
  const streamWanted = !(options && options.stream === false);
  const basePayload = {
    model: llmModel,
    messages,
    stream: false,
    temperature: undefined,
  };
  if (!isMoonshotKimiModel(endpoint, llmModel)) basePayload.temperature = 0.3;
  const payload = Object.assign(basePayload, options && options.payload ? options.payload : {});
  payload.stream = streamWanted;
  const payloadText = JSON.stringify(payload);
  // Obsidian requestUrl 兜底不支持流式，单独准备一份 stream:false 的 payload 给它用。
  const fallbackPayloadText = streamWanted ? JSON.stringify(Object.assign({}, payload, { stream: false })) : payloadText;
  const messageChars = countLlmMessageChars(messages);
  const payloadChars = payloadText.length;
  const headers = buildLlmHeaders(llmApiKey, endpoint);
  const timeoutMs = resolveLlmRequestTimeoutMs(options || {});
  return await runQueuedLlmRequest(options || {}, async () => {
    const controller = timeoutMs > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    // 空闲超时：流式读取时每收到一个 chunk 都调 armTimer 重置；只有 timeoutMs 内"完全没有新数据"
    // 才视为真卡死并 abort。这样慢但在持续输出的响应不会被误杀、不会白白浪费已计费的生成。
    const armTimer = () => {
      if (!controller || !(timeoutMs > 0)) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => controller.abort(), timeoutMs);
    };
    armTimer();
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: payloadText,
        signal: controller ? controller.signal : undefined,
      });
    } catch (e) {
      if (timer) window.clearTimeout(timer);
      if (controller && controller.signal && controller.signal.aborted) {
        const err = new Error(`LLM 调用超时：${Math.round(timeoutMs / 1000)} 秒内没有响应`);
        await logLlmRequestDiagnostic(plugin, "error", "llm.fetch_failed", "LLM 请求发送失败", {
          endpoint,
          model: llmModel ? "<set>" : "",
          messageChars,
          payloadChars,
          timeoutMs,
          aborted: true,
          error: diagnosticError(err),
        });
        throw err;
      }
      await logLlmRequestDiagnostic(plugin, "error", "llm.fetch_failed", "LLM 请求发送失败", {
        endpoint,
        model: llmModel ? "<set>" : "",
        messageChars,
        payloadChars,
        timeoutMs,
        aborted: false,
        error: diagnosticError(e),
      });
      await logLlmRequestDiagnostic(plugin, "warn", "llm.requesturl_fallback_start", "fetch 失败后尝试 Obsidian requestUrl 兜底", {
        endpoint,
        model: llmModel ? "<set>" : "",
        messageChars,
        payloadChars,
        fetchError: diagnosticError(e),
      });
      try {
        const fallbackData = await requestLlmChatCompletionViaObsidian(endpoint, headers, fallbackPayloadText, timeoutMs);
        await logLlmRequestDiagnostic(plugin, "info", "llm.requesturl_fallback_succeeded", "Obsidian requestUrl 兜底成功", {
          endpoint,
          model: llmModel ? "<set>" : "",
          messageChars,
          payloadChars,
        });
        return fallbackData;
      } catch (fallbackError) {
        await logLlmRequestDiagnostic(plugin, "error", "llm.requesturl_fallback_failed", "Obsidian requestUrl 兜底失败", {
          endpoint,
          model: llmModel ? "<set>" : "",
          messageChars,
          payloadChars,
          fetchError: diagnosticError(e),
          fallbackError: diagnosticError(fallbackError),
        });
        throw pickLlmRequestError(e, fallbackError);
      }
    }
    // fetch 已成功返回（连接已建立）。读取响应期间继续用空闲计时器保护；流式时每个 chunk 都会重置它。
    try {
      if (!res.ok) {
        const msg = await readLlmError(res);
        await logLlmRequestDiagnostic(plugin, "error", "llm.http_failed", "LLM 返回非成功状态", {
          endpoint,
          model: llmModel ? "<set>" : "",
          status: res.status,
          messageChars,
          payloadChars,
          statusDetail: msg,
          retryAfterMs: getLlmRetryAfterMsFromHeaders(res.headers),
        });
        throw createLlmHttpError(res.status, msg, endpoint, res.headers);
      }
      if (streamWanted) {
        armTimer(); // 给"首个 token 到达"一个完整的空闲窗口
        const { content, finishReason } = await readLlmSseStream(res, armTimer);
        // 透传 finish_reason，让上层能检测"length"截断（流式重包此前会把它丢掉 → 截断无从察觉）。
        return { choices: [{ message: { role: "assistant", content }, finish_reason: finishReason || null }] };
      }
      return await res.json();
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  });
}

export async function testLlmConnection(plugin) {
  const data = await requestLlmChatCompletion(plugin, [
    { role: "system", content: "You are a connectivity test endpoint. Reply with OK only." },
    { role: "user", content: "LexVoice connection test. Reply OK." },
  ], {});
  return {
    endpoint: normalizeLlmEndpoint(plugin.settings.llmEndpoint),
    model: plugin.settings.llmModel,
    preview: extractLlmContent(data).trim().slice(0, 40),
  };
}

export function isTransientLlmError(error) {
  if (isLlmNonRetryableError(error)) return false;
  const msg = String((error && error.message) || error || "");
  return /Failed to fetch|network|ECONNRESET|ETIMEDOUT|\b(429|500|502|503|504|529)\b|rate\s*limit|temporarily|service unavailable|overloaded/i.test(msg);
}

export function getLlmRetryDelayMs(error, attemptIndex) {
  const hinted = Number(error && error.retryAfterMs);
  const jitter = Math.floor(Math.random() * 300);
  const fallback = 1000 * Math.pow(2, Math.max(0, Number(attemptIndex) || 0)) + jitter;
  const raw = Number.isFinite(hinted) && hinted > 0 ? Math.max(hinted, 250 + jitter) : fallback;
  return Math.max(250, Math.min(60 * 1000, Math.round(raw)));
}

export async function fetchLlmModelList(endpoint, apiKey) {
  const base = normalizeLlmEndpoint(endpoint);
  if (!base) throw new Error("服务地址未配置");
  const modelsUrl = /\/chat\/completions$/i.test(base)
    ? base.replace(/\/chat\/completions$/i, "/models")
    : base.replace(/\/+$/, "") + "/models";
  const headers = buildLlmHeaders(apiKey, base);
  delete headers["Content-Type"]; // GET 无 body
  const res = await obsidian.requestUrl({ url: modelsUrl, method: "GET", headers, throw: false });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}：${String(res.text || "").slice(0, 200)}`);
  }
  let data;
  try { data = res.json || JSON.parse(res.text || "{}"); } catch { throw new Error("响应不是合法 JSON"); }
  const arr = (data && (data.data || data.models)) || (Array.isArray(data) ? data : []);
  const ids = (Array.isArray(arr) ? arr : [])
    .map(m => (typeof m === "string" ? m : (m && (m.id || m.name))))
    .map(x => String(x || "").trim())
    .filter(Boolean);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

export function getLlmConfigIssue(settings) {
  const endpoint = normalizeLlmEndpoint(settings && settings.llmEndpoint);
  const model = String((settings && settings.llmModel) || "").trim();
  const apiKey = String((settings && settings.llmApiKey) || "").trim();
  if (!endpoint) return "大模型服务地址未配置";
  if (!model) return "大模型名称未配置";
  if (!apiKey && !isLocalLlmEndpoint(endpoint)) return "大模型访问密钥未配置；只有本地 localhost 服务可以留空";
  return "";
}

export function isLlmConfigError(error) {
  const msg = String((error && error.message) || error || "");
  return /大模型(?:服务地址|名称|访问密钥)未配置|请先在 API 页配置大模型服务|LLM 配置/i.test(msg);
}

export function isLlmServiceBlockedError(error) {
  const msg = String((error && error.message) || error || "");
  return /暂无可用账号|no available account|账号不可用|账号池|余额不足|insufficient\s+quota|quota\s+exceeded|invalid[_\s-]*api[_\s-]*key|unauthorized|forbidden|access\s*denied|model[_\s-]*not[_\s-]*found|模型(?:不存在|不可用|无可用)|context[_\s-]*length|maximum context|too many tokens|上下文(?:过长|超限)|内容过长/i.test(msg);
}

export function isNonRetryableLlmHttpFailure(status, detail) {
  const code = Number(status) || 0;
  const msg = String(detail || "");
  if (isLlmServiceBlockedError(msg)) return true;
  return [400, 401, 403, 404].includes(code);
}

export function isLlmNonRetryableError(error) {
  if (error && error.nonRetryable) return true;
  return isLlmConfigError(error) || isLlmServiceBlockedError(error);
}

export function formatLlmConfigIssue(issue) {
  const text = String(issue || "").trim();
  if (!text) return "";
  if (/请到「设置/.test(text)) return text;
  return `${text}。请到「设置 → API → AI 整理服务」补齐后先测试连接。`;
}

export function formatLlmFailureIssue(issue) {
  const text = String(issue || "").trim();
  if (!text) return "";
  if (isLlmConfigError(text)) return formatLlmConfigIssue(text);
  if (isLlmServiceBlockedError(text)) {
    return `${text}。这是大模型服务端或账号池返回的问题，不是文本长度、ASR 或文本导入路径导致的；请切换模型/端点，或稍后手动重试。`;
  }
  return text;
}

export function isTruncatedFinishReason(reason) {
  return reason === "length" || reason === "aborted" || reason === "max_tokens" || reason === "content_filter";
}

export function extractLlmFinishReason(data) {
  const c = data && data.choices && data.choices[0];
  return c && c.finish_reason ? String(c.finish_reason) : "";
}

export async function callLlmWithMeta(plugin, system, user, options) {
  let data;
  let lastError = null;
  const attempts = (options && options.noRetry) ? 1 : 2;
  for (let i = 0; i < attempts; i++) {
    try {
      data = await requestLlmChatCompletion(plugin, [
        { role: "system", content: system },
        { role: "user", content: user },
      ], options);
      break;
    } catch (e) {
      lastError = e;
      if (i >= attempts - 1 || !isTransientLlmError(e)) throw e;
      await delayMs(getLlmRetryDelayMs(e, i));
    }
  }
  if (!data && lastError) throw lastError;
  return {
    text: stripModeSuggestionBlocks(extractLlmContent(data).trim()),
    finishReason: extractLlmFinishReason(data),
  };
}

export async function callLlm(plugin, system, user, options) {
  const { text } = await callLlmWithMeta(plugin, system, user, options);
  return text;
}

export async function callBriefingMergeLlm(plugin, system, user, options, diagCtx) {
  const { text, finishReason } = await callLlmWithMeta(plugin, system, user, options);
  const truncated = isTruncatedFinishReason(finishReason);
  if (truncated) {
    try {
      await logLlmRequestDiagnostic(plugin, "warn", "llm.merge_truncated", "最终纪要疑似被输出长度上限截断", Object.assign({
        finishReason, outputChars: text.length,
      }, diagCtx || {}));
    } catch {}
  }
  return { text, truncated, finishReason };
}

export function stripModeSuggestionBlocks(text) {
  if (!text) return "";
  return String(text)
    .replace(/\n{0,2}> \[!tip\] 模式建议(?:\r?\n>.*)*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

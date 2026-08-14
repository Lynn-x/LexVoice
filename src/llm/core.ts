/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { normalizeLlmEndpoint, isPoeLlmEndpoint, isMoonshotKimiModel, buildLlmHeaders, assertSafeServiceEndpoint, canOmitServiceApiKey, getServiceEndpointSecurityIssue } from '../shared/util-llm-endpoint';
import { applyThinkingParam } from './thinking';
import { delayMs } from '../shared/util-audio';
import { extractLlmContent } from '../shared/util-json';
import { diagnosticError } from '../shared/util-key-diag';
import { withPromiseTimeout, getHeaderValue, parseRetryAfterMs, parseRequestUrlJson, getRequestUrlText } from '../shared/util-http';
import { LlmRequestQueue } from './request-queue';
export { LlmRequestQueue } from './request-queue';

type LlmHttpError = Error & {
  status?: number;
  statusDetail?: string;
  retryAfterMs?: number;
  nonRetryable?: boolean;
};

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

export function isTokenPlanLlmEndpoint(endpoint) {
  return /token-plan/i.test(String(endpoint || ""));
}

export function shouldRetryTokenPlanParamError(status, detail, endpoint) {
  return Number(status) === 400
    && isTokenPlanLlmEndpoint(endpoint)
    && /param\s*incorrect|invalid\s*param|invalid\s*parameter|unsupported/i.test(String(detail || ""));
}

export function makeTokenPlanCompatPayload(payload) {
  const next = Object.assign({}, payload || {});
  delete next.temperature;
  delete next.enable_thinking;
  delete next.thinking;
  delete next.reasoning_effort;
  next.stream = false;
  return next;
}

export async function readLlmError(res) {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    const detail = json && (json.error && json.error.message || json.message || json.detail);
    if (detail) return String(detail).slice(0, 500);
  } catch { /* intentionally empty */ }
  return text.slice(0, 500);
}

export function createLlmHttpError(status, detail, endpoint, headers) {
  const cleanDetail = decorateLlmHttpDetail(status, detail, endpoint).slice(0, 500);
  const err = new Error(`LLM 调用失败 ${status}：${cleanDetail}`) as LlmHttpError;
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
  assertSafeServiceEndpoint(endpoint, "http", "大模型服务地址");
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
    } catch { /* intentionally empty */ }
    throw createLlmHttpError(status, detail, endpoint, response && response.headers);
  }
  return parseRequestUrlJson(response);
}

export function getLlmRequestPriority(options) {
  const raw = String((options && (options.priority || options.llmPriority)) || "").toLowerCase();
  if (/^(user|interactive|high)$/.test(raw)) return 0;
  if (/^(background|silent|low)$/.test(raw)) return 2;
  if (/^(idle|suggestion|optional)$/.test(raw)) return 3;
  return 1;
}

export function runQueuedLlmRequest(options, run) {
  if (options && options.skipQueue) return run();
  return LLM_REQUEST_QUEUE.enqueue(getLlmRequestPriority(options || {}), run, options && options.signal);
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
    const finalized = finalizeLlmSseContent(state, raw);
    if (!state.done && !finalized.finishReason) {
      if (finalized.content) finalized.finishReason = "aborted";
      else throw new Error("LLM 响应流中断：未收到正文或结束标记");
    }
    return finalized;
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
    try { reader.cancel().catch(() => { /* intentionally empty */ }); } catch { /* intentionally empty */ }
  }
  const finalized = finalizeLlmSseContent(state, raw);
  // 网络流自然关闭但既没有 [DONE]、也没有 finish_reason，同样属于不完整响应。
  // 有正文时保住已计费内容并标记 aborted，供最终纪要续写；完全为空时显式失败并进入重试。
  if (!state.done && !finalized.finishReason) {
    if (finalized.content) finalized.finishReason = "aborted";
    else throw new Error("LLM 响应流中断：未收到正文或结束标记");
  }
  return finalized;
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
    } catch { /* intentionally empty */ }
  }
  return { content: state.content, finishReason: state.finishReason || "" };
}

export async function requestLlmChatCompletion(plugin, messages, options) {
  const { llmEndpoint, llmApiKey, llmModel } = plugin.settings;
  const endpoint = normalizeLlmEndpoint(llmEndpoint);
  if (!endpoint) throw new Error("大模型服务地址未配置");
  assertSafeServiceEndpoint(endpoint, "http", "大模型服务地址");
  if (!llmModel) throw new Error("大模型名称未配置");
  if (!llmApiKey && !canOmitServiceApiKey(endpoint)) {
    throw new Error("大模型访问密钥未配置；只有本地、局域网或 Tailscale 等私有网络服务可以留空");
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
  // 思考档：default 不动请求；fast 关思维链 / reasoning 显式开——仅对已核实可控的服务注入对应参数，其它不动。
  try { applyThinkingParam(payload, (options && options.thinkingMode) || plugin.settings.thinkingMode, endpoint, llmModel); } catch { /* intentionally empty */ }
  payload.stream = streamWanted;
  const payloadText = JSON.stringify(payload);
  // Obsidian requestUrl 兜底不支持流式，单独准备一份 stream:false 的 payload 给它用。
  const fallbackPayloadText = streamWanted ? JSON.stringify(Object.assign({}, payload, { stream: false })) : payloadText;
  const messageChars = countLlmMessageChars(messages);
  const payloadChars = payloadText.length;
  const headers = buildLlmHeaders(llmApiKey, endpoint);
  const timeoutMs = resolveLlmRequestTimeoutMs(options || {});
  return await runQueuedLlmRequest(options || {}, async () => {
    const externalSignal = options && options.signal;
    const controller = (timeoutMs > 0 || externalSignal) && typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
    const onExternalAbort = () => { try { controller?.abort(); } catch { /* intentionally empty */ } };
    if (externalSignal && typeof externalSignal.addEventListener === "function") {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      if (externalSignal.aborted) onExternalAbort();
    }
    const detachExternalAbort = () => {
      try { externalSignal?.removeEventListener?.("abort", onExternalAbort); } catch { /* intentionally empty */ }
    };
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
      // 用 window.fetch（行为同 fetch、避开 no-restricted-globals）：LLM 流式需要 ReadableStream + AbortController；下方 requestUrl 回退仅非流式。
      res = await window.fetch(endpoint, {
        method: "POST",
        headers,
        body: payloadText,
        signal: controller ? controller.signal : undefined,
      });
    } catch (e) {
      if (timer) window.clearTimeout(timer);
      detachExternalAbort();
      if (controller && controller.signal && controller.signal.aborted) {
        const cancelled = !!(externalSignal && externalSignal.aborted);
        const err = new Error(cancelled
          ? "LLM 调用已取消"
          : `LLM 调用超时：${Math.round(timeoutMs / 1000)} 秒内没有响应`);
        if (cancelled) err.name = "AbortError";
        await logLlmRequestDiagnostic(
          plugin,
          cancelled ? "info" : "error",
          cancelled ? "llm.request_cancelled" : "llm.fetch_failed",
          cancelled ? "LLM 请求已取消" : "LLM 请求发送失败",
          {
          endpoint,
          model: llmModel ? "<set>" : "",
          messageChars,
          payloadChars,
          timeoutMs,
          aborted: true,
          cancelled,
          error: diagnosticError(err),
          }
        );
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
        if (shouldRetryTokenPlanParamError(res.status, msg, endpoint)) {
          const retryPayload = makeTokenPlanCompatPayload(payload);
          const retryPayloadText = JSON.stringify(retryPayload);
          await logLlmRequestDiagnostic(plugin, "warn", "llm.token_plan_param_retry", "Token-plan returned a parameter error; retrying with a minimal compatible payload", {
            endpoint,
            model: llmModel ? "<set>" : "",
            status: res.status,
            messageChars,
            payloadChars,
            retryPayloadChars: retryPayloadText.length,
            statusDetail: msg,
          });
          const retryData = await requestLlmChatCompletionViaObsidian(endpoint, headers, retryPayloadText, timeoutMs);
          await logLlmRequestDiagnostic(plugin, "info", "llm.token_plan_param_retry_succeeded", "Token-plan compatible payload retry succeeded", {
            endpoint,
            model: llmModel ? "<set>" : "",
            messageChars,
            payloadChars,
            retryPayloadChars: retryPayloadText.length,
          });
          return retryData;
        }
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
    } catch (e) {
      // HTTP 状态错误已在上方完整记录并带 status/nonRetryable 语义，不能再误记成响应读取错误。
      if (e && e.status) throw e;
      const cancelled = !!(externalSignal && externalSignal.aborted);
      if (controller && controller.signal && controller.signal.aborted) {
        const err = new Error(cancelled
          ? "LLM 调用已取消"
          : `LLM 调用超时：${Math.round(timeoutMs / 1000)} 秒内没有新数据`);
        if (cancelled) err.name = "AbortError";
        await logLlmRequestDiagnostic(
          plugin,
          cancelled ? "info" : "error",
          cancelled ? "llm.request_cancelled" : "llm.response_timeout",
          cancelled ? "LLM 请求已取消" : "LLM 响应读取超时",
          {
            endpoint,
            model: llmModel ? "<set>" : "",
            messageChars,
            payloadChars,
            timeoutMs,
            cancelled,
            error: diagnosticError(err),
          }
        );
        throw err;
      }
      await logLlmRequestDiagnostic(plugin, "error", "llm.response_read_failed", "LLM 响应读取失败", {
        endpoint,
        model: llmModel ? "<set>" : "",
        messageChars,
        payloadChars,
        timeoutMs,
        error: diagnosticError(e),
      });
      throw e;
    } finally {
      if (timer) window.clearTimeout(timer);
      detachExternalAbort();
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
  if (error && error.name === "AbortError") return false;
  const msg = String((error && error.message) || error || "");
  return /Failed to fetch|network|ECONNRESET|ETIMEDOUT|timeout|timed?\s*out|\b(429|500|502|503|504|529)\b|rate\s*limit|temporarily|service unavailable|overloaded|超时|响应流中断/i.test(msg);
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
  assertSafeServiceEndpoint(base, "http", "大模型服务地址");
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
  const endpointSecurityIssue = getServiceEndpointSecurityIssue(endpoint, "http", "大模型服务地址");
  if (endpointSecurityIssue) return endpointSecurityIssue;
  if (!model) return "大模型名称未配置";
  if (!apiKey && !canOmitServiceApiKey(endpoint)) return "大模型访问密钥未配置；只有本地、局域网或 Tailscale 等私有网络服务可以留空";
  return "";
}

export function isLlmConfigError(error) {
  const msg = String((error && error.message) || error || "");
  return /大模型(?:服务地址|名称|访问密钥)(?:未配置|不安全|格式无效|协议不受支持)|请先在 API 页配置大模型服务|LLM 配置/i.test(msg);
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
  const text = stripModeSuggestionBlocks(extractLlmContent(data).trim());
  const usage = (data && data.usage) ? data.usage : null;
  // 单任务 token 计量：把每次 LLM 调用的输入/输出体量喂给插件计量器（仅在任务窗口内累计；空闲时 no-op）。
  // 流式响应通常不带 usage（这里 usage=null），由计量器按字符估算；非流式有 usage 时取精确值。
  try {
    if (plugin && typeof plugin.addTaskMeter === "function") {
      plugin.addTaskMeter(String(system || "").length + String(user || "").length, text.length, usage);
    }
  } catch { /* intentionally empty */ }
  return { text, finishReason: extractLlmFinishReason(data), usage };
}

export async function callLlm(plugin, system, user, options) {
  const { text } = await callLlmWithMeta(plugin, system, user, options);
  return text;
}

// 续写衔接：若续写片段开头与已有结尾有重叠，去掉重叠再拼，避免模型重复一段。
function stitchContinuation(a, b) {
  const head = String(a || "");
  const tail = String(b || "");
  if (!head) return tail;
  if (!tail) return head;
  const maxOverlap = Math.min(400, head.length, tail.length);
  for (let k = maxOverlap; k >= 16; k--) {
    if (head.slice(-k) === tail.slice(0, k)) return head + tail.slice(k);
  }
  return head + tail;
}

// 截断自动续写：当一次输出因 finishReason==="length" 被截断时，用「assistant 预填 + 让它从断点续写」
// 的方式再发请求，把多段拼成完整产物——不让偶发的模型输出上限决定内容完整性。
// 工程兜底，与 mergeAndPolishLongSession 的「事前按时间分段」互补：那条防"明显超长"，这条防"偶发被切"。
export async function callLlmWithContinuation(plugin, system, user, options, opts) {
  const maxContinuations = Math.max(0, (opts && Number(opts.maxContinuations)) || 3);
  const first = await callLlmWithMeta(plugin, system, user, options);
  let text = String(first.text || "");
  let finishReason = first.finishReason;
  let continuations = 0;
  // 思考模式可能耗尽 max_tokens，返回截断状态却没有可见正文；先关闭思考模式重试一次，
  // 避免空正文直接阻断续写。对未识别的端点，applyThinkingParam 会保持请求不变。
  const emptyTruncated = !text.trim() && isTruncatedFinishReason(finishReason);
  const effOptions = emptyTruncated ? Object.assign({}, options, { thinkingMode: "fast" }) : options;
  if (emptyTruncated) {
    try {
      const retry = await callLlmWithMeta(plugin, system, user, effOptions);
      text = String(retry.text || "");
      finishReason = retry.finishReason;
    } catch { /* 重试失败时保留原始结果，交给下方兜底续写 */ }
  }
  while (isTruncatedFinishReason(finishReason) && continuations < maxContinuations) {
    continuations++;
    const messages = text.trim()
      ? [
          { role: "system", content: system },
          { role: "user", content: user },
          { role: "assistant", content: text },
          { role: "user", content: "你上一条回复因长度上限被截断了。请直接从断点处继续输出剩余内容、无缝衔接，不要重复任何已输出的文字、不要重新开头、不要加任何前言或结束语，直接接着写。" },
        ]
      : [
          { role: "system", content: system },
          { role: "user", content: user },
          { role: "user", content: "你上一次生成因思考或输出过长被截断，且没有产生任何可见内容。请忽略截断状态，直接完整回答原始任务，不要提及截断、不要加任何前言。" },
        ];
    let data;
    try {
      data = await requestLlmChatCompletion(plugin, messages, effOptions);
    } catch {
      break; // 续写失败就用已有内容，不让整体失败
    }
    const piece = stripModeSuggestionBlocks(extractLlmContent(data).trim());
    try {
      if (plugin && typeof plugin.addTaskMeter === "function") {
        plugin.addTaskMeter(messages.reduce((n, m) => n + String(m.content || "").length, 0), piece.length, (data && data.usage) || null);
      }
    } catch { /* intentionally empty */ }
    if (!piece) break;
    text = stitchContinuation(text, piece);
    finishReason = extractLlmFinishReason(data);
  }
  return { text, finishReason, truncated: isTruncatedFinishReason(finishReason), continuations };
}

export async function callBriefingMergeLlm(plugin, system, user, options, diagCtx) {
  const { text, finishReason, continuations } = await callLlmWithContinuation(plugin, system, user, options, { maxContinuations: 3 });
  const truncated = isTruncatedFinishReason(finishReason);
  if (continuations > 0) {
    try {
      await logLlmRequestDiagnostic(plugin, "info", "llm.merge_continued", "输出被截断后自动续写拼接", Object.assign({
        continuations, truncatedAfter: truncated, outputChars: text.length,
      }, diagCtx || {}));
    } catch { /* intentionally empty */ }
  }
  if (truncated) {
    try {
      await logLlmRequestDiagnostic(plugin, "warn", "llm.merge_truncated", "最终纪要在多次续写后仍疑似被输出长度上限截断", Object.assign({
        finishReason, outputChars: text.length, continuations,
      }, diagCtx || {}));
    } catch { /* intentionally empty */ }
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

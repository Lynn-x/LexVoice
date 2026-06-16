/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import { delayMs, extFromMime, isTransientAsrError, isAsrNonRetryableError, mimeFromExt, pickMimeType } from '../shared/util-audio';
import { extractLlmContent } from '../shared/util-json';
import { withPromiseTimeout, getRequestUrlText, parseRequestUrlJson, getHeaderValue, parseRetryAfterMs } from '../shared/util-http';
import { isLocalServiceEndpoint } from '../shared/util-note';
import { buildVocabularyPrompt, applyVocabularyCorrections, loadVocabularyGroups } from '../vocabulary';
import { buildPeopleHotwordsForAsr } from '../people';
import { lexvoiceArrayBufferToBase64 } from './clients';

export function normalizeAsrConcurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(3, Math.floor(n)));
}

export const IMPORT_AUDIO_CHUNK_SAMPLE_RATE = 16000;

export async function decodeAudioBlob(blob) {
  const AudioContextCtor = window.AudioContext || window["webkitAudioContext"];
  if (!AudioContextCtor) throw new Error("当前环境不支持音频解码");
  const ctx = new AudioContextCtor();
  try {
    const ab = await blob.arrayBuffer();
    return await ctx.decodeAudioData(ab.slice(0));
  } finally {
    try { await ctx.close(); } catch {}
  }
}

export async function renderAudioBufferSliceToWav(audioBuffer, startMs, endMs) {
  const OfflineContextCtor = window.OfflineAudioContext || window["webkitOfflineAudioContext"];
  if (!OfflineContextCtor) throw new Error("当前环境不支持离线音频切片");
  const startSec = Math.max(0, (Number(startMs) || 0) / 1000);
  const endSec = Math.max(startSec + 0.1, (Number(endMs) || 0) / 1000);
  const durationSec = endSec - startSec;
  const frameCount = Math.max(1, Math.ceil(durationSec * IMPORT_AUDIO_CHUNK_SAMPLE_RATE));
  const offline = new OfflineContextCtor(1, frameCount, IMPORT_AUDIO_CHUNK_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0, startSec, durationSec);
  const rendered = await offline.startRendering();
  return new Blob([encodeMonoWav(rendered)], { type: "audio/wav" });
}

export function encodeMonoWav(audioBuffer) {
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

export async function mapLimit(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Math.min(list.length || 1, normalizeAsrConcurrency(limit)));
  const results = new Array(list.length);
  let nextIndex = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (nextIndex < list.length) {
      const current = nextIndex++;
      results[current] = await worker(list[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function transcribeImportAudioChunk(plugin, blob, mime, concurrency) {
  try {
    return await transcribeAudio(plugin, blob, mime);
  } catch (e) {
    if (normalizeAsrConcurrency(concurrency) <= 1 || !isTransientAsrError(e)) throw e;
    const wait = 1200 + Math.floor(Math.random() * 800);
    await delayMs(wait);
    return await transcribeAudio(plugin, blob, mime);
  }
}

export function resolveTranscribeProvider(plugin) {
  const s = plugin.settings;
  const id = s.activeTranscribeProvider || "siliconflow";
  const provider = (s.transcribeProviders && s.transcribeProviders[id]) || null;
  // 优先用 provider 子对象；否则回退到顶层旧字段
  const endpoint = (provider && provider.endpoint) || s.transcribeEndpoint || "";
  const apiKey   = (provider && provider.apiKey)   || s.transcribeApiKey   || "";
  const model    = (provider && provider.model)    || s.transcribeModel    || "";
  const language = (provider && provider.language !== undefined ? provider.language : s.transcribeLanguage) || "";
  const protocol = provider && provider.protocol ? String(provider.protocol) : "";
  return { id, endpoint, apiKey, model, language, protocol, name: provider ? provider.name : "" };
}

export function formatUploadSize(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}

export function compactErrorBody(text, maxLen = 240) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function approxBase64Bytes(rawBytes) {
  return Math.ceil(Math.max(0, Number(rawBytes) || 0) / 3) * 4;
}

export function buildTranscribeHttpError(res, body, provider, blob, mime) {
  const status = Number(res && res.status) || 0;
  const statusText = String(res && res.statusText ? res.statusText : "").trim();
  const traceId = res && res.headers && typeof res.headers.get === "function"
    ? (res.headers.get("x-siliconcloud-trace-id") || res.headers.get("x-request-id") || res.headers.get("cf-ray") || "")
    : "";
  const service = (provider && (provider.name || provider.id)) || "当前服务";
  const model = provider && provider.model ? `模型：${provider.model}` : "";
  const detail = compactErrorBody(body);
  const ext = extFromMime(mime || (blob && blob.type) || "");
  const audioInfo = `音频：${ext || "unknown"} / ${formatUploadSize(blob && blob.size)}`;
  const hints = [];

  if (status === 401 || status === 403) hints.push("请检查转写访问密钥和服务权限");
  else if (status === 404) hints.push("请检查转写服务地址和模型名称");
  else if (status === 413) hints.push("音频文件过大，请缩短切片或降低码率后重试");
  else if (status === 429) hints.push("服务限流，请稍后重试或切换服务");
  else if (status >= 500) hints.push("服务端错误，建议稍后重试；连续失败时可切换转写服务或调整音频格式");

  return [
    `转写失败 ${status}${statusText ? " " + statusText : ""}`,
    `服务：${service}`,
    model,
    audioInfo,
    traceId ? `Trace ID：${traceId}` : "",
    detail ? `返回：${detail}` : "",
    hints.join("；"),
  ].filter(Boolean).join("；");
}

export function makeRecordingIssue(kind, patch) {
  return Object.assign({
    kind: kind || "service",
    at: Date.now(),
    message: "",
    stoppedAtMs: null,
  }, patch || {});
}

export function getTranscribeRequestTimeoutMs(provider) {
  return isLocalServiceEndpoint(provider && provider.endpoint) ? 10 * 60 * 1000 : 120 * 1000;
}

export const APIMIMO_ASR_PROTOCOL = "apimimo-chat-input-audio";

export const APIMIMO_ASR_MAX_BASE64_BYTES = Math.floor(9.5 * 1024 * 1024);

export const APIMIMO_ASR_NATIVE_EXTS = new Set(["mp3", "wav"]);

export const APIMIMO_ASR_CHUNK_MS = 3 * 60 * 1000;

export const APIMIMO_ASR_MAX_CHUNKS = 160;

export function apimimoNativeAudioMime(ext) {
  switch (ext) {
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    default: return "";
  }
}

export function isApimimoAsrProvider(provider) {
  const p = provider || {};
  if (p.protocol === APIMIMO_ASR_PROTOCOL) return true;
  const id = String(p.id || "").toLowerCase();
  const endpoint = String(p.endpoint || "").toLowerCase();
  const model = String(p.model || "").toLowerCase();
  return id === "apimimo" || endpoint.includes("xiaomimimo.com") || model === "mimo-v2.5-asr";
}

export function normalizeApimimoAsrEndpoint(endpoint) {
  const raw = String(endpoint || "").trim();
  if (!raw) return "";
  const noTrail = raw.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(noTrail)) return noTrail;
  try {
    const url = new URL(noTrail);
    const path = (url.pathname || "").replace(/\/+$/, "");
    url.pathname = path + "/chat/completions";
    return url.toString().replace(/\/+$/, "");
  } catch {}
  return noTrail;
}

export function apimimoPermanentError(message) {
  const err: any = new Error(message);
  err.nonRetryable = true;
  return err;
}

export async function buildApimimoAsrChunks(blob, mime) {
  const inputMime = String(mime || (blob && blob.type) || "").toLowerCase();
  const ext = extFromMime(inputMime);
  const nativeMime = APIMIMO_ASR_NATIVE_EXTS.has(ext) ? apimimoNativeAudioMime(ext) : "";

  // 原生格式且 base64 未超限：原样直发（1 分钟 mp3 ≈ 1-2MB，低于 10MB）。
  if (nativeMime && approxBase64Bytes(blob.size) <= APIMIMO_ASR_MAX_BASE64_BYTES) {
    return [{ blob, mime: nativeMime }];
  }

  // 走到这里：非 wav/mp3 格式，或原生但 base64 超 10MB（如几十分钟的恢复切片）。
  let audioBuffer;
  try {
    audioBuffer = await decodeAudioBlob(blob);
  } catch (e) {
    const hint = nativeMime
      ? `该音频 base64 超 10MB 需切块，但本机无法解码它（${e && e.message ? e.message : e}）`
      : `格式 ${inputMime || "unknown"} 不被 MiMo 服务端接受（仅 wav/mp3），需转码但本机无法解码（${e && e.message ? e.message : e}）`;
    throw apimimoPermanentError(`APIMiMo-V2.5-ASR：${hint}。请改用 SiliconFlow 转写此段，或缩短分段间隔后重录。`);
  }
  const totalMs = Math.max(1, Math.round((audioBuffer.duration || 0) * 1000));
  const chunkCount = Math.ceil(totalMs / APIMIMO_ASR_CHUNK_MS);
  if (chunkCount > APIMIMO_ASR_MAX_CHUNKS) {
    throw apimimoPermanentError(`APIMiMo-V2.5-ASR 单次最多自动切 ${APIMIMO_ASR_MAX_CHUNKS} 块（约 ${Math.round(APIMIMO_ASR_MAX_CHUNKS * APIMIMO_ASR_CHUNK_MS / 60000)} 分钟）；当前约 ${Math.round(totalMs / 60000)} 分钟过长。请缩短分段间隔，或对超长录音改用支持大文件的 ASR 服务。`);
  }
  const chunks = [];
  for (let startMs = 0; startMs < totalMs; startMs += APIMIMO_ASR_CHUNK_MS) {
    const endMs = Math.min(totalMs, startMs + APIMIMO_ASR_CHUNK_MS);
    const wavBlob = await renderAudioBufferSliceToWav(audioBuffer, startMs, endMs);
    if (approxBase64Bytes(wavBlob.size) > APIMIMO_ASR_MAX_BASE64_BYTES) {
      throw apimimoPermanentError(`APIMiMo-V2.5-ASR 转码后单块 base64 仍超过 10MB（${formatUploadSize(wavBlob.size)}）。请改用支持更大切片的 ASR 服务。`);
    }
    chunks.push({ blob: wavBlob, mime: "audio/wav" });
  }
  return chunks;
}

export function extractApimimoAsrText(data) {
  const text = extractLlmContent(data).trim();
  if (text) return text;
  return String(
    (data && (data.text || data.transcript || data.result)) ||
    (data && data.output_text) ||
    ""
  ).trim();
}

export async function requestApimimoAsrChunk(provider, prepared, endpoint) {
  const ab = await prepared.blob.arrayBuffer();
  const audioDataUrl = `data:${prepared.mime};base64,${lexvoiceArrayBufferToBase64(ab)}`;
  const timeoutMs = getTranscribeRequestTimeoutMs(Object.assign({}, provider, { endpoint }));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  // asr_options.language：文档仅支持 auto / zh / en；其它值（含空 / 方言码）一律归一为 auto。
  // 明确语种能提升准确率，所以默认 auto，用户在设置里选 zh/en 时透传。
  const langRaw = String(provider.language || "").trim().toLowerCase();
  const asrLanguage = (langRaw === "zh" || langRaw === "en") ? langRaw : "auto";
  const payload = {
    model: provider.model || "mimo-v2.5-asr",
    messages: [{
      role: "user",
      content: [{
        type: "input_audio",
        // 官方请求结构只有 input_audio.data（data:{MIME};base64,...），靠 MIME 前缀识别格式，无 format 字段。
        input_audio: {
          data: audioDataUrl,
        },
      }],
    }],
    asr_options: { language: asrLanguage },
    stream: false,
  };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, provider.apiKey ? { "Authorization": `Bearer ${provider.apiKey}` } : {}),
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      const httpErr: any = new Error(buildTranscribeHttpError(res, msg, provider, prepared.blob, prepared.mime));
      // MiMo 错误码语义：400 格式/大小、401 密钥、402 余额、403 风控、404 能力、421 内容审核——都不是重试能解决的。
      if ([400, 401, 402, 403, 404, 421].includes(res.status)) httpErr.nonRetryable = true;
      throw httpErr;
    }
    // 关键：body 读取（res.json）必须在 timer 清除之前完成，否则服务端 200 后挂起 body 会永久 hang
    // 卡死该 session 的 writeQueue。json() 失败必须往外抛（abort 由下面统一报超时，解析失败显式报错）——
    // 绝不可静默换成 {}，否则超时/断流被吞成"空转写"，段被标成功并删缓存音频 = 静默丢段。
    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (controller && controller.signal && controller.signal.aborted) throw e; // 外层 catch 统一报超时
      throw new Error(`APIMiMo 响应解析失败（HTTP ${res.status} 但响应体非法或中断）：${(e && e.message) || e}`);
    }
    const apiErr = data && data.error;
    if (typeof apiErr === "string" && apiErr.trim()) {
      throw new Error(`APIMiMo 返回错误：${apiErr.trim()}`);
    }
    if (apiErr && (apiErr.message || apiErr.code)) {
      const bodyErr: any = new Error(`APIMiMo 返回错误${apiErr.code ? `（${apiErr.code}）` : ""}：${apiErr.message || "未知错误"}`);
      if (/^4/.test(String(apiErr.code || ""))) bodyErr.nonRetryable = true;
      throw bodyErr;
    }
    return extractApimimoAsrText(data);
  } catch (e) {
    if (controller && controller.signal && controller.signal.aborted) {
      throw new Error(`转写请求超时：${Math.round(timeoutMs / 1000)} 秒内没有响应；录音文件已保留，可稍后重试或降低 ASR 并发数`);
    }
    throw e;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export async function transcribeAudioWithApimimo(plugin, provider, blob, mime, vocabularyGroups) {
  const chunks = await buildApimimoAsrChunks(blob, mime);
  const endpoint = normalizeApimimoAsrEndpoint(provider.endpoint);
  // 顺序转写各块（保留时序，避免并发触发限流），拼接后对全文统一做热词修正。
  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const part = await requestApimimoAsrChunk(provider, chunks[i], endpoint);
    if (part) parts.push(part);
    else if (chunks.length > 1) {
      // 多块场景中间缺块=正文无感缺一段，必须留痕（单块为空走上层"本段无转写内容"提示，不重复记）。
      try {
        await plugin.logDiagnostic("warn", "asr.apimimo_empty_chunk", "APIMiMo 单块转写为空", {
          chunkIndex: i, chunkCount: chunks.length, chunkBytes: chunks[i].blob && chunks[i].blob.size,
        });
      } catch {}
    }
  }
  const rawText = parts.join(" ").replace(/\s+/g, " ").trim();
  return applyVocabularyCorrections(rawText, vocabularyGroups).trim();
}

export async function transcribeAudio(plugin, blob, mime) {
  const p = resolveTranscribeProvider(plugin);
  if (!p.endpoint) throw new Error(`转写服务地址未配置（当前服务：${p.name || p.id}）`);
  if (!p.apiKey && !isLocalServiceEndpoint(p.endpoint)) throw new Error(`转写访问密钥未配置（当前服务：${p.name || p.id}）`);
  if (!p.model)    throw new Error(`转写模型名称未配置（当前服务：${p.name || p.id}）`);
  const vocabularyGroups = await loadVocabularyGroups(plugin);
  if (isApimimoAsrProvider(p)) {
    return await transcribeAudioWithApimimo(plugin, p, blob, mime, vocabularyGroups);
  }
  const form = new FormData();
  const ext = extFromMime(mime);
  form.append("file", blob, `recording.${ext}`);
  form.append("model", p.model);
  if (p.language && p.language !== "auto") form.append("language", p.language);
  form.append("response_format", "json");
  const peopleHotwords = await buildPeopleHotwordsForAsr(plugin, p);
  const promptText = buildVocabularyPrompt(vocabularyGroups, peopleHotwords);
  if (promptText) form.append("prompt", promptText);
  const timeoutMs = getTranscribeRequestTimeoutMs(p);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(p.endpoint, {
      method: "POST",
      headers: p.apiKey ? { "Authorization": `Bearer ${p.apiKey}` } : {},
      body: form,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    if (timer) window.clearTimeout(timer);
    if (controller && controller.signal && controller.signal.aborted) {
      throw new Error(`转写请求超时：${Math.round(timeoutMs / 1000)} 秒内没有响应；录音文件已保留，可稍后重试或降低 ASR 并发数`);
    }
    throw e;
  }
  // 关键：把超时计时器保留到 body 读取完成再清。否则服务端 hang 在 body 传输（连接不断）会让
  // res.json()/res.text() 永久挂起 → 卡死整条 writeQueue，录音继续但纪要再不更新。
  try {
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(buildTranscribeHttpError(res, msg, p, blob, mime));
    }
    // json() 失败必须显式报错——静默换 {} 会把超时/断流吞成"空转写"，段被标成功并删缓存音频 = 静默丢段。
    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (controller && controller.signal && controller.signal.aborted) {
        throw new Error(`转写请求超时：${Math.round(timeoutMs / 1000)} 秒内响应未读完；录音文件已保留，可稍后重试或降低 ASR 并发数`);
      }
      throw new Error(`转写响应解析失败（HTTP ${res.status} 但响应体非法或中断）：${(e && e.message) || e}`);
    }
    const rawText = (data.text || data.transcript || data.result || "").trim();
    return applyVocabularyCorrections(rawText, vocabularyGroups).trim();
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

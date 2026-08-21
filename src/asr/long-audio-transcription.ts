import { requestUrl } from "obsidian";
import { delayMs } from "../shared/util-audio";
import { formatElapsed } from "../shared/util-common";
import { resolveTranscribeProvider, transcribeAudio } from "./transcribe";
import { buildDashScopeTranscriptionParameters } from "./diarization";

export const DASHSCOPE_FILETRANS_PROTOCOL = "dashscope-filetrans";

export interface LongAudioTranscriptionOptions {
  providerId?: string;
  diarization?: boolean;
  speakerCount?: number;
  fileName?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  audioDurationMs?: number;
  onProgress?: (progress: LongAudioProgress) => void;
}

export interface LongAudioProgress {
  phase: "upload" | "submit" | "waiting" | "download";
  label: string;
  detail?: string;
  taskId?: string;
}

export interface LongAudioTranscriptionResult {
  text: string;
  providerId: string;
  taskId?: string;
  sentenceCount: number;
  durationMs?: number;
}

type JsonRecord = Record<string, unknown>;

interface HttpResponseLike {
  status: number;
  text?: string;
}

interface ImportTranscribeProvider {
  id: string;
  endpoint: string;
  apiKey: string;
  model: string;
  language?: string;
  protocol?: string;
}

export const DASHSCOPE_IMPORT_MODEL_OPTIONS = ["fun-asr", "paraformer-v2"] as const;

export function estimateCloudTranscriptionDuration(audioDurationMs: unknown): { minMs: number; maxMs: number } {
  const durationMs = Math.max(0, Number(audioDurationMs) || 0);
  if (!durationMs) return { minMs: 2 * 60_000, maxMs: 10 * 60_000 };
  const minMs = Math.min(12 * 60_000, Math.max(45_000, Math.round(durationMs * 0.025)));
  const maxMs = Math.min(30 * 60_000, Math.max(3 * 60_000, Math.round(durationMs * 0.08)));
  return { minMs, maxMs: Math.max(maxMs, minMs + 60_000) };
}

function formatEstimateMinutes(ms: number): string {
  return String(Math.max(1, Math.ceil(ms / 60_000)));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function makeServiceError(prefix: string, payload: unknown): Error {
  const value = asRecord(payload);
  const output = asRecord(value.output);
  const message = asString(output.message) || asString(value.message) || asString(output.code) || asString(value.code);
  return new Error(message ? `${prefix}：${message}` : prefix);
}

function parseJsonText(text: unknown): unknown {
  const raw = asString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function parseServiceJsonResponse(response: HttpResponseLike, phase: string): JsonRecord {
  const status = Number(response && response.status) || 0;
  const raw = typeof response?.text === "string" ? response.text.trim() : "";
  if (!raw) {
    throw new Error(`${phase}返回空响应（HTTP ${status || "未知"}）`);
  }
  const parsed = parseJsonText(raw);
  if (!parsed) {
    throw new Error(`${phase}返回的不是有效 JSON（HTTP ${status || "未知"}）：${raw.slice(0, 180)}`);
  }
  return asRecord(parsed);
}

function requireSuccessfulJsonResponse(response: HttpResponseLike, phase: string): JsonRecord {
  const status = Number(response && response.status) || 0;
  const raw = typeof response?.text === "string" ? response.text.trim() : "";
  const parsed = raw ? parseJsonText(raw) : null;
  if (status < 200 || status >= 300) {
    const payload = parsed || (raw ? { message: raw.slice(0, 180) } : {});
    throw makeServiceError(`${phase}（HTTP ${status || "未知"}）`, payload);
  }
  return parseServiceJsonResponse(response, phase);
}

function safeUploadFileName(value: unknown, mime: string): string {
  const fallbackExt = mime.includes("wav") ? "wav"
    : mime.includes("mpeg") ? "mp3"
      : mime.includes("mp4") ? "m4a"
        : mime.includes("ogg") ? "ogg"
          : mime.includes("flac") ? "flac"
            : "webm";
  const raw = asString(value) || `lexvoice-import.${fallbackExt}`;
  const normalized = raw.replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(-160);
  return /\.[a-z0-9]{2,8}$/i.test(normalized) ? normalized : `${normalized}.${fallbackExt}`;
}

export function isDashScopeFileTransProvider(provider: unknown): boolean {
  const value = asRecord(provider);
  return asString(value.protocol).toLowerCase() === DASHSCOPE_FILETRANS_PROTOCOL;
}

export function resolveImportTranscribeProvider(plugin: { settings?: JsonRecord }) {
  const settings = asRecord(plugin && plugin.settings);
  const providerId = asString(settings.importTranscribeProvider)
    || asString(settings.activeTranscribeProvider)
    || "siliconflow";
  return resolveTranscribeProvider(plugin, providerId) as ImportTranscribeProvider;
}

function resolveTypedTranscribeProvider(
  plugin: { settings?: JsonRecord },
  providerId: string,
): ImportTranscribeProvider {
  return resolveTranscribeProvider(plugin, providerId);
}

export interface DashScopeSentence {
  beginTimeMs: number;
  endTimeMs: number;
  text: string;
  speakerId: string;
}

export function extractDashScopeSentences(payload: unknown): DashScopeSentence[] {
  const root = asRecord(payload);
  const candidates = [
    root.transcripts,
    asRecord(root.output).transcripts,
    asRecord(root.result).transcripts,
    asRecord(asRecord(root.output).result).transcripts,
  ];
  const transcripts = candidates.map(asArray).find((items) => items.length) || [];
  const sentences: DashScopeSentence[] = [];
  for (const transcriptValue of transcripts) {
    const transcript = asRecord(transcriptValue);
    for (const sentenceValue of asArray(transcript.sentences)) {
      const sentence = asRecord(sentenceValue);
      const text = asString(sentence.text);
      if (!text) continue;
      sentences.push({
        beginTimeMs: Math.max(0, asNumber(sentence.begin_time ?? sentence.beginTime ?? sentence.start_time)),
        endTimeMs: Math.max(0, asNumber(sentence.end_time ?? sentence.endTime ?? sentence.stop_time)),
        text,
        speakerId: asString(sentence.speaker_id ?? sentence.speakerId ?? sentence.speaker),
      });
    }
  }
  return sentences;
}

export function composeDashScopeTranscript(payload: unknown): { text: string; sentenceCount: number; durationMs?: number } {
  const sentences = extractDashScopeSentences(payload);
  if (!sentences.length) {
    const root = asRecord(payload);
    const transcriptGroups = [
      root.transcripts,
      asRecord(root.output).transcripts,
      asRecord(root.result).transcripts,
      asRecord(asRecord(root.output).result).transcripts,
    ];
    const transcripts = transcriptGroups.map(asArray).find((items) => items.length) || [];
    const plain = transcripts
      .map((item) => asString(asRecord(item).transcript) || asString(asRecord(item).text))
      .filter(Boolean)
      .join("\n")
      || asString(root.text)
      || asString(asRecord(root.output).text);
    return { text: plain, sentenceCount: 0 };
  }

  const speakerMap = new Map<string, string>();
  const turns: Array<{ startMs: number; speaker: string; parts: string[] }> = [];
  for (const sentence of sentences) {
    let speaker = "";
    if (sentence.speakerId) {
      if (!speakerMap.has(sentence.speakerId)) {
        speakerMap.set(sentence.speakerId, `说话人${speakerMap.size + 1}`);
      }
      speaker = speakerMap.get(sentence.speakerId) || "";
    }
    const previous = turns[turns.length - 1];
    if (previous && previous.speaker === speaker) {
      previous.parts.push(sentence.text);
    } else {
      turns.push({ startMs: sentence.beginTimeMs, speaker, parts: [sentence.text] });
    }
  }
  const text = turns.map((turn) => {
    const timestamp = `[${formatElapsed(turn.startMs)}]`;
    const speaker = turn.speaker ? ` [${turn.speaker}]` : "";
    return `${timestamp}${speaker} ${turn.parts.join(" ").replace(/\s+/g, " ").trim()}`;
  }).join("\n\n");
  const durationMs = sentences.reduce((max, sentence) => Math.max(max, sentence.endTimeMs), 0);
  return { text, sentenceCount: sentences.length, durationMs: durationMs || undefined };
}

function dashScopeBaseUrl(endpoint: string): string {
  const normalized = endpoint.replace(/\/+$/, "");
  const marker = "/api/v1/services/audio/asr/transcription";
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(0, index) : "https://dashscope.aliyuncs.com";
}

async function getDashScopeUploadPolicy(
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<JsonRecord> {
  const baseUrl = dashScopeBaseUrl(endpoint);
  const policyResponse = await requestUrl({
    url: `${baseUrl}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    throw: false,
  });
  const payload = requireSuccessfulJsonResponse(policyResponse, "获取阿里云文件上传凭证失败");
  const policy = asRecord(payload.data);
  if (!asString(policy.upload_host) || !asString(policy.upload_dir)) {
    throw new Error("阿里云上传凭证响应缺少上传地址，请检查模型名称是否支持录音文件识别");
  }
  return policy;
}

export async function testImportTranscribeProvider(
  plugin: { settings?: JsonRecord },
  providerId?: string,
): Promise<{ providerId: string; model: string; detail: string }> {
  const provider = resolveTypedTranscribeProvider(
    plugin,
    providerId || asString(asRecord(plugin && plugin.settings).importTranscribeProvider),
  );
  if (!provider.endpoint) throw new Error("导入音频转写服务地址未配置");
  if (!provider.apiKey) throw new Error("导入音频转写服务密钥未配置");
  if (!provider.model) throw new Error("导入音频转写模型未配置");
  if (!isDashScopeFileTransProvider(provider)) {
    throw new Error("该服务暂不支持无音频连接测试，请导入一段短音频验证");
  }
  const policy = await getDashScopeUploadPolicy(provider.endpoint, provider.apiKey, provider.model);
  const maxSizeMb = asNumber(policy.max_file_size_mb);
  return {
    providerId: provider.id,
    model: provider.model,
    detail: maxSizeMb > 0 ? `单文件上传上限 ${maxSizeMb} MB` : "上传凭证正常",
  };
}

export async function fetchImportTranscribeModels(
  plugin: { settings?: JsonRecord },
  providerId?: string,
): Promise<string[]> {
  const provider = resolveTypedTranscribeProvider(
    plugin,
    providerId || asString(asRecord(plugin && plugin.settings).importTranscribeProvider),
  );
  if (!isDashScopeFileTransProvider(provider)) return provider.model ? [provider.model] : [];
  if (!provider.apiKey) throw new Error("请先填写阿里云百炼 API Key");
  const baseUrl = dashScopeBaseUrl(provider.endpoint || "");
  const response = await requestUrl({
    url: `${baseUrl}/api/v1/deployments/models?page_no=1&page_size=100&version=v1.0&model_source=base`,
    method: "GET",
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    throw: false,
  });
  const builtIns = [...DASHSCOPE_IMPORT_MODEL_OPTIONS];
  if (response.status < 200 || response.status >= 300 || !String(response.text || "").trim()) {
    return Array.from(new Set<string>([provider.model, ...builtIns].filter((id): id is string => !!id)));
  }
  const payload = parseServiceJsonResponse(response, "获取阿里云模型列表失败");
  const records = [
    ...asArray(payload.data),
    ...asArray(payload.models),
    ...asArray(asRecord(payload.output).models),
  ];
  const remoteIds = records
    .map((item) => asString(asRecord(item).model_name ?? asRecord(item).model ?? asRecord(item).id ?? asRecord(item).name))
    .filter((id) => /(?:asr|paraformer)/i.test(id));
  return Array.from(new Set<string>([provider.model, ...builtIns, ...remoteIds].filter((id): id is string => !!id)))
    .sort((a, b) => a.localeCompare(b));
}

async function getDashScopeUploadUrl(
  endpoint: string,
  apiKey: string,
  model: string,
  blob: Blob,
  fileName: string,
): Promise<string> {
  const policy = await getDashScopeUploadPolicy(endpoint, apiKey, model);
  const maxSizeMb = asNumber(policy.max_file_size_mb);
  if (maxSizeMb > 0 && blob.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`音频文件超过阿里云临时上传上限 ${maxSizeMb} MB`);
  }
  const uploadHost = asString(policy.upload_host);
  const uploadDir = asString(policy.upload_dir).replace(/\/+$/, "");
  if (!uploadHost || !uploadDir) throw new Error("阿里云未返回有效的文件上传地址");
  const key = `${uploadDir}/${safeUploadFileName(fileName, blob.type || "audio/webm")}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", asString(policy.oss_access_key_id));
  form.append("policy", asString(policy.policy));
  form.append("Signature", asString(policy.signature));
  form.append("key", key);
  form.append("x-oss-object-acl", asString(policy.x_oss_object_acl) || "private");
  form.append("x-oss-forbid-overwrite", asString(policy.x_oss_forbid_overwrite) || "true");
  form.append("success_action_status", "200");
  form.append("file", blob, safeUploadFileName(fileName, blob.type || "audio/webm"));
  // OSS policy upload requires multipart FormData. Obsidian requestUrl does not expose an equivalent multipart body API.
  const uploadResponse = await window.fetch(uploadHost, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => "");
    throw new Error(`上传音频到阿里云临时存储失败（HTTP ${uploadResponse.status}）${body ? `：${body.slice(0, 180)}` : ""}`);
  }
  return `oss://${key}`;
}

async function transcribeWithDashScope(
  provider: ImportTranscribeProvider,
  blob: Blob,
  options: LongAudioTranscriptionOptions,
): Promise<LongAudioTranscriptionResult> {
  if (!provider.endpoint) throw new Error("导入音频转写服务地址未配置");
  if (!provider.apiKey) throw new Error("导入音频转写服务密钥未配置");
  if (!provider.model) throw new Error("导入音频转写模型未配置");
  const notify = (progress: LongAudioProgress) => options.onProgress?.(progress);
  notify({ phase: "upload", label: "正在上传音频" });
  const fileUrl = await getDashScopeUploadUrl(
    provider.endpoint,
    provider.apiKey,
    provider.model,
    blob,
    options.fileName || "",
  );
  notify({ phase: "submit", label: "正在提交转写任务" });
  const parameters = buildDashScopeTranscriptionParameters(options, provider.language);
  const submitResponse = await requestUrl({
    url: provider.endpoint,
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify({
      model: provider.model,
      input: { file_urls: [fileUrl] },
      parameters,
    }),
    throw: false,
  });
  const submitPayload = requireSuccessfulJsonResponse(submitResponse, "提交阿里云长音频转写任务失败");
  const taskId = asString(asRecord(submitPayload.output).task_id);
  if (!taskId) throw new Error("阿里云未返回转写任务 ID");
  const queryUrl = `${dashScopeBaseUrl(provider.endpoint)}/api/v1/tasks/${encodeURIComponent(taskId)}`;
  const pollIntervalMs = Math.max(1500, Number(options.pollIntervalMs) || 3000);
  const timeoutMs = Math.max(60_000, Number(options.timeoutMs) || 6 * 60 * 60 * 1000);
  const deadline = Date.now() + timeoutMs;
  const estimate = estimateCloudTranscriptionDuration(options.audioDurationMs);
  const durationLabel = Number(options.audioDurationMs) > 0 ? formatElapsed(Number(options.audioDurationMs)) : "未知";
  const estimateLabel = `${formatEstimateMinutes(estimate.minMs)}–${formatEstimateMinutes(estimate.maxMs)} 分钟`;
  let transcriptionUrl = "";
  while (Date.now() < deadline) {
    notify({
      phase: "waiting",
      label: "正在发送给云端识别整段音频",
      detail: `音频时长 ${durationLabel} · 预计约 ${estimateLabel}完成`,
      taskId,
    });
    const queryResponse = await requestUrl({
      url: queryUrl,
      method: "GET",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      throw: false,
    });
    const queryPayload = requireSuccessfulJsonResponse(queryResponse, "查询阿里云转写任务失败");
    const output = asRecord(queryPayload.output);
    const status = asString(output.task_status).toUpperCase();
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw makeServiceError("阿里云长音频转写失败", queryPayload);
    }
    if (status === "SUCCEEDED") {
      const result = asArray(output.results).map(asRecord).find((item) => asString(item.subtask_status).toUpperCase() === "SUCCEEDED")
        || asRecord(asArray(output.results)[0]);
      transcriptionUrl = asString(result.transcription_url);
      if (!transcriptionUrl) throw makeServiceError("阿里云转写完成但没有返回结果地址", result);
      break;
    }
    await delayMs(pollIntervalMs);
  }
  if (!transcriptionUrl) throw new Error("阿里云长音频转写等待超时，任务仍可在服务端继续执行");
  notify({ phase: "download", label: "正在读取转写结果", taskId });
  const resultResponse = await requestUrl({ url: transcriptionUrl, method: "GET", throw: false });
  const resultPayload = requireSuccessfulJsonResponse(resultResponse, "下载阿里云转写结果失败");
  const composed = composeDashScopeTranscript(resultPayload);
  if (!composed.text.trim()) throw new Error("阿里云长音频转写完成，但结果中没有可用文本");
  return {
    text: composed.text,
    providerId: provider.id,
    taskId,
    sentenceCount: composed.sentenceCount,
    durationMs: composed.durationMs,
  };
}

export async function transcribeImportedAudio(
  plugin: { settings?: JsonRecord },
  blob: Blob,
  mime: string,
  options: LongAudioTranscriptionOptions = {},
): Promise<LongAudioTranscriptionResult> {
  const provider = resolveTypedTranscribeProvider(
    plugin,
    options.providerId || asString(asRecord(plugin && plugin.settings).importTranscribeProvider),
  );
  if (isDashScopeFileTransProvider(provider)) {
    return transcribeWithDashScope(provider, blob, options);
  }
  options.onProgress?.({ phase: "submit", label: "正在提交整段音频" });
  const text = await transcribeAudio(plugin, blob, mime, provider.id);
  if (!String(text || "").trim()) throw new Error("整段音频转写返回空结果");
  return { text: String(text).trim(), providerId: provider.id, sentenceCount: 0 };
}

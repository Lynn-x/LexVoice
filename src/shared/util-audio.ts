/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export function mimeFromExt(ext) {
  const e = (ext || "").toLowerCase();
  if (e === "m4a" || e === "mp4") return "audio/mp4";
  if (e === "aac" || e === "acc") return "audio/aac";
  if (e === "mp3" || e === "mpga" || e === "mpeg") return "audio/mpeg";
  if (e === "wav") return "audio/wav";
  if (e === "ogg" || e === "oga") return "audio/ogg";
  if (e === "flac") return "audio/flac";
  if (e === "webm") return "audio/webm";
  return "audio/" + e;
}

export function extFromMime(mime) {
  if (!mime) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp3")) return "mp3";
  if (mime.includes("flac")) return "flac";
  return "webm";
}

export function delayMs(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function isTransientAsrError(error) {
  if (isAsrNonRetryableError(error)) return false;
  const msg = String((error && error.message) || error || "");
  return /\b(429|500|502|503|504)\b|too many|rate\s*limit|timeout|timed?\s*out|network|temporarily|service unavailable/i.test(msg);
}

export function isAsrNonRetryableError(error) {
  if (error && error.nonRetryable) return true;
  const msg = String((error && error.message) || error || "");
  return /密钥未配置|模型名称未配置|服务地址未配置|无法解码|仅 wav\/mp3|不被 MiMo 服务端接受|base64 仍超过|单次最多自动切|mime type must be/i.test(msg);
}

export function pickMimeType(preferOpus) {
  // 默认 mp4/AAC 优先：SiliconFlow 等云端 ASR 原生收 m4a，直接上传最稳；WebM 作为 Chromium 兜底。
  // preferOpus（选 APIMiMo 时传入）：MiMo 服务端只收 wav/mp3（实测发 audio/mp4 直接 400 拒绝），
  // 段落必须本机转码成 WAV 再发；而 Electron 的 decodeAudioData 解不了 AAC、能解 Opus——
  // 所以此时必须录 WebM/Opus，否则每段都卡死在"无法解码"。
  const candidates = preferOpus
    ? ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4;codecs=mp4a.40.2","audio/mp4"]
    : ["audio/mp4;codecs=mp4a.40.2","audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
  for (const c of candidates) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export function assertAudioCaptureSupported() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("当前 Obsidian 环境不支持麦克风录音。请升级 Obsidian，或在桌面端使用 LexVoice。");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("当前 Obsidian 环境不支持 MediaRecorder，暂时无法直接录音。可以先用系统录音后导入音频处理。");
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

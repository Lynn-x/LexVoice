/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function pickDefined() {
  for (const value of arguments) {
    if (value !== undefined) return value;
  }
  return undefined;
}

export function pickNonBlankString() {
  for (const value of arguments) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return "";
}

export function genId() {
  return "lv-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function pad(n) { return n < 10 ? "0" + n : "" + n; }

export function formatElapsed(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function sanitizeFilename(s) {
  if (!s) return "";
  return String(s)
    .replace(/["“”‘’`]/g, "")
    .replace(/[\\/:*?"<>|#^\[\]]/g, "")
    .replace(/[｜：？＊＜＞＂＃＾「」『』【】、，。；！]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

export function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripHtmlText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function safeDecodeUriText(text) {
  try { return decodeURIComponent(String(text || "")); }
  catch { return String(text || ""); }
}

export function normalizeAudioLinkTarget(linkPath) {
  let target = String(linkPath || "").split("#")[0].split("|")[0].trim();
  if (!target) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
      const url = new URL(target);
      target = url.searchParams.get("file")
        || url.searchParams.get("path")
        || url.searchParams.get("target")
        || url.pathname;
    }
  } catch {}
  target = safeDecodeUriText(target).replace(/^\/+/, "").trim();
  return target;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export function obfuscateApiKey(plain) {
  const s = String(plain == null ? "" : plain);
  if (!s) return "";
  if (s.startsWith(LEXVOICE_KEY_OBFUSCATION_MARKER)) return s; // 已混淆，幂等
  try {
    return LEXVOICE_KEY_OBFUSCATION_MARKER + btoa(unescape(encodeURIComponent(lexvoiceXorTransform(s))));
  } catch { return s; }
}

export function deobfuscateApiKey(stored) {
  const s = String(stored == null ? "" : stored);
  if (!s.startsWith(LEXVOICE_KEY_OBFUSCATION_MARKER)) return s; // 明文（旧数据迁移）→ 原样返回
  try {
    return lexvoiceXorTransform(decodeURIComponent(escape(atob(s.slice(LEXVOICE_KEY_OBFUSCATION_MARKER.length)))));
  } catch { return s; }
}

export const LEXVOICE_KEY_OBFUSCATION_MARKER = "lvk1:";

export const LEXVOICE_KEY_OBFUSCATION_SALT = "LexVoice/local-key-obfuscation/v1";

export function redactDiagnosticText(value) {
  return String(value == null ? "" : value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(api[_-]?key|authorization|token|secret|password)\s*[:=]\s*['"]?[^'"\s,;]+/gi, "$1=<redacted>")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]+)\b/g, "<redacted-token>")
    .replace(/C:\\Users\\[^\\\s]+/gi, "C:\\Users\\<user>")
    .replace(/\/Users\/[^/\s]+/gi, "/Users/<user>")
    .replace(/\/home\/[^/\s]+/gi, "/home/<user>")
    .replace(/\b(?!C:\\Users\\<user>)[A-Z]:\\[^\\\r\n]+(?:\\[^\\\r\n\s]+){1,}/g, "<local-path>")
    .slice(0, 1200);
}

export function sanitizeDiagnosticData(data, depth = 0) {
  if (data == null) return data;
  if (depth > 3) return "[depth-limit]";
  if (typeof data === "string") return redactDiagnosticText(data);
  if (typeof data === "number" || typeof data === "boolean") return data;
  if (data instanceof Error) return diagnosticError(data);
  if (Array.isArray(data)) return data.slice(0, 20).map(v => sanitizeDiagnosticData(v, depth + 1));
  if (typeof data === "object") {
    const out = {};
    for (const key of Object.keys(data).slice(0, 40)) {
      if (/apiKey|authorization|token|secret|password|prompt|transcript|text|content/i.test(key)) {
        out[key] = "<redacted>";
      } else if (/path$/i.test(key)) {
        out[key] = diagnosticPathLabel(data[key]);
      } else {
        out[key] = sanitizeDiagnosticData(data[key], depth + 1);
      }
    }
    return out;
  }
  return redactDiagnosticText(String(data));
}

export function lexvoiceXorTransform(text) {
  const salt = LEXVOICE_KEY_OBFUSCATION_SALT;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  return out;
}

export function diagnosticPathLabel(path) {
  const text = String(path || "").replace(/\\/g, "/");
  return redactDiagnosticText(text.split("/").pop() || text);
}

export function diagnosticError(error) {
  const e = error || {};
  const out: Record<string, any> = {
    name: redactDiagnosticText(e.name || "Error"),
    message: redactDiagnosticText(e.message || String(error || "")),
    stack: e.stack ? redactDiagnosticText(String(e.stack).split("\n").slice(0, 4).join("\n")) : "",
  };
  if (e.status !== undefined) out.status = e.status;
  if (e.statusDetail !== undefined) out.statusDetail = redactDiagnosticText(e.statusDetail);
  if (e.nonRetryable !== undefined) out.nonRetryable = !!e.nonRetryable;
  return out;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

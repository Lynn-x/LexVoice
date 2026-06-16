/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export function normalizeLlmEndpoint(endpoint) {
  const raw = String(endpoint || "").trim();
  if (!raw) return "";
  const noTrail = raw.replace(/\/+$/, "");
  try {
    const url = new URL(noTrail);
    const path = (url.pathname || "").replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(path)) return noTrail;
    url.pathname = path + "/chat/completions";
    return url.toString().replace(/\/+$/, "");
  } catch {}
  if (/\/chat\/completions$/i.test(noTrail)) return noTrail;
  return noTrail;
}

export function isLocalLlmEndpoint(endpoint) {
  try {
    const url = new URL(normalizeLlmEndpoint(endpoint));
    const host = (url.hostname || "").toLowerCase();
    return isPrivateNetworkHost(host);
  } catch {
    return false;
  }
}

export function isPoeLlmEndpoint(endpoint) {
  try {
    const url = new URL(normalizeLlmEndpoint(endpoint));
    return (url.hostname || "").toLowerCase() === "api.poe.com";
  } catch {
    return /api\.poe\.com/i.test(String(endpoint || ""));
  }
}

export function isMoonshotKimiModel(endpoint, model) {
  try {
    const url = new URL(normalizeLlmEndpoint(endpoint));
    const host = (url.hostname || "").toLowerCase();
    return /(^|\.)moonshot\.(cn|ai)$/.test(host) && /^kimi-k2\./i.test(String(model || "").trim());
  } catch {
    return /^kimi-k2\./i.test(String(model || "").trim());
  }
}

export function buildLlmHeaders(apiKey, endpoint) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = String(apiKey || "").trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const host = new URL(normalizeLlmEndpoint(endpoint)).hostname.toLowerCase();
    if (/(^|\.)openrouter\.ai$/.test(host)) {
      headers["HTTP-Referer"] = "https://github.com/Lynn-x/LexVoice";
      headers["X-OpenRouter-Title"] = "LexVoice";
    }
  } catch {}
  return headers;
}

export function comparableLlmEndpoint(endpoint) {
  return normalizeLlmEndpoint(endpoint).replace(/\/+$/, "").toLowerCase();
}

export function isPrivateNetworkHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const m = host.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
  return false;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export type ServiceEndpointTransport = "http" | "websocket";

export function getServiceEndpointSecurityIssue(endpoint, transport: ServiceEndpointTransport, label = "服务地址") {
  const raw = String(endpoint || "").trim();
  if (!raw) return `${label}未配置`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    const secureScheme = transport === "websocket" ? "wss://" : "https://";
    return `${label}格式无效；请填写完整的 ${secureScheme} 地址`;
  }
  const protocol = url.protocol.toLowerCase();
  const secureProtocol = transport === "websocket" ? "wss:" : "https:";
  const localProtocol = transport === "websocket" ? "ws:" : "http:";
  const secureName = transport === "websocket" ? "WSS" : "HTTPS";
  const localName = transport === "websocket" ? "WS" : "HTTP";
  if (protocol === secureProtocol) return "";
  if (protocol === localProtocol && isPrivateNetworkHost(url.hostname)) return "";
  if (protocol === localProtocol) {
    return `${label}不安全：公网地址必须使用 ${secureName}；只有 localhost 或明确的局域网/私网地址可使用 ${localName}`;
  }
  return `${label}协议不受支持；请使用 ${secureName}，本地或私网服务可使用 ${localName}`;
}

export function assertSafeServiceEndpoint(endpoint, transport: ServiceEndpointTransport, label = "服务地址") {
  const issue = getServiceEndpointSecurityIssue(endpoint, transport, label);
  if (issue) throw new Error(issue);
}

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
  } catch { /* intentionally empty */ }
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
  } catch { /* intentionally empty */ }
  return headers;
}

export function comparableLlmEndpoint(endpoint) {
  return normalizeLlmEndpoint(endpoint).replace(/\/+$/, "").toLowerCase();
}

export function isPrivateNetworkHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  const mappedIpv4 = host.match(/^::ffff:(.+)$/i);
  if (mappedIpv4) {
    const suffix = mappedIpv4[1];
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(suffix)) return isPrivateNetworkHost(suffix);
    const hex = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateNetworkHost(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
    }
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some(n => n < 0 || n > 255)) return false;
    const [a, b] = octets;
    return a === 10
      || (a === 100 && b >= 64 && b <= 127)
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254);
  }
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

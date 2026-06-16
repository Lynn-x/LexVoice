/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export function withPromiseTimeout(promise, timeoutMs, makeError) {
  if (!(timeoutMs > 0)) return promise;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try {
        reject(makeError ? makeError() : new Error("请求超时"));
      } catch (e) {
        reject(e);
      }
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function getHeaderValue(headers, name) {
  if (!headers || !name) return "";
  const wanted = String(name).toLowerCase();
  try {
    if (typeof headers.get === "function") {
      return headers.get(name) || headers.get(wanted) || "";
    }
  } catch {}
  try {
    for (const key of Object.keys(headers)) {
      if (String(key).toLowerCase() === wanted) return String(headers[key] || "");
    }
  } catch {}
  return "";
}

export function parseRetryAfterMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw) * 1000));
  const time = Date.parse(raw);
  if (Number.isFinite(time)) return Math.max(0, time - Date.now());
  return 0;
}

export function parseRequestUrlJson(response) {
  if (!response) return null;
  const json = response.json;
  if (typeof json === "function") return json.call(response);
  if (json !== undefined && json !== null) return json;
  const text = String(response.text || "").trim();
  if (!text) return null;
  return JSON.parse(text);
}

export function getRequestUrlText(response) {
  if (!response) return "";
  if (typeof response.text === "string") return response.text;
  if (response.arrayBuffer && typeof TextDecoder !== "undefined") {
    try { return new TextDecoder("utf-8").decode(response.arrayBuffer); } catch {}
  }
  return "";
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

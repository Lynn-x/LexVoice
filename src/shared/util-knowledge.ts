/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";

export function normalizeKnowledgeExtractionHistory(value) {
  const normalizeBucket = (bucket) => {
    const out = {};
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return out;
    for (const [path, raw] of Object.entries(bucket) as [string, any][]) {
      const key = obsidian.normalizePath(path || "");
      if (!key) continue;
      if (raw && typeof raw === "object") {
        out[key] = {
          mtime: Number(raw.mtime) || 0,
          size: Number(raw.size) || 0,
          scannedAt: String(raw.scannedAt || ""),
        };
      } else {
        out[key] = { mtime: Number(raw) || 0, size: 0, scannedAt: "" };
      }
    }
    return out;
  };
  return {
    vocabulary: normalizeBucket(value && value.vocabulary),
    people: normalizeBucket(value && value.people),
  };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

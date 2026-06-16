/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export const BRIEFING_LANGUAGE_LABELS = {
  "zh-CN": "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

export function parseElapsedMsToken(raw) {
  const token = (String(raw || "").match(/(?:\d{1,2}:)?\d{1,2}:\d{2}/) || [""])[0];
  const parts = token.trim().split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 3) return Math.max(0, ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000);
  if (parts.length === 2) return Math.max(0, (parts[0] * 60 + parts[1]) * 1000);
  if (parts.length === 1) return Math.max(0, parts[0] * 1000);
  return 0;
}

export function parseLexVoiceDurationLabel(raw) {
  const text = String(raw || "").trim();
  if (!text) return 0;
  const seconds = text.match(/^(\d+(?:\.\d+)?)\s*秒$/);
  if (seconds) return Math.round(Number(seconds[1]) * 1000);
  const minutes = text.match(/^(\d+(?:\.\d+)?)\s*分钟$/);
  if (minutes) return Math.round(Number(minutes[1]) * 60 * 1000);
  return parseElapsedMsToken(text);
}

export const TEXT_IMPORT_PRE_SUMMARY_CHUNK_CHARS = 30000;

export function getBriefingTargetLanguage(settings) {
  const id = settings.briefingTargetLanguage || "zh-CN";
  if (id === "custom") return (settings.briefingCustomLanguage || "").trim() || "用户指定语言";
  return BRIEFING_LANGUAGE_LABELS[id] || id;
}

export function buildBriefingLanguageInstruction(settings) {
  const mode = settings.briefingTranslationMode || "off";
  if (mode === "off") return "";
  const target = getBriefingTargetLanguage(settings);
  const keepTerms = settings.briefingKeepOriginalTerms !== false;
  const extra = (settings.briefingLanguageInstruction || "").trim();
  const parts = [
    "## 纪要语言与翻译策略",
    "- 只在 AI 整理后的纪要中处理语言；底部原始转写由程序保留，不要改写、删除或声称已替换原始转写。",
    "- 会议中可能混合多种语言。先理解语义，再按纪要结构整合，不要机械逐句翻译。",
    "- 目标语言：" + target + "。",
  ];
  if (mode === "translate") {
    parts.push("- 输出正文统一使用目标语言。除人名、公司名、产品名、代码、协议名、模型名等专有名词外，不做逐句双语对照。");
  } else if (mode === "bilingual") {
    parts.push("- 输出以目标语言为主；关键决策、争议点、术语首次出现或短直接引语可在括号中保留原文短语。不要做逐句双语对照。");
  }
  if (keepTerms) {
    parts.push("- 人名、组织名、产品名、模型名、代码标识、英文缩写和行业术语优先保留原写法；必要时在目标语言后括注原文。");
  }
  if (extra) parts.push("- 额外要求：" + extra);
  return parts.join("\n");
}

export function applyBriefingLanguageInstruction(prompt, settings) {
  const instruction = buildBriefingLanguageInstruction(settings || {});
  return instruction ? prompt + "\n\n---\n\n" + instruction : prompt;
}

export function getSessionMetaDurationMs(meta) {
  if (!meta) return 0;
  const direct = Number(meta.durationMs || meta.elapsedMs || meta.totalMs || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const raw = meta.duration || meta["时长"] || "";
  return parseLexVoiceDurationLabel(raw);
}

export function getSegmentsDurationMs(segments) {
  if (!Array.isArray(segments) || !segments.length) return 0;
  let minStart = Infinity;
  let maxEnd = 0;
  for (const seg of segments) {
    const start = Number(seg && seg.startOffsetMs);
    const end = Number(seg && seg.endOffsetMs);
    if (Number.isFinite(start) && start >= 0) minStart = Math.min(minStart, start);
    if (Number.isFinite(end) && end > 0) maxEnd = Math.max(maxEnd, end);
  }
  if (!maxEnd) return 0;
  return Number.isFinite(minStart) && minStart > 0 ? Math.max(0, maxEnd - minStart) : maxEnd;
}

export function truncateForLlmPrompt(text, maxChars) {
  const raw = String(text || "");
  const limit = Math.max(0, Number(maxChars) || 0);
  if (!limit || raw.length <= limit) return raw;
  return raw.slice(0, limit) + "\n\n_[LexVoice：此处为长文本预处理截断，仅用于分段摘要；完整原文仍保留在笔记折叠区。]_";
}

export function splitLongTextForLlm(text, maxChars) {
  const raw = String(text || "").trim();
  const limit = Math.max(2000, Number(maxChars) || TEXT_IMPORT_PRE_SUMMARY_CHUNK_CHARS);
  if (!raw) return [];
  if (raw.length <= limit) return [raw];
  const chunks = [];
  const blocks = raw.split(/\n{2,}/);
  let current = "";
  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };
  for (const block of blocks) {
    const piece = String(block || "").trim();
    if (!piece) continue;
    if (piece.length > limit) {
      pushCurrent();
      for (let i = 0; i < piece.length; i += limit) {
        chunks.push(piece.slice(i, i + limit).trim());
      }
      continue;
    }
    if (current && current.length + piece.length + 2 > limit) pushCurrent();
    current = current ? current + "\n\n" + piece : piece;
  }
  pushCurrent();
  return chunks;
}

export function stripMarkdownDetailsWrapper(text) {
  const s = String(text || "").trim();
  const m = s.match(/^<details(?:\s+[^>]*)?>\s*<summary>[\s\S]*?<\/summary>\s*([\s\S]*?)\s*<\/details>\s*$/i);
  return m ? String(m[1] || "").trim() : s;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

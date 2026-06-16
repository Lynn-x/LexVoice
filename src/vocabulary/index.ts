/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { VOCABULARY_SECTIONS } from '../shared/catalog-sediment';
import { escapeRegExp } from '../shared/util-common';

export function createVocabularyGroups() {
  const groups = {};
  for (const def of VOCABULARY_SECTIONS) groups[def.key] = [];
  return groups;
}

export function detectVocabularySectionKey(text) {
  const title = String(text || "")
    .replace(/^#+\s*/, "")
    .replace(/^[\d一二三四五六七八九十]+[\.、\s]*/, "")
    .trim();
  if (!title) return "";
  if (/编辑规则|说明|使用方式|元信息|metadata/i.test(title)) return "__ignore";
  if (/人名|人物|称呼|联系人|讲师|专家|候选人/.test(title)) return "people";
  if (/品牌|机构|公司|组织|团队|客户|供应商|学校|社区/.test(title)) return "brands";
  if (/项目|产品|模型|系统|服务|应用|插件/.test(title)) return "projects";
  if (/行业术语|术语|专业词|业务词|缩写|英文|概念|流程/.test(title)) return "terms";
  if (/易错|误写|错写|纠错|校正|替换|标准写法|正确写法/.test(title)) return "corrections";
  if (/其他|专有名词|专名|未分类/.test(title)) return "other";
  return "";
}

export function normalizeVocabularyCorrectionSide(text) {
  return String(text || "")
    .trim()
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .replace(/^__(.*?)__$/, "$1")
    .replace(/^[`"'「『]+/, "")
    .replace(/[`"'」』]+$/, "")
    .trim();
}

export function normalizeVocabularyCorrectionTerm(line) {
  let text = String(line || "").trim();
  if (!text) return "";
  if (text.startsWith("<!--") || text.startsWith("//") || text.startsWith(">")) return "";
  if (text === "---" || /^\|?\s*-{3,}/.test(text)) return "";
  text = text.replace(/^- \[[ x]\]\s+/i, "").replace(/^[-*+]\s+/, "").replace(/^\d+[\.)、]\s+/, "").trim();
  text = text.replace(/^\*\*(.*?)\*\*$/, "$1").replace(/^__(.*?)__$/, "$1");
  const pair = text.match(/^(.+?)\s*(?:=>|->|→|=|：|:)\s*(.+)$/);
  if (!pair) return "";
  const from = normalizeVocabularyCorrectionSide(pair[1]);
  const to = normalizeVocabularyCorrectionSide(pair[2]);
  if (!from || !to || from === to) return "";
  if (from.length > 60 || to.length > 60) return "";
  return `${from} => ${to}`;
}

export function normalizeVocabularyTerm(line) {
  let text = String(line || "").trim();
  if (!text) return "";
  if (text.startsWith("<!--") || text.startsWith("//") || text.startsWith(">")) return "";
  if (text === "---" || /^\|?\s*-{3,}/.test(text)) return "";
  text = text.replace(/^[-*+]\s+/, "").replace(/^\d+[\.)、]\s+/, "").replace(/^- \[[ x]\]\s+/i, "");
  text = text.replace(/^\*\*(.*?)\*\*$/, "$1").replace(/^__(.*?)__$/, "$1");
  text = text.replace(/^[`"'「『]+/, "").replace(/[`"'」』]+$/, "").trim();
  const noteMatch = text.match(/^([^:：|｜]+)\s*[:：|｜]\s*.+$/);
  if (noteMatch) text = noteMatch[1].trim();
  if (!text || text.length > 60) return "";
  return text;
}

export function addVocabularyTerm(groups, key, term) {
  const target = groups[key] ? key : "other";
  const value = target === "corrections"
    ? normalizeVocabularyCorrectionTerm(term)
    : normalizeVocabularyTerm(term);
  if (!value) return;
  if (!groups[target].includes(value)) groups[target].push(value);
}

export function parseVocabularyGroups(text) {
  const groups = createVocabularyGroups();
  if (!text) return groups;
  const lines = String(text).split(/\r?\n/);
  let current = "other";
  let hasKnownSection = false;
  for (let raw of lines) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const key = detectVocabularySectionKey(heading[2]);
      if (key === "__ignore") { current = null; continue; }
      if (key) { current = key; hasKnownSection = true; continue; }
      current = null;
      continue;
    }
    if (line === "---") {
      if (!hasKnownSection) current = "other";
      continue;
    }
    const term = normalizeVocabularyTerm(line);
    if (!term) continue;
    const key = current || (!hasKnownSection ? "other" : null);
    if (!key) continue;
    addVocabularyTerm(groups, key, term);
  }
  return groups;
}

export function flattenVocabularyGroups(groups) {
  const out = [];
  for (const def of VOCABULARY_SECTIONS) {
    for (const term of (groups && groups[def.key]) || []) {
      if (term && !out.includes(term)) out.push(term);
    }
  }
  return out;
}

export function getVocabularyCorrectionPairs(groups) {
  return ((groups && groups.corrections) || [])
    .map(normalizeVocabularyCorrectionTerm)
    .filter(Boolean)
    .map((item) => {
      const pair = item.match(/^(.+?)\s*=>\s*(.+)$/);
      return pair ? { from: pair[1].trim(), to: pair[2].trim() } : null;
    })
    .filter(pair => pair && pair.from && pair.to && pair.from !== pair.to);
}

export function applyVocabularyCorrections(text, groups) {
  let output = String(text || "");
  if (!output) return output;
  const pairs = getVocabularyCorrectionPairs(groups)
    .sort((a, b) => b.from.length - a.from.length);
  for (const pair of pairs) {
    if (!pair || !pair.from || !pair.to || pair.from === pair.to) continue;
    const flags = /[A-Za-z]/.test(pair.from) ? "gi" : "g";
    output = output.replace(new RegExp(escapeRegExp(pair.from), flags), pair.to);
  }
  return output;
}

export function countVocabularyGroups(groups) {
  return flattenVocabularyGroups(groups).length;
}

export function summarizeVocabularyGroups(groups) {
  return VOCABULARY_SECTIONS
    .map(def => `${def.title} ${((groups && groups[def.key]) || []).length}`)
    .join(" / ");
}

export function normalizeVocabularyInput(input) {
  if (Array.isArray(input)) {
    const groups = createVocabularyGroups();
    for (const term of input) addVocabularyTerm(groups, "other", term);
    return groups;
  }
  if (input && typeof input === "object") {
    const groups = createVocabularyGroups();
    for (const def of VOCABULARY_SECTIONS) {
      const list = Array.isArray(input[def.key]) ? input[def.key] : [];
      for (const term of list) addVocabularyTerm(groups, def.key, term);
    }
    return groups;
  }
  return parseVocabularyGroups(String(input || ""));
}

export function mergeVocabularyGroups(base, extra) {
  const groups = normalizeVocabularyInput(base);
  const more = normalizeVocabularyInput(extra);
  for (const def of VOCABULARY_SECTIONS) {
    for (const term of more[def.key] || []) addVocabularyTerm(groups, def.key, term);
  }
  return groups;
}

export function isStructuredVocabularyMarkdown(text) {
  const source = String(text || "");
  return VOCABULARY_SECTIONS.some(def => source.includes("## " + def.title));
}

export async function loadVocabularyGroups(plugin) {
  const path = plugin.settings.vocabularyFile;
  if (path) {
    const norm = obsidian.normalizePath(path);
    const file = plugin.app.vault.getAbstractFileByPath(norm);
    if (file instanceof obsidian.TFile) {
      try {
        const content = await plugin.app.vault.cachedRead(file);
        const groups = parseVocabularyGroups(content);
        if (countVocabularyGroups(groups)) return groups;
      } catch (e) { console.error("[LexVoice] read vocabulary file failed", e); }
    }
  }
  return parseVocabularyGroups(plugin.settings.customVocabulary || "");
}

export async function loadVocabularyTerms(plugin) {
  return flattenVocabularyGroups(await loadVocabularyGroups(plugin));
}

export async function loadVocabularyPrompt(plugin) {
  const groups = await loadVocabularyGroups(plugin);
  return buildVocabularyPrompt(groups);
}

export function buildVocabularyPrompt(groups, peopleHotwords = "") {
  const parts = [];
  for (const def of VOCABULARY_SECTIONS) {
    if (def.key === "corrections") continue;
    const terms = groups[def.key] || [];
    if (terms.length) parts.push(`${def.title}：${terms.join("、")}`);
  }
  if (peopleHotwords) parts.push(peopleHotwords);
  const correctionText = getVocabularyCorrectionPairs(groups)
    .slice(0, 20)
    .map(pair => `${pair.from} 应写作 ${pair.to}`)
    .join("；");
  if (!parts.length && !correctionText) return "";
  const lines = [
    "本段音频可能出现以下专有名词和标准写法。请在能听清时优先按这些写法转写；不要因为列表存在而凭空添加未听到的内容。",
    parts.join("；"),
    correctionText ? `易错写法参考：${correctionText}` : "",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 800);
}

export function formatVocabularyMarkdown(input, profile) {
  const groups = normalizeVocabularyInput(input);
  const moment = window.moment;
  const total = countVocabularyGroups(groups);
  const lines = [
    "# LexVoice ASR 热词表",
    "",
    "> 此文件由 LexVoice 维护，是“纪要信息对象”里专门服务语音转写的一类对象。它只保存术语、名称和易错写法，用于在转写时提示 ASR；人员关系、角色和长期备注请维护在人员资料中。",
    "",
    `- 行业 / 角色：${(profile && profile.industry) || "（未设置）"}`,
    `- 词汇数：${total}`,
    `- 更新时间：${moment().format("YYYY-MM-DD HH:mm:ss")}`,
    "",
    "## 编辑规则",
    "- 按分区管理；每行一个词。",
    "- 「易错写法」请使用 `错误写法 => 标准写法`，例如 `open router => OpenRouter`。",
    "- 可以手动新增、删除或把词条移动到更准确的分区。",
    "- 以 `#` `>` `<!--` `//` 开头的行会被忽略。",
    "- 列表标记 `- *` `1.` 会被自动剥离。",
    "- LexVoice 会读取所有分区，并在调用转写服务时作为 ASR 热词提示使用。",
    "",
    "---",
    "",
  ];
  for (const def of VOCABULARY_SECTIONS) {
    lines.push(`## ${def.title}`, "", `> ${def.desc}`, "");
    const terms = groups[def.key] || [];
    if (terms.length) {
      for (const t of terms) lines.push(`- ${t}`);
    } else {
      lines.push(`<!-- ${def.placeholder} -->`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

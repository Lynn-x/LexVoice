/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { PEOPLE_DIRECTORY_TAG } from '../shared/catalog-sediment';
import { makeFileWikiLink, escapeYamlScalar, escapeBaseString } from '../shared/util-markdown';
import { isLocalLlmEndpoint } from '../shared/util-llm-endpoint';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { sanitizeFilename, genId, pickNonBlankString, pickDefined } from '../shared/util-common';
import { extractJsonObject } from '../shared/util-json';
import { getFrontmatterTags, readFileFrontmatter, isLocalServiceEndpoint } from '../shared/util-note';
import { callLlm } from '../llm/core';

export const PEOPLE_SUGGESTION_CACHE_LIMIT = 500;

export function normalizePeopleContextMode(value) {
  return ["privacy", "hotwords", "localFull"].includes(value) ? value : "privacy";
}

export function splitPersonFieldValue(value) {
  if (Array.isArray(value)) return value.flatMap(splitPersonFieldValue);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(splitPersonFieldValue);
  }
  const text = String(value || "").trim();
  if (/^\[\[[\s\S]+?\]\]$/.test(text)) return [text];
  return text
    .split(/[，,、;；|]/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function normalizePersonLookupText(text) {
  return String(text || "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/#\S+/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function getFrontmatterPeople(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object") return [];
  const direct = splitPersonFieldValue(frontmatter["人物"] || frontmatter.people || []);
  const fromTags = getFrontmatterTags(frontmatter)
    .filter(t => /^人物\//.test(t))
    .map(t => t.replace(/^人物\//, "").trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const n of [...direct, ...fromTags]) {
    const k = normalizePersonLookupText(n);
    if (k && !seen.has(k)) { seen.add(k); out.push(n); }
  }
  return out;
}

export function firstPersonField(frontmatter, keys) {
  for (const key of keys) {
    const value = frontmatter && frontmatter[key];
    if (Array.isArray(value)) {
      const first = value.map(v => String(v || "").trim()).find(Boolean);
      if (first) return first;
    } else if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function personEntryFromFrontmatter(frontmatter, file) {
  if (!frontmatter || typeof frontmatter !== "object") return null;
  const tags = getFrontmatterTags(frontmatter);
  const type = String(frontmatter.type || frontmatter["类型"] || "").trim();
  const inPersonSet = tags.includes(PEOPLE_DIRECTORY_TAG) || type === "lexvoice-person";
  const explicitName = firstPersonField(frontmatter, ["姓名", "name", "人员", "person"]);
  const name = explicitName || (inPersonSet && file && file.basename ? file.basename : "");
  if (!name || (!inPersonSet && !explicitName)) return null;
  return {
    name,
    role: firstPersonField(frontmatter, ["角色", "role", "岗位", "职能", "职位", "职称", "title"]),
    organization: firstPersonField(frontmatter, ["组织", "organization", "公司", "团队", "部门", "机构", "institute"]),
    aliases: splitPersonFieldValue(frontmatter["常用称呼"] || frontmatter["称呼"] || frontmatter.aliases || frontmatter.alias),
    email: firstPersonField(frontmatter, ["邮箱", "邮箱地址", "邮件", "email", "mail", "e-mail"]),
    note: firstPersonField(frontmatter, ["备注", "note", "说明", "简介", "abstract"]),
    path: file && file.path ? file.path : "",
  };
}

export function dedupePeopleEntries(entries) {
  const out = [];
  const seen = new Set();
  for (const item of entries || []) {
    if (!item || !item.name) continue;
    const key = normalizePersonLookupText(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function loadPeopleDirectory(plugin, options: any = {}) {
  const folder = obsidian.normalizePath(plugin.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
  const files = plugin.app.vault.getMarkdownFiles()
    .filter(file => {
      const path = obsidian.normalizePath(file.path || "");
      return path === folder || path.startsWith(folder + "/");
    });
  const stamp = files
    .map(file => `${obsidian.normalizePath(file.path || "")}:${file.stat && file.stat.mtime || 0}:${file.stat && file.stat.size || 0}`)
    .sort()
    .join("|");
  if (!options.force && plugin._peopleDirectoryCache
    && plugin._peopleDirectoryCache.folder === folder
    && plugin._peopleDirectoryCache.stamp === stamp) {
    return plugin._peopleDirectoryCache.items || [];
  }
  const entries = [];
  for (const file of files) {
    const fm = await readFileFrontmatter(plugin, file);
    const item = personEntryFromFrontmatter(fm, file);
    if (item) entries.push(item);
  }
  const items = dedupePeopleEntries(entries);
  plugin._peopleDirectoryCache = { folder, stamp, items, loadedAt: Date.now() };
  return items;
}

export function hasPeopleHotwordsConsent(settings) {
  return !!(settings && settings.peopleHotwordsConsentAt && String(settings.peopleHotwordsConsentAt).trim());
}

export function getPeopleNameHotwordTerms(people) {
  const out = [];
  const add = (value) => {
    const text = String(value || "").trim();
    if (!text || text.length > 40) return;
    const key = normalizePersonLookupText(text);
    if (!key || out.some(item => normalizePersonLookupText(item) === key)) return;
    out.push(text);
  };
  for (const person of people || []) {
    add(person && person.name);
    for (const alias of (person && person.aliases) || []) add(alias);
  }
  return out;
}

export function shouldUsePeopleHotwordsForCloud(settings) {
  return normalizePeopleContextMode(settings && settings.peopleContextMode) === "hotwords" && hasPeopleHotwordsConsent(settings);
}

export function shouldUsePeopleHotwordsForAsr(plugin, provider) {
  const mode = normalizePeopleContextMode(plugin && plugin.settings && plugin.settings.peopleContextMode);
  if (mode === "hotwords") return hasPeopleHotwordsConsent(plugin.settings);
  if (mode === "localFull") return isLocalServiceEndpoint(provider && provider.endpoint);
  return false;
}

export function shouldUseFullPeopleContextForLlm(plugin) {
  const mode = normalizePeopleContextMode(plugin && plugin.settings && plugin.settings.peopleContextMode);
  return mode === "localFull" && isLocalLlmEndpoint(plugin && plugin.settings && plugin.settings.llmEndpoint);
}

export function shouldUsePeopleHotwordsForLlm(plugin) {
  if (shouldUseFullPeopleContextForLlm(plugin)) return false;
  return shouldUsePeopleHotwordsForCloud(plugin && plugin.settings);
}

export function buildPeopleHotwordsContext(people) {
  const terms = getPeopleNameHotwordTerms(people).slice(0, 80);
  if (!terms.length) return "";
  return [
    "## 人名热词（用户已授权，仅姓名与常用称呼）",
    "",
    "以下仅用于提升人名与称呼识别准确率，不包含角色、组织、备注或长期关系。不要因为列表存在而凭空添加未在转写中出现的人。",
    "",
    terms.join("、"),
  ].join("\n");
}

export function buildLocalPeopleContext(people) {
  const list = (people || []).slice(0, 60);
  if (!list.length) return "";
  const lines = [
    "## 本地人员上下文（仅本地模型使用）",
    "",
    "以下信息来自用户本地维护的 LexVoice 人员资料，仅在当前大模型服务为本地或局域网地址时提供。它不是声纹识别结果，只能作为整理纪要时的辅助上下文。",
    "",
  ];
  for (const person of list) {
    const parts = [`姓名：${person.name}`];
    if (person.aliases && person.aliases.length) parts.push(`常用称呼：${person.aliases.join("、")}`);
    if (person.role) parts.push(`角色：${person.role}`);
    if (person.organization) parts.push(`组织：${person.organization}`);
    if (person.note) parts.push(`备注：${person.note}`);
    lines.push("- " + parts.join("；"));
  }
  return lines.join("\n");
}

export async function buildPeopleContextForLlm(plugin) {
  const people = await loadPeopleDirectory(plugin);
  if (shouldUseFullPeopleContextForLlm(plugin)) return buildLocalPeopleContext(people);
  if (shouldUsePeopleHotwordsForLlm(plugin)) return buildPeopleHotwordsContext(people);
  return "";
}

export async function buildPeopleHotwordsForAsr(plugin, provider) {
  if (!shouldUsePeopleHotwordsForAsr(plugin, provider)) return "";
  const terms = getPeopleNameHotwordTerms(await loadPeopleDirectory(plugin)).slice(0, 80);
  return terms.length ? `人员称呼：${terms.join("、")}` : "";
}

export function formatPersonRelatedBriefingsBase(mdFolder) {
  const folder = escapeBaseString(obsidian.normalizePath(mdFolder || DEFAULT_SETTINGS.mdFolder));
  return `## 相关纪要

\`\`\`base
filters:
  and:
    - file.inFolder("${folder}")
    - file.hasLink(this.file)
properties:
  file.name:
    displayName: 纪要
  note.time:
    displayName: 时间
  note.mode:
    displayName: 模式
  note.录音主题:
    displayName: 主题
  note.状态:
    displayName: 状态
views:
  - type: table
    name: 相关纪要
    order:
      - file.name
      - note.time
      - note.mode
      - note.录音主题
      - note.状态
    sort:
      - property: file.mtime
        direction: DESC
\`\`\`

上方视图由 Obsidian Bases 根据纪要里的「相关人员」链接自动聚合；LexVoice 只在用户确认人员建议后维护这些本地链接。
`;
}

export function ensurePeopleNoteRelatedBaseSection(markdown, mdFolder) {
  const text = String(markdown || "");
  if (/^##\s+相关纪要\s*$/m.test(text) || /file\.hasLink\(this\.file\)/.test(text)) return text;
  const section = "\n\n" + formatPersonRelatedBriefingsBase(mdFolder).trim() + "\n";
  const noteHeading = text.match(/^##\s+备注\s*$/m);
  if (noteHeading) return text.slice(0, noteHeading.index).replace(/\s*$/, "") + section + "\n" + text.slice(noteHeading.index);
  return text.replace(/\s*$/, "") + section;
}

export function formatPeopleBaseYaml() {
  return `filters:
  and:
    - file.hasTag("${PEOPLE_DIRECTORY_TAG}")
properties:
  file.name:
    displayName: 人员笔记
  note.姓名:
    displayName: 姓名
  note.角色:
    displayName: 角色
  note.常用称呼:
    displayName: 常用称呼
  note.组织:
    displayName: 组织
  note.邮箱:
    displayName: 邮箱
  note.来源:
    displayName: 相关纪要
  note.最近更新:
    displayName: 最近更新
  note.备注:
    displayName: 备注
views:
  - type: table
    name: 人员表
    order:
      - file.name
      - note.姓名
      - note.角色
      - note.常用称呼
      - note.组织
      - note.邮箱
      - note.来源
      - note.最近更新
      - note.备注
    sort:
      - property: note.姓名
        direction: ASC
  - type: cards
    name: 人员卡片
    order:
      - file.name
      - note.角色
      - note.组织
      - note.邮箱
      - note.最近更新
    cardSize: 170
`;
}

export function formatPeopleNoteMarkdown(name, mdFolder = DEFAULT_SETTINGS.mdFolder) {
  const safeName = String(name || "").trim() || "未命名人员";
  return `---
type: lexvoice-person
姓名: "${escapeYamlScalar(safeName)}"
角色: ""
常用称呼: []
组织: ""
邮箱: ""
来源: []
最近更新: ""
备注: ""
tags:
  - ${PEOPLE_DIRECTORY_TAG}
---

# ${safeName}

## 基本信息

- 角色：
- 组织：
- 常用称呼：
- 邮箱：

${formatPersonRelatedBriefingsBase(mdFolder).trim()}

## 最新动态

这里适合手动补充长期观察、合作背景、观点变化和需要回看的重要记录。

## 备注

`;
}

export function normalizePeopleArray(value) {
  return splitPersonFieldValue(value)
    .map(s => s.replace(/^["'「『]|["'」』]$/g, "").trim())
    .filter(Boolean);
}

export function mergeUniqueStrings(base, extra) {
  const out = [];
  const add = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const key = normalizePersonLookupText(text);
    if (!out.some(x => normalizePersonLookupText(x) === key)) out.push(text);
  };
  for (const item of normalizePeopleArray(base)) add(item);
  for (const item of normalizePeopleArray(extra)) add(item);
  return out;
}

export function normalizePeopleSuggestion(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || item["姓名"] || "").trim();
  if (!name || name.length > 40) return null;
  const aliases = normalizePeopleArray(item.aliases || item["常用称呼"] || item["称呼"]);
  const evidence = normalizePeopleArray(item.evidence || item["依据"] || item["证据"]);
  const role = String(item.role || item["角色"] || item.position || item["职能"] || "").trim().slice(0, 80);
  const organization = String(item.organization || item["组织"] || item.company || item["部门"] || "").trim().slice(0, 80);
  const note = String(item.note || item["备注"] || item.summary || "").trim().replace(/\s+/g, " ").slice(0, 180);
  const confidenceRaw = String(item.confidence || item["置信度"] || "").trim();
  const confidence = /high|高/i.test(confidenceRaw) ? "高" : (/low|低/i.test(confidenceRaw) ? "低" : "中");
  return { name, aliases, role, organization, note, confidence, evidence } as Record<string, any>;
}

export function normalizePeopleSuggestionsModel(model) {
  const raw = Array.isArray(model) ? model : (model && Array.isArray(model.people) ? model.people : []);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const normalized = normalizePeopleSuggestion(item);
    if (!normalized) continue;
    const key = normalizePersonLookupText(normalized.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out.slice(0, 20);
}

export function getPeopleSuggestionIgnoreTerms(suggestion) {
  const normalized = normalizePeopleSuggestion(suggestion);
  if (!normalized) return [];
  const terms = [normalized.name, ...(normalized.aliases || [])]
    .map(normalizePersonLookupText)
    .filter(t => t && t.length >= 2);
  return Array.from(new Set(terms));
}

export function makeStoredPeopleSuggestionForIgnore(raw, normalized) {
  const base = normalized || normalizePeopleSuggestion(raw);
  if (!base) return null;
  const sourcePath = obsidian.normalizePath(raw && raw.sourcePath || "");
  const sourceBasename = String(raw && raw.sourceBasename || (sourcePath.split("/").pop() || "").replace(/\.md$/i, "") || "").trim();
  return Object.assign({}, base, {
    sourcePath,
    sourceBasename,
    cacheKey: String(raw && (raw.cacheKey || raw.key) || ""),
    matchPath: String(raw && raw.matchPath || (raw && raw.match && raw.match.path) || ""),
  });
}

export function normalizePeopleSuggestionIgnoreRecord(item) {
  if (!item) return null;
  const rawTerms = [];
  let name = "";
  let ignoredAt = "";
  let rawSuggestion = null;
  if (typeof item === "string") {
    name = item.trim();
    rawTerms.push(name);
  } else if (typeof item === "object") {
    name = String(item.name || item.label || item.key || "").trim();
    ignoredAt = String(item.ignoredAt || "").trim();
    rawSuggestion = item.suggestion && typeof item.suggestion === "object" ? item.suggestion : item;
    if (Array.isArray(item.terms)) rawTerms.push(...item.terms);
    rawTerms.push(item.key, item.name, item.label);
    if (Array.isArray(item.aliases)) rawTerms.push(...item.aliases);
    if (Array.isArray(item["常用称呼"])) rawTerms.push(...item["常用称呼"]);
  }
  const suggestion = makeStoredPeopleSuggestionForIgnore(rawSuggestion || { name }, normalizePeopleSuggestion(rawSuggestion || { name }));
  if (suggestion) {
    rawTerms.push(suggestion.name);
    if (Array.isArray(suggestion.aliases)) rawTerms.push(...suggestion.aliases);
  }
  const terms = Array.from(new Set(rawTerms
    .map(normalizePersonLookupText)
    .filter(t => t && t.length >= 2)));
  if (!terms.length) return null;
  return {
    key: terms[0],
    terms,
    name: name || (suggestion && suggestion.name) || terms[0],
    ignoredAt,
    suggestion,
  };
}

export function normalizePeopleSuggestionIgnores(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const record = normalizePeopleSuggestionIgnoreRecord(item);
    if (!record) continue;
    const key = record.key || record.terms[0];
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out.slice(-300);
}

export function isPeopleSuggestionIgnored(settings, suggestion) {
  const terms = getPeopleSuggestionIgnoreTerms(suggestion);
  if (!terms.length) return false;
  const ignores = normalizePeopleSuggestionIgnores(settings && settings.peopleSuggestionIgnores);
  return ignores.some(record => (record.terms || []).some(term => terms.includes(term)));
}

export function addPeopleSuggestionIgnore(settings, suggestion) {
  const normalized = normalizePeopleSuggestion(suggestion);
  if (!settings || !normalized) return false;
  const terms = getPeopleSuggestionIgnoreTerms(normalized);
  if (!terms.length) return false;
  const storedSuggestion = makeStoredPeopleSuggestionForIgnore(suggestion, normalized);
  const current = normalizePeopleSuggestionIgnores(settings.peopleSuggestionIgnores);
  const primaryKey = normalizePersonLookupText(normalized.name) || terms[0];
  const existing = current.find(record => record.key === primaryKey || (record.terms || []).some(term => terms.includes(term)));
  if (existing) {
    existing.terms = Array.from(new Set([...(existing.terms || []), ...terms]));
    existing.name = existing.name || normalized.name;
    existing.ignoredAt = new Date().toISOString();
    if (storedSuggestion) existing.suggestion = Object.assign({}, existing.suggestion || {}, storedSuggestion);
  } else {
    current.push({
      key: primaryKey,
      terms,
      name: normalized.name,
      ignoredAt: new Date().toISOString(),
      suggestion: storedSuggestion,
    });
  }
  settings.peopleSuggestionIgnores = current.slice(-300);
  return true;
}

export function removePeopleSuggestionIgnores(settings, suggestions) {
  if (!settings) return 0;
  const current = normalizePeopleSuggestionIgnores(settings.peopleSuggestionIgnores);
  const keys = new Set();
  const terms = new Set();
  for (const item of suggestions || []) {
    if (!item) continue;
    if (item.ignoreKey) keys.add(String(item.ignoreKey));
    if (item.key) keys.add(String(item.key));
    for (const term of (item.ignoreTerms || [])) {
      const normalized = normalizePersonLookupText(term);
      if (normalized) terms.add(normalized);
    }
    for (const term of getPeopleSuggestionIgnoreTerms(item)) {
      if (term) terms.add(term);
    }
  }
  if (!keys.size && !terms.size) return 0;
  const next = current.filter(record => {
    if (keys.has(record.key)) return false;
    return !(record.terms || []).some(term => terms.has(term));
  });
  settings.peopleSuggestionIgnores = next;
  return current.length - next.length;
}

export function getPeopleSuggestionCacheKey(sourcePath, suggestion) {
  const normalized = normalizePeopleSuggestion(suggestion);
  if (!normalized) return "";
  const terms = getPeopleSuggestionIgnoreTerms(normalized);
  const nameKey = normalizePersonLookupText(normalized.name) || terms[0] || "";
  if (!nameKey) return "";
  return `${obsidian.normalizePath(sourcePath || normalized.sourcePath || "")}::${nameKey}`;
}

export function normalizePeopleSuggestionCacheRecord(item) {
  if (!item || typeof item !== "object") return null;
  const rawSuggestion = item.suggestion && typeof item.suggestion === "object" ? item.suggestion : item;
  const normalized = normalizePeopleSuggestion(rawSuggestion);
  if (!normalized) return null;
  const sourcePath = obsidian.normalizePath(item.sourcePath || rawSuggestion.sourcePath || "");
  const sourceBasename = String(item.sourceBasename || rawSuggestion.sourceBasename || (sourcePath.split("/").pop() || "").replace(/\.md$/i, "") || "").trim();
  const key = String(item.key || item.id || rawSuggestion.cacheKey || getPeopleSuggestionCacheKey(sourcePath, normalized) || "").trim();
  if (!key) return null;
  const matchPath = String(item.matchPath || rawSuggestion.matchPath || "").trim();
  const suggestion = Object.assign({}, normalized, {
    sourcePath,
    sourceBasename,
    cacheKey: key,
    matchPath,
  });
  return {
    key,
    sourcePath,
    sourceBasename,
    sourceMtime: Number(item.sourceMtime) || 0,
    sourceSize: Number(item.sourceSize) || 0,
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: String(item.updatedAt || item.createdAt || new Date().toISOString()),
    suggestion,
  };
}

export function normalizePeopleSuggestionCache(value) {
  const raw = Array.isArray(value)
    ? value
    : (value && Array.isArray(value.pending) ? value.pending : []);
  const pending = [];
  const seen = new Set();
  for (const item of raw) {
    const record = normalizePeopleSuggestionCacheRecord(item);
    if (!record || seen.has(record.key)) continue;
    seen.add(record.key);
    pending.push(record);
  }
  return { pending: pending.slice(-PEOPLE_SUGGESTION_CACHE_LIMIT) };
}

export function makePeopleSuggestionCacheRecord(file, suggestion) {
  const normalized = normalizePeopleSuggestion(suggestion);
  if (!normalized) return null;
  const sourcePath = file instanceof obsidian.TFile ? obsidian.normalizePath(file.path || "") : obsidian.normalizePath(suggestion && suggestion.sourcePath || "");
  const sourceBasename = file instanceof obsidian.TFile ? file.basename : String(suggestion && suggestion.sourceBasename || "").trim();
  const key = getPeopleSuggestionCacheKey(sourcePath, normalized);
  if (!key) return null;
  return normalizePeopleSuggestionCacheRecord({
    key,
    sourcePath,
    sourceBasename,
    sourceMtime: file instanceof obsidian.TFile ? Number(file.stat && file.stat.mtime) || 0 : Number(suggestion && suggestion.sourceMtime) || 0,
    sourceSize: file instanceof obsidian.TFile ? Number(file.stat && file.stat.size) || 0 : Number(suggestion && suggestion.sourceSize) || 0,
    createdAt: suggestion && suggestion.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    suggestion: Object.assign({}, normalized, {
      sourcePath,
      sourceBasename,
      matchPath: suggestion && suggestion.matchPath || "",
    }),
  });
}

export function isPeopleSuggestionCacheRecordCurrent(plugin, record) {
  if (!record || !record.sourcePath) return true;
  const file = plugin && plugin.app && plugin.app.vault && plugin.app.vault.getAbstractFileByPath(record.sourcePath);
  if (!(file instanceof obsidian.TFile)) return false;
  const mtime = Number(file.stat && file.stat.mtime) || 0;
  const size = Number(file.stat && file.stat.size) || 0;
  if (record.sourceMtime && record.sourceMtime !== mtime) return false;
  if (record.sourceSize && record.sourceSize !== size) return false;
  return true;
}

export function peopleSuggestionRecordToSuggestion(record) {
  if (!record) return null;
  const suggestion = normalizePeopleSuggestion(Object.assign({}, record.suggestion || {}, {
    sourcePath: record.sourcePath,
    sourceBasename: record.sourceBasename,
  }));
  if (!suggestion) return null;
  suggestion.cacheKey = record.key;
  suggestion.sourcePath = record.sourcePath;
  suggestion.sourceBasename = record.sourceBasename;
  suggestion.matchPath = record.suggestion && record.suggestion.matchPath || "";
  suggestion.selected = true;
  return suggestion;
}

export function peopleSuggestionIgnoreRecordToSuggestion(record) {
  const normalizedRecord = normalizePeopleSuggestionIgnoreRecord(record);
  if (!normalizedRecord) return null;
  const suggestion = normalizePeopleSuggestion(normalizedRecord.suggestion || { name: normalizedRecord.name });
  if (!suggestion) return null;
  const stored = normalizedRecord.suggestion || {};
  suggestion.sourcePath = stored.sourcePath || "";
  suggestion.sourceBasename = stored.sourceBasename || "";
  suggestion.cacheKey = stored.cacheKey || "";
  suggestion.matchPath = stored.matchPath || "";
  suggestion.ignoreKey = normalizedRecord.key;
  suggestion.ignoreTerms = normalizedRecord.terms || [];
  suggestion.ignoredAt = normalizedRecord.ignoredAt || "";
  suggestion.selected = false;
  return suggestion;
}

export function findMatchingPersonEntry(people, suggestion) {
  const terms = [suggestion && suggestion.name, ...((suggestion && suggestion.aliases) || [])]
    .map(normalizePersonLookupText)
    .filter(Boolean);
  if (!terms.length) return null;
  return (people || []).find(person => {
    const personTerms = [person.name, ...(person.aliases || [])]
      .map(normalizePersonLookupText)
      .filter(Boolean);
    return personTerms.some(p => terms.some(t => p === t || p.includes(t) || t.includes(p)));
  }) || null;
}

export function buildPeopleDirectorySuggestionPrompt(fileName, markdown) {
  const source = String(markdown || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m, "").slice(0, 16000);
  return `请从下面这篇 LexVoice 纪要中，提取“适合维护为人员资料”的候选人员信息。

文件名：${fileName}

规则：
- 只提取纪要中明确出现的人名、称呼、角色、组织关系或职责线索。
- 不要编造真实姓名、组织、职位或关系；证据不足就不要输出。
- “某负责人”“某工程师”“产品负责人”这类称呼可以作为 aliases 或 role，但不要把泛称当作姓名。
- 输出用于给用户确认入库，所以要保守、短句、可编辑。
- 只输出 JSON，不要 Markdown，不要代码块。

JSON 结构：
{
  "people": [
    {
      "name": "姓名或最明确的人物称谓",
      "aliases": ["常用称呼"],
      "role": "角色/职责",
      "organization": "组织/部门/公司",
      "note": "为什么值得入库或需要补充什么",
      "confidence": "高/中/低",
      "evidence": ["纪要中支持该判断的短句"]
    }
  ]
}

纪要正文：
${source}`;
}

export function mergeSourceNoteRelatedPeopleFrontmatter(frontmatter, personFiles) {
  const fm = Object.assign({}, frontmatter || {});
  const links = (personFiles || [])
    .filter(file => file instanceof obsidian.TFile)
    .map(file => makeFileWikiLink(file))
    .filter(Boolean);
  const merged = mergeUniqueStrings(fm["相关人员"] || fm.relatedPeople || fm.people || [], links);
  if (merged.length) fm["相关人员"] = merged;
  delete fm.relatedPeople;
  delete fm.people;
  return fm;
}

export function mergePersonFrontmatter(frontmatter, suggestion, sourceFile) {
  const fm = Object.assign({}, frontmatter || {});
  fm.type = "lexvoice-person";
  if (!String(fm["姓名"] || "").trim()) fm["姓名"] = String(fm.name || "").trim() || suggestion.name;
  if (!String(fm["角色"] || "").trim()) fm["角色"] = String(fm.role || "").trim() || suggestion.role || "";
  if (!String(fm["组织"] || "").trim()) fm["组织"] = String(fm.organization || "").trim() || suggestion.organization || "";
  const aliases = mergeUniqueStrings(fm["常用称呼"] || fm.aliases || [], suggestion.aliases || []);
  if (aliases.length) fm["常用称呼"] = aliases;
  const sourceLink = makeFileWikiLink(sourceFile);
  const sources = mergeUniqueStrings(fm["来源"] || fm.sources || [], sourceLink ? [sourceLink] : []);
  if (sources.length) fm["来源"] = sources;
  fm["最近更新"] = new Date().toISOString().slice(0, 10);
  const noteParts = [];
  if (String(fm["备注"] || fm.note || "").trim()) noteParts.push(String(fm["备注"] || fm.note).trim());
  const additions = [];
  if (suggestion.note) additions.push(suggestion.note);
  if (suggestion.evidence && suggestion.evidence.length) additions.push("依据：" + suggestion.evidence.slice(0, 2).join("；"));
  if (additions.length) {
    const line = (sourceLink ? `${sourceLink}：` : "") + additions.join("；");
    if (!noteParts.some(n => n.includes(line))) noteParts.push(line);
  }
  if (noteParts.length) fm["备注"] = noteParts.join("\n");
  const tags = mergeUniqueStrings(fm.tags || [], [PEOPLE_DIRECTORY_TAG]);
  fm.tags = tags;
  delete fm.name;
  delete fm.role;
  delete fm.organization;
  delete fm.aliases;
  delete fm.sources;
  delete fm.note;
  return fm;
}

export async function generatePeopleDirectorySuggestions(plugin, file, markdown) {
  const people = await loadPeopleDirectory(plugin);
  const sys = "你是严谨的信息抽取助手，只根据用户提供的纪要提取人员资料建议。不要编造，不要输出非 JSON。";
  const raw = await callLlm(plugin, sys, buildPeopleDirectorySuggestionPrompt(file && file.basename ? file.basename : "当前笔记", markdown), { timeoutMs: 60000 });
  const suggestions = normalizePeopleSuggestionsModel(extractJsonObject(raw))
    .filter(item => !isPeopleSuggestionIgnored(plugin.settings, item));
  for (const item of suggestions) {
    item.match = findMatchingPersonEntry(people, item);
    item.sourcePath = file && file.path ? file.path : "";
    item.sourceBasename = file && file.basename ? file.basename : "";
  }
  return suggestions;
}

export function normalizePersonNameForEmail(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/^\[\[|\]\]$/g, "")
    .replace(/\|.*$/g, "")
    .replace(/^@+/, "")
    .replace(/^[姓名人员：:\s]+/, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/【[^】]*】/g, "")
    .trim();
  const arrow = text.split(/\s*(?:->|=>|→|➡|：|:)\s*/).filter(Boolean);
  if (arrow.length > 1) text = arrow[arrow.length - 1].trim();
  const dash = text.split(/\s+(?:-|—|–)\s+|\s*--\s*/).filter(Boolean);
  if (dash.length > 1) text = dash[0].trim();
  text = text.replace(/\s+/g, " ").trim();
  if (!text || text.length > 30) return "";
  if (/^(未提及|未知|待补充|无|暂无|不详|发言人\d*|说话人\d*|参会人|参与者|人员|业务需求方|技术负责人|负责人|某负责人|某同学)$/i.test(text)) return "";
  return text;
}

export function parsePeopleFromOutput(text) {
  if (!text) return { people: [], cleaned: text || "" };
  const re = /<!--\s*lexvoice-people\s*:\s*([\s\S]*?)\s*-->/i;
  const m = text.match(re);
  if (!m) return { people: [], cleaned: text };
  const raw = m[1]
    .split(/[,，;；、\n]+/)
    .map(s => s.replace(/^#+/, "").replace(/^人物\//, "").trim())
    .filter(Boolean)
    .filter(s => s.length <= 24);
  const seen = new Set();
  const people = [];
  for (const p of raw) { const k = normalizePersonLookupText(p); if (k && !seen.has(k)) { seen.add(k); people.push(p); } }
  const cleaned = text.replace(re, "").replace(/\n{3,}$/, "\n\n").trimEnd() + "\n";
  return { people, cleaned };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

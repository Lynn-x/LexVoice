/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { SEDIMENT_GROUP_CONFIG, SEDIMENT_GROUP_ORDER, SEDIMENT_GROUP_STATUS_LABELS, VOCABULARY_SECTIONS } from '../shared/catalog-sediment';
import { sanitizeFilename, genId, escapeRegExp } from '../shared/util-common';
import { makeFileWikiLink } from '../shared/util-markdown';
import { getPeopleSuggestionCacheKey, normalizePeopleSuggestionsModel, loadPeopleDirectory, isPeopleSuggestionIgnored, findMatchingPersonEntry } from '../people';
import { callLlm } from '../llm/core';
import { extractJsonObject } from '../shared/util-json';
import { isLocalLlmEndpoint } from '../shared/util-llm-endpoint';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { createVocabularyGroups } from '../vocabulary';
import { LEARNING_CARD_TAG, CONCEPT_CARD_TAG, TODO_CARD_TAG, upsertFrontmatterInMarkdown, upsertLexVoiceObjectNote, ensureTodayDailyNoteFile } from '../shared/util-note';

export const SEDIMENT_PREEXTRACT_BEGIN = "LEXVOICE_SEDIMENT_BEGIN";

export const SEDIMENT_PREEXTRACT_END = "LEXVOICE_SEDIMENT_END";

export function makeSedimentStableHash(value) {
  const source = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function makeSedimentStableId(type, parts) {
  return `lv-sed-${type}-${makeSedimentStableHash((parts || []).map(item => String(item || "").trim()).join("\u0001"))}`;
}

export function getSedimentTodoId(item) {
  if (item && item.id) return String(item.id);
  return makeSedimentStableId("todo", [item && (item.task || item.title), item && item.owner, item && item.due, item && item.sourceTime, item && item.note]);
}

export function getSedimentCardId(item) {
  if (item && item.id) return String(item.id);
  return makeSedimentStableId("card", [item && item.title, item && item.type, item && item.sourceTime, item && (item.summary || item.reusableLine)]);
}

export function getSedimentHotwordId(sectionKey, term) {
  return makeSedimentStableId("hotword", [sectionKey, term]);
}

export function getSedimentPersonId(sourcePath, item) {
  if (item && item.id) return String(item.id);
  if (item && item.cacheKey) return String(item.cacheKey);
  if (item && item.key) return String(item.key);
  return getPeopleSuggestionCacheKey(sourcePath || (item && item.sourcePath) || "", item) || makeSedimentStableId("person", [sourcePath, item && item.name, item && item.role, item && item.organization]);
}

export function withSedimentCandidateIds(objects, sourcePath, sourceBasename) {
  const normalized = normalizeSedimentExtractionModel(objects);
  return {
    people: (normalized.people || []).map(item => {
      const next = Object.assign({}, item, { sourcePath, sourceBasename });
      const id = getSedimentPersonId(sourcePath, next);
      return Object.assign(next, { id, key: next.key || id, cacheKey: next.cacheKey || id });
    }),
    todos: (normalized.todos || []).map(item => {
      const next = Object.assign({}, item);
      return Object.assign(next, { id: getSedimentTodoId(next) });
    }),
    learningCards: (normalized.learningCards || []).map(item => {
      const next = Object.assign({}, item);
      return Object.assign(next, { id: getSedimentCardId(next) });
    }),
    hotwords: normalized.hotwords || createVocabularyGroups(),
  };
}

export function removeSedimentGroupDone(doneGroups, groupKey) {
  return (Array.isArray(doneGroups) ? doneGroups : []).filter(key => key !== groupKey);
}

export function sanitizeSedimentText(value, limit) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  return limit && text.length > limit ? text.slice(0, limit).trim() : text;
}

export function normalizeSedimentTextList(value, limit) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n;；、,，]+/);
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const text = sanitizeSedimentText(item, limit || 80);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function normalizeSedimentTodoSubtasks(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\n+/);
  const out = [];
  const seen = new Set();
  for (const item of source || []) {
    const raw = item && typeof item === "object"
      ? (item.task || item.title || item.text || item.name || item.content)
      : item;
    const text = sanitizeSedimentText(raw, 120)
      .replace(/^[-*]\s*/, "")
      .replace(/^\[[ xX]\]\s*/, "")
      .trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 12) break;
  }
  return out;
}

export function getSedimentSourceDateLabel(sourceFile) {
  const basename = String(sourceFile && sourceFile.basename || "");
  const m = basename.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2})(\d{2}))?/);
  if (!m) return "";
  return m[2] ? `${m[1]} ${m[2]}:${m[3]}` : m[1];
}

export function normalizeSedimentExtractionModel(model) {
  const raw = model && typeof model === "object" ? model : {};
  const out: Record<string, any> = {
    people: normalizePeopleSuggestionsModel(raw.people || raw.persons || raw.peopleSuggestions || []),
    hotwords: createVocabularyGroups(),
    learningCards: [],
    todos: [],
  };
  const hot = raw.hotwords || raw.vocabulary || raw.asrHotwords || {};
  for (const def of VOCABULARY_SECTIONS) {
    out.hotwords[def.key] = normalizeSedimentTextList(hot[def.key] || hot[def.title] || [], 80).slice(0, 18);
  }
  if (!out.hotwords.terms.length && Array.isArray(raw.terms)) {
    out.hotwords.terms = normalizeSedimentTextList(raw.terms, 80).slice(0, 18);
  }
  const cards = Array.isArray(raw.learningCards) ? raw.learningCards : Array.isArray(raw.cards) ? raw.cards : Array.isArray(raw.concepts) ? raw.concepts : [];
  for (const item of cards.slice(0, 12)) {
    const title = sanitizeSedimentText(item && (item.title || item.name || item.concept || item.question), 80);
    const summary = sanitizeSedimentText(item && (item.summary || item.description || item.answer), 600);
    if (!title || !summary) continue;
    const type = sanitizeSedimentText(item && (item.type || item.category || "概念"), 20) || "概念";
    out.learningCards.push({
      title,
      type,
      summary,
      // 观点类卡片：标出是谁的观点（holder）；其它类型一般为空
      holder: sanitizeSedimentText(item && (item.holder || item.speaker || item.owner || item.person || item.by), 40),
      sourceTime: sanitizeSedimentText(item && (item.sourceTime || item.time || item.timestamp), 20),
      tags: normalizeSedimentTextList(item && (item.tags || item.keywords), 24).slice(0, 8),
      reusableLine: sanitizeSedimentText(item && (item.reusableLine || item.quote || item.sentence), 140),
    });
  }
  const todos = Array.isArray(raw.todos) ? raw.todos : Array.isArray(raw.tasks) ? raw.tasks : [];
  for (const item of todos.slice(0, 12)) {
    const task = sanitizeSedimentText(item && (item.task || item.title || item.action), 140);
    if (!task) continue;
    const rawOwner = sanitizeSedimentText(item && (item.owner || item.assignee || item.person), 40);
    const rawDue = sanitizeSedimentText(item && (item.due || item.deadline || item.date), 40);
    out.todos.push({
      task,
      // 留空字符串，让 UI 端用"加责任人 / 加时间"虚线占位渲染；
      // 同时把 LLM 误填的 "未指定" / "无" / "待定" / "TBD" 也视为空
      owner: rawOwner && !/^(未指定|无|待定|TBD|N\/A|null|none)$/i.test(rawOwner) ? rawOwner : "",
      due:   rawDue   && !/^(未指定|无|待定|TBD|N\/A|null|none)$/i.test(rawDue)   ? rawDue   : "",
      sourceTime: sanitizeSedimentText(item && (item.sourceTime || item.time || item.timestamp), 20),
      note: sanitizeSedimentText(item && (item.note || item.reason || item.evidence), 220),
      subtasks: normalizeSedimentTodoSubtasks(item && (item.subtasks || item.children || item.steps || item.items)),
    });
  }
  return out;
}

export function buildLexVoiceObjectTags(baseTag, extraTags) {
  const tags = [baseTag, "lexvoice"];
  for (const tag of normalizeSedimentTextList(extraTags || [], 28)) {
    const clean = tag.replace(/^#/, "").replace(/\s+/g, "-");
    if (clean && !tags.includes(clean)) tags.push(clean);
  }
  return tags;
}

export function buildSedimentPreExtractionInstruction() {
  return `附加产物：沉淀预提取

完成上面的纪要整理和标签注释后，请在本次回复最末尾额外输出一段“沉淀预提取 JSON”。这段 JSON 只给 LexVoice 插件解析，不属于正文。

严格格式：
<!--${SEDIMENT_PREEXTRACT_BEGIN}
{
  "people": [
    {
      "name": "姓名或最明确称呼",
      "aliases": ["常用称呼"],
      "role": "角色/职责",
      "organization": "组织/部门/公司",
      "note": "为什么值得入库或需要补充什么",
      "confidence": "高/中/低",
      "evidence": ["纪要中的依据短句"]
    }
  ],
  "todos": [
    {
      "task": "具体行动",
      "owner": "责任人；无法判断留空字符串",
      "due": "截止时间；无法判断留空字符串",
      "sourceTime": "如 12:34；没有则空",
      "note": "依据或补充说明",
      "subtasks": ["可勾选的拆分子动作；按执行顺序；至少 2 条，除非任务本身是原子动作"]
    }
  ],
  "learningCards": [
    {
      "type": "概念/机制/案例/QA/追问/观点",
      "title": "卡片标题",
      "summary": "可独立复用的解释或摘要",
      "holder": "仅 type=观点 时填：用纪要里真实出现的姓名/称呼标出该观点是谁主张的（占位示例仅说明格式：张三/李四，切勿照抄）；无法判断是谁说的、或非观点类，一律留空",
      "sourceTime": "如 12:34；没有则空",
      "tags": ["标签"],
      "reusableLine": "可复用句；没有则空"
    }
  ],
  "hotwords": {
    "people": ["人名或称呼"],
    "brands": ["品牌/机构"],
    "projects": ["项目/产品/模型/系统"],
    "terms": ["行业术语"],
    "corrections": ["错误写法 => 标准写法"],
    "other": ["其他专有名词"]
  }
}
${SEDIMENT_PREEXTRACT_END}-->

规则：
- 只根据本次纪要内容提取，不要编造。
- 四组字段必须都存在；没有内容时输出空数组或空对象字段。
- 每组最多 8 条，宁缺毋滥。
- 必须是合法 JSON，不要尾随逗号，不要 Markdown 代码块，不要解释文字。
- 这段必须放在整篇回复最后。

待办 subtasks 拆分（固定生效）：
- 每个 task 都尝试拆出 2-5 条 subtasks；任务本身是单一原子动作（如"发邮件给张三"）才允许空数组。
- 每条 subtask 是**具体可勾选完成**的小动作（动词开头，短句，≤ 20 字），不要写成抽象描述。
- 必须来自纪要原文里能找到依据的拆分；不要凭空发明工序。
- 按执行先后排列；前置/准备工作在前，验收/收尾在后。
- 不要在 subtask 里重复 owner / due / sourceTime；只写动作本身。`;
}

export function appendSedimentPreExtractionInstruction(prompt) {
  return `${String(prompt || "").trimEnd()}\n\n---\n\n${buildSedimentPreExtractionInstruction()}`;
}

export function getSedimentPreExtractionBlockPatterns(global) {
  const flags = global ? "gi" : "i";
  return [
    new RegExp(`<!--\\s*${SEDIMENT_PREEXTRACT_BEGIN}\\s*([\\s\\S]*?)\\s*${SEDIMENT_PREEXTRACT_END}\\s*-->`, flags),
    new RegExp(`<!--\\s*${SEDIMENT_PREEXTRACT_BEGIN}\\s*-->\\s*(?:\`\`\`json\\s*)?([\\s\\S]*?)(?:\\s*\`\`\`)?\\s*<!--\\s*${SEDIMENT_PREEXTRACT_END}\\s*-->`, flags),
    /<!--\s*LEXVOICE_CARDS_BEGIN\s*-->\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<!--\s*LEXVOICE_CARDS_END\s*-->/gi,
  ];
}

export function stripSedimentPreExtractionBlocks(markdown) {
  let text = String(markdown || "");
  for (const pattern of getSedimentPreExtractionBlockPatterns(true)) {
    text = text.replace(pattern, "");
  }
  return text.trimEnd();
}

export function extractSedimentPreExtractionBlock(markdown) {
  const text = String(markdown || "");
  for (const pattern of getSedimentPreExtractionBlockPatterns(false)) {
    const match = pattern.exec(text);
    if (!match) continue;
    const rawJson = String(match[1] || "").trim();
    const parsed = extractJsonObject(rawJson);
    if (!parsed) return { found: true, objects: null, cleaned: stripSedimentPreExtractionBlocks(text) };
    return {
      found: true,
      objects: normalizeSedimentExtractionModel(parsed),
      cleaned: stripSedimentPreExtractionBlocks(text),
    };
  }
  return { found: false, objects: null, cleaned: text };
}

export function formatSedimentPreExtractionBlock(objects) {
  const normalized = normalizeSedimentExtractionModel(objects);
  return [
    `<!--${SEDIMENT_PREEXTRACT_BEGIN}`,
    JSON.stringify(normalized),
    `${SEDIMENT_PREEXTRACT_END}-->`,
  ].join("\n");
}

export function splitOutSedimentBlock(markdown) {
  const text = String(markdown || "");
  for (const pattern of getSedimentPreExtractionBlockPatterns(false)) {
    const m = pattern.exec(text);
    if (m && m[0]) {
      return { body: stripSedimentPreExtractionBlocks(text), block: String(m[0]).trim() };
    }
  }
  return { body: text, block: "" };
}

export function appendSedimentPreExtractionBlock(markdown, objects) {
  if (!objects) return stripSedimentPreExtractionBlocks(markdown);
  const cleaned = stripSedimentPreExtractionBlocks(markdown);
  return `${cleaned}\n\n${formatSedimentPreExtractionBlock(objects)}\n`;
}

export async function upsertSedimentPreExtractionBlockInFile(plugin, file, objects) {
  if (!plugin || !file || !(file instanceof obsidian.TFile) || !objects) return false;
  const content = await plugin.app.vault.cachedRead(file);
  const next = appendSedimentPreExtractionBlock(content, objects);
  if (next === content) return false;
  await plugin.app.vault.modify(file, next);
  return true;
}

export function buildSedimentExtractionPrompt(fileName, markdown) {
  const source = String(markdown || "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m, "")
    .slice(0, 24000);
  return `请从下面这篇 LexVoice 纪要中一次性提炼可沉淀信息。

文件名：${fileName}

总规则：
- 只根据纪要原文提取，不要编造。
- 同一篇纪要只做一次综合提炼：人员建议、待办、学习卡片、ASR 热词都在一个 JSON 里输出。
- 没有明确依据的内容不要输出；闲聊、寒暄、无意义口头禅不要沉淀。
- 人员建议只输出适合维护为人员资料的姓名、称呼、角色、组织或职责线索。
- 待办只输出明确可执行事项。没有动作、责任或后续处理含义的句子不要写成待办。
- 学习卡片只输出可复用的概念、机制、案例、QA、追问或观点；不要把普通段落摘要拆成卡片。
- 当卡片 type 为「观点」时，必须在 holder 字段标出这是谁的观点（用纪要里出现的姓名或称呼）；观点是带有立场/主张的判断，归属到人才有复用价值。无法判断是谁说的就不要标成观点，可改成概念或机制。
- ASR 热词只输出后续录音里可能复现、且容易转写错的专名、术语或标准写法。
- 不要输出 Markdown、代码块或解释文字，只输出合法 JSON。

待办子任务拆分规则（subtasks 字段固定生效，不要省略）：
- 每个 task 都尝试拆出 2-5 条 subtasks；只有任务本身是单一原子动作（如"发邮件给张三"）时才允许空数组。
- 每条 subtask 必须是**具体可勾选完成**的小动作（动词开头，短句，≤ 20 字），不要写成抽象描述或重复 task 本身。
- subtasks 应来自纪要原文里能找到依据的拆分（讨论里出现的步骤、子条件、依赖项、子环节），不要凭空发明工序。
- 顺序按执行先后排列；前置/准备工作放前面，验收/收尾放后面。
- 不要在 subtask 里重复 owner / due / sourceTime 信息——只写动作本身。

JSON 结构：
{
  "people": [
    {
      "name": "姓名或最明确称呼",
      "aliases": ["常用称呼"],
      "role": "角色/职责",
      "organization": "组织/部门/公司",
      "note": "为什么值得入库或需要补充什么",
      "confidence": "高/中/低",
      "evidence": ["纪要中的依据短句"]
    }
  ],
  "todos": [
    {
      "task": "具体行动",
      "owner": "责任人；无法判断留空字符串",
      "due": "截止时间；无法判断留空字符串",
      "sourceTime": "如 12:34；没有则空",
      "note": "依据或补充说明",
      "subtasks": ["可勾选的拆分子动作；按执行顺序；至少 2 条，除非任务本身是原子动作"]
    }
  ],
  "learningCards": [
    {
      "type": "概念/机制/案例/QA/追问/观点",
      "title": "卡片标题",
      "summary": "可独立复用的解释或摘要",
      "holder": "仅 type=观点 时填：用纪要里真实出现的姓名/称呼标出该观点是谁主张的（占位示例仅说明格式：张三/李四，切勿照抄）；无法判断是谁说的、或非观点类，一律留空",
      "sourceTime": "如 12:34；没有则空",
      "tags": ["标签"],
      "reusableLine": "可复用句；没有则空"
    }
  ],
  "hotwords": {
    "people": ["人名或称呼"],
    "brands": ["品牌/机构"],
    "projects": ["项目/产品/模型/系统"],
    "terms": ["行业术语"],
    "corrections": ["错误写法 => 标准写法"],
    "other": ["其他专有名词"]
  }
}

纪要正文：
${source}`;
}

export async function generateSedimentObjects(plugin, file, markdown) {
  if (!plugin.settings.llmApiKey && !isLocalLlmEndpoint(plugin.settings.llmEndpoint)) throw new Error("请先在 API 页配置大模型服务");
  const sys = "你是 LexVoice 的纪要沉淀助手。你只根据当前纪要提炼结构化信息对象，输出合法 JSON，不编造，不泄露或要求任何配置。";
  const raw = await callLlm(plugin, sys, buildSedimentExtractionPrompt(file && file.basename ? file.basename : "当前笔记", markdown), { timeoutMs: 90000 });
  const objects = normalizeSedimentExtractionModel(extractJsonObject(raw));
  const people = await loadPeopleDirectory(plugin);
  objects.people = objects.people
    .filter(item => !isPeopleSuggestionIgnored(plugin.settings, item))
    .map(item => Object.assign(item, {
      match: findMatchingPersonEntry(people, item),
      sourcePath: file && file.path ? file.path : "",
      sourceBasename: file && file.basename ? file.basename : "",
    }));
  return objects;
}

export function formatSedimentLearningCardMarkdown(sourceFile, card) {
  const sourceLink = makeFileWikiLink(sourceFile);
  const holder = sanitizeSedimentText(card && card.holder, 40);
  const fm = {
    type: "lexvoice-learning-card",
    "卡片类型": card.type || "概念",
    "标题": card.title,
    "摘要": card.summary,
    // 观点持有人：观点类卡片标出是谁的观点
    "观点持有人": holder || "",
    "来源笔记": sourceLink,
    "来源时间": card.sourceTime || "",
    tags: buildLexVoiceObjectTags(LEARNING_CARD_TAG, [CONCEPT_CARD_TAG, ...(card.tags || [])]),
  };
  const body = [
    `# ${card.title}`,
    "",
    // 观点类：标题下方一行注明观点持有人
    holder ? `> [!quote] 观点 · ${holder}` : "",
    holder ? "" : null,
    `> [!summary] 摘要`,
    `> ${card.summary}`,
    "",
    card.reusableLine ? `## 可复用句\n\n${card.reusableLine}\n` : "",
    "## 来源",
    "",
    sourceLink ? `- ${sourceLink}${card.sourceTime ? ` · ${card.sourceTime}` : ""}` : "",
    "",
  ].filter(v => v !== null && v !== "").join("\n");
  return upsertFrontmatterInMarkdown(body, fm);
}

export function formatSedimentTodoCardMarkdown(sourceFile, todo) {
  const sourceLink = makeFileWikiLink(sourceFile);
  const task = sanitizeSedimentText(todo && todo.task, 160) || "未命名待办";
  const owner = sanitizeSedimentText(todo && todo.owner, 40) || "未指定";
  const due = sanitizeSedimentText(todo && todo.due, 40) || "未指定";
  const sourceTime = sanitizeSedimentText(todo && todo.sourceTime, 20);
  const recordingDate = getSedimentSourceDateLabel(sourceFile);
  const subtasks = normalizeSedimentTodoSubtasks(todo && (todo.subtasks || todo.children || todo.steps || todo.items));
  const taskMeta = [
    recordingDate ? `日期：${recordingDate}` : "",
    `责任人：${owner}`,
    sourceTime ? `时间：${sourceTime}` : "",
    `事项：${task}`,
    `截止：${due}`,
  ].filter(Boolean).join(" ");
  const taskLines = [`- [ ] ${taskMeta}`].concat(subtasks.map(item => `  - [ ] ${item}`));
  const fm = {
    type: "lexvoice-todo-card",
    "事项": task,
    "责任人": owner,
    "截止": due,
    "状态": "待办",
    "录音日期": recordingDate,
    "来源笔记": sourceLink,
    "来源时间": sourceTime || "",
    "子任务数": subtasks.length,
    tags: buildLexVoiceObjectTags(TODO_CARD_TAG, []),
  };
  const body = [
    `# ${task}`,
    "",
    taskLines.join("\n"),
    "",
    todo.note ? `## 依据\n\n${todo.note}\n` : "",
    "## 来源",
    "",
    sourceLink ? `- ${sourceLink}${sourceTime ? ` · ${sourceTime}` : ""}` : "",
    "",
  ].filter(Boolean).join("\n");
  return upsertFrontmatterInMarkdown(body, fm);
}

export async function writeSedimentObjectCards(plugin, sourceFile, objects) {
  const result = { learning: 0, todos: 0, entries: [] };
  const baseStem = sanitizeFilename(sourceFile && sourceFile.basename || "LexVoice");
  const learningFolder = obsidian.normalizePath(plugin.settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder);
  for (const card of objects.learningCards || []) {
    const name = `${baseStem}-${sanitizeFilename(card.title) || "学习卡片"}`;
    const entry = await upsertLexVoiceObjectNote(plugin, learningFolder, name, formatSedimentLearningCardMarkdown(sourceFile, card));
    result.entries.push(Object.assign({ kind: "card" }, entry));
    result.learning++;
  }
  // 待办：优先写入当日日记的"## 待办"段（Tasks / Dataview 双兼容），不再每条建新 MD。
  // 兜底：若 Daily Notes 插件未启用，回退到旧的卡片文件方式。
  const todos = objects.todos || [];
  if (todos.length) {
    const dailyFile = await ensureTodayDailyNoteFile(plugin.app);
    if (dailyFile instanceof obsidian.TFile) {
      let dailyContent = "";
      try { dailyContent = await plugin.app.vault.read(dailyFile); } catch {}
      for (const todo of todos) {
        const todoId = getSedimentTodoId(todo);
        const entry = buildSedimentTodoDailyEntry(todo, sourceFile, todoId);
        const updated = upsertSedimentTodoInDailyNote(dailyContent, todoId, entry, plugin.settings);
        const created = !dailyContent.includes(`<!-- lexvoice-todo:${todoId} -->`);
        dailyContent = updated;
        result.entries.push({
          kind: "todo",
          file: dailyFile,
          path: dailyFile.path,
          created,
          previousContent: "",
          todoId,
          target: "daily",
        });
        result.todos++;
      }
      await plugin.app.vault.modify(dailyFile, dailyContent);
    } else {
      // 兜底：Daily Notes 插件未启用，回退到旧的卡片文件路径
      const todoFolder = obsidian.normalizePath(plugin.settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder);
      for (const todo of todos) {
        const name = `${baseStem}-${sanitizeFilename(todo.task) || "待办"}`;
        const entry = await upsertLexVoiceObjectNote(plugin, todoFolder, name, formatSedimentTodoCardMarkdown(sourceFile, todo));
        result.entries.push(Object.assign({ kind: "todo", target: "card" }, entry));
        result.todos++;
      }
    }
  }
  return result;
}

export function buildSedimentTodoDailyEntry(todo, sourceFile, todoId) {
  const task = sanitizeSedimentText(todo && todo.task, 200) || "未命名待办";
  const owner = sanitizeSedimentText(todo && todo.owner, 40) || "";
  const dueRaw = sanitizeSedimentText(todo && todo.due, 40) || "";
  const sourceTime = sanitizeSedimentText(todo && todo.sourceTime, 20);
  const sourceLink = makeFileWikiLink(sourceFile);
  const subtasks = normalizeSedimentTodoSubtasks(todo && (todo.subtasks || todo.children || todo.steps || todo.items));

  const parts = [`- [ ] ${task}`];

  // 截止：尝试解析成 ISO 日期，命中则用 Tasks 插件能识别的 📅；否则降级到 Dataview inline 字段
  if (dueRaw && !/^(未指定|无|待定|TBD|N\/A|null|none)$/i.test(dueRaw)) {
    const moment = window.moment;
    const parsed = moment ? moment(dueRaw, [
      "YYYY-MM-DD", "YYYY/M/D", "YYYY/MM/DD", "YYYY.M.D", "YYYY.MM.DD",
      "M月D日", "MM月DD日", "M-D", "MM-DD",
    ], true) : null;
    if (parsed && parsed.isValid && parsed.isValid()) {
      parts.push(`📅 ${parsed.format("YYYY-MM-DD")}`);
    } else {
      parts.push(`[截止:: ${dueRaw}]`);
    }
  }

  if (owner && !/^(未指定|无|待定|TBD|N\/A|null|none)$/i.test(owner)) {
    parts.push(`👤 ${owner}`);
  }

  // 来源回链 + 录音时间，方便从日记跳回纪要原文
  if (sourceLink) {
    const sourceText = sourceTime ? `${sourceLink} · ${sourceTime}` : sourceLink;
    parts.push(`(来源: ${sourceText})`);
  }

  // 隐藏的 id 注释，用于 upsert
  parts.push(`<!-- lexvoice-todo:${todoId} -->`);

  const lines = [parts.join(" ")];
  for (const sub of subtasks) {
    if (sub) lines.push(`  - [ ] ${sub}`);
  }
  return lines.join("\n");
}

export function upsertSedimentTodoInDailyNote(content, todoId, entry, settings) {
  const text = String(content || "");
  const marker = `<!-- lexvoice-todo:${todoId} -->`;
  const markerIdx = text.indexOf(marker);
  if (markerIdx >= 0) {
    const lineStart = text.lastIndexOf("\n", markerIdx) + 1;
    let lineEnd = text.indexOf("\n", markerIdx);
    if (lineEnd < 0) lineEnd = text.length;
    // 把后续缩进的子任务行（^  - …）也算进去一起替换
    while (lineEnd < text.length) {
      const nextStart = lineEnd + 1;
      const nextNL = text.indexOf("\n", nextStart);
      const actualEnd = nextNL < 0 ? text.length : nextNL;
      const nextLine = text.slice(nextStart, actualEnd);
      if (/^\s{2,}-\s/.test(nextLine)) lineEnd = actualEnd;
      else break;
    }
    return text.slice(0, lineStart) + entry + text.slice(lineEnd);
  }

  const heading = String((settings && settings.dailyTodoHeading) || "待办").replace(/^#+\s*/, "").trim() || "待办";
  const headingRe = new RegExp("^##\\s+" + escapeRegExp(heading) + "\\s*$", "m");
  const match = headingRe.exec(text);
  if (!match) {
    const sep = text.trim() ? "\n\n" : "";
    return text.replace(/\s*$/, "") + sep + `## ${heading}\n\n` + entry + "\n";
  }

  const afterHeading = text.indexOf("\n", match.index) + 1;
  const rest = text.slice(afterHeading);
  // 跨过已有的待办行 + 子任务缩进行 + 空行，把新待办追加到现有列表末尾
  let consumed = 0;
  for (const line of rest.split("\n")) {
    if (/^\s*-\s\[[ xX/-]\]/.test(line) || /^\s{2,}-\s/.test(line) || /^\s*$/.test(line)) {
      consumed += line.length + 1;
    } else break;
  }
  const insertAt = afterHeading + consumed;
  const before = text.slice(0, insertAt).replace(/\s*$/, "\n");
  const after = text.slice(insertAt).replace(/^\n*/, "\n");
  return before + entry + after;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

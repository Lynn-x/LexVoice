/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { sanitizeFilename, genId, pickDefined, pickNonBlankString } from '../shared/util-common';
import { makeFileWikiLink, escapeYamlScalar } from '../shared/util-markdown';
import { readFileFrontmatter, getFrontmatterTags, upsertFrontmatterInMarkdown, ensureVaultFolder } from '../shared/util-note';
import { extractJsonObject } from '../shared/util-json';
import { FRONTMATTER_SCHEMA } from '../shared/catalog-modes';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { truncateForLlmPrompt, splitLongTextForLlm, stripMarkdownDetailsWrapper, getBriefingTargetLanguage, buildBriefingLanguageInstruction, applyBriefingLanguageInstruction, getSessionMetaDurationMs, getSegmentsDurationMs } from '../shared/util-text';
import { serializeRequiredQualities, desensitizeResumeText, extractMarkdownSection, sanitizeProjectFolderName } from '../outline-text';
import { JOBPORTRAIT_SYSTEM_PROMPT, JOBPORTRAIT_FOLLOWUP_RULES } from '../prompts/recruit-hrbp';
import { getBriefingMergeMaxTokens } from '../llm/config';
import { callLlm, callBriefingMergeLlm, stripModeSuggestionBlocks } from '../llm/core';

export const RECRUIT_ROUND_RANK = {
  "初面": 1, "初试": 1, "一面": 1,
  "二面": 2, "复试": 2,
  "交叉面": 2.5,
  "hr面": 3, "人力面": 3, "三面": 3,
  "终面": 4, "总监面": 4, "终试": 4,
};

export const JOBPORTRAIT_DIMENSIONS = [
  { key: "years", name: "年限", group: "hard" },
  { key: "education", name: "学历", group: "hard" },
  { key: "industry", name: "行业", group: "hard" },
  { key: "must_have", name: "必须经验", group: "hard" },
  { key: "salary", name: "期望薪酬", group: "hard" },
  { key: "business_sense", name: "业务感", group: "soft" },
  { key: "resilience", name: "抗挫折", group: "soft" },
  { key: "learning", name: "学习能力", group: "soft" },
  { key: "values", name: "价值观", group: "soft" },
  { key: "communication", name: "软技能·沟通协作", group: "soft" },
  { key: "job_hopping", name: "跳槽频率", group: "risk" },
  { key: "education_suspicious", name: "学历可疑", group: "risk" },
  { key: "dept_style", name: "部门风格", group: "culture" },
  { key: "supervisor_pref", name: "上级偏好", group: "culture" },
];

export const RECRUIT_CONTEXT_FLOW_COPY = {
  recording: {
    title: "招聘评估上下文",
    desc: "录音前先注入 JD 和简历，AI 评价才有锚点；否则评价会偏宽，默认按通用 HR 框架打分。所有字段都可跳过，但建议至少填写 JD。",
    skipText: "跳过注入，继续录音",
    primaryText: "创建提纲并开始录音",
    draftText: "保存草稿",
  },
  import: {
    title: "导入音频前注入 JD / 简历",
    desc: "这批音频将按招聘评估整理。开始处理前可注入 JD、简历和候选人信息，让 AI 按岗位要求评估，而不是按通用 HR 框架泛评。",
    skipText: "跳过注入，继续导入",
    primaryText: "保存并开始处理",
    draftText: "保存草稿",
  },
  "text-import": {
    title: "导入文本前注入 JD / 简历",
    desc: "这份速录稿或已有纪要将按招聘评估重新整理。开始处理前可注入 JD、简历和候选人信息，让 AI 把文本证据和岗位要求对齐，而不是只做普通纪要。",
    skipText: "跳过注入，继续导入",
    primaryText: "保存并开始处理",
    draftText: "保存草稿",
  },
  repolish: {
    title: "重新整理前注入 JD / 简历",
    desc: "本次会使用当前笔记里的转写文本重新生成招聘评估。可在开始前补充或更新 JD、简历和候选人信息。",
    skipText: "跳过注入，继续整理",
    primaryText: "保存并重新整理",
    draftText: "保存草稿",
  },
  settings: {
    title: "招聘评估上下文",
    desc: "这里保存招聘评估常用的 JD、简历和候选人信息。录音、导入音频或重新整理时仍可临时修改。",
    skipText: "不保存关闭",
    primaryText: "创建面试提纲",
    draftText: "保存草稿",
  },
};

export const DEFAULT_RECRUIT_QUALITIES = [
  { 素质: "聪明", 定义: "举一反三，快速学习，能从单点问题推到同类问题", 信号: "追问时能自行展开同类场景；对陌生概念的理解速度" },
  { 素质: "客户思维", 定义: "自主判断业务方真实需求，不等指令", 信号: "描述过往项目时是否主动提及需求方视角" },
  { 素质: "自驱", 定义: "无人推动时仍持续推进事项", 信号: "经历中自发发起的事项占比" },
  { 素质: "抗压", 定义: "高压与模糊环境下保持交付", 信号: "对失败项目和高压期的叙述方式" },
];

export function isRecruitFeatureUnlocked(settings) {
  return !!(settings && settings.recruitFeatureUnlocked);
}

export function buildRecruitContextPrefix(ctx) {
  if (!ctx) return "";
  const parts = ["## 📋 本场面试上下文（评分锚点，必须严格遵循）"];
  if (ctx.position) parts.push(`**应聘岗位**：${ctx.position}`);
  if (ctx.candidateName) parts.push(`**候选人**：${ctx.candidateName}`);
  if (ctx.round) parts.push(`**轮次**：${ctx.round}`);
  if (ctx.interviewer) parts.push(`**面试官**：${ctx.interviewer}`);
  if (ctx.seniority) parts.push(`**岗位资历级别**：${ctx.seniority}（按此 seniority 校准评分严格度）`);
  if (ctx.customNote) {
    parts.push(`**特殊关注点（面试官最在意的重点考核项）**：${ctx.customNote}`);
    parts.push(`⚠️ **强制要求**：最终纪要必须在「录用建议」下方输出「重点考核项核验」一节，对上述每个特殊关注点逐项核验——它常是软性素质，未必被直接问到，要从候选人回答各题时的**侧面表现**里找正反证据并**引用原话**；全场都找不到证据就如实标「本场未触及，建议二面专项考察」。`);
  }
  if (ctx.jd) {
    parts.push("");
    parts.push("### 岗位 JD（评分必须按此拆解硬性要求和加分项）");
    parts.push(ctx.jd.trim());
  }
  if (ctx.resume) {
    parts.push("");
    parts.push("### 候选人简历（用于核验面试中的陈述是否一致）");
    parts.push(ctx.resume.trim());
  }
  if (Array.isArray(ctx.requiredQualities) && ctx.requiredQualities.length) {
    const qBlock = serializeRequiredQualities(ctx.requiredQualities);
    if (qBlock) {
      parts.push("");
      parts.push("### 本岗位必备素质（最终纪要的「必要素质核验」一节须逐条核验，序号对应核验表行号）");
      parts.push(qBlock);
    }
  }
  if (ctx.generalOutline) {
    parts.push("");
    parts.push("### 统一面试提纲（本岗位通用考核结构，供组织评估时参考，不必逐题复述）");
    parts.push(String(ctx.generalOutline).trim());
  }
  parts.push("");
  parts.push("---");
  parts.push("");
  parts.push("**评分纪律提醒**：");
  parts.push("- 默认假设候选人不达标，需看到正向证据才加分");
  parts.push("- 把 JD 拆成 3-5 条硬性要求 + 1-3 条加分项，逐条评估");
  parts.push("- 简历 vs 面试陈述若有矛盾，必须列入风险点");
  parts.push("- 行业/经验跨度若 JD 不允许，必须作为硬扣分项");
  parts.push("- 多极化岗位（A 端 + B 端）必须独立评估，两端均未达 senior 深度 = 两头不接 = 倾向不推荐");
  parts.push("");
  return parts.join("\n");
}

export function buildRecruitInterviewBriefStrategy(ctx) {
  const round = String(ctx && ctx.round || "").trim() || "初面";
  const seniority = String(ctx && ctx.seniority || "").trim() || "未指定";
  const interviewer = String(ctx && ctx.interviewer || "").trim();
  const roundKey = round.replace(/\s+/g, "").toLowerCase();
  const interviewerText = interviewer || "未指定面试官";
  const lines = [
    `- 本场轮次：${round}。`,
    `- 岗位资历：${seniority}。`,
    `- 面试官/角色：${interviewerText}。`,
    "",
    "### 轮次策略",
  ];
  if (/初面|初试|一面/.test(roundKey)) {
    lines.push("- 初面重点：基础能力摸底、简历事实核验、项目角色边界、关键数字口径、JD 硬性要求是否具备。");
    lines.push("- 追问风格：多问细节和证据链，少问宏大战略；每题都要能逼出“我做了什么、怎么做、结果怎么算”。");
  } else if (/二面|复试|交叉面|三面/.test(roundKey)) {
    lines.push("- 复面/交叉面重点：专业深度、复杂场景决策、跨部门推动、失败复盘、与前一轮遗留问题的闭环。");
    lines.push("- 追问风格：围绕关键项目拆解方法论、取舍、利益冲突和真实影响。");
  } else if (/hr面|人力面/.test(roundKey)) {
    lines.push("- HR 面重点：动机、稳定性、薪酬/期望、文化适配、管理风格、风险项解释。");
    lines.push("- 追问风格：用行为事件验证，不要只问主观偏好。");
  } else if (/终面|终试|总监面|董事长|老板|ceo|vp|合伙人/.test(roundKey + interviewerText.toLowerCase())) {
    lines.push("- 终面重点：战略理解、组织适配、业务迁移、风险承担、入职 90 天优先级、长期动机。");
    lines.push("- 追问风格：少问流程细节，多问判断标准、取舍逻辑、业务视角和不可逆决策。");
  } else {
    lines.push("- 未明确轮次时：默认按“事实核验 + 专业深挖 + 动机风险”平衡设计。");
  }
  lines.push("", "### 面试官角色策略");
  if (/董事长|老板|ceo|创始人|合伙人|集团|总裁|vp|高管/i.test(interviewerText)) {
    lines.push("- 高层面试：问题必须上升到业务、组织、战略、价值观和关键风险，不要输出招聘专员式基础核验题。");
    lines.push("- 必须包含：为什么现在换机会、为什么适合本公司、过往最大判断失误、90 天优先级。");
  } else if (/招聘|hr|人力|人才|组织|od/i.test(interviewerText)) {
    lines.push("- 招聘/HR 面试：重点验证简历真实性、动机稳定性、岗位基本匹配、薪酬预期、组织适配和风险解释。");
  } else if (/业务|用人|部门|负责人|总监|经理|leader|李总|王总|张总/i.test(interviewerText)) {
    lines.push("- 用人经理面试：重点验证能否解决本岗位真实业务问题、跨部门推动、交付质量和上手路径。");
  } else {
    lines.push("- 面试官角色不明时：默认按用人经理视角输出，兼顾少量动机和风险问题。");
  }
  lines.push("", "### 岗位资历策略");
  if (/初级|junior|助理|专员/i.test(seniority)) {
    lines.push("- 初级岗位：少问战略，多问基础功、执行稳定性、学习能力、细节意识。");
  } else if (/中级|高级|资深|专家|senior/i.test(seniority)) {
    lines.push("- 高级/资深岗位：必须追问独立主导范围、复杂度、方法论、跨部门影响和失败复盘。");
  } else if (/总监|负责人|head|director|leader|管理/i.test(seniority)) {
    lines.push("- 总监/负责人岗位：必须追问组织设计、团队管理、预算/成本、机制建设、业务取舍、关键风险兜底。");
  } else {
    lines.push("- 资历未指定时：按 JD 要求推断问题深度，不默认放宽。");
  }
  return lines.join("\n");
}

export async function generateInterviewBriefForRecruit(plugin, ctx, opts) {
  if (!ctx || (!ctx.jd && !ctx.resume)) return "";
  opts = opts || {};
  const general = String(opts.generalOutline || "").trim();
  const prevPending = Array.isArray(opts.prevPending) ? opts.prevPending.map(s => String(s || "").trim()).filter(Boolean) : [];
  const meta = [];
  if (ctx.position) meta.push(`应聘岗位：${ctx.position}`);
  if (ctx.seniority) meta.push(`岗位资历：${ctx.seniority}`);
  if (ctx.candidateName) meta.push(`候选人：${ctx.candidateName}`);
  if (ctx.round) meta.push(`轮次：${ctx.round}`);
  if (ctx.interviewer) meta.push(`面试官：${ctx.interviewer}`);
  const metaLine = meta.length ? meta.join(" · ") + "\n\n" : "";
  const jdBlock = ctx.jd ? `## 岗位 JD\n${String(ctx.jd).trim()}\n\n` : "";
  const resumeBlock = ctx.resume ? `## 候选人简历\n${String(ctx.resume).trim()}\n\n` : "";
  const focusBlock = ctx.customNote ? `## 面试官特别想考察的点（必须单独设计如何验证）\n${String(ctx.customNote).trim()}\n\n` : "";
  const generalBlock = general ? `## 已有通用提纲（这些题已覆盖，请**不要重复**，只补针对本候选人的深挖题）\n${general}\n\n` : "";
  const prevBlock = prevPending.length ? `## 上一轮面试遗留的「待澄清」点\n${prevPending.map(p => "- " + p).join("\n")}\n\n` : "";
  const strategyBlock = buildRecruitInterviewBriefStrategy(ctx);
  const sys = "你是集团级面试官提纲助手，不是招聘专员。你擅长把 JD 与候选人简历之间的张力转成高质量面试问题，帮助面试官验证战略匹配、动机稳定性、组织取舍、风险底线和真实主导程度。";
  const user = `这是一场面试**开始前**的准备。请基于下面的 JD、候选人简历、面试轮次、岗位资历、面试官角色和面试官关注点，生成${general ? "**针对这位候选人**的现场提词卡（通用题已在上面通用提纲覆盖，本次聚焦简历×JD 的针对性深挖，不要重复通用题）" : "一份**现场面试提词卡**"}，供面试官面试中快速扫读和照着追问。

## 角色定位

你不是在生成普通 HR 题库。你要先判断本场面试官的视角：
- 如果面试官是董事长 / CEO / 创始人 / 集团高管：问题要少而重，关注战略理解、岗位动机、组织取舍、长期稳定性、风险底线和入职后优先级。
- 如果面试官是招聘负责人 / HRD：问题可更多追简历真实性、项目细节、数据口径、职责边界和风险解释。
- 如果面试官是用人部门负责人：问题更关注入职后能否解决业务问题、跨部门协同、交付质量和落地路径。

## 必须先内部完成的分析

请先在内部完成下面 4 步判断，不要输出分析过程：
1. 从 JD 中提取岗位真正要解决的 3-5 个组织问题、关键能力和做不好会造成的风险。
2. 从简历中提取最强匹配证据、最大不确定点、可能夸大的成果或需要核验的数字、行业/规模/团队/职级迁移风险、稳定性和动机风险。
3. 找出 JD 与简历之间的张力：看似匹配但场景不同、规模落差、项目很多但主导程度不明、技术/系统投入的长期成本不明、AI/自动化成果的 ROI 口径不明。
4. 根据面试官角色选择最值得问的 6-8 个问题。

## 出题规则

- 先按下面的【本场出题策略】决定问题重心。初面、终面、HR 面、高层面、用人经理面不能输出同一套模板。
- 默认输出**现场提词卡**，不是完整题库。文字必须短，便于面试时扫读。
- 紧扣"候选人经历 × JD 要求的匹配度"设计问题，尤其针对简历里写到但需要验证深浅/真伪/独立主导程度的经历。
- 每个必问问题都必须绑定至少一个具体来源：JD 要求 + 简历事实。若简历缺失，则明确写"简历材料不足，仅基于 JD"。
- 好问题要逼候选人讲取舍、边界、代价、失败、底线和口径，不要只让候选人复述经历。
- 主问必须短，追问必须是线索，不要写成长段完整问题。
- 若有"面试官特别想考察的点"，必须进入「本场目标」或「必问问题」，不能只放备用题库。
${prevPending.length ? "- 上一轮遗留的「待澄清」点务必逐条转成追问题，优先进入必问问题；每题标「上轮遗留」。\n" : ""}- 直接输出 Markdown，不要前言、不要解释、不要代码围栏。

## 董事长/高管终面优先主题

如果本场是终面、高管面、董事长面或 CEO 面，请优先从以下主题中选择 6-8 个，不必全部覆盖：
1. 动机与岗位落差：是否真想做这个岗位，是否有屈才感，是否稳定。
2. 行业迁移：是否清楚原行业经验哪些不能直接迁移。
3. 数智化基础骨架：是否理解数据、流程、权限、系统、服务边界是 AI 化前提。
4. 组织设计取舍：有限团队如何撑起多个职能，而不是靠堆人。
5. 自研 vs 外采：技术投入、长期维护成本和组织能力沉淀。
6. AI / 自动化 ROI：是否为了业务结果做 AI，而不是追技术概念。
7. 跨部门服务边界：如何处理 SSC、HRBP、COE、行政、IT、法务之间的边界。
8. 不可逆风险兜底：用工合规、薪酬、权限、数据、员工关系的底线机制。
9. 90 天优先级：入职后先诊断什么、先动什么、怎么证明价值。

## 禁止项

- 不要问"请介绍一下你的经历"。
- 不要问"你做过哪些系统/项目"这类泛题。
- 不要照抄 JD。
- 不要生成泛泛的 STAR 面试题。
- 不要把所有经历都问一遍。
- 不要超过 8 个主问题。
- 不要输出长篇背景解释。
- 不要把通用题库整段搬运到必问问题里。

## 输出格式必须严格遵守

# 面试提纲

## 本场目标
- 最多 3 条，每条不超过 28 字。

## 必问问题

### 1. <问题标题，不超过 14 字>
**主问**：<不超过 55 字>

**追问**：
- <不超过 32 字>
- <不超过 32 字>
- <不超过 32 字>

**看点**：<不超过 32 字>

**来源**：JD：<不超过 36 字>；简历：<不超过 42 字>

继续输出 6-8 个必问问题。总数不要超过 8 个。

## 备用追问
<details>
<summary>按模块展开备用题库</summary>

### <模块名>
- <备用题，不超过 45 字>
- <备用题，不超过 45 字>

</details>

## 本场出题策略
${strategyBlock}

${metaLine}${jdBlock}${resumeBlock}${focusBlock}${generalBlock}${prevBlock}`;
  const text = await callLlm(plugin, sys, user, { timeoutMs: 60000 });
  let md = stripModeSuggestionBlocks(String(text || "")).trim();
  md = md.replace(/^```(?:markdown|md)?\s*\r?\n?/i, "").replace(/\r?\n?```\s*$/i, "").trim();
  return md;
}

export function recruitRoundRank(s) {
  const k = String(s || "").trim().replace(/\s+/g, "").toLowerCase();
  return RECRUIT_ROUND_RANK[k] != null ? RECRUIT_ROUND_RANK[k] : 99;
}

export async function findPrevRoundRecruitNote(app, ctx) {
  try {
    if (!ctx || !ctx.jdFile || !ctx.candidateName) return null;
    const jdFile = app.vault.getAbstractFileByPath(obsidian.normalizePath(ctx.jdFile));
    if (!(jdFile instanceof obsidian.TFile) || !jdFile.parent) return null;
    const curRank = recruitRoundRank(ctx.round);
    const cand = String(ctx.candidateName).trim();
    if (!cand || cand === "未提及") return null;   // 占位名不参与跨场匹配，避免串号
    let best = null, bestTime = -1;
    for (const f of (jdFile.parent.children || [])) {
      if (!(f instanceof obsidian.TFile) || f.extension !== "md" || f.path === jdFile.path) continue;
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (String(fm.候选人 || "").trim() !== cand) continue;
      const r = recruitRoundRank(fm.轮次);
      if (r >= 99 || r >= curRank) continue;   // 不是更早的轮次
      let t = 0;
      try {
        if (fm.time && window.moment) { const mm = window.moment(fm.time); t = (mm && mm.isValid && mm.isValid()) ? mm.valueOf() : (f.stat ? f.stat.mtime : 0); }
        else if (fm.time) { const d = Date.parse(fm.time); t = Number.isNaN(d) ? (f.stat ? f.stat.mtime : 0) : d; }
        else t = f.stat ? f.stat.mtime : 0;
      } catch { t = f.stat ? f.stat.mtime : 0; }
      if (t > bestTime) { bestTime = t; best = fm; }
    }
    if (!best) return null;
    const pending = Array.isArray(best.待澄清) ? best.待澄清.map(x => String(x || "").trim()).filter(Boolean) : [];
    return { round: best.轮次 || "", pending };
  } catch (e) { console.error("[LexVoice] findPrevRoundRecruitNote", e); return null; }
}

export async function writeGeneralOutlineToJd(app, jdFilePath, general) {
  try {
    const file = app.vault.getAbstractFileByPath(obsidian.normalizePath(jdFilePath || ""));
    const body = String(general || "").trim();
    if (!(file instanceof obsidian.TFile) || !body) return false;
    const transform = (cur) => {
      const lines = String(cur).split(/\r?\n/);
      let hi = -1;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
        if (m && m[1].length === 2 && m[2].trim() === "统一面试提纲") { hi = i; break; }
      }
      if (hi < 0) return String(cur).replace(/\s*$/, "") + `\n\n## 统一面试提纲\n\n${body}\n`;
      let ei = lines.length;
      for (let i = hi + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/);
        if (m && m[1].length <= 2) { ei = i; break; }
      }
      const before = lines.slice(0, hi + 1).join("\n");
      const after = lines.slice(ei).join("\n").replace(/^\n+/, "");
      return before + "\n\n" + body + "\n" + (after ? "\n" + after : "");
    };
    if (typeof app.vault.process === "function") {
      await app.vault.process(file, (data) => transform(data));
    } else {
      const cur = await app.vault.read(file);
      const next = transform(cur);
      if (next !== cur) await app.vault.modify(file, next);
    }
    return true;
  } catch (e) { console.error("[LexVoice] writeGeneralOutlineToJd", e); return false; }
}

export async function generateRecruitGeneralOutline(plugin, ctx) {
  const jd = String(ctx.jd || "").trim();
  const qualities = serializeRequiredQualities(ctx.requiredQualities || []);
  if (!jd && !qualities) return "";
  const sys = "你是资深面试官教练，擅长据 JD 和岗位必备素质设计**通用**面试提纲——这份提纲面该岗位任何候选人都通用，不针对具体某人。";
  const user = `据下面的 JD 和【必要素质清单】，生成一份**通用面试提纲**（这个岗位面任何候选人都能用，所以**绝不要引用任何具体候选人或简历信息**）。

要求：
- **第一组必须是「素质考核」**：对【必要素质清单】里**每一条**素质，各设计 1-2 个能验证它的问题；每个素质考核题以「【素质考核】」标记行开头，整组置于全文最前。问题要能从回答里看出该素质对应的"信号"。
- 其后再按 JD 的硬性要求分组出通用能力题（专业深度 / 过往经历核验 / 岗位匹配 等）。
- 问题要具体、能挖到事实层，不要"介绍一下你的经验"这种泛问。
- 直接输出 Markdown（## 分组标题 + 列表），不要前言、不要解释、不要代码围栏。

## 岗位 JD
${jd || "（未提供）"}

${qualities || "（未配置必备素质）"}`;
  const text = await callLlm(plugin, sys, user, { timeoutMs: 60000 });
  let md = stripModeSuggestionBlocks(String(text || "")).trim();
  md = md.replace(/^```(?:markdown|md)?\s*\r?\n?/i, "").replace(/\r?\n?```\s*$/i, "").trim();
  return md;
}

export async function getRecruitInterviewOutline(plugin, ctx) {
  if (!ctx || (!ctx.jd && !ctx.resume)) return "";
  // 1) 通用段：ctx.generalOutline 已带则用；否则再读一次 JD 现状；仍空且有 JD/素质则生成并写回
  let general = String(ctx.generalOutline || "").trim();
  if (!general && ctx.jdFile) {
    try { const parsed = await parseJdProject(plugin.app, ctx.jdFile); general = String(parsed.统一提纲 || "").trim(); } catch {}
  }
  if (!general && (ctx.jd || (Array.isArray(ctx.requiredQualities) && ctx.requiredQualities.length))) {
    general = await generateRecruitGeneralOutline(plugin, ctx);
    if (general && ctx.jdFile) { try { await writeGeneralOutlineToJd(plugin.app, ctx.jdFile, general); } catch {} }
  }
  // 2) 上轮待澄清
  let prevPending = [];
  try { const prev = await findPrevRoundRecruitNote(plugin.app, ctx); if (prev && prev.pending) prevPending = prev.pending; } catch {}
  // 3) 针对段
  const targeted = await generateInterviewBriefForRecruit(plugin, ctx, { generalOutline: general, prevPending });
  // 4) 组合：面试现场优先看「本场提词卡」；通用题库折叠保留，避免整屏长题库压住真正要问的问题。
  const parts = [];
  if (targeted) parts.push(targeted);
  if (general) {
    parts.push([
      "<details>",
      "<summary>📚 通用题库 · 本岗位通用</summary>",
      "",
      general,
      "",
      "</details>",
    ].join("\n"));
  }
  return parts.join("\n\n");
}

export function parseRecruitQualitiesFromOutput(text) {
  if (!text) return { qualities: {}, cleaned: text || "" };
  const re = /<!--\s*lexvoice-recruit\s*:\s*([\s\S]*?)\s*-->/i;
  const m = text.match(re);
  if (!m) return { qualities: {}, cleaned: text };
  const qualities = {};
  try {
    const obj = JSON.parse(String(m[1]).trim());
    const src = (obj && typeof obj === "object" && obj.素质 && typeof obj.素质 === "object") ? obj.素质 : null;
    if (src) {
      for (const [k, v] of Object.entries(src)) {
        const name = String(k || "").trim();
        const verdict = String(v || "").trim();
        if (name && /^(达到|未达|本场未验证)$/.test(verdict)) qualities[name] = verdict;
      }
    }
  } catch (e) { /* 解析失败：安全降级，不写素质字段 */ }
  const cleaned = text.replace(new RegExp(re.source, "gi"), "").replace(/\n{3,}$/, "\n\n").trimEnd() + "\n";
  return { qualities, cleaned };
}

export function buildCompactRecruitContextPrefix(ctx) {
  if (!ctx) return "";
  const parts = ["## 招聘评估上下文（评分锚点）"];
  if (ctx.position) parts.push(`- 应聘岗位：${ctx.position}`);
  if (ctx.candidateName) parts.push(`- 候选人：${ctx.candidateName}`);
  if (ctx.round) parts.push(`- 轮次：${ctx.round}`);
  if (ctx.interviewer) parts.push(`- 面试官：${ctx.interviewer}`);
  if (ctx.seniority) parts.push(`- 岗位资历级别：${ctx.seniority}`);
  if (ctx.customNote) {
    parts.push(`- 特殊关注点（重点考核项）：${truncateForLlmPrompt(ctx.customNote, 900)}`);
    parts.push(`- ⚠️ 必须在结论下方输出「重点考核项核验」，逐项从文本里找正反证据（含侧面体现）并引用，找不到就标「未触及，建议二面核查」。`);
  }
  if (ctx.jd) {
    parts.push("", "### JD（用于拆解硬性要求和加分项）");
    parts.push(truncateForLlmPrompt(String(ctx.jd).trim(), 5200));
  }
  if (ctx.resume) {
    parts.push("", "### 简历（用于核验候选人陈述）");
    parts.push(truncateForLlmPrompt(String(ctx.resume).trim(), 3200));
  }
  if (Array.isArray(ctx.requiredQualities) && ctx.requiredQualities.length) {
    const qBlock = serializeRequiredQualities(ctx.requiredQualities);
    if (qBlock) parts.push("", "### 本岗位必备素质（最终纪要须逐条核验，序号对应核验表行号）", qBlock);
  }
  if (ctx.generalOutline) {
    parts.push("", "### 统一面试提纲（本岗位通用考核结构，参考即可，不必逐题复述）", truncateForLlmPrompt(String(ctx.generalOutline).trim(), 2000));
  }
  parts.push("");
  return parts.join("\n");
}

export function buildRecruitTextImportMergePrompt(joined, recruitContext) {
  const context = buildCompactRecruitContextPrefix(recruitContext);
  return [
    "你正在处理 LexVoice 的「导入文本 / MD 结构化整理」。输入已经是文字，可能来自速录稿、已有纪要、面试记录或多份文本合并；不会经过 ASR。没有时间戳、没有音频链接、不是逐字问答时，直接忽略时间戳要求，不要抱怨素材缺失。",
    "",
    context,
    "## 输出文件格式",
    "",
    "**必须以 YAML frontmatter 开头**，只写这些字段，缺失写「未提及」：",
    "",
    "```yaml",
    "---",
    FRONTMATTER_SCHEMA.recruit,
    "---",
    "```",
    "",
    "frontmatter 后空一行，再输出正文。正文收尾处必须给人员注释和标签注释（人物单列、不进 tags），例如：",
    "<!-- lexvoice-people: 候选人姓名 -->",
    "<!-- lexvoice-tags: 主题/招聘流程, 主题/岗位匹配 -->",
    "",
    "## 招聘评估纪律",
    "",
    "- 先按 JD 拆出硬性要求、加分项和 seniority 标杆，再对照文本证据评估。",
    "- 默认候选人不达标；只有文本中有明确正向证据才加分。",
    "- 诚实、不夸大、承认边界属于基础职业素养，不算亮点。",
    "- 简历与文本陈述矛盾、结果未闭环、独立主导边界不清、行业或经验跨度不匹配，必须列入风险。",
    "- 未问到或文本没有证据的 JD 要求，写「未验证」，不要默认及格。",
    "- 如果文本是已有纪要而非问答，按能力维度和证据组织；不要强行编造题号、面试官问题或时间戳。",
    "- 如果文本里有候选人原话或明确事实，保留为证据；没有证据就写「未提及 / 未验证」。",
    "",
    "## 推荐正文结构",
    "",
    "> [!summary] 面试评价",
    "> 结论：<强烈推荐 / 推荐 / 倾向推荐 / 倾向不推荐 / 不推荐>",
    "> 核心原因：<2-4 条，必须对应文本证据和 JD 要求>",
    "",
    "### 候选人画像",
    "用 1-3 段说明候选人背景、主要能力表现、与 JD seniority 的差距。",
    "",
    "### JD 匹配度",
    "用简洁表格列出 3-6 条关键 JD 要求：要求 / 证据 / 判断 / 风险或缺口。",
    "",
    "### 关键证据",
    "按能力维度或面试问题整理，不强制题号。每点包含：候选人说了什么、能证明什么、仍缺什么。",
    "",
    "### 红旗与待追问",
    "只写确实由文本触发的风险和追问；不要生成泛泛的面试题库。",
    "",
    "### 录用建议",
    "给出最终建议、适合/不适合的岗位边界，以及下一步验证建议。",
    "",
    "## 导入文本",
    "",
    joined,
  ].filter(Boolean).join("\n");
}

export function buildJobPortraitMergePrompt(transcript, meta) {
  const m = meta || {};
  const posLines = [];
  if (m.position || m.jobTitle) posLines.push(`岗位名：${m.position || m.jobTitle}`);
  if (m.department) posLines.push(`部门/业务线：${m.department}`);
  if (m.level) posLines.push(`岗位级别：${m.level}`);
  const posBlock = posLines.length ? `【岗位元数据】\n${posLines.join("\n")}\n\n` : "";
  const dims = JOBPORTRAIT_DIMENSIONS.map((d) => d.name).join("、");
  return `${posBlock}任务：基于下面这场"招聘需求沟通会"（HRBP 与业务方沟通某岗位招人标准）的完整转写，写一份**依据实际讨论自然生长出来的岗位画像**。

【第 0 步——先判断这场对话像不像"招聘需求沟通会"】
- 先通读转写再下笔：如果整场（或大部分）并不是在沟通某个岗位的招人标准——比如更像研讨、复盘、闲聊——**不要硬套招聘框架**：开头 callout 里如实声明"本场对话并非典型的招聘需求沟通会，以下画像仅基于其中与岗位相关的片段推断，置信度有限"；画像只基于确实谈到岗位的片段来写，内容薄就如实写薄；并在文档最末尾追加：
> [!tip] 模式建议
> 本对话更像【<更契合的模式>】。理由：<一句>。下次可改用对应模式重新整理。

【角色识别（高风险，宁缺毋滥）】
- 把某个具体称呼/人名指认为"业务方""一号位""上级"等角色，必须有转写中**至少两处、非假设语境**的明确依据（"假如我去应聘""比如说"这类假设句不算数）；依据不足时一律只用角色词，不指名。
- 凡属推断的人物-角色对应，名字后必须标注（推断），例如"一号位（某称呼，推断）"。
- 全场只零星出现两三次的称呼，**不要提升为画像的核心锚点人物**——宁可写"业务方的上级"，也不要把不确定的名字钉死在画像骨架上。

【最重要的原则——不是填表】
- 画像的结构和篇幅由这场讨论本身决定：业务方花最多口舌、反复强调、举了例子的地方，就是画像里最重的部分；一句带过的就轻写；没谈的别硬凑。按业务方真实的关注重心和脉络来组织，而不是套固定模板。
- 忠实但要综合：每个判断尽量带业务方原话或具体场景作支撑；但不要因为"没有一字不差的原话"就丢掉一个真实浮现的要点——你可以把零散的话归并、提炼成清晰的标准，只是不许臆造业务方没表达过的意思。
- 宁可深、不要泛。一小时的讨论应当长出一份有血有肉的画像，而不是几条干巴巴的标签。把"冰山下"的隐性偏好（在意什么品质 / 价值观 / 驱动力、什么样的人会被淘汰、踩过哪些坑）挖出来，并讲清楚为什么。

【内容范围（这是你自查"挖全了没"的清单，不是输出小标题；按讨论实际权重融进叙述即可，谈到才写）】
${dims}

【输出格式（Markdown，业务语言，无技术黑话）】
- 开头一个总览 callout：\`> [!abstract] 岗位画像\`，里面一两句点出岗位 + 这场会最核心的招人意图。
- 正文：按业务方实际强调的重点自由组织小标题 / 段落，把硬性要求、真正在意的软特质与价值观、风险顾虑、团队与上级风格等**融在讨论脉络里**展开，配原话 / 场景。
- 结尾固定一段 \`> [!warning] 缺口与待追问\`：列出这场没谈透、只用了模糊词、或根本没碰的方面，写成 HRBP 下次能直接照着问的话术——这是这份画像最有行动价值的部分。
- 直接输出 Markdown 正文，不要前言、不要解释、不要代码围栏。
- 正文末尾追加两条机器注释（不渲染，供插件回写 frontmatter）：\`<!-- lexvoice-people: ... -->\` 和 \`<!-- lexvoice-tags: 主题/招聘需求, 行业/xx -->\`（人物不进 tags）。lexvoice-people 只写转写里**确实出现**的真实人名/明确称呼；"业务方""一号位"这类角色词和推断出的绑定**不要写进人物**；没有明确人名就留空——宁可没有，也不要编造。

【完整转写】
${transcript}`;
}

export async function generateJobPortrait(plugin, transcript, meta, segments) {
  let userPrompt = buildJobPortraitMergePrompt(transcript, meta);
  userPrompt = applyBriefingLanguageInstruction(userPrompt, plugin.settings);
  const maxTokens = Math.max(2400, getBriefingMergeMaxTokens({
    durationMs: getSegmentsDurationMs(segments) || getSessionMetaDurationMs(meta),
    transcriptChars: String(transcript || "").length,
    segmentCount: Array.isArray(segments) ? segments.length : 0,
  }, plugin.settings));
  const { text, truncated } = await callBriefingMergeLlm(plugin, JOBPORTRAIT_SYSTEM_PROMPT, userPrompt, { stream: true, payload: { max_tokens: maxTokens } }, { mode: "recruit-needs", transcriptChars: String(transcript || "").length });
  // 叙述式产出：模型直接给 Markdown，剥掉模式建议块 / 可能的代码围栏后原样落盘（不再 JSON 解析 + 模板渲染）。
  let md = stripModeSuggestionBlocks(String(text || "")).trim();
  md = md.replace(/^```(?:markdown|md)?\s*\r?\n?/i, "").replace(/\r?\n?```\s*$/i, "").trim();
  return { md, truncated };
}

export function getRecruitContextCopy(flow) {
  return RECRUIT_CONTEXT_FLOW_COPY[flow] || RECRUIT_CONTEXT_FLOW_COPY.recording;
}

export function normalizeRecruitContext(ctx) {
  const raw = ctx || {};
  return {
    jd: String(raw.jd || "").trim(),
    resume: String(raw.resume || "").trim(),
    candidateName: String(raw.candidateName || "").trim(),
    position: String(raw.position || "").trim(),
    round: String(raw.round || "初面").trim() || "初面",
    interviewer: String(raw.interviewer || "").trim(),
    seniority: String(raw.seniority || "").trim(),
    customNote: String(raw.customNote || "").trim(),
    // F2 招聘项目化：选中 JD 项目时携带的派生上下文（供注入与落盘 frontmatter 用）
    jdFile: String(raw.jdFile || "").trim(),                       // 项目 JD 文件路径（落盘时写 frontmatter 的 jd 链接）
    generalOutline: String(raw.generalOutline || "").trim(),        // 统一面试提纲
    interviewBrief: String(raw.interviewBrief || "").trim(),          // 针对候选人的录音前面试提纲
    requiredQualities: Array.isArray(raw.requiredQualities)         // 综合素质（必备素质清单）
      ? raw.requiredQualities
          .map(q => ({ 素质: String((q && q.素质) || "").trim(), 定义: String((q && q.定义) || "").trim(), 信号: String((q && q.信号) || "").trim() }))
          .filter(q => q.素质)
      : [],
    savedAt: raw.savedAt || null,
  };
}

export function hasRecruitContextContent(ctx) {
  const c = normalizeRecruitContext(ctx);
  return !!(c.jd || c.resume || c.candidateName || c.position || c.interviewer || c.seniority || c.customNote);
}

export function normalizeRecruitJdSignatureText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[，。；：、,. ;:]+/g, " ")
    .trim()
    .toLowerCase();
}

export function hashRecruitJdText(text) {
  let h = 2166136261;
  const src = String(text || "");
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function makeRecruitJdLibraryEntry(ctx) {
  const c = normalizeRecruitContext(ctx);
  if (!c.jd) return null;
  const sigText = normalizeRecruitJdSignatureText([c.position, c.seniority, c.jd].filter(Boolean).join("\n"));
  return {
    id: "jd-" + hashRecruitJdText(sigText),
    type: "jd",
    jd: c.jd,
    position: c.position,
    seniority: c.seniority,
    customNote: c.customNote,
    savedAt: new Date().toISOString(),
  };
}

export function getRecruitJdLibrarySignature(item) {
  const c = normalizeRecruitContext(item);
  return (item && item.id) || ("jd-" + hashRecruitJdText(normalizeRecruitJdSignatureText([c.position, c.seniority, c.jd].filter(Boolean).join("\n"))));
}

export function upsertRecruitJdLibrary(settings, ctx) {
  const entry = makeRecruitJdLibraryEntry(ctx);
  if (!entry) return false;
  const lib = Array.isArray(settings.recruitContextLibrary) ? settings.recruitContextLibrary.slice() : [];
  const sig = getRecruitJdLibrarySignature(entry);
  const existing = lib.findIndex(item => getRecruitJdLibrarySignature(item) === sig);
  if (existing >= 0) lib.splice(existing, 1);
  lib.unshift(entry);
  if (lib.length > 20) lib.length = 20;
  settings.recruitContextLibrary = lib;
  return true;
}

export function getRecruitJdLibrary(settings) {
  return (Array.isArray(settings && settings.recruitContextLibrary) ? settings.recruitContextLibrary : [])
    .map(item => normalizeRecruitContext(item))
    .filter(item => item.jd);
}

export function applyRecruitJdLibraryItem(ctx, item) {
  const source = normalizeRecruitContext(item);
  ctx.jd = source.jd;
  ctx.position = source.position;
  ctx.seniority = source.seniority;
  ctx.customNote = source.customNote;
}

export function getRecruitJdPreview(jd) {
  const line = String(jd || "").split(/\r?\n/).map(s => s.trim()).find(Boolean) || "";
  return line.length > 36 ? line.slice(0, 35).trimEnd() + "..." : line;
}

export function isRecruitJdFile(file) {
  if (!(file instanceof obsidian.TFile) || file.extension !== "md" || !file.parent) return false;
  return file.basename === file.parent.name;
}

export async function parseJdProject(app, jdFilePath) {
  const result = { 岗位描述: "", 综合素质: [], 统一提纲: "", qualitiesError: false };
  const jdFile = app.vault.getAbstractFileByPath(obsidian.normalizePath(jdFilePath || ""));
  if (!(jdFile instanceof obsidian.TFile)) return result;
  let md = "";
  try { md = await app.vault.cachedRead(jdFile); } catch { md = ""; }
  const fm = (app.metadataCache.getFileCache(jdFile) || {}).frontmatter || {};
  let desc = extractMarkdownSection(md, "## 岗位描述");
  if (!desc) desc = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
  result.岗位描述 = stripMarkdownDetailsWrapper(desc);
  result.统一提纲 = stripMarkdownDetailsWrapper(extractMarkdownSection(md, "## 统一面试提纲"));
  const raw = fm.综合素质;
  if (Array.isArray(raw)) {
    const parsed = [];
    for (const item of raw) {
      if (item && typeof item === "object" && item.素质 != null) {
        parsed.push({ 素质: String(item.素质 || "").trim(), 定义: String(item.定义 || "").trim(), 信号: String(item.信号 || "").trim() });
      }
    }
    result.综合素质 = parsed.filter(q => q.素质);
    result.qualitiesError = raw.length > 0 && result.综合素质.length === 0;
  } else if (raw != null && String(raw).trim()) {
    result.qualitiesError = true;
  }
  return result;
}

export async function extractPdfTextBestEffort(app, file) {
  try {
    if (!(file instanceof obsidian.TFile) || String(file.extension || "").toLowerCase() !== "pdf") return "";
    const w: any = (typeof window !== "undefined") ? window : {};
    const pdfjs = w.pdfjsLib || (w.pdfjs && w.pdfjs.pdfjsLib) || null;
    if (!pdfjs || typeof pdfjs.getDocument !== "function") return "";
    const data = await app.vault.readBinary(file);
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    const doc = await (task.promise || task);
    const pageCount = Math.min(Number(doc.numPages) || 0, 50);
    const pages = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push((content.items || []).map(it => (it && it.str) || "").join(" "));
    }
    try { if (doc.destroy) doc.destroy(); } catch {}
    return pages.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch (e) {
    console.warn("[LexVoice] PDF 文本提取失败，回退手动粘贴", e);
    return "";
  }
}

export function listResumePdfs(app, resumeFolderPath) {
  const root = app.vault.getAbstractFileByPath(obsidian.normalizePath(resumeFolderPath || "简历"));
  if (!(root instanceof obsidian.TFolder)) return [];
  const out = [];
  const walk = (folder) => {
    for (const f of (folder.children || [])) {
      if (f instanceof obsidian.TFile && String(f.extension || "").toLowerCase() === "pdf") out.push(f);
      else if (f instanceof obsidian.TFolder) walk(f);
    }
  };
  walk(root);
  out.sort((a, b) => ((b.stat && b.stat.mtime) || 0) - ((a.stat && a.stat.mtime) || 0));
  return out;
}

export function renderRecruitJdTemplate(fm, jdBody) {
  const f = fm || {};
  const name = String(f.职位名 || "未命名岗位").trim();
  const seq = String(f.序列 || "招聘").trim();
  const status = String(f.状态 || "招聘中").trim();
  let today = "";
  try { today = window.moment ? window.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10); } catch { today = ""; }
  const body = String(jdBody || "").trim() || "（在此粘贴或撰写 JD 正文，注入评估时整段取用）";
  const qLines = ["综合素质:"];
  for (const q of DEFAULT_RECRUIT_QUALITIES) {
    qLines.push(`  - 素质: ${q.素质}`);
    qLines.push(`    定义: ${q.定义}`);
    qLines.push(`    信号: ${q.信号}`);
  }
  const qualityNames = DEFAULT_RECRUIT_QUALITIES.map(q => q.素质).join("、");
  return [
    "---",
    "类型: 招聘项目",
    `职位名: ${name}`,
    `状态: ${status}`,
    `序列: ${seq}`,
    ...qLines,
    "已面试数: 0",
    "候选人数: 0",
    "推荐数: 0",
    "倾向不推荐数: 0",
    `最新动态: ""`,
    `开放日期: ${today}`,
    "---",
    "",
    `# ${name}`,
    "",
    "> [!summary] 招聘项目",
    `> **状态**：${status} · **序列**：${seq} · **开放日期**：${today || "未记录"}`,
    "> **候选人**：0 · **已面试**：0 · **推荐**：0 · **倾向不推荐**：0",
    "> **最新动态**：暂无",
    "",
    "## 候选人看板",
    "",
    `![[${name}.base#全部]]`,
    "",
    "> [!tip] 使用方式",
    "> 面试纪要放在本项目文件夹后，会自动出现在上方看板。看板里的「面试纪要」可跳回原始面试记录。",
    "",
    "## 岗位速览",
    "",
    `- **职位**：${name}`,
    `- **序列**：${seq}`,
    `- **状态**：${status}`,
    `- **重点素质**：${qualityNames}`,
    "",
    "## 岗位描述",
    "",
    "<details>",
    "<summary>展开完整 JD</summary>",
    "",
    body,
    "",
    "</details>",
    "",
    "## 统一面试提纲",
    "",
  ].join("\n");
}

export function renderRecruitCandidateBase(qualities) {
  // 素质名只收纯中文/字母/数字/下划线（排除空格/冒号/# 等会破坏 order 行内数组或属性引用的字符）。
  const qs = (Array.isArray(qualities) ? qualities : []).map(q => String(q || "").trim()).filter(q => /^[一-龥A-Za-z0-9_]+$/.test(q));
  const qCols = qs.map(n => `素质_${n}`);
  const allOrder = ["file.name", "候选人", "联系方式", "轮次", "一句话评价", "录用建议", "time", "时长"].concat(qCols);
  // 录用建议过滤一律用 contains（与 PRD F5.1 一致）：兼容「倾向推荐」「倾向推荐（条件性）」等带后缀枚举，
  // 避免精确 == 漏过条件性档；取反用 not 分组包 contains。
  return [
    "filters:",
    "  and:",
    "    - file.folder == this.file.folder",
    "    - jd != null",
    "properties:",
    "  file.name:",
    "    displayName: 面试纪要",
    "  候选人:",
    "    displayName: 姓名",
    "  联系方式:",
    "    displayName: 联系方式",
    "  轮次:",
    "    displayName: 面试轮次",
    "  一句话评价:",
    "    displayName: 一句话评价",
    "  录用建议:",
    "    displayName: 录用建议",
    "  time:",
    "    displayName: 面试时间",
    "  时长:",
    "    displayName: 面试时长",
    "views:",
    "  - type: table",
    "    name: 全部",
    `    order: [${allOrder.join(", ")}]`,
    "    sort:",
    "      - property: time",
    "        direction: DESC",
    "  - type: table",
    "    name: 推荐",
    "    filters:",
    "      and:",
    '        - 录用建议.contains("推荐")',
    "        - not:",
    '            - 录用建议.contains("不推荐")',
    "    order: [file.name, 候选人, 联系方式, 轮次, 一句话评价, 录用建议, time]",
    "    sort:",
    "      - property: time",
    "        direction: DESC",
    "  - type: table",
    "    name: 倾向不推荐",
    "    filters:",
    "      and:",
    '        - 录用建议.contains("不推荐")',
    "    order: [file.name, 候选人, 联系方式, 轮次, 一句话评价, 录用建议, time]",
    "  - type: table",
    "    name: 待复试",
    "    filters:",
    "      and:",
    '        - 轮次 == "初面"',
    "        - not:",
    '            - 录用建议.contains("不推荐")',
    "    order: [file.name, 候选人, 联系方式, 轮次, 一句话评价, 录用建议, time]",
    "",
  ].join("\n");
}

export function renderRecruitAggregateBase() {
  return [
    "filters:",
    "  and:",
    '    - 类型 == "招聘项目"',
    "properties:",
    "  file.name:",
    "    displayName: 项目",
    "  职位名:",
    "    displayName: 职位",
    "views:",
    "  - type: table",
    "    name: 招聘中",
    "    filters:",
    "      and:",
    '        - 状态 == "招聘中"',
    "    order: [file.name, 职位名, 序列, 候选人数, 已面试数, 推荐数, 倾向不推荐数, 最新动态, 开放日期]",
    "    sort:",
    "      - property: 开放日期",
    "        direction: DESC",
    "  - type: table",
    "    name: 全部",
    "    order: [file.name, 职位名, 状态, 序列, 候选人数, 已面试数, 推荐数, 倾向不推荐数, 开放日期]",
    "    sort:",
    "      - property: 开放日期",
    "        direction: DESC",
    "",
  ].join("\n");
}

export async function ensureRecruitAggregateBase(app, jdFolderPath) {
  try {
    const root = obsidian.normalizePath(jdFolderPath || "JD");
    if (!(app.vault.getAbstractFileByPath(root) instanceof obsidian.TFolder)) return;
    const basePath = obsidian.normalizePath(`${root}/招聘项目.base`);
    if (app.vault.getAbstractFileByPath(basePath)) return;  // 已存在不覆盖
    await app.vault.create(basePath, renderRecruitAggregateBase());
  } catch (e) { console.error("[LexVoice] ensureRecruitAggregateBase", e); }
}

export async function createRecruitProject(app, jdFolderPath, rawName, fm, jdBody) {
  const root = obsidian.normalizePath(jdFolderPath || "JD");
  if (!(app.vault.getAbstractFileByPath(root) instanceof obsidian.TFolder)) {
    await app.vault.createFolder(root);
  }
  const name = sanitizeProjectFolderName(rawName);
  const folderPath = obsidian.normalizePath(`${root}/${name}`);
  if (app.vault.getAbstractFileByPath(folderPath)) throw new Error(`项目「${name}」已存在，请换个名字`);
  await app.vault.createFolder(folderPath);
  const mdPath = obsidian.normalizePath(`${folderPath}/${name}.md`);
  const basePath = obsidian.normalizePath(`${folderPath}/${name}.base`);
  await app.vault.create(mdPath, renderRecruitJdTemplate(Object.assign({}, fm, { 职位名: name }), jdBody));
  await app.vault.create(basePath, renderRecruitCandidateBase(DEFAULT_RECRUIT_QUALITIES.map(q => q.素质)));
  await ensureRecruitAggregateBase(app, root);
  return { name, folderPath, mdPath, basePath };
}

export function renderRecruitHomepageTemplate() {
  return [
    "---", "类型: 招聘主页", "---",
    "# 招聘总览", "",
    "```lexvoice-hr-actions", "```", "",
    "```lexvoice-hr-stats", "```", "",
    "## 在招项目", "", "![[招聘项目.base#招聘中]]", "",
    "## 本周面试", "", "```lexvoice-hr-recent", "days: 7", "```", "",
    "## 最近纪要", "", "```lexvoice-hr-latest-notes", "count: 10", "```", "",
  ].join("\n");
}

export function listRecruitCandidateNotes(app) {
  const out = [];
  try {
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.类型 === "招聘项目" || fm.类型 === "招聘主页") continue;
      let isRecruit = fm.mode === "recruit";
      if (!isRecruit) {
        const tags = [].concat(fm.tags || []).map(t => String(t || "").replace(/^#/, ""));
        if (tags.indexOf("lexvoice/recruit") >= 0) isRecruit = true;
      }
      if (!isRecruit) continue;
      let t = 0;
      try { t = fm.time ? (window.moment ? window.moment(fm.time).valueOf() : Date.parse(fm.time)) : (f.stat ? f.stat.mtime : 0); } catch { t = f.stat ? f.stat.mtime : 0; }
      out.push({
        path: f.path,
        项目: f.parent ? f.parent.name : "",
        候选人: String(fm.候选人 || "").trim(),
        轮次: String(fm.轮次 || "").trim(),
        录用建议: String(fm.录用建议 || "").trim(),
        一句话评价: String(fm.一句话评价 || "").trim(),
        time: Number(t) || 0,
      });
    }
  } catch (e) { console.error("[LexVoice] listRecruitCandidateNotes", e); }
  out.sort((a, b) => b.time - a.time);
  return out;
}

export function recruitRecommendationColor(label) {
  const s = String(label || "").trim();
  if (s.startsWith("强烈推荐")) return "var(--color-green)";
  if (s.startsWith("倾向不推荐")) return "var(--color-orange)";
  if (s.startsWith("不推荐")) return "var(--color-red)";
  if (s.startsWith("倾向推荐")) return "var(--color-yellow)";
  if (s.startsWith("推荐")) return "var(--color-green)";
  return "var(--text-muted)";
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

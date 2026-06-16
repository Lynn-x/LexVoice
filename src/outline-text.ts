/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck
// 实时大纲的"文本/状态纯函数层"。从 main.ts 抽出，专门承载所有"把非确定性的 LLM markdown
// 掰回确定结构"的逻辑——这是全项目正确性最敏感、历史 bug 最多的一层。
// 这里的函数全是纯函数（无 obsidian / 无 DOM / 无 IO），便于被 vitest 回归测试覆盖（见 outline-text.test.ts）。
// 注意：normalizeRealtimeOutlineState / renderRealtimeOutlineStateMarkdown 仍留在 main.ts（它们依赖
// clipRealtimeContextText 等通用工具），但会从本模块 import 这里的节点构造/解析函数。

export const REALTIME_OUTLINE_STATE_MAX_NODES = 60;
export const REALTIME_OUTLINE_STATE_MAX_CHILDREN = 5;

export const REALTIME_OUTLINE_ANCHOR_RE = /\[\[[^\]\n]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/;
export const REALTIME_OUTLINE_ANCHOR_GLOBAL_RE = /\[\[[^\]\n]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/g;
// 连排分隔符：空格 + 任意 Unicode 破折号 + 空格。
// 用 \p{Pd}（Unicode 破折号类）一网打尽：ASCII 连字符 - / 连字符 ‐ / 不换行连字符 ‑ /
// en-dash – / em-dash — / 横杠 ― 等"长得像但码点不同"的全部认；再补减号 U+2212(−，属 Sm 类不在 Pd)。
// 要求两侧有空格，避开中文 "——"（破折号通常无空格）误伤。
export const REALTIME_OUTLINE_INLINE_SEP_RE = /\s[\p{Pd}−]\s/u;
export const REALTIME_OUTLINE_INLINE_SEP_SPLIT_RE = /\s[\p{Pd}−]\s/gu;

// 把一个片段在"第 2 个及以后的锚点"前切开——应对模型把多个一级条目排在一起、中间却没用任何破折号分隔的情况。
// 锚点 [[file|HH:MM]] 是最可靠的结构信号，据它硬切能保证一级条目至少能分开（时间轴 rail 不会糊成一条）。
export function splitRealtimeOutlineAtEmbeddedAnchors(segment) {
  const s = String(segment || "");
  const re = new RegExp(REALTIME_OUTLINE_ANCHOR_GLOBAL_RE.source, "g");
  const idxs = [];
  let m;
  while ((m = re.exec(s))) idxs.push(m.index);
  if (idxs.length <= 1) return [s];
  const out = [];
  let start = 0;
  for (let i = 1; i < idxs.length; i++) { out.push(s.slice(start, idxs[i])); start = idxs[i]; }
  out.push(s.slice(start));
  return out;
}

// 兜底修复模型把整份大纲连排成一行的问题。不再依赖模型规范换行，而是用最可靠的锚点信号重建结构：
// ① 按"空格+破折号+空格"切（破折号认全 Unicode 变体，含隐形的 U+2010/U+2011）；
// ② 再把任何内部还嵌着 ≥2 个锚点的片段在锚点前硬切；
// ③ 按锚点重建父子：带锚点的段 = 一级条目，其后无锚点的段 = 它的子要点（缩进两格）。
export function normalizeRealtimeOutlineList(outline) {
  const src = String(outline || "");
  if (!src.trim()) return src;
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const rawLine of lines) {
    const line = rawLine;
    // 只处理"列表行"（以 - / * / • 开头，允许前导缩进）
    const m = line.match(/^(\s*)([-*•])\s+(.*)$/);
    if (!m) { out.push(line); continue; }
    const indent = m[1] || "";
    const body = m[3] || "";
    const anchorCount = (body.match(REALTIME_OUTLINE_ANCHOR_GLOBAL_RE) || []).length;
    const hasDash = REALTIME_OUTLINE_INLINE_SEP_RE.test(body);
    // 既没破折号分隔、锚点也不超过 1 个 → 不是连排，原样保留。
    if (!hasDash && anchorCount <= 1) { out.push(line); continue; }
    let parts = hasDash ? body.split(REALTIME_OUTLINE_INLINE_SEP_SPLIT_RE) : [body];
    parts = parts.flatMap(splitRealtimeOutlineAtEmbeddedAnchors).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) { out.push(line); continue; }
    if (indent) {
      // 子层里的连排：原样平铺到同一缩进（子项之间无需再分父子）。
      for (const part of parts) out.push(`${indent}- ${part}`);
      continue;
    }
    // 顶层连排：按锚点重建父子。带锚点的段开一个新一级条目，随后的无锚点段挂为它的子要点。
    let hasTopAnchorYet = false;
    for (const part of parts) {
      if (REALTIME_OUTLINE_ANCHOR_RE.test(part)) {
        out.push(`- ${part}`);
        hasTopAnchorYet = true;
      } else if (hasTopAnchorYet) {
        out.push(`  - ${part}`);
      } else {
        // 还没出现任何带锚点的一级条目，只能先平铺为顶层（后续显示规范化会处理无锚点项）。
        out.push(`- ${part}`);
      }
    }
  }
  return out.join("\n");
}

export function hashRealtimeOutlineText(text) {
  const src = String(text || "");
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function getRealtimeOutlineAnchorTime(anchor) {
  const match = String(anchor || "").match(/\|(\d{1,2}:\d{2}(?::\d{2})?)\]\]/);
  return match ? match[1] : "";
}

export function cleanRealtimeOutlineItemText(text, maxChars = 120) {
  let value = String(text || "")
    .replace(/\[\[[^\]]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/g, "")
    .replace(/^[\s\-*+>]+/, "")
    .replace(/^\d+[.)、．]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length > maxChars) value = value.slice(0, maxChars).trimEnd();
  return value;
}

// 去重归一键：在 cleanRealtimeOutlineItemText 之上再做"去所有空白 + 去常见标点 + 小写"，
// 得到一个稳定 key，用于"措辞微改（加标点/空格/大小写）即视为同一条"的宽松去重。
// 纯确定性、可 vitest；刻意不做编辑距离/语义相似（不确定、易把真正不同的话题误并）。
// 注意虚词差异（"商业化思路" vs "商业化的思路"）不归一——宁可偶尔重复，不误并。
export function realtimeOutlineDedupKey(text) {
  const cleaned = cleanRealtimeOutlineItemText(text, 200);
  return cleaned
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、；：！？,.;:!?（）()「」【】《》""''·…—\-]/gu, "");
}

export function makeRealtimeOutlineNode(anchor, title, children, index) {
  const safeAnchor = String(anchor || "").trim();
  const safeTitle = cleanRealtimeOutlineItemText(title, 90);
  if (!safeTitle) return null;
  const safeChildren = [];
  for (const child of (Array.isArray(children) ? children : [])) {
    const text = cleanRealtimeOutlineItemText(child, 120);
    if (text && !safeChildren.includes(text)) safeChildren.push(text);
    if (safeChildren.length >= REALTIME_OUTLINE_STATE_MAX_CHILDREN) break;
  }
  const idSeed = [safeAnchor, safeTitle, index || 0].join("|");
  return {
    id: `rt-${hashRealtimeOutlineText(idSeed)}`,
    anchor: safeAnchor,
    time: getRealtimeOutlineAnchorTime(safeAnchor),
    title: safeTitle,
    children: safeChildren,
  };
}

export function parseRealtimeOutlineStateFromMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const nodes = [];
  let current = null;
  for (const raw of lines) {
    const line = String(raw || "");
    const child = /^ {2,}[-*+]\s+(.+)$/.exec(line);
    if (child && current) {
      const text = cleanRealtimeOutlineItemText(child[1], 120);
      if (text && !current.children.includes(text) && current.children.length < REALTIME_OUTLINE_STATE_MAX_CHILDREN) {
        current.children.push(text);
      }
      continue;
    }
    const top = /^ {0,1}[-*+]\s+(.+)$/.exec(line);
    if (top) {
      const body = (top[1] || "").trim();
      const anchor = (body.match(/\[\[[^\]\n]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/) || [])[0] || "";
      const node = makeRealtimeOutlineNode(anchor, body, [], nodes.length);
      if (node) {
        nodes.push(node);
        current = node;
      } else {
        current = null;
      }
      continue;
    }
  }
  return nodes.slice(-REALTIME_OUTLINE_STATE_MAX_NODES);
}

// children 单调并集：只增不删、按 realtimeOutlineDedupKey 去重、existing 优先、截断 MAX_CHILDREN。
// 单调 = 模型某轮漏给的子要点不会删旧的；某轮给的脏/近义子要点最多多一条噪音、不顶替历史子要点。
// 代价（诚实）：早轮一条"错但独特"的子要点会被永久钉死（dedupKey 只挡近义、不挡内容错）——
// 但子项不进时间轴顶层、不可点击，污染面远小于顶层，净收益为正。
export function mergeOutlineChildrenMonotonic(existingChildren, freshChildren) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const text = cleanRealtimeOutlineItemText(raw, 120);
    if (!text) return;
    const key = realtimeOutlineDedupKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const c of (Array.isArray(existingChildren) ? existingChildren : [])) {
    if (out.length >= REALTIME_OUTLINE_STATE_MAX_CHILDREN) break;
    push(c);
  }
  for (const c of (Array.isArray(freshChildren) ? freshChildren : [])) {
    if (out.length >= REALTIME_OUTLINE_STATE_MAX_CHILDREN) break;
    push(c);
  }
  return out.slice(0, REALTIME_OUTLINE_STATE_MAX_CHILDREN);
}

// 冻结合并：把本轮新解析出的节点并入已有大纲状态，"历史冻结、只动末尾"。
// 目的——让大纲全部内容稳定存在、只在末尾增量生长：某一轮模型抽风最多影响"正在进行的最后一个话题 +
// 新话题"，永远碰不到已经定稿的历史话题（按锚点 / 标题识别去重）。这是实时大纲稳定性的根本保障。
// 升级（治"历史子要点补不全"）：不再只更新末尾节点——所有同锚点历史节点的 children 都做"单调并集合并"，
// 但 title/anchor/time 一律保留 existing（历史冻结、抗"A 被乱改"）。这样被新话题挤下末尾的历史话题，
// 后续轮仍能靠同锚点 fresh 补全子要点，大纲随会变厚而非停在稀薄；而 title/anchor 绝对不被模型本轮改写。
export function mergeStableRealtimeOutlineNodes(existingNodes, freshNodes) {
  const existing = (Array.isArray(existingNodes) ? existingNodes : []).filter(Boolean);
  const fresh = (Array.isArray(freshNodes) ? freshNodes : []).filter(Boolean);
  if (!existing.length) return fresh.slice(-REALTIME_OUTLINE_STATE_MAX_NODES);
  const freshByAnchor = new Map();
  for (const n of fresh) { if (n.anchor && !freshByAnchor.has(n.anchor)) freshByAnchor.set(n.anchor, n); }
  const existingAnchors = new Set(existing.map((n) => n.anchor).filter(Boolean));
  const existingTitles = new Set(existing.map((n) => realtimeOutlineDedupKey(n.title)).filter(Boolean));
  const result = [];
  for (let i = 0; i < existing.length; i++) {
    const node = existing[i];
    const freshMatch = node.anchor ? freshByAnchor.get(node.anchor) : null;
    if (freshMatch) {
      // children 单调并集；title/anchor/time 全取 existing —— 历史冻结，模型乱改 title 进不来。
      result.push(Object.assign({}, node, {
        children: mergeOutlineChildrenMonotonic(node.children, freshMatch.children),
      }));
    } else {
      result.push(node); // 无同锚点 fresh：原样保留（历史里已有的子要点也不丢）
    }
  }
  // 追加真正的新话题（锚点不在历史里；无锚点的按归一键去重，避免措辞微改即每轮重复累积）。
  const appendedAnchors = new Set();
  for (const node of fresh) {
    if (node.anchor) {
      if (existingAnchors.has(node.anchor) || appendedAnchors.has(node.anchor)) continue;
      appendedAnchors.add(node.anchor);
    } else {
      const t = realtimeOutlineDedupKey(node.title);
      if (t && existingTitles.has(t)) continue;
    }
    result.push(node);
  }
  return result.slice(-REALTIME_OUTLINE_STATE_MAX_NODES);
}

// opts.attachUntimed=true：把"首个带锚点 L1 之后"冒出的无锚点顶层行降级挂靠为上一带锚点节点的子项
// （治"延续讨论被整轮丢光"）。**只应在处理模型本轮 fresh 输出时开启**；处理 renderRealtimeOutlineStateMarkdown
// 产出的"已合并状态"时必须关闭（默认 false），否则会把状态里真实存在的无锚点历史顶层节点静默降级为子项、
// 改写历史结构。顶部（首个带锚点之前）的无锚点总览行无论如何仍丢弃（挂无可挂、会挤坏时间轴）。
export function normalizeOutlineMarkdownForDisplay(text, opts = {}) {
  const attachUntimed = !!(opts && opts.attachUntimed);
  const src = String(text || "").trim();
  if (!src) return "";
  const lines = src.split(/\r?\n/);
  const hasTimedTopLevel = lines.some((line) => {
    const m = /^ {0,3}[-*+]\s+(.+)$/.exec(String(line || ""));
    return !!(m && /\[\[[^\]]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/.test(m[1]));
  });
  if (!hasTimedTopLevel) return src;

  const out = [];
  let skipUntimedBlock = false;
  let afterTimedTopLevel = false;
  let seenTimedTop = false; // 是否已出现过至少一个带锚点 L1（区分"顶部总览该丢" vs "中段延续该挂"）
  const numberedPrefix = /^\s*\d+[.)、．]\s*/;

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    // 只把"几乎不缩进"（≤1 空格）的 bullet 当作顶层项。
    // 关键：子要点通常缩进 2 个及以上空格（`  - 子要点`），若这里用 {0,3} 容忍 3 空格，
    // 会把 2 空格的子要点误判成"顶层项"，再因其无时间锚点被整条丢弃——这正是
    // "大纲只剩光秃秃一级标题、子要点全没了"的真凶。收紧到 {0,1} 后，≥2 空格的子要点
    // 不再进入顶层丢弃逻辑，而是落到下方原样保留。
    const topBullet = /^( {0,1}[-*+]\s+)(.*)$/.exec(line);
    if (topBullet) {
      skipUntimedBlock = false;
      const body = topBullet[2] || "";
      const hasTime = /\[\[[^\]]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/.test(body);
      if (!hasTime) {
        // 首个带锚点 L1 之后冒出的无锚点顶层行 = 延续讨论。开启 attachUntimed 时降级挂靠为上一带锚点
        // 节点的子项（治"内容白丢"），挂靠后落到上一话题 children、被冻结合并保留；不开启则按旧逻辑丢。
        if (attachUntimed && seenTimedTop) {
          const childBody = body.replace(numberedPrefix, "").trim();
          if (childBody) { out.push("  - " + childBody); afterTimedTopLevel = false; continue; }
        }
        // 顶部（首个带锚点之前）的无锚点"课程结构 / 总览"类总结：不可点击、挂无可挂、会挤坏时间轴 → 丢弃。
        skipUntimedBlock = true;
        afterTimedTopLevel = false;
        continue;
      }
      const normalizedBody = body.replace(/(\]\])\s*\d+[.)、．]\s*/, "$1 ");
      out.push(topBullet[1] + normalizedBody);
      afterTimedTopLevel = true;
      seenTimedTop = true;
      continue;
    }

    if (skipUntimedBlock) {
      if (/^\s+/.test(line) || !line.trim()) continue;
      skipUntimedBlock = false;
    }

    if (afterTimedTopLevel && numberedPrefix.test(line)) {
      out.push("  - " + line.replace(numberedPrefix, "").trim());
      continue;
    }

    if (line.trim()) afterTimedTopLevel = false;
    out.push(line);
  }
  return out.join("\n").trim();
}

// 招聘需求挖掘（recruit-needs）会中覆盖态的"单调累积"合并。
// 覆盖是"截至目前是否谈到过某维"的累积事实——业务方不会"取消"已经谈过的东西。
// 规则：某维一旦达到 covered/partial，本轮即便没在转写里再次看到也绝不退回 missing；
// 仍允许 covered↔partial 双向调整（业务方改口澄清），只拦"退回 missing"。
// 注意：不再要求 prev 必须带 evidence_anchor 才冻结——旧的"有锚点才冻结"条件正是字段树
// "忽有忽无"的根：模型常省略锚点，导致已覆盖维度本轮被判 missing 时保不住、覆盖数闪回。
// freeze=false 时不冻结、本轮 fresh 完全为准（允许 covered/partial 退回 missing）——
// 用于"早期轮"(转写还很短、模型最易误判)，让早期误判的 covered 能自我纠正，不被永久锁死；
// 成熟轮(freeze=true)再启用单调累积防闪回。
export function mergeCoverageNoRegress(freshDims, prevDims, freeze = true) {
  const fresh = freshDims && typeof freshDims === "object" ? freshDims : {};
  const prev = prevDims && typeof prevDims === "object" ? prevDims : {};
  const out = {};
  for (const key of Object.keys(fresh)) {
    const f = fresh[key] || {};
    const p = prev[key] || null;
    if (freeze && f.status === "missing" && p && p.status && p.status !== "missing") {
      out[key] = p; // 整对象保留（含锚点 / 追问话术等），单调不回退
    } else {
      out[key] = f;
    }
  }
  return out;
}

// Phase 3 会中"追问建议"：从覆盖态 dims + 反馈压制 + 规则库，派生"已排序、已去重、已截断 K"的追问卡数组。
// 纯函数（无 DOM / Obsidian 依赖），便于 vitest 回归——排序/去重/反馈过滤是最易出 bug 又最该锁住的逻辑。
// opts: { rules:{[key]:{fallback,priority}}, dimOrder:[{key,name,group}], suppressed:Set|Array<key>, maxCards:number }
// 规则：跳过 covered/无效状态、跳过被反馈压制(suppressed)的维；
//   reason 取 missing_what，没有则用命中的模糊词拼一句，再没有则按状态给默认语；
//   question 取模型 followup_question，空则回落 rules[key].fallback；
//   排序纯按 priority 降序 → missing 先于 partial → dimOrder 原序。
//   vague_hits 只进 reason 文案、不参与排序——避免"刚说过模糊词的软维"抢占"硬维缺失"的有限名额。
export function deriveFollowupCards(dims, opts = {}) {
  const d = dims && typeof dims === "object" ? dims : {};
  const rules = opts.rules && typeof opts.rules === "object" ? opts.rules : {};
  const dimOrder = Array.isArray(opts.dimOrder) ? opts.dimOrder : [];
  const suppressed = opts.suppressed instanceof Set
    ? opts.suppressed
    : new Set(Array.isArray(opts.suppressed) ? opts.suppressed : []);
  const maxCards = Number.isFinite(opts.maxCards) ? Math.max(0, opts.maxCards) : 3;
  const statusRank = { missing: 0, partial: 1 };
  const cards = [];
  for (let i = 0; i < dimOrder.length; i++) {
    const meta = dimOrder[i] || {};
    const key = meta.key;
    if (!key || suppressed.has(key)) continue;
    const item = d[key] || {};
    const status = item.status === "partial" || item.status === "missing" ? item.status : null;
    if (!status) continue; // covered 或无效状态 → 不产卡
    const rule = rules[key] || {};
    const vagueHits = Array.isArray(item.vague_hits) ? item.vague_hits.filter(Boolean) : [];
    const missingWhat = (item.missing_what == null ? "" : String(item.missing_what)).trim();
    const reason = missingWhat
      || (vagueHits.length ? `提到「${vagueHits.join("、")}」但不够具体` : (status === "missing" ? "尚未谈到" : "提到但不够具体"));
    const question = ((item.followup_question == null ? "" : String(item.followup_question)).trim())
      || ((rule.fallback == null ? "" : String(rule.fallback)).trim());
    cards.push({
      key,
      name: meta.name || key,
      group: meta.group || "",
      status,
      reason,
      vagueHits,
      question,
      priority: Number.isFinite(rule.priority) ? rule.priority : 0,
      order: i,
    });
  }
  cards.sort((a, b) =>
    (b.priority - a.priority)
    || (statusRank[a.status] - statusRank[b.status])
    || (a.order - b.order)
  );
  return cards.slice(0, maxCards);
}

export function validateRealtimeOutlineMarkdown(outline, opts = {}) {
  const text = String(outline || "").trim();
  const previousOutline = String(opts.previousOutline || "").trim();
  if (!text) {
    return previousOutline ? { ok: false, reason: "empty_outline" } : { ok: true, reason: "" };
  }
  const lines = text.split(/\r?\n/);
  // 只统计真·顶层项（≤1 空格缩进）。子要点缩进 ≥2 空格，绝不能算成顶层——否则富大纲会被
  // "顶层项过多(>10)" 和 "无锚点占比过高(>0.35)" 误杀，导致大纲被丢弃、永远停在稀薄状态。
  const topBullets = [];
  for (const line of lines) {
    const m = /^ {0,1}[-*+]\s+(.+)$/.exec(String(line || ""));
    if (m) topBullets.push((m[1] || "").trim());
  }
  if (!topBullets.length) {
    return { ok: false, reason: "no_top_level_bullets" };
  }
  if (topBullets.length > 10) {
    return { ok: false, reason: "too_many_top_level_bullets" };
  }
  const timedTopBullets = topBullets.filter((body) => /\[\[[^\]]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/.test(body));
  const hasPreviousTimed = /\[\[[^\]]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/.test(previousOutline);
  if (hasPreviousTimed && timedTopBullets.length === 0) {
    return { ok: false, reason: "lost_all_time_anchors" };
  }
  const untimedRatio = topBullets.length ? (topBullets.length - timedTopBullets.length) / topBullets.length : 0;
  if (hasPreviousTimed && untimedRatio > 0.35) {
    return { ok: false, reason: "too_many_untimed_top_level_items" };
  }
  const suspiciousNumberedTitle = topBullets.find((body) => /\]\]\s*\d+[.)、．]/.test(body));
  if (suspiciousNumberedTitle) {
    return { ok: false, reason: "numbered_items_inline_in_title" };
  }
  return { ok: true, reason: "" };
}

export interface EntityEvidenceFinding {
  name: string;
  outputCount: number;
  transcriptCount: number;
}

// 人物指认幻觉的机械探测：找出"AI 产出里反复引用、但原始转写里几乎没出现"的具名实体。
// 背景：模型可能把转写里零星出现的称呼提升为贯穿全文的核心人物（如把只提到三次的"某外号"
// 指认为一号位），这类绑定用户难以察觉、最伤信任。本函数按字面子串计数做软探测——
// 转写错字会让真实人名计数偏低（如"李扣"被听写成"你扣"），所以结果只能作核对提示，绝不能自动删改。
export function findLowEvidenceEntities(
  names: string[],
  outputText: string,
  transcript: string,
  opts: { minOutputMentions?: number; maxTranscriptMentions?: number } = {},
): EntityEvidenceFinding[] {
  const minOut = opts.minOutputMentions ?? 3;
  const maxTr = opts.maxTranscriptMentions ?? 3;
  const out = String(outputText || "");
  const tr = String(transcript || "");
  const countIn = (hay: string, needle: string): number => (needle ? hay.split(needle).length - 1 : 0);
  const findings: EntityEvidenceFinding[] = [];
  const seen = new Set<string>();
  for (const raw of names || []) {
    const name = String(raw || "").trim();
    // 单字名子串误命中率太高（"扣"会命中"折扣"），不参与探测
    if (!name || name.length < 2 || seen.has(name)) continue;
    seen.add(name);
    const outputCount = countIn(out, name);
    const transcriptCount = countIn(tr, name);
    // 产出里成为高频实体（≥minOut 次）、转写里证据稀薄（≤maxTr 次）、且明显倒挂（产出 > 转写）才报
    if (outputCount >= minOut && transcriptCount <= maxTr && outputCount > transcriptCount) {
      findings.push({ name, outputCount, transcriptCount });
    }
  }
  return findings;
}

// ============================================================
// 招聘项目化（HR 模块）纯函数地基：JD 章节抽取 / 必要素质清单序列化 /
// 简历脱敏 / 项目名净化。无 obsidian / DOM / IO，便于 vitest 覆盖；F2/F3/F4.2/F5/F6 复用。
// ============================================================

// 从 markdown 正文里抽取某标题（如 "## 岗位描述"）下的一段：取该标题之后、
// 直到下一个"同级或更高级标题"或文件尾。找不到该标题返回 ""（回退策略由调用方决定）。
export function extractMarkdownSection(md, heading) {
  const text = String(md || "");
  const h = String(heading || "").trim();
  if (!h) return "";
  const headLevel = (h.match(/^#+/) || [""])[0].length || 0;
  const headBody = h.replace(/^#+\s*/, "").trim();
  if (!headLevel || !headBody) return "";
  const lines = text.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
    if (m && m[1].length === headLevel && m[2].trim() === headBody) { startIdx = i; break; }
  }
  if (startIdx < 0) return "";
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= headLevel) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

// 把 JD 的「综合素质」对象数组序列化成注入提示词的【必要素质清单】文本块。
// 每项形如 { 素质, 定义, 信号 }（兼容 name/definition/signal）。序号即"必要素质核验表"行号
// （提示词增 A 据此逐项产出）。无有效项返回 ""。
export function serializeRequiredQualities(qualities) {
  const list = Array.isArray(qualities) ? qualities : [];
  const clean = [];
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const name = String(q.素质 != null ? q.素质 : (q.name != null ? q.name : "")).trim();
    if (!name) continue;
    const def = String(q.定义 != null ? q.定义 : (q.definition != null ? q.definition : "")).trim();
    const signal = String(q.信号 != null ? q.信号 : (q.signal != null ? q.signal : "")).trim();
    clean.push({ name, def, signal });
  }
  if (!clean.length) return "";
  const lines = ["【必要素质清单】"];
  clean.forEach((q, i) => {
    let line = `${i + 1}. ${q.name}`;
    if (q.def) line += `：${q.def}`;
    if (q.signal) line += `（信号：${q.signal}）`;
    lines.push(line);
  });
  return lines.join("\n");
}

// 简历脱敏：手机号 / 身份证号 / 邮箱替换成占位符（仅作用于注入文本，原文件不动）。
// 顺序要点：先替身份证（18 位）再替手机号——否则身份证里出生年份段（如 "1990…"）会被
// 手机号正则先吃掉一截，导致身份证整体匹配不到而漏网；手机号再加数字边界，避免吃到长串数字的子段。
export function desensitizeResumeText(text) {
  return String(text || "")
    .replace(/\d{6}(?:19|20)\d{2}(?:0\d|1[0-2])(?:[0-2]\d|3[01])\d{3}[\dXx]/g, "[身份证]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[邮箱]");
}

// 项目（招聘岗位）文件夹名净化：替换 Windows/Obsidian 非法字符为短横，去首尾点和空白，空名兜底。
export function sanitizeProjectFolderName(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "")
    .trim();
  return cleaned || "未命名项目";
}

// ============================================================
// 报告改色（纯白弥散报告）：用 CSS filter:hue-rotate 把整篇按色相整体旋到用户选的颜色。
// 一次覆盖 hex / rgba / 渐变 / 弥散光晕；纯灰阶（白/黑/灰/近黑文字）几乎不受色相旋转影响。纯函数，便于单测。
// ============================================================

// 报告模板的基准强调色（暖橙）——用户所选颜色与它的色相差就是 hue-rotate 角度。
export const REPORT_BASE_ACCENT_HEX = "#E85F28";

// hex → 色相(0-360)。非法返回 null。3 位/6 位都认。
export function hexToHue(hex) {
  let h = String(hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0; // 灰阶，色相无意义
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return (hue + 360) % 360;
}

// 目标色相相对基准橙的最短旋转角（-180..180 的整数）。无法解析或同色相返回 0。
export function reportHueDelta(targetHex, baseHex = REPORT_BASE_ACCENT_HEX) {
  const base = hexToHue(baseHex || REPORT_BASE_ACCENT_HEX);
  const tgt = hexToHue(targetHex);
  if (base == null || tgt == null) return 0;
  let d = ((tgt - base) % 360 + 360) % 360;
  if (d > 180) d -= 360;     // 取最短方向，旋转量更小、色彩漂移更可控
  return Math.round(d);
}

// 把报告 HTML 整体改色：注入 body{filter:hue-rotate(Δdeg)}。Δ=0（同色相，如默认橙）原样返回。
export function recolorReportHtml(html, targetHex, baseHex = REPORT_BASE_ACCENT_HEX) {
  const s = String(html || "");
  if (!s) return s;
  const delta = reportHueDelta(targetHex, baseHex);
  if (!delta) return s;
  const style = `<style id="lexvoice-report-recolor">body{filter:hue-rotate(${delta}deg)}</style>`;
  return s.includes("</head>") ? s.replace("</head>", style + "</head>") : style + s;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

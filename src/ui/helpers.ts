/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { VIRTUAL_CABLE_PATTERNS } from '../shared/catalog-import';
import { normalizeKnowledgeExtractionHistory } from '../shared/util-knowledge';

export const LEXVOICE_UPDATE_REPO_URL = "https://github.com/Lynn-x/LexVoice";

export const LEXVOICE_UPDATE_BRANCH = "main";

export const LEXVOICE_UPDATE_PLUGIN_DIR = "";

export const LEXVOICE_UPDATE_RAW_BASE_URL = "";

export const SUPPORTED_AUDIO_INPUT_MODES = new Set(["mic", "mix-virtual", "virtualCable"]);

export function parseGithubRepoUrl(url) {
  const text = String(url || "").trim();
  const match = text.match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s#?]+)(?:[\/#?].*)?$/i)
    || text.match(/^git@github\.com:([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

export function trimSlashes(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

export function resolveUpdateRawBase(settings) {
  const rawBase = String(LEXVOICE_UPDATE_RAW_BASE_URL || "").trim().replace(/\/+$/g, "");
  if (rawBase) return rawBase;
  const repo = parseGithubRepoUrl(LEXVOICE_UPDATE_REPO_URL);
  if (!repo) return "";
  const branch = String(LEXVOICE_UPDATE_BRANCH || "main").trim() || "main";
  const subdir = trimSlashes(LEXVOICE_UPDATE_PLUGIN_DIR || "");
  return "https://raw.githubusercontent.com/" + repo.owner + "/" + repo.repo + "/" + branch + (subdir ? "/" + subdir : "");
}

export function resolveUpdateRawBases(settings) {
  const primary = resolveUpdateRawBase(settings);
  const out = [];
  const add = (url) => {
    const clean = String(url || "").trim().replace(/\/+$/g, "");
    if (clean && !out.includes(clean)) out.push(clean);
  };
  add(primary);
  if (String(LEXVOICE_UPDATE_RAW_BASE_URL || "").trim()) return out;

  const repo = parseGithubRepoUrl(LEXVOICE_UPDATE_REPO_URL);
  if (!repo) return out;
  const branch = String(LEXVOICE_UPDATE_BRANCH || "main").trim() || "main";
  const subdir = trimSlashes(LEXVOICE_UPDATE_PLUGIN_DIR || "");
  const suffix = repo.owner + "/" + repo.repo + "@" + branch + (subdir ? "/" + subdir : "");
  add("https://fastly.jsdelivr.net/gh/" + suffix);
  add("https://cdn.jsdelivr.net/gh/" + suffix);
  return out;
}

export function stripLexVoiceFrontmatterSimple(text) {
  return String(text || "").replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function stripArchivedDetailsBlocks(text) {
  let s = String(text || "");
  // \u53CD\u590D\u6D88\u6700\u5185\u5C42 details\uFF0C\u907F\u514D\u5D4C\u5957\uFF08"\u4E0A\u4E00\u7248\u7EAA\u8981" \u91CC\u5D4C\u53E6\u4E00\u4E2A "\u4E0A\u4E00\u7248\u7EAA\u8981"\uFF09\u6F0F\u5265
  for (let i = 0; i < 16; i++) {
    const next = s.replace(/<details\b[^>]*>(?:(?!<details\b)[\s\S])*?<\/details>/gi, "");
    if (next === s) break;
    s = next;
  }
  return s;
}

export function normalizeRecentNoteMeaningfulText(text) {
  return String(text || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/^#\s+.*$/gm, "")
    .replace(/^>\s*\[![^\]]+\].*$/gm, "")
    .replace(/^\s*(开始|时间|时长|模式|分段|模型|状态)[:：].*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function noteHasSuccessfulLlmBriefing(content) {
  const fullText = String(content || "");
  // 关键：先剥掉历史归档 <details>，只看当前可见正文。
  // 否则"重新整理"成功后，旧版本里的失败标记会让本函数永远 false → 警告永远不消。
  const text = stripArchivedDetailsBlocks(fullText);

  // 新格式（v3 之后）：## ✨ 当前纪要（…）
  const currentMatch = text.match(/(?:^|\n)##\s+✨\s+当前纪要[^\n]*\n+([\s\S]*?)(?:\n---|\n##\s|$)/);
  if (currentMatch) {
    const body = currentMatch[1] || "";
    const meaningful = normalizeRecentNoteMeaningfulText(body);
    if (meaningful.length > 60 && !/合并润色失败|AI 整理失败|_\[无输出\]_|_\[转写失败/.test(body)) return true;
  }

  const rawMatch = /\n##\s+📁\s+原始材料/.exec(text);
  if (rawMatch) {
    const beforeRaw = stripLexVoiceFrontmatterSimple(text.slice(0, rawMatch.index));
    const meaningful = normalizeRecentNoteMeaningfulText(beforeRaw);
    if (meaningful.length > 60 && !/合并润色失败|AI 整理失败|_\[无输出\]_/.test(beforeRaw)) return true;
  }

  const mergeMatch = text.match(/(?:^|\n)##\s+✨\s+整合版[^\n]*\n+([\s\S]*?)(?:\n---|\n##\s|$)/);
  if (mergeMatch) {
    const body = mergeMatch[1] || "";
    const meaningful = normalizeRecentNoteMeaningfulText(body);
    if (meaningful.length > 40 && !/合并润色失败|AI 整理失败|_\[无输出\]_/.test(body)) return true;
  }

  // frontmatter 兜底：状态已整理 且 *当前可见正文里* 没有失败标记
  return /(?:^|\n)(?:status:\s*(?:published|done|completed)|状态:\s*已整理)\s*$/im.test(fullText)
    && !/合并润色失败（已加入重试队列）|AI 整理失败/.test(text);
}

export function noteHasUsableRawTranscriptDespiteFailures(content) {
  const cleaned = String(content || "")
    .replace(/_\[转写失败(?:（已进入重试队列）)?：[^\]]*\]_/g, "")
    .replace(/_\[合并润色失败（已加入重试队列）：[^\]]*\]_/g, "")
    .replace(/_\[AI 整理失败：[^\]]*\]_/g, "")
    .replace(/_\[(?:此段暂无有效转写|此段无内容|无输出)\]_/g, "");
  const meaningful = normalizeRecentNoteMeaningfulText(stripLexVoiceFrontmatterSimple(cleaned));
  return meaningful.length > 160 && (/<!--\s*lexvoice-segments-start/.test(content) || /^###\s+段落\s+\d+/m.test(content));
}

export function getRecentNoteProcessingState(content) {
  const fullText = String(content || "");
  if (noteHasSuccessfulLlmBriefing(fullText)) return null;
  // 关键：失败标记的匹配同样要先剥掉 <details> 历史归档，
  // 避免旧版本里的 "_[合并润色失败...]_" 永久把当前纪要标成警告态。
  const visibleText = stripArchivedDetailsBlocks(fullText);
  if (/合并润色失败|AI 整理失败|转写失败|已进入重试队列|转写重试|Transcription failed|transcribe failed/i.test(visibleText)) {
    const hasMergeFailure = /合并润色失败|AI 整理失败/i.test(visibleText);
    if (noteHasUsableRawTranscriptDespiteFailures(visibleText)) {
      return {
        kind: "raw",
        label: hasMergeFailure ? "整理失败" : "待整理",
        title: hasMergeFailure
          ? "AI 整理失败；原始转写仍可重新整理生成最终纪要"
          : "原始转写里有失败片段，但已没有可重试任务；可以右键重新整理生成最终纪要",
      };
    }
    return {
      kind: "failed",
      label: "转写失败",
      title: "这篇纪要仍含有转写或整理失败标记",
    };
  }
  if (/<!--\s*lexvoice-segments-start/.test(visibleText) || /^###\s+段落\s+\d+/m.test(visibleText)) {
    return {
      kind: "raw",
      label: "待整理",
      title: "这篇纪要目前主要是原始分段转写，还没有 LLM 整理版",
    };
  }
  return null;
}

export function getLexVoiceImportMarkerState(content) {
  const text = String(content || "");
  return {
    hasSession: /<!--\s*lexvoice-session(?::|\s*--)/.test(text),
    hasSegments: /<!--\s*lexvoice-segments-start/.test(text) || /^###\s+段落\s+\d+/m.test(text),
    hasGeneratedBlock: /##\s+(?:✨\s*)?(?:当前纪要|整合版)/.test(text) || /##\s+(?:📁\s*)?原始材料/.test(text),
    hasImportBlock: /<details>\s*<summary>\s*导入文本信息/i.test(text),
  };
}

export function lexvoiceConfirm(app, title, body, ctaText = "确认") {
  return new Promise((resolve) => {
    const modal = new obsidian.Modal(app);
    let decided = false;
    const decide = (val) => { if (!decided) { decided = true; resolve(val); } modal.close(); };
    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.empty();
      contentEl.createEl("h3", { text: title });
      contentEl.createEl("p", { text: body });
      const actions = contentEl.createDiv({ cls: "modal-button-container" });
      const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
      const ok = actions.createEl("button", { text: ctaText, cls: "mod-warning", attr: { type: "button" } });
      cancel.onclick = () => decide(false);
      ok.onclick = () => decide(true);
    };
    modal.onClose = () => { if (!decided) { decided = true; resolve(false); } };
    modal.open();
  });
}

export function lexvoicePromptText(app, title, placeholder, initialValue) {
  return new Promise((resolve) => {
    const modal = new obsidian.Modal(app);
    let settled = false;
    const done = (value) => { if (settled) return; settled = true; resolve(value); modal.close(); };
    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.empty();
      contentEl.createEl("h3", { text: title || "输入" });
      const input = contentEl.createEl("input", { attr: { type: "text", placeholder: placeholder || "" } });
      input.setCssStyles({ width: "100%", marginBottom: "12px" });
      if (initialValue) input.value = String(initialValue);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); done(input.value); }
        else if (e.key === "Escape") { e.preventDefault(); done(null); }
      });
      const actions = contentEl.createDiv({ cls: "lexvoice-modal-actions" });
      const cancel = actions.createEl("button", { text: "取消" });
      cancel.onclick = () => done(null);
      const ok = actions.createEl("button", { text: "确定", cls: "mod-cta" });
      ok.onclick = () => done(input.value);
      window.setTimeout(() => input.focus(), 30);
    };
    modal.onClose = () => { if (!settled) { settled = true; resolve(null); } };
    modal.open();
  });
}

export function openLexVoicePickListModal(app, title, items, onPick) {
  const modal = new obsidian.Modal(app);
  modal.onOpen = () => {
    const { contentEl } = modal;
    contentEl.empty();
    contentEl.createEl("h3", { text: title });
    const search = contentEl.createEl("input", { cls: "lexvoice-pick-search", attr: { type: "text", placeholder: "搜索…" } });
    const listEl = contentEl.createDiv({ cls: "lexvoice-pick-list" });
    const render = (filter) => {
      listEl.empty();
      const f = String(filter || "").toLowerCase();
      const shown = items.filter(x => !f || x.toLowerCase().includes(f)).slice(0, 300);
      if (!shown.length) { listEl.createDiv({ cls: "lexvoice-pick-empty", text: "无匹配项" }); return; }
      for (const id of shown) {
        const row = listEl.createEl("button", { cls: "lexvoice-pick-item", text: id, attr: { type: "button" } });
        row.onclick = () => { modal.close(); onPick(id); };
      }
    };
    render("");
    search.addEventListener("input", () => render(search.value));
    window.setTimeout(() => search.focus(), 30);
  };
  modal.open();
}

export function openLexVoiceExternalUrl(url) {
  // 桌面端优先走 Electron shell.openExternal —— 强制用系统默认浏览器，
  // 避免在 Obsidian 内嵌 webview 打开外部链接。
  try {
    const electron = require("electron");
    if (electron && electron.shell && typeof electron.shell.openExternal === "function") {
      electron.shell.openExternal(url);
      return;
    }
  } catch {}
  try { window.open(url, "_blank"); } catch (e) { console.warn("[LexVoice] open url failed", e); }
}

export async function enumerateAudioDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return { all: [], mics: [], virtualCables: [], outputs: [], permissionRequired: true };
  }
  // 设备 label 在未授权时为空。先试一次 getUserMedia 拿权限。
  let permissionRequired = false;
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch {
    permissionRequired = true;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = [], virtualCables = [], outputs = [];
  for (const d of devices) {
    if (d.kind === "audioinput") {
      if (isVirtualCableLabel(d.label)) virtualCables.push(d);
      else mics.push(d);
    } else if (d.kind === "audiooutput") {
      outputs.push(d);
    }
  }
  return { all: devices, mics, virtualCables, outputs, permissionRequired };
}

export function isVirtualCableLabel(label) {
  if (!label) return false;
  return VIRTUAL_CABLE_PATTERNS.some((p) => p.test(label));
}

export async function trashLexVoiceFile(app, file) {
  if (app.vault && typeof app.vault.trash === "function") {
    await app.vault.trash(file, true);
  } else {
    await app.fileManager.trashFile(file);
  }
}

export function pluginBasePath(plugin) {
  const configDir = plugin.app.vault.configDir || ".obsidian";
  const dir = plugin && plugin.manifest && plugin.manifest.dir
    ? String(plugin.manifest.dir)
    : String(plugin.manifest.id || "");
  const normalizedDir = obsidian.normalizePath(dir);
  const pluginRoot = obsidian.normalizePath(configDir + "/plugins");
  if (normalizedDir.startsWith(pluginRoot + "/")) return normalizedDir;
  if (normalizedDir.startsWith(".obsidian/plugins/")) return normalizedDir;
  return obsidian.normalizePath(pluginRoot + "/" + normalizedDir);
}

export function normalizeAudioInputMode(mode) {
  if (mode === "mix") return "mix-virtual";
  if (mode === "system") return "virtualCable";
  return SUPPORTED_AUDIO_INPUT_MODES.has(mode) ? mode : "mic";
}

export function audioInputModeLabel(mode) {
  const labels = {
    mic: "仅麦克风",
    "mix-virtual": "麦克风 + 电脑音频",
    virtualCable: "仅电脑音频",
  };
  return labels[normalizeAudioInputMode(mode)] || labels.mic;
}

export function classifyImportTextFileForModal(file, content) {
  const text = String(content || "");
  const marker = getLexVoiceImportMarkerState(text);
  const hasLexVoiceSignal = marker.hasSession || marker.hasSegments || marker.hasGeneratedBlock || marker.hasImportBlock;
  if (!hasLexVoiceSignal) {
    return {
      category: "external",
      badge: file && String(file.extension || "").toLowerCase() === "txt" ? "TXT" : "外部稿",
      reason: "普通文本",
      statusTitle: "非 LexVoice 转写，可作为速录稿直接整理",
    };
  }

  const processingState = getRecentNoteProcessingState(text);
  const successful = noteHasSuccessfulLlmBriefing(text);
  if (successful && !processingState) {
    return {
      category: "lexvoice-normal",
      badge: "已整理",
      reason: "可合并 / 换模板",
      statusTitle: "LexVoice 已整理纪要，可用于多篇合并、换模板重整或转成其他模式",
    };
  }

  const label = processingState && processingState.label
    ? processingState.label
    : (marker.hasSegments ? "待整理" : "碎片稿");
  return {
    category: "lexvoice-repair",
    badge: label,
    reason: processingState && processingState.title ? processingState.title : "检测到 LexVoice 标记，但没有稳定的整理正文",
    statusTitle: processingState && processingState.title ? processingState.title : "适合重新整理或补救失败转写",
  };
}

export function makeImportTextCheckboxId(path, index) {
  const source = String(path || "");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `lv-import-text-${Math.max(0, Number(index) || 0)}-${(hash >>> 0).toString(36)}`;
}

export function countKnowledgeExtractionHistory(settings, kind) {
  const history = normalizeKnowledgeExtractionHistory(settings && settings.knowledgeExtractionHistory);
  return Object.keys((history && history[kind]) || {}).length;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

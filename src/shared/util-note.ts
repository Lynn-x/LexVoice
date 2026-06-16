/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { sanitizeFilename } from './util-common';
import { escapeYamlScalar } from './util-markdown';
import { isPrivateNetworkHost } from './util-llm-endpoint';

export function getFrontmatterTags(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object") return [];
  const raw = frontmatter.tags || frontmatter.tag;
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
  return String(raw || "")
    .split(/[,\s]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

export async function readFileFrontmatter(plugin, file) {
  try {
    const cache = plugin.app.metadataCache.getFileCache(file);
    if (cache && cache.frontmatter) return cache.frontmatter;
  } catch {}
  try {
    const content = await plugin.app.vault.cachedRead(file);
    const m = String(content || "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return null;
    return obsidian.parseYaml(m[1]);
  } catch {
    return null;
  }
}

export function upsertFrontmatterInMarkdown(markdown, frontmatter) {
  const yaml = obsidian.stringifyYaml(frontmatter || {});
  const text = String(markdown || "");
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) return "---\n" + yaml + "---\n\n" + text.slice(match[0].length).replace(/^\n+/, "");
  return "---\n" + yaml + "---\n\n" + text;
}

export const LEARNING_CARD_TAG = "lexvoice/learning-card";

export const CONCEPT_CARD_TAG = "lexvoice/concept";

export const TODO_CARD_TAG = "lexvoice/todo-card";

export async function upsertLexVoiceObjectNote(plugin, folder, name, content) {
  await plugin.ensureFolder(folder);
  const path = obsidian.normalizePath(`${folder}/${sanitizeFilename(name) || "未命名"}.md`);
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (file instanceof obsidian.TFile) {
    const previousContent = await plugin.app.vault.read(file);
    await plugin.app.vault.modify(file, content);
    return { file, path: file.path, created: false, previousContent };
  }
  const target = plugin.getAvailableVaultPath(path);
  if (!target) throw new Error("无法生成可用的对象文件路径");
  const createdFile = await plugin.app.vault.create(target, content);
  return { file: createdFile, path: createdFile.path, created: true, previousContent: "" };
}

export function getTodayDailyNoteInfo(app) {
  const internal = app && app.internalPlugins;
  const plugin = internal && (
    (typeof internal.getPluginById === "function" && internal.getPluginById("daily-notes"))
    || (internal.plugins && internal.plugins["daily-notes"])
  );
  if (!plugin || plugin.enabled === false) return null;
  const instance = plugin.instance || plugin._loadedPlugin || plugin.plugin || null;
  const options = Object.assign({}, plugin.options || {}, (instance && instance.options) || {});
  const format = options.format || "YYYY-MM-DD";
  let folder = obsidian.normalizePath(String(options.folder || "").trim()).replace(/\/$/, "");
  if (folder === "." || folder === "/") folder = "";
  const templateRaw = String(options.template || "").trim();
  const template = templateRaw ? obsidian.normalizePath(templateRaw).replace(/\.md$/i, "") + ".md" : "";
  const moment = window.moment;
  if (!moment) return null;
  const name = moment().format(format);
  const fileName = /\.md$/i.test(name) ? name : `${name}.md`;
  const dailyPath = obsidian.normalizePath(folder ? `${folder}/${fileName}` : fileName);
  const file = app.vault.getAbstractFileByPath(dailyPath);
  return { path: dailyPath, folder, template, file: file instanceof obsidian.TFile ? file : null };
}

export async function ensureVaultFolder(app, folderPath) {
  const norm = obsidian.normalizePath(String(folderPath || "").trim());
  if (!norm || norm === "." || norm === "/") return;
  const parts = norm.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(cur);
    if (!existing) {
      try { await app.vault.createFolder(cur); } catch {}
    }
  }
}

export async function ensureTodayDailyNoteFile(app) {
  const info = getTodayDailyNoteInfo(app);
  if (!info) return null;
  if (info.file) return info.file;
  const parentFolder = info.path.split("/").slice(0, -1).join("/");
  await ensureVaultFolder(app, parentFolder);
  let initial = "";
  if (info.template) {
    const tplFile = app.vault.getAbstractFileByPath(info.template);
    if (tplFile instanceof obsidian.TFile) {
      try {
        const tplBody = await app.vault.read(tplFile);
        const moment = window.moment;
        initial = String(tplBody || "")
          .replace(/\{\{\s*date\s*(?::([^}]+))?\}\}/g, (_, fmt) => moment().format(fmt || "YYYY-MM-DD"))
          .replace(/\{\{\s*time\s*(?::([^}]+))?\}\}/g, (_, fmt) => moment().format(fmt || "HH:mm"))
          .replace(/\{\{\s*title\s*\}\}/g, info.path.split("/").pop().replace(/\.md$/, ""));
      } catch {}
    }
  }
  try {
    return await app.vault.create(info.path, initial);
  } catch (e) {
    const existing = app.vault.getAbstractFileByPath(info.path);
    return existing instanceof obsidian.TFile ? existing : null;
  }
}

export function isLocalServiceEndpoint(endpoint) {
  try {
    const host = new URL(String(endpoint || "")).hostname.toLowerCase();
    return isPrivateNetworkHost(host);
  } catch {
    return false;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

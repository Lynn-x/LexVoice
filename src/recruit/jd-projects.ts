/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";

export function listJDProjects(app, jdFolderPath) {
  const root = app.vault.getAbstractFileByPath(obsidian.normalizePath(jdFolderPath || "JD"));
  if (!(root instanceof obsidian.TFolder)) return [];
  const out = [];
  for (const child of (root.children || [])) {
    if (!(child instanceof obsidian.TFolder)) continue;
    const jdFile = (child.children || []).find(f => f instanceof obsidian.TFile && f.extension === "md" && f.basename === child.name) || null;
    const fm = jdFile ? ((app.metadataCache.getFileCache(jdFile) || {}).frontmatter || {}) : {};
    out.push({
      folderPath: child.path,
      name: child.name,
      jdFilePath: jdFile ? jdFile.path : "",
      hasJd: !!jdFile,
      status: jdFile ? String(fm.状态 || "招聘中").trim() : "缺 JD 文件",
      position: String((jdFile && (fm.职位名 || fm.职位)) || child.name).trim(),
      sequence: jdFile ? String(fm.序列 || "").trim() : "",
      interviewed: Number(fm.已面试数) || 0,
    });
  }
  const rank = (s) => s === "招聘中" ? 0 : (s === "缺 JD 文件" ? 2 : 1);
  out.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "zh-CN"));
  return out;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

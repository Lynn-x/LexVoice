/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck — Modal/Widget class 密集（this.plugin.* 等无 TS 字段声明）；已用 tsc 确认无漏引用(TS2304=0)，余者皆类字段类型噪音，故与 main.ts 同档跳过。
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { loadPeopleDirectory, normalizePeopleSuggestion } from '../people';
import { diagnosticError } from '../shared/util-key-diag';
import { classifyImportTextFileForModal, enumerateAudioDevices, lexvoiceConfirm, makeImportTextCheckboxId } from './helpers';
import { formatElapsed, pad } from '../shared/util-common';
import { desensitizeResumeText } from '../outline-text';
import { applyRecruitJdLibraryItem, createRecruitProject, extractPdfTextBestEffort, getRecruitContextCopy, getRecruitInterviewOutline, getRecruitJdLibrary, getRecruitJdPreview, isRecruitFeatureUnlocked, listResumePdfs, normalizeRecruitContext, parseJdProject, upsertRecruitJdLibrary } from '../recruit';
import { AUDIO_EXT, IMPORT_TEXT_CATEGORY_CONFIG, IMPORT_TEXT_CATEGORY_ORDER, TEXT_IMPORT_EXT } from '../shared/catalog-import';
import { callLlm } from '../llm/core';
import { mimeFromExt } from '../shared/util-audio';
import { listJDProjects } from '../recruit/jd-projects';
import { getBuiltInVisiblePolishModeKeys, getCustomPromptModeTemplates, getEffectivePolishMode, getModeMeta, getVisibleModeEntries, isCustomPromptModeTemplate, makeCustomPromptModeId, sanitizePromptTemplate, setLexVoiceModePillIcon } from '../shared/mode-meta';

export function pickReportAccentColor(app, defaultHex) {
  return new Promise((resolve) => {
    const modal = new obsidian.Modal(app);
    modal.titleEl.setText("选择报告配色");
    let chosen = defaultHex || "#E85F28";
    let settled = false;
    const finish = (val) => { if (settled) return; settled = true; resolve(val); try { modal.close(); } catch {} };
    const wrap = modal.contentEl.createDiv({ cls: "lexvoice-color-pick" });
    wrap.createEl("p", { cls: "lexvoice-color-hint", text: "报告按所选色相整体重新着色，纯白弥散风格不变。可多次生成不同配色（文件名自动加序号，不覆盖旧的）。" });
    const sw = wrap.createDiv({ cls: "lexvoice-color-swatches" });
    const presets = [["暖橙（默认）", "#E85F28"], ["宝石蓝", "#2F6BD8"], ["青墨", "#138A8A"], ["松绿", "#3B9A4B"], ["藕紫", "#7A4AD8"], ["玫红", "#D8407E"], ["棕金", "#B5811A"], ["石墨蓝", "#54627A"]];
    const swatchEls = [];
    let customInput;
    const select = (hex) => {
      chosen = hex;
      if (customInput) customInput.value = hex;
      for (const [el, h] of swatchEls) el.toggleClass("is-active", h.toLowerCase() === hex.toLowerCase());
    };
    for (const [name, hex] of presets) {
      const el = sw.createDiv({ cls: "lexvoice-color-swatch" });
      el.style.backgroundColor = hex;
      el.setAttr("aria-label", name);
      el.setAttr("title", name);
      el.onclick = () => select(hex);
      swatchEls.push([el, hex]);
    }
    const crow = wrap.createDiv({ cls: "lexvoice-color-custom" });
    crow.createEl("label", { text: "自定义" });
    customInput = crow.createEl("input");
    customInput.type = "color";
    customInput.value = chosen;
    customInput.oninput = () => select(customInput.value);
    const actions = wrap.createDiv({ cls: "lexvoice-color-actions" });
    actions.createEl("button", { text: "生成报告", cls: "mod-cta" }).onclick = () => finish(chosen);
    actions.createEl("button", { text: "取消" }).onclick = () => finish(null);
    modal.onClose = () => finish(null);
    select(chosen);
    modal.open();
  });
}

export class AudioTimeModal extends obsidian.Modal {
  constructor(app, file, startMs, label) {
    super(app);
    this.file = file;
    this.startMs = Math.max(0, Number(startMs) || 0);
    this.label = label || formatElapsed(this.startMs);
    this.objectUrl = "";
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-audio-modal");
    contentEl.createEl("h3", { text: "LexVoice 回听" });
    contentEl.createDiv({ cls: "lexvoice-audio-modal-meta", text: `${this.file.path} · ${this.label}` });

    const playerWrap = contentEl.createDiv({ cls: "lexvoice-audio-player-wrap" });
    const audio = playerWrap.createEl("audio", { attr: { controls: "true" } });
    audio.preload = "metadata";

    try {
      const ab = await this.app.vault.readBinary(this.file);
      const blob = new Blob([ab], { type: mimeFromExt(this.file.extension) });
      this.objectUrl = URL.createObjectURL(blob);
      audio.src = this.objectUrl;
      audio.addEventListener("loadedmetadata", () => {
        try {
          const target = Math.max(0, Math.min(audio.duration || 0, this.startMs / 1000));
          audio.currentTime = target;
          audio.play().catch(() => {});
        } catch {}
      });
    } catch (e) {
      console.error("[LexVoice] audio time modal failed", e);
      contentEl.createDiv({ cls: "lexvoice-audio-modal-error", text: `无法读取音频：${(e && e.message) || e}` });
    }

    const actions = contentEl.createDiv({ cls: "lexvoice-audio-modal-actions" });
    actions.createEl("button", { text: "打开音频文件" }).onclick = () => {
      this.app.workspace.getLeaf(false).openFile(this.file);
    };
  }

  onClose() {
    this.contentEl.empty();
    if (this.objectUrl) {
      try { URL.revokeObjectURL(this.objectUrl); } catch {}
      this.objectUrl = "";
    }
  }
}

export class PeopleHotwordsConsentModal extends obsidian.Modal {
  constructor(app, onDone) {
    super(app);
    this.onDone = onDone;
    this.confirmed = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-consent-modal");
    contentEl.createEl("h2", { text: "启用人名热词前请确认" });
    contentEl.createDiv({
      cls: "setting-item-description",
      text: "启用后，LexVoice 会从人员资料读取姓名和常用称呼，并把这些人名热词随转写或 AI 整理请求发送到当前配置的转写服务和大模型服务，用于提升人名识别和称呼对齐准确率。",
    });
    const list = contentEl.createEl("ul", { cls: "lexvoice-consent-list" });
    list.createEl("li", { text: "只发送姓名与常用称呼，不发送角色、组织、备注、来源或人员关系。" });
    list.createEl("li", { text: "如果 ASR 或 LLM 是云端服务，这些姓名与称呼会离开本地设备，受对应服务商的数据政策约束。" });
    list.createEl("li", { text: "录音内容本身若包含人名，使用云端 ASR 时仍会被云端服务处理；本开关控制的是额外发送的人员资料热词。" });
    list.createEl("li", { text: "此授权会保存在本地设置中，直到用户撤销授权或切回隐私优先。" });
    list.createEl("li", { text: "涉密、隐私、客户资料、医疗、法务、人事等内容，建议使用「隐私优先」或「本地增强」。" });
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => this.close();
    const okBtn = actions.createEl("button", { text: "我已知情，启用人名热词" });
    okBtn.addClass("mod-cta");
    okBtn.onclick = () => {
      this.confirmed = true;
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
    if (typeof this.onDone === "function") this.onDone(!!this.confirmed);
  }
}

export class PeopleDirectorySuggestionModal extends obsidian.Modal {
  constructor(app, plugin, sourceFile, suggestions, options = {}) {
    super(app);
    this.plugin = plugin;
    this.sourceFile = sourceFile;
    this.options = options || {};
    const defaultSelected = this.options.fromIgnored ? false : true;
    this.suggestions = (suggestions || []).map(item => Object.assign({ selected: defaultSelected }, item, {
      matchPath: (item.match && item.match.path) || item.matchPath || "",
    }));
    this.rows = [];
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "AI 辅助补全人员资料" });
    contentEl.createDiv({
      cls: "setting-item-description",
      text: this.sourceFile
        ? "LexVoice 只会发送当前笔记内容到已配置的大模型，用于生成候选人员建议；已有人员资料仅在本地用于匹配和去重，不随请求发送。保存前需要确认姓名、称呼、角色和组织关系是否准确。"
        : this.options.fromIgnored
          ? `这里是已忽略的 ${this.options.ignoredCount || this.suggestions.length} 条人员建议。误操作的建议可以先恢复到待确认，也可以直接修改后保存进人员资料；保存后会自动移出忽略列表。`
        : this.options.fromCache
          ? `这里是上次扫描后尚未处理的 ${this.options.cachedCount || this.suggestions.length} 条人员建议。保存、忽略或清空前，它们会保留在本地设置中，方便稍后继续处理。`
        : `LexVoice 已扫描转写纪要库中的 ${this.options.scannedCount || 0} 篇笔记，只显示需要确认的人员建议。已有人员资料仅在本地用于匹配和去重，不随请求发送。${this.options.remainingCount ? `本轮后仍有 ${this.options.remainingCount} 篇待扫描。` : ""}`,
    });
    contentEl.createDiv({
      cls: "setting-item-description lexvoice-people-suggestion-guide",
      text: "如果这位人员已经在人员库里，请先在每条建议的“保存到人员资料”里选择对应人员笔记；下方字段只是本次要补充进去的信息，不需要手动改名来合并。",
    });
    let peopleEntries = [];
    try {
      peopleEntries = await loadPeopleDirectory(this.plugin);
    } catch (e) {
      console.warn("[LexVoice] load people directory for suggestion modal failed", e);
    }
    const peopleByPath = new Map((peopleEntries || []).map(person => [obsidian.normalizePath(person.path || ""), person]));
    const getPathBasename = (path) => String(path || "").split("/").pop().replace(/\.md$/i, "");
    const getPersonOptionLabel = (person) => {
      const main = String((person && person.name) || getPathBasename(person && person.path) || "未命名人员").trim();
      const parts = [
        main,
        person && person.role,
        person && person.organization,
      ].map(value => String(value || "").trim()).filter(Boolean);
      return parts.join(" · ");
    };
    const getPersonHint = (person) => {
      if (!person) return "";
      const aliases = (person.aliases || []).filter(Boolean).slice(0, 4).join("、");
      return [
        person.role ? `角色：${person.role}` : "",
        person.organization ? `组织：${person.organization}` : "",
        aliases ? `常用称呼：${aliases}` : "",
      ].filter(Boolean).join(" · ");
    };

    const list = contentEl.createDiv({ cls: "lexvoice-people-suggestion-list" });
    this.rows = [];
    for (const item of this.suggestions) {
      const box = list.createDiv({ cls: "lexvoice-people-suggestion-card" });
      const top = box.createDiv({ cls: "lexvoice-people-suggestion-top" });
      const checkbox = top.createEl("input", { type: "checkbox" });
      checkbox.checked = item.selected !== false;
      const badge = top.createSpan({ text: this.options.fromIgnored ? "已忽略" : (item.matchPath ? "更新已有人员" : "新建人员"), cls: "lexvoice-people-suggestion-badge" });
      top.createSpan({ text: `置信度：${item.confidence || "中"}`, cls: "setting-item-description" });
      const matchMeta = top.createSpan({ text: item.matchPath ? ` · ${item.matchPath}` : "", cls: "setting-item-description" });
      if (!this.sourceFile && item.sourceBasename) top.createSpan({ text: ` · 来源：${item.sourceBasename}`, cls: "setting-item-description" });
      let rowRef = null;
      const ignoreBtn = top.createEl("button", { text: this.options.fromIgnored ? "恢复待确认" : "忽略" });
      ignoreBtn.addClass("lexvoice-people-suggestion-ignore");
      if (this.options.fromIgnored) {
        ignoreBtn.onclick = async () => {
          try {
            const removed = await this.plugin.restoreIgnoredPeopleDirectorySuggestion(item);
            if (!removed) {
              new obsidian.Notice("这条建议暂时无法恢复");
              return;
            }
            this.rows = this.rows.filter(row => row !== rowRef);
            box.remove();
            new obsidian.Notice(`已恢复到待确认：${item.name || "这条建议"}`);
          } catch (e) {
            console.error("[LexVoice] restore ignored people suggestion failed", e);
            new obsidian.Notice(`恢复失败：${(e && e.message) || e}`, 8000);
          }
        };
      } else {
        ignoreBtn.onclick = async () => {
          try {
            const ok = await this.plugin.ignorePeopleDirectorySuggestion(item);
            if (!ok) {
              new obsidian.Notice("这条建议暂时无法忽略");
              return;
            }
            this.rows = this.rows.filter(row => row !== rowRef);
            box.remove();
            new obsidian.Notice(`已忽略：${item.name || "这条建议"}`);
          } catch (e) {
            console.error("[LexVoice] ignore people suggestion failed", e);
            new obsidian.Notice(`忽略失败：${(e && e.message) || e}`, 8000);
          }
        };
      }

      const targetBox = box.createDiv({ cls: "lexvoice-people-suggestion-target" });
      const targetLabel = targetBox.createDiv({ cls: "lexvoice-people-suggestion-target-label", text: "保存到人员资料" });
      const targetSelect = targetBox.createEl("select", { cls: "dropdown lexvoice-people-suggestion-target-select" });
      targetSelect.createEl("option", { value: "", text: "新建人员资料" });
      const currentPath = obsidian.normalizePath(item.matchPath || "");
      if (currentPath && !peopleByPath.has(currentPath)) {
        targetSelect.createEl("option", { value: currentPath, text: `${getPathBasename(currentPath)}（当前匹配）` });
      }
      for (const person of peopleEntries || []) {
        const path = obsidian.normalizePath(person.path || "");
        if (!path) continue;
        targetSelect.createEl("option", { value: path, text: getPersonOptionLabel(person) });
      }
      targetSelect.value = currentPath || "";
      const targetHint = targetBox.createDiv({ cls: "lexvoice-people-suggestion-target-hint" });
      const updateTargetUi = () => {
        const path = obsidian.normalizePath(targetSelect.value || "");
        item.matchPath = path;
        if (rowRef) rowRef.item.matchPath = path;
        const person = path ? peopleByPath.get(path) : null;
        if (this.options.fromIgnored) badge.setText(path ? "已忽略 · 保存到已有人员" : "已忽略 · 新建");
        else badge.setText(path ? "保存到已有人员" : "新建人员");
        matchMeta.setText(path ? ` · ${path}` : "");
        if (path && person) {
          targetHint.setText(getPersonHint(person) || "将把本条建议补充到选中的人员笔记。");
        } else if (path) {
          targetHint.setText("将把本条建议补充到当前匹配的人员笔记。");
        } else {
          targetHint.setText("将使用候选姓名新建一份人员资料。");
        }
      };
      targetSelect.addEventListener("change", updateTargetUi);
      updateTargetUi();

      let nameInput;
      let aliasInput;
      let roleInput;
      let orgInput;
      new obsidian.Setting(box).setName("姓名")
        .addText(t => { nameInput = t; t.setValue(item.name || ""); });
      new obsidian.Setting(box).setName("常用称呼")
        .setDesc("多个称呼用逗号或顿号分隔。")
        .addText(t => { aliasInput = t; t.setValue((item.aliases || []).join("、")); });
      new obsidian.Setting(box).setName("角色")
        .addText(t => { roleInput = t; t.setValue(item.role || ""); });
      new obsidian.Setting(box).setName("组织")
        .addText(t => { orgInput = t; t.setValue(item.organization || ""); });
      const noteArea = box.createEl("textarea", {
        cls: "lexvoice-people-suggestion-note",
        text: item.note || "",
      });
      noteArea.placeholder = "备注";
      if (item.evidence && item.evidence.length) {
        box.createDiv({
          cls: "setting-item-description",
          text: "依据：" + item.evidence.slice(0, 3).join("；"),
        });
      }
      rowRef = { item, checkbox, nameInput, aliasInput, roleInput, orgInput, noteArea };
      this.rows.push(rowRef);
    }

    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => this.close();
    const openBtn = actions.createEl("button", { text: "打开人员资料" });
    openBtn.onclick = async () => {
      try {
        const file = await this.plugin.ensurePeopleDirectoryFiles({ overwrite: false });
        if (file instanceof obsidian.TFile) await this.plugin.app.workspace.getLeaf(false).openFile(file);
      } catch (e) {
        new obsidian.Notice(`打开人员资料失败：${(e && e.message) || e}`);
      }
    };
    const saveBtn = actions.createEl("button", { text: "保存选中" });
    saveBtn.addClass("mod-cta");
    saveBtn.onclick = async () => {
      const selected = this.rows
        .filter(row => row.checkbox.checked)
        .map(row => {
          const name = row.nameInput.getValue().trim();
          const normalized = normalizePeopleSuggestion({
            name,
            aliases: row.aliasInput.getValue(),
            role: row.roleInput.getValue(),
            organization: row.orgInput.getValue(),
            note: row.noteArea.value,
            confidence: row.item.confidence || "中",
            evidence: row.item.evidence || [],
          });
          if (normalized) normalized.matchPath = row.item.matchPath || "";
          if (normalized) {
            normalized.sourcePath = row.item.sourcePath || "";
            normalized.sourceBasename = row.item.sourceBasename || "";
            normalized.cacheKey = row.item.cacheKey || "";
            normalized.ignoreKey = row.item.ignoreKey || "";
            normalized.ignoreTerms = row.item.ignoreTerms || [];
          }
          return normalized;
        })
        .filter(Boolean);
      if (!selected.length) {
        new obsidian.Notice("没有选择要保存的人员建议");
        return;
      }
      try {
        const grouped = new Map();
        for (const item of selected) {
          const sourcePath = item.sourcePath || (this.sourceFile && this.sourceFile.path) || "";
          if (!grouped.has(sourcePath)) grouped.set(sourcePath, []);
          grouped.get(sourcePath).push(item);
        }
        let created = 0;
        let updated = 0;
        for (const [sourcePath, items] of grouped.entries()) {
          const file = sourcePath ? this.plugin.app.vault.getAbstractFileByPath(sourcePath) : this.sourceFile;
          const result = await this.plugin.applyPeopleDirectorySuggestions(file instanceof obsidian.TFile ? file : null, items);
          created += result.created;
          updated += result.updated;
          if (file instanceof obsidian.TFile) this.plugin.markKnowledgeExtractionSource("people", file);
        }
        if (this.options.fromIgnored) this.plugin.removePeopleDirectorySuggestionIgnores(selected);
        else this.plugin.removeCachedPeopleSuggestions(selected);
        await this.plugin.saveSettings();
        new obsidian.Notice(`人员资料已更新：新建 ${created}，更新 ${updated}`);
        this.close();
      } catch (e) {
        console.error("[LexVoice] apply people suggestions failed", e);
        new obsidian.Notice(`保存失败：${(e && e.message) || e}`, 8000);
      }
    };
  }
}

export class QueueModal extends obsidian.Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const { contentEl } = this;
    // 静态 Modal 默认停在打开瞬间；处理中时会定时重渲染让"当前步骤/进度"实时走动。先清旧定时器避免叠加。
    if (this._activityTimer) { window.clearInterval(this._activityTimer); this._activityTimer = null; }
    contentEl.empty();
    contentEl.createEl("h2", { text: "LexVoice 处理进度" });

    const allTasks = (this.plugin.queue && Array.isArray(this.plugin.queue.tasks)) ? this.plugin.queue.tasks : [];
    const running = allTasks.filter(t => t && t.status === "running");
    const pending = allTasks.filter(t => t && t.status !== "running");
    const completed = Array.isArray(this.plugin.completedWorkLog) ? this.plugin.completedWorkLog : [];
    const activity = this.plugin.getCurrentActivityLabel ? this.plugin.getCurrentActivityLabel() : null;

    if (!running.length && !pending.length && !completed.length && !activity) {
      contentEl.createEl("p", { text: "暂无处理任务。录音转写、AI 整理、重试任务的进度会显示在这里。" });
      return;
    }

    const taskTitle = (t) => t.type === "transcribe" ? `转写重试 · 段${(t.segmentIndex || 0) + 1}`
      : t.type === "merge" ? `合并重试 · ${(t.segments || []).length} 段`
      : t.type === "generate-prompt" ? "提示词生成" : (t.type || "任务");
    const section = (title) => {
      const sec = contentEl.createDiv({ cls: "lexvoice-queue-section" });
      sec.createEl("div", { cls: "lexvoice-queue-section-title", text: title });
      return sec;
    };

    // —— 处理中（当前活动 + 正在跑的队列任务）——
    if (activity || running.length) {
      const sec = section(`处理中${running.length ? `（${running.length}）` : ""}`);
      const list = sec.createDiv({ cls: "lexvoice-queue-list" });
      const detail = this.plugin.getCurrentActivityDetail ? this.plugin.getCurrentActivityDetail() : null;
      if (detail) {
        const card = list.createDiv({ cls: "lexvoice-queue-row is-running lexvoice-activity-card" });
        const info = card.createDiv({ cls: "lexvoice-queue-info" });
        // 第一行：任务类型 · 模式 …（右）计数
        const head = info.createDiv({ cls: "lexvoice-activity-head" });
        head.createSpan({ cls: "lexvoice-activity-kind", text: detail.kind || "处理中" });
        if (detail.modeLabel) {
          head.createSpan({ cls: "lexvoice-activity-sep", text: "·" });
          head.createSpan({ cls: "lexvoice-activity-mode", text: detail.modeLabel });
        }
        if (detail.count) head.createSpan({ cls: "lexvoice-activity-count", text: detail.count });
        // 第二行：当前步骤（+百分比）
        const hasPct = detail.percent != null && Number.isFinite(Number(detail.percent));
        const stepText = (detail.step || "处理中") + (hasPct ? `（${Math.round(Number(detail.percent))}%）` : "");
        info.createDiv({ cls: "lexvoice-activity-step", text: stepText });
        // 进度条（仅在有百分比时显示）
        if (hasPct) {
          const track = info.createDiv({ cls: "lexvoice-activity-bar" });
          const fill = track.createDiv({ cls: "lexvoice-activity-bar-fill" });
          fill.style.width = Math.max(0, Math.min(100, Math.round(Number(detail.percent)))) + "%";
        }
        // 第三行：步骤说明
        if (detail.stepDetail) info.createDiv({ cls: "lexvoice-activity-detail", text: detail.stepDetail });
      } else if (activity) {
        const row = list.createDiv({ cls: "lexvoice-queue-row is-running" });
        row.createDiv({ cls: "lexvoice-queue-info" }).createEl("div", { cls: "lexvoice-queue-title", text: activity });
      }
      // 正在跑的队列重试任务（与当前活动并列）
      for (const t of running) {
        const row = list.createDiv({ cls: "lexvoice-queue-row is-running" });
        const info = row.createDiv({ cls: "lexvoice-queue-info" });
        info.createEl("div", { cls: "lexvoice-queue-title", text: taskTitle(t) });
        info.createEl("div", { cls: "lexvoice-queue-meta", text: t.mdPath || "" });
      }
    }

    // —— 待处理 ——
    if (pending.length) {
      const sec = section(`待处理（${pending.length}）`);
      const actionBar = sec.createDiv({ cls: "lexvoice-queue-actions" });
      const retryAllBtn = actionBar.createEl("button", { text: `重试全部 (${pending.length})`, cls: "mod-cta" });
      retryAllBtn.onclick = async () => { await this.plugin.retryQueue(); this.onOpen(); };
      const clearBtn = actionBar.createEl("button", { text: "清空待处理" });
      clearBtn.onclick = async () => {
        const n = this.plugin.queue.tasks.filter(t => t && t.status !== "running").length;
        const ok = await lexvoiceConfirm(this.app, "清空待处理任务？",
          `清空后这 ${n} 个任务不再自动重试，对应纪要将停留在当前状态（之后可在纪要中右键重新发起转写/整理）。处理中的任务不受影响。`,
          "清空");
        if (!ok) return;
        this.plugin.queue.tasks = this.plugin.queue.tasks.filter(t => t && t.status === "running");
        await this.plugin.saveAll();
        this.plugin.renderStatusBar();
        this.onOpen();
      };
      const list = sec.createDiv({ cls: "lexvoice-queue-list" });
      for (const t of pending) {
        const row = list.createDiv({ cls: "lexvoice-queue-row" });
        const info = row.createDiv({ cls: "lexvoice-queue-info" });
        info.createEl("div", { cls: "lexvoice-queue-title", text: taskTitle(t) });
        info.createEl("div", { cls: "lexvoice-queue-meta", text: `${t.mdPath || ""} · 重试 ${t.retries || 0}/${this.plugin.settings.maxRetries || 3}` });
        if (t.lastError) info.createEl("div", { cls: "lexvoice-queue-error", text: t.lastError });
        const actions = row.createDiv({ cls: "lexvoice-queue-row-actions" });
        const retryBtn = actions.createEl("button", { text: "重试" });
        retryBtn.onclick = async () => { try { await this.plugin.queue.processOne(t); } catch {} this.onOpen(); };
        const delBtn = actions.createEl("button", { text: "删除" });
        delBtn.onclick = async () => {
          await this.plugin.queue.remove(t.id);
          new obsidian.Notice("已删除任务：此分段不再自动重试，纪要中对应位置保持现状（可在纪要中右键重新发起）。", 6000);
          this.onOpen();
        };
      }
    }

    // —— 本次启动后已完成 ——
    if (completed.length) {
      const sec = section(`本次已完成（${completed.length}）`);
      const list = sec.createDiv({ cls: "lexvoice-queue-list" });
      const fmtTime = (ms) => {
        try { return window.moment ? window.moment(ms).format("HH:mm:ss") : new Date(ms).toLocaleTimeString(); }
        catch { return ""; }
      };
      for (const c of completed) {
        const row = list.createDiv({ cls: "lexvoice-queue-row is-done" });
        const info = row.createDiv({ cls: "lexvoice-queue-info" });
        info.createEl("div", { cls: "lexvoice-queue-title", text: c.title || "完成" });
        info.createEl("div", { cls: "lexvoice-queue-meta", text: `${fmtTime(c.at)}${c.detail ? " · " + c.detail : ""}` });
      }
    }

    // 处理中时每 1.2s 重渲染，让步骤名/百分比实时更新；空闲（无活动、无运行任务）即停止刷新。
    if (activity || running.length) {
      this._activityTimer = window.setInterval(() => { try { this.onOpen(); } catch {} }, 1200);
    }
  }
  onClose() {
    if (this._activityTimer) { window.clearInterval(this._activityTimer); this._activityTimer = null; }
    this.contentEl.empty();
  }
}

export class VirtualCableSetupModal extends obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.activePlatform = this.detectPlatform();
  }
  detectPlatform() {
    const p = (typeof process !== "undefined" && process.platform) || "";
    if (p === "darwin") return "mac";
    if (p === "win32") return "win";
    return "linux";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-vcable-modal");

    contentEl.createEl("h2", { text: "电脑音频捕获设置" });
    const desc = contentEl.createEl("p", { cls: "lexvoice-vcable-desc" });
    desc.setText("LexVoice 不能直接监听耳机或扬声器里正在播放的声音。录制 B 站客户端、浏览器视频、课程或会议对方声音时，需要先把这些声音输出到虚拟声卡，让 LexVoice 将其识别为「电脑音频输入」；同时再把同一份声音监听到真实扬声器或耳机，确保本机仍可听到播放内容。一次配置，长期可用。");

    // 平台 tabs
    const tabs = contentEl.createDiv({ cls: "lexvoice-vcable-tabs" });
    const platforms = [
      ["mac", "macOS"],
      ["win", "Windows"],
      ["linux", "Linux"],
    ];
    const tabBtns = {};
    for (const [k, label] of platforms) {
      const b = tabs.createEl("button", { text: label, cls: "lexvoice-vcable-tab" });
      if (k === this.activePlatform) b.addClass("is-active");
      b.onclick = () => {
        this.activePlatform = k;
        for (const key in tabBtns) tabBtns[key].removeClass("is-active");
        b.addClass("is-active");
        this.renderContent();
      };
      tabBtns[k] = b;
    }
    this.tabBtns = tabBtns;
    this.contentBox = contentEl.createDiv({ cls: "lexvoice-vcable-content" });
    this.renderContent();

    // 底部操作
    const actions = contentEl.createDiv({ cls: "modal-button-container lexvoice-vcable-actions" });
    const closeBtn = actions.createEl("button", { text: "关闭" });
    closeBtn.onclick = () => this.close();
    const recheckBtn = actions.createEl("button", { text: "重新检测", cls: "mod-cta" });
    recheckBtn.onclick = async () => {
      const info = await enumerateAudioDevices();
      if (info.virtualCables.length > 0) {
        const labels = info.virtualCables.map(d => d.label).join("、");
        new obsidian.Notice(`检测到电脑音频输入：${labels}`);
        this.close();
      } else {
        new obsidian.Notice("尚未检测到电脑音频输入，请确认已安装虚拟声卡并重启 Obsidian。");
      }
    };
  }
  renderContent() {
    this.contentBox.empty();
    if (this.activePlatform === "mac")   this.renderMacContent(this.contentBox);
    else if (this.activePlatform === "win") this.renderWinContent(this.contentBox);
    else this.renderLinuxContent(this.contentBox);
  }
  step(parent, n, title, body) {
    const s = parent.createDiv({ cls: "lexvoice-vcable-step" });
    const head = s.createDiv({ cls: "lexvoice-vcable-step-head" });
    head.createSpan({ text: `Step ${n}`, cls: "lexvoice-vcable-step-num" });
    head.createSpan({ text: title, cls: "lexvoice-vcable-step-title" });
    const b = s.createDiv({ cls: "lexvoice-vcable-step-body" });
    if (typeof body === "function") body(b);
    else b.appendChild(obsidian.sanitizeHTMLToDom(String(body == null ? "" : body)));
    return s;
  }
  renderMacContent(parent) {
    this.step(parent, 1, "安装 BlackHole（开源免费）", (b) => {
      b.createEl("p", { text: "推荐 BlackHole 2ch（双声道版本足够会议使用）。" });
      const ul = b.createEl("ul");
      const li1 = ul.createEl("li");
      li1.createSpan({ text: "下载页：" });
      const a1 = li1.createEl("a", { text: "existential.audio/blackhole/", href: "https://existential.audio/blackhole/" });
      a1.target = "_blank";
      const li2 = ul.createEl("li");
      li2.createSpan({ text: "或用 Homebrew：" });
      li2.createEl("code", { text: "brew install blackhole-2ch" });
    });
    this.step(parent, 2, "创建多输出设备（Multi-Output Device）", (b) => {
      const ol = b.createEl("ol");
      ol.createEl("li", { text: "启动台 → Audio MIDI Setup（音频 MIDI 设置）" });
      ol.createEl("li", { text: "左下角「+」→ 创建多输出设备" });
      ol.createEl("li", { text: "勾选「内建扬声器」（或耳机）+「BlackHole 2ch」" });
      ol.createEl("li", { text: "Master Device 选择耳机或扬声器；Drift Correction 勾选 BlackHole" });
      const tip = b.createEl("p", { cls: "lexvoice-vcable-tip" });
      tip.setText("这样系统音频会同时进入真实耳机/扬声器和 BlackHole：前者用于播放，后者用于 LexVoice 录制。");
    });
    this.step(parent, 3, "把系统或应用输出切到这个多输出设备", (b) => {
      const ol = b.createEl("ol");
      ol.createEl("li", { text: "系统设置 → 声音 → 输出" });
      ol.createEl("li", { text: "选择刚才创建的「多输出设备」" });
      ol.createEl("li", { text: "浏览器视频和大多数桌面视频客户端通常跟随系统输出；会议软件如单独设置了扬声器，也改成这个多输出设备" });
      const warn = b.createEl("p", { cls: "lexvoice-vcable-warn" });
      warn.setText("切换后会议软件可能需要重新选择扬声器。");
    });
    this.step(parent, 4, "在 LexVoice 选择电脑音频模式", (b) => {
      b.createEl("p", { text: "只整理视频、课程或播客时选择「仅电脑音频」；线上会议或边听边讲解时选择「麦克风加电脑音频」。" });
    });
  }
  renderWinContent(parent) {
    this.step(parent, 1, "安装 VB-Cable（免费）", (b) => {
      b.createEl("p", { text: "下载：" });
      const a = b.createEl("a", { text: "https://vb-audio.com/Cable/", href: "https://vb-audio.com/Cable/" });
      a.target = "_blank";
      const ol = b.createEl("ol");
      ol.createEl("li", { text: "下载 VB-Cable Driver Pack 后解压" });
      ol.createEl("li", { text: "右键 VBCABLE_Setup_x64.exe → 以管理员身份运行" });
      ol.createEl("li", { text: "点击 Install Driver → 重启电脑" });
    });
    this.step(parent, 2, "把要录制的声音输出切到 CABLE Input（播放设备）", (b) => {
      b.createEl("p", { text: "线上会议可以在飞书、腾讯会议或 Zoom 的音频设置里改扬声器；B 站客户端、浏览器视频、播放器等桌面应用，可以在 Windows 音量混合器里单独指定输出设备。目标输出统一改为：" });
      b.createEl("code", { text: "CABLE Input (VB-Audio Virtual Cable)" });
      b.createEl("p", { cls: "lexvoice-vcable-tip" }).setText("注意：这里选的是 CABLE Input。虽然名字叫 Input，但它在 Windows 里是“播放/输出设备”；LexVoice 后面录的是同一根虚拟线缆另一端的 CABLE Output。");
      const ol = b.createEl("ol");
      ol.createEl("li", { text: "录会议：在会议软件的扬声器/输出设备中选择 CABLE Input" });
      ol.createEl("li", { text: "录 B 站客户端：先播放一段视频，让应用出现在音量混合器里；Windows 设置 → 系统 → 声音 → 音量混合器 → 找到哔哩哔哩/bilibili → 输出设备选择 CABLE Input" });
      ol.createEl("li", { text: "录浏览器：同样在音量混合器中找到 Chrome、Edge、Firefox 等浏览器 → 输出设备选择 CABLE Input" });
      ol.createEl("li", { text: "录全部系统声音：把系统默认输出设备直接改为 CABLE Input" });
      const warn = b.createEl("p", { cls: "lexvoice-vcable-warn" });
      warn.setText("这一步会让系统声音暂时不从真实耳机/扬声器播放，需要完成下一步侦听设置后恢复监听。");
    });
    this.step(parent, 3, "用 CABLE Output 侦听到真实扬声器或耳机（关键）", (b) => {
      b.createEl("p", { text: "要恢复本机监听，需要把 CABLE Output 侦听到真实耳机或扬声器：" });
      const ol = b.createEl("ol");
      ol.createEl("li", { text: "打开：控制面板 → 声音 → 录制（或右键任务栏喇叭图标 → 声音设置 → 更多声音设置）" });
      ol.createEl("li", { text: "找到 CABLE Output" });
      ol.createEl("li", { text: "双击 → 切到「侦听」标签" });
      ol.createEl("li", { text: "勾选「侦听此设备」" });
      ol.createEl("li", { text: "「通过此设备播放」选择真实耳机或扬声器，不要选 CABLE Input" });
      ol.createEl("li", { text: "点「应用」" });
      const tip = b.createEl("p", { cls: "lexvoice-vcable-tip" });
      tip.setText("音频链路是：应用/浏览器 → CABLE Input（播放输出）→ CABLE Output（录制输入，LexVoice 读取）→ 侦听到真实耳机/扬声器。若侦听延迟明显，可改用 VoiceMeeter 这类混音工具做多输出。");
    });
    this.step(parent, 4, "把默认输入改回真实麦克风", (b) => {
      const ol = b.createEl("ol");
      ol.createEl("li", { text: "Windows 设置 → 系统 → 声音 → 输入" });
      ol.createEl("li", { text: "选择真实麦克风，不要选 CABLE Output" });
      ol.createEl("li", { text: "如果其他语音输入软件也没声音，通常就是这里被改成了 CABLE Output" });
      const warn = b.createEl("p", { cls: "lexvoice-vcable-warn" });
      warn.setText("CABLE Output 是给 LexVoice 这类录音软件读取电脑音频用的，不适合作为日常语音输入麦克风。");
    });
    this.step(parent, 5, "在 LexVoice 选择电脑音频模式", (b) => {
      b.createEl("p", { text: "看 B 站、YouTube、课程或播客时选择「仅电脑音频」；线上会议或需要同时录入本人讲解时选择「麦克风加电脑音频」。" });
    });
  }
  renderLinuxContent(parent) {
    this.step(parent, 1, "PulseAudio：用 monitor source", (b) => {
      b.createEl("p", { text: "PulseAudio 的每个真实输出设备都自带 monitor source。保持系统输出为耳机/扬声器，LexVoice 选择对应的 Monitor of ... 输入，即可同时播放和录制系统音频。" });
      b.createEl("p", { text: "查看可用 monitor source：" });
      const code = b.createEl("pre");
      code.createEl("code", { text: "pactl list sources short | grep monitor" });
    });
    this.step(parent, 2, "若用 PipeWire（较新发行版）", (b) => {
      b.createEl("p", { text: "PipeWire 兼容 PulseAudio API，命令相同。如默认 monitor 不工作，可安装 pavucontrol，并在「录制」标签里把 LexVoice 的输入切到 Monitor of <扬声器名称>。" });
    });
    this.step(parent, 3, "在 LexVoice 选择电脑音频模式", (b) => {
      b.createEl("p", { text: "LexVoice 的设备检测会把名为「Monitor of ...」的输入识别为电脑音频输入。只整理视频/课程时选择「仅电脑音频」；需要同时录自己的声音时选择「麦克风加电脑音频」。" });
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

export class RecruitContextModal extends obsidian.Modal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.opts = opts || {};
    this.copy = getRecruitContextCopy(this.opts.flow || "recording");
    this.formEls = {};
    // 从 settings 读上次的上下文作为预填
    const saved = (plugin.settings.recruitContext) || {};
    this.ctx = {
      jd: saved.jd || "",
      resume: saved.resume || "",
      candidateName: saved.candidateName || "",
      position: saved.position || "",
      round: saved.round || "初面",
      interviewer: saved.interviewer || "",
      seniority: saved.seniority || "",
      customNote: saved.customNote || "",
      // F2：恢复上次选中的招聘项目（让重开 Modal 仍显示已选项目与其综合素质）
      jdFile: saved.jdFile || "",
      generalOutline: saved.generalOutline || "",
      interviewBrief: saved.interviewBrief || "",
      requiredQualities: Array.isArray(saved.requiredQualities) ? saved.requiredQualities : [],
    };
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-recruit-modal");
    this.formEls = {};

    contentEl.createEl("h2", { text: this.copy.title });
    const desc = contentEl.createEl("p", { cls: "lexvoice-recruit-desc" });
    desc.setText(this.copy.desc);

    const hrUnlocked = isRecruitFeatureUnlocked(this.plugin.settings);

    // —— JD 区块 ——
    const jdSec = contentEl.createDiv({ cls: "lexvoice-recruit-section" });
    const jdHead = jdSec.createDiv({ cls: "lexvoice-recruit-section-head" });
    jdHead.createEl("label", { text: "📋 岗位 JD（强烈建议）", cls: "lexvoice-recruit-label-strong" });
    if (getRecruitJdLibrary(this.plugin.settings).length > 0) {
      const libBtn = jdHead.createEl("button", { text: "从历史 JD 选择…", cls: "lexvoice-recruit-lib-btn" });
      libBtn.onclick = () => this.openLibrary();
    }

    // 招聘项目下拉（仅解锁后）：选项目 → 载入 JD 正文 + 综合素质 + 统一提纲
    if (hrUnlocked) {
      const projects = listJDProjects(this.app, this.plugin.settings.recruitJdFolderPath);
      this._jdProjects = projects;
      const projRow = jdSec.createDiv({ cls: "lexvoice-recruit-project-row" });
      const sel = projRow.createEl("select", { cls: "lexvoice-recruit-input dropdown" });
      sel.createEl("option", { value: "", text: "手动粘贴 JD" });
      for (const p of projects) {
        if (!p.hasJd) continue;
        const tag = p.status === "招聘中" ? "" : `（${p.status}）`;
        sel.createEl("option", { value: p.jdFilePath, text: `${p.position}（已面 ${p.interviewed} 人）${tag}` });
      }
      sel.value = this.ctx.jdFile || "";
      sel.addEventListener("change", () => { this.applyJdProjectSelection(sel.value); });
      this._jdProjectSel = sel;
      const saveBtn = projRow.createEl("button", { text: "＋ 存为招聘项目", cls: "lexvoice-recruit-lib-btn" });
      saveBtn.onclick = () => this.saveAsProject();
    }

    const jdTa = jdSec.createEl("textarea", { cls: "lexvoice-recruit-textarea lexvoice-recruit-textarea-large" });
    jdTa.value = this.ctx.jd;
    jdTa.placeholder = "粘贴完整 JD 文本，含岗位职责、任职要求、加分项等。\n整理时会从中拆解硬性要求作为评分锚点。";
    jdTa.addEventListener("input", () => { this.ctx.jd = jdTa.value; this.clearCachedInterviewBrief(); });
    this.formEls.jd = jdTa;

    // 综合素质预览（仅解锁后；选中招聘项目且配置了素质时显示，chip 点开看定义）
    if (hrUnlocked) {
      this._qualitiesBox = jdSec.createDiv({ cls: "lexvoice-recruit-qualities" });
      this.renderQualities(this.ctx.requiredQualities || []);
    } else {
      this._qualitiesBox = null;
    }

    // —— 简历区块 ——
    const resumeSec = contentEl.createDiv({ cls: "lexvoice-recruit-section" });
    const resumeHead = resumeSec.createDiv({ cls: "lexvoice-recruit-section-head" });
    resumeHead.createEl("label", { text: "📄 候选人简历（可选）" });
    if (hrUnlocked) {
      const pdfs = listResumePdfs(this.app, this.plugin.settings.recruitResumeFolderPath);
      if (pdfs.length) {
        const pdfSel = resumeHead.createEl("select", { cls: "lexvoice-recruit-input dropdown lexvoice-recruit-pdf-sel" });
        pdfSel.createEl("option", { value: "", text: "从简历库选 PDF…" });
        for (const f of pdfs) pdfSel.createEl("option", { value: f.path, text: f.basename });
        pdfSel.addEventListener("change", async () => {
          const p = pdfSel.value;
          pdfSel.value = "";
          if (!p) return;
          const file = this.app.vault.getAbstractFileByPath(p);
          new obsidian.Notice("正在尽力提取 PDF 文本…");
          let text = await extractPdfTextBestEffort(this.app, file);
          if (!text || text.trim().length < 50) {
            new obsidian.Notice("该 PDF 没有可提取的文本（可能是扫描件），请手动粘贴简历内容", 7000);
            return;
          }
          if (this.plugin.settings.recruitResumeDesensitize !== false) text = desensitizeResumeText(text);
          this.ctx.resume = text;
          this.clearCachedInterviewBrief();
          if (this.formEls.resume) this.formEls.resume.value = text;
          new obsidian.Notice("已提取简历文本，可在下方编辑");
        });
      }
    }
    const resumeTa = resumeSec.createEl("textarea", { cls: "lexvoice-recruit-textarea" });
    resumeTa.value = this.ctx.resume;
    resumeTa.placeholder = "粘贴简历文本，或从上方简历库选 PDF 自动提取。建议含：现任公司+岗位+年限、过往主要项目、技能栈、教育背景。";
    resumeTa.addEventListener("input", () => { this.ctx.resume = resumeTa.value; this.clearCachedInterviewBrief(); });
    this.formEls.resume = resumeTa;

    // —— 元信息 grid ——
    const metaGrid = contentEl.createDiv({ cls: "lexvoice-recruit-meta-grid" });
    const addMetaInput = (label, key, placeholder) => {
      const cell = metaGrid.createDiv({ cls: "lexvoice-recruit-meta-cell" });
      cell.createEl("label", { text: label });
      const inp = cell.createEl("input", { type: "text", cls: "lexvoice-recruit-input" });
      inp.value = this.ctx[key] || "";
      inp.placeholder = placeholder || "";
      inp.addEventListener("input", () => { this.ctx[key] = inp.value; this.clearCachedInterviewBrief(); });
      this.formEls[key] = inp;
    };
    const addMetaSelect = (label, key, options) => {
      const cell = metaGrid.createDiv({ cls: "lexvoice-recruit-meta-cell" });
      cell.createEl("label", { text: label });
      const sel = cell.createEl("select", { cls: "lexvoice-recruit-input dropdown" });
      for (const opt of options) {
        const o = sel.createEl("option", { value: opt, text: opt || "（未指定）" });
        if (this.ctx[key] === opt) o.selected = true;
      }
      sel.addEventListener("change", () => { this.ctx[key] = sel.value; this.clearCachedInterviewBrief(); });
      this.formEls[key] = sel;
    };

    addMetaInput("候选人姓名", "candidateName", "如：某候选人");
    addMetaInput("应聘岗位", "position", "如：高级 OD（AI 方向）");
    addMetaSelect("面试轮次", "round", ["初面", "二面", "终面", "复试", "交叉面"]);
    addMetaInput("面试官", "interviewer", "如：某用人经理");
    addMetaSelect("岗位资历", "seniority", ["", "初级", "中级", "高级", "资深", "总监"]);
    addMetaInput("自定义提示", "customNote", "（可选）特殊关注点，会作为评价关注点使用");

    // recruitAlwaysAskOnStart 的唯一写入点：此前该键没有任何 UI 可改，等于不可关的常量。
    const askRow = contentEl.createDiv({ cls: "lexvoice-recruit-ask-row" });
    const askLabel = askRow.createEl("label");
    const askCb = askLabel.createEl("input", { attr: { type: "checkbox" } });
    askCb.checked = this.plugin.settings.recruitAlwaysAskOnStart !== false;
    askLabel.appendText(" 开始招聘录音前总是弹出本窗口（关闭后沿用上次保存的上下文；可在实时面板的招聘卡片「编辑」中改回）");
    askCb.onchange = async () => {
      this.plugin.settings.recruitAlwaysAskOnStart = !!askCb.checked;
      await this.plugin.saveSettings();
    };

    // —— 按钮 ——
    const actions = contentEl.createDiv({ cls: "lexvoice-recruit-actions" });

    const skipBtn = actions.createEl("button", { text: this.copy.skipText });
    skipBtn.onclick = () => {
      this.confirmed = "skip";
      this.close();
    };

    const saveOnlyBtn = actions.createEl("button", { text: this.copy.draftText });
    saveOnlyBtn.onclick = async () => {
      const added = await this.saveCurrentContext(true);
      new obsidian.Notice(added ? "已保存招聘上下文草稿，JD 已加入历史" : "已保存招聘上下文草稿");
    };

    const startBtn = actions.createEl("button", { text: this.copy.primaryText, cls: "mod-cta" });
    startBtn.onclick = async () => {
      const flow = (this.opts && this.opts.flow) || "recording";
      if (flow === "settings" || flow === "recording") {
        const originalText = startBtn.textContent || this.copy.primaryText;
        try {
          this.ctx = normalizeRecruitContext(this.ctx);
          if (flow === "settings" && !this.ctx.jd && !this.ctx.resume) {
            new obsidian.Notice("请先填写 JD 或简历，再创建面试提纲。", 5000);
            return;
          }
          const shouldCreateBrief = !!(this.ctx.jd || this.ctx.resume);
          if (shouldCreateBrief && !String(this.ctx.interviewBrief || "").trim()) {
            startBtn.disabled = true;
            startBtn.setText(flow === "recording" ? "正在创建提纲…" : "正在创建…");
            const brief = await getRecruitInterviewOutline(this.plugin, this.ctx);
            if (!brief) {
              new obsidian.Notice("没有生成可用的面试提纲，请检查 JD / 简历和大模型配置。", 7000);
              return;
            }
            this.ctx.interviewBrief = brief;
          }
          await this.saveCurrentContext(true);
          this.confirmed = flow === "settings" ? "brief" : "start";
          if (flow === "settings") {
            new obsidian.Notice("面试提纲已创建；下一次招聘录音会写在转写内容前面。", 5000);
          }
          this.close();
        } catch (e) {
          console.error("[LexVoice] create interview brief from settings failed", e);
          new obsidian.Notice(`创建面试提纲失败：${(e && e.message) || e}`, 8000);
        } finally {
          startBtn.disabled = false;
          startBtn.setText(originalText);
        }
        return;
      }
      await this.saveCurrentContext(true);
      this.confirmed = "start";
      this.close();
    };
  }
  async saveCurrentContext(addToJdLibrary) {
    this.ctx = normalizeRecruitContext(this.ctx);
    this.ctx.savedAt = new Date().toISOString();
    this.plugin.settings.recruitContext = { ...this.ctx };
    const added = addToJdLibrary ? upsertRecruitJdLibrary(this.plugin.settings, this.ctx) : false;
    await this.plugin.saveSettings();
    return added;
  }
  clearCachedInterviewBrief() {
    if (this.ctx) this.ctx.interviewBrief = "";
  }
  openLibrary() {
    const lib = getRecruitJdLibrary(this.plugin.settings);
    if (!lib.length) { new obsidian.Notice("历史 JD 为空"); return; }
    // 简单的列表 sub-modal
    const sub = new obsidian.Modal(this.app);
    sub.contentEl.empty();
    sub.contentEl.createEl("h3", { text: "选择历史 JD" });
    const list = sub.contentEl.createDiv({ cls: "lexvoice-recruit-lib-list" });
    for (const item of lib) {
      const row = list.createDiv({ cls: "lexvoice-recruit-lib-row" });
      row.createDiv({ cls: "lexvoice-recruit-lib-title", text: item.position || getRecruitJdPreview(item.jd) || "（未命名 JD）" });
      const meta = [
        item.seniority ? `资历：${item.seniority}` : "",
        getRecruitJdPreview(item.jd),
        item.savedAt ? new Date(item.savedAt).toLocaleDateString() : "",
      ].filter(Boolean).join(" · ");
      row.createDiv({ cls: "lexvoice-recruit-lib-meta", text: meta });
      row.onclick = () => {
        applyRecruitJdLibraryItem(this.ctx, item);
        this.clearCachedInterviewBrief();
        sub.close();
        this.applyContextToForm();
        new obsidian.Notice("已填入历史 JD，不会覆盖当前候选人和简历");
      };
    }
    sub.open();
  }
  applyContextToForm() {
    const fields = this.formEls || {};
    for (const [key, el] of Object.entries(fields)) {
      if (!el) continue;
      const fallback = key === "round" ? "初面" : "";
      el.value = this.ctx[key] || fallback;
    }
  }
  // 选中招聘项目：解析 JD → 载入岗位描述 + 综合素质 + 统一提纲。空值=回到手动粘贴。
  async applyJdProjectSelection(path) {
    const seq = (this._jdSeq = (this._jdSeq || 0) + 1);  // 切换竞态守卫：丢弃过期解析结果
    if (!path) {
      this.ctx.jdFile = ""; this.ctx.requiredQualities = []; this.ctx.generalOutline = ""; this.clearCachedInterviewBrief();
      this.renderQualities([]);
      return;
    }
    const parsed = await parseJdProject(this.app, path);
    if (seq !== this._jdSeq) return;  // 已被更晚的切换取代
    this.ctx.jdFile = path;
    if (parsed.岗位描述) this.ctx.jd = parsed.岗位描述;
    this.ctx.requiredQualities = parsed.综合素质 || [];
    this.ctx.generalOutline = parsed.统一提纲 || "";
    this.clearCachedInterviewBrief();
    const proj = (this._jdProjects || []).find(p => p.jdFilePath === path);
    if (proj && !this.ctx.position) this.ctx.position = proj.position;
    this.applyContextToForm();
    this.renderQualities(this.ctx.requiredQualities, parsed.qualitiesError);
  }
  // 综合素质 chips（点击展开定义/信号）；格式异常给黄条；无素质则不显示。
  renderQualities(qualities, hasError) {
    const box = this._qualitiesBox;
    if (!box) return;
    box.empty();
    if (hasError) {
      box.createDiv({ cls: "lexvoice-recruit-quality-warn", text: "综合素质格式异常，本场按未配置处理。" });
      return;
    }
    const list = Array.isArray(qualities) ? qualities : [];
    if (!list.length) return;
    box.createDiv({ cls: "lexvoice-recruit-quality-title", text: "本岗位必备素质（点击展开定义）" });
    const chips = box.createDiv({ cls: "lexvoice-recruit-quality-chips" });
    for (const q of list) {
      const chip = chips.createEl("button", { cls: "lexvoice-recruit-quality-chip", text: q.素质 });
      const detail = box.createDiv({ cls: "lexvoice-recruit-quality-detail" });
      detail.setCssStyles({ display: "none" });
      const parts = [];
      if (q.定义) parts.push(`定义：${q.定义}`);
      if (q.信号) parts.push(`信号：${q.信号}`);
      detail.setText(`${q.素质}　${parts.join("　·　") || "（未填定义）"}`);
      chip.onclick = () => { detail.style.display = detail.style.display === "none" ? "" : "none"; };
    }
  }
  // 把当前粘贴的 JD 存为招聘项目（三件套：文件夹 + JD.md + 看板.base）。
  saveAsProject() {
    const jdText = String(this.ctx.jd || "").trim();
    if (!jdText) { new obsidian.Notice("请先在下方粘贴 JD 文本，再存为招聘项目"); return; }
    const sub = new obsidian.Modal(this.app);
    sub.titleEl.setText("存为招聘项目");
    const mk = (label, val, ph) => {
      const row = sub.contentEl.createDiv({ cls: "lexvoice-recruit-meta-cell" });
      row.createEl("label", { text: label });
      const inp = row.createEl("input", { type: "text", cls: "lexvoice-recruit-input" });
      inp.value = val || ""; inp.placeholder = ph || "";
      return inp;
    };
    const nameInp = mk("职位名", this.ctx.position || "", "如：海外发行-社招负责人");
    const seqInp = mk("序列", "招聘", "如：招聘 / 产品 / 运营");
    const statusInp = mk("状态", "招聘中", "招聘中 / 已关闭 / 暂停");
    const actions = sub.contentEl.createDiv({ cls: "lexvoice-recruit-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => sub.close();
    const ok = actions.createEl("button", { text: "创建三件套", cls: "mod-cta" });
    ok.onclick = async () => {
      const name = String(nameInp.value || "").trim();
      if (!name) { new obsidian.Notice("请填职位名"); return; }
      try {
        const res = await createRecruitProject(
          this.app, this.plugin.settings.recruitJdFolderPath, name,
          { 职位名: name, 序列: seqInp.value, 状态: statusInp.value }, jdText);
        new obsidian.Notice(`已创建招聘项目：${res.name}（JD + 候选人看板）`);
        sub.close();
        this.ctx.jdFile = res.mdPath;
        if (!this.ctx.position) this.ctx.position = name;
        this.onOpen();                                  // 重建 Modal（下拉含新项目并选中）
        await this.applyJdProjectSelection(res.mdPath);  // 载入综合素质
      } catch (e) {
        new obsidian.Notice(`创建失败：${(e && e.message) || e}`);
      }
    };
    sub.open();
  }
  onClose() {
    this.contentEl.empty();
    if (this.opts.onConfirm) this.opts.onConfirm(this.confirmed || "cancel", this.ctx);
  }
}

export class PromptTemplateModal extends obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.editingId = null;
  }

  builtInModes() {
    return getBuiltInVisiblePolishModeKeys(this.plugin.settings);
  }

  newCustomScene(seed, baseMode, prompt) {
    const id = makeCustomPromptModeId(seed || "prompt");
    return {
      id,
      mode: id,
      name: seed || "新自定义提示词",
      description: "",
      baseMode: baseMode || "learning",
      prompt: prompt || [
        "你是专业的录音整理助手。请根据下面规则，把原始转写整理成可直接保存到 Obsidian 的 Markdown 笔记。",
        "",
        "请先补全这份提示词：",
        "- 使用场景：说明这类录音通常来自什么任务、谁会继续使用这份笔记。",
        "- 重点内容：说明必须识别哪些信息，例如事实、结论、待办、风险、争议、关键原话、术语、外语内容；待办 / 行动项必须输出为 `- [ ]` todo 任务。",
        "- 必须输出：说明最终笔记必须包含哪些部分，以及不需要出现哪些过度模板化内容。",
        "- 待办语法：如果有待办，统一写成 `- [ ] 责任人：<人> 事项：<具体动作> 截止：<时间>`，不要写成表格或普通列表。",
        "- 写作要求：说明语气、详略、是否翻译、是否保留原文、如何处理不确定信息。",
        "- 反幻觉：没有出现在转写里的信息不要编造，拿不准要标注不确定。",
        "",
        "原始转写：",
        "{{TRANSCRIPT}}"
      ].join("\n"),
      isBuiltin: false,
      customMode: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async saveScene(tpl, activate) {
    const clean = sanitizePromptTemplate(tpl, tpl && tpl.baseMode);
    this.plugin.settings.promptTemplates = Object.assign({}, this.plugin.settings.promptTemplates || {}, { [clean.id]: clean });
    this.plugin.settings.activeTemplateByMode = Object.assign({}, this.plugin.settings.activeTemplateByMode || {}, { [clean.id]: clean.id });
    if (activate) this.plugin.settings.polishMode = clean.id;
    await this.plugin.saveSettings();
    return clean;
  }

  getBuiltinOverride(mode) {
    const tpls = this.plugin.settings.promptTemplates || {};
    const activeId = (this.plugin.settings.activeTemplateByMode || {})[mode];
    const tpl = activeId && tpls[activeId];
    if (tpl && tpl.prompt && tpl.prompt.trim() && !isCustomPromptModeTemplate(tpl)) return tpl;
    return null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-tpl-modal");
    contentEl.createEl("h2", { text: this.editingId ? "编辑提示词" : "提示词库" });

    const desc = contentEl.createDiv({ cls: "setting-item-description lexvoice-tpl-desc" });
    desc.setText("这里集中管理整理规则。内置提示词用于快速开始；需要固定格式、职业化判断或长期工作流时，新建自定义提示词并设为默认。");

    const body = contentEl.createDiv({ cls: "lexvoice-tpl-body" });
    if (this.editingId) this.renderEditor(body, this.editingId);
    else this.renderList(body);
  }

  renderList(body) {
    const defaultMode = getEffectivePolishMode(this.plugin.settings, this.plugin.settings.polishMode, "meeting");
    const defaultMeta = getModeMeta(this.plugin.settings, defaultMode);
    const toolbar = body.createDiv({ cls: "lexvoice-tpl-toolbar" });
    toolbar.createDiv({ cls: "lexvoice-tpl-current", text: "当前默认：" + (defaultMeta.prefix || defaultMeta.label || defaultMode) });
    const createBtn = toolbar.createEl("button", { text: "新建自定义提示词", cls: "mod-cta" });
    createBtn.onclick = async () => {
      const tpl = this.newCustomScene("新自定义提示词", "learning");
      await this.saveScene(tpl, true);
      this.editingId = tpl.id;
      this.onOpen();
    };

    const builtInSection = body.createDiv({ cls: "lexvoice-tpl-section" });
    builtInSection.createDiv({ cls: "lexvoice-tpl-section-title", text: "内置提示词" });
    builtInSection.createDiv({ cls: "lexvoice-tpl-section-copy", text: "LexVoice 提供的默认整理规则，适合直接设为默认。需要固定格式或专业判断时，请新建自定义提示词。" });
    const list = builtInSection.createDiv({ cls: "lexvoice-tpl-list" });
    for (const mode of this.builtInModes()) this.renderBuiltinRow(list, mode);

    const customSection = body.createDiv({ cls: "lexvoice-tpl-section" });
    customSection.createDiv({ cls: "lexvoice-tpl-section-title", text: "自定义提示词" });
    customSection.createDiv({ cls: "lexvoice-tpl-section-copy", text: "每个自定义提示词都会出现在录音、导入音频和重新整理菜单里，也可以设为默认。" });
    const customList = customSection.createDiv({ cls: "lexvoice-tpl-list" });
    const customs = getCustomPromptModeTemplates(this.plugin.settings);
    if (!customs.length) customList.createDiv({ cls: "lexvoice-tpl-empty", text: "还没有自定义提示词。点击上方按钮新建一条。" });
    for (const tpl of customs) this.renderCustomRow(customList, tpl);
  }

  renderBuiltinRow(list, mode) {
    const meta = getModeMeta(this.plugin.settings, mode);
    const row = list.createDiv({ cls: "lexvoice-tpl-row" });
    if (this.plugin.settings.polishMode === mode) row.addClass("is-active");
    const pill = row.createDiv({ cls: "lexvoice-tpl-mode-pill" });
    setLexVoiceModePillIcon(pill, meta);
    pill.setAttr("aria-hidden", "true");
    const text = row.createDiv({ cls: "lexvoice-tpl-row-meta" });
    text.createDiv({ cls: "lexvoice-tpl-row-name", text: meta.prefix || meta.label || mode });
    const override = this.getBuiltinOverride(mode);
    const state = override ? "当前使用旧版自定义规则。" : "内置提示词";
    text.createDiv({ cls: "lexvoice-tpl-row-sub", text: (meta.goal || "") + " · " + state });

    const actions = row.createDiv({ cls: "lexvoice-tpl-row-actions" });
    const defaultBtn = actions.createEl("button", { text: this.plugin.settings.polishMode === mode ? "已默认" : "设为默认" });
    defaultBtn.onclick = async () => {
      this.plugin.settings.polishMode = mode;
      await this.plugin.saveSettings();
      this.onOpen();
    };
  }

  renderCustomRow(list, tpl) {
    const meta = getModeMeta(this.plugin.settings, tpl.id);
    const baseMeta = getModeMeta(this.plugin.settings, tpl.baseMode || "learning");
    const row = list.createDiv({ cls: "lexvoice-tpl-row" });
    if (this.plugin.settings.polishMode === tpl.id) row.addClass("is-active");
    const pill = row.createDiv({ cls: "lexvoice-tpl-mode-pill" });
    setLexVoiceModePillIcon(pill, meta, baseMeta);
    pill.setAttr("aria-hidden", "true");
    const text = row.createDiv({ cls: "lexvoice-tpl-row-meta" });
    text.createDiv({ cls: "lexvoice-tpl-row-name", text: tpl.name || "自定义提示词" });
    const updated = tpl.updatedAt && window.moment ? window.moment(tpl.updatedAt).format("YYYY-MM-DD HH:mm") : "未记录";
    text.createDiv({ cls: "lexvoice-tpl-row-sub", text: "自定义 · 更新于 " + updated });

    const actions = row.createDiv({ cls: "lexvoice-tpl-row-actions" });
    const defaultBtn = actions.createEl("button", { text: this.plugin.settings.polishMode === tpl.id ? "已默认" : "设为默认" });
    defaultBtn.onclick = async () => {
      this.plugin.settings.polishMode = tpl.id;
      await this.plugin.saveSettings();
      this.onOpen();
    };
    const editBtn = actions.createEl("button", { text: "编辑" });
    editBtn.onclick = () => { this.editingId = tpl.id; this.onOpen(); };
    const delBtn = actions.createEl("button", { text: "删除" });
    delBtn.addClass("mod-warning");
    delBtn.onclick = async () => {
      if (!confirm("删除自定义提示词「" + (tpl.name || tpl.id) + "」？此操作不可恢复。")) return;
      const tpls = Object.assign({}, this.plugin.settings.promptTemplates || {});
      delete tpls[tpl.id];
      const active = Object.assign({}, this.plugin.settings.activeTemplateByMode || {});
      delete active[tpl.id];
      this.plugin.settings.promptTemplates = tpls;
      this.plugin.settings.activeTemplateByMode = active;
      if (this.plugin.settings.polishMode === tpl.id) this.plugin.settings.polishMode = "learning";
      await this.plugin.saveSettings();
      this.onOpen();
    };
  }

  async optimizePromptDraft(tpl, draft) {
    const current = String(draft || "").trim();
    const seed = current || this.newCustomScene(tpl && tpl.name ? tpl.name : "自定义提示词", tpl && tpl.baseMode ? tpl.baseMode : "learning").prompt;
    const sys = "你是提示词优化专家，专门把用户草稿改写成稳定、清晰、可执行的录音转写整理 Prompt。";
    const user = [
      "请优化下面这份 LexVoice 转写整理提示词。",
      "",
      "要求：",
      "- 只输出优化后的完整 Prompt，不要解释、不要代码块。",
      "- 必须保留 {{TRANSCRIPT}} 占位符。",
      "- 明确使用场景、重点内容、必须输出的内容、写作风格、翻译要求和反幻觉边界。",
      "- 不要强行套大量 callout；结构化可以有，但正文应贴近真实讨论内容。",
      "- 让用户保存后可以直接用于录音、导入和重新整理。",
      "",
      "提示词名称：" + ((tpl && tpl.name) || "自定义提示词"),
      "",
      "当前草稿：",
      seed,
    ].join("\n");
    let result = await callLlm(this.plugin, sys, user);
    result = String(result || "").trim().replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/```$/i, "").trim();
    if (!result.includes("{{TRANSCRIPT}}")) {
      result += "\n\n原始转写：\n{{TRANSCRIPT}}";
    }
    return result;
  }

  renderEditor(body, id) {
    const tpls = this.plugin.settings.promptTemplates || {};
    const tpl = tpls[id];
    if (!tpl || !isCustomPromptModeTemplate(tpl)) {
      this.editingId = null;
      this.onOpen();
      return;
    }

    const back = body.createDiv({ cls: "lexvoice-tpl-back" });
    const backBtn = back.createEl("button", { text: "返回列表" });
    backBtn.onclick = () => { this.editingId = null; this.onOpen(); };
    back.createSpan({ cls: "lexvoice-tpl-builtin-tag", text: "自定义" });

    const editor = body.createDiv({ cls: "lexvoice-tpl-editor" });
    new obsidian.Setting(editor).setName("提示词名称")
      .setDesc("这个名称会出现在录音、导入音频和重新整理菜单里。")
      .addText(t => {
        t.setValue(tpl.name || "");
        t.onChange(v => { tpl.name = v || "自定义提示词"; });
      });

    const promptSetting = new obsidian.Setting(editor).setName("提示词内容");
    promptSetting.setDesc("这里写的是实际发送给大模型的整理规则。内容应定义使用场景、重点内容、必须输出的内容、写作风格、翻译要求和反幻觉边界，并保留 {{TRANSCRIPT}} 作为原始转写占位符。");
    const ta = editor.createEl("textarea", { cls: "lexvoice-textarea lexvoice-textarea-mono lexvoice-tpl-textarea" });
    ta.value = tpl.prompt || "";
    ta.placeholder = "例如：这份提示词用于……；重点识别……；必须输出……；不要输出……；外语内容……；不确定信息……；最后保留 {{TRANSCRIPT}}。";
    ta.rows = 18;
    ta.addEventListener("input", () => { tpl.prompt = ta.value; });

    const actions = editor.createDiv({ cls: "lexvoice-tpl-edit-actions" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => { this.editingId = null; this.onOpen(); };
    const optimizeBtn = actions.createEl("button", { text: "AI 优化提示词" });
    optimizeBtn.onclick = async () => {
      try {
        optimizeBtn.disabled = true;
        optimizeBtn.setText("优化中…");
        const optimized = await this.optimizePromptDraft(tpl, ta.value);
        ta.value = optimized;
        tpl.prompt = optimized;
        new obsidian.Notice("已生成优化稿，请检查后保存");
      } catch (e) {
        console.error(e);
        new obsidian.Notice("AI 优化失败：" + ((e && e.message) || e));
      } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.setText("AI 优化提示词");
      }
    };
    const saveBtn = actions.createEl("button", { text: "保存并设为默认", cls: "mod-cta" });
    saveBtn.onclick = async () => {
      tpl.name = (tpl.name || "自定义提示词").trim();
      tpl.description = "";
      tpl.baseMode = tpl.baseMode || "learning";
      tpl.mode = tpl.id;
      tpl.customMode = true;
      tpl.isBuiltin = false;
      tpl.prompt = ta.value.trim();
      if (!tpl.prompt) { new obsidian.Notice("请填写提示词内容"); return; }
      if (!tpl.prompt.includes("{{TRANSCRIPT}}")) { new obsidian.Notice("提示词必须包含 {{TRANSCRIPT}} 占位符"); return; }
      tpl.updatedAt = new Date().toISOString();
      await this.saveScene(tpl, true);
      new obsidian.Notice("自定义提示词已保存");
      this.editingId = null;
      this.onOpen();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class ImportTextModal extends obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.selected = new Set();
    this.files = [];
    this.fileCheckboxes = new Map();
    this.processBtn = null;
    this.selectionText = null;
    this.modeSelect = null;
    this.modeHint = null;
    this.searchInput = null;
    this.categoryFilter = "all";
    this.categoryFilterEl = null;
    this.categoryButtons = new Map();
    this.listEl = null;
    this.loadingFiles = false;
    this.selectedMode = getEffectivePolishMode(plugin.settings, plugin.settings.polishMode, "meeting");
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-import-modal");
    this.selected.clear();
    this.fileCheckboxes = new Map();
    contentEl.createEl("h2", { text: "导入文本" });
    contentEl.createEl("p", { cls: "lexvoice-import-desc" })
      .setText("选择已有 Markdown、速录稿或文本纪要。LexVoice 不会调用语音转写服务，会直接走 API 页的「AI 整理服务」LLM 链路并按当前模板结构化整理。选择招聘评估时，会先弹出 JD / 简历 / 候选人信息窗口。");

    this.renderModeControl(contentEl);

    this.files = [];
    this.loadingFiles = true;
    const toolbar = contentEl.createDiv({ cls: "lexvoice-import-toolbar" });
    this.searchInput = toolbar.createEl("input", {
      type: "text",
      cls: "lexvoice-import-search",
      attr: { placeholder: "搜索文件名或路径" },
    });
    this.searchInput.addEventListener("input", () => this.renderFileList());
    const activeFile = this.app.workspace.getActiveFile();
    const currentBtn = toolbar.createEl("button", { text: "选择当前文档" });
    currentBtn.disabled = !(activeFile instanceof obsidian.TFile && TEXT_IMPORT_EXT.has(String(activeFile.extension || "").toLowerCase()));
    currentBtn.onclick = () => {
      if (!(activeFile instanceof obsidian.TFile)) return;
      this.selected.add(activeFile.path);
      this.renderFileList();
      this.updateButton();
    };
    const clearBtn = toolbar.createEl("button", { text: "清空选择" });
    clearBtn.onclick = () => {
      this.selected.clear();
      this.syncCheckboxes();
      this.updateButton();
    };

    this.categoryFilterEl = contentEl.createDiv({ cls: "lexvoice-import-category-filter" });
    this.renderCategoryFilters();

    this.listEl = contentEl.createDiv({ cls: "lexvoice-import-list" });
    this.renderFileList();
    this.loadTextFiles();

    const actions = contentEl.createDiv({ cls: "lexvoice-import-actions" });
    this.processBtn = actions.createEl("button", { text: "开始处理（0 个文件）", cls: "mod-cta" });
    this.processBtn.disabled = true;
    this.processBtn.onclick = () => this.process();
    this.selectionText = actions.createSpan({ cls: "lexvoice-import-selection", text: "未选择文本" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => this.close();
    this.updateButton();
  }

  async loadTextFiles() {
    this.loadingFiles = true;
    this.renderFileList();
    try {
      this.files = await this.collectTextFiles();
    } catch (e) {
      console.error("[LexVoice] collect import text files failed", e);
      this.files = [];
      new obsidian.Notice(`读取文本文件列表失败：${(e && e.message) || e}`, 8000);
    }
    this.loadingFiles = false;
    this.renderCategoryFilters();
    this.renderFileList();
    this.updateButton();
  }

  async collectTextFiles() {
    const files = this.app.vault.getFiles()
      .filter((file) => file instanceof obsidian.TFile && TEXT_IMPORT_EXT.has(String(file.extension || "").toLowerCase()))
      .filter((file) => !obsidian.normalizePath(file.path).startsWith(".obsidian/"))
      .sort((a, b) => b.stat.mtime - a.stat.mtime || a.path.localeCompare(b.path));
    const items = [];
    for (const file of files) {
      let content = "";
      let classification = {
        category: "external",
        badge: "未读取",
        reason: "文件内容读取失败",
        statusTitle: "文件内容读取失败",
      };
      try {
        content = typeof this.app.vault.cachedRead === "function"
          ? await this.app.vault.cachedRead(file)
          : await this.app.vault.read(file);
        classification = classifyImportTextFileForModal(file, content);
      } catch (e) {
        console.warn("[LexVoice] import text classify failed", file.path, e);
      }
      items.push(Object.assign({ file }, classification));
    }
    return items;
  }

  getCategoryCounts(items = this.files) {
    const counts = { all: (items || []).length };
    for (const key of IMPORT_TEXT_CATEGORY_ORDER) counts[key] = 0;
    for (const item of items || []) {
      const key = item && item.category || "external";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  renderCategoryFilters() {
    if (!this.categoryFilterEl) return;
    this.categoryFilterEl.empty();
    this.categoryButtons = new Map();
    const counts = this.getCategoryCounts();
    const filters = [
      { id: "all", label: "全部", desc: "显示全部可导入文本" },
      ...IMPORT_TEXT_CATEGORY_ORDER.map((id) => ({
        id,
        label: IMPORT_TEXT_CATEGORY_CONFIG[id].shortLabel,
        desc: IMPORT_TEXT_CATEGORY_CONFIG[id].label,
      })),
    ];
    for (const filter of filters) {
      const btn = this.categoryFilterEl.createEl("button", {
        cls: "lexvoice-import-category-button",
        attr: { type: "button", title: filter.desc },
      });
      btn.createSpan({ cls: "lexvoice-import-category-label", text: filter.label });
      btn.createSpan({ cls: "lexvoice-import-category-count", text: String(counts[filter.id] || 0) });
      if (this.categoryFilter === filter.id) btn.addClass("is-active");
      btn.onclick = () => {
        this.categoryFilter = filter.id;
        this.renderCategoryFilters();
        this.renderFileList();
      };
      this.categoryButtons.set(filter.id, btn);
    }
  }

  renderModeControl(parent) {
    this.selectedMode = getEffectivePolishMode(this.plugin.settings, this.selectedMode || this.plugin.settings.polishMode, "meeting");
    const box = parent.createDiv({ cls: "lexvoice-import-mode" });
    const label = box.createDiv({ cls: "lexvoice-import-mode-label" });
    label.createDiv({ cls: "lexvoice-import-mode-title", text: "整理方式" });
    this.modeHint = label.createDiv({ cls: "lexvoice-import-mode-hint" });
    this.modeSelect = box.createEl("select", { cls: "dropdown lexvoice-import-mode-select" });
    for (const [key, name] of getVisibleModeEntries(this.plugin.settings, false)) {
      this.modeSelect.createEl("option", { value: key, text: name });
    }
    this.modeSelect.value = this.selectedMode;
    this.modeSelect.onchange = () => {
      this.selectedMode = getEffectivePolishMode(this.plugin.settings, this.modeSelect.value, "meeting");
      this.updateModeHint();
    };
    this.updateModeHint();
  }

  updateModeHint() {
    if (!this.modeHint) return;
    const meta = getModeMeta(this.plugin.settings, this.selectedMode);
    if (this.selectedMode === "recruit") {
      this.modeHint.setText("招聘评估会在开始整理前弹出 JD / 简历 / 候选人信息窗口，文本内容会和岗位上下文一起进入整理链路。");
      this.modeHint.addClass("is-recruit");
    } else {
      this.modeHint.removeClass("is-recruit");
      this.modeHint.setText((meta.goal || "用于生成结构化纪要。") + " 本次只处理文本，不调用语音转写服务。");
    }
  }

  renderFileList() {
    if (!this.listEl) return;
    this.listEl.empty();
    this.fileCheckboxes = new Map();
    if (this.loadingFiles) {
      this.listEl.createDiv({ cls: "lexvoice-import-empty", text: "正在扫描可导入文本…" });
      return;
    }
    const q = String(this.searchInput && this.searchInput.value || "").trim().toLowerCase();
    const matched = this.files.filter((file) => {
      if (this.categoryFilter !== "all" && file.category !== this.categoryFilter) return false;
      const realFile = file.file || file;
      if (!q) return true;
      return String(realFile.path || "").toLowerCase().includes(q) || String(realFile.basename || "").toLowerCase().includes(q);
    });
    if (!matched.length) {
      this.listEl.createDiv({ cls: "lexvoice-import-empty", text: q ? "没有匹配的文本文件" : "库中没有可导入的 Markdown / 文本文件" });
      return;
    }
    let rendered = 0;
    for (const category of IMPORT_TEXT_CATEGORY_ORDER) {
      if (this.categoryFilter !== "all" && this.categoryFilter !== category) continue;
      const group = matched.filter((item) => item.category === category);
      if (!group.length) continue;
      const config = IMPORT_TEXT_CATEGORY_CONFIG[category] || IMPORT_TEXT_CATEGORY_CONFIG.external;
      const section = this.listEl.createDiv({ cls: `lexvoice-import-section lexvoice-import-section-${category}` });
      const head = section.createDiv({ cls: "lexvoice-import-section-head" });
      const titleWrap = head.createDiv({ cls: "lexvoice-import-section-copy" });
      titleWrap.createDiv({ cls: "lexvoice-import-section-title", text: `${config.label}（${group.length}）` });
      titleWrap.createDiv({ cls: "lexvoice-import-section-desc", text: config.desc });
      const shown = group.slice(0, Math.max(0, 240 - rendered));
      shown.forEach((item, index) => this.renderSingleFile(section, item, rendered + index));
      rendered += shown.length;
      if (group.length > shown.length) {
        section.createDiv({ cls: "lexvoice-import-warn", text: `本组文件较多，已显示最近 ${shown.length} / ${group.length} 个；可继续搜索文件名或路径。` });
      }
      if (rendered >= 240) break;
    }
    if (matched.length > rendered) {
      this.listEl.createDiv({ cls: "lexvoice-import-warn", text: "文件较多，可输入文件名或路径继续筛选。" });
    }
    this.syncCheckboxes();
  }

  formatFileMeta(file) {
    const size = Number(file.stat && file.stat.size || 0);
    const sizeText = size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + " MB" : Math.max(0, Math.round(size / 1024)) + " KB";
    const time = window.moment(file.stat.mtime).format("MM-DD HH:mm");
    return `${sizeText} · ${time} · ${file.path}`;
  }

  renderSingleFile(parent, item, index = 0) {
    const file = item && item.file ? item.file : item;
    const row = parent.createDiv({ cls: "lexvoice-import-row" });
    if (item && item.category) row.addClass(`is-${item.category}`);
    const id = makeImportTextCheckboxId(file.path, index);
    const cb = row.createEl("input", { type: "checkbox", attr: { id } });
    const label = row.createEl("label", { attr: { for: id }, cls: "lexvoice-import-label" });
    const nameRow = label.createDiv({ cls: "lexvoice-import-name-row" });
    nameRow.createEl("span", { cls: "lexvoice-import-name", text: file.basename });
    if (item && item.badge) {
      nameRow.createEl("span", {
        cls: `lexvoice-import-badge lexvoice-import-badge-${item.category || "external"}`,
        text: item.badge,
        attr: item.statusTitle ? { title: item.statusTitle } : {},
      });
    }
    label.createEl("div", { cls: "lexvoice-import-meta", text: this.formatFileMeta(file) });
    if (item && item.reason) {
      label.createEl("div", { cls: "lexvoice-import-reason", text: item.reason });
    }
    this.fileCheckboxes.set(file.path, cb);
    cb.onchange = () => {
      if (cb.checked) this.selected.add(file.path);
      else this.selected.delete(file.path);
      this.updateButton();
    };
  }

  syncCheckboxes() {
    for (const [path, cb] of this.fileCheckboxes.entries()) cb.checked = this.selected.has(path);
  }

  updateButton() {
    const count = this.selected.size;
    if (this.processBtn) {
      this.processBtn.setText(`开始处理（${count} 个文件）`);
      this.processBtn.disabled = count === 0;
    }
    if (this.selectionText) {
      this.selectionText.setText(count ? "将按文件名升序合并为一份 LexVoice 纪要" : "未选择文本");
    }
  }

  async process() {
    const paths = Array.from(this.selected);
    if (!paths.length) return;
    const mode = getEffectivePolishMode(this.plugin.settings, this.selectedMode || this.plugin.settings.polishMode, "meeting");
    if (this.processBtn) {
      this.processBtn.disabled = true;
      this.processBtn.setText("处理中…");
    }
    try {
      this.close();
      await this.plugin.importTextFiles(paths, mode);
    } catch (e) {
      console.error("[LexVoice] import text failed", e);
      if (this.plugin && this.plugin.logDiagnostic) {
        try {
          await this.plugin.logDiagnostic("error", "text_import.failed", "导入文本整理失败", {
            mode,
            count: paths.length,
            error: diagnosticError(e),
          });
        } catch (logError) {
          console.warn("[LexVoice] import text diagnostic failed", logError);
        }
      }
      new obsidian.Notice(`导入文本失败：${(e && e.message) || e}`, 8000);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class ImportAudioModal extends obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.selected = new Set();
    this.processBtn = null;
    this.selectionText = null;
    this.modeSelect = null;
    this.modeHint = null;
    this.selectedMode = getEffectivePolishMode(plugin.settings, plugin.settings.polishMode, "meeting");
    this.batches = [];
    this.groupCheckboxes = new Map();
    this.fileCheckboxes = new Map();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-import-modal");
    this.selected.clear();
    this.groupCheckboxes = new Map();
    this.fileCheckboxes = new Map();
    contentEl.createEl("h2", { text: "导入音频" });
    const desc = contentEl.createEl("p", { cls: "lexvoice-import-desc" });
    desc.setText(`从 ${this.plugin.settings.audioFolder} 选择音频。支持 WebM、M4A/MP4、MP3、WAV、AAC、OGG、FLAC 等格式；LexVoice 切片会自动按一次录音折叠成批次。`);

    this.renderModeControl(contentEl);

    const folderPath = obsidian.normalizePath(this.plugin.settings.audioFolder);
    const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof obsidian.TFolder)) {
      contentEl.createEl("p", { text: `音频文件夹不存在：${folderPath}` });
      return;
    }
    const files = folder.children
      .filter((f) => f instanceof obsidian.TFile && AUDIO_EXT.has(f.extension.toLowerCase()))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (!files.length) {
      contentEl.createEl("p", { text: "音频文件夹无可识别的音频文件" });
      return;
    }

    const grouped = this.buildBatches(files);
    this.batches = grouped.batches;

    const toolbar = contentEl.createDiv({ cls: "lexvoice-import-toolbar" });
    const latestBtn = toolbar.createEl("button", { text: "选择最近一组" });
    latestBtn.disabled = grouped.batches.length === 0;
    latestBtn.onclick = () => {
      if (!this.batches.length) return;
      this.selected.clear();
      this.setBatchSelected(this.batches[0], true);
      this.updateButton();
    };
    const clearBtn = toolbar.createEl("button", { text: "清空选择" });
    clearBtn.onclick = () => {
      this.selected.clear();
      this.syncAllCheckboxes();
      this.updateButton();
    };

    const list = contentEl.createDiv({ cls: "lexvoice-import-list" });
    if (grouped.batches.length) {
      list.createDiv({ cls: "lexvoice-import-section-title", text: "录音批次" });
      grouped.batches.forEach((batch) => this.renderBatch(list, batch));
    }
    if (grouped.singles.length) {
      list.createDiv({ cls: "lexvoice-import-section-title", text: grouped.batches.length ? "独立音频" : "音频文件" });
      grouped.singles.forEach((file) => this.renderSingleFile(list, file));
    }

    const actions = contentEl.createDiv({ cls: "lexvoice-import-actions" });
    this.processBtn = actions.createEl("button", { text: "开始处理（0 个文件）", cls: "mod-cta" });
    this.processBtn.disabled = true;
    this.processBtn.onclick = () => this.process();
    this.selectionText = actions.createSpan({ cls: "lexvoice-import-selection", text: "未选择音频" });
    const cancelBtn = actions.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => this.close();
    this.updateButton();
  }
  renderModeControl(parent) {
    this.selectedMode = getEffectivePolishMode(this.plugin.settings, this.selectedMode || this.plugin.settings.polishMode, "meeting");
    const box = parent.createDiv({ cls: "lexvoice-import-mode" });
    const label = box.createDiv({ cls: "lexvoice-import-mode-label" });
    label.createDiv({ cls: "lexvoice-import-mode-title", text: "整理方式" });
    this.modeHint = label.createDiv({ cls: "lexvoice-import-mode-hint" });
    this.modeSelect = box.createEl("select", { cls: "dropdown lexvoice-import-mode-select" });
    for (const [key, name] of getVisibleModeEntries(this.plugin.settings, false)) {
      this.modeSelect.createEl("option", { value: key, text: name });
    }
    this.modeSelect.value = this.selectedMode;
    this.modeSelect.onchange = () => {
      this.selectedMode = getEffectivePolishMode(this.plugin.settings, this.modeSelect.value, "meeting");
      this.updateModeHint();
    };
    this.updateModeHint();
  }
  updateModeHint() {
    if (!this.modeHint) return;
    const meta = getModeMeta(this.plugin.settings, this.selectedMode);
    if (this.selectedMode === "recruit") {
      this.modeHint.setText("招聘评估会在开始处理前弹出 JD / 简历 / 候选人信息窗口。");
      this.modeHint.addClass("is-recruit");
    } else {
      this.modeHint.removeClass("is-recruit");
      this.modeHint.setText((meta.goal || "用于生成结构化纪要。") + " 可在本次导入中临时切换，不会修改默认提示词。");
    }
  }
  parseLexVoiceSegment(file) {
    const match = String(file.name || "").match(/^lex-(\d{8}-\d{6})-seg(\d+)\.([a-z0-9]+)$/i);
    if (!match) return null;
    return {
      stamp: match[1],
      seg: Number(match[2]),
      ext: match[3].toLowerCase(),
    };
  }
  buildBatches(files) {
    const byStamp = new Map();
    const singles = [];
    for (const file of files) {
      const info = this.parseLexVoiceSegment(file);
      if (!info) {
        singles.push(file);
        continue;
      }
      if (!byStamp.has(info.stamp)) {
        byStamp.set(info.stamp, { id: info.stamp, stamp: info.stamp, items: [] });
      }
      byStamp.get(info.stamp).items.push({ file, seg: info.seg, ext: info.ext });
    }
    const batches = Array.from(byStamp.values())
      .map((batch) => {
        batch.items.sort((a, b) => a.seg - b.seg || a.file.name.localeCompare(b.file.name));
        batch.files = batch.items.map((x) => x.file);
        batch.totalSize = batch.files.reduce((sum, f) => sum + (f.stat && f.stat.size ? f.stat.size : 0), 0);
        batch.latestMtime = Math.max(...batch.files.map((f) => f.stat.mtime || 0));
        batch.earliestMtime = Math.min(...batch.files.map((f) => f.stat.mtime || 0));
        const segs = batch.items.map((x) => x.seg).filter(Number.isFinite);
        batch.firstSeg = Math.min(...segs);
        batch.lastSeg = Math.max(...segs);
        const present = new Set(segs);
        batch.missing = [];
        for (let i = batch.firstSeg; i <= batch.lastSeg; i++) if (!present.has(i)) batch.missing.push(i);
        batch.emptyCount = batch.files.filter((f) => (f.stat && f.stat.size || 0) <= 1024).length;
        batch.largeCount = batch.files.filter((f) => (f.stat && f.stat.size || 0) > 25 * 1024 * 1024).length;
        return batch;
      })
      .sort((a, b) => b.latestMtime - a.latestMtime || b.stamp.localeCompare(a.stamp));
    singles.sort((a, b) => b.stat.mtime - a.stat.mtime || a.name.localeCompare(b.name));
    return { batches, singles };
  }
  formatStamp(stamp) {
    const m = window.moment ? window.moment(stamp, "YYYYMMDD-HHmmss") : null;
    return m && m.isValid && m.isValid() ? m.format("YYYY-MM-DD HH:mm") : stamp;
  }
  formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return Math.max(0, Math.round(n / 1024)) + " KB";
  }
  formatFileMeta(file) {
    const mtime = window.moment(file.stat.mtime).format("MM-DD HH:mm");
    return `${this.formatSize(file.stat.size)} · ${mtime}`;
  }
  renderBatch(parent, batch) {
    const details = parent.createEl("details", { cls: "lexvoice-import-batch" });
    const summary = details.createEl("summary", { cls: "lexvoice-import-batch-summary" });
    const cb = summary.createEl("input", { type: "checkbox" });
    cb.addEventListener("click", (evt) => evt.stopPropagation());
    cb.onchange = () => {
      this.setBatchSelected(batch, cb.checked);
      this.updateButton();
    };
    this.groupCheckboxes.set(batch.id, cb);

    const text = summary.createDiv({ cls: "lexvoice-import-batch-text" });
    text.createDiv({ cls: "lexvoice-import-batch-name", text: `${this.formatStamp(batch.stamp)} · ${batch.files.length} 段` });
    const range = `seg${pad(batch.firstSeg)}–seg${pad(batch.lastSeg)}`;
    const timeRange = `${window.moment(batch.earliestMtime).format("MM-DD HH:mm")}–${window.moment(batch.latestMtime).format("HH:mm")}`;
    text.createDiv({ cls: "lexvoice-import-batch-meta", text: `${range} · ${this.formatSize(batch.totalSize)} · ${timeRange}` });

    const chip = summary.createSpan({ cls: "lexvoice-import-batch-chip", text: "整组" });
    chip.setAttr("aria-hidden", "true");

    if (batch.missing.length || batch.emptyCount || batch.largeCount) {
      const warns = [];
      if (batch.missing.length) warns.push("可能缺少 " + batch.missing.map((n) => "seg" + pad(n)).join("、"));
      if (batch.emptyCount) warns.push(`${batch.emptyCount} 个片段接近空文件`);
      if (batch.largeCount) warns.push(`${batch.largeCount} 个片段超过 25 MB`);
      details.createDiv({ cls: "lexvoice-import-warn", text: warns.join("；") });
    }

    const fileList = details.createDiv({ cls: "lexvoice-import-batch-files" });
    for (const item of batch.items) {
      this.renderSingleFile(fileList, item.file, { compact: true, seg: item.seg, batch });
    }
  }
  renderSingleFile(parent, file, options = {}) {
    const compact = !!options.compact;
    const row = parent.createDiv({ cls: compact ? "lexvoice-import-row is-compact" : "lexvoice-import-row" });
    const cbId = `lv-import-${file.path.replace(/[^a-z0-9]/gi, "_")}`;
    const cb = row.createEl("input", { type: "checkbox", attr: { id: cbId } });
    const lbl = row.createEl("label", { attr: { for: cbId }, cls: "lexvoice-import-label" });
    const name = options.seg ? `seg${pad(options.seg)} · ${file.name}` : file.name;
    lbl.createEl("div", { cls: "lexvoice-import-name", text: name });
    lbl.createEl("div", { cls: "lexvoice-import-meta", text: this.formatFileMeta(file) });
    if (file.stat.size > 25 * 1024 * 1024) {
      lbl.createEl("div", { cls: "lexvoice-import-warn", text: "文件超过 25 MB，多数转写 API 会拒绝。建议先降码率。" });
    }
    this.fileCheckboxes.set(file.path, cb);
    cb.onchange = () => {
      if (cb.checked) this.selected.add(file.path);
      else this.selected.delete(file.path);
      this.syncAllCheckboxes();
      this.updateButton();
    };
  }
  setBatchSelected(batch, checked) {
    for (const file of batch.files || []) {
      if (checked) this.selected.add(file.path);
      else this.selected.delete(file.path);
    }
    this.syncAllCheckboxes();
  }
  syncAllCheckboxes() {
    for (const [path, cb] of this.fileCheckboxes.entries()) {
      cb.checked = this.selected.has(path);
    }
    for (const batch of this.batches || []) {
      const cb = this.groupCheckboxes.get(batch.id);
      if (!cb) continue;
      const count = batch.files.filter((f) => this.selected.has(f.path)).length;
      cb.checked = count > 0 && count === batch.files.length;
      cb.indeterminate = count > 0 && count < batch.files.length;
    }
  }
  updateButton() {
    if (!this.processBtn) return;
    const n = this.selected.size;
    const fullBatches = (this.batches || []).filter((batch) => batch.files.length && batch.files.every((f) => this.selected.has(f.path))).length;
    const label = fullBatches > 0 ? `${fullBatches} 组 / ${n} 个文件` : `${n} 个文件`;
    this.processBtn.setText(`开始处理（${label}）`);
    this.processBtn.disabled = n === 0;
    if (this.selectionText) {
      this.selectionText.setText(n ? `将按文件名升序合并处理` : "未选择音频");
    }
  }
  async process() {
    const paths = Array.from(this.selected);
    if (!paths.length) return;
    const mode = getEffectivePolishMode(this.plugin.settings, this.selectedMode || this.plugin.settings.polishMode, "meeting");
    this.close();
    await this.plugin.importAudioFiles(paths, mode);
  }
  onClose() { this.contentEl.empty(); }
}

export class BubbleWidget {
  constructor(plugin) {
    this.plugin = plugin;
    this.wrapEl = null;
    this.el = null;
    this.drag = null;
    this.hideTimer = null;
    this.ribbonEl = null;
    this.ribbonHandlers = null;
    this.unsubscribe = null;
    this.resizeHandler = null;
  }
  mount(ribbonEl) {
    if (this.wrapEl) return;
    this.ribbonEl = ribbonEl || null;
    const wrapEl = document.body.createDiv({ cls: "lexvoice-bubble-wrap" });
    const el = wrapEl.createDiv({ cls: "lexvoice-bubble is-idle" });
    this.wrapEl = wrapEl;
    this.el = el;
    this._lastSig = "";
    this._renderRaf = 0;
    this.render();
    const pos = this.plugin.settings.floatingBallPos || null;
    if (pos && pos.userSet) {
      wrapEl.style.left = `${Math.max(0, pos.left || 0)}px`;
      wrapEl.style.top = `${Math.max(0, pos.top || 0)}px`;
      this.keepInViewport();
    } else {
      this.placeDefault();
    }
    this.updateDockTail();
    this.show();
    this.resizeHandler = () => {
      if (!this.wrapEl) return;
      if (!(this.plugin.settings.floatingBallPos || {}).userSet) this.placeDefault();
      else this.keepInViewport();
      this.updateDockTail();
    };
    window.addEventListener("resize", this.resizeHandler);
    this.attachHover();
    this.attachDrag();
    this.unsubscribe = this.plugin.recorder.on(() => this.scheduleUpdate());
    this.bindRibbon();
  }
  placeDefault() {
    if (!this.wrapEl) return;
    const rect = this.wrapEl.getBoundingClientRect();
    const width = rect.width || 168;
    const height = rect.height || 40;
    const margin = 18;
    this.wrapEl.style.left = `${Math.max(margin, window.innerWidth - width - margin)}px`;
    this.wrapEl.style.top = `${Math.max(72, window.innerHeight - height - 58)}px`;
  }
  keepInViewport() {
    if (!this.wrapEl) return;
    const rect = this.wrapEl.getBoundingClientRect();
    const width = rect.width || 168;
    const height = rect.height || 40;
    const margin = 8;
    const left = parseFloat(this.wrapEl.style.left) || 0;
    const top = parseFloat(this.wrapEl.style.top) || 0;
    this.wrapEl.style.left = `${Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin))}px`;
    this.wrapEl.style.top = `${Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin))}px`;
  }
  updateDockTail() {
    if (!this.wrapEl) return;
    this.wrapEl.removeClass("has-tail");
    this.wrapEl.removeClass("tail-left");
    this.wrapEl.removeClass("tail-right");
    this.wrapEl.removeClass("tail-top");
    this.wrapEl.removeClass("tail-bottom");
    const rect = this.wrapEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const threshold = 54;
    const bottomThreshold = 92;
    const top = rect.top;
    const left = rect.left;
    const right = window.innerWidth - rect.right;
    const bottom = window.innerHeight - rect.bottom;
    let tail = "";
    if (bottom <= bottomThreshold) tail = "bottom";
    else if (top <= threshold) tail = "top";
    else if (left <= threshold) tail = "left";
    else if (right <= threshold) tail = "right";
    if (!tail) return;
    this.wrapEl.addClass("has-tail");
    this.wrapEl.addClass("tail-" + tail);
  }
  unmount() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (this.hideTimer) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this._renderRaf) { cancelAnimationFrame(this._renderRaf); this._renderRaf = 0; }
    if (this.resizeHandler) { window.removeEventListener("resize", this.resizeHandler); this.resizeHandler = null; }
    this.unbindRibbon();
    if (this.wrapEl) { this.wrapEl.remove(); this.wrapEl = null; this.el = null; }
  }
  scheduleUpdate() {
    if (this._renderRaf) return;
    this._renderRaf = requestAnimationFrame(() => {
      this._renderRaf = 0;
      const info = this.plugin.recorder.getInfo();
      const queue = this.plugin.queue;
      const hasPromptJob = !!(queue && queue.hasPendingGeneratePrompt && queue.hasPendingGeneratePrompt());
      const sig = `${info.state}|${hasPromptJob ? "P" : ""}`;
      if (sig === this._lastSig) {
        const t = this.el && this.el.querySelector(".lexvoice-bubble-timer");
        if (t) t.setText(formatElapsed(info.elapsed));
      } else {
        this._lastSig = sig;
        this.render();
        this.updateDockTail();
      }
    });
  }
  bindRibbon() {
    if (!this.ribbonEl) return;
    const enter = () => this.show();
    const leave = () => this.scheduleHide();
    this.ribbonEl.addEventListener("mouseenter", enter);
    this.ribbonEl.addEventListener("mouseleave", leave);
    this.ribbonHandlers = { enter, leave };
  }
  unbindRibbon() {
    if (!this.ribbonEl || !this.ribbonHandlers) return;
    this.ribbonEl.removeEventListener("mouseenter", this.ribbonHandlers.enter);
    this.ribbonEl.removeEventListener("mouseleave", this.ribbonHandlers.leave);
    this.ribbonHandlers = null;
  }
  show() {
    if (!this.wrapEl) return;
    this.wrapEl.addClass("is-visible");
    if (this.hideTimer) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
  }
  hide() {
    // 停靠式悬浮窗常驻显示；关闭由设置项控制。
    if (!this.wrapEl) return;
    this.show();
  }
  scheduleHide() {
    // 保持常驻，避免脱离侧边栏后找不到录音控制器。
    if (this.hideTimer) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
  }
  attachHover() {
    this.wrapEl.addEventListener("mouseenter", () => this.show());
    this.wrapEl.addEventListener("mouseleave", () => this.scheduleHide());
  }
  render() {
    if (!this.el) return;
    const info = this.plugin.recorder.getInfo();
    this.el.empty();
    this.el.removeClass("is-idle"); this.el.removeClass("is-recording"); this.el.removeClass("is-paused");
    if (this.wrapEl) this.wrapEl.removeClass("is-recording-wrap");
    const makeDocButton = (title, handler) => {
      const jumpBtn = this.el.createEl("button", { cls: "lexvoice-bubble-jump", attr: { title, "aria-label": title } });
      // 用 Lucide 图标替代之前 CSS 画的文档形状。
      // 关键：setIcon 对无效图标名通常静默不加 svg（不抛异常），会得到空按钮 → 图标"看不见"。
      // 所以逐个尝试候选图标名，并显式验证 svg 真的被插入；都失败再走 CSS fallback 形状。
      const iconCandidates = ["file-text", "lucide-file-text", "file"];
      let painted = false;
      for (const name of iconCandidates) {
        try {
          jumpBtn.empty();
          obsidian.setIcon(jumpBtn, name);
          if (jumpBtn.querySelector("svg")) { painted = true; break; }
        } catch {}
      }
      if (!painted) {
        jumpBtn.empty();
        jumpBtn.addClass("is-fallback-icon");  // CSS 画的文档轮廓兜底
      }
      jumpBtn.onclick = (e) => { e.stopPropagation(); handler(); };
      return jumpBtn;
    };
    if (info.state === "idle") {
      this.el.addClass("is-idle");
      makeDocButton("打开最近一篇录音笔记", () => this.plugin.openRecentNote());
      const btn = this.el.createEl("button", { cls: "lexvoice-bubble-main", attr: { title: "开始录音" } });
      btn.createSpan({ cls: "lexvoice-bubble-record-dot" });
      btn.onclick = (e) => { e.stopPropagation(); this.plugin.startRecording(); };
      this.el.createEl("span", { cls: "lexvoice-bubble-label", text: "开始录音" });
      if (this.plugin.queue && this.plugin.queue.hasPendingGeneratePrompt && this.plugin.queue.hasPendingGeneratePrompt()) {
        const chip = this.el.createDiv({ cls: "lexvoice-bubble-chip" });
        chip.setText("优化提示词中");
        chip.setAttr("title", "后台正在生成自定义提示词。完成后会出现在提示词管理和录音模式列表里。");
      }
    } else {
      this.el.addClass(info.state === "paused" ? "is-paused" : "is-recording");
      if (info.state === "recording" && this.wrapEl) this.wrapEl.addClass("is-recording-wrap");
      this.show();
      makeDocButton("跳到当前录音笔记的转写位置", () => this.plugin.openSessionNote());
      const ctrl = this.el.createDiv({ cls: "lexvoice-bubble-ctrl" });
      const pauseBtn = ctrl.createEl("button", { cls: `lexvoice-bubble-btn ${info.state === "paused" ? "is-play-icon" : "is-pause-icon"}`, attr: { title: info.state === "paused" ? "继续" : "暂停", "aria-label": info.state === "paused" ? "继续" : "暂停" } });
      pauseBtn.onclick = (e) => { e.stopPropagation(); info.state === "paused" ? this.plugin.recorder.resume() : this.plugin.recorder.pause(); };
      const stopBtn = ctrl.createEl("button", { cls: "lexvoice-bubble-btn stop is-stop-icon", attr: { title: "停止并合并润色", "aria-label": "停止并合并润色" } });
      stopBtn.onclick = (e) => { e.stopPropagation(); this.plugin.stopRecording(); };
      const timer = this.el.createDiv({ cls: "lexvoice-bubble-timer" });
      timer.setText(formatElapsed(info.elapsed));
    }
  }
  attachDrag() {
    const wrapEl = this.wrapEl;
    wrapEl.addEventListener("pointerdown", (e) => {
      if (e.target instanceof HTMLElement && e.target.tagName === "BUTTON") return;
      this.drag = {
        startX: e.clientX, startY: e.clientY,
        startLeft: parseFloat(wrapEl.style.left) || 60,
        startTop: parseFloat(wrapEl.style.top) || 120,
      };
      try { wrapEl.setPointerCapture(e.pointerId); } catch {}
    });
    wrapEl.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.startX;
      const dy = e.clientY - this.drag.startY;
      wrapEl.style.left = `${Math.max(0, this.drag.startLeft + dx)}px`;
      wrapEl.style.top = `${Math.max(0, this.drag.startTop + dy)}px`;
      this.keepInViewport();
      this.updateDockTail();
    });
    const endDrag = (e) => {
      if (!this.drag) return;
      this.keepInViewport();
      this.updateDockTail();
      this.plugin.settings.floatingBallPos = {
        left: parseFloat(wrapEl.style.left) || 60,
        top: parseFloat(wrapEl.style.top) || 120,
        userSet: true,
      };
      this.plugin.saveSettings();
      this.drag = null;
      try { wrapEl.releasePointerCapture(e.pointerId); } catch {}
    };
    wrapEl.addEventListener("pointerup", endDrag);
    wrapEl.addEventListener("pointercancel", endDrag);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

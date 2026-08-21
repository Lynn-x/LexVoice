/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck — Modal/Widget class 密集（this.plugin.* 等无 TS 字段声明）；已用 tsc 确认无漏引用(TS2304=0)，余者皆类字段类型噪音，故与 main.ts 同档跳过。
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { loadPeopleDirectory, normalizePeopleRelation, normalizePeopleSuggestion } from '../people';
import { diagnosticError } from '../shared/util-key-diag';
import { classifyImportTextFileForModal, enumerateAudioDevices, lexvoiceConfirm, makeImportTextCheckboxId } from './helpers';
import { formatElapsed, pad } from '../shared/util-common';
import { desensitizeResumeText } from '../outline-text';
import { applyRecruitJdLibraryItem, createRecruitProject, extractCandidateNameFromResumeText, extractPdfTextBestEffort, getRecruitContextCopy, getRecruitInterviewOutline, getRecruitJdLibrary, getRecruitJdPreview, isRecruitFeatureUnlocked, listResumePdfs, normalizeRecruitContext, parseJdProject, upsertRecruitJdLibrary } from '../recruit';
import { AUDIO_EXT, IMPORT_TEXT_CATEGORY_CONFIG, IMPORT_TEXT_CATEGORY_ORDER, TEXT_IMPORT_EXT } from '../shared/catalog-import';
import { callLlm } from '../llm/core';
import { mimeFromExt } from '../shared/util-audio';
import { listJDProjects } from '../recruit/jd-projects';
import { getBuiltInVisiblePolishModeKeys, getCustomPromptModeTemplates, getEffectivePolishMode, getModeMeta, getVisibleModeEntries, isCustomPromptModeTemplate, makeCustomPromptModeId, sanitizePromptTemplate, setLexVoiceModePillIcon } from '../shared/mode-meta';
import { getActivityStagePosition } from '../shared/activity-progress';
import { getDesktopProcess } from '../shared/desktop-runtime';
import { isSpeakerDiarizationProvider, normalizeRequestedSpeakerCount } from '../asr/diarization';
import { isDashScopeFileTransProvider, resolveImportTranscribeProvider } from '../asr/long-audio-transcription';

function resolveImportSpeakerSelection(plugin) {
  const provider = resolveImportTranscribeProvider(plugin);
  const profile = plugin.getTranscribeProviderProfile(provider.id, provider);
  const supportsDiarization = !!(profile && profile.speakerDiarization)
    || isSpeakerDiarizationProvider(provider)
    || isDashScopeFileTransProvider(provider);
  const supportsExactCount = supportsDiarization && isDashScopeFileTransProvider(provider);
  const enabled = supportsDiarization && plugin.settings.importSpeakerDiarization !== false;
  return {
    supportsDiarization,
    supportsExactCount,
    enabled,
    count: enabled && supportsExactCount
      ? normalizeRequestedSpeakerCount(plugin.settings.importSpeakerCount)
      : 0,
  };
}

function renderImportSpeakerControl(parent, owner) {
  const box = parent.createDiv({ cls: "lexvoice-import-mode lexvoice-import-speaker" });
  const copy = box.createDiv();
  copy.createDiv({ cls: "lexvoice-import-mode-title", text: "说话人" });
  const hint = copy.createDiv({ cls: "lexvoice-import-mode-hint" });
  const control = box.createDiv({ cls: "lexvoice-import-speaker-control" });

  const toggleLabel = control.createEl("label", { cls: "lexvoice-import-speaker-toggle" });
  const toggle = toggleLabel.createEl("input", { type: "checkbox" });
  toggleLabel.createSpan({ text: "区分说话人" });
  toggle.checked = owner.selectedSpeakerDiarization;
  toggle.disabled = !owner.speakerSelection.supportsDiarization;

  let countInput = null;
  if (owner.speakerSelection.supportsExactCount) {
    const numberControl = control.createDiv({ cls: "lexvoice-import-number-control" });
    countInput = numberControl.createEl("input", {
      cls: "lexvoice-import-number-input is-compact",
      attr: {
        type: "number",
        min: "2",
        max: "100",
        step: "1",
        inputmode: "numeric",
        placeholder: "自动",
        "aria-label": "说话人数",
      },
    });
    countInput.value = owner.selectedSpeakerCount > 0 ? String(owner.selectedSpeakerCount) : "";
    countInput.disabled = !owner.selectedSpeakerDiarization;
    numberControl.createSpan({ cls: "lexvoice-import-number-unit", text: "人" });
    countInput.oninput = () => {
      const normalized = normalizeRequestedSpeakerCount(countInput.value);
      owner.selectedSpeakerCount = normalized;
      if (normalized > 0 && !toggle.checked) {
        toggle.checked = true;
        owner.selectedSpeakerDiarization = true;
        countInput.disabled = false;
      }
    };
  } else {
    control.createSpan({ cls: "lexvoice-import-speaker-auto", text: "自动识别人数" });
  }

  if (!owner.speakerSelection.supportsDiarization) {
    hint.setText("当前导入转写模型不支持说话人区分。");
  } else if (owner.speakerSelection.supportsExactCount) {
    hint.setText("填写实际发言人数可减少相近声音被合并；留空则自动识别。");
  } else {
    hint.setText("当前模型支持区分说话人，但人数由模型自动识别。");
  }

  toggle.onchange = () => {
    owner.selectedSpeakerDiarization = toggle.checked;
    if (!toggle.checked) owner.selectedSpeakerCount = 0;
    if (countInput) {
      countInput.disabled = !toggle.checked;
      if (!toggle.checked) countInput.value = "";
    }
  };
}
export function pickReportAccentColor(app, defaultHex) {
  return new Promise((resolve) => {
    const modal = new obsidian.Modal(app);
    modal.titleEl.setText("选择报告配色");
    let chosen = defaultHex || "#E85F28";
    let settled = false;
    const finish = (val) => { if (settled) return; settled = true; resolve(val); try { modal.close(); } catch { /* intentionally empty */ } };
    const wrap = modal.contentEl.createDiv({ cls: "lexvoice-color-pick" });
    wrap.createEl("p", { cls: "lexvoice-color-hint", text: "报告会使用所选颜色，版式保持不变。可重复生成，不会覆盖已有文件。" });
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
          audio.play().catch(() => { /* intentionally empty */ });
        } catch { /* intentionally empty */ }
      });
    } catch (e) {
      console.error("[LexVoice] audio time modal failed", e);
      contentEl.createDiv({ cls: "lexvoice-audio-modal-error", text: `无法读取音频：${(e && e.message) || e}` });
    }

    const actions = contentEl.createDiv({ cls: "lexvoice-audio-modal-actions" });
    actions.createEl("button", { text: "打开音频文件" }).onclick = () => {
      void this.app.workspace.getLeaf(false).openFile(this.file);
    };
  }

  onClose() {
    this.contentEl.empty();
    if (this.objectUrl) {
      try { URL.revokeObjectURL(this.objectUrl); } catch { /* intentionally empty */ }
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
    contentEl.createEl("h2", { text: "确认人员归属" });
    contentEl.createDiv({
      cls: "setting-item-description",
      text: this.sourceFile
        ? "LexVoice 只会发送当前笔记内容到已配置的大模型，用于生成候选人员建议；已有人员资料仅在本地用于匹配和去重，不随请求发送。确认后会把这次会议的人物归属写回纪要，并维护对应人员页。"
        : this.options.fromIgnored
          ? `这里是已忽略的 ${this.options.ignoredCount || this.suggestions.length} 条人员建议。误操作的建议可以先恢复到待确认，也可以直接修改后保存进人员资料；保存后会自动移出忽略列表。`
        : this.options.fromCache
          ? `这里是上次扫描后尚未处理的 ${this.options.cachedCount || this.suggestions.length} 条人员建议。保存、忽略或清空前，它们会保留在本地设置中，方便稍后继续处理。`
        : `LexVoice 已扫描转写纪要库中的 ${this.options.scannedCount || 0} 篇笔记，只显示需要确认的人员建议。已有人员资料仅在本地用于匹配和去重，不随请求发送。${this.options.remainingCount ? `本轮后仍有 ${this.options.remainingCount} 篇待扫描。` : ""}`,
    });
    contentEl.createDiv({
      cls: "setting-item-description lexvoice-people-suggestion-guide",
      text: "先判断这个名字归属于谁：已有人员就合并，新人再建档；本次归属用于区分参会人、被提到的人和待办责任人。下方资料只是补充信息，不需要靠改名来合并。",
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
      const badge = top.createSpan({ text: this.options.fromIgnored ? "已忽略" : (item.matchPath ? "合并到已有人员" : "新建人员"), cls: "lexvoice-people-suggestion-badge" });
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
      targetBox.createDiv({ cls: "lexvoice-people-suggestion-target-label", text: "归属到" });
      const targetSelect = targetBox.createEl("select", { cls: "dropdown lexvoice-people-suggestion-target-select" });
      targetSelect.createEl("option", { value: "", text: "新建人员档案" });
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
        if (this.options.fromIgnored) badge.setText(path ? "已忽略 · 合并到已有人员" : "已忽略 · 新建");
        else badge.setText(path ? "合并到已有人员" : "新建人员");
        matchMeta.setText(path ? ` · ${path}` : "");
        if (path && person) {
          targetHint.setText(getPersonHint(person) || "将把本条建议作为本次会议提及，挂到选中的人员档案。");
        } else if (path) {
          targetHint.setText("将把本条建议作为本次会议提及，挂到当前匹配的人员档案。");
        } else {
          targetHint.setText("将使用候选姓名新建一份人员档案。");
        }
      };
      targetSelect.addEventListener("change", updateTargetUi);
      updateTargetUi();

      let relationSelect;
      new obsidian.Setting(box).setName("本次归属")
        .setDesc("用于写回纪要：参会人、被提到的人、待办责任人会进入不同字段，人员页再反向聚合相关会议。")
        .addDropdown(d => {
          relationSelect = d;
          d.addOption("mentioned", "被提到的人");
          d.addOption("participant", "参会人");
          d.addOption("todo_owner", "待办责任人");
          d.setValue(normalizePeopleRelation(item.relation) || "mentioned");
        });

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
      rowRef = { item, checkbox, nameInput, aliasInput, roleInput, orgInput, relationSelect, noteArea };
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
    const saveBtn = actions.createEl("button", { text: "确认归属" });
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
            relation: row.relationSelect ? row.relationSelect.getValue() : row.item.relation,
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
        new obsidian.Notice(`人员归属已确认：新建 ${created}，合并 ${updated}`);
        this.close();
      } catch (e) {
        console.error("[LexVoice] apply people suggestions failed", e);
        new obsidian.Notice(`保存失败：${(e && e.message) || e}`, 8000);
      }
    };
  }
}

export class SpeakerNameConfirmModal extends obsidian.Modal {
  constructor(app, plugin, candidates, initialMappings, options = {}, onDone) {
    super(app);
    this.plugin = plugin;
    this.candidates = Array.isArray(candidates) ? candidates : [];
    this.initialMappings = initialMappings || {};
    this.options = options || {};
    this.onDone = onDone;
    this.rows = [];
    this.result = null;
    this.settled = false;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass("lexvoice-speaker-confirm-modal");
    contentEl.createEl("h2", { text: "确认说话人" });
    contentEl.createDiv({
      cls: "lexvoice-speaker-confirm-desc",
      text: "转写已完成。填写姓名后，AI 会按姓名整理发言、结论和待办；留空则继续使用说话人编号。",
    });
    if (this.options.unstableAcrossSegments) {
      contentEl.createDiv({
        cls: "lexvoice-speaker-confirm-warning",
        text: "当前转写由多个独立分段生成，说话人编号可能在分段之间变化。请根据发言示例核对；不确定时可以暂不填写。",
      });
    }

    let people = [];
    try { people = await loadPeopleDirectory(this.plugin); } catch { /* optional suggestions */ }
    const datalistId = `lexvoice-speaker-name-options-${Date.now()}`;
    const datalist = contentEl.createEl("datalist", { attr: { id: datalistId } });
    const knownNames = new Set();
    for (const person of people || []) {
      const name = String(person && person.name || "").trim();
      if (!name || knownNames.has(name)) continue;
      knownNames.add(name);
      datalist.createEl("option", { value: name });
    }

    const list = contentEl.createDiv({ cls: "lexvoice-speaker-confirm-list" });
    this.rows = [];
    for (const candidate of this.candidates) {
      const row = list.createDiv({ cls: "lexvoice-speaker-confirm-row" });
      const copy = row.createDiv({ cls: "lexvoice-speaker-confirm-copy" });
      copy.createDiv({ cls: "lexvoice-speaker-confirm-label", text: candidate.label || candidate.id });
      const samples = Array.isArray(candidate.samples) ? candidate.samples.filter(Boolean) : [];
      copy.createDiv({
        cls: "lexvoice-speaker-confirm-sample",
        text: samples.length ? samples.join(" / ") : "暂无可展示的发言示例",
      });
      const input = row.createEl("input", {
        cls: "lexvoice-speaker-confirm-input",
        type: "text",
        attr: {
          list: datalistId,
          placeholder: "输入姓名",
          "aria-label": `${candidate.label || candidate.id}的姓名`,
        },
      });
      input.value = String(this.initialMappings[candidate.id] && this.initialMappings[candidate.id].personName || "");
      this.rows.push({ candidate, input });
    }

    const actions = contentEl.createDiv({ cls: "modal-button-container lexvoice-speaker-confirm-actions" });
    const skip = actions.createEl("button", { text: "暂不填写" });
    skip.onclick = () => this.close();
    const confirm = actions.createEl("button", { text: "确认并继续" });
    confirm.addClass("mod-cta");
    confirm.onclick = () => {
      this.result = Object.fromEntries(this.rows.map(({ candidate, input }) => [candidate.id, input.value.trim()]));
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (this.settled) return;
    this.settled = true;
    if (typeof this.onDone === "function") this.onDone(this.result);
  }
}

export class QueueModal extends obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this._expandedStages = new Set();
    this._collapsedStages = new Set();
    this._expandedActivities = new Set();
    this._collapsedActivities = new Set();
    this._lastActiveStage = "";
    this._scrollTop = 0;
    this._lastScrollAt = 0;
  }
  onOpen() {
    const { contentEl } = this;
    // 静态 Modal 默认停在打开瞬间；处理中时定时重渲染让进度实时走动。先清旧定时器避免叠加。
    if (this._activityTimer) { window.clearInterval(this._activityTimer); this._activityTimer = null; }
    const previousList = contentEl.querySelector(".lexvoice-progress-list");
    if (previousList) this._scrollTop = previousList.scrollTop;
    contentEl.empty();
    contentEl.addClass("lexvoice-progress");
    try { if (this.modalEl) this.modalEl.addClass("lexvoice-progress-modal"); } catch { /* intentionally empty */ }

    const allTasks = (this.plugin.queue && Array.isArray(this.plugin.queue.tasks)) ? this.plugin.queue.tasks : [];
    const running = allTasks.filter((t) => t && (t.status === "running" || t.status === "live"));
    const pending = allTasks.filter((t) => t && t.status !== "running" && t.status !== "live");
    const completed = Array.isArray(this.plugin.completedWorkLog) ? this.plugin.completedWorkLog : [];
    const detail = this.plugin.getCurrentActivityDetail ? this.plugin.getCurrentActivityDetail() : null;
    const activityLabel = this.plugin.getCurrentActivityLabel ? this.plugin.getCurrentActivityLabel() : null;
    const active = !!(detail || activityLabel);
    const activeLiveness = detail && detail.liveness ? String(detail.liveness) : (active ? "running" : "done");
    const sessionId = this.plugin._importBusy && this.plugin._importBusy.sessionId
      ? String(this.plugin._importBusy.sessionId)
      : this.plugin.session && this.plugin.session.id ? String(this.plugin.session.id) : "";
    const currentActivityIds = new Set(sessionId && active
      ? [`import:${sessionId}`, `finalize:${sessionId}`]
      : []);
    const taskActivities = (this.plugin.getTaskActivities
      ? this.plugin.getTaskActivities({ includeDone: true, includeCancelled: false })
      : [])
      .filter((task) => task && !String(task.kind || "").startsWith("queue-"))
      .filter((task) => !currentActivityIds.has(String(task.id || "")));
    // 当前处理链由顶部流程展示；这里只保留真正需要用户处理的后台异常，避免同一任务重复展开。
    const visibleTaskActivities = taskActivities.filter((task) => ["failed", "stalled"].includes(String(task.status || "")));
    const taskProblems = taskActivities.filter((task) => ["failed", "stalled"].includes(String(task.status || "")));
    const taskActive = taskActivities.filter((task) => ["queued", "running", "waiting", "slow", "stalled", "retrying"].includes(String(task.status || "")));
    const taskDone = taskActivities.filter((task) => task.status === "done");
    const headLiveness = taskProblems.length
      ? "failed"
      : active
        ? activeLiveness
        : taskActive.length
          ? String(taskActive[0].status || "running")
          : running.length
            ? "running"
            : pending.length
              ? "retrying"
              : "done";
    const headActive = active || taskActive.length > 0 || running.length > 0;
    const livenessLabel = (state) => ({
      queued: "等待处理",
      pending: "尚未开始",
      running: "进行中",
      waiting: "等待服务响应",
      slow: "处理中",
      stalled: "可能卡住",
      retrying: "等待重试",
      failed: "已失败",
      cancelled: "已取消",
      done: "已完成",
    }[state] || "处理中");
    const livenessDetail = (state) => ({
      queued: "任务已经登记，等待可用处理槽位",
      pending: "前置步骤完成后自动开始",
      running: "",
      waiting: "请求已经发出，服务尚未返回结果",
      slow: "请求已经发出，服务正在处理",
      stalled: "已经超过本阶段的预期截止时间，正在等待超时机制收口",
      retrying: "本次请求未成功，已按退避规则等待下一次请求",
      failed: "本阶段未得到可用结果",
      cancelled: "任务已由用户取消",
      done: "本阶段已经完成",
    }[state] || "");

    const fmtDur = (ms) => { const s = Math.max(0, Math.round(Number(ms) / 1000)); if (s < 60) return `${s}秒`; const m = Math.floor(s / 60), r = s % 60; if (m < 60) return r ? `${m}分${r}秒` : `${m}分`; const h = Math.floor(m / 60), rm = m % 60; return rm ? `${h}时${rm}分` : `${h}时`; };
    const fmtTime = (ms) => { try { return window.moment ? window.moment(ms).format("HH:mm:ss") : new Date(ms).toLocaleTimeString(); } catch { return ""; } };
    const tokenLabel = (n, exact) => { const v = Number(n) || 0; if (v <= 0) return ""; const num = v >= 10000 ? (v / 10000).toFixed(1).replace(/\.0$/, "") + "万" : String(v); return `${exact ? "" : "≈"}${num}`; };
    const taskTitle = (t) => t.type === "transcribe" ? `${t.status === "live" ? "实时转写" : "转写重试"} · 段${(t.segmentIndex || 0) + 1}`
      : t.type === "merge" ? `合并重试 · ${(t.segments || []).length} 段`
      : t.type === "generate-prompt" ? "提示词生成" : (t.type || "任务");

    // —— 头部：标题 + 状态 ——
    const activityText = [
      detail && detail.stage,
      detail && detail.step,
      detail && detail.kind,
      detail && detail.modeLabel,
      activityLabel,
    ].filter(Boolean).join(" ").toLowerCase();
    const activePipelineStage = detail && Array.isArray(detail.stages)
      ? detail.stages.find((stage) => stage && stage.status === "active") || null
      : null;
    const isTranscribing = activePipelineStage
      ? ["prepare", "transcribe", "persist"].includes(String(activePipelineStage.id || ""))
      : /(transcrib|asr|转写|音频|分段)/i.test(activityText);
    const headTitle = headLiveness === "done"
      ? "处理完成"
      : headActive
        ? (isTranscribing ? "正在转写" : "正在整理纪要")
      : taskProblems.length ? "处理未完成" : "处理进度";
    const head = contentEl.createDiv({ cls: "lexvoice-progress-head" });
    const titleRow = head.createDiv({ cls: "lexvoice-progress-title-row" });
    titleRow.createSpan({ cls: "lexvoice-progress-title", text: headTitle });
    titleRow.createSpan({
      cls: `lexvoice-progress-state is-${headLiveness}${headActive ? " is-active" : ""}`,
      text: taskProblems.length
        ? `${taskProblems.length} 个任务需要处理`
        : headActive
          ? livenessLabel(headLiveness)
          : "空闲",
      attr: { "aria-live": "polite" },
    });

    if (!running.length && !pending.length && !completed.length && !active && !taskActivities.length) {
      contentEl.createDiv({ cls: "lexvoice-progress-empty", text: "暂无处理任务。录音转写、AI 整理、重试任务的进度会显示在这里。" });
      return;
    }

    // —— 进度链：转写 → AI 整理 → 完成 ——
    const doneCount = completed.length + taskDone.length;
    const activeCount = (active ? 1 : 0) + running.length + taskActive.length;
    const total = completed.length + (active ? 1 : 0) + running.length + pending.length + taskActivities.length;
    const stagePosition = getActivityStagePosition(detail && detail.stages);
    const hasStageProgress = stagePosition.total > 0;
    const hasNumericProgress = !!(detail && Number.isFinite(Number(detail.percent)));
    let percent = 0;
    let indeterminate = false;
    if (hasStageProgress) {
      const currentFraction = hasNumericProgress
        ? Math.max(0, Math.min(1, Number(detail.percent) / 100))
        : 0;
      percent = Math.round(Math.min(100, ((stagePosition.completed + currentFraction) / stagePosition.total) * 100));
      indeterminate = active && (!hasNumericProgress || Number(detail.percent) <= 0);
    } else {
      const taskProgressEquiv = taskActivities.reduce((sum, task) => {
        if (task.status === "done") return sum + 1;
        if (Number.isFinite(Number(task.progress))) {
          return sum + Math.max(0, Math.min(1, Number(task.progress) / 100));
        }
        return sum;
      }, 0);
      const doneEquiv = completed.length
        + taskProgressEquiv
        + (hasNumericProgress ? Math.max(0, Math.min(1, Number(detail.percent) / 100)) : 0);
      percent = total ? Math.round(Math.min(100, (doneEquiv / total) * 100)) : 0;
      indeterminate = activeCount > 0
        && !hasNumericProgress
        && !taskActivities.some((task) => Number.isFinite(Number(task.progress)));
    }
    const _tm = this.plugin._taskMeter;
    const tmTok = _tm ? (Number(_tm.exactTokens) > 0 ? Number(_tm.exactTokens) : Math.round(((Number(_tm.inChars) || 0) + (Number(_tm.outChars) || 0)) / 2)) : 0;
    const tmTokLabel = tokenLabel(tmTok, !!(_tm && _tm.hasExact && Number(_tm.exactTokens) > 0));

    const primaryActivity = taskActivities.find((task) => ["queued", "running", "waiting", "slow", "stalled", "retrying"].includes(String(task.status || "")))
      || taskActivities[0]
      || null;
    const progressStartedAt = detail && Number(detail.startedAt) > 0
      ? Number(detail.startedAt)
      : primaryActivity && Number(primaryActivity.startedAt) > 0
        ? Number(primaryActivity.startedAt)
        : _tm && Number(_tm.startedAt) > 0 ? Number(_tm.startedAt) : 0;
    const elapsedMs = progressStartedAt ? Math.max(0, Date.now() - progressStartedAt) : 0;
    const remainingText = percent > 0 && percent < 100
      ? `剩余约 ${fmtDur(elapsedMs * ((100 - percent) / percent))}`
      : "剩余时间计算中";
    const timing = head.createDiv({ cls: "lexvoice-progress-timing", attr: { "aria-live": "polite" } });
    timing.setText(progressStartedAt ? `已用 ${fmtDur(elapsedMs)} · ${remainingText}` : "正在准备处理");

    const phaseText = [
      detail && detail.stage,
      detail && detail.step,
      detail && detail.kind,
      detail && detail.modeLabel,
      primaryActivity && primaryActivity.stageLabel,
      primaryActivity && primaryActivity.title,
    ].filter(Boolean).join(" ").toLowerCase();
    const phase = headActive || pending.length || running.length
      ? (/(transcrib|asr|转写|音频|分段)/i.test(phaseText) ? "transcribe" : "organize")
      : "complete";
    let phaseIndex = { transcribe: 0, organize: 1, complete: 2 }[phase] || 0;
    let pipelineSteps = [
      {
        key: "transcribe",
        label: "转写",
        summary: detail && detail.count
          ? String(detail.count)
          : running.length || pending.length ? `${running.length + pending.length} 项待处理` : "原始转写已保留",
      },
      {
        key: "organize",
        label: "AI 整理",
        summary: phase === "organize" && taskActive.length ? `${taskActive.length} 项进行中` : phase === "organize" ? (detail && detail.count ? String(detail.count) : "正在整理") : phaseIndex > 1 ? "已完成" : "等待转写完成",
      },
      {
        key: "complete",
        label: "完成",
        summary: phase === "complete" ? "已写入纪要" : "写入纪要",
      },
    ];
    const detailedStages = detail && Array.isArray(detail.stages) ? detail.stages : [];
    const activeDetailedStage = activePipelineStage
      || detailedStages.find((stage) => stage && stage.status === "active")
      || null;
    const isImportPipeline = detailedStages.some((stage) => stage && stage.id === "transcribe");
    const pipelineLiveness = new Map();
    if (isImportPipeline) {
      const stageById = (id) => detailedStages.find((stage) => stage && stage.id === id) || {};
      const activeId = activeDetailedStage ? String(activeDetailedStage.id || "prepare") : "";
      const allDone = detailedStages.length > 0 && detailedStages.every((stage) => stage && stage.status === "done");
      phaseIndex = allDone
        ? 3
        : activeId === "prepare" ? 0
          : activeId === "transcribe" || activeId === "persist" ? 1
            : activeId === "organize" ? 2 : 3;
      const transcribeStage = stageById("transcribe");
      const persistStage = stageById("persist");
      const organizeStage = stageById("organize");
      const writeStage = stageById("write");
      pipelineLiveness.set("prepare", String(stageById("prepare").liveness || ""));
      pipelineLiveness.set("transcribe", [transcribeStage, persistStage].some((stage) => ["failed", "stalled"].includes(String(stage.liveness || "")))
        ? "failed"
        : String((activeId === "persist" ? persistStage : transcribeStage).liveness || ""));
      pipelineLiveness.set("organize", String(organizeStage.liveness || ""));
      pipelineLiveness.set("complete", String(writeStage.liveness || ""));
      pipelineSteps = [
        { key: "prepare", label: "准备", summary: String(stageById("prepare").summary || "读取音频") },
        {
          key: "transcribe",
          label: "语音转写",
          summary: String((activeId === "persist" ? persistStage.summary : transcribeStage.summary) || detail.count || "等待处理"),
        },
        { key: "organize", label: "AI 整理", summary: String(organizeStage.summary || "等待转写完成") },
        { key: "complete", label: "完成", summary: String(writeStage.summary || "写入纪要") },
      ];
    }
    const pipeline = head.createDiv({ cls: `lexvoice-progress-pipeline is-${headLiveness}` });
    for (let index = 0; index < pipelineSteps.length; index++) {
      const step = pipelineSteps[index];
      const stepLiveness = pipelineLiveness.get(step.key) || "";
      const state = ["failed", "stalled"].includes(stepLiveness)
        ? "failed"
        : index < phaseIndex ? "done" : index === phaseIndex ? (headLiveness === "failed" ? "failed" : "active") : "pending";
      const stepEl = pipeline.createDiv({ cls: `lexvoice-progress-pipeline-step is-${state}` });
      const marker = stepEl.createDiv({ cls: "lexvoice-progress-pipeline-marker", attr: { "aria-hidden": "true" } });
      if (state === "done") {
        try { obsidian.setIcon(marker, "check"); } catch { marker.setText("✓"); }
      } else if (state === "active") {
        marker.createSpan({ cls: "lexvoice-progress-pipeline-pulse" });
      }
      stepEl.createDiv({ cls: "lexvoice-progress-pipeline-label", text: step.label });
      stepEl.createDiv({ cls: "lexvoice-progress-pipeline-summary", text: step.summary });
    }

    const canAnimateProgress = headActive
      && !["stalled", "failed", "done"].includes(headLiveness);
    const bar = head.createDiv({ cls: `lexvoice-progress-bar is-${headLiveness}` });
    bar.createDiv({
      cls: `lexvoice-progress-bar-fill is-${headLiveness}${canAnimateProgress ? " is-active" : ""}`,
    }).style.width = percent + "%";
    if (indeterminate && canAnimateProgress) {
      bar.createDiv({ cls: "lexvoice-progress-bar-motion", attr: { "aria-hidden": "true" } });
    }
    const sum = head.createDiv({ cls: "lexvoice-progress-summary" });
    sum.createSpan({
      cls: "lexvoice-progress-summary-left",
      text: hasStageProgress
        ? `第 ${stagePosition.current} / ${stagePosition.total} 步 · ${detail.step || "处理中"}`
        : `已完成 ${doneCount} / ${total}`,
    });
    const metaParts = [];
    if (detail && detail.count) metaParts.push(detail.count);
    else if (detail && detail.kind) metaParts.push(detail.kind);
    const activityStartedAt = detail && Number(detail.startedAt) > 0 ? Number(detail.startedAt) : (_tm && _tm.startedAt);
    if (activityStartedAt) metaParts.push(`已用时 ${fmtDur(Date.now() - activityStartedAt)}`);
    if (tmTokLabel) metaParts.push(`${tmTokLabel} token`);
    if (metaParts.length) sum.createSpan({ cls: "lexvoice-progress-summary-right", text: metaParts.join(" · ") });

    // —— 任务列表：已完成（✓）→ 处理中（转圈）→ 待处理（脉冲点）——
    const list = contentEl.createDiv({ cls: "lexvoice-progress-list" });
    const restoreScrollTop = this._scrollTop;
    list.addEventListener("scroll", () => {
      this._scrollTop = list.scrollTop;
      this._lastScrollAt = Date.now();
    }, { passive: true });
    const makeRow = (kind, extraCls = "") => {
      const r = list.createDiv({ cls: `lexvoice-progress-row is-${kind}${extraCls ? " " + extraCls : ""}` });
      return { row: r, ico: r.createDiv({ cls: "lexvoice-progress-ico" }), body: r.createDiv({ cls: "lexvoice-progress-body" }) };
    };
    const titleLine = (bodyEl, name, right, faint) => {
      const tl = bodyEl.createDiv({ cls: "lexvoice-progress-line" });
      tl.createSpan({ cls: `lexvoice-progress-name${faint ? " is-faint" : ""}`, text: name });
      if (right) tl.createSpan({ cls: `lexvoice-progress-right${faint ? " is-faint" : ""}`, text: right });
    };
    const subLine = (bodyEl, text) => { if (text) bodyEl.createDiv({ cls: "lexvoice-progress-sub", text }); };

    if (visibleTaskActivities.length) {
      list.createDiv({ cls: "lexvoice-progress-section-title", text: "任务状态" });
      const activityList = list.createDiv({ cls: "lexvoice-progress-activity-list" });
      for (const activity of visibleTaskActivities) {
        const state = String(activity.status || "queued");
        const activityId = String(activity.id || "");
        const item = activityList.createEl("details", {
          cls: `lexvoice-progress-activity is-${state}`,
        });
        item.open = this._expandedActivities.has(activityId);
        const summaryEl = item.createEl("summary", { cls: "lexvoice-progress-activity-summary" });
        summaryEl.onclick = (event) => {
          event.preventDefault();
          if (item.open) {
            this._expandedActivities.delete(activityId);
            this._collapsedActivities.add(activityId);
            item.open = false;
          } else {
            this._expandedActivities.add(activityId);
            this._collapsedActivities.delete(activityId);
            item.open = true;
          }
        };

        const icon = summaryEl.createSpan({ cls: `lexvoice-progress-activity-icon is-${state}`, attr: { "aria-hidden": "true" } });
        const iconName = state === "done" ? "circle-check"
          : ["failed", "stalled"].includes(state) ? "triangle-alert"
            : state === "retrying" ? "refresh-cw"
              : state === "slow" ? "clock-3"
                : state === "queued" ? "clock"
                  : state === "waiting" ? "hourglass" : "activity";
        try { obsidian.setIcon(icon, iconName); } catch { icon.setText(["failed", "stalled"].includes(state) ? "!" : ""); }

        const summaryCopy = summaryEl.createSpan({ cls: "lexvoice-progress-activity-copy" });
        summaryCopy.createSpan({ cls: "lexvoice-progress-activity-title", text: activity.title || "后台任务" });
        summaryCopy.createSpan({
          cls: "lexvoice-progress-activity-stage",
          text: [activity.stageLabel, activity.count].filter(Boolean).join(" · ") || livenessDetail(state),
        });
        summaryEl.createSpan({ cls: `lexvoice-progress-activity-state is-${state}`, text: livenessLabel(state) });

        const panel = item.createDiv({ cls: "lexvoice-progress-activity-panel" });
        if (activity.detail) panel.createDiv({ cls: "lexvoice-progress-activity-detail", text: activity.detail });

        if (Number.isFinite(Number(activity.progress))) {
          const taskProgress = Math.max(0, Math.min(100, Number(activity.progress)));
          const taskBar = panel.createDiv({ cls: `lexvoice-progress-activity-progress is-${state}` });
          taskBar.createDiv({ cls: "lexvoice-progress-activity-progress-fill" }).style.width = `${taskProgress}%`;
          panel.createDiv({ cls: "lexvoice-progress-activity-progress-label", text: `${Math.round(taskProgress)}%` });
        }

        const facts = [];
        if (Number(activity.startedAt) > 0) facts.push(["开始", fmtTime(Number(activity.startedAt))]);
        if (Number(activity.updatedAt) > 0) facts.push(["最近活动", `${fmtDur(Date.now() - Number(activity.updatedAt))}前`]);
        if (Number(activity.startedAt) > 0 && !["done", "cancelled"].includes(state)) {
          facts.push(["已运行", fmtDur(Date.now() - Number(activity.startedAt))]);
        }
        if (Number(activity.retryAt) > Date.now()) facts.push(["再次尝试", `${fmtDur(Number(activity.retryAt) - Date.now())}后`]);
        if (Number(activity.attempt) > 0) {
          facts.push(["尝试次数", activity.maxAttempts > 0
            ? `${activity.attempt}/${activity.maxAttempts}`
            : String(activity.attempt)]);
        }
        if (activity.subject) {
          const subject = String(activity.subject);
          const shortSubject = subject.split(/[\\/]/).pop() || subject;
          facts.push(["对象", shortSubject]);
        }
        if (facts.length) {
          const factGrid = panel.createDiv({ cls: "lexvoice-progress-activity-facts" });
          for (const [label, value] of facts) {
            const fact = factGrid.createDiv({ cls: "lexvoice-progress-activity-fact" });
            fact.createSpan({ cls: "lexvoice-progress-activity-fact-label", text: label });
            fact.createSpan({ cls: "lexvoice-progress-activity-fact-value", text: value });
          }
        }

        if (activity.error) {
          const errorBox = panel.createDiv({ cls: "lexvoice-progress-activity-error", attr: { role: "alert" } });
          const rawError = String(activity.error).trim();
          const displayError = /file already exists|文件已存在|already exists/i.test(rawError)
            ? "目标版本文件已存在，未重复创建。"
            : rawError;
          const isFileExistsError = displayError !== rawError;
          if (rawError && rawError !== displayError) errorBox.setAttr("title", rawError);
          const errorHead = errorBox.createDiv({ cls: "lexvoice-progress-activity-error-head" });
          const errorIcon = errorHead.createSpan({ cls: "lexvoice-progress-activity-error-icon", attr: { "aria-hidden": "true" } });
          try { obsidian.setIcon(errorIcon, "triangle-alert"); } catch { errorIcon.setText("!"); }
          errorHead.createSpan({ text: "处理未完成" });
          errorBox.createDiv({ cls: "lexvoice-progress-activity-error-message", text: displayError });
          const hint = this.plugin.getTaskActivityErrorHint
            ? this.plugin.getTaskActivityErrorHint(activity)
            : "";
          if (hint && hint !== displayError && !isFileExistsError) {
            errorBox.createDiv({ cls: "lexvoice-progress-activity-error-hint", text: hint });
          }
        }

        if (Array.isArray(activity.events) && activity.events.length) {
          const chain = panel.createDiv({ cls: "lexvoice-progress-activity-chain" });
          chain.createDiv({ cls: "lexvoice-progress-section-label", text: "最近链路" });
          for (const event of activity.events.slice(-5).reverse()) {
            const row = chain.createDiv({ cls: "lexvoice-progress-event" });
            row.createSpan({ cls: "lexvoice-progress-event-time", text: fmtTime(Number(event.at) || Date.now()) });
            const eventCopy = row.createSpan({ cls: "lexvoice-progress-event-copy" });
            eventCopy.createSpan({ cls: "lexvoice-progress-event-label", text: String(event.label || "状态已更新") });
            if (event.detail) eventCopy.createSpan({ cls: "lexvoice-progress-event-detail", text: String(event.detail) });
          }
        }

        if (Array.isArray(activity.actions) && activity.actions.length) {
          const actions = panel.createDiv({ cls: "lexvoice-progress-activity-actions" });
          for (const action of activity.actions) {
            const button = actions.createEl("button", {
              cls: `lexvoice-progress-btn${action.primary ? " mod-cta" : ""}`,
              text: action.label,
              attr: { type: "button" },
            });
            button.onclick = async (event) => {
              event.preventDefault();
              event.stopPropagation();
              button.disabled = true;
              try {
                await this.plugin.handleTaskActivityAction(activity.id, action.id);
              } finally {
                this.onOpen();
              }
            };
          }
        }
      }
    }

    if (completed.length) list.createDiv({ cls: "lexvoice-progress-section-title lexvoice-progress-legacy-completed", text: "最近完成" });
    for (const c of completed) {
      const { ico, body } = makeRow("done", "lexvoice-progress-legacy-completed");
      try { obsidian.setIcon(ico.createSpan({ cls: "lexvoice-progress-check" }), "check"); } catch { /* intentionally empty */ }
      const right = [(c.durationMs > 0 ? fmtDur(c.durationMs) : ""), tokenLabel(c.tokens, c.tokensExact)].filter(Boolean).join(" · ");
      titleLine(body, c.title || "完成", right, false);
      subLine(body, `已完成${c.detail ? " · " + c.detail : ""}${c.at ? " · " + fmtTime(c.at) : ""}`);
    }

    if (active) {
      list.createDiv({ cls: "lexvoice-progress-section-title lexvoice-progress-legacy-current", text: "当前任务" });
      const { ico, body } = makeRow("running", "lexvoice-progress-legacy-current");
      if (["failed", "stalled"].includes(activeLiveness)) {
        const stateIcon = ico.createSpan({ cls: `lexvoice-progress-task-state is-${activeLiveness}` });
        try { obsidian.setIcon(stateIcon, "triangle-alert"); } catch { stateIcon.setText("!"); }
      } else if (activeLiveness === "done") {
        const stateIcon = ico.createSpan({ cls: "lexvoice-progress-task-state is-done" });
        try { obsidian.setIcon(stateIcon, "check"); } catch { stateIcon.setText("✓"); }
      } else {
        ico.createSpan({ cls: `lexvoice-progress-spinner is-${activeLiveness}` });
      }
      const sess = this.plugin.session;
      const fileName = sess && sess.mdPath ? String(sess.mdPath).split(/[\\/]/).pop().replace(/\.md$/i, "") : "";
      const name = (detail && detail.sourceFile) || fileName || (detail ? [detail.kind, detail.modeLabel].filter(Boolean).join(" · ") : activityLabel) || "处理中";
      const detailStartedAt = detail && Number(detail.startedAt) > 0 ? Number(detail.startedAt) : (_tm && _tm.startedAt);
      const right = detailStartedAt ? [fmtDur(Date.now() - detailStartedAt), tmTokLabel].filter(Boolean).join(" · ") : "";
      titleLine(body, name, right, false);
      const stepBase = primaryActivity && primaryActivity.stageLabel
        ? String(primaryActivity.stageLabel)
        : detail ? (detail.step || detail.kind || "处理中") : (activityLabel || "处理中");
      const currentProgress = primaryActivity && Number.isFinite(Number(primaryActivity.progress))
        ? Number(primaryActivity.progress)
        : detail && Number.isFinite(Number(detail.percent)) ? Number(detail.percent) : null;
      const pctTxt = currentProgress !== null ? `（${Math.round(currentProgress)}%）` : "";
      subLine(body, `${stepBase}${pctTxt}${detail && detail.count ? " · " + detail.count : ""}`);
      if (detail && detail.stepDetail) {
        body.createDiv({ cls: "lexvoice-progress-detail", text: detail.stepDetail });
      }

      if (detail) {
        const taskFacts = [
          ["来源文件夹", detail.sourceFolder],
          ["音频时长", Number(detail.durationMs) > 0 ? fmtDur(Number(detail.durationMs)) : ""],
          ["原模式", detail.sourceModeLabel],
          ["目标模式", detail.targetModeLabel || detail.modeLabel],
        ].filter(([, value]) => String(value || "").trim());
        if (taskFacts.length) {
          const factGrid = body.createDiv({ cls: "lexvoice-progress-current-facts" });
          for (const [label, value] of taskFacts) {
            const fact = factGrid.createDiv({ cls: "lexvoice-progress-current-fact" });
            fact.createSpan({ cls: "lexvoice-progress-current-fact-label", text: String(label) });
            const factValue = fact.createSpan({ cls: "lexvoice-progress-current-fact-value", text: String(value) });
            factValue.setAttr("title", String(value));
          }
        }
      }

      if (detail && Array.isArray(detail.stages) && detail.stages.length) {
        const activeStage = detail.stages.find((stage) => stage && stage.status === "active");
        const activeStageId = activeStage ? String(activeStage.id || "") : "";
        if (activeStageId && activeStageId !== this._lastActiveStage) {
          this._lastActiveStage = activeStageId;
          this._expandedStages.add(activeStageId);
          this._collapsedStages.delete(activeStageId);
        }
        const stages = body.createDiv({
          cls: "lexvoice-progress-stages",
          attr: { "aria-label": "处理步骤" },
        });
        for (let index = 0; index < detail.stages.length; index++) {
          const stage = detail.stages[index];
          const stageId = String(stage.id || `stage-${index}`);
          const stageLiveness = String(stage.liveness || (stage.status === "done" ? "done" : stage.status === "pending" ? "pending" : "running"));
          const item = stages.createEl("details", {
            cls: `lexvoice-progress-stage is-${stage.status || "pending"} is-${stageLiveness}`,
          });
          const shouldAutoOpen = stage.status === "active"
            || ["failed", "stalled"].includes(stageLiveness);
          const shouldOpen = this._expandedStages.has(stageId)
            || (shouldAutoOpen && !this._collapsedStages.has(stageId));
          item.open = shouldOpen;
          const summaryEl = item.createEl("summary", { cls: "lexvoice-progress-stage-summary" });
          summaryEl.onclick = (event) => {
            event.preventDefault();
            if (item.open) {
              this._expandedStages.delete(stageId);
              this._collapsedStages.add(stageId);
              item.open = false;
            } else {
              this._expandedStages.add(stageId);
              this._collapsedStages.delete(stageId);
              item.open = true;
            }
          };
          const marker = summaryEl.createSpan({ cls: "lexvoice-progress-stage-marker", attr: { "aria-hidden": "true" } });
          const iconName = stageLiveness === "done" ? "check"
            : stageLiveness === "failed" || stageLiveness === "stalled" ? "triangle-alert"
              : stageLiveness === "retrying" ? "refresh-cw"
                : stageLiveness === "slow" ? "clock-3"
                  : "";
          if (iconName) {
            try { obsidian.setIcon(marker, iconName); } catch { marker.setText(stageLiveness === "done" ? "✓" : "!"); }
          } else if (stage.status === "active") {
            marker.createSpan({ cls: "lexvoice-progress-stage-pulse" });
          } else {
            marker.setText(String(index + 1));
          }
          const stageCopy = summaryEl.createSpan({ cls: "lexvoice-progress-stage-copy" });
          stageCopy.createSpan({ cls: "lexvoice-progress-stage-label", text: stage.label || `步骤 ${index + 1}` });
          if (stage.summary) stageCopy.createSpan({ cls: "lexvoice-progress-stage-summary-text", text: stage.summary });
          summaryEl.createSpan({
            cls: `lexvoice-progress-stage-state is-${stageLiveness}`,
            text: livenessLabel(stageLiveness),
          });

          const panel = item.createDiv({ cls: "lexvoice-progress-stage-panel" });
          if (stage.detail) panel.createDiv({ cls: "lexvoice-progress-stage-description", text: stage.detail });
          const facts = [];
          if (Number(stage.startedAt) > 0) facts.push(["开始", fmtTime(Number(stage.startedAt))]);
          if (Number(stage.updatedAt) > 0) facts.push(["最近事件", `${fmtDur(Date.now() - Number(stage.updatedAt))}前`]);
          if (Number(stage.startedAt) > 0 && stage.status === "active") facts.push(["本阶段", fmtDur(Date.now() - Number(stage.startedAt))]);
          if (facts.length) {
            const factGrid = panel.createDiv({ cls: "lexvoice-progress-stage-facts" });
            for (const [factLabel, factValue] of facts) {
              const fact = factGrid.createDiv({ cls: "lexvoice-progress-stage-fact" });
              fact.createSpan({ cls: "lexvoice-progress-stage-fact-label", text: factLabel });
              fact.createSpan({ cls: "lexvoice-progress-stage-fact-value", text: factValue });
            }
          }

          if (Array.isArray(stage.requests) && stage.requests.length) {
            const requestSection = panel.createDiv({ cls: "lexvoice-progress-requests" });
            requestSection.createDiv({ cls: "lexvoice-progress-section-label", text: "分段请求" });
            const requestList = requestSection.createDiv({ cls: "lexvoice-progress-request-list" });
            for (const request of stage.requests) {
              const requestState = String(request.liveness || "pending");
              const requestRow = requestList.createDiv({ cls: `lexvoice-progress-request is-${requestState}` });
              const requestHead = requestRow.createDiv({ cls: "lexvoice-progress-request-head" });
              requestHead.createSpan({
                cls: "lexvoice-progress-request-title",
                text: `第 ${Number(request.chunkIndex) + 1}/${Math.max(1, Number(request.chunkCount) || 1)} 段`,
              });
              const attemptText = Number(request.attempt) > 0
                ? `第 ${Number(request.attempt)}/${Math.max(Number(request.attempt), Number(request.maxAttempts) || 1)} 次`
                : "";
              if (attemptText) requestHead.createSpan({ cls: "lexvoice-progress-request-attempt", text: attemptText });
              requestHead.createSpan({
                cls: `lexvoice-progress-request-state is-${requestState}`,
                text: livenessLabel(requestState),
              });
              const requestMeta = [];
              if (Number(request.startedAt) > 0 && !["pending", "done"].includes(requestState)) {
                requestMeta.push(`已等待 ${fmtDur(Date.now() - Number(request.startedAt))}`);
              }
              if (Number(request.receivedChars) > 0) requestMeta.push(`已收到约 ${Number(request.receivedChars)} 字`);
              if (Number(request.retryAt) > Date.now()) requestMeta.push(`${fmtDur(Number(request.retryAt) - Date.now())}后重试`);
              if (Number(request.deadlineAt) > 0 && !["done", "failed", "retrying"].includes(requestState)) {
                const deadlineDelta = Number(request.deadlineAt) - Date.now();
                requestMeta.push(deadlineDelta >= 0
                  ? `最迟约 ${fmtDur(deadlineDelta)} 后返回或超时`
                  : `已超过截止 ${fmtDur(Math.abs(deadlineDelta))}`);
              }
              if (requestMeta.length) requestRow.createDiv({ cls: "lexvoice-progress-request-meta", text: requestMeta.join(" · ") });
              if (request.error) requestRow.createDiv({ cls: "lexvoice-progress-request-error", text: String(request.error) });
            }
          }

          if (Array.isArray(stage.events) && stage.events.length) {
            const eventSection = panel.createDiv({ cls: "lexvoice-progress-events" });
            eventSection.createDiv({ cls: "lexvoice-progress-section-label", text: "最近事件" });
            const visibleEvents = stage.events.filter((event, index, events) => {
              const next = events[index + 1];
              if (!next) return true;
              return String(event.type || "") !== String(next.type || "")
                || String(event.label || "") !== String(next.label || "")
                || String(event.detail || "") !== String(next.detail || "");
            });
            for (const event of visibleEvents.slice(-10).reverse()) {
              const eventRow = eventSection.createDiv({ cls: "lexvoice-progress-event" });
              eventRow.createSpan({ cls: "lexvoice-progress-event-time", text: fmtTime(Number(event.at) || Date.now()) });
              const eventCopy = eventRow.createSpan({ cls: "lexvoice-progress-event-copy" });
              eventCopy.createSpan({ cls: "lexvoice-progress-event-label", text: String(event.label || "状态已更新") });
              if (event.detail) eventCopy.createSpan({ cls: "lexvoice-progress-event-detail", text: String(event.detail) });
            }
          }
        }
      }

      if (detail && String(detail.liveness || "running") !== "running") {
        const now = Date.now();
        const stageStartedAt = Number(detail.stageStartedAt) || Number(detail.startedAt) || 0;
        const updatedAt = Number(detail.updatedAt) || stageStartedAt;
        const liveState = String(detail.liveness || "running");
        const live = body.createDiv({ cls: `lexvoice-progress-live is-${liveState}` });
        const liveIcon = live.createSpan({ cls: "lexvoice-progress-live-icon", attr: { "aria-hidden": "true" } });
        const liveIconName = liveState === "done" ? "circle-check"
          : liveState === "failed" || liveState === "stalled" ? "triangle-alert"
            : liveState === "retrying" ? "refresh-cw"
              : liveState === "slow" ? "clock-3" : "activity";
        try { obsidian.setIcon(liveIcon, liveIconName); } catch { /* intentionally empty */ }
        const liveParts = [];
        if (stageStartedAt) liveParts.push(`本步骤已进行 ${fmtDur(now - stageStartedAt)}`);
        if (updatedAt) liveParts.push(`最近事件在 ${fmtDur(now - updatedAt)}前`);
        const liveCopy = live.createSpan({ cls: "lexvoice-progress-live-copy" });
        liveCopy.createSpan({ cls: "lexvoice-progress-live-title", text: livenessLabel(liveState) });
        liveCopy.createSpan({
          cls: "lexvoice-progress-live-text",
          text: [livenessDetail(liveState), liveParts.join(" · ")].filter(Boolean).join(" · "),
        });
        if (detail.backgroundHint) {
          body.createDiv({ cls: "lexvoice-progress-background-hint", text: detail.backgroundHint });
        }
      }
    }

    if (running.length || pending.length) {
      const queueHead = list.createDiv({ cls: "lexvoice-progress-queue-head" });
      const queueTitle = queueHead.createDiv({ cls: "lexvoice-progress-queue-title" });
      queueTitle.createSpan({ text: "待处理" });
      queueTitle.createSpan({ cls: "lexvoice-progress-queue-count", text: ` ${pending.length} 项 · 音频均已保留` });
      if (pending.length) {
        const retryAllBtn = queueHead.createEl("button", { cls: "lexvoice-progress-queue-retry", text: "全部重试", attr: { type: "button" } });
        retryAllBtn.onclick = async () => { retryAllBtn.disabled = true; await this.plugin.retryQueue(); this.onOpen(); };
      }
    }
    for (const t of running) {
      const { ico, body } = makeRow("running", "lexvoice-progress-queue-row");
      ico.createSpan({ cls: "lexvoice-progress-spinner" });
      titleLine(body, taskTitle(t), "", false);
      subLine(body, t.status === "live" ? `切片已落盘 · ${t.mdPath || "等待本场转写"}` : (t.mdPath || ""));
    }

    for (const t of pending) {
      const { row, ico, body } = makeRow("pending", "lexvoice-progress-queue-row");
      ico.createSpan({ cls: "lexvoice-progress-dot" });
      titleLine(body, taskTitle(t), "", false);
      subLine(body, `${t.lastError || "等待下一次处理"} · 已试 ${t.retries || 0} 次`);
      const acts = row.createDiv({ cls: "lexvoice-progress-queue-actions" });
      const retryBtn = acts.createEl("button", { cls: "lexvoice-progress-queue-retry", attr: { type: "button" }, text: "重试" });
      retryBtn.onclick = async () => { try { await this.plugin.queue.processOne(t); } catch { /* intentionally empty */ } this.onOpen(); };
      const delBtn = acts.createEl("button", { cls: "lexvoice-progress-queue-cancel", attr: { type: "button" }, text: "取消" });
      delBtn.onclick = async () => {
        await this.plugin.queue.remove(t.id);
        new obsidian.Notice("已取消自动重试。缓存音频会暂时保留，之后仍可从纪要右键重新发起。", 6000);
        this.onOpen();
      };
    }

    // —— 底部操作 ——
    const foot = contentEl.createDiv({ cls: "lexvoice-progress-foot" });
    if (tmTokLabel) foot.createSpan({ cls: "lexvoice-progress-foot-token", text: `${tmTokLabel} token` });
    const footActions = foot.createDiv({ cls: "lexvoice-progress-foot-actions" });
    const logBtn = footActions.createEl("button", { cls: "lexvoice-progress-foot-link", attr: { type: "button" }, text: "查看日志" });
    logBtn.onclick = async () => { try { await this.plugin.copyDiagnosticReport(); } catch { /* intentionally empty */ } };
    const backgroundBtn = footActions.createEl("button", { cls: "lexvoice-progress-foot-link is-primary", attr: { type: "button" }, text: "后台运行" });
    backgroundBtn.onclick = () => this.close();
    if (pending.length) {
      const clearBtn = footActions.createEl("button", { cls: "lexvoice-progress-foot-link", attr: { type: "button" }, text: "取消全部" });
      clearBtn.onclick = async () => {
        const n = this.plugin.queue.tasks.filter((t) => t && t.status !== "running" && t.status !== "live").length;
        const ok = await lexvoiceConfirm(this.app, "取消全部自动重试？",
          `取消后这 ${n} 个任务不再自动重试，对应纪要将停留在当前状态。缓存音频会暂时保留，处理中的任务不受影响。`,
          "取消重试");
        if (!ok) return;
        const cancellable = this.plugin.queue.tasks.filter((t) => t && t.status !== "running" && t.status !== "live");
        for (const task of cancellable) {
          await this.plugin.queue.remove(task.id);
        }
        this.plugin.renderStatusBar();
        this.onOpen();
      };
    }

    // 在所有动态内容插入后再恢复滚动位置。提前设置时列表高度仍为 0，浏览器会把位置夹回顶部。
    window.requestAnimationFrame(() => {
      if (!list.isConnected) return;
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop = Math.min(restoreScrollTop, maxScrollTop);
    });

    // 处理中定时刷新；用户正在滚动时暂停重建，避免内容在手指/滚轮下跳动。
    if (active || running.length || taskActive.length) {
      this._activityTimer = window.setInterval(() => {
        if (Date.now() - this._lastScrollAt < 900) return;
        try { this.onOpen(); } catch { /* intentionally empty */ }
      }, 1200);
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
    const p = getDesktopProcess()?.platform || "";
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
      interviewScene: saved.interviewScene || "",
      seniority: saved.seniority || "",
      customNote: saved.customNote || "",
      previousInterviewNote: saved.previousInterviewNote || "",
      previousNotePath: saved.previousNotePath || "",
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
    jdHead.createEl("label", { text: "岗位 JD", cls: "lexvoice-recruit-label-strong" });
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
      sel.addEventListener("change", () => { void this.applyJdProjectSelection(sel.value); });
      this._jdProjectSel = sel;
      const saveBtn = projRow.createEl("button", { text: "存为招聘项目", cls: "lexvoice-recruit-lib-btn" });
      saveBtn.onclick = () => this.saveAsProject();
    }

    const jdTa = jdSec.createEl("textarea", { cls: "lexvoice-recruit-textarea lexvoice-recruit-textarea-large" });
    jdTa.value = this.ctx.jd;
    jdTa.placeholder = "粘贴完整 JD，包含岗位职责、任职要求和加分项等。\n整理时会将这些内容作为评估依据。";
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
    resumeHead.createEl("label", { text: "候选人简历（可选）" });
    if (hrUnlocked) {
      const pdfs = listResumePdfs(this.app, this.plugin.settings.recruitResumeFolderPath);
      if (pdfs.length) {
        const pdfSel = resumeHead.createEl("select", { cls: "lexvoice-recruit-input dropdown lexvoice-recruit-pdf-sel" });
        pdfSel.createEl("option", { value: "", text: "从简历库选 PDF…" });
        for (const f of pdfs) pdfSel.createEl("option", { value: f.path, text: f.basename });
        pdfSel.addEventListener("change", () => { void (async () => {
          const p = pdfSel.value;
          pdfSel.value = "";
          if (!p) return;
          const file = this.app.vault.getAbstractFileByPath(p);
          new obsidian.Notice("正在读取 PDF…");
          let text = await extractPdfTextBestEffort(this.app, file);
          if (!text || text.trim().length < 50) {
            new obsidian.Notice("该 PDF 没有可提取的文本（可能是扫描件），请手动粘贴简历内容", 7000);
            return;
          }
          const candidateName = extractCandidateNameFromResumeText(text, file && (file.name || file.basename || file.path));
          if (this.plugin.settings.recruitResumeDesensitize !== false) text = desensitizeResumeText(text);
          this.ctx.resume = text;
          if (candidateName) this.ctx.candidateName = candidateName;
          this.clearCachedInterviewBrief();
          if (this.formEls.resume) this.formEls.resume.value = text;
          if (candidateName && this.formEls.candidateName) this.formEls.candidateName.value = candidateName;
          new obsidian.Notice("已提取 PDF 文本，请核查内容");
        })(); });
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
    addMetaSelect("面试轮次", "round", ["初面", "二面", "终面"]);
    addMetaSelect("面试场景", "interviewScene", ["业务面", "HR 面", "领导面"]);
    addMetaSelect("岗位资历", "seniority", ["", "初级", "中级", "高级", "资深", "总监"]);
    addMetaInput("本轮评估重点", "customNote", "（可选）本轮特别要验证的点");

    // recruitAlwaysAskOnStart 的唯一写入点：此前该键没有任何 UI 可改，等于不可关的常量。
    const askRow = contentEl.createDiv({ cls: "lexvoice-recruit-ask-row" });
    const askLabel = askRow.createEl("label");
    const askCb = askLabel.createEl("input", { attr: { type: "checkbox" } });
    askCb.checked = this.plugin.settings.recruitAlwaysAskOnStart !== false;
    askLabel.appendText(" 每次开始招聘录音前显示此页面（关闭后使用上次保存的信息，可在侧边栏重新编辑）");
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
      new obsidian.Notice(added ? "招聘评估信息已保存，JD 已加入历史" : "招聘评估信息已保存");
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
    if (parsed.岗位资历) this.ctx.seniority = parsed.岗位资历;  // JD 写了岗位资历 → 自动带入，评估按此档校准严苛度
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
      detail.setText(`${q.素质}\u3000${parts.join("\u3000·\u3000") || "（未填定义）"}`);
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
    const ok = actions.createEl("button", { text: "创建项目", cls: "mod-cta" });
    ok.onclick = async () => {
      const name = String(nameInp.value || "").trim();
      if (!name) { new obsidian.Notice("请填职位名"); return; }
      try {
        const res = await createRecruitProject(
          this.app, this.plugin.settings.recruitJdFolderPath, name,
          { 职位名: name, 序列: seqInp.value, 状态: statusInp.value }, jdText);
        new obsidian.Notice(`已创建招聘项目：${res.name}`);
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
        "- 待办语法：如果有待办，统一写成 `- [ ] 事项：<具体动作>`，能确定时再补 `责任人：<人>` 和 `截止：<时间>`（无法判断就省略该字段，不要写「未提及」）；不要写成表格或普通列表。",
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
      const ok = await lexvoiceConfirm(this.app, "删除自定义提示词", "删除自定义提示词「" + (tpl.name || tpl.id) + "」？此操作不可恢复。", "删除");
      if (!ok) return;
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
    void this.loadTextFiles();

    const actions = contentEl.createDiv({ cls: "lexvoice-import-actions" });
    this.processBtn = actions.createEl("button", { text: "开始转写（0 个文件）", cls: "mod-cta" });
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
      .filter((file) => !obsidian.normalizePath(file.path).startsWith(this.app.vault.configDir + "/"))
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
      this.modeHint.setText("招聘评估会在整理前请你确认岗位 JD、简历和候选人信息。");
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
    nameRow.createSpan({ cls: "lexvoice-import-name", text: file.basename });
    if (item && item.badge) {
      nameRow.createSpan({
        cls: `lexvoice-import-badge lexvoice-import-badge-${item.category || "external"}`,
        text: item.badge,
        attr: item.statusTitle ? { title: item.statusTitle } : {},
      });
    }
    label.createDiv({ cls: "lexvoice-import-meta", text: this.formatFileMeta(file) });
    if (item && item.reason) {
      label.createDiv({ cls: "lexvoice-import-reason", text: item.reason });
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

export class AudioImportOptionsModal extends obsidian.Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.paths = Array.isArray(options.paths) ? options.paths.slice() : [];
    this.selectedMode = getEffectivePolishMode(
      plugin.settings,
      options.mode || plugin.settings.polishMode,
      "meeting",
    );
    this.speakerSelection = resolveImportSpeakerSelection(plugin);
    this.selectedSpeakerDiarization = this.speakerSelection.enabled;
    this.selectedSpeakerCount = this.speakerSelection.count;
    this.onConfirm = typeof options.onConfirm === "function" ? options.onConfirm : null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lexvoice-import-options-modal");
    contentEl.createEl("h2", { text: "导入音频" });
    contentEl.createDiv({
      cls: "lexvoice-import-desc",
      text: this.paths.length > 1
        ? `已选择 ${this.paths.length} 个音频文件。确认本次整理方式。`
        : "确认本次整理方式。",
    });

    const mode = contentEl.createDiv({ cls: "lexvoice-import-mode" });
    const modeCopy = mode.createDiv();
    modeCopy.createDiv({ cls: "lexvoice-import-mode-title", text: "整理方式" });
    modeCopy.createDiv({ cls: "lexvoice-import-mode-hint", text: "转写完成后生成对应类型的纪要。" });
    const modeSelect = mode.createEl("select", { cls: "dropdown lexvoice-import-mode-select" });
    for (const [key, name] of getVisibleModeEntries(this.plugin.settings, false)) {
      modeSelect.createEl("option", { value: key, text: name });
    }
    modeSelect.value = this.selectedMode;
    modeSelect.onchange = () => {
      this.selectedMode = getEffectivePolishMode(this.plugin.settings, modeSelect.value, "meeting");
    };

    renderImportSpeakerControl(contentEl, this);

    contentEl.createDiv({
      cls: "lexvoice-import-execution-note",
      text: "本次选择只影响当前导入任务；默认转写服务可在设置的“说话人”页修改。",
    });

    const actions = contentEl.createDiv({ cls: "lexvoice-import-actions" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    cancel.onclick = () => this.close();
    const start = actions.createEl("button", { text: "开始转写", cls: "mod-cta", attr: { type: "button" } });
    start.onclick = async () => {
      start.disabled = true;
      const payload = {
        mode: this.selectedMode,
        speakerDiarization: this.selectedSpeakerDiarization,
        speakerCount: this.selectedSpeakerDiarization ? this.selectedSpeakerCount : 0,
      };
      this.close();
      if (this.onConfirm) await this.onConfirm(payload);
    };
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
    this.speakerSelection = resolveImportSpeakerSelection(plugin);
    this.selectedSpeakerDiarization = this.speakerSelection.enabled;
    this.selectedSpeakerCount = this.speakerSelection.count;
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
    desc.setText(`从 ${this.plugin.settings.audioFolder} 选择音频。支持 WebM、M4A/MP4、MP3、WAV、AAC、OGG、FLAC 等格式；同一次录音的分段会合并显示。`);

    this.renderModeControl(contentEl);
    renderImportSpeakerControl(contentEl, this);
    contentEl.createDiv({
      cls: "lexvoice-import-execution-note",
      text: "本次选择只影响当前导入任务。",
    });

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
    lbl.createDiv({ cls: "lexvoice-import-name", text: name });
    lbl.createDiv({ cls: "lexvoice-import-meta", text: this.formatFileMeta(file) });
    if (file.stat.size > 25 * 1024 * 1024) {
      lbl.createDiv({ cls: "lexvoice-import-warn", text: "文件超过 25 MB，多数转写 API 会拒绝。建议先降码率。" });
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
    this.processBtn.setText(`开始转写（${label}）`);
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
    await this.plugin.importAudioFiles(paths, mode, {
      speakerDiarization: this.selectedSpeakerDiarization,
      speakerCount: this.selectedSpeakerDiarization ? this.selectedSpeakerCount : 0,
    });
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
    const wrapEl = activeDocument.body.createDiv({ cls: "lexvoice-bubble-wrap" });
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
    this._renderRaf = window.requestAnimationFrame(() => {
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
  // 用候选名逐个尝试画 Lucide 图标；setIcon 对坏名静默不插 svg，故显式校验。
  _paintIcon(el, candidates) {
    let painted = false;
    for (const name of candidates) {
      try {
        el.empty();
        obsidian.setIcon(el, name);
        if (el.querySelector("svg")) { painted = true; break; }
      } catch { /* intentionally empty */ }
    }
    if (!painted) el.empty();
    return painted;
  }
  render() {
    if (!this.el) return;
    const info = this.plugin.recorder.getInfo();
    this.el.empty();
    this.el.removeClass("is-idle"); this.el.removeClass("is-recording"); this.el.removeClass("is-paused");
    // 悬浮窗大小（大/中/小）：每次渲染都重置三档尺寸类，再加回当前档，与状态无关。
    ["large", "medium", "small"].forEach(sz => this.el.removeClass("lexvoice-bubble-size-" + sz));
    this.el.addClass("lexvoice-bubble-size-" + (this.plugin.settings.bubbleSize || "large"));
    if (this.wrapEl) this.wrapEl.removeClass("is-recording-wrap");
    const makeDocButton = (title, handler) => {
      const jumpBtn = this.el.createEl("button", { cls: "lexvoice-bubble-jump", attr: { title, "aria-label": title } });
      // 用 Lucide 图标替代之前 CSS 画的文档形状。
      // 关键：setIcon 对无效图标名通常静默不加 svg（不抛异常），会得到空按钮 → 图标"看不见"。
      // 所以逐个尝试候选图标名，并显式验证 svg 真的被插入；都失败再走 CSS fallback 形状。
      const painted = this._paintIcon(jumpBtn, ["file-text", "lucide-file-text", "file"]);
      if (!painted) jumpBtn.addClass("is-fallback-icon");  // CSS 画的文档轮廓兜底
      jumpBtn.onclick = (e) => { e.stopPropagation(); handler(); };
      return jumpBtn;
    };
    if (info.state === "idle") {
      this.el.addClass("is-idle");
      makeDocButton("打开最近纪要", () => this.plugin.openRecentNote());
      const micBtn = this.el.createEl("button", {
        cls: "lexvoice-bubble-main",
        attr: { "aria-label": "开始会议录音", title: "开始会议录音" },
      });
      obsidian.setTooltip(micBtn, "开始会议录音", { placement: "top" });
      this._paintIcon(micBtn, ["mic", "lucide-mic"]);
      micBtn.onclick = (e) => { e.stopPropagation(); this.plugin.startRecording(); };
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
      pauseBtn.onclick = (e) => { e.stopPropagation(); if (info.state === "paused") this.plugin.recorder.resume(); else this.plugin.recorder.pause(); };
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
      try { wrapEl.setPointerCapture(e.pointerId); } catch { /* intentionally empty */ }
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
      try { wrapEl.releasePointerCapture(e.pointerId); } catch { /* intentionally empty */ }
    };
    wrapEl.addEventListener("pointerup", endDrag);
    wrapEl.addEventListener("pointercancel", endDrag);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

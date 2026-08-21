/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck — PluginSettingTab class（this.plugin.* / 大量 setting builder 无 TS 字段声明）；已用 tsc 确认无漏引用(TS2304=0)，余者皆类字段类型噪音，故与 main.ts 同档跳过。
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_DAILY_MEETING_OVERVIEW_HEADING, DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE } from '../shared/defaults';
import { genId } from '../shared/util-common';
import { canOmitServiceApiKey, isLocalLlmEndpoint, isSharedAddressSpaceEndpoint } from '../shared/util-llm-endpoint';
import { isLocalServiceEndpoint } from '../shared/util-note';
import { compareVersions, isLexVoiceMobileRuntime } from '../shared/util-platform';
import { getEffectivePolishMode, getModeMeta, getVisibleModeEntries } from '../shared/mode-meta';
import { LLM_SERVICE_PRESETS, ONE_CARD_PROVIDERS, applyLlmProfileToWorkingConfig, findLlmProfile, getActiveLlmServicePresetId, getLlmServicePreset, inferLlmServicePresetId, normalizeLlmProfiles, syncWorkingConfigToLlmProfile } from '../llm/config';
import { fetchLlmModelList, getLlmConfigIssue, testLlmConnection } from '../llm/core';
import { snapshotActiveAsr, syncWorkingAsrToActiveScheme } from '../llm/asr-scheme';
import { normalizeAsrConcurrency, resolveTranscribeProvider, transcribeAudio } from '../asr/transcribe';
import { countVocabularyGroups, formatVocabularyMarkdown, isStructuredVocabularyMarkdown, parseVocabularyGroups, summarizeVocabularyGroups } from '../vocabulary';
import { hasPeopleHotwordsConsent, loadPeopleDirectory, normalizePeopleContextMode, normalizePeopleSuggestionCache, normalizePeopleSuggestionIgnores } from '../people';
import { isRecruitFeatureUnlocked } from '../recruit';
import { LEXVOICE_UPDATE_REPO_URL, audioInputModeLabel, countKnowledgeExtractionHistory, enumerateAudioDevices, isVirtualCableLabel, lexvoiceConfirm, lexvoicePromptText, normalizeAudioInputMode, openLexVoiceExternalUrl, openLexVoicePickListModal, pluginBasePath, resolveUpdateRawBases, trashLexVoiceFile } from './helpers';
import { PeopleHotwordsConsentModal, PromptTemplateModal, QueueModal, VirtualCableSetupModal } from './modals';
import {
  MAX_SPEAKER_CHANNELS,
  buildMicrophoneAudioConstraints,
  configureMicrophoneTrackChannels,
  normalizeAudioChannelMode,
} from '../audio/channel-speakers';
import { analyzeRecordedAudioChannels } from '../asr/channel-transcription';
import { fetchImportTranscribeModels, testImportTranscribeProvider } from '../asr/long-audio-transcription';

function pickChannelProbeMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((mime) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) || "";
}

async function recordChannelProbe(stream, durationMs = 5000) {
  if (typeof MediaRecorder === "undefined") throw new Error("当前环境不支持录音文件检测");
  const mimeType = pickChannelProbeMime();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  return new Promise((resolve, reject) => {
    let timer = 0;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      if (timer) window.clearTimeout(timer);
      reject(event.error instanceof Error ? event.error : new Error("录音采样失败"));
    };
    recorder.onstop = () => {
      if (timer) window.clearTimeout(timer);
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (!blob.size) reject(new Error("录音采样为空，请确认麦克风有输入"));
      else resolve(blob);
    };
    recorder.start(250);
    timer = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, Math.max(2000, Number(durationMs) || 5000));
  });
}

function renderChannelProbeRows(container, rows) {
  container.empty();
  for (const row of rows) {
    const line = container.createDiv({ cls: `lexvoice-audio-channel-result-row ${row.state ? `is-${row.state}` : ""}` });
    line.createSpan({ cls: "lexvoice-audio-channel-result-label", text: row.label });
    line.createSpan({ cls: "lexvoice-audio-channel-result-value", text: row.value });
  }
}

export const LV_SETTINGS_TABS = [
  { id: "home",     label: "LexVoice" },
  { id: "general",  label: "常规" },
  { id: "api",      label: "API" },
  { id: "speaker",  label: "说话人" },
  { id: "ai",       label: "AI 整理" },
  { id: "knowledge", label: "资料库" },
  { id: "advanced", label: "进阶" },
  { id: "updates",  label: "更新" },
];

function resolveOneCardProviderEndpoint(cfg, apiKey) {
  if (!cfg) return "";
  const normal = String(cfg.llmEndpoint || "").trim();
  const tokenPlan = String(cfg.tokenPlanEndpoint || "").trim();
  if (!tokenPlan) return normal;
  const key = String(apiKey || "").trim().toLowerCase();
  if (!key) return normal;
  if (key.startsWith("tp-") || key.includes("token-plan")) return tokenPlan;
  if (key.startsWith("sk-")) return normal;
  return normal;
}

export class LexVoiceSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeTab = "home";
    this._advancedTapCount = 0;
    this._advancedTapAt = 0;
  }
  // 招聘 Tab 仅在解锁后注入到 Tab 列表（未解锁则整个分区不进 DOM，设置搜索也搜不到）。
  getVisibleSettingsTabs() {
    const tabs = LV_SETTINGS_TABS.slice();
    if (isRecruitFeatureUnlocked(this.plugin.settings)) {
      const idx = tabs.findIndex(t => t.id === "advanced");
      const recruitTab = { id: "recruit", label: "招聘" };
      if (idx >= 0) tabs.splice(idx, 0, recruitTab); else tabs.push(recruitTab);
    }
    return tabs;
  }
  display() {
    this.renderSettings();
  }

  renderSettings() {
    const { containerEl } = this;
    containerEl.empty();

    const tabs = this.getVisibleSettingsTabs();
    const tabShell = containerEl.createDiv({ cls: "lexvoice-settings-tabs-shell" });
    const tabBar = tabShell.createDiv({ cls: "lexvoice-settings-tabs" });
    for (const tab of tabs) {
      const btn = tabBar.createEl("button", { text: tab.label });
      if (this.activeTab === tab.id) btn.addClass("is-active");
      btn.onclick = () => this.handleSettingsTabClick(tab.id);
    }

    const content = containerEl.createDiv({ cls: "lexvoice-settings-content" });
    // 移动端运行时强制单列堆叠（手机设置面板有时宽于 760px CSS px，纯靠 @media 会漏）。
    content.toggleClass("is-mobile", isLexVoiceMobileRuntime());
    switch (this.activeTab) {
      case "home":     this.renderHome(content); break;
      case "general":  this.renderGeneral(content); break;
      case "api":      this.renderApi(content); break;
      case "speaker":  this.renderSpeaker(content); break;
      case "ai":       this.renderAI(content); break;
      case "knowledge": this.renderKnowledge(content); break;
      case "recruit":  this.renderRecruit(content); break;
      case "advanced": this.renderAdvanced(content); break;
      case "updates":  this.renderUpdates(content); break;
    }
    this.applySettingsSections(content);
  }

  applySettingsSections(content) {
    if (!content || this.activeTab === "home") return;
    const children = Array.from(content.children || []);
    const headings = children.filter((el) => el && el.classList && el.classList.contains("setting-item-heading"));
    if (!headings.length) return;
    if (!this._settingsSectionOpen) this._settingsSectionOpen = Object.create(null);

    let sectionIndex = 0;
    for (const heading of headings) {
      if (!heading.parentElement || heading.parentElement !== content) continue;
      const titleEl = heading.querySelector(".setting-item-name");
      const descEl = heading.querySelector(".setting-item-description");
      const title = ((titleEl && titleEl.textContent) || heading.textContent || "").trim();
      if (!title) continue;

      const sectionKey = `${this.activeTab}:${sectionIndex}:${title}`;
      const details = content.createEl("details", { cls: "lexvoice-settings-section" });
      if (Object.prototype.hasOwnProperty.call(this._settingsSectionOpen, sectionKey)) {
        details.open = !!this._settingsSectionOpen[sectionKey];
      } else {
        details.open = sectionIndex === 0;
        this._settingsSectionOpen[sectionKey] = details.open;
      }
      details.addEventListener("toggle", () => {
        this._settingsSectionOpen[sectionKey] = !!details.open;
      });

      const summary = details.createEl("summary", { cls: "lexvoice-settings-section-summary" });
      summary.createSpan({ cls: "lexvoice-settings-section-title", text: title });

      const descText = descEl ? String(descEl.textContent || "").trim() : "";
      const next = heading.nextElementSibling;
      const isHint = next && next.classList && (
        next.classList.contains("lexvoice-settings-hint") ||
        next.classList.contains("lexvoice-section-hint")
      );
      const hintText = isHint ? String(next.textContent || "").trim() : "";
      const summaryDesc = descText || hintText;
      if (summaryDesc) summary.createDiv({ cls: "lexvoice-settings-section-desc", text: summaryDesc });

      const body = details.createDiv({ cls: "lexvoice-settings-section-body" });
      content.insertBefore(details, heading);
      heading.remove();
      if (isHint) next.remove();

      let node = details.nextElementSibling;
      while (node && !(node.classList && node.classList.contains("setting-item-heading"))) {
        const current = node;
        node = node.nextElementSibling;
        body.appendChild(current);
      }
      for (const item of Array.from(body.children || [])) {
        if (!item.classList || !item.classList.contains("setting-item")) continue;
        const control = item.querySelector(".setting-item-control");
        if (!control || control.children.length === 0) item.classList.add("is-info-only");
      }
      sectionIndex++;
    }
  }

  createSettingsSubhead(parent, title, desc) {
    const el = parent.createDiv({ cls: "lexvoice-settings-subhead" });
    el.createDiv({ cls: "lexvoice-settings-subhead-title", text: title });
    if (desc) el.createDiv({ cls: "lexvoice-settings-subhead-desc", text: desc });
    return el;
  }

  handleSettingsTabClick(tabId) {
    if (tabId !== "advanced") {
      this._advancedTapCount = 0;
      this._advancedTapAt = 0;
    }
    this.activeTab = tabId;
    this.renderSettings();
    if (tabId === "advanced") {
      this.handleAdvancedEasterEggTap().catch((e) => console.error("[LexVoice] HR easter egg failed", e));
    }
  }

  async handleAdvancedEasterEggTap() {
    if (isRecruitFeatureUnlocked(this.plugin.settings)) return;
    const now = Date.now();
    if (!this._advancedTapAt || now - this._advancedTapAt > 4500) this._advancedTapCount = 0;
    this._advancedTapAt = now;
    this._advancedTapCount = (this._advancedTapCount || 0) + 1;
    if (this._advancedTapCount < 5) return;

    this._advancedTapCount = 0;
    this.plugin.settings.recruitFeatureUnlocked = true;
    await this.plugin.saveSettings();
    this.plugin.refreshOutlineView();
    this.renderSettings();
    this.showHrUnlockFireworks();
    new obsidian.Notice("招聘功能已启用", 6000);
  }

  showHrUnlockFireworks() {
    const { containerEl } = this;
    if (!containerEl) return;
    const old = containerEl.querySelector(".lexvoice-hr-unlock-burst");
    if (old) old.remove();

    const burst = containerEl.createDiv({ cls: "lexvoice-hr-unlock-burst" });
    const sparks = burst.createDiv({ cls: "lexvoice-hr-unlock-sparks" });
    const points = [
      [-160, -92], [-118, -132], [-66, -158], [0, -176], [74, -150], [130, -106],
      [166, -42], [152, 44], [108, 104], [42, 146], [-36, 146], [-108, 104],
      [-154, 34], [-132, -36], [-72, -86], [82, -72], [44, 82], [-48, 74],
    ];
    points.forEach(([x, y], i) => {
      const spark = sparks.createDiv({ cls: "lexvoice-hr-spark" });
      spark.style.setProperty("--x", x + "px");
      spark.style.setProperty("--y", y + "px");
      spark.style.setProperty("--d", (i % 5) * 38 + "ms");
    });

    const card = burst.createDiv({ cls: "lexvoice-hr-unlock-card" });
    card.createDiv({ cls: "lexvoice-hr-unlock-kicker", text: "招聘功能" });
    card.createDiv({ cls: "lexvoice-hr-unlock-title", text: "招聘评估已启用" });
    card.createDiv({ cls: "lexvoice-hr-unlock-copy", text: "现在可以在模板中选择招聘评估。" });

    window.setTimeout(() => burst.remove(), 2000);
  }

  renderDataRiskNotice(parent, variant = "") {
    const cls = ["lexvoice-risk-notice", variant].filter(Boolean).join(" ");
    const box = parent.createEl("details", { cls });
    box.createEl("summary", { cls: "lexvoice-risk-title", text: "数据与云端 API" });
    box.createDiv({
      cls: "lexvoice-risk-body",
      text: "LexVoice 没有自有云端存储，也不会把录音上传到 LexVoice 服务器；录音文件保存在用户选择的本地 Obsidian 库路径。转写和 AI 整理时，音频、转写文本和提示词会发送到当前配置的云端 API 或本地模型。敏感内容建议使用本地转写和本地大模型，避免通过云端 API 处理涉密、隐私、客户资料、医疗、法务、人事等信息。",
    });
  }

  // 快速配置：一个 Key 同时配好转写 + AI 整理。把指定供应商的 Key 填进转写 provider 和 LLM 工作配置，并存成一套 API 方案。
  async applyOneCardProvider(id, key) {
    const cfg = ONE_CARD_PROVIDERS[id];
    if (!cfg) return false;
    const k = String(key || "").trim();
    if (!k) return false;
    const s = this.plugin.settings;
    const providers = s.transcribeProviders || (s.transcribeProviders = {});
    const endpoint = resolveOneCardProviderEndpoint(cfg, k);
    // 转写：填 Key + 恢复该 provider 的推荐地址/模型/协议 + 设为当前转写服务
    const dft = DEFAULT_SETTINGS.transcribeProviders[cfg.asrProvider] || {};
    const cur = providers[cfg.asrProvider] || {};
    providers[cfg.asrProvider] = Object.assign({}, cur, {
      name: cur.name || dft.name,
      endpoint: cfg.asrEndpoint || endpoint || dft.endpoint || cur.endpoint || "",
      model: dft.model || cur.model || "",
      language: cur.language || dft.language || "auto",
      protocol: dft.protocol || cur.protocol,
      apiKey: k,
    });
    s.activeTranscribeProvider = cfg.asrProvider;
    // AI 整理（LLM）：套预设 + 填 Key + 模型
    s.llmServicePreset = cfg.llmPreset;
    s.llmEndpoint = endpoint || cfg.llmEndpoint;
    if (cfg.llmModel) s.llmModel = cfg.llmModel;
    s.llmApiKey = k;
    // 自动存成一套完整 API 方案（带转写快照），出现在 API 页顶部可一键重选；同名方案就地覆盖、不重复堆叠
    const schemeName = cfg.label;
    const profiles = normalizeLlmProfiles(s.llmProfiles);
    const asrSnap = snapshotActiveAsr(s);
    const existing = profiles.find(p => p.name === schemeName);
    if (existing) {
      existing.endpoint = s.llmEndpoint || "";
      existing.apiKey = k;
      existing.model = s.llmModel || "";
      if (asrSnap) existing.asr = asrSnap;
      s.activeLlmProfile = existing.id;
    } else {
      const newId = `llm-${genId()}`;
      const scheme = { id: newId, name: schemeName, endpoint: s.llmEndpoint || "", apiKey: k, model: s.llmModel || "" };
      if (asrSnap) scheme.asr = asrSnap;
      profiles.push(scheme);
      s.activeLlmProfile = newId;
    }
    s.llmProfiles = profiles;
    await this.plugin.saveSettings();
    return true;
  }

  async applyBeginnerDefaults() {
    const speechDefaults = DEFAULT_SETTINGS.transcribeProviders.siliconflow;
    const currentSpeech = (this.plugin.settings.transcribeProviders || {}).siliconflow || {};
    this.plugin.settings.transcribeProviders.siliconflow = Object.assign({}, currentSpeech, {
      name: currentSpeech.name || speechDefaults.name,
      endpoint: speechDefaults.endpoint,
      model: speechDefaults.model,
      language: currentSpeech.language || speechDefaults.language || "auto",
    });
    this.plugin.settings.activeTranscribeProvider = "siliconflow";

    const llmPreset = getLlmServicePreset("siliconflow");
    if (llmPreset) {
      this.plugin.settings.llmServicePreset = llmPreset.id;
      this.plugin.settings.llmEndpoint = llmPreset.endpoint;
    }
    if (!this.plugin.settings.llmApiKey && currentSpeech.apiKey) {
      this.plugin.settings.llmApiKey = currentSpeech.apiKey;
    }
    await this.plugin.saveSettings();
  }

  async restoreTranscribeProviderDefaults(providerId) {
    const defaults = DEFAULT_SETTINGS.transcribeProviders[providerId];
    if (!defaults) return false;
    const current = (this.plugin.settings.transcribeProviders || {})[providerId] || {};
    this.plugin.settings.transcribeProviders[providerId] = Object.assign({}, current, {
      name: current.name || defaults.name,
      endpoint: defaults.endpoint || "",
      model: defaults.model || "",
      language: defaults.language || "",
      protocol: defaults.protocol || current.protocol || "",
      targetLanguage: current.targetLanguage || defaults.targetLanguage || "zh",
    });
    await this.plugin.saveSettings();
    return true;
  }

  async autoConfigureAudioInput() {
    if (isLexVoiceMobileRuntime()) {
      this.plugin.settings.selectedVirtualDevice = "";
      this.plugin.settings.captureMode = "mic";
      await this.plugin.saveSettings();
      new obsidian.Notice("移动端已使用麦克风录音。电脑音频和虚拟声卡采集请在桌面端配置。", 7000);
      return;
    }
    const info = await enumerateAudioDevices();
    const virtual = info.virtualCables && info.virtualCables[0];
    const hasMic = info.mics && info.mics.length > 0;
    if (virtual) {
      this.plugin.settings.selectedVirtualDevice = virtual.deviceId;
      this.plugin.settings.captureMode = hasMic ? "mix-virtual" : "virtualCable";
      await this.plugin.saveSettings();
      new obsidian.Notice(`已选择：${audioInputModeLabel(this.plugin.settings.captureMode)}（电脑音频：${virtual.label || "虚拟声卡"}）。请在上方「麦克风」下拉中确认本人说话用的设备。`, 8000);
      return;
    }
    this.plugin.settings.selectedVirtualDevice = "";
    this.plugin.settings.captureMode = "mic";
    await this.plugin.saveSettings();
    const msg = info.permissionRequired
      ? "未获得音频权限或未检测到电脑音频输入，已保持「仅麦克风」。如需录 B 站客户端、浏览器视频或系统声音，请先授权并配置虚拟声卡。"
      : "未检测到电脑音频输入，已保持「仅麦克风」。如需录 B 站客户端、浏览器视频或系统声音，请先配置虚拟声卡。";
    new obsidian.Notice(msg, 7000);
  }

  // 已移除 chooseRealMicrophone：插件不再"按名字自动挑一只真实麦克风"。
  // 麦克风选择完全交给用户（设置里的下拉），没选则用系统默认。

  renderHome(c) {
    const page = c.createDiv({ cls: "lexvoice-home" });
    const jump = (tab) => { this.activeTab = tab; this.renderSettings(); };
    const hasSpeechProvider = (() => {
      const id = this.plugin.settings.activeTranscribeProvider || "siliconflow";
      const p = (this.plugin.settings.transcribeProviders || {})[id] || {};
      // 从 provider profile 取 requiresKey，避免硬编码与 profile 不一致
      const profile = this.getTranscribeProviderProfile(id, p);
      const needsKey = !!profile.requiresKey && !canOmitServiceApiKey(p.endpoint);
      return !!(p.endpoint && p.model && (!needsKey || p.apiKey));
    })();
    const hasLlm = !!(this.plugin.settings.llmEndpoint && this.plugin.settings.llmModel && (this.plugin.settings.llmApiKey || canOmitServiceApiKey(this.plugin.settings.llmEndpoint)));
    const dailyOn = this.plugin.settings.writeDailyMeetingOverview !== false;

    const head = page.createDiv({ cls: "lexvoice-home-head" });
    const titleLine = head.createDiv({ cls: "lexvoice-home-title-line" });
    titleLine.createEl("h2", { text: "LexVoice" });
    titleLine.createDiv({ cls: "lexvoice-home-version", text: this.plugin.manifest.version || "" });
    head.createDiv({
      cls: "lexvoice-home-summary",
      text: "录音、转写并整理为 Markdown 纪要。配置转写服务即可开始；需要结构化纪要、问一问和沉淀时，再配置 AI 整理服务。",
    });
    const primary = head.createDiv({ cls: "lexvoice-home-actions" });
    const apiBtn = primary.createEl("button", { text: "配置服务" });
    apiBtn.addClass("mod-cta");
    apiBtn.onclick = () => jump("api");
    const quickBtn = primary.createEl("button", { text: "使用推荐配置" });
    quickBtn.onclick = async () => {
      const ok = await lexvoiceConfirm(this.app, "使用推荐配置？",
        "转写与 AI 整理将切换为硅基流动的推荐设置。已填写的 API Key 和其他服务配置会保留。",
        "切换");
      if (!ok) return;
      await this.applyBeginnerDefaults();
      new obsidian.Notice("已应用推荐配置。请填写 API Key 和模型名称，然后测试连接。", 7000);
      jump("api");
    };
    const aiBtn = primary.createEl("button", { text: hasLlm ? "AI 整理设置" : "配置 AI 整理" });
    aiBtn.onclick = () => jump(hasLlm ? "ai" : "api");
    const panelBtn = primary.createEl("button", { text: "打开 LexVoice 侧边栏" });
    panelBtn.onclick = () => this.plugin.openOutlineView();

    // 快速配置：MiMo / 硅基流动等"一个 Key 同时跑转写 + AI 整理"的供应商，填一次即可两边都配好。
    const oneCard = page.createDiv({ cls: "lexvoice-home-block lexvoice-home-onecard" });
    oneCard.createEl("h3", { text: "快速设置" });
    oneCard.createDiv({ cls: "lexvoice-home-prep-desc", text: "选择服务商并填写 API Key，可同时配置转写和 AI 整理。" });
    let oneCardProviderId = "mimo";
    let oneCardKey = "";
    const oneCardRow = new obsidian.Setting(oneCard).setName("服务商与 API Key");
    oneCardRow.addDropdown(d => {
      for (const id of Object.keys(ONE_CARD_PROVIDERS)) d.addOption(id, ONE_CARD_PROVIDERS[id].label);
      d.setValue(oneCardProviderId);
      d.onChange(v => { oneCardProviderId = v; });
    });
    oneCardRow.addText(t => {
      t.inputEl.type = "password";
      t.setPlaceholder("粘贴该平台的 API Key");
      t.onChange(v => { oneCardKey = v.trim(); });
    });
    oneCardRow.addButton(b => b.setButtonText("应用").setCta().onClick(async () => {
      if (!oneCardKey) { new obsidian.Notice("请先填写 API Key", 4000); return; }
      const cfg = ONE_CARD_PROVIDERS[oneCardProviderId];
      const done = await this.applyOneCardProvider(oneCardProviderId, oneCardKey);
      if (done) {
        new obsidian.Notice(cfg.applyDesc + " 已保存，可在「API」页切换或测试连接。", 8000);
        this.renderSettings();
      }
    }));
    // 检测：测当前转写 + 大模型连通性
    oneCardRow.addButton(b => b.setButtonText("检测").onClick(async () => {
      b.setDisabled(true); b.setButtonText("检测中…");
      new obsidian.Notice("正在检测转写 + 大模型连通性…", 4000);
      try { new obsidian.Notice(await this.runComboConnectivityTest(), 9000); }
      finally { b.setDisabled(false); b.setButtonText("检测"); }
    }));

    const prep = page.createDiv({ cls: "lexvoice-home-block" });
    prep.createEl("h3", { text: "使用准备" });
    const prepGrid = prep.createDiv({ cls: "lexvoice-home-prep-grid" });
    const prepItems = [
      {
        name: "纪要转写服务",
        need: "必填",
        price: "云端付费 / 本地免费",
        desc: "将录音转换为原始文字。可选择云端转写服务或本地 Whisper、SenseVoice 等服务；对数据本地化有要求时优先考虑本地部署。",
        action: "配置纪要转写",
        target: "api",
        status: hasSpeechProvider ? "已配置" : "未配置",
        statusClass: hasSpeechProvider ? "is-ready" : "is-required",
      },
      {
        name: "AI 整理服务",
        need: "推荐",
        price: "按量付费",
        desc: "将原始转写整理为会议纪要、待办或访谈记录。未配置时仅保留转写文本，不会进行结构化整理。",
        action: "配置 AI 整理",
        target: "api",
        status: hasLlm ? "已配置" : "未配置",
        statusClass: hasLlm ? "is-ready" : "is-required",
      },
      {
        name: "电脑音频捕获",
        need: "会议/视频适用",
        price: "可免费",
        desc: "录制电脑声音需要虚拟声卡。选择包含电脑音频的录音来源后，在「设置电脑音频」中完成配置。",
        action: "查看设备指引",
        target: "general",
        status: "按需准备",
        statusClass: "is-neutral",
      },
      {
        name: "Obsidian 日记",
        need: "可选",
        price: "免费",
        desc: "启用后，处理完成时会将「今日会议概要」与待办写入当日日记；若文件不存在，按日记插件配置的路径与模板自动创建。",
        action: "设置日记概要",
        target: "general",
        status: dailyOn ? "已开启" : "未开启",
        statusClass: dailyOn ? "is-ready" : "is-neutral",
      },
    ];
    for (const item of prepItems) {
      const card = prepGrid.createDiv({ cls: "lexvoice-home-prep" });
      card.createDiv({ cls: "lexvoice-home-prep-name", text: item.name });
      const meta = card.createDiv({ cls: "lexvoice-home-prep-meta" });
      meta.createDiv({ cls: "lexvoice-home-chip" + (item.need === "必填" ? " is-required" : item.need === "推荐" ? " is-recommended" : ""), text: item.need });
      meta.createDiv({ cls: "lexvoice-home-chip is-cost", text: item.price });
      card.createDiv({ cls: "lexvoice-home-prep-desc", text: item.desc });
      const actions = card.createDiv({ cls: "lexvoice-home-prep-actions" });
      actions.createDiv({ cls: "lexvoice-home-status " + item.statusClass, text: item.status });
      const btn = actions.createEl("button", { text: item.action });
      btn.onclick = () => jump(item.target);
    }

    const better = page.createDiv({ cls: "lexvoice-home-block" });
    better.createEl("h3", { text: "进阶能力" });
    const betterRows = [
      ["整理提示词", "管理内置和自定义提示词。自定义提示词会出现在录音、导入和重新整理的选择列表中。", hasLlm ? "管理提示词" : "配置 AI 整理", hasLlm ? "ai" : "api"],
      ["多语种会议整理", "在 AI 整理中启用纪要翻译，可由大模型在整理阶段统一输出至目标语言，或保留关键原文形成双语纪要。", "去设置", "ai"],
      ["资料库", "从纪要中沉淀转写词表、人员资料、学习卡片和待办。纪要用于追溯，资料用于复用和检索。", "打开资料库", "knowledge"],
      ["自动更新", "检查并安装 LexVoice 新版本；本地设置、保存路径与自定义提示词不会被覆盖。", "检查更新", "updates"],
    ];
    for (const [name, desc, btnText, target] of betterRows) {
      new obsidian.Setting(better)
        .setName(name)
        .setDesc(desc)
        .addButton((btn) => btn.setButtonText(btnText).onClick(() => jump(target)));
    }

    const footer = page.createDiv({ cls: "lexvoice-home-footnote" });
    footer.setText("费用说明：LexVoice 插件本身免费。云端转写与大模型服务由对应平台按量计费；本地模型不产生平台费用，但需自行安装、启动与维护。");
  }

  createAudioInputButton(parent, text, onClick, cls = "") {
    const btn = parent.createEl("button", { text, cls: ["lexvoice-audio-input-btn", cls].filter(Boolean).join(" ") });
    btn.onclick = onClick;
    return btn;
  }

  async populateAudioInputMicSelect(selectEl, hintEl) {
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
    const selected = this.plugin.settings.selectedMicrophoneDevice || "";
    const addOption = (value, text) => selectEl.createEl("option", { value, text });
    // 去掉「自动」选项：直接列出所有麦克风设备让用户手动选；未选时显示占位提示
    addOption("", "— 请选择麦克风 —");

    if (isLexVoiceMobileRuntime()) {
      selectEl.value = "";
      selectEl.disabled = true;
      hintEl.setText("移动端使用系统麦克风；电脑音频和虚拟声卡采集请在桌面端配置。");
      return;
    }

    let info;
    try {
      info = await enumerateAudioDevices();
    } catch {
      selectEl.disabled = true;
      addOption("__error", "设备读取失败，请先授权");
      selectEl.value = "__error";
      hintEl.setText("无法读取设备列表。请先授予麦克风权限，再点「设备检测」。");
      return;
    }

    let hasSelected = false;
    // 手动选择模式：列出**所有**音频输入设备，不再按名字过滤。
    // 启发式判为虚拟/远程的（如 SoundWire / CABLE Output）只加个 "(可能是虚拟)" 提示，但不挡用户选 ——
    // 因为有些用户的真实麦克风名字里就带 SoundWire 等关键词，过滤会把真麦克风弄丢。
    const allInputs = (info.all || []).filter((d) => d && d.kind === "audioinput");
    for (const dev of allInputs) {
      const label = dev.label || "未授权读取设备名";
      const suffix = isVirtualCableLabel(dev.label) ? "（可能是虚拟/远程）" : "";
      addOption(dev.deviceId, label + suffix);
      if (dev.deviceId === selected) hasSelected = true;
    }

    if (selected && !hasSelected) {
      addOption(selected, "当前已选设备未检测到");
    }

    selectEl.disabled = false;
    selectEl.value = selected || "";

    if (selected && !hasSelected) {
      hintEl.setText("所选麦克风未连接，请重新选择。");
    } else if (info.permissionRequired) {
      hintEl.setText("需要麦克风权限才能显示设备名称。");
    } else if (allInputs.length === 0) {
      hintEl.setText("未找到音频输入设备。请检查系统设置和麦克风权限。");
    } else if (selected) {
      hintEl.setText("使用此设备录音。");
    } else {
      hintEl.setText("使用系统默认输入设备。录制人声时，建议明确选择麦克风。");
    }
  }

  async populateAudioInputVirtualSelect(selectEl, hintEl) {
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
    const selected = this.plugin.settings.selectedVirtualDevice || "";
    const addOption = (value, text) => selectEl.createEl("option", { value, text });
    addOption("", "— 请选择电脑音频输入 —");

    if (isLexVoiceMobileRuntime()) {
      selectEl.value = "";
      selectEl.disabled = true;
      hintEl.setText("移动端不支持电脑音频采集，请在桌面端配置虚拟声卡。");
      return;
    }

    let info;
    try {
      info = await enumerateAudioDevices();
    } catch {
      selectEl.disabled = true;
      addOption("__error", "设备读取失败，请先授权");
      selectEl.value = "__error";
      hintEl.setText("无法读取设备列表。请先授予麦克风权限，再选择设备。");
      return;
    }

    let hasSelected = false;
    // 列出所有音频输入设备，不过滤；启发式判为虚拟声卡的标「推荐」（电脑音频通常就走虚拟声卡）
    const allInputs = (info.all || []).filter((d) => d && d.kind === "audioinput");
    for (const dev of allInputs) {
      const suffix = isVirtualCableLabel(dev.label) ? "（推荐 · 虚拟声卡）" : "";
      addOption(dev.deviceId, (dev.label || "未授权读取设备名") + suffix);
      if (dev.deviceId === selected) hasSelected = true;
    }
    if (selected && !hasSelected) addOption(selected, "当前已选设备未检测到");

    selectEl.disabled = false;
    selectEl.value = selected || "";

    if (selected && !hasSelected) {
      hintEl.setText("当前已选电脑音频设备可能已断开。请重新选择。");
    } else if (allInputs.length === 0) {
      hintEl.setText("未找到电脑音频输入。请先设置虚拟声卡。");
    } else if (selected) {
      hintEl.setText("电脑播放的声音会从这个输入录入。");
    } else {
      hintEl.setText("请手动选择采集电脑声音的虚拟声卡输入（通常是 CABLE Output / BlackHole 等）。");
    }
  }

  renderAudioInputSettings(c) {
    const mode = normalizeAudioInputMode(this.plugin.settings.captureMode || "mic");
    const card = c.createDiv({ cls: "lexvoice-audio-input-card" });

    const head = card.createDiv({ cls: "lexvoice-audio-input-head" });
    const actions = head.createDiv({ cls: "lexvoice-audio-input-actions" });
    this.createAudioInputButton(actions, "自动设置", async () => {
      await this.autoConfigureAudioInput();
      this.renderSettings();
    });
    this.createAudioInputButton(actions, "测试设备", async () => {
      await this.runAudioDiagnostic();
    });
    this.createAudioInputButton(actions, "设置电脑音频", () => new VirtualCableSetupModal(this.app, this.plugin).open());

    const grid = card.createDiv({ cls: "lexvoice-audio-input-grid" });

    const modeField = grid.createDiv({ cls: "lexvoice-audio-input-field" });
    modeField.createDiv({ cls: "lexvoice-audio-input-label", text: "录音来源" });
    const modeSelect = modeField.createEl("select", { cls: "dropdown lexvoice-audio-input-select" });
    modeSelect.createEl("option", { value: "mic", text: "仅麦克风" });
    modeSelect.createEl("option", { value: "mix-virtual", text: "麦克风 + 电脑音频" });
    modeSelect.createEl("option", { value: "virtualCable", text: "仅电脑音频" });
    modeSelect.value = mode;
    modeSelect.addEventListener("change", async () => {
      this.plugin.settings.captureMode = normalizeAudioInputMode(modeSelect.value);
      await this.plugin.saveSettings();
      this.renderSettings();
    });
    const modeHint = modeField.createDiv({ cls: "lexvoice-audio-input-hint" });
    modeHint.setText(mode === "mic"
      ? "录制所选麦克风。"
      : mode === "virtualCable"
        ? "录制电脑播放的声音。"
        : "同时录制麦克风和电脑声音。");

    // 麦克风选择器：仅麦克风 / 混合模式下显示（仅电脑音频模式不需要麦克风）
    if (mode === "mic" || mode === "mix-virtual") {
      const micField = grid.createDiv({ cls: "lexvoice-audio-input-field" });
      micField.createDiv({ cls: "lexvoice-audio-input-label", text: "麦克风" });
      const micSelect = micField.createEl("select", { cls: "dropdown lexvoice-audio-input-select" });
      const micHint = micField.createDiv({ cls: "lexvoice-audio-input-hint" });
      micSelect.addEventListener("change", async () => {
        if (micSelect.value === "__error") return;
        this.plugin.settings.selectedMicrophoneDevice = micSelect.value;
        await this.plugin.saveSettings();
        await this.populateAudioInputMicSelect(micSelect, micHint);
        new obsidian.Notice(micSelect.value ? "麦克风选择已保存" : "请选择一个麦克风");
      });
      void this.populateAudioInputMicSelect(micSelect, micHint);
    }

    if (mode === "mic" && !isLexVoiceMobileRuntime()) {
      const channelField = grid.createDiv({ cls: "lexvoice-audio-input-field lexvoice-audio-channel-field" });
      const titleRow = channelField.createDiv({ cls: "lexvoice-audio-channel-title-row" });
      titleRow.createDiv({ cls: "lexvoice-audio-input-label", text: "说话人区分" });
      const titleActions = titleRow.createDiv({ cls: "lexvoice-audio-channel-title-actions" });
      const channelModeSelect = titleActions.createEl("select", {
        cls: "dropdown lexvoice-audio-channel-mode",
        attr: { "aria-label": "说话人区分方式" },
      });
      channelModeSelect.createEl("option", { value: "auto", text: "自动（推荐）" });
      channelModeSelect.createEl("option", { value: "mono", text: "关闭" });
      channelModeSelect.createEl("option", { value: "multichannel", text: "按声道区分" });
      channelModeSelect.value = normalizeAudioChannelMode(this.plugin.settings.audioChannelMode);
      channelModeSelect.addEventListener("change", async () => {
        this.plugin.settings.audioChannelMode = normalizeAudioChannelMode(channelModeSelect.value);
        await this.plugin.saveSettings();
        this.renderSettings();
      });
      const detectButton = titleActions.createEl("button", {
        cls: "lexvoice-audio-channel-detect",
        text: "测试",
        attr: { type: "button" },
      });
      const channelHint = channelField.createDiv({ cls: "lexvoice-audio-input-hint lexvoice-audio-channel-hint" });
      const selectedChannelMode = normalizeAudioChannelMode(this.plugin.settings.audioChannelMode);
      channelHint.setText(selectedChannelMode === "mono"
        ? "所有录音按一位说话人处理。"
        : selectedChannelMode === "multichannel"
          ? "尝试按独立声道区分说话人；单声道录音会自动回退。"
          : "仅在录音确认包含多个独立声道时区分说话人。");
      const channelResult = channelField.createDiv({ cls: "lexvoice-audio-channel-result" });
      detectButton.onclick = async () => {
        detectButton.disabled = true;
        detectButton.setText("正在测试…");
        renderChannelProbeRows(channelResult, [
          { label: "测试", value: "请分别对每支麦克风说话", state: "running" },
        ]);
        let stream = null;
        try {
          const selected = String(this.plugin.settings.selectedMicrophoneDevice || "").trim();
          const audio = buildMicrophoneAudioConstraints({
            deviceId: selected,
            channelMode: selectedChannelMode,
            targetChannels: MAX_SPEAKER_CHANNELS,
          });
          stream = await navigator.mediaDevices.getUserMedia({ audio });
          const info = await configureMicrophoneTrackChannels(
            stream.getAudioTracks()[0],
            selectedChannelMode,
            MAX_SPEAKER_CHANNELS,
          );
          const probeBlob = await recordChannelProbe(stream, 5000);
          const analysis = await analyzeRecordedAudioChannels(probeBlob);
          const activeChannels = analysis.channels
            .slice(0, MAX_SPEAKER_CHANNELS)
            .filter((item) => item.active)
            .map((item) => `声道 ${item.channel}`);
          let contentStatus = "未确认";
          let contentState = "warning";
          if (analysis.separation === "separated") {
            contentStatus = "已分离";
            contentState = "success";
          } else if (analysis.separation === "duplicated") {
            contentStatus = "内容相同";
            contentState = "warning";
          } else if (analysis.separation === "single") {
            contentStatus = "单声道";
            contentState = "muted";
          }
          renderChannelProbeRows(channelResult, [
            { label: "输入设备", value: `${info.channelCount} 个声道`, state: info.channelCount > 1 ? "success" : "muted" },
            { label: "测试录音", value: `${analysis.channelCount} 个声道`, state: analysis.channelCount > 1 ? "success" : "muted" },
            { label: "检测到声音", value: activeChannels.length ? activeChannels.join("、") : "无", state: activeChannels.length ? "success" : "warning" },
            { label: "说话人区分", value: contentStatus, state: contentState },
          ]);
          if (analysis.separation === "separated") {
            channelHint.setText("测试通过。各声道将分别标记为说话人1、说话人2……");
            channelField.addClass("is-multichannel");
            channelField.removeClass("is-channel-warning");
          } else if (analysis.separation === "duplicated") {
            channelHint.setText("各声道内容相同。请在接收器上把输出改为「Stereo（立体声）」后重试。");
            channelField.removeClass("is-multichannel");
            channelField.addClass("is-channel-warning");
          } else {
            channelHint.setText(analysis.channelCount > 1
              ? "未能确认各声道是否分离。请分别对每支麦克风说话后重试。"
              : "当前录音为单声道，无法按声道区分说话人。");
            channelField.removeClass("is-multichannel");
            channelField.addClass("is-channel-warning");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          channelHint.setText(`测试失败：${message}`);
          renderChannelProbeRows(channelResult, [
            { label: "检测结果", value: message, state: "error" },
          ]);
          channelField.removeClass("is-multichannel");
          channelField.addClass("is-channel-warning");
        } finally {
          if (stream) stream.getTracks().forEach((track) => track.stop());
          detectButton.disabled = false;
          detectButton.setText("测试");
        }
      };
    }

    // 电脑音频选择器：仅电脑音频 / 混合模式下显示（原来藏在「设备检测」里，现在直接放到主卡片）
    if (mode === "virtualCable" || mode === "mix-virtual") {
      const vcField = grid.createDiv({ cls: "lexvoice-audio-input-field" });
      vcField.createDiv({ cls: "lexvoice-audio-input-label", text: "电脑音频输入" });
      const vcSelect = vcField.createEl("select", { cls: "dropdown lexvoice-audio-input-select" });
      const vcHint = vcField.createDiv({ cls: "lexvoice-audio-input-hint" });
      vcSelect.addEventListener("change", async () => {
        if (vcSelect.value === "__error") return;
        this.plugin.settings.selectedVirtualDevice = vcSelect.value;
        await this.plugin.saveSettings();
        await this.populateAudioInputVirtualSelect(vcSelect, vcHint);
        new obsidian.Notice(vcSelect.value ? "电脑音频输入选择已保存" : "请选择一个电脑音频输入");
      });
      void this.populateAudioInputVirtualSelect(vcSelect, vcHint);
    }

    this.diagResultEl = card.createDiv({ cls: "lexvoice-diag-result lexvoice-audio-input-diag" });
  }

  renderGeneral(c) {
    new obsidian.Setting(c)
      .setName("音频输入")
      .setDesc("选择录音来源和实际输入设备。混合录音时请明确指定本人说话使用的麦克风。")
      .setHeading();
    this.renderAudioInputSettings(c);

    new obsidian.Setting(c)
      .setName("文件与命名")
      .setDesc("设置新录音、纪要和会中材料的保存位置，以及新纪要的文件名格式。")
      .setHeading();

    new obsidian.Setting(c).setName("LexVoice 录音文件夹")
      .setDesc("Obsidian 库内的相对路径。录音文件默认保存到 LexVoice/录音，可按需要改成其他位置。修改后仅影响新文件，已有文件不会自动迁移。")
      .addText(t => t
        .setPlaceholder("LexVoice/录音")
        .setValue(this.plugin.settings.audioFolder)
        .onChange(async v => { this.plugin.settings.audioFolder = v.trim() || DEFAULT_SETTINGS.audioFolder; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("LexVoice 转写纪要文件夹")
      .setDesc("Obsidian 库内的相对路径。转写和整理后的纪要默认保存到 LexVoice/转写纪要，可按需要改成其他位置。修改后仅影响新文件，已有文件不会自动迁移。")
      .addText(t => t
        .setPlaceholder("LexVoice/转写纪要")
        .setValue(this.plugin.settings.mdFolder)
        .onChange(async v => { this.plugin.settings.mdFolder = v.trim() || DEFAULT_SETTINGS.mdFolder; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("LexVoice 会中材料文件夹")
      .setDesc("Obsidian 库内的相对路径。录音侧边栏添加的图片、PPT、PDF 等补充材料会复制到这里，并按本次录音建立子文件夹。")
      .addText(t => t
        .setPlaceholder("LexVoice/会议资料")
        .setValue(this.plugin.settings.meetingMaterialsFolder || DEFAULT_SETTINGS.meetingMaterialsFolder)
        .onChange(async v => {
          this.plugin.settings.meetingMaterialsFolder = obsidian.normalizePath(v.trim() || DEFAULT_SETTINGS.meetingMaterialsFolder);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("纪要文件名格式")
      .setDesc("每次录音生成一篇独立纪要。用日期占位符命名：YYYY 年、MM 月、DD 日、HH 时、mm 分，例如 YYYY-MM-DD HHmm 会生成「2026-06-10 1830」。写法与 Obsidian 日记插件相同。")
      .addText(t => t.setValue(this.plugin.settings.noteFileNameFormatNew).onChange(async v => { this.plugin.settings.noteFileNameFormatNew = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c)
      .setName("完成后动作")
      .setDesc("控制纪要完成后的打开行为，以及是否把会议概要和待办写入当日日记。")
      .setHeading();

    new obsidian.Setting(c).setName("完成后自动打开纪要")
      .addToggle(t => t.setValue(this.plugin.settings.autoOpenNoteAfterFinish).onChange(async v => { this.plugin.settings.autoOpenNoteAfterFinish = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("写入今日会议概要到日记")
      .setDesc("Obsidian 日记已启用时，处理完成后写入纪要链接和概要；识别到待办时使用 - [ ] 任务语法写入。当日日记不存在时，会按日记插件配置的路径与模板自动创建。")
      .addToggle(t => t.setValue(this.plugin.settings.writeDailyMeetingOverview !== false).onChange(async v => { this.plugin.settings.writeDailyMeetingOverview = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("日记写入标题")
      .setDesc("LexVoice 会在当日日记中找到或创建这个二级标题，并把每次整理完成后的概要写到标题下方。")
      .addText(t => t
        .setPlaceholder(DEFAULT_DAILY_MEETING_OVERVIEW_HEADING)
        .setValue(this.plugin.settings.dailyMeetingOverviewHeading || DEFAULT_DAILY_MEETING_OVERVIEW_HEADING)
        .onChange(async v => {
          this.plugin.settings.dailyMeetingOverviewHeading = v.replace(/^#+\s*/, "").trim() || DEFAULT_DAILY_MEETING_OVERVIEW_HEADING;
          await this.plugin.saveSettings();
        }));

    const dailyTplSetting = new obsidian.Setting(c)
      .setName("日记写入模板")
      .setDesc("用于控制每条概要写入日记的格式。可用占位符：{{date}}、{{time}}、{{note_link}}、{{title}}、{{mode}}、{{duration}}、{{segments}}、{{model}}、{{summary}}、{{todos}}、{{todos_block}}、{{todo_count}}。");
    dailyTplSetting.addButton(b => b.setButtonText("恢复默认").onClick(async () => {
      const ok = await lexvoiceConfirm(this.app, "恢复默认日记模板？", "将丢弃当前自定义模板，且无法撤销。", "恢复默认");
      if (!ok) return;
      this.plugin.settings.dailyMeetingOverviewTemplate = DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
      await this.plugin.saveSettings();
      new obsidian.Notice("已恢复默认日记模板");
      this.renderSettings();
    }));
    const dailyTplTa = c.createEl("textarea", { cls: "lexvoice-textarea lexvoice-textarea-mono" });
    dailyTplTa.rows = 8;
    dailyTplTa.value = this.plugin.settings.dailyMeetingOverviewTemplate || DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
    dailyTplTa.placeholder = DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
    dailyTplTa.addEventListener("change", async () => {
      this.plugin.settings.dailyMeetingOverviewTemplate = dailyTplTa.value.trim() || DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
      await this.plugin.saveSettings();
    });

    new obsidian.Setting(c)
      .setName("悬浮按钮")
      .setDesc("设置桌面悬浮按钮的显示和大小。")
      .setHeading();

    new obsidian.Setting(c).setName("显示悬浮按钮")
      .setDesc("开启后常驻显示，可拖动到任意位置；关闭后隐藏。")
      .addToggle(t => t.setValue(this.plugin.settings.showFloatingBall).onChange(async v => {
        this.plugin.settings.showFloatingBall = v; await this.plugin.saveSettings();
        this.plugin.syncBubbleVisibility();
      }));

    new obsidian.Setting(c).setName("悬浮按钮大小")
      .setDesc("调整按钮及其展开控件的大小。")
      .addDropdown(d => d
        .addOption("large", "大")
        .addOption("medium", "中")
        .addOption("small", "小")
        .setValue(this.plugin.settings.bubbleSize || "large")
        .onChange(async v => {
          this.plugin.settings.bubbleSize = v; await this.plugin.saveSettings();
          this.plugin.syncBubbleVisibility();
        }));
  }



  getTranscribeProviderProfile(id, provider) {
    return this.plugin.getTranscribeProviderProfile(id, provider);
  }

  renderTranscribeProviderGuide(c, activeId, provider, profile) {
    const p = provider || {};
    const needsKey = !!profile.requiresKey && !canOmitServiceApiKey(p.endpoint);
    const ready = !!(p.endpoint && p.model && (!needsKey || p.apiKey));
    const missing = [];
    if (!p.endpoint) missing.push("服务地址");
    if (!p.model) missing.push("模型名称");
    if (needsKey && !p.apiKey) missing.push("访问密钥");

    const panel = c.createEl("details", { cls: "lexvoice-provider-panel" });
    panel.open = !ready;
    const head = panel.createEl("summary", { cls: "lexvoice-provider-head" });
    const titleWrap = head.createDiv({ cls: "lexvoice-provider-title-wrap" });
    titleWrap.createDiv({ cls: "lexvoice-provider-title", text: profile.title });
    titleWrap.createDiv({ cls: "lexvoice-provider-subtitle", text: profile.description });
    const badges = head.createDiv({ cls: "lexvoice-provider-badges" });
    badges.createDiv({ cls: "lexvoice-provider-badge", text: profile.badge });
    badges.createDiv({ cls: ready ? "lexvoice-provider-status is-ready" : "lexvoice-provider-status is-missing", text: ready ? "已填写" : "待填写" });

    const body = panel.createDiv({ cls: "lexvoice-provider-body" });
    const checklist = body.createEl("ol", { cls: "lexvoice-provider-checklist" });
    for (const step of profile.steps || []) checklist.createEl("li", { text: step });
    if (missing.length) {
      body.createDiv({ cls: "lexvoice-provider-missing", text: "还需要填写：" + missing.join("、") });
    }
    if (profile.priceHint) {
      body.createDiv({ cls: "lexvoice-provider-price", text: profile.priceHint });
    }
    if (profile.note) {
      body.createDiv({ cls: "lexvoice-provider-note", text: profile.note });
    }
    if (profile.links && profile.links.length) {
      const row = body.createDiv({ cls: "lexvoice-provider-links" });
      for (const [label, url] of profile.links) {
        const btn = row.createEl("button", { text: label });
        btn.onclick = () => openLexVoiceExternalUrl(url);
      }
    }
  }

  // 用一段 1 秒静音音频走完整转写链路，验证当前转写服务连通性。返回识别文本（可能为空字符串），失败抛错。
  async runAsrConnectivityTest() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start();
      const rec = new MediaRecorder(dest.stream);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      await new Promise((resolve) => { rec.onstop = resolve; rec.start(); window.setTimeout(() => rec.stop(), 1000); });
      const blob = new Blob(chunks, { type: rec.mimeType });
      return await transcribeAudio(this.plugin, blob, blob.type);
    } finally {
      try { await ctx.close(); } catch { /* intentionally empty */ }
    }
  }

  // 依次测「转写 + 大模型」连通性，返回一行汇总文案。供 API 方案检测 / 首页快速配置检测共用。
  async runComboConnectivityTest() {
    let asrPart, llmPart;
    try { const t = await this.runAsrConnectivityTest(); asrPart = `转写 ✓（${(t || "<空>").slice(0, 16)}）`; }
    catch (e) { asrPart = `转写 ✗：${(e && e.message) || e}`; }
    try { const r = await testLlmConnection(this.plugin); llmPart = `大模型 ✓（${r.model || "?"}）`; }
    catch (e) { llmPart = `大模型 ✗：${(e && e.message) || e}`; }
    return `${asrPart}\u3000|\u3000${llmPart}`;
  }

  renderApiSchemeSelector(c) {
    new obsidian.Setting(c)
      .setName("API 配置")
      .setDesc("保存并切换转写与 AI 整理服务。")
      .setHeading();
    const schemes = Array.isArray(this.plugin.settings.llmProfiles) ? this.plugin.settings.llmProfiles : [];
    const activeId = this.plugin.settings.activeLlmProfile || "";

    // 自定义布局（不用 obsidian.Setting 的左名右控件，避免下拉+3按钮+长说明挤成一团）：
    // 说明整行 → 下拉(占主) + 按钮同一行 → 激活态提示整行淡字。
    const block = c.createDiv({ cls: "lexvoice-scheme-block" });

    const controls = block.createDiv({ cls: "lexvoice-scheme-controls" });
    const sel = controls.createEl("select", { cls: "dropdown lexvoice-scheme-select" });
    const addOpt = (value, label) => { const o = sel.createEl("option", { text: label }); o.value = value; };
    addOpt("", "临时配置（未保存）");
    for (const p of schemes) addOpt(p.id, p.name);
    sel.value = activeId;
    sel.addEventListener("change", async () => {
      const id = sel.value;
      if (!id) { this.plugin.settings.activeLlmProfile = ""; await this.plugin.saveSettings(); this.renderSettings(); return; }
      applyLlmProfileToWorkingConfig(this.plugin.settings, id);
      await this.plugin.saveSettings();
      const p = findLlmProfile(this.plugin.settings, id);
      new obsidian.Notice(`已切换到配置「${p ? p.name : id}」${p && p.asr ? "（转写与 AI 整理）" : "（仅 AI 整理）"}`, 5000);
      this.renderSettings();
    });

    const btns = controls.createDiv({ cls: "lexvoice-scheme-btns" });
    const testBtn = btns.createEl("button", { text: "检测" });
    testBtn.onclick = async () => {
      testBtn.disabled = true; testBtn.setText("检测中…");
      new obsidian.Notice("正在检测转写 + 大模型连通性…", 4000);
      try { new obsidian.Notice(await this.runComboConnectivityTest(), 9000); }
      finally { testBtn.disabled = false; testBtn.setText("检测"); }
    };

    const saveBtn = btns.createEl("button", { cls: "mod-cta", text: "保存配置" });
    saveBtn.onclick = async () => {
      const name = await lexvoicePromptText(this.app, "配置名称", "如 MiMo / DeepSeek + 硅基流动 / 本地模型");
      if (name === null) return;
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) { new obsidian.Notice("名字不能为空"); return; }
      const id = `llm-${genId()}`;
      const scheme = {
        id, name: trimmed,
        endpoint: this.plugin.settings.llmEndpoint || "",
        apiKey: this.plugin.settings.llmApiKey || "",
        model: this.plugin.settings.llmModel || "",
      };
      const asr = snapshotActiveAsr(this.plugin.settings);
      if (asr) scheme.asr = asr; // 同时快照当前转写服务，成为完整方案
      this.plugin.settings.llmProfiles = normalizeLlmProfiles(this.plugin.settings.llmProfiles).concat([scheme]);
      this.plugin.settings.activeLlmProfile = id;
      await this.plugin.saveSettings();
      new obsidian.Notice(`已保存配置「${trimmed}」（含转写与 AI 整理）`, 5000);
      this.renderSettings();
    };
    if (activeId) {
      const delBtn = btns.createEl("button", { cls: "lexvoice-icon-button", attr: { type: "button", "aria-label": "删除当前配置", title: "删除当前配置" } });
      obsidian.setIcon(delBtn, "trash-2");
      delBtn.onclick = async () => {
        const p = findLlmProfile(this.plugin.settings, activeId);
        this.plugin.settings.llmProfiles = normalizeLlmProfiles(this.plugin.settings.llmProfiles).filter(x => x.id !== activeId);
        this.plugin.settings.activeLlmProfile = "";
        await this.plugin.saveSettings();
        new obsidian.Notice(`已删除配置「${p ? p.name : activeId}」。当前服务设置仍会保留。`, 6000);
        this.renderSettings();
      };
    }

    if (activeId) {
      const p = findLlmProfile(this.plugin.settings, activeId);
      const kind = p && p.asr ? "转写与 AI 整理" : "仅 AI 整理（旧配置）";
      const status = block.createDiv({ cls: "lexvoice-scheme-status" });
      status.createSpan({ cls: "lexvoice-scheme-status-name", text: `当前：${p ? p.name : activeId}` });
      status.createSpan({ cls: "lexvoice-scheme-status-sep", text: " · " });
      status.createSpan({ text: kind });
      status.createSpan({ cls: "lexvoice-scheme-status-sep", text: " · " });
      status.createSpan({ cls: "lexvoice-scheme-status-hint", text: "修改下方设置会自动更新当前配置" });
    }
  }

  renderApi(c) {
    // ===== 顶部 · API 方案：把「转写 + AI 整理」存成一套，一键切换/检测 =====
    this.renderApiSchemeSelector(c);

    new obsidian.Setting(c)
      .setName("实时录音")
      .setDesc("配置会议录音使用的转写服务。导入音频使用独立服务，在“说话人”中设置。")
      .setHeading();

    this.renderDataRiskNotice(c, "is-api");

    new obsidian.Setting(c).setName("转写服务")
      .setDesc("选择当前用于语音转写的服务。下方只显示所选服务的配置项。")
      .addDropdown(d => {
        for (const id of Object.keys(this.plugin.settings.transcribeProviders)) {
          const p = this.plugin.settings.transcribeProviders[id];
          const optProfile = this.getTranscribeProviderProfile(id, p);
          d.addOption(id, optProfile.title || id);
        }
        d.setValue(this.plugin.settings.activeTranscribeProvider || "siliconflow")
          .onChange(async v => {
            this.plugin.settings.activeTranscribeProvider = v;
            await this.plugin.saveSettings();
            this.renderSettings();
          });
      });

    const activeId = this.plugin.settings.activeTranscribeProvider || "siliconflow";
    const provider = this.plugin.settings.transcribeProviders[activeId] || {};
    const profile = this.getTranscribeProviderProfile(activeId, provider);
    this.renderTranscribeProviderGuide(c, activeId, provider, profile);
    const writeProvider = async (key, val) => {
      this.plugin.settings.transcribeProviders[activeId][key] = val;
      // 改了转写配置 → 同步进当前激活的完整方案（实现"下方任何修改自动更新到这套方案"，含自动存密钥）
      syncWorkingAsrToActiveScheme(this.plugin.settings);
      await this.plugin.saveSettings();
    };

    const providerNeedsKey = !!profile.requiresKey && !canOmitServiceApiKey(provider.endpoint);
    new obsidian.Setting(c).setName(providerNeedsKey ? "访问密钥" : "访问密钥（可选）")
      .setDesc(profile.keyHelp)
      .addText(t => { t.inputEl.type = "password"; t.setValue(provider.apiKey || "").onChange(v => writeProvider("apiKey", v)); });

    new obsidian.Setting(c).setName("服务地址")
      .setDesc(profile.endpointHelp)
      .addText(t => t.setValue(provider.endpoint || "")
        .setPlaceholder(profile.endpointPlaceholder || "")
        .onChange(v => writeProvider("endpoint", v.trim())));

    new obsidian.Setting(c).setName("模型名称")
      .setDesc(profile.modelHelp)
      .addText(t => t.setValue(provider.model || "")
        .setPlaceholder(profile.modelPlaceholder || "")
        .onChange(v => writeProvider("model", v.trim())));

    if (!profile.hideLanguage) {
      new obsidian.Setting(c).setName("识别语言")
        .setDesc(profile.languageHelp || "留空或 auto 表示自动检测；中文通常填 zh，英文填 en。")
        .addText(t => t.setValue(provider.language || "")
          .setPlaceholder(profile.languagePlaceholder || "")
          .onChange(v => writeProvider("language", v.trim())));
    }

    if (profile.showTargetLanguage) {
      const targetLanguages = [
        ["en", "英语 English"],
        ["zh", "中文 Chinese"],
        ["ja", "日语 日本語"],
        ["ko", "韩语 한국어"],
        ["fr", "法语 Français"],
        ["es", "西班牙语 Español"],
        ["de", "德语 Deutsch"],
        ["it", "意大利语 Italiano"],
        ["pt", "葡萄牙语 Português"],
        ["ru", "俄语 Русский"],
        ["ar", "阿拉伯语 العربية"],
        ["hi", "印地语 हिन्दी"],
        ["tr", "土耳其语 Türkçe"],
      ];
      new obsidian.Setting(c).setName("目标语言（翻译输出）")
        .setDesc("选择 LexVoice 把语音翻译成哪种语言。说话人语言会自动检测。")
        .addDropdown(d => {
          for (const [code, label] of targetLanguages) d.addOption(code, label);
          d.setValue(provider.targetLanguage || "zh")
            .onChange(v => writeProvider("targetLanguage", v));
        });
    }

    if (profile.transcribeMode === "streaming") {
      const tip = c.createDiv({ cls: "lexvoice-provider-streaming-tip" });
      tip.setText("实时模式：录音全程与服务保持连线，边说边出文字，不再切段上传。「进阶 → 录音行为」中的「分段间隔」「即时分段」对此服务不生效。");
    }

    new obsidian.Setting(c).setName("连通性测试")
      .setDesc("用一段 1 秒静音音频验证当前转写服务是否可用。")
      .addButton(b => b.setButtonText("测试").onClick(async () => {
        b.setDisabled(true); b.setButtonText("测试中…");
        try {
          const text = await this.runAsrConnectivityTest();
          new obsidian.Notice(`连通成功（返回：${(text || "<空>").slice(0, 30)}）`);
        } catch (e) {
          new obsidian.Notice(`测试失败：${(e && e.message) || e}`);
        } finally {
          b.setDisabled(false); b.setButtonText("测试");
        }
      }));

    new obsidian.Setting(c)
      .setName("AI 整理服务")
      .setDesc("用于纪要整理、问一问、沉淀、招聘提纲、重整和翻译。")
      .setHeading();
    // 「已保存配置」已升级为顶部「API 方案」（同时含转写 + AI 整理），不再在此处单列 LLM-only 版本。

    const activeLlmPresetId = getActiveLlmServicePresetId(this.plugin.settings);
    const activeLlmPreset = getLlmServicePreset(activeLlmPresetId);
    new obsidian.Setting(c).setName("服务预设")
      .setDesc("用于快速填入服务地址和必要的请求头适配，不会覆盖访问密钥。模型标识请按对应服务商或中转站控制台填写。")
      .addDropdown(d => {
        d.addOption("", "自定义服务…");
        for (const preset of LLM_SERVICE_PRESETS) d.addOption(preset.id, preset.label);
        d.setValue(activeLlmPresetId || "");
        d.onChange(async id => {
          const preset = getLlmServicePreset(id);
          this.plugin.settings.llmServicePreset = id || "";
          if (!preset) {
            await this.plugin.saveSettings();
            this.renderSettings();
            return;
          }
          if (preset.endpoint) this.plugin.settings.llmEndpoint = preset.endpoint;
          if (id === "siliconflow" && !this.plugin.settings.llmApiKey) {
            const sfKey = ((this.plugin.settings.transcribeProviders || {}).siliconflow || {}).apiKey || "";
            if (sfKey) this.plugin.settings.llmApiKey = sfKey;
          }
          await this.plugin.saveSettings();
          new obsidian.Notice(`已应用服务预设：${preset.label}。请确认访问密钥和模型标识后测试连接。`, 6000);
          this.renderSettings();
        });
      });

    const llmEndpointHelp = activeLlmPreset && activeLlmPreset.endpointHelp
      ? activeLlmPreset.endpointHelp
      : "填写大模型服务的接口地址（即「OpenAI 兼容 / Chat Completions」地址）。可填到 /v1 或根地址，LexVoice 会自动补全；也可直接填完整的 /v1/chat/completions。";
    const llmKeyHelp = activeLlmPreset && activeLlmPreset.keyHelp
      ? activeLlmPreset.keyHelp
      : "填写服务商或中转站提供的 API Key。本地 localhost 大模型服务可留空。";
    const llmModelHelp = activeLlmPreset && activeLlmPreset.modelHelp
      ? activeLlmPreset.modelHelp
      : "填写服务要求的 model 名称；Poe、OpenRouter 等中转站以其控制台或模型列表显示的名称为准。";

    new obsidian.Setting(c).setName("服务地址")
      .setDesc(llmEndpointHelp)
      .addText(t => t.setValue(this.plugin.settings.llmEndpoint).onChange(async v => {
        this.plugin.settings.llmEndpoint = v;
        this.plugin.settings.llmServicePreset = inferLlmServicePresetId(this.plugin.settings);
        syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
        await this.plugin.saveSettings();
      }));

    const llmKeyRow = new obsidian.Setting(c).setName("访问密钥")
      .setDesc(llmKeyHelp)
      .addText(t => { t.inputEl.type = "password"; t.setValue(this.plugin.settings.llmApiKey).onChange(async v => { this.plugin.settings.llmApiKey = v; syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile); await this.plugin.saveSettings(); }); });
    const sfSpeechKey = ((this.plugin.settings.transcribeProviders || {}).siliconflow || {}).apiKey || "";
    const mimoSpeechKey = ((this.plugin.settings.transcribeProviders || {}).apimimo || {}).apiKey || "";
    const llmEndpointNow = this.plugin.settings.llmEndpoint || "";
    if (sfSpeechKey && !this.plugin.settings.llmApiKey && /siliconflow\.cn/i.test(llmEndpointNow)) {
      llmKeyRow.addButton(b => b.setButtonText("复用转写密钥").onClick(async () => {
        this.plugin.settings.llmApiKey = sfSpeechKey;
        await this.plugin.saveSettings();
        new obsidian.Notice("已复用硅基流动转写密钥到大模型服务。", 5000);
        this.renderSettings();
      }));
    } else if (mimoSpeechKey && !this.plugin.settings.llmApiKey && /xiaomimimo\.com/i.test(llmEndpointNow)) {
      // MiMo 同平台一把 Key：转写已填、AI 整理还空 → 一键复用（与硅基流动「复用转写密钥」同款，仅填密钥）
      llmKeyRow.addButton(b => b.setButtonText("复用 MiMo 转写密钥").onClick(async () => {
        this.plugin.settings.llmApiKey = mimoSpeechKey;
        await this.plugin.saveSettings();
        new obsidian.Notice("已复用 MiMo 转写密钥到大模型服务。", 5000);
        this.renderSettings();
      }));
    }

    new obsidian.Setting(c).setName("模型标识")
      .setDesc(llmModelHelp)
      .addText(t => {
        t.setPlaceholder(activeLlmPreset && activeLlmPreset.modelPlaceholder ? activeLlmPreset.modelPlaceholder : "例如：服务商控制台显示的模型标识");
        t.setValue(this.plugin.settings.llmModel);
        t.onChange(async v => { this.plugin.settings.llmModel = v; syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile); await this.plugin.saveSettings(); });
      })
      // 一键拉取服务端可用模型列表点选，免去手敲（尤其 Poe 的 bot 名区分大小写、易填错）。
      .addButton(b => b.setButtonText("获取可用模型").onClick(async () => {
        if (!this.plugin.settings.llmEndpoint) { new obsidian.Notice("请先填写服务地址", 4000); return; }
        b.setDisabled(true); b.setButtonText("获取中…");
        try {
          const models = await fetchLlmModelList(this.plugin.settings.llmEndpoint, this.plugin.settings.llmApiKey);
          if (!models.length) { new obsidian.Notice("该服务未返回模型列表，请手动填写模型标识。", 6000); return; }
          openLexVoicePickListModal(this.app, `选择模型（共 ${models.length} 个）`, models, async (id) => {
            this.plugin.settings.llmModel = id;
            syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
            await this.plugin.saveSettings();
            new obsidian.Notice(`已选择模型：${id}`, 4000);
            this.renderSettings();
          });
        } catch (e) {
          new obsidian.Notice(`获取模型列表失败：${(e && e.message) || e}。可手动填写模型标识。`, 8000);
        } finally {
          b.setDisabled(false); b.setButtonText("获取可用模型");
        }
      }));

    new obsidian.Setting(c).setName("大模型连通性测试")
      .setDesc("发送一条极短文本请求，验证服务地址、访问密钥和模型名称是否匹配；不会上传录音、转写文本或提示词。")
      .addButton(b => b.setButtonText("测试连接").onClick(async () => {
        b.setDisabled(true);
        b.setButtonText("测试中…");
        try {
          const result = await testLlmConnection(this.plugin);
          new obsidian.Notice(`大模型连通成功：${result.model || "未命名模型"}（返回：${result.preview || "<空>"}）`, 7000);
        } catch (e) {
          new obsidian.Notice(`大模型测试失败：${e.message || e}`, 8000);
        } finally {
          b.setButtonText("测试连接");
          b.setDisabled(false);
        }
      }));

    // 「默认润色模式」原在此处有第二入口，与「AI 整理」页的「当前默认提示词」同写 polishMode
    // 且两处互不联动刷新——已删除本处副本，统一在 AI 整理页设置。
  }

  renderSpeaker(c) {
    new obsidian.Setting(c)
      .setName("导入音频")
      .setDesc("整文件转写并识别说话人，不参与实时录音分段。")
      .setHeading();

    this.renderDataRiskNotice(c, "is-api");

    const providers = this.plugin.settings.transcribeProviders || {};
    const supportedIds = Object.keys(providers).filter((id) => {
      const profile = this.getTranscribeProviderProfile(id, providers[id] || {});
      return id === "dashscope-filetrans" || !!profile.requiresWholeSession;
    });
    const activeId = supportedIds.includes(this.plugin.settings.importTranscribeProvider)
      ? this.plugin.settings.importTranscribeProvider
      : (supportedIds[0] || "dashscope-filetrans");
    if (this.plugin.settings.importTranscribeProvider !== activeId) {
      this.plugin.settings.importTranscribeProvider = activeId;
    }
    const provider = providers[activeId] || {};
    const profile = this.getTranscribeProviderProfile(activeId, provider);

    new obsidian.Setting(c).setName("转写服务")
      .setDesc("仅用于导入音频，不影响实时录音。")
      .addDropdown((dropdown) => {
        for (const id of supportedIds) {
          const item = providers[id] || {};
          const itemProfile = this.getTranscribeProviderProfile(id, item);
          dropdown.addOption(id, itemProfile.title || item.name || id);
        }
        dropdown.setValue(activeId).onChange(async (value) => {
          this.plugin.settings.importTranscribeProvider = value;
          await this.plugin.saveSettings();
          this.renderSettings();
        });
      });

    this.renderTranscribeProviderGuide(c, activeId, provider, profile);
    const writeProvider = async (key, value) => {
      if (!this.plugin.settings.transcribeProviders[activeId]) {
        this.plugin.settings.transcribeProviders[activeId] = {};
      }
      this.plugin.settings.transcribeProviders[activeId][key] = value;
      await this.plugin.saveSettings();
    };

    const providerNeedsKey = !!profile.requiresKey && !canOmitServiceApiKey(provider.endpoint);
    new obsidian.Setting(c).setName(providerNeedsKey ? "访问密钥" : "访问密钥（可选）")
      .setDesc(profile.keyHelp || "按转写服务要求填写。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(provider.apiKey || "").onChange((value) => writeProvider("apiKey", value));
      });

    new obsidian.Setting(c).setName("服务地址")
      .setDesc(profile.endpointHelp || "导入音频转写接口地址。")
      .addText((text) => text
        .setValue(provider.endpoint || "")
        .setPlaceholder(profile.endpointPlaceholder || "")
        .onChange((value) => writeProvider("endpoint", value.trim())));

    new obsidian.Setting(c).setName("模型名称")
      .setDesc(profile.modelHelp || "填写服务支持的长音频转写模型。")
      .addText((text) => text
        .setValue(provider.model || "")
        .setPlaceholder(profile.modelPlaceholder || "")
        .onChange((value) => writeProvider("model", value.trim())))
      .addButton((button) => button
        .setButtonText("获取模型")
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("获取中…");
          try {
            const models = await fetchImportTranscribeModels(this.plugin, activeId);
            if (!models.length) {
              new obsidian.Notice("服务没有返回可用模型，请手动填写模型名称。", 6000);
              return;
            }
            openLexVoicePickListModal(this.app, `选择导入音频模型（共 ${models.length} 个）`, models, async (model) => {
              await writeProvider("model", model);
              new obsidian.Notice(`已选择模型：${model}`, 4000);
              this.renderSettings();
            });
          } catch (error) {
            new obsidian.Notice(`获取模型失败：${(error && error.message) || error}`, 8000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("获取模型");
          }
        }));

    new obsidian.Setting(c)
      .setName("连接测试")
      .setDesc("验证服务地址、访问密钥和模型是否可用，不上传录音内容。")
      .addButton((button) => button
        .setButtonText("测试连接")
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("测试中…");
          try {
            const result = await testImportTranscribeProvider(this.plugin, activeId);
            new obsidian.Notice(`连接正常：${result.model} · ${result.detail}`, 7000);
          } catch (error) {
            new obsidian.Notice(`连接失败：${(error && error.message) || error}`, 9000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("测试连接");
          }
        }));

    if (!profile.hideLanguage) {
      new obsidian.Setting(c).setName("识别语言")
        .setDesc(profile.languageHelp || "留空或 auto 表示自动检测。")
        .addText((text) => text
          .setValue(provider.language || "")
          .setPlaceholder(profile.languagePlaceholder || "")
          .onChange((value) => writeProvider("language", value.trim())));
    }

    new obsidian.Setting(c)
      .setName("区分说话人")
      .setDesc("转写完成后确认“说话人 1、2、3”对应的姓名，再进入 AI 整理。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.importSpeakerDiarization !== false)
        .onChange(async (value) => {
          this.plugin.settings.importSpeakerDiarization = value;
          await this.plugin.saveSettings();
          this.renderSettings();
        }));

    if (this.plugin.settings.importSpeakerDiarization !== false) {
      new obsidian.Setting(c)
        .setName("说话人数")
        .setDesc("留空表示自动识别；已知人数时填写可提高区分稳定性。")
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "2";
          text.inputEl.max = "100";
          text.inputEl.step = "1";
          text.setPlaceholder("自动");
          text.setValue(this.plugin.settings.importSpeakerCount > 0
            ? String(this.plugin.settings.importSpeakerCount)
            : "");
          text.onChange(async (value) => {
            const number = Math.floor(Number(value) || 0);
            this.plugin.settings.importSpeakerCount = number >= 2 ? Math.min(100, number) : 0;
            await this.plugin.saveSettings();
          });
        });
    }

    new obsidian.Setting(c)
      .setName("AI 整理")
      .setDesc("原始转写写入笔记并确认说话人后，再按当前纪要模板生成正文。")
      .setHeading();

    const llmProfiles = normalizeLlmProfiles(this.plugin.settings.llmProfiles);
    new obsidian.Setting(c)
      .setName("整理配置")
      .setDesc("选择已保存的大模型配置。这里只切换 AI 整理服务，不改变实时录音或导入音频的转写服务。")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "当前临时配置");
        for (const item of llmProfiles) dropdown.addOption(item.id, item.name || item.id);
        dropdown.setValue(this.plugin.settings.activeLlmProfile || "");
        dropdown.onChange(async (id) => {
          if (!id) {
            this.plugin.settings.activeLlmProfile = "";
          } else {
            const selected = findLlmProfile(this.plugin.settings, id);
            if (selected) {
              this.plugin.settings.llmEndpoint = selected.endpoint || "";
              this.plugin.settings.llmApiKey = selected.apiKey || "";
              this.plugin.settings.llmModel = selected.model || "";
              this.plugin.settings.activeLlmProfile = selected.id;
              this.plugin.settings.llmServicePreset = inferLlmServicePresetId(this.plugin.settings);
            }
          }
          await this.plugin.saveSettings();
          this.renderSettings();
        });
      });

    const activeLlmPresetId = getActiveLlmServicePresetId(this.plugin.settings);
    new obsidian.Setting(c)
      .setName("大模型服务")
      .setDesc("选择服务后会填入兼容接口地址；访问密钥不会被覆盖。")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "自定义服务");
        for (const preset of LLM_SERVICE_PRESETS) dropdown.addOption(preset.id, preset.label);
        dropdown.setValue(activeLlmPresetId || "");
        dropdown.onChange(async (id) => {
          const preset = getLlmServicePreset(id);
          this.plugin.settings.llmServicePreset = id || "";
          if (preset?.endpoint) this.plugin.settings.llmEndpoint = preset.endpoint;
          syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
          await this.plugin.saveSettings();
          this.renderSettings();
        });
      });

    const activeLlmPreset = getLlmServicePreset(activeLlmPresetId);
    new obsidian.Setting(c)
      .setName("服务地址")
      .setDesc(activeLlmPreset?.endpointHelp || "填写大模型服务的 OpenAI 兼容接口地址。")
      .addText((text) => text
        .setValue(this.plugin.settings.llmEndpoint || "")
        .setPlaceholder(activeLlmPreset?.endpoint || "https://api.example.com/v1")
        .onChange(async (value) => {
          this.plugin.settings.llmEndpoint = value.trim();
          this.plugin.settings.llmServicePreset = inferLlmServicePresetId(this.plugin.settings);
          syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
          await this.plugin.saveSettings();
        }));

    const llmKeySetting = new obsidian.Setting(c)
      .setName(canOmitServiceApiKey(this.plugin.settings.llmEndpoint) ? "访问密钥（可选）" : "访问密钥")
      .setDesc(activeLlmPreset?.keyHelp || "填写大模型服务的 API Key。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.llmApiKey || "")
          .setPlaceholder("API Key")
          .onChange(async (value) => {
            this.plugin.settings.llmApiKey = value.trim();
            syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
            await this.plugin.saveSettings();
          });
      });
    if (activeLlmPresetId === "dashscope" && activeId === "dashscope-filetrans" && provider.apiKey) {
      llmKeySetting.addButton((button) => button
        .setButtonText("复用转写密钥")
        .onClick(async () => {
          this.plugin.settings.llmApiKey = provider.apiKey;
          syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
          await this.plugin.saveSettings();
          new obsidian.Notice("已复用阿里云百炼转写密钥。", 4000);
          this.renderSettings();
        }));
    }

    new obsidian.Setting(c)
      .setName("AI 模型")
      .setDesc("用于生成最终纪要；不会改变语音转写模型。")
      .addText((text) => text
        .setValue(this.plugin.settings.llmModel || "")
        .setPlaceholder("选择或填写模型标识")
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value.trim();
          syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
          await this.plugin.saveSettings();
        }))
      .addButton((button) => button
        .setButtonText("获取模型")
        .onClick(async () => {
          if (!this.plugin.settings.llmEndpoint) {
            new obsidian.Notice("请先选择大模型服务或填写服务地址。", 5000);
            return;
          }
          button.setDisabled(true);
          button.setButtonText("获取中…");
          try {
            const models = await fetchLlmModelList(this.plugin.settings.llmEndpoint, this.plugin.settings.llmApiKey);
            if (!models.length) {
              new obsidian.Notice("服务没有返回模型列表，请手动填写模型标识。", 6000);
              return;
            }
            openLexVoicePickListModal(this.app, `选择 AI 模型（共 ${models.length} 个）`, models, async (model) => {
              this.plugin.settings.llmModel = model;
              syncWorkingConfigToLlmProfile(this.plugin.settings, this.plugin.settings.activeLlmProfile);
              await this.plugin.saveSettings();
              new obsidian.Notice(`已选择 AI 模型：${model}`, 4000);
              this.renderSettings();
            });
          } catch (error) {
            new obsidian.Notice(`获取模型失败：${(error && error.message) || error}`, 8000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("获取模型");
          }
        }));

    const llmIssue = getLlmConfigIssue(this.plugin.settings);
    new obsidian.Setting(c)
      .setName("连接测试")
      .setDesc(llmIssue || "发送极短文本检查 AI 整理服务，不上传录音或转写内容。")
      .addButton((button) => button
        .setButtonText("测试连接")
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("测试中…");
          try {
            const result = await testLlmConnection(this.plugin);
            new obsidian.Notice(`AI 整理服务正常：${result.model || "未命名模型"}`, 6000);
          } catch (error) {
            new obsidian.Notice(`连接失败：${(error && error.message) || error}`, 8000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("测试连接");
          }
        }))
      .addButton((button) => button
        .setButtonText("完整设置")
        .onClick(() => {
          this.activeTab = "api";
          this.renderSettings();
        }));
  }

  renderAI(c) {
    if (!this.plugin.settings.industryProfile) this.plugin.settings.industryProfile = {};

    new obsidian.Setting(c)
      .setName("纪要生成")
      .setDesc("设置纪要的结构、详略和重新整理偏好。参会信息与待办归属在每次录音前单独补充。")
      .setHeading();
    const structHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    structHint.setText("默认只调整整理结果，不改动原始转写。重新整理偏好仅作用于右键菜单中的派生版本。");

    new obsidian.Setting(c).setName("结构化程度")
      .setDesc("宽松：散文为主。均衡：散文加 1–2 级列表（推荐）。严谨：最多 3 级列表，强调论点与证据。")
      .addDropdown(d => d
        .addOption("loose", "宽松（散文为主）")
        .addOption("balanced", "均衡（推荐）")
        .addOption("strict", "严谨（多层嵌套）")
        .setValue(this.plugin.settings.briefingStructureLevel || "balanced")
        .onChange(async v => {
          this.plugin.settings.briefingStructureLevel = v;
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("重新整理偏好提示词")
      .setDesc("只影响右键菜单「重新整理为」里的偏好项。偏好会调整详略、结构、语气和是否允许 AI 适度补充观点。这里填写的是追加规则，不会覆盖内置提示词。");
    const repolishPromptTa = c.createEl("textarea", { cls: "lexvoice-textarea" });
    repolishPromptTa.value = this.plugin.settings.repolishPreferencePromptAddendum || "";
    repolishPromptTa.placeholder = "例如：适度拓展时，如果原文出现概念、疑问或明显分歧，请用 AI 补充 callout 给出简短视角；关键概念用 ==高亮==，核心判断可用 <u>下划线</u>。不要编造事实、数据或责任人。";
    repolishPromptTa.rows = 4;
    repolishPromptTa.addEventListener("change", async () => {
      this.plugin.settings.repolishPreferencePromptAddendum = repolishPromptTa.value.trim();
      await this.plugin.saveSettings();
    });
    const repolishPresetHint = c.createEl("details", { cls: "lexvoice-setting-details" });
    repolishPresetHint.createEl("summary", { text: "查看内置偏好对应的提示词方向" });
    const presetText = [
      "风格偏好：",
      "- 更详细：扩展上下文、讨论过程、例子、反对意见、风险和待办依据。",
      "- 更精炼：压缩重复口语和低信息量细节，保留结论、证据、待办和风险。",
      "- 更结构化：强化标题层级，按「结论 → 依据 → 影响/待办」组织。",
      "- 更自然：减少模板感，用连贯段落承接讨论。",
      "- MD 强化：适度使用 ==高亮==、<u>下划线</u> 和少量 AI 补充 callout。",
      "",
      "处理方式：",
      "- 忠于原文：不主动外推，只整理录音中明确出现的信息。",
      "- 适度拓展：可用 AI 补充 callout 处理疑问、概念背景、激烈分歧，但必须标明是 AI 补充，且不能编造事实。",
    ].join("\n");
    repolishPresetHint.createEl("pre", { text: presetText });

    new obsidian.Setting(c)
      .setName("语言与翻译")
      .setDesc("设置 AI 整理后的纪要语言。原始转写始终保留原文。")
      .setHeading();
    const langHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    langHint.setText("适用于多语种会议，可统一输出语言或保留关键原文括注。");

    new obsidian.Setting(c).setName("语言策略")
      .setDesc("默认跟随原文。开启后由大模型在整理纪要时统一语言。")
      .addDropdown(d => d
        .addOption("off", "跟随原文（不翻译）")
        .addOption("translate", "统一为目标语言")
        .addOption("bilingual", "目标语言为主，关键原文括注")
        .setValue(this.plugin.settings.briefingTranslationMode || "off")
        .onChange(async v => { this.plugin.settings.briefingTranslationMode = v; await this.plugin.saveSettings(); this.renderSettings(); }));

    if ((this.plugin.settings.briefingTranslationMode || "off") !== "off") {
      new obsidian.Setting(c).setName("目标语言")
        .addDropdown(d => d
          .addOption("zh-CN", "中文")
          .addOption("en", "English")
          .addOption("ja", "日本語")
          .addOption("ko", "한국어")
          .addOption("custom", "自定义")
          .setValue(this.plugin.settings.briefingTargetLanguage || "zh-CN")
          .onChange(async v => { this.plugin.settings.briefingTargetLanguage = v; await this.plugin.saveSettings(); this.renderSettings(); }));

      if ((this.plugin.settings.briefingTargetLanguage || "zh-CN") === "custom") {
        new obsidian.Setting(c).setName("自定义目标语言")
          .setDesc("例如：繁体中文、Deutsch、Français。")
          .addText(t => t.setValue(this.plugin.settings.briefingCustomLanguage || "")
            .onChange(async v => { this.plugin.settings.briefingCustomLanguage = v.trim(); await this.plugin.saveSettings(); }));
      }

      new obsidian.Setting(c).setName("保留专有名词原文")
        .setDesc("人名、公司名、模型名、代码标识、英文缩写等优先保留原写法，避免翻译后失真。")
        .addToggle(t => t.setValue(this.plugin.settings.briefingKeepOriginalTerms !== false)
          .onChange(async v => { this.plugin.settings.briefingKeepOriginalTerms = v; await this.plugin.saveSettings(); }));

      new obsidian.Setting(c).setName("额外语言要求");
      const langTa = c.createEl("textarea", { cls: "lexvoice-textarea" });
      langTa.value = this.plugin.settings.briefingLanguageInstruction || "";
      langTa.placeholder = "例如：日文发言保留原文括注；英文术语保留原文；输出为繁体中文。";
      langTa.rows = 3;
      langTa.addEventListener("change", async () => {
        this.plugin.settings.briefingLanguageInstruction = langTa.value.trim();
        await this.plugin.saveSettings();
      });
    }

    new obsidian.Setting(c)
      .setName("HTML 报告")
      .setDesc("把纪要内容生成适合阅读、分享和打印的独立 HTML 报告。")
      .setHeading();
    const reportHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    reportHint.setText("报告使用同一份纪要内容，不会改变 Obsidian 中的原始纪要。");

    new obsidian.Setting(c).setName("HTML 报告保存文件夹")
      .setDesc("相对当前 Obsidian 库的路径。生成的 HTML 报告会保存为库内文件，便于后续归档、同步或手动移动。修改后仅影响新文件，已有文件不会自动迁移。")
      .addText(t => t
        .setPlaceholder("LexVoice/HTML报告")
        .setValue(this.plugin.settings.htmlReportFolder || DEFAULT_SETTINGS.htmlReportFolder)
        .onChange(async v => {
          this.plugin.settings.htmlReportFolder = obsidian.normalizePath(v.trim() || DEFAULT_SETTINGS.htmlReportFolder);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("生成 HTML 报告后自动打开")
      .setDesc("使用系统默认浏览器打开生成的报告文件。")
      .addToggle(t => t
        .setValue(this.plugin.settings.autoOpenHtmlReportAfterGenerate !== false)
        .onChange(async v => {
          this.plugin.settings.autoOpenHtmlReportAfterGenerate = v;
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("报告页脚公司名（可选）")
      .setDesc("填写后作为「招聘评估 / 研讨」报告页脚的公司名；留空则用纪要里的「公司/」标签。报告不含公司 logo。")
      .addText(t => t
        .setPlaceholder("（留空＝用纪要的 公司/ 标签）")
        .setValue(this.plugin.settings.reportBrandName || "")
        .onChange(async v => {
          this.plugin.settings.reportBrandName = v.trim();
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c)
      .setName("纪要模板")
      .setDesc("选择默认整理模板，并管理长期复用的格式、行业规则和输出偏好。")
      .setHeading();
    const sceneHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    sceneHint.setText("内置模板可直接使用；自定义模板会出现在录音、导入和重新整理的选择列表中。");

    const currentMode = getEffectivePolishMode(this.plugin.settings, this.plugin.settings.polishMode, "meeting");
    const currentMeta = getModeMeta(this.plugin.settings, currentMode);
    new obsidian.Setting(c).setName("默认纪要模板")
      .setDesc((currentMeta.label || currentMeta.prefix) + "。录音、导入音频和重新整理默认使用此模板；具体操作时仍可临时切换。")
      .addDropdown(d => {
        for (const [key, label] of getVisibleModeEntries(this.plugin.settings, false)) d.addOption(key, label);
        d.setValue(currentMode);
        d.onChange(async v => { this.plugin.settings.polishMode = v; await this.plugin.saveSettings(); this.renderSettings(); });
      })
      .addButton(b => b.setButtonText("打开模板库").setCta().onClick(() => {
        const modal = new PromptTemplateModal(this.app, this.plugin);
        const origClose = modal.onClose.bind(modal);
        modal.onClose = () => { origClose(); this.renderSettings(); };
        modal.open();
      }));

  }

  renderKnowledge(c) {
    if (!this.plugin.settings.industryProfile) this.plugin.settings.industryProfile = {};

    const countMarkdownInFolder = (folderPath) => {
      const folder = obsidian.normalizePath(folderPath || "");
      if (!folder) return 0;
      const prefix = folder.endsWith("/") ? folder : folder + "/";
      return this.plugin.app.vault.getMarkdownFiles()
        .filter(f => obsidian.normalizePath(f.path).startsWith(prefix))
        .length;
    };

    const createPathSetting = (parent, name, desc, value, placeholder, onSave, refreshDesc) => {
      const setting = new obsidian.Setting(parent).setName(name).setDesc(desc);
      setting.addText(t => t.setValue(value || "")
        .setPlaceholder(placeholder)
        .onChange(async v => {
          await onSave(obsidian.normalizePath(v || placeholder));
          await this.plugin.saveSettings();
          if (refreshDesc) await refreshDesc(setting);
        }));
      if (refreshDesc) refreshDesc(setting);
      return setting;
    };

    const refreshVocabStatus = async (setting) => {
      const path = this.plugin.settings.vocabularyFile;
      if (!path) { setting.setDesc("当前未指定路径。"); return; }
      const norm = obsidian.normalizePath(path);
      const file = this.plugin.app.vault.getAbstractFileByPath(norm);
      if (!(file instanceof obsidian.TFile)) {
        setting.setDesc("文件不存在，打开或扫描时会自动创建。");
        return;
      }
      try {
        const content = await this.plugin.app.vault.cachedRead(file);
        const groups = parseVocabularyGroups(content);
        setting.setDesc(`当前 ${countVocabularyGroups(groups)} 个 ASR 热词（${summarizeVocabularyGroups(groups)}）。`);
      } catch (e) {
        setting.setDesc(`读取失败：${e.message || e}`);
      }
    };

    let vocabPathSetting = null;
    const openVocabularyFile = async () => {
        const path = this.plugin.settings.vocabularyFile;
        if (!path) { new obsidian.Notice("请先填写文件路径"); return; }
        const norm = obsidian.normalizePath(path);
        let file = this.plugin.app.vault.getAbstractFileByPath(norm);
        if (!(file instanceof obsidian.TFile)) {
          const folderPath = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
          if (folderPath) await this.plugin.ensureFolder(folderPath);
          file = await this.plugin.app.vault.create(norm, formatVocabularyMarkdown([], this.plugin.settings.industryProfile));
          new obsidian.Notice(`已创建：${norm}`);
        }
        if (file instanceof obsidian.TFile) {
          const content = await this.plugin.app.vault.cachedRead(file);
          if (!isStructuredVocabularyMarkdown(content)) {
            await this.plugin.app.vault.modify(file, formatVocabularyMarkdown(parseVocabularyGroups(content), this.plugin.settings.industryProfile));
            new obsidian.Notice("已整理为分区热词表");
          }
          if (vocabPathSetting) await refreshVocabStatus(vocabPathSetting);
          await this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
    };

    const pendingPeopleSuggestions = normalizePeopleSuggestionCache(this.plugin.settings.peopleSuggestionCache).pending;
    const ignoredPeopleSuggestions = normalizePeopleSuggestionIgnores(this.plugin.settings.peopleSuggestionIgnores);
    const peopleCount = countMarkdownInFolder(this.plugin.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
    const learningCount = countMarkdownInFolder(this.plugin.settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder);
    const todoCount = countMarkdownInFolder(this.plugin.settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder);

    new obsidian.Setting(c)
      .setName("资料库")
      .setDesc("从纪要中沉淀人员、学习卡片、待办和转写词表，用于复用和检索；纪要保留原始证据和录音链接。")
      .setHeading();

    const overview = c.createDiv({ cls: "lexvoice-object-overview-grid" });
    const makeObjectCard = (title, count, unit, desc, icon, actionLabel, onClick) => {
      const btn = overview.createEl("button", {
        cls: "lexvoice-object-overview-card",
        attr: { type: "button", "aria-label": actionLabel, title: actionLabel },
      });
      const head = btn.createDiv({ cls: "lexvoice-object-overview-head" });
      head.createDiv({ cls: "lexvoice-object-overview-title", text: title });
      const countEl = head.createDiv({ cls: "lexvoice-object-overview-count" });
      countEl.createSpan({ cls: "lexvoice-object-overview-count-value", text: String(count) });
      countEl.createSpan({ cls: "lexvoice-object-overview-count-unit", text: unit });
      btn.createDiv({ cls: "lexvoice-object-overview-desc", text: desc });
      const iconEl = btn.createDiv({ cls: "lexvoice-object-overview-icon", attr: { "aria-hidden": "true" } });
      obsidian.setIcon(iconEl, icon);
      btn.onclick = onClick;
      return btn;
    };
    makeObjectCard("人员", peopleCount, "位", "汇总会议出现的人，一人一页，关联纪要。", "contact", "打开人员库", () => { void this.plugin.openPeopleBase(); });
    makeObjectCard("学习卡片", learningCount, "张", "汇总观点、机制等可复用知识。", "layers-3", "打开学习卡片墙", () => { void this.plugin.openLearningWall("learning"); });
    makeObjectCard("待办", todoCount, "条", "从纪要确认的行动项，可勾选追踪。", "list-checks", "打开待办墙", () => { void this.plugin.openTodoWall(); });
    const vocabCard = makeObjectCard("转写词表", "…", "个", "汇总术语及易错写法，提升转写准确率。", "notebook-tabs", "打开转写词表", () => { void openVocabularyFile(); });

    void (async () => {
      const countEl = vocabCard.querySelector(".lexvoice-object-overview-count-value");
      try {
        const path = obsidian.normalizePath(this.plugin.settings.vocabularyFile || DEFAULT_SETTINGS.vocabularyFile);
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof obsidian.TFile)) { if (countEl) countEl.setText("0"); return; }
        const groups = parseVocabularyGroups(await this.plugin.app.vault.cachedRead(file));
        if (countEl) countEl.setText(String(countVocabularyGroups(groups)));
      } catch {
        if (countEl) countEl.setText("—");
      }
    })();

    new obsidian.Setting(c).setName("转写完成后自动沉淀")
      .setDesc("默认关闭以节省 token。开启后，转写/整理完成会自动扫描当前纪要并写入学习卡片与待办；人员和词表仍保留确认/维护流程。")
      .addToggle(t => t.setValue(!!this.plugin.settings.sedimentAutoExtract).onChange(async v => { this.plugin.settings.sedimentAutoExtract = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c)
      .setName("补全与去重")
      .setDesc("从历史纪要提取人员和转写词表，并处理重复人员档案。")
      .setHeading();
    new obsidian.Setting(c).setName("从历史纪要补全")
      .setDesc(`人员待确认 ${pendingPeopleSuggestions.length} 条，已忽略 ${ignoredPeopleSuggestions.length} 条。扫描会调用当前 AI 整理服务；涉密内容建议使用本地模型。`)
      .addButton(b => b.setButtonText("提取人员建议").setCta().onClick(async () => this.plugin.suggestPeopleDirectoryFromLibrary()))
      .addButton(b => b.setButtonText("提取转写词表").onClick(async () => this._extractVocabFromLibrary(async () => { if (vocabPathSetting) await refreshVocabStatus(vocabPathSetting); })))
      .addButton(b => b.setButtonText("待确认").setDisabled(!pendingPeopleSuggestions.length).onClick(async () => { await this.plugin.openCachedPeopleDirectorySuggestions(); this.renderSettings(); }))
      .addButton(b => b.setButtonText("已忽略").setDisabled(!ignoredPeopleSuggestions.length).onClick(async () => { await this.plugin.openIgnoredPeopleDirectorySuggestions(); this.renderSettings(); }));

    new obsidian.Setting(c).setName("人员去重")
      .setDesc("按姓名合并重复资料，更新纪要引用，并归档带 -1 / -2 后缀的重复页。")
      .addButton(b => b.setButtonText("合并重复人员").onClick(async () => {
        const ok = await lexvoiceConfirm(this.app, "合并重复人员档案？", "LexVoice 会把同名人员页合并到主档案，改写所有指向重复页的 wiki 链接，并将重复页移到归档目录。建议先确保同步已完成。", "开始合并");
        if (!ok) return;
        try {
          const result = await this.plugin.mergeDuplicatePeopleDirectory();
          new obsidian.Notice(result.merged
            ? `已合并 ${result.merged} 个重复人员页，更新 ${result.updatedLinks} 篇引用`
            : "没有发现需要合并的重复人员页");
          this.renderSettings();
        } catch (e) {
          console.error("[LexVoice] merge duplicate people failed", e);
          new obsidian.Notice(`合并重复人员失败：${(e && e.message) || e}`, 8000);
        }
      }));

    new obsidian.Setting(c)
      .setName("浏览与维护")
      .setDesc("打开资料总览和明细表格，或补齐缺失的 Base 视图。")
      .setHeading();
    new obsidian.Setting(c).setName("资料总览")
      .setDesc("日常浏览入口，可按学习、概念和待办分类查看。")
      .addButton(b => b.setButtonText("打开总览").setCta().onClick(() => { void this.plugin.openObjectWall(); }))
      .addButton(b => b.setButtonText("学习卡片").onClick(() => { void this.plugin.openLearningWall("learning"); }))
      .addButton(b => b.setButtonText("概念").onClick(() => { void this.plugin.openLearningWall("concept"); }))
      .addButton(b => b.setButtonText("待办").onClick(() => { void this.plugin.openTodoWall(); }));

    new obsidian.Setting(c).setName("明细表格")
      .setDesc("用于核对和批量筛选，不作为主展示入口。")
      .addButton(b => b.setButtonText("人员资料").onClick(() => { void this.plugin.openPeopleBase(); }))
      .addButton(b => b.setButtonText("全部纪要").onClick(() => this.plugin.openLexVoiceDetailBase()))
      .addButton(b => b.setButtonText("补齐视图").onClick(async () => {
        try {
          const r = await this.plugin.createLexVoiceBases({ overwrite: false });
          new obsidian.Notice(`表格视图创建完成：新建 ${r.created} 个，跳过 ${r.skipped} 个`);
        } catch (e) {
          console.error(e);
          new obsidian.Notice(`创建失败：${e.message || e}`);
        }
      }));

    new obsidian.Setting(c)
      .setName("存储与隐私")
      .setDesc("设置资料保存位置、扫描记录和人员资料使用范围。一般保持默认即可。")
      .setHeading();
    const advancedBody = c;
    this.createSettingsSubhead(advancedBody, "保存位置", "这些路径都是当前 Obsidian 库内的相对路径，只影响后续新建内容。");

    vocabPathSetting = createPathSetting(advancedBody, "转写词表文件", "用于保存专有名词、术语和易错写法。", this.plugin.settings.vocabularyFile || DEFAULT_SETTINGS.vocabularyFile, DEFAULT_SETTINGS.vocabularyFile,
      async v => { this.plugin.settings.vocabularyFile = v || DEFAULT_SETTINGS.vocabularyFile; },
      refreshVocabStatus);

    createPathSetting(advancedBody, "人员资料文件夹", "一人一篇 Markdown，用于长期维护姓名、常用称呼、角色、组织和相关纪要。", this.plugin.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder, DEFAULT_SETTINGS.peopleDirectoryFolder,
      async v => { this.plugin.settings.peopleDirectoryFolder = v || DEFAULT_SETTINGS.peopleDirectoryFolder; },
      async setting => {
        try {
          const people = await loadPeopleDirectory(this.plugin);
          setting.setDesc(`当前 ${people.length} 位人员。人员资料默认只在本地读取。`);
        } catch (e) {
          setting.setDesc(`读取失败：${e.message || e}`);
        }
      });

    createPathSetting(advancedBody, "学习卡片文件夹", "用于保存概念、机制、案例、QA、追问和观点卡片。", this.plugin.settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder, DEFAULT_SETTINGS.learningCardsFolder,
      async v => { this.plugin.settings.learningCardsFolder = v || DEFAULT_SETTINGS.learningCardsFolder; },
      async setting => {
        const count = countMarkdownInFolder(this.plugin.settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder);
        setting.setDesc(`当前 ${count} 张学习卡片。卡片负责复用，原始依据仍回链到纪要。`);
      });

    createPathSetting(advancedBody, "待办文件夹", "用于保存从纪要中确认后的行动项。", this.plugin.settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder, DEFAULT_SETTINGS.todoCardsFolder,
      async v => { this.plugin.settings.todoCardsFolder = v || DEFAULT_SETTINGS.todoCardsFolder; },
      async setting => {
        const count = countMarkdownInFolder(this.plugin.settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder);
        setting.setDesc(`当前 ${count} 张待办卡片。待办卡片适合跟踪跨会议、跨项目的行动项。`);
      });

    createPathSetting(advancedBody, "视图文件夹", "保存 LexVoice 生成的资料总览和 Base 视图。", this.plugin.settings.lexVoiceBasesFolder || DEFAULT_SETTINGS.lexVoiceBasesFolder, DEFAULT_SETTINGS.lexVoiceBasesFolder,
      async v => { this.plugin.settings.lexVoiceBasesFolder = v || DEFAULT_SETTINGS.lexVoiceBasesFolder; });

    const vocabScanCount = countKnowledgeExtractionHistory(this.plugin.settings, "vocabulary");
    const peopleScanCount = countKnowledgeExtractionHistory(this.plugin.settings, "people");
    this.createSettingsSubhead(advancedBody, "扫描记录", "清空后，历史纪要可以重新进入人员和词表扫描范围。");
    new obsidian.Setting(advancedBody).setName("纪要扫描记录")
      .setDesc(`转写词表已扫描 ${vocabScanCount} 篇；人员建议已扫描 ${peopleScanCount} 篇。清空记录后，修改过或已存在的纪要可重新进入扫描。`)
      .addButton(b => b.setButtonText("清空词表记录").setDisabled(!vocabScanCount).onClick(async () => {
        const ok = await lexvoiceConfirm(this.app, "清空词表扫描记录？", `${vocabScanCount} 篇纪要将重新进入扫描范围；重新扫描会再次调用大模型服务，云端按量产生费用。`, "清空");
        if (!ok) return;
        this.plugin.clearKnowledgeExtractionHistory("vocabulary");
        await this.plugin.saveSettings();
        new obsidian.Notice("已清空转写词表扫描记录");
        this.renderSettings();
      }))
      .addButton(b => b.setButtonText("清空人员记录").setDisabled(!peopleScanCount).onClick(async () => {
        const ok = await lexvoiceConfirm(this.app, "清空人员建议扫描记录？", `${peopleScanCount} 篇纪要将重新进入扫描范围；重新扫描会再次调用大模型服务，云端按量产生费用。`, "清空");
        if (!ok) return;
        this.plugin.clearKnowledgeExtractionHistory("people");
        await this.plugin.saveSettings();
        new obsidian.Notice("已清空人员建议扫描记录");
        this.renderSettings();
      }));

    const transcribeProvider = resolveTranscribeProvider(this.plugin);
    const asrScope = isLocalServiceEndpoint(transcribeProvider.endpoint)
      ? "当前转写服务识别为本地或局域网"
      : (isSharedAddressSpaceEndpoint(transcribeProvider.endpoint)
        ? "当前转写服务识别为 Tailscale 等私有网络"
        : "当前转写服务识别为云端");
    const llmScope = isLocalLlmEndpoint(this.plugin.settings.llmEndpoint)
      ? "当前大模型服务识别为本地或局域网"
      : (isSharedAddressSpaceEndpoint(this.plugin.settings.llmEndpoint)
        ? "当前大模型服务识别为 Tailscale 等私有网络"
        : "当前大模型服务识别为云端");
    const modeLabel = { privacy: "隐私优先", hotwords: "人名热词", localFull: "本地增强" }[normalizePeopleContextMode(this.plugin.settings.peopleContextMode)] || "隐私优先";
    const consentText = hasPeopleHotwordsConsent(this.plugin.settings) ? `已于 ${this.plugin.settings.peopleHotwordsConsentAt} 授权人名热词。` : "尚未授权人名热词。";

    this.createSettingsSubhead(advancedBody, "人员资料隐私", "决定人员姓名和上下文是否会随转写或整理请求发送到当前服务。");
    new obsidian.Setting(advancedBody).setName("人员资料使用策略")
      .setDesc(`${modeLabel}。${asrScope}；${llmScope}。${consentText}`)
      .addDropdown(d => d
        .addOption("privacy", "隐私优先：不发送人员资料")
        .addOption("hotwords", "人名热词：仅姓名/称呼，需授权")
        .addOption("localFull", "本地增强：仅本地服务使用完整人员上下文")
        .setValue(normalizePeopleContextMode(this.plugin.settings.peopleContextMode))
        .onChange(async v => {
          const next = normalizePeopleContextMode(v);
          if (next === "hotwords" && !hasPeopleHotwordsConsent(this.plugin.settings)) {
            const ok = await new Promise(resolve => {
              new PeopleHotwordsConsentModal(this.app, (confirmed) => resolve(confirmed)).open();
            });
            if (!ok) { this.renderSettings(); return; }
            this.plugin.settings.peopleHotwordsConsentAt = new Date().toISOString();
          }
          this.plugin.settings.peopleContextMode = next;
          await this.plugin.saveSettings();
          this.renderSettings();
        }))
      .addButton(b => b.setButtonText("撤销授权")
        .setDisabled(!hasPeopleHotwordsConsent(this.plugin.settings))
        .onClick(async () => {
          this.plugin.settings.peopleHotwordsConsentAt = "";
          if (normalizePeopleContextMode(this.plugin.settings.peopleContextMode) === "hotwords") this.plugin.settings.peopleContextMode = "privacy";
          await this.plugin.saveSettings();
          new obsidian.Notice("已撤销人名热词授权：后续转写与整理请求不再附带人员姓名和称呼，使用策略已自动切回「隐私优先」。");
          this.renderSettings();
        }));
  }

  async _extractVocabFromLibrary(refreshStatus) {
    if (!this.plugin.settings.llmApiKey && !canOmitServiceApiKey(this.plugin.settings.llmEndpoint)) {
      new obsidian.Notice("请先配置大模型服务");
      return;
    }
    try {
      const result = await this.plugin.extractVocabularyFromLibrary();
      await refreshStatus();
      if (result.processed) {
        const rest = result.remaining ? `，还有 ${result.remaining} 篇待下次扫描` : "";
        const failed = result.failed ? `，失败 ${result.failed}` : "";
        new obsidian.Notice(`ASR 热词扫描完成：处理 ${result.processed} 篇，提取 ${result.added} 个候选词${failed}${rest}`);
      }
    } catch (e) {
      console.error(e);
      new obsidian.Notice(`热词提取失败：${e.message || e}`);
    }
  }




  renderUpdates(c) {
    new obsidian.Setting(c).setName("插件更新").setHeading();
    const currentVersion = this.plugin.manifest.version || "0.0.0";
    const update = this.plugin.settings.availableUpdate;
    const rawBases = resolveUpdateRawBases(this.plugin.settings);
    const installedUpdateVersion = this.plugin.settings.installedUpdateVersion || "";
    const status = [
      "当前版本：" + currentVersion,
      installedUpdateVersion && compareVersions(installedUpdateVersion, currentVersion) > 0
        ? "已安装 " + installedUpdateVersion + "，重启或重新启用后生效"
        : "",
      update && update.version ? "可用版本：" + update.version : "暂无可用更新",
      this.plugin.settings.lastUpdateCheckAt ? "上次检查：" + this.plugin.settings.lastUpdateCheckAt : "尚未检查",
      this.plugin.settings.lastUpdateError ? "上次错误：" + this.plugin.settings.lastUpdateError : "",
      rawBases.length > 1 ? "备用下载源：" + (rawBases.length - 1) + " 个" : "",
      "写入目录：" + pluginBasePath(this.plugin),
    ].filter(Boolean).join("；");

    new obsidian.Setting(c).setName("更新状态")
      .setDesc(status);

    new obsidian.Setting(c).setName("更新来源")
      .setDesc("LexVoice 从官方 GitHub 仓库检查并安装更新。更新只替换插件发布文件，不会覆盖 data.json、API Key、保存路径、自定义提示词或队列数据。")
      .addButton(b => b.setButtonText("打开 GitHub").onClick(() => openLexVoiceExternalUrl(LEXVOICE_UPDATE_REPO_URL)))
      .addButton(b => b.setButtonText("查看版本").onClick(() => openLexVoiceExternalUrl(LEXVOICE_UPDATE_REPO_URL + "/releases")));

    new obsidian.Setting(c).setName("启动时自动检查")
      .setDesc("开启后最多每 24 小时检查一次官方仓库。")
      .addToggle(t => t.setValue(this.plugin.settings.autoCheckUpdates !== false)
        .onChange(async v => { this.plugin.settings.autoCheckUpdates = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("安装更新")
      .setDesc("检查新版本并安装。安装前会备份当前插件文件和设置。")
      .addButton(b => b.setButtonText("检查更新").onClick(async () => {
        await this.plugin.checkForUpdates({ silent: false });
        this.renderSettings();
      }))
      .addButton(b => b.setButtonText("安装更新").setCta().onClick(async () => {
        try {
          await this.plugin.installAvailableUpdate();
          this.renderSettings();
        } catch (e) {
          console.error(e);
          new obsidian.Notice("LexVoice 更新失败：" + ((e && e.message) || e), 12000);
        }
      }));

    new obsidian.Setting(c).setName("版权与许可")
      .setDesc("LexVoice © 2026 Lynnx。项目以 MIT License 开源发布。第三方 API、模型和虚拟声卡工具由用户自行配置和承担费用；LexVoice 不运营云端存储，也不会上传录音到 LexVoice 服务器。");
  }

  // 列出库内所有文件夹路径（供路径输入框的原生 datalist 自动补全）。
  getAllVaultFolderPaths() {
    const out = [];
    try {
      const files = this.app.vault.getAllLoadedFiles ? this.app.vault.getAllLoadedFiles() : [];
      for (const f of files) {
        if (f instanceof obsidian.TFolder && f.path && f.path !== "/") out.push(f.path);
      }
    } catch { /* intentionally empty */ }
    return out.sort();
  }

  // 文件夹路径设置项：原生 datalist 补全 + 不存在时在输入框下方渲染警示行与「创建此文件夹」按钮。
  addFolderPathSetting(c, opts) {
    const setting = new obsidian.Setting(c).setName(opts.name);
    if (opts.desc) setting.setDesc(opts.desc);
    const listId = "lexvoice-folder-list-" + (this._folderSettingSeq = (this._folderSettingSeq || 0) + 1);
    let warnEl = null;
    const renderWarn = (path) => {
      if (warnEl) { warnEl.remove(); warnEl = null; }
      const p = obsidian.normalizePath(String(path || "").trim());
      if (!p || p === "." || p === "/") return;
      const existing = this.app.vault.getAbstractFileByPath(p);
      if (existing instanceof obsidian.TFolder) return;
      warnEl = c.createDiv({ cls: "lexvoice-folder-warn" });
      if (existing) {
        warnEl.createSpan({ text: `「${p}」已存在但不是文件夹，请换一个路径。` });
      } else {
        warnEl.createSpan({ text: `文件夹「${p}」尚不存在。` });
        const btn = warnEl.createEl("button", { text: "创建此文件夹", cls: "mod-cta" });
        btn.onclick = async () => {
          try {
            await this.app.vault.createFolder(p);
            new obsidian.Notice(`已创建文件夹：${p}`);
            renderWarn(p);
          } catch (e) {
            new obsidian.Notice(`创建失败：${(e && e.message) || e}`);
          }
        };
      }
      setting.settingEl.insertAdjacentElement("afterend", warnEl);
    };
    setting.addText((text) => {
      text.setPlaceholder(opts.placeholder || "").setValue(opts.getValue() || "");
      try {
        text.inputEl.setAttribute("list", listId);
        const dl = setting.settingEl.createEl("datalist");
        dl.id = listId;
        for (const fp of this.getAllVaultFolderPaths()) dl.createEl("option", { value: fp });
      } catch { /* intentionally empty */ }
      text.onChange(async (v) => {
        await opts.setValue(String(v || "").trim());
        renderWarn(v);
      });
    });
    renderWarn(opts.getValue());
    return setting;
  }

  renderRecruit(c) {
    if (!isRecruitFeatureUnlocked(this.plugin.settings)) return;  // 防御：未解锁不渲染
    const s = this.plugin.settings;
    new obsidian.Setting(c)
      .setName("招聘项目")
      .setDesc("设置岗位项目、候选人简历和招聘主页的保存位置。面试评估会自动归入对应岗位项目。")
      .setHeading();

    this.addFolderPathSetting(c, {
      name: "JD（招聘项目）库路径",
      desc: "每个招聘岗位是这个文件夹下的一个子文件夹，内含同名 JD 文件与候选人看板 Base。",
      placeholder: "JD",
      getValue: () => s.recruitJdFolderPath,
      setValue: async (v) => { s.recruitJdFolderPath = v || "JD"; await this.plugin.saveSettings(); },
    });

    this.addFolderPathSetting(c, {
      name: "简历库路径",
      desc: "从这个文件夹挑选候选人简历 PDF（或手动粘贴）注入面试评估。",
      placeholder: "简历",
      getValue: () => s.recruitResumeFolderPath,
      setValue: async (v) => { s.recruitResumeFolderPath = v || "简历"; await this.plugin.saveSettings(); },
    });

    this.addFolderPathSetting(c, {
      name: "招聘主页路径（可选）",
      desc: "留空则跟随 JD 库根。招聘主页聚合所有在招项目、本周面试与最近纪要。",
      placeholder: "（留空＝跟随 JD 库根）",
      getValue: () => s.recruitHomepagePath,
      setValue: async (v) => { s.recruitHomepagePath = v; await this.plugin.saveSettings(); },
    });

    new obsidian.Setting(c)
      .setName("简历脱敏后再注入")
      .setDesc("开启后，从 PDF 导入的简历文本里的手机号、身份证号、邮箱会替换成占位符再注入评估；原 PDF 不改动。建议保持开启。")
      .addToggle((t) => t.setValue(s.recruitResumeDesensitize !== false).onChange(async (v) => {
        s.recruitResumeDesensitize = !!v;
        await this.plugin.saveSettings();
      }));
  }

  renderAdvanced(c) {
    // ---- 录音行为 ----
    new obsidian.Setting(c)
      .setName("录音与转写")
      .setDesc("控制录音切片、短录音过滤、长音频并发和临时切片保留策略。")
      .setHeading();

    // 当前转写服务若是流式（Realtime 等），分段相关设置不参与工作——在描述里就地说明，免得用户调了没反应
    const advAsrId = this.plugin.settings.activeTranscribeProvider || "siliconflow";
    const advAsrProfile = this.getTranscribeProviderProfile(advAsrId, (this.plugin.settings.transcribeProviders || {})[advAsrId] || {});
    const streamingNote = advAsrProfile && advAsrProfile.transcribeMode === "streaming" ? "当前转写服务为流式，此项不生效。" : "";

    new obsidian.Setting(c).setName("即时分段转写")
      .setDesc(`录音过程中按设定间隔切段并实时转写。关闭则停止录音后一次性处理。${streamingNote}`)
      .addToggle(t => t.setValue(this.plugin.settings.enableInterimOutput).onChange(async v => { this.plugin.settings.enableInterimOutput = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("过滤 3 秒内录音")
      .setDesc("开启后，少于 3 秒的误触录音会直接丢弃：不保存录音文件、不创建纪要、不进入转写或 AI 整理。")
      .addToggle(t => t.setValue(this.plugin.settings.filterShortRecordings !== false).onChange(async v => { this.plugin.settings.filterShortRecordings = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("分段间隔")
      .setDesc(`每隔多少分钟切一段，单位分钟。有效范围 0.5–30。${streamingNote}`)
      .addText(t => {
        t.setValue(String(this.plugin.settings.segmentIntervalMinutes)).onChange(async v => {
          const n = parseFloat(v);
          if (!isFinite(n)) return; // 打字途中/非法输入不保存，失焦时回显实际值
          const clamped = Math.min(30, Math.max(0.5, n));
          if (clamped !== n) new obsidian.Notice(`分段间隔已按有效范围 0.5–30 调整为 ${clamped} 分钟`);
          this.plugin.settings.segmentIntervalMinutes = clamped;
          await this.plugin.saveSettings();
        });
        // 失焦回显真正保存的值，避免"输入框显示 100、实际存 30"的所见非所存
        t.inputEl.addEventListener("blur", () => { t.setValue(String(this.plugin.settings.segmentIntervalMinutes)); });
      });

    new obsidian.Setting(c).setName("同时转写数")
      .setDesc("导入长音频时同时处理的分段数。出现请求频繁或服务错误时，请改回 1。")
      .addDropdown(d => d
        .addOption("1", "1（最稳）")
        .addOption("2", "2（平衡）")
        .addOption("3", "3（较快）")
        .setValue(String(normalizeAsrConcurrency(this.plugin.settings.asrConcurrency)))
        .onChange(async v => {
          this.plugin.settings.asrConcurrency = normalizeAsrConcurrency(v);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("保留临时分段音频")
      .setDesc("用于排查转写问题，会占用更多存储。关闭时保留完整录音，并自动清理转写成功的临时分段。")
      .addToggle(t => t.setValue(this.plugin.settings.keepSegmentAudioFiles === true).onChange(async v => { this.plugin.settings.keepSegmentAudioFiles = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c)
      .setName("纪要与实时大纲")
      .setDesc("控制整理后的纪要布局、自动命名和录音期间的实时大纲行为。")
      .setHeading();

    new obsidian.Setting(c).setName("纪要整合排版")
      .setDesc("录音完成后笔记重排：顶部 AI 整合内容，底部可折叠原始分段。关闭后纪要按时间顺序保留原始分段，不做顶部整合。")
      .addToggle(t => t.setValue(this.plugin.settings.consolidatedLayout).onChange(async v => { this.plugin.settings.consolidatedLayout = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("自动添加主题到文件名")
      .setDesc("录音、导入音频、重新整理或队列重试完成后，由 AI 提炼一个不超过 15 字的主题追加到笔记文件名。")
      .addToggle(t => t.setValue(this.plugin.settings.autoRenameWithTitle).onChange(async v => { this.plugin.settings.autoRenameWithTitle = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("实时大纲")
      .setDesc("每段转写完成后自动更新大纲。关闭后可在侧边栏手动刷新；分段越多，AI 调用次数越多。")
      .addToggle(t => t.setValue(this.plugin.settings.enableRealtimeOutline).onChange(async v => { this.plugin.settings.enableRealtimeOutline = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("录音时自动打开侧边栏")
      .addToggle(t => t.setValue(this.plugin.settings.autoOpenOutlineOnRecord).onChange(async v => { this.plugin.settings.autoOpenOutlineOnRecord = v; await this.plugin.saveSettings(); }));

    // ---- 设备与诊断 ----
    new obsidian.Setting(c)
      .setName("诊断与日志")
      .setDesc("记录本地诊断信息并生成排查报告。音频设备检测已统一放在「常规 > 音频输入」。")
      .setHeading();

    new obsidian.Setting(c).setName("本地诊断日志")
      .setDesc("用于排查转写、AI 整理、队列和实时大纲错误。日志只保存在本地 Obsidian 库，不会自动上传；不会写入音频、转写正文、提示词或 API Key。")
      .addToggle(t => t.setValue(this.plugin.settings.diagnosticsLogEnabled !== false).onChange(async v => {
        this.plugin.settings.diagnosticsLogEnabled = v;
        await this.plugin.saveSettings();
      }))
      .addButton(b => b.setButtonText("复制诊断报告").onClick(() => this.plugin.copyDiagnosticReport()));

    new obsidian.Setting(c).setName("诊断日志文件夹")
      .setDesc("Obsidian 库内的相对路径。一般保持默认即可；诊断报告只有在主动复制后才会提供给开发者排查。修改后仅影响新日志文件。")
      .addText(t => t
        .setPlaceholder(DEFAULT_SETTINGS.diagnosticsLogFolder)
        .setValue(this.plugin.settings.diagnosticsLogFolder || DEFAULT_SETTINGS.diagnosticsLogFolder)
        .onChange(async v => {
          this.plugin.settings.diagnosticsLogFolder = obsidian.normalizePath(v.trim() || DEFAULT_SETTINGS.diagnosticsLogFolder);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("清空诊断日志")
      .setDesc("删除诊断日志文件夹中的全部 .jsonl 日志文件，释放空间。不影响纪要与录音。")
      .addButton(b => b.setButtonText("清空").onClick(async () => {
        const ok = await lexvoiceConfirm(this.app, "清空诊断日志？", "将删除诊断日志文件夹中的全部 .jsonl 日志文件；删除后无法再用于追溯历史问题（文件进入系统废纸篓，可恢复）。", "清空");
        if (!ok) return;
        const folder = this.app.vault.getAbstractFileByPath(this.plugin.getDiagnosticsFolder());
        let n = 0;
        if (folder instanceof obsidian.TFolder) {
          const targets = folder.children.filter(f => f instanceof obsidian.TFile && f.extension === "jsonl");
          for (const f of targets) {
            try { await trashLexVoiceFile(this.app, f); n++; } catch (e) { console.error("[LexVoice] clear diagnostics log failed", e); }
          }
        }
        new obsidian.Notice(n ? `已清空诊断日志：${n} 个文件（可从系统废纸篓恢复）` : "诊断日志文件夹为空");
      }));

    // ---- 外部音频联动 ----
    new obsidian.Setting(c)
      .setName("自动导入音频")
      .setDesc("监控一个收件箱文件夹，自动处理从云盘或其他设备同步进来的音频。")
      .setHeading();

    let inboxFolderInput: obsidian.TextComponent | null = null;
    new obsidian.Setting(c).setName("监听文件夹")
      .setDesc("可填写库内相对路径，或选择坚果云等同步到电脑的文件夹。新音频同步完成后会自动生成综合纪要，源文件保持原位。")
      .addText(t => {
        inboxFolderInput = t;
        t.setValue(this.plugin.settings.inboxFolder || "")
          .setPlaceholder("LexVoice/录音/inbox 或电脑文件夹")
          .onChange(async v => {
            this.plugin.settings.inboxFolder = v.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshExternalInboxWatcher();
          });
      })
      .addButton(b => b.setButtonText("选择").onClick(async () => {
        const folder = await this.plugin.chooseExternalInboxFolder();
        if (!folder) return;
        this.plugin.settings.inboxFolder = folder;
        inboxFolderInput?.setValue(folder);
        await this.plugin.saveSettings();
        this.plugin.refreshExternalInboxWatcher();
      }));

    new obsidian.Setting(c).setName("自动处理新文件")
      .setDesc("关闭后可从命令面板手动扫描监听文件夹。")
      .addToggle(t => t.setValue(this.plugin.settings.inboxAutoImport).onChange(async v => {
        this.plugin.settings.inboxAutoImport = v;
        await this.plugin.saveSettings();
        this.plugin.refreshExternalInboxWatcher();
      }));

    new obsidian.Setting(c).setName("归档子文件夹")
      .setDesc("仅用于库内监听文件夹。处理完成后移到此子文件夹；电脑同步文件夹中的源音频不会移动或删除。")
      .addText(t => t.setValue(this.plugin.settings.inboxArchiveSubfolder || "")
        .setPlaceholder("processed")
        .onChange(async v => { this.plugin.settings.inboxArchiveSubfolder = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("开始处理前等待（毫秒）")
      .setDesc("新文件出现后先等待一段时间再处理，避免 iCloud、坚果云等尚未传完就开始转写。建议 3000–10000（即 3–10 秒）。")
      .addText(t => {
        t.setValue(String(this.plugin.settings.inboxStabilizeDelayMs ?? 3000)).onChange(async v => {
          const n = parseInt(v, 10);
          if (!isFinite(n)) return;
          const clamped = Math.min(60000, Math.max(0, n));
          if (clamped !== n) new obsidian.Notice(`等待时间已按有效范围 0–60000 毫秒调整为 ${clamped}`);
          this.plugin.settings.inboxStabilizeDelayMs = clamped;
          await this.plugin.saveSettings();
        });
        t.inputEl.addEventListener("blur", () => { t.setValue(String(this.plugin.settings.inboxStabilizeDelayMs ?? 3000)); });
      });

    new obsidian.Setting(c).setName("立即扫描监听文件夹")
      .setDesc("处理所有未归档的音频文件。用于补漏或初次配置后批量处理。")
      .addButton(b => b.setButtonText("扫描").onClick(() => this.plugin.scanInboxFolder()));

    new obsidian.Setting(c).setName("清理空白短录音")
      .setDesc("扫描转写纪要文件夹，将时长不超过 10 秒且没有有效转写文本的 LexVoice 条目移入系统废纸篓，并同步处理其引用的录音文件。误删可从系统废纸篓恢复。")
      .addButton(b => b.setButtonText("扫描并清理").onClick(() => this.plugin.cleanupEmptyShortRecordings()));

    // ---- 失败重试 ----
    new obsidian.Setting(c)
      .setName("任务重试")
      .setDesc("设置自动重试上限，并查看仍在等待或失败的后台任务。")
      .setHeading();

    new obsidian.Setting(c).setName("最大重试次数")
      .setDesc("转写与 AI 整理任务失败后的自动重试上限，超过后需在队列或纪要中手动重试。有效范围 1–10。")
      .addText(t => {
        t.setValue(String(this.plugin.settings.maxRetries || 3)).onChange(async v => {
          const n = parseInt(v, 10);
          if (!isFinite(n)) return;
          // 此前接受 0 但所有使用点都按 || 3 兜底，"填 0 实际跑 3"是谎言，收紧为 1–10
          const clamped = Math.min(10, Math.max(1, n));
          if (clamped !== n) new obsidian.Notice(`最大重试次数已按有效范围 1–10 调整为 ${clamped}`);
          this.plugin.settings.maxRetries = clamped;
          await this.plugin.saveSettings();
        });
        t.inputEl.addEventListener("blur", () => { t.setValue(String(this.plugin.settings.maxRetries || 3)); });
      });

    new obsidian.Setting(c).setName("任务队列")
      .setDesc(`当前 ${this.plugin.queue.tasks.length} 个任务。`)
      .addButton(b => b.setButtonText("打开队列").onClick(() => new QueueModal(this.app, this.plugin).open()))
      .addButton(b => b.setButtonText("重试全部").onClick(() => this.plugin.retryQueue()));
  }

  async runAudioDiagnostic() {
    const result = this.diagResultEl;
    if (!result) return;
    result.empty();
    result.createDiv({ text: "检测中…", cls: "lexvoice-diag-loading" });

    let info;
    try {
      info = await enumerateAudioDevices();
    } catch (e) {
      result.empty();
      result.createDiv({ text: `检测失败：${e.message || e}`, cls: "lexvoice-diag-error" });
      return;
    }
    result.empty();
    const card = result.createDiv({ cls: "lexvoice-diag-card" });

    // 去名字化：如实列出所有音频输入设备，不按名字猜哪只是真麦/虚拟。
    const allInputs = (info.all || []).filter((d) => d && d.kind === "audioinput");

    // 麦克风行：有任何输入设备即可录（没选则用系统默认）。
    const micRow = card.createDiv({ cls: "lexvoice-diag-row" });
    const micOk = allInputs.length > 0;
    micRow.createSpan({ cls: `lexvoice-diag-dot ${micOk ? "is-ok" : "is-fail"}` });
    const micText = micRow.createDiv({ cls: "lexvoice-diag-text" });
    micText.createDiv({ text: micOk ? `检测到 ${allInputs.length} 个音频输入设备` : "未检测到任何音频输入设备", cls: "lexvoice-diag-label" });
    if (micOk) {
      micText.createDiv({ text: allInputs.map(d => `• ${d.label || "未授权读取"}`).slice(0, 5).join("\n"), cls: "lexvoice-diag-sub" });
    }

    // 电脑音频行：必须由用户显式选定，不猜第一个虚拟声卡。
    const vcRow = card.createDiv({ cls: "lexvoice-diag-row" });
    const vcSelId = this.plugin.settings.selectedVirtualDevice || "";
    const vcDev = vcSelId ? allInputs.find(d => d.deviceId === vcSelId) : null;
    const vcOk = !!vcDev;
    vcRow.createSpan({ cls: `lexvoice-diag-dot ${vcOk ? "is-ok" : "is-warn"}` });
    const vcText = vcRow.createDiv({ cls: "lexvoice-diag-text" });
    if (vcOk) {
      vcText.createDiv({ text: "电脑音频输入（已选定）", cls: "lexvoice-diag-label" });
      vcText.createDiv({ text: `• ${vcDev.label || "未授权读取"}`, cls: "lexvoice-diag-sub" });
    } else if (vcSelId) {
      vcText.createDiv({ text: "所选电脑音频输入未检测到", cls: "lexvoice-diag-label" });
      vcText.createDiv({ text: "之前选定的设备可能已断开，请在下方重新选择。", cls: "lexvoice-diag-sub" });
    } else {
      vcText.createDiv({ text: "未选择电脑音频输入", cls: "lexvoice-diag-label" });
      vcText.createDiv({ text: "录制电脑声音需要虚拟声卡。请在「设置电脑音频」中完成配置。", cls: "lexvoice-diag-sub" });
    }

    if (info.permissionRequired) {
      const permRow = card.createDiv({ cls: "lexvoice-diag-row" });
      permRow.createSpan({ cls: "lexvoice-diag-dot is-warn" });
      const permText = permRow.createDiv({ cls: "lexvoice-diag-text" });
      permText.createDiv({ text: "麦克风权限未授予", cls: "lexvoice-diag-label" });
      permText.createDiv({ text: "未授权时设备名为空，无法准确识别电脑音频输入。", cls: "lexvoice-diag-sub" });
    }

    const summary = card.createDiv({ cls: "lexvoice-diag-summary" });
    const mode = normalizeAudioInputMode(this.plugin.settings.captureMode || "mic");
    let modeStatus, modeOk;
    if (mode === "mic") { modeOk = micOk; modeStatus = micOk ? "当前音频输入可用" : "当前音频输入不可用（无任何输入设备）"; }
    else if (mode === "virtualCable") { modeOk = vcOk; modeStatus = vcOk ? "当前音频输入可用" : "当前音频输入不可用（未选择电脑音频输入）"; }
    else if (mode === "mix-virtual") { modeOk = micOk && vcOk; modeStatus = modeOk ? "当前音频输入可用" : `当前音频输入不可用（${!micOk ? "无任何输入设备" : "未选择电脑音频输入"}）`; }

    summary.createDiv({ text: `当前音频输入：${audioInputModeLabel(mode)}`, cls: "lexvoice-diag-summary-mode" });
    summary.createDiv({ text: modeStatus, cls: `lexvoice-diag-summary-status ${modeOk ? "is-ok" : "is-warn"}` });

    const editHint = card.createDiv({ cls: "lexvoice-diag-edit-hint" });
    editHint.setText("设备检测只做诊断；如需更换麦克风或电脑音频输入，请在上方「音频输入」区域调整。");
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

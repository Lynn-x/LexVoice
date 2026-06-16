/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck — PluginSettingTab class（this.plugin.* / 大量 setting builder 无 TS 字段声明）；已用 tsc 确认无漏引用(TS2304=0)，余者皆类字段类型噪音，故与 main.ts 同档跳过。
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_DAILY_MEETING_OVERVIEW_HEADING, DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE } from '../shared/defaults';
import { genId } from '../shared/util-common';
import { isLocalLlmEndpoint } from '../shared/util-llm-endpoint';
import { isLocalServiceEndpoint } from '../shared/util-note';
import { compareVersions, isLexVoiceMobileRuntime } from '../shared/util-platform';
import { getEffectivePolishMode, getModeMeta, getVisibleModeEntries } from '../shared/mode-meta';
import { LLM_SERVICE_PRESETS, ONE_CARD_PROVIDERS, applyLlmProfileToWorkingConfig, findLlmProfile, getActiveLlmServicePresetId, getLlmServicePreset, inferLlmServicePresetId, normalizeLlmProfiles, syncWorkingConfigToLlmProfile } from '../llm/config';
import { fetchLlmModelList, testLlmConnection } from '../llm/core';
import { schemeIsOneKey, snapshotActiveAsr, syncWorkingAsrToActiveScheme } from '../llm/asr-scheme';
import { normalizeAsrConcurrency, resolveTranscribeProvider, transcribeAudio } from '../asr/transcribe';
import { countVocabularyGroups, formatVocabularyMarkdown, isStructuredVocabularyMarkdown, parseVocabularyGroups, summarizeVocabularyGroups } from '../vocabulary';
import { hasPeopleHotwordsConsent, loadPeopleDirectory, normalizePeopleContextMode, normalizePeopleSuggestionCache, normalizePeopleSuggestionIgnores } from '../people';
import { isRecruitFeatureUnlocked } from '../recruit';
import { normalizePptSlideRange } from '../report/render';
import { LEXVOICE_UPDATE_REPO_URL, audioInputModeLabel, countKnowledgeExtractionHistory, enumerateAudioDevices, isVirtualCableLabel, lexvoiceConfirm, lexvoicePromptText, normalizeAudioInputMode, openLexVoiceExternalUrl, openLexVoicePickListModal, pluginBasePath, resolveUpdateRawBases, trashLexVoiceFile } from './helpers';
import { PeopleHotwordsConsentModal, PromptTemplateModal, QueueModal, VirtualCableSetupModal } from './modals';

export const LV_SETTINGS_TABS = [
  { id: "home",     label: "LexVoice" },
  { id: "general",  label: "常规" },
  { id: "api",      label: "API" },
  { id: "ai",       label: "AI 整理" },
  { id: "knowledge", label: "信息对象" },
  { id: "advanced", label: "进阶" },
  { id: "updates",  label: "更新" },
];

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
    const { containerEl } = this;
    containerEl.empty();

    const tabs = this.getVisibleSettingsTabs();
    const tabBar = containerEl.createDiv({ cls: "lexvoice-settings-tabs" });
    for (const tab of tabs) {
      const btn = tabBar.createEl("button", { text: tab.label });
      if (this.activeTab === tab.id) btn.addClass("is-active");
      btn.onclick = () => this.handleSettingsTabClick(tab.id);
    }

    const content = containerEl.createDiv({ cls: "lexvoice-settings-content" });
    switch (this.activeTab) {
      case "home":     this.renderHome(content); break;
      case "general":  this.renderGeneral(content); break;
      case "api":      this.renderApi(content); break;
      case "ai":       this.renderAI(content); break;
      case "knowledge": this.renderKnowledge(content); break;
      case "recruit":  this.renderRecruit(content); break;
      case "advanced": this.renderAdvanced(content); break;
      case "updates":  this.renderUpdates(content); break;
    }
  }

  handleSettingsTabClick(tabId) {
    if (tabId !== "advanced") {
      this._advancedTapCount = 0;
      this._advancedTapAt = 0;
    }
    this.activeTab = tabId;
    this.display();
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
    this.display();
    this.showHrUnlockFireworks();
    new obsidian.Notice("尊贵的内部用户，您已成功解锁 LexVoice 4 HR", 6000);
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
    card.createDiv({ cls: "lexvoice-hr-unlock-kicker", text: "尊贵的内部用户" });
    card.createDiv({ cls: "lexvoice-hr-unlock-title", text: "您已成功解锁 LexVoice 4 HR" });
    card.createDiv({ cls: "lexvoice-hr-unlock-copy", text: "招聘评估模式已加入下拉，可在提示词管理中调整。" });

    window.setTimeout(() => burst.remove(), 2000);
  }

  renderDataRiskNotice(parent, variant = "") {
    const cls = ["lexvoice-risk-notice", variant].filter(Boolean).join(" ");
    const box = parent.createDiv({ cls });
    box.createDiv({ cls: "lexvoice-risk-title", text: "数据与云端 API 风险提示" });
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
    // 转写：填 Key + 恢复该 provider 的推荐地址/模型/协议 + 设为当前转写服务
    const dft = DEFAULT_SETTINGS.transcribeProviders[cfg.asrProvider] || {};
    const cur = providers[cfg.asrProvider] || {};
    providers[cfg.asrProvider] = Object.assign({}, cur, {
      name: cur.name || dft.name,
      endpoint: dft.endpoint || cur.endpoint || "",
      model: dft.model || cur.model || "",
      language: cur.language || dft.language || "auto",
      protocol: dft.protocol || cur.protocol,
      apiKey: k,
    });
    s.activeTranscribeProvider = cfg.asrProvider;
    // AI 整理（LLM）：套预设 + 填 Key + 模型
    s.llmServicePreset = cfg.llmPreset;
    s.llmEndpoint = cfg.llmEndpoint;
    if (cfg.llmModel) s.llmModel = cfg.llmModel;
    s.llmApiKey = k;
    // 自动存成一套完整 API 方案（带转写快照），出现在 API 页顶部可一键重选；同名方案就地覆盖、不重复堆叠
    const schemeName = `${cfg.label}（一个 Key）`;
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
    const jump = (tab) => { this.activeTab = tab; this.display(); };
    const hasSpeechProvider = (() => {
      const id = this.plugin.settings.activeTranscribeProvider || "siliconflow";
      const p = (this.plugin.settings.transcribeProviders || {})[id] || {};
      // 从 provider profile 取 requiresKey，避免硬编码与 profile 不一致
      const profile = this.getTranscribeProviderProfile(id, p);
      const needsKey = !!profile.requiresKey;
      return !!(p.endpoint && p.model && (!needsKey || p.apiKey));
    })();
    const hasLlm = !!(this.plugin.settings.llmEndpoint && this.plugin.settings.llmModel && (this.plugin.settings.llmApiKey || isLocalLlmEndpoint(this.plugin.settings.llmEndpoint)));
    const dailyOn = this.plugin.settings.writeDailyMeetingOverview !== false;

    const head = page.createDiv({ cls: "lexvoice-home-head" });
    const titleLine = head.createDiv({ cls: "lexvoice-home-title-line" });
    titleLine.createEl("h2", { text: "LexVoice" });
    titleLine.createDiv({ cls: "lexvoice-home-version", text: this.plugin.manifest.version || "" });
    head.createDiv({
      cls: "lexvoice-home-summary",
      text: "在 Obsidian 桌面端完成录音、转写与 AI 整理：支持后台录制、流式或切片转写，自动按业务模式整理为可检索的 Markdown 纪要。配置一个语音转写服务即可使用；如需自动生成结构化纪要、待办与翻译，再配置一个大模型服务。",
    });
    const primary = head.createDiv({ cls: "lexvoice-home-actions" });
    const apiBtn = primary.createEl("button", { text: "配置 API" });
    apiBtn.addClass("mod-cta");
    apiBtn.onclick = () => jump("api");
    const quickBtn = primary.createEl("button", { text: "使用入门配置" });
    quickBtn.onclick = async () => {
      const ok = await lexvoiceConfirm(this.app, "切换为入门配置？",
        "将把转写服务切换为硅基流动（其服务地址、模型恢复推荐值），大模型服务地址切换为硅基流动。已填写的访问密钥保留，其他服务的配置不会删除。",
        "切换");
      if (!ok) return;
      await this.applyBeginnerDefaults();
      new obsidian.Notice("已切换为入门连接配置：硅基流动转写 + 硅基流动大模型服务。请填写访问密钥和模型标识后测试连接。", 7000);
      jump("api");
    };
    const aiBtn = primary.createEl("button", { text: hasLlm ? "AI 整理设置" : "配置大模型" });
    aiBtn.onclick = () => jump(hasLlm ? "ai" : "api");
    const panelBtn = primary.createEl("button", { text: "打开实时纪要面板" });
    panelBtn.onclick = () => this.plugin.openOutlineView();

    // 快速配置：MiMo / 硅基流动等"一个 Key 同时跑转写 + AI 整理"的供应商，填一次即可两边都配好。
    const oneCard = page.createDiv({ cls: "lexvoice-home-block lexvoice-home-onecard" });
    oneCard.createEl("h3", { text: "快速配置" });
    oneCard.createDiv({ cls: "lexvoice-home-prep-desc", text: "这些服务用同一把 Key 既能语音转写也能 AI 整理。选供应商、填一次 Key、点应用，自动把「转写服务」和「大模型服务」都配好，并在「API」页存成一套可切换的方案，无需分别填两次。" });
    let oneCardProviderId = "mimo";
    let oneCardKey = "";
    const oneCardRow = new obsidian.Setting(oneCard).setName("供应商 + 密钥");
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
      const ok = await lexvoiceConfirm(this.app, `用一把 ${cfg.label} Key 配好转写 + AI 整理？`,
        `将把「转写服务」和「大模型服务」都切换为 ${cfg.label}，并填入这把 Key，存成一套「${cfg.label}（一个 Key）」方案。会覆盖当前转写服务和大模型服务的地址/模型/密钥（其它已保存的方案不受影响）。`,
        "应用");
      if (!ok) return;
      const done = await this.applyOneCardProvider(oneCardProviderId, oneCardKey);
      if (done) {
        new obsidian.Notice(cfg.applyDesc + " 已存为方案，可在「API」页顶部切换。点「检测」可测连通性。", 8000);
        this.display();
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
    prep.createEl("h3", { text: "前置准备" });
    const prepGrid = prep.createDiv({ cls: "lexvoice-home-prep-grid" });
    const prepItems = [
      {
        name: "语音转写服务",
        need: "必填",
        price: "云端付费 / 本地免费",
        desc: "将录音转换为原始文字。可选择云端转写服务或本地 Whisper、SenseVoice 等服务；对数据本地化有要求时优先考虑本地部署。",
        action: "配置转写服务",
        target: "api",
        status: hasSpeechProvider ? "已配置" : "未配置",
        statusClass: hasSpeechProvider ? "is-ready" : "is-required",
      },
      {
        name: "大模型服务（LLM）",
        need: "推荐",
        price: "按量付费",
        desc: "将原始转写整理为会议纪要、待办或访谈记录。未配置时仅保留转写文本，不会进行结构化整理。",
        action: "配置大模型服务",
        target: "api",
        status: hasLlm ? "已配置" : "未配置",
        statusClass: hasLlm ? "is-ready" : "is-required",
      },
      {
        name: "电脑音频捕获",
        need: "会议/视频适用",
        price: "可免费",
        desc: "仅录本人声音时无需配置。要录会议对方声音、B 站客户端、浏览器视频或课程音频，需安装虚拟声卡把电脑播放的声音引入录音，并保证耳机/扬声器仍正常出声。详见「电脑音频指引」。",
        action: "查看设备指引",
        target: "advanced",
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

    const route = page.createDiv({ cls: "lexvoice-home-block" });
    route.createEl("h3", { text: "推荐配置路径" });
    const routeRows = [
      ["必填", "配置语音转写", "确保单次录音可顺利完成转写。保存后在 API 页执行连通性测试；云端服务需提供访问密钥，本地服务需提前启动。", hasSpeechProvider ? "已配置" : "去配置", "api"],
      ["推荐", "配置大模型服务", "用于生成会议纪要、标题、待办、翻译及优化自定义提示词。未配置时 LexVoice 仅保留原始转写。", hasLlm ? "已配置" : "去配置", "api"],
      ["建议", "确认保存路径与音频输入方式", "默认录音保存于 LexVoice/录音，纪要保存于 LexVoice/转写纪要。学习视频或会议音频建议先配置「电脑音频输入 + 真实扬声器/耳机监听」。", "去设置", "general"],
    ];
    const BADGE_CLASS = {
      "必填": "is-required",
      "推荐": "is-recommended",
      "建议": "is-suggested",
    };
    for (const [badge, name, desc, btnText, target] of routeRows) {
      const row = new obsidian.Setting(route)
        .setName(name)
        .setDesc(desc);
      const cls = ["lexvoice-home-row-badge", BADGE_CLASS[badge] || ""].filter(Boolean).join(" ");
      row.nameEl.createSpan({ cls, text: badge });
      row.addButton((btn) => btn.setButtonText(btnText).onClick(() => jump(target)));
    }

    const better = page.createDiv({ cls: "lexvoice-home-block" });
    better.createEl("h3", { text: "进阶能力" });
    const betterRows = [
      ["转写提示词", "在 AI 整理中管理内置提示词和自定义提示词；自定义提示词会出现在录音、导入和重新整理的选择列表里。", hasLlm ? "去管理" : "先配大模型", hasLlm ? "ai" : "api"],
      ["多语种会议整理", "在 AI 整理中启用纪要翻译，可由大模型在整理阶段统一输出至目标语言，或保留关键原文形成双语纪要。", "去设置", "ai"],
      ["纪要信息对象", "从纪要中沉淀 ASR 热词、人员资料、学习卡片和待办卡片。纪要负责追溯，对象负责复用和检索。", "打开信息对象", "knowledge"],
      ["自动更新", "从 LexVoice 官方 GitHub 仓库检查新版本并增量更新；本地设置、保存路径与自定义提示词不会被覆盖。", "去更新", "updates"],
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
      hintEl.setText("当前已选设备可能已断开。请重新选择。");
    } else if (info.permissionRequired) {
      hintEl.setText("设备名可能为空：请授予麦克风权限后再选择麦克风。");
    } else if (allInputs.length === 0) {
      hintEl.setText("未检测到任何音频输入设备。请检查系统输入设备和麦克风权限。");
    } else if (selected) {
      hintEl.setText("本人声音会从这只麦克风录入。");
    } else {
      hintEl.setText("未选择时使用系统默认输入。若系统默认是虚拟声卡（如 CABLE Output），录到的将是电脑声音而非人声；要录自己说话，请在此明确选定麦克风。");
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
      hintEl.setText("未检测到任何音频输入。请先按「电脑音频指引」安装虚拟声卡（CABLE Output / BlackHole 等）并把系统输出路由进去。");
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
    const copy = head.createDiv({ cls: "lexvoice-audio-input-copy" });
    copy.createDiv({ cls: "lexvoice-audio-input-title", text: "音频输入" });
    copy.createDiv({
      cls: "lexvoice-audio-input-desc",
      text: "先选录音来源；混合录音时请再指定本人说话用的麦克风，避免误用虚拟声卡导致录不到人声。",
    });

    const actions = head.createDiv({ cls: "lexvoice-audio-input-actions" });
    this.createAudioInputButton(actions, "自动推荐（可再调整）", async () => {
      await this.autoConfigureAudioInput();
      this.display();
    });
    this.createAudioInputButton(actions, "设备检测", async () => {
      await this.runAudioDiagnostic();
    });
    this.createAudioInputButton(actions, "电脑音频指引", () => new VirtualCableSetupModal(this.app, this.plugin).open());

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
      this.display();
    });
    const modeHint = modeField.createDiv({ cls: "lexvoice-audio-input-hint" });
    modeHint.setText(mode === "mic"
      ? "只录本人说话，适合线下会议或独白。"
      : mode === "virtualCable"
        ? "只录电脑声音，适合视频、课程、B 站客户端或浏览器音频。"
        : "同时录本人说话和电脑声音，适合线上会议或边听边讲解。");

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
      this.populateAudioInputMicSelect(micSelect, micHint);
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
      this.populateAudioInputVirtualSelect(vcSelect, vcHint);
    }

    const warning = card.createDiv({ cls: "lexvoice-audio-input-warning" });
    warning.setText("「可能是虚拟/远程」仅是提示，不限制选择；麦克风名称恰好含这类词的，照常选用即可。录音前可用「设备检测」确认音量条会动。");

    this.diagResultEl = card.createDiv({ cls: "lexvoice-diag-result lexvoice-audio-input-diag" });
  }

  renderGeneral(c) {
    this.renderAudioInputSettings(c);

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
      this.display();
    }));
    const dailyTplTa = c.createEl("textarea", { cls: "lexvoice-textarea lexvoice-textarea-mono" });
    dailyTplTa.rows = 8;
    dailyTplTa.value = this.plugin.settings.dailyMeetingOverviewTemplate || DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
    dailyTplTa.placeholder = DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
    dailyTplTa.addEventListener("change", async () => {
      this.plugin.settings.dailyMeetingOverviewTemplate = dailyTplTa.value.trim() || DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE;
      await this.plugin.saveSettings();
    });

    new obsidian.Setting(c).setName("显示悬浮气泡")
      .setDesc("开启后常驻显示，可拖动到任意位置；关闭后隐藏。")
      .addToggle(t => t.setValue(this.plugin.settings.showFloatingBall).onChange(async v => {
        this.plugin.settings.showFloatingBall = v; await this.plugin.saveSettings();
        this.plugin.syncBubbleVisibility();
      }));
  }



  getTranscribeProviderProfile(id, provider) {
    return this.plugin.getTranscribeProviderProfile(id, provider);
  }

  renderTranscribeProviderGuide(c, activeId, provider, profile) {
    const p = provider || {};
    const needsKey = !!profile.requiresKey;
    const ready = !!(p.endpoint && p.model && (!needsKey || p.apiKey));
    const missing = [];
    if (!p.endpoint) missing.push("服务地址");
    if (!p.model) missing.push("模型名称");
    if (needsKey && !p.apiKey) missing.push("访问密钥");

    const panel = c.createDiv({ cls: "lexvoice-provider-panel" });
    const head = panel.createDiv({ cls: "lexvoice-provider-head" });
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
      try { await ctx.close(); } catch {}
    }
  }

  // 依次测「转写 + 大模型」连通性，返回一行汇总文案。供 API 方案检测 / 首页快速配置检测共用。
  async runComboConnectivityTest() {
    let asrPart, llmPart;
    try { const t = await this.runAsrConnectivityTest(); asrPart = `转写 ✓（${(t || "<空>").slice(0, 16)}）`; }
    catch (e) { asrPart = `转写 ✗：${(e && e.message) || e}`; }
    try { const r = await testLlmConnection(this.plugin); llmPart = `大模型 ✓（${r.model || "?"}）`; }
    catch (e) { llmPart = `大模型 ✗：${(e && e.message) || e}`; }
    return `${asrPart}　|　${llmPart}`;
  }

  renderApiSchemeSelector(c) {
    new obsidian.Setting(c).setName("API 方案").setHeading();
    const schemes = Array.isArray(this.plugin.settings.llmProfiles) ? this.plugin.settings.llmProfiles : [];
    const activeId = this.plugin.settings.activeLlmProfile || "";

    // 自定义布局（不用 obsidian.Setting 的左名右控件，避免下拉+3按钮+长说明挤成一团）：
    // 说明整行 → 下拉(占主) + 按钮同一行 → 激活态提示整行淡字。
    const block = c.createDiv({ cls: "lexvoice-scheme-block" });
    block.createDiv({ cls: "lexvoice-scheme-desc", text: "把「转写服务 + AI 整理」整套存成方案，顶部一键切换。带「一个 Key 通用」的是同一把 Key 既转写也整理（如 MiMo / 硅基流动）。" });

    const controls = block.createDiv({ cls: "lexvoice-scheme-controls" });
    const sel = controls.createEl("select", { cls: "dropdown lexvoice-scheme-select" });
    const addOpt = (value, label) => { const o = sel.createEl("option", { text: label }); o.value = value; };
    addOpt("", "（临时配置 · 未保存）");
    for (const p of schemes) addOpt(p.id, schemeIsOneKey(p) ? `${p.name} · 一个 Key 通用` : p.name);
    sel.value = activeId;
    sel.addEventListener("change", async () => {
      const id = sel.value;
      if (!id) { this.plugin.settings.activeLlmProfile = ""; await this.plugin.saveSettings(); this.display(); return; }
      applyLlmProfileToWorkingConfig(this.plugin.settings, id);
      await this.plugin.saveSettings();
      const p = findLlmProfile(this.plugin.settings, id);
      new obsidian.Notice(`已切换到方案「${p ? p.name : id}」${p && p.asr ? "（转写 + AI 整理已一并切换）" : "（仅 AI 整理）"}`, 5000);
      this.display();
    });

    const btns = controls.createDiv({ cls: "lexvoice-scheme-btns" });
    const saveBtn = btns.createEl("button", { cls: "mod-cta", text: "保存当前为方案" });
    saveBtn.onclick = async () => {
      const name = await lexvoicePromptText(this.app, "为当前整套配置取个名字", "如 MiMo / DeepSeek+硅基 / 本地模型");
      if (name === null) return;
      const trimmed = String(name || "").trim();
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
      new obsidian.Notice(`已保存方案「${trimmed}」（含转写 + AI 整理）`, 5000);
      this.display();
    };
    if (activeId) {
      const delBtn = btns.createEl("button", { cls: "mod-warning", text: "删除" });
      delBtn.onclick = async () => {
        const p = findLlmProfile(this.plugin.settings, activeId);
        this.plugin.settings.llmProfiles = normalizeLlmProfiles(this.plugin.settings.llmProfiles).filter(x => x.id !== activeId);
        this.plugin.settings.activeLlmProfile = "";
        await this.plugin.saveSettings();
        new obsidian.Notice(`已删除方案「${p ? p.name : activeId}」（当前转写 / 大模型配置仍保留在下方，可重新保存）`, 6000);
        this.display();
      };
    }
    const testBtn = btns.createEl("button", { text: "检测" });
    testBtn.onclick = async () => {
      testBtn.disabled = true; testBtn.setText("检测中…");
      new obsidian.Notice("正在检测转写 + 大模型连通性…", 4000);
      try { new obsidian.Notice(await this.runComboConnectivityTest(), 9000); }
      finally { testBtn.disabled = false; testBtn.setText("检测"); }
    };

    if (activeId) {
      const p = findLlmProfile(this.plugin.settings, activeId);
      const kind = p && p.asr ? "完整方案（转写 + AI 整理）" : "仅 AI 整理（旧配置；想纳入转写，重新点「保存当前为方案」即可）";
      const status = block.createDiv({ cls: "lexvoice-scheme-status" });
      status.createSpan({ cls: "lexvoice-scheme-status-name", text: `当前：${p ? p.name : activeId}` });
      status.createSpan({ cls: "lexvoice-scheme-status-sep", text: " · " });
      status.createSpan({ text: kind });
      status.createSpan({ cls: "lexvoice-scheme-status-sep", text: " · " });
      status.createSpan({ cls: "lexvoice-scheme-status-hint", text: "下方任何修改会自动更新到这套方案" });
    }
  }

  renderApi(c) {
    // ===== 顶部 · API 方案：把「转写 + AI 整理」存成一套，一键切换/检测 =====
    this.renderApiSchemeSelector(c);

    new obsidian.Setting(c).setName("语音转写").setHeading();

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
            this.display();
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

    new obsidian.Setting(c).setName("当前转写服务").setHeading();

    new obsidian.Setting(c).setName(profile.requiresKey ? "访问密钥" : "访问密钥（可选）")
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

    if (activeId !== "custom") {
      new obsidian.Setting(c).setName("推荐连接信息")
        .setDesc("如果误改了服务地址、模型名称或识别语言，可恢复当前服务的推荐值；不会覆盖访问密钥。")
        .addButton(b => b.setButtonText("恢复推荐值").onClick(async () => {
          const ok = await this.restoreTranscribeProviderDefaults(activeId);
          new obsidian.Notice(ok ? "已恢复当前转写服务的推荐连接信息，不会覆盖访问密钥。" : "当前服务没有内置推荐值。", 6000);
          this.display();
        }));
    }

    // MiMo 一把 Key 同时配转写 + AI 整理，请用「设置首页 → 快速配置」（避免在此处误触）。
    if (activeId === "apimimo") {
      const tip = c.createDiv({ cls: "lexvoice-provider-streaming-tip" });
      tip.setText("提示：MiMo 同一把 Key 也能做 AI 整理。在「设置首页 → 快速配置」里选 MiMo、填一次 Key，即可同时配好转写和 AI 整理，并存成可切换的方案。");
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

    new obsidian.Setting(c).setName("AI 整理服务").setHeading();
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
            this.display();
            return;
          }
          if (preset.endpoint) this.plugin.settings.llmEndpoint = preset.endpoint;
          if (id === "siliconflow" && !this.plugin.settings.llmApiKey) {
            const sfKey = ((this.plugin.settings.transcribeProviders || {}).siliconflow || {}).apiKey || "";
            if (sfKey) this.plugin.settings.llmApiKey = sfKey;
          }
          await this.plugin.saveSettings();
          new obsidian.Notice(`已应用服务预设：${preset.label}。请确认访问密钥和模型标识后测试连接。`, 6000);
          this.display();
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
        this.display();
      }));
    } else if (mimoSpeechKey && !this.plugin.settings.llmApiKey && /xiaomimimo\.com/i.test(llmEndpointNow)) {
      // MiMo 同平台一把 Key：转写已填、AI 整理还空 → 一键复用（与硅基流动「复用转写密钥」同款，仅填密钥）
      llmKeyRow.addButton(b => b.setButtonText("复用 MiMo 转写密钥").onClick(async () => {
        this.plugin.settings.llmApiKey = mimoSpeechKey;
        await this.plugin.saveSettings();
        new obsidian.Notice("已复用 MiMo 转写密钥到大模型服务。", 5000);
        this.display();
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
            this.display();
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

  renderAI(c) {
    if (!this.plugin.settings.industryProfile) this.plugin.settings.industryProfile = {};

    new obsidian.Setting(c).setName("AI 转写与整理").setHeading();
    const structHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    structHint.setText("这里管理转写后的纪要整理、语言处理、HTML 报告和提示词。报告与纪要使用同一份内容来源，适合放在一起配置。");

    new obsidian.Setting(c).setName("参会信息与待办归属")
      .setDesc("可在转写前补充参会人、角色和常见称呼，用于辅助纪要整理和待办归属。当前版本不提供声纹识别或逐句说话人分离；涉及交付、考核、人事等场景时，负责人归属应以人工确认为准。");

    new obsidian.Setting(c).setName("结构化程度")
      .setDesc("宽松：散文为主，仅必要时分点。均衡：散文加 1–2 级列表（推荐）。严谨：多层嵌套列表（最多 3 级），把口语化叙述提炼为论点—支撑—证据。")
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

    new obsidian.Setting(c).setName("纪要翻译与语言").setHeading();
    const langHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    langHint.setText("用于多语种会议。原始转写保持原文；翻译和统一语言只发生在 AI 整理后的纪要里。");

    new obsidian.Setting(c).setName("语言策略")
      .setDesc("默认跟随原文。开启后由大模型在整理纪要时统一语言。")
      .addDropdown(d => d
        .addOption("off", "跟随原文（不翻译）")
        .addOption("translate", "统一为目标语言")
        .addOption("bilingual", "目标语言为主，关键原文括注")
        .setValue(this.plugin.settings.briefingTranslationMode || "off")
        .onChange(async v => { this.plugin.settings.briefingTranslationMode = v; await this.plugin.saveSettings(); this.display(); }));

    if ((this.plugin.settings.briefingTranslationMode || "off") !== "off") {
      new obsidian.Setting(c).setName("目标语言")
        .addDropdown(d => d
          .addOption("zh-CN", "中文")
          .addOption("en", "English")
          .addOption("ja", "日本語")
          .addOption("ko", "한국어")
          .addOption("custom", "自定义")
          .setValue(this.plugin.settings.briefingTargetLanguage || "zh-CN")
          .onChange(async v => { this.plugin.settings.briefingTargetLanguage = v; await this.plugin.saveSettings(); this.display(); }));

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

    new obsidian.Setting(c).setName("HTML 报告").setHeading();
    const reportHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    reportHint.setText("转写纪要和 HTML 报告是一组输出：前者用于沉淀到 Obsidian，后者用于把同一份纪要重构成更适合阅读、分享或打印的视觉报告。");

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

    new obsidian.Setting(c).setName("AI PPT").setHeading();
    const pptHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    pptHint.setText("PPT 是面向演示的二次重构，不是把纪要原样搬上去。生成流程会先判断演示任务、规划页面结构并做设计质量检查；本页只保留页数范围和长期生成偏好。具体会议内容、客户信息或密钥不应写入设置项。");

    new obsidian.Setting(c).setName("HTML PPT 保存文件夹")
      .setDesc("相对当前 Obsidian 库的路径。HTML PPT 可全屏演示、打印，也可另存当前页或长图。修改后仅影响新文件，已有文件不会自动迁移。")
      .addText(t => t
        .setPlaceholder("LexVoice/HTML幻灯片")
        .setValue(this.plugin.settings.htmlSlideFolder || DEFAULT_SETTINGS.htmlSlideFolder)
        .onChange(async v => {
          this.plugin.settings.htmlSlideFolder = obsidian.normalizePath(v.trim() || DEFAULT_SETTINGS.htmlSlideFolder);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("可编辑 PPTX 保存文件夹")
      .setDesc("相对当前 Obsidian 库的路径。PPTX 使用原生文本框和形状，方便在 PowerPoint、Keynote 或 WPS 里继续编辑。修改后仅影响新文件，已有文件不会自动迁移。")
      .addText(t => t
        .setPlaceholder("LexVoice/PPT")
        .setValue(this.plugin.settings.pptxSlideFolder || DEFAULT_SETTINGS.pptxSlideFolder)
        .onChange(async v => {
          this.plugin.settings.pptxSlideFolder = obsidian.normalizePath(v.trim() || DEFAULT_SETTINGS.pptxSlideFolder);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("生成 HTML PPT 后自动打开")
      .setDesc("使用系统默认浏览器打开生成的 HTML 幻灯片。")
      .addToggle(t => t
        .setValue(this.plugin.settings.autoOpenHtmlSlideAfterGenerate !== false)
        .onChange(async v => {
          this.plugin.settings.autoOpenHtmlSlideAfterGenerate = v;
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("PPT 页数偏好")
      .setDesc("填写范围即可，例如 6-10、8 或 4-6。生成时会按材料复杂度调整页数，但最多 12 页。")
      .addText(t => {
        t.setPlaceholder("6-10")
          .setValue(this.plugin.settings.pptSlideRange || DEFAULT_SETTINGS.pptSlideRange)
          .onChange(async v => {
            this.plugin.settings.pptSlideRange = normalizePptSlideRange(v);
            await this.plugin.saveSettings();
          });
        // 失焦回显归一化后的实际保存值（如 "abc" → "6-10"），所见即所存
        t.inputEl.addEventListener("blur", () => t.setValue(this.plugin.settings.pptSlideRange || DEFAULT_SETTINGS.pptSlideRange));
      });

    new obsidian.Setting(c).setName("自定义 PPT 生成提示词")
      .setDesc("用于保存长期偏好，例如更偏数据可视化、少文字、多用时间线、突出决议和待办。本项不适合填写具体会议内容、客户信息或密钥。");
    const pptPromptTa = c.createEl("textarea", { cls: "lexvoice-textarea" });
    pptPromptTa.value = this.plugin.settings.pptPromptAddendum || "";
    pptPromptTa.placeholder = "例如：每页只讲一个判断；优先可视化待办、决议和风险；避免等宽卡片堆叠；减少段落文字；不出现演讲提示。";
    pptPromptTa.rows = 4;
    pptPromptTa.addEventListener("change", async () => {
      this.plugin.settings.pptPromptAddendum = pptPromptTa.value.trim();
      await this.plugin.saveSettings();
    });

    new obsidian.Setting(c).setName("转写提示词").setHeading();
    const sceneHint = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    sceneHint.setText("提示词决定录音最终整理成什么样。内置提示词适合快速开始；长期复用的职业化规则、固定格式和输出偏好，可以保存为自定义提示词。");

    const currentMode = getEffectivePolishMode(this.plugin.settings, this.plugin.settings.polishMode, "meeting");
    const currentMeta = getModeMeta(this.plugin.settings, currentMode);
    new obsidian.Setting(c).setName("当前默认提示词")
      .setDesc((currentMeta.label || currentMeta.prefix) + "。录音、导入音频和重新整理默认使用此提示词；具体操作时仍可临时切换。")
      .addDropdown(d => {
        for (const [key, label] of getVisibleModeEntries(this.plugin.settings, false)) d.addOption(key, label);
        d.setValue(currentMode);
        d.onChange(async v => { this.plugin.settings.polishMode = v; await this.plugin.saveSettings(); this.display(); });
      })
      .addButton(b => b.setButtonText("打开提示词库").setCta().onClick(() => {
        const modal = new PromptTemplateModal(this.app, this.plugin);
        const origClose = modal.onClose.bind(modal);
        modal.onClose = () => { origClose(); this.display(); };
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

    const createPathSetting = (name, desc, value, placeholder, onSave, refreshDesc) => {
      const setting = new obsidian.Setting(c).setName(name).setDesc(desc);
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

    new obsidian.Setting(c).setName("纪要信息对象").setHeading();
    const intro = c.createDiv({ cls: "setting-item-description lexvoice-section-hint" });
    intro.setText("每篇纪要是统一入口：纪要保存完整上下文与可回听证据；ASR 热词、人员资料、学习卡片、待办卡片是从纪要中沉淀出的四类信息对象，分别服务转写准确、人员沉淀、学习复用与行动跟踪。");

    const objectList = c.createEl("ul", { cls: "lexvoice-object-model-list" });
    [
      ["ASR 热词", "服务转写准确率，只保存术语、名称和易错写法。"],
      ["人员资料", "服务本地关系沉淀，一人一页，默认不随请求发送。"],
      ["学习卡片", "服务长期学习复用，包括概念、机制、案例、QA、追问和观点。"],
      ["待办卡片", "服务行动跟踪，只承接明确可执行事项。"],
    ].forEach(([name, desc]) => {
      const li = objectList.createEl("li");
      li.createSpan({ cls: "lexvoice-object-model-name", text: name });
      li.createSpan({ text: "：" + desc });
    });

    new obsidian.Setting(c).setName("对象提取").setHeading();
    c.createDiv({ cls: "setting-item-description lexvoice-section-hint" })
      .setText("提取遵循“候选 → 确认 → 入库”。当前可直接扫描纪要库生成 ASR 热词和人员建议；学习卡片和待办卡片通过已确认的卡片文件进入对应墙面。");

    const pendingPeopleSuggestions = normalizePeopleSuggestionCache(this.plugin.settings.peopleSuggestionCache).pending;
    const ignoredPeopleSuggestions = normalizePeopleSuggestionIgnores(this.plugin.settings.peopleSuggestionIgnores);
    new obsidian.Setting(c).setName("扫描纪要库")
      .setDesc("从转写纪要文件夹读取纪要，并把文本发送到当前配置的大模型服务进行提取（按量计费）。涉密或敏感纪要建议改用本地大模型后再扫描。ASR 热词直接写入热词表；人员建议先进入确认面板，确认后才写入人员资料。")
      .addButton(b => b.setButtonText("提取 ASR 热词").onClick(async () => this._extractVocabFromLibrary(refreshVocabStatus)))
      .addButton(b => b.setButtonText("提取人员建议").onClick(async () => this.plugin.suggestPeopleDirectoryFromLibrary()));

    new obsidian.Setting(c).setName("人员建议")
      .setDesc(`待确认 ${pendingPeopleSuggestions.length} 条；已忽略 ${ignoredPeopleSuggestions.length} 条。已有人员资料只在本地用于匹配和去重，不随扫描请求发送。`)
      .addButton(b => b.setButtonText("查看待确认").setDisabled(!pendingPeopleSuggestions.length).onClick(async () => { await this.plugin.openCachedPeopleDirectorySuggestions(); this.display(); }))
      .addButton(b => b.setButtonText("查看已忽略").setDisabled(!ignoredPeopleSuggestions.length).onClick(async () => { await this.plugin.openIgnoredPeopleDirectorySuggestions(); this.display(); }));

    new obsidian.Setting(c).setName("对象保存位置").setHeading();
    c.createDiv({ cls: "setting-item-description lexvoice-section-hint" })
      .setText("这些路径都是当前 Obsidian 库内的相对路径。建议让纪要、对象和视图分层保存：纪要用于追溯，对象用于复用，视图用于浏览。");

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

    const vocabPathSetting = createPathSetting("ASR 热词表", "用于保存转写热词、专有名词和易错写法。", this.plugin.settings.vocabularyFile || DEFAULT_SETTINGS.vocabularyFile, "LexVoice/词汇表.md",
      async v => { this.plugin.settings.vocabularyFile = v || DEFAULT_SETTINGS.vocabularyFile; },
      refreshVocabStatus);

    createPathSetting("人员资料文件夹", "一人一篇 Markdown，用于长期维护姓名、常用称呼、角色、组织和相关纪要。", this.plugin.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder, "LexVoice/人员",
      async v => { this.plugin.settings.peopleDirectoryFolder = v || DEFAULT_SETTINGS.peopleDirectoryFolder; },
      async setting => {
        try {
          const people = await loadPeopleDirectory(this.plugin);
          setting.setDesc(`当前 ${people.length} 位人员。人员资料默认只在本地读取。`);
        } catch (e) {
          setting.setDesc(`读取失败：${e.message || e}`);
        }
      });

    createPathSetting("学习卡片文件夹", "用于保存概念、机制、案例、QA、追问和观点卡片。", this.plugin.settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder, "LexVoice/学习卡片",
      async v => { this.plugin.settings.learningCardsFolder = v || DEFAULT_SETTINGS.learningCardsFolder; },
      async setting => {
        const count = countMarkdownInFolder(this.plugin.settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder);
        setting.setDesc(`当前 ${count} 张学习卡片。卡片负责复用，原始依据仍回链到纪要。`);
      });

    createPathSetting("待办卡片文件夹", "用于保存从纪要中确认后的行动项卡片。", this.plugin.settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder, "LexVoice/待办卡片",
      async v => { this.plugin.settings.todoCardsFolder = v || DEFAULT_SETTINGS.todoCardsFolder; },
      async setting => {
        const count = countMarkdownInFolder(this.plugin.settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder);
        setting.setDesc(`当前 ${count} 张待办卡片。待办卡片适合跟踪跨会议、跨项目的行动项。`);
      });

    createPathSetting("视图文件夹", "保存 LexVoice 生成的知识墙和辅助 Base。", this.plugin.settings.lexVoiceBasesFolder || DEFAULT_SETTINGS.lexVoiceBasesFolder, "LexVoice/视图",
      async v => { this.plugin.settings.lexVoiceBasesFolder = v || DEFAULT_SETTINGS.lexVoiceBasesFolder; });

    new obsidian.Setting(c).setName("浏览与检索").setHeading();
    c.createDiv({ cls: "setting-item-description lexvoice-section-hint" })
      .setText("学习卡片墙、概念墙和待办墙是主要浏览入口；Base 保留为明细筛选和人员资料表格，不作为主功能呈现。");

    new obsidian.Setting(c).setName("对象墙")
      .setDesc("打开或创建对应的 Markdown 墙面视图。墙面样式由 LexVoice 插件内置 CSS 提供。")
      .addButton(b => b.setButtonText("学习卡片墙").setCta().onClick(() => this.plugin.openLearningWall("learning")))
      .addButton(b => b.setButtonText("概念墙").onClick(() => this.plugin.openLearningWall("concept")))
      .addButton(b => b.setButtonText("待办墙").onClick(() => this.plugin.openTodoWall()));

    new obsidian.Setting(c).setName("明细视图")
      .setDesc("Base 是 Obsidian 自带的表格视图。用于筛选、核对和批量浏览；保持接近 Obsidian Base 原生样式，降低主题冲突。")
      .addButton(b => b.setButtonText("人员资料 Base").onClick(() => this.plugin.openPeopleBase()))
      .addButton(b => b.setButtonText("纪要明细 Base").onClick(() => this.plugin.openLexVoiceDetailBase()))
      .addButton(b => b.setButtonText("补齐表格视图").onClick(async () => {
        try {
          const r = await this.plugin.createLexVoiceBases({ overwrite: false });
          new obsidian.Notice(`视图创建完成：新建 ${r.created} 个，跳过 ${r.skipped} 个`);
        } catch (e) {
          console.error(e);
          new obsidian.Notice(`创建失败：${e.message || e}`);
        }
      }));

    new obsidian.Setting(c).setName("对象维护").setHeading();
    new obsidian.Setting(c).setName("ASR 热词表")
      .setDesc("打开热词表进行人工维护。热词只用于提高转写时的专有名词识别，不承载人员关系。默认文件名「词汇表.md」为历史沿用，可改名。")
      .addButton(b => b.setButtonText("打开/创建").onClick(async () => {
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
          await refreshVocabStatus(vocabPathSetting);
          await this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
      }));

    const vocabScanCount = countKnowledgeExtractionHistory(this.plugin.settings, "vocabulary");
    const peopleScanCount = countKnowledgeExtractionHistory(this.plugin.settings, "people");
    new obsidian.Setting(c).setName("纪要扫描记录")
      .setDesc(`ASR 热词已扫描 ${vocabScanCount} 篇；人员建议已扫描 ${peopleScanCount} 篇。清空记录后，修改过或已存在的纪要可重新进入扫描。重新扫描会再次调用大模型服务，云端按量产生费用。`)
      .addButton(b => b.setButtonText("清空热词记录").setDisabled(!vocabScanCount).onClick(async () => {
        const ok = await lexvoiceConfirm(this.app, "清空热词扫描记录？", `${vocabScanCount} 篇纪要将重新进入扫描范围；重新扫描会再次调用大模型服务，云端按量产生费用。`, "清空");
        if (!ok) return;
        this.plugin.clearKnowledgeExtractionHistory("vocabulary");
        await this.plugin.saveSettings();
        new obsidian.Notice("已清空 ASR 热词扫描记录");
        this.display();
      }))
      .addButton(b => b.setButtonText("清空人员记录").setDisabled(!peopleScanCount).onClick(async () => {
        const ok = await lexvoiceConfirm(this.app, "清空人员建议扫描记录？", `${peopleScanCount} 篇纪要将重新进入扫描范围；重新扫描会再次调用大模型服务，云端按量产生费用。`, "清空");
        if (!ok) return;
        this.plugin.clearKnowledgeExtractionHistory("people");
        await this.plugin.saveSettings();
        new obsidian.Notice("已清空人员建议扫描记录");
        this.display();
      }));

    new obsidian.Setting(c).setName("隐私与上下文").setHeading();
    const transcribeProvider = resolveTranscribeProvider(this.plugin);
    const asrScope = isLocalServiceEndpoint(transcribeProvider.endpoint) ? "当前转写服务识别为本地或局域网" : "当前转写服务识别为云端";
    const llmScope = isLocalLlmEndpoint(this.plugin.settings.llmEndpoint) ? "当前大模型服务识别为本地或局域网" : "当前大模型服务识别为云端";
    const modeLabel = { privacy: "隐私优先", hotwords: "人名热词", localFull: "本地增强" }[normalizePeopleContextMode(this.plugin.settings.peopleContextMode)] || "隐私优先";
    const consentText = hasPeopleHotwordsConsent(this.plugin.settings) ? `已于 ${this.plugin.settings.peopleHotwordsConsentAt} 授权人名热词。` : "尚未授权人名热词。";

    new obsidian.Setting(c).setName("人员资料使用策略")
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
            if (!ok) { this.display(); return; }
            this.plugin.settings.peopleHotwordsConsentAt = new Date().toISOString();
          }
          this.plugin.settings.peopleContextMode = next;
          await this.plugin.saveSettings();
          this.display();
        }))
      .addButton(b => b.setButtonText("撤销授权")
        .setDisabled(!hasPeopleHotwordsConsent(this.plugin.settings))
        .onClick(async () => {
          this.plugin.settings.peopleHotwordsConsentAt = "";
          if (normalizePeopleContextMode(this.plugin.settings.peopleContextMode) === "hotwords") this.plugin.settings.peopleContextMode = "privacy";
          await this.plugin.saveSettings();
          new obsidian.Notice("已撤销人名热词授权：后续转写与整理请求不再附带人员姓名和称呼，使用策略已自动切回「隐私优先」。");
          this.display();
        }));
  }

  async _extractVocabFromLibrary(refreshStatus) {
    if (!this.plugin.settings.llmApiKey && !isLocalLlmEndpoint(this.plugin.settings.llmEndpoint)) {
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

    new obsidian.Setting(c).setName("官方发布源")
      .setDesc("LexVoice 从官方 GitHub 仓库检查并安装更新。更新只替换插件发布文件，不会覆盖 data.json、API Key、保存路径、自定义提示词或队列数据。")
      .addButton(b => b.setButtonText("打开 GitHub").onClick(() => openLexVoiceExternalUrl(LEXVOICE_UPDATE_REPO_URL)))
      .addButton(b => b.setButtonText("打开 Release").onClick(() => openLexVoiceExternalUrl(LEXVOICE_UPDATE_REPO_URL + "/releases")));

    new obsidian.Setting(c).setName("启动时自动检查")
      .setDesc("开启后最多每 24 小时检查一次官方仓库。")
      .addToggle(t => t.setValue(this.plugin.settings.autoCheckUpdates !== false)
        .onChange(async v => { this.plugin.settings.autoCheckUpdates = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("检查与安装")
      .setDesc("建议先执行「检查更新」。发现新版本后可一键安装；当前版本号相同时，也可重新拉取官方发布文件用于修复本地副本。安装前会备份当前插件文件和设置。")
      .addButton(b => b.setButtonText("检查更新").onClick(async () => {
        await this.plugin.checkForUpdates({ silent: false });
        this.display();
      }))
      .addButton(b => b.setButtonText("一键增量更新").setCta().onClick(async () => {
        try {
          await this.plugin.installAvailableUpdate();
          this.display();
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
    } catch {}
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
      } catch {}
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
    new obsidian.Setting(c).setName("招聘项目化").setHeading();
    c.createEl("p", {
      cls: "lexvoice-settings-hint",
      text: "把招聘流程项目化：每个岗位是 JD 库下的一个子文件夹（同名 JD 文件 + 候选人看板）。面试评估自动归位到对应项目，项目统计实时更新。",
    });

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
    new obsidian.Setting(c).setName("录音行为").setHeading();

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
        t.inputEl.addEventListener("blur", () => t.setValue(String(this.plugin.settings.segmentIntervalMinutes)));
      });

    new obsidian.Setting(c).setName("转写并发数")
      .setDesc("导入长音频时同时上传几段。默认 1 最稳妥；网络和服务额度稳定时可调到 2 或 3。如经常提示「请求过于频繁」或服务器错误（代码 429/500），请改回 1。")
      .addDropdown(d => d
        .addOption("1", "1（最稳）")
        .addOption("2", "2（平衡）")
        .addOption("3", "3（较快）")
        .setValue(String(normalizeAsrConcurrency(this.plugin.settings.asrConcurrency)))
        .onChange(async v => {
          this.plugin.settings.asrConcurrency = normalizeAsrConcurrency(v);
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(c).setName("保留后台切片音频")
      .setDesc("开启后保留每个后台切片音频用于排查，占用更多存储；关闭（默认）时只保留完整录音，成功转写的临时切片自动清理（失败重试所需的切片暂时保留）。")
      .addToggle(t => t.setValue(this.plugin.settings.keepSegmentAudioFiles === true).onChange(async v => { this.plugin.settings.keepSegmentAudioFiles = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("纪要整合排版")
      .setDesc("录音完成后笔记重排：顶部 AI 整合内容，底部可折叠原始分段。关闭后纪要按时间顺序保留原始分段，不做顶部整合。")
      .addToggle(t => t.setValue(this.plugin.settings.consolidatedLayout).onChange(async v => { this.plugin.settings.consolidatedLayout = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("自动加场景标签到文件名")
      .setDesc("录音、导入音频、重新整理或队列重试完成后，由 AI 提炼一个不超过 15 字的主题追加到笔记文件名。")
      .addToggle(t => t.setValue(this.plugin.settings.autoRenameWithTitle).onChange(async v => { this.plugin.settings.autoRenameWithTitle = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("实时大纲")
      .setDesc("每段转写完成后自动调用 LLM 整理大纲。关闭后可在面板内手动刷新；分段越多，LLM 调用次数越多。")
      .addToggle(t => t.setValue(this.plugin.settings.enableRealtimeOutline).onChange(async v => { this.plugin.settings.enableRealtimeOutline = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("录音开始时自动打开实时纪要面板")
      .addToggle(t => t.setValue(this.plugin.settings.autoOpenOutlineOnRecord).onChange(async v => { this.plugin.settings.autoOpenOutlineOnRecord = v; await this.plugin.saveSettings(); }));

    // ---- 设备与诊断 ----
    new obsidian.Setting(c).setName("设备与诊断").setHeading();

    new obsidian.Setting(c).setName("音频设备检测")
      .setDesc("检测麦克风、电脑音频输入是否就位。录制 B 站客户端、浏览器视频、课程或会议对方声音前建议先检查；如果录音中电平条不动，优先检查这里。")
      .addButton(b => b.setButtonText("检测").onClick(async () => {
        await this.runAudioDiagnostic();
      }))
      .addButton(b => b.setButtonText("电脑音频指引").onClick(() => {
        new VirtualCableSetupModal(this.app, this.plugin).open();
      }));
    this.diagResultEl = c.createDiv({ cls: "lexvoice-diag-result" });

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
    new obsidian.Setting(c).setName("外部音频联动").setHeading();

    new obsidian.Setting(c).setName("收件箱文件夹")
      .setDesc("Obsidian 库内的相对路径。任何音频出现在此文件夹会被自动转写并归档。留空则禁用此功能。")
      .addText(t => t.setValue(this.plugin.settings.inboxFolder || "")
        .setPlaceholder("LexVoice/录音/inbox")
        .onChange(async v => { this.plugin.settings.inboxFolder = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("自动处理新文件")
      .setDesc("关闭后需手动用命令面板的扫描收件箱命令触发。")
      .addToggle(t => t.setValue(this.plugin.settings.inboxAutoImport).onChange(async v => { this.plugin.settings.inboxAutoImport = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("归档子文件夹")
      .setDesc("处理完成后移到此子文件夹。留空将不归档，可能导致重复处理。")
      .addText(t => t.setValue(this.plugin.settings.inboxArchiveSubfolder || "")
        .setPlaceholder("processed")
        .onChange(async v => { this.plugin.settings.inboxArchiveSubfolder = v; await this.plugin.saveSettings(); }));

    new obsidian.Setting(c).setName("等待云盘同步完成（毫秒）")
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
        t.inputEl.addEventListener("blur", () => t.setValue(String(this.plugin.settings.inboxStabilizeDelayMs ?? 3000)));
      });

    new obsidian.Setting(c).setName("立即扫描收件箱")
      .setDesc("处理所有未归档的音频文件。用于补漏或初次配置后批量处理。")
      .addButton(b => b.setButtonText("扫描").onClick(() => this.plugin.scanInboxFolder()));

    new obsidian.Setting(c).setName("清理空白短录音")
      .setDesc("扫描转写纪要文件夹，将时长不超过 10 秒且没有有效转写文本的 LexVoice 条目移入系统废纸篓，并同步处理其引用的录音文件。误删可从系统废纸篓恢复。")
      .addButton(b => b.setButtonText("扫描并清理").setWarning().onClick(() => this.plugin.cleanupEmptyShortRecordings()));

    // ---- 失败重试 ----
    new obsidian.Setting(c).setName("失败重试").setHeading();

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
        t.inputEl.addEventListener("blur", () => t.setValue(String(this.plugin.settings.maxRetries || 3)));
      });

    new obsidian.Setting(c).setName("待处理队列")
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
      vcText.createDiv({ text: "录制 B 站客户端、浏览器视频、系统声音或会议对方声音需要虚拟声卡，并在下方选定它。点上方「电脑音频指引」查看分平台指引。", cls: "lexvoice-diag-sub" });
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

    const allDiagInputs = allInputs;
    if (allDiagInputs.length > 0) {
      const micSel = card.createDiv({ cls: "lexvoice-diag-vc-select" });
      micSel.createDiv({ text: "麦克风：", cls: "lexvoice-diag-label" });
      const micDropdown = micSel.createEl("select", { cls: "dropdown" });
      const placeholderMic = micDropdown.createEl("option", { value: "", text: "— 请选择麦克风 —" });
      if (!this.plugin.settings.selectedMicrophoneDevice) placeholderMic.selected = true;
      // 列出所有输入设备，不过滤；虚拟/远程的标个提示但允许选
      for (const d of allDiagInputs) {
        const suffix = isVirtualCableLabel(d.label) ? "（可能是虚拟/远程）" : "";
        const opt = micDropdown.createEl("option", { value: d.deviceId, text: (d.label || "未授权读取") + suffix });
        if (this.plugin.settings.selectedMicrophoneDevice === d.deviceId) opt.selected = true;
      }
      micDropdown.addEventListener("change", async () => {
        this.plugin.settings.selectedMicrophoneDevice = micDropdown.value;
        await this.plugin.saveSettings();
        new obsidian.Notice(micDropdown.value ? "麦克风选择已保存" : "请选择一个麦克风");
      });
    }

    if (allDiagInputs.length > 0) {
      const sel = card.createDiv({ cls: "lexvoice-diag-vc-select" });
      sel.createDiv({ text: "电脑音频输入：", cls: "lexvoice-diag-label" });
      const dropdown = sel.createEl("select", { cls: "dropdown" });
      const placeholderVc = dropdown.createEl("option", { value: "", text: "— 请选择电脑音频输入 —" });
      if (!this.plugin.settings.selectedVirtualDevice) placeholderVc.selected = true;
      for (const d of allDiagInputs) {
        const suffix = isVirtualCableLabel(d.label) ? "（推荐 · 虚拟声卡）" : "";
        const opt = dropdown.createEl("option", { value: d.deviceId, text: (d.label || "未授权读取") + suffix });
        if (this.plugin.settings.selectedVirtualDevice === d.deviceId) opt.selected = true;
      }
      dropdown.addEventListener("change", async () => {
        this.plugin.settings.selectedVirtualDevice = dropdown.value;
        await this.plugin.saveSettings();
        new obsidian.Notice(dropdown.value ? "电脑音频输入选择已保存" : "请选择一个电脑音频输入");
      });
    }
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

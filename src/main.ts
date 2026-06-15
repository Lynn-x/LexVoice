// @ts-nocheck
import * as obsidian from "obsidian";
// 实时大纲"文本/状态纯函数层"已抽到独立模块并由 vitest 回归测试覆盖（src/outline-text.test.ts）。
// 这里 import 回来，保持原有调用点用裸名引用不变。



const QUICK_INTERIM_CUTS_MS = [10 * 1000, 60 * 1000, 3 * 60 * 1000];




const SETTINGS_SCHEMA_VERSION = 3;
const LEGACY_VOCABULARY_FILE = "lexvoice 词汇表.md";
const SHORT_RECORDING_FILTER_MS = 3000;
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_PLUGIN_FILES = ["manifest.json", "main.js", "styles.css", "README.md"];
const KNOWLEDGE_EXTRACTION_BATCH_LIMIT = 20;

// 「一个 Key 通用」供应商：同一把 Key 同时支持语音转写 + 大模型对话。首页快速配置一处填 Key + 选供应商即可两边都配好。
// asrProvider 对应 transcribeProviders 里的 id；llmPreset 对应 LLM_SERVICE_PRESETS 里的 id。








function knowledgeExtractionRecordForFile(file) {
  return {
    mtime: file && file.stat ? Number(file.stat.mtime) || 0 : 0,
    size: file && file.stat ? Number(file.stat.size) || 0 : 0,
    scannedAt: new Date().toISOString(),
  };
}

function isKnowledgeSourceAlreadyScanned(settings, kind, file) {
  const history = normalizeKnowledgeExtractionHistory(settings && settings.knowledgeExtractionHistory);
  const bucket = history[kind] || {};
  const record = bucket[obsidian.normalizePath(file && file.path || "")];
  if (!record || !file || !file.stat) return false;
  const mtime = Number(file.stat.mtime) || 0;
  const size = Number(file.stat.size) || 0;
  return Number(record.mtime) === mtime && Number(record.size) === size;
}







// 已保存 LLM 配置库的读写辅助
// 规范化转写快照（API 方案里可选携带的转写 provider 配置）。无 providerId 视为无快照。


// API 方案是否「一个 Key 通用」：带转写快照、且转写与 LLM 同一把 Key、同一 host（如 MiMo 两边都 api.xiaomimimo.com）。


// 把工作字段（llmEndpoint/llmApiKey/llmModel）的当前值回写到指定配置

// 抓当前激活转写 provider 的配置成快照（用于存进 API 方案的 asr）。

// 转写字段变更时，把当前激活转写 provider 快照回写进**已激活且本就带转写快照**的方案。
// 只更新已是「完整方案（含 asr）」的激活方案，不给「仅 LLM 旧方案」凭空塞 asr。

// 把指定配置灌进工作字段；若方案带转写快照，同时切换转写服务。







function resolveRuntimeAudioInputMode(mode) {
  const normalized = normalizeAudioInputMode(mode || "mic");
  return isLexVoiceMobileRuntime() ? "mic" : normalized;
}

function normalizeLexVoiceSettings(savedData) {
  const saved = isRecord(savedData) ? savedData : {};
  const raw = isRecord(saved.settings) ? saved.settings : saved;
  const defaults = cloneJson(DEFAULT_SETTINGS);
  const s = Object.assign({}, defaults, raw);

  const storage = raw.storage || {};
  s.audioFolder = pickDefined(storage.recordingLibraryPath, raw.audioFolder, defaults.audioFolder);
  s.mdFolder = pickDefined(storage.briefingNotePath, raw.mdFolder, defaults.mdFolder);
  s.meetingMaterialsFolder = obsidian.normalizePath(pickDefined(storage.meetingMaterialPath, raw.meetingMaterialsFolder, defaults.meetingMaterialsFolder));
  s.htmlReportFolder = pickDefined(storage.htmlReportPath, raw.htmlReportFolder, defaults.htmlReportFolder);
  s.htmlSlideFolder = pickDefined(storage.htmlSlidePath, raw.htmlSlideFolder, defaults.htmlSlideFolder);
  s.pptxSlideFolder = pickDefined(storage.pptxPath, raw.pptxSlideFolder, defaults.pptxSlideFolder);
  s.inboxFolder = pickDefined(storage.inboxPath, raw.inboxFolder, defaults.inboxFolder);
  s.inboxAutoImport = pickDefined(storage.autoImportInbox, raw.inboxAutoImport, defaults.inboxAutoImport);
  s.inboxArchiveSubfolder = pickDefined(storage.archiveSubfolder, raw.inboxArchiveSubfolder, defaults.inboxArchiveSubfolder);
  s.inboxStabilizeDelayMs = pickDefined(storage.syncQuietMs, raw.inboxStabilizeDelayMs, defaults.inboxStabilizeDelayMs);

  const noteNaming = raw.noteNaming || {};
  s.noteFileNameFormatNew = pickDefined(noteNaming.sessionPattern, raw.noteFileNameFormatNew, defaults.noteFileNameFormatNew);
  s.autoOpenNoteAfterFinish = pickDefined(noteNaming.openAfterFinish, raw.autoOpenNoteAfterFinish, defaults.autoOpenNoteAfterFinish);
  s.autoRenameWithTitle = pickDefined(noteNaming.renameWithTitle, raw.autoRenameWithTitle, defaults.autoRenameWithTitle);
  s.consolidatedLayout = pickDefined(noteNaming.consolidatedLayout, raw.consolidatedLayout, defaults.consolidatedLayout);

  const capture = raw.capture || {};
  s.captureMode = normalizeAudioInputMode(pickDefined(capture.sourceMode, raw.captureMode, defaults.captureMode));
  s.selectedVirtualDevice = pickDefined(capture.virtualDeviceId, raw.selectedVirtualDevice, defaults.selectedVirtualDevice);
  s.selectedMicrophoneDevice = pickDefined(capture.microphoneDeviceId, raw.selectedMicrophoneDevice, defaults.selectedMicrophoneDevice);
  s.enableInterimOutput = pickDefined(capture.liveSegmentsEnabled, raw.enableInterimOutput, defaults.enableInterimOutput);
  s.segmentIntervalMinutes = pickDefined(capture.segmentMinutes, raw.segmentIntervalMinutes, defaults.segmentIntervalMinutes);
  s.segmentCacheFolder = pickDefined(storage.segmentCachePath, raw.segmentCacheFolder, defaults.segmentCacheFolder);
  s.keepSegmentAudioFiles = pickDefined(capture.keepSegmentAudioFiles, raw.keepSegmentAudioFiles, defaults.keepSegmentAudioFiles);
  s.filterShortRecordings = pickDefined(capture.discardVeryShortRecordings, raw.filterShortRecordings, defaults.filterShortRecordings);

  const speech = raw.speech || {};
  const savedProviders = speech.providers || raw.transcribeProviders || {};
  const defaultProviders = DEFAULT_SETTINGS.transcribeProviders;
  const providerIds = new Set(Object.keys(defaultProviders).concat(Object.keys(savedProviders)));
  s.transcribeProviders = {};
  for (const id of providerIds) {
    s.transcribeProviders[id] = Object.assign({}, defaultProviders[id] || {}, savedProviders[id] || {});
    // 预设服务的展示性文案（name/hint）与协议字段始终以当前版本默认值为准：
    // 它们不是用户配置，旧版本落盘的过期文案/协议在升级后会误导用户与路由（如 1.2.3 残留的 MiMo 限额描述）。
    const dft = defaultProviders[id];
    if (dft) {
      if (dft.name) s.transcribeProviders[id].name = dft.name;
      if (dft.hint) s.transcribeProviders[id].hint = dft.hint;
      if (dft.protocol) s.transcribeProviders[id].protocol = dft.protocol;
    }
  }
  s.activeTranscribeProvider = pickDefined(speech.activeProviderId, raw.activeTranscribeProvider, defaults.activeTranscribeProvider);
  s.transcribeEndpoint = pickDefined(speech.compatEndpoint, raw.transcribeEndpoint, defaults.transcribeEndpoint);
  s.transcribeApiKey = pickDefined(speech.compatApiKey, raw.transcribeApiKey, defaults.transcribeApiKey);
  s.transcribeModel = pickDefined(speech.compatModel, raw.transcribeModel, defaults.transcribeModel);
  s.transcribeLanguage = pickDefined(speech.compatLanguage, raw.transcribeLanguage, defaults.transcribeLanguage);
  s.asrConcurrency = normalizeAsrConcurrency(pickDefined(speech.asrConcurrency, raw.asrConcurrency, defaults.asrConcurrency));
  if (!savedProviders.siliconflow && (s.transcribeApiKey || s.transcribeModel || s.transcribeEndpoint)) {
    const sf = s.transcribeProviders.siliconflow;
    if (sf) {
      if (s.transcribeApiKey) sf.apiKey = s.transcribeApiKey;
      if (s.transcribeModel) sf.model = s.transcribeModel;
      if (s.transcribeEndpoint) sf.endpoint = s.transcribeEndpoint;
      if (s.transcribeLanguage) sf.language = s.transcribeLanguage;
    }
  }

  const composer = raw.composer || {};
  const promptOverrides = composer.modePromptOverrides || raw.modePromptOverrides || {};
  s.llmEndpoint = pickNonBlankString(composer.endpoint, raw.llmEndpoint, defaults.llmEndpoint);
  s.llmApiKey = pickNonBlankString(composer.apiKey, raw.llmApiKey, defaults.llmApiKey);
  s.llmModel = pickNonBlankString(composer.model, raw.llmModel, defaults.llmModel);
  s.llmServicePreset = pickDefined(composer.servicePreset, raw.llmServicePreset, defaults.llmServicePreset);
  s.llmProfiles = normalizeLlmProfiles(composer.profiles || raw.llmProfiles);
  s.activeLlmProfile = pickDefined(composer.activeProfile, raw.activeLlmProfile, defaults.activeLlmProfile);
  if (s.activeLlmProfile && !s.llmProfiles.some(p => p.id === s.activeLlmProfile)) s.activeLlmProfile = "";
  s.polishMode = pickDefined(composer.defaultMode, raw.polishMode, defaults.polishMode);
  s.polishPromptInterview = pickDefined(promptOverrides.interview, raw.polishPromptInterview, defaults.polishPromptInterview);
  s.polishPromptMeeting = pickDefined(promptOverrides.meeting, raw.polishPromptMeeting, defaults.polishPromptMeeting);
  s.polishPromptHuddle = pickDefined(promptOverrides.huddle, raw.polishPromptHuddle, defaults.polishPromptHuddle);
  s.polishPromptSeminar = pickDefined(promptOverrides.seminar, raw.polishPromptSeminar, defaults.polishPromptSeminar);
  s.polishPromptMonologue = pickDefined(promptOverrides.monologue, raw.polishPromptMonologue, defaults.polishPromptMonologue);
  s.polishPromptLearning = pickDefined(promptOverrides.learning, raw.polishPromptLearning, defaults.polishPromptLearning);
  s.polishPromptRecruit = pickDefined(promptOverrides.recruit, raw.polishPromptRecruit, defaults.polishPromptRecruit);
  s.briefingStructureLevel = pickDefined(composer.structureLevel, raw.briefingStructureLevel, defaults.briefingStructureLevel);
  s.repolishPreferencePromptAddendum = pickDefined(composer.repolishPreferencePromptAddendum, raw.repolishPreferencePromptAddendum, defaults.repolishPreferencePromptAddendum);
  s.repolishPreference = pickDefined(composer.repolishPreference, raw.repolishPreference, defaults.repolishPreference);
  const languagePolicy = composer.languagePolicy || raw.languagePolicy || {};
  s.briefingTranslationMode = pickDefined(languagePolicy.mode, raw.briefingTranslationMode, defaults.briefingTranslationMode);
  s.briefingTargetLanguage = pickDefined(languagePolicy.targetLanguage, raw.briefingTargetLanguage, defaults.briefingTargetLanguage);
  s.briefingCustomLanguage = pickDefined(languagePolicy.customLanguage, raw.briefingCustomLanguage, defaults.briefingCustomLanguage);
  s.briefingKeepOriginalTerms = pickDefined(languagePolicy.keepOriginalTerms, raw.briefingKeepOriginalTerms, defaults.briefingKeepOriginalTerms);
  s.briefingLanguageInstruction = pickDefined(languagePolicy.extraInstruction, raw.briefingLanguageInstruction, defaults.briefingLanguageInstruction);
  s.industryProfile = Object.assign({}, defaults.industryProfile, composer.industryProfile || raw.industryProfile || {});

  const presentation = raw.presentation || {};
  // pptThemePreset / pptTaskAngle / pptAudienceHint 已移除：代码从未读取（PPT 主题由模型按内容决定），属死设置。
  s.pptSlideRange = pickDefined(presentation.slideRange, raw.pptSlideRange, defaults.pptSlideRange);
  s.pptPromptAddendum = pickDefined(presentation.promptAddendum, raw.pptPromptAddendum, defaults.pptPromptAddendum);
  s.autoOpenHtmlReportAfterGenerate = pickDefined(presentation.openHtmlReportAfterGenerate, raw.autoOpenHtmlReportAfterGenerate, defaults.autoOpenHtmlReportAfterGenerate);
  s.reportBrandName = String(pickDefined(presentation.reportBrandName, raw.reportBrandName, defaults.reportBrandName) || "").trim();
  s.autoOpenHtmlSlideAfterGenerate = pickDefined(presentation.openHtmlSlideAfterGenerate, raw.autoOpenHtmlSlideAfterGenerate, defaults.autoOpenHtmlSlideAfterGenerate);

  const vocabulary = raw.vocabulary || {};
  s.customVocabulary = pickDefined(vocabulary.inlineTerms, raw.customVocabulary, defaults.customVocabulary);
  s.vocabularyFile = pickDefined(vocabulary.notePath, raw.vocabularyFile, defaults.vocabularyFile);
  if (obsidian.normalizePath(s.vocabularyFile || "").toLowerCase() === LEGACY_VOCABULARY_FILE.toLowerCase()) {
    s.vocabularyFile = defaults.vocabularyFile;
  }
  s.peopleDirectoryFolder = obsidian.normalizePath(pickDefined(vocabulary.peopleFolder, raw.peopleDirectoryFolder, defaults.peopleDirectoryFolder) || defaults.peopleDirectoryFolder);
  s.peopleBaseFile = obsidian.normalizePath(pickDefined(vocabulary.peopleBasePath, raw.peopleBaseFile, defaults.peopleBaseFile) || defaults.peopleBaseFile);
  s.learningCardsFolder = obsidian.normalizePath(pickDefined(vocabulary.learningCardsFolder, raw.learningCardsFolder, defaults.learningCardsFolder) || defaults.learningCardsFolder);
  s.todoCardsFolder = obsidian.normalizePath(pickDefined(vocabulary.todoCardsFolder, raw.todoCardsFolder, defaults.todoCardsFolder) || defaults.todoCardsFolder);
  s.peopleContextMode = normalizePeopleContextMode(pickDefined(vocabulary.peopleContextMode, raw.peopleContextMode, defaults.peopleContextMode));
  s.peopleHotwordsConsentAt = String(pickDefined(vocabulary.peopleHotwordsConsentAt, raw.peopleHotwordsConsentAt, defaults.peopleHotwordsConsentAt) || "");
  s.peopleSuggestionIgnores = normalizePeopleSuggestionIgnores(pickDefined(vocabulary.peopleSuggestionIgnores, raw.peopleSuggestionIgnores, defaults.peopleSuggestionIgnores));
  s.peopleSuggestionCache = normalizePeopleSuggestionCache(pickDefined(vocabulary.peopleSuggestionCache, raw.peopleSuggestionCache, defaults.peopleSuggestionCache));
  s.knowledgeExtractionHistory = normalizeKnowledgeExtractionHistory(pickDefined(vocabulary.extractionHistory, raw.knowledgeExtractionHistory, defaults.knowledgeExtractionHistory));

  const views = raw.views || {};
  s.lexVoiceBasesFolder = obsidian.normalizePath(pickDefined(views.baseFolder, raw.lexVoiceBasesFolder, defaults.lexVoiceBasesFolder) || defaults.lexVoiceBasesFolder);

  const liveOutline = raw.liveOutline || {};
  s.enableRealtimeOutline = pickDefined(liveOutline.enabled, raw.enableRealtimeOutline, defaults.enableRealtimeOutline);
  s.realtimeOutlineDebounceMs = pickDefined(liveOutline.debounceMs, raw.realtimeOutlineDebounceMs, defaults.realtimeOutlineDebounceMs);
  s.autoOpenOutlineOnRecord = pickDefined(liveOutline.openOnCapture, raw.autoOpenOutlineOnRecord, defaults.autoOpenOutlineOnRecord);

  const dailyNote = raw.dailyNote || {};
  s.writeDailyMeetingOverview = pickDefined(dailyNote.meetingOverviewEnabled, raw.writeDailyMeetingOverview, defaults.writeDailyMeetingOverview);
  s.dailyMeetingOverviewHeading = String(pickDefined(dailyNote.meetingOverviewHeading, raw.dailyMeetingOverviewHeading, defaults.dailyMeetingOverviewHeading) || defaults.dailyMeetingOverviewHeading).replace(/^#+\s*/, "").trim() || defaults.dailyMeetingOverviewHeading;
  s.dailyMeetingOverviewTemplate = String(pickDefined(dailyNote.meetingOverviewTemplate, raw.dailyMeetingOverviewTemplate, defaults.dailyMeetingOverviewTemplate) || "").trim() || defaults.dailyMeetingOverviewTemplate;

  const retryPolicy = raw.retryPolicy || {};
  s.maxRetries = pickDefined(retryPolicy.maxAttempts, raw.maxRetries, defaults.maxRetries);

  const diagnostics = raw.diagnostics || {};
  s.diagnosticsLogEnabled = pickDefined(diagnostics.enabled, raw.diagnosticsLogEnabled, defaults.diagnosticsLogEnabled) !== false;
  s.diagnosticsLogFolder = obsidian.normalizePath(pickDefined(diagnostics.folder, raw.diagnosticsLogFolder, defaults.diagnosticsLogFolder) || defaults.diagnosticsLogFolder);

  const ui = raw.ui || {};
  s.showFloatingBall = pickDefined(ui.floatingControlEnabled, raw.showFloatingBall, defaults.showFloatingBall);
  s.floatingBallPos = Object.assign({}, defaults.floatingBallPos, ui.floatingControlPosition || raw.floatingBallPos || {});

  const recruiting = raw.recruiting || {};
  s.recruitContext = Object.assign({}, defaults.recruitContext, recruiting.context || raw.recruitContext || {});
  s.recruitAlwaysAskOnStart = pickDefined(recruiting.askBeforeCapture, raw.recruitAlwaysAskOnStart, defaults.recruitAlwaysAskOnStart);
  s.recruitContextLibrary = Array.isArray(recruiting.contextLibrary)
    ? recruiting.contextLibrary
    : (Array.isArray(raw.recruitContextLibrary) ? raw.recruitContextLibrary : []);
  s.recruitFeatureUnlocked = !!pickDefined(recruiting.unlocked, raw.recruitFeatureUnlocked, defaults.recruitFeatureUnlocked);
  if (!s.recruitFeatureUnlocked && s.polishMode === "recruit") s.polishMode = defaults.polishMode;
  // HR 模块路径：空串也算"已定义"，pickDefined 会选中它，故文件夹路径做非空兜底回默认
  s.recruitJdFolderPath = String(pickDefined(recruiting.jdFolder, raw.recruitJdFolderPath, defaults.recruitJdFolderPath) || "").trim() || "JD";
  s.recruitResumeFolderPath = String(pickDefined(recruiting.resumeFolder, raw.recruitResumeFolderPath, defaults.recruitResumeFolderPath) || "").trim() || "简历";
  s.recruitResumeDesensitize = pickDefined(recruiting.desensitize, raw.recruitResumeDesensitize, defaults.recruitResumeDesensitize) !== false;
  s.recruitHomepagePath = String(pickDefined(recruiting.homepage, raw.recruitHomepagePath, defaults.recruitHomepagePath) || "").trim();

  const updates = raw.updates || {};
  // updateRepoUrl/Branch/PluginDir/RawBaseUrl 已收编为模块常量 LEXVOICE_UPDATE_*：
  // 此前 normalize 始终重置为默认值，用户落盘值从未生效过，作为设置项是假象。
  s.autoCheckUpdates = pickDefined(updates.autoCheck, raw.autoCheckUpdates, defaults.autoCheckUpdates);
  s.lastUpdateCheckAt = pickDefined(updates.lastCheckedAt, raw.lastUpdateCheckAt, defaults.lastUpdateCheckAt);
  s.availableUpdate = pickDefined(updates.available, raw.availableUpdate, defaults.availableUpdate);
  s.lastUpdateError = pickDefined(updates.lastError, raw.lastUpdateError, defaults.lastUpdateError);
  s.installedUpdateVersion = pickDefined(updates.installedVersion, raw.installedUpdateVersion, defaults.installedUpdateVersion);

  // Prompt 模板管理：每种内置模式各有一个 builtin 模板（prompt 留空表示用内置 MERGE_PROMPTS），
  // 用户可在此基础上新建变体。从旧的 polishPromptX 字段迁移：
  // 若旧字段非空且尚无对应 builtin，则保留为 builtin 的覆盖文本
  const tplBag = isRecord(raw.promptTemplates) ? raw.promptTemplates : {};
  const activeBag = isRecord(raw.activeTemplateByMode) ? raw.activeTemplateByMode : {};
  const PROMPT_MODES = ["learning", "interview", "meeting", "seminar", "huddle", "monologue", "recruit"];
  s.promptTemplates = {};
  s.activeTemplateByMode = {};
  for (const m of PROMPT_MODES) {
    const builtinId = "builtin-" + m;
    const legacyKey = "polishPrompt" + m.charAt(0).toUpperCase() + m.slice(1);
    const legacyText = pickDefined(raw[legacyKey], "");
    // 收集该 mode 下已存在的所有模板
    const existingForMode = Object.values(tplBag).filter(t => t && t.mode === m);
    let builtin = existingForMode.find(t => t.id === builtinId);
    if (!builtin) {
      builtin = {
        id: builtinId,
        mode: m,
        name: "默认（内置）",
        prompt: legacyText || "",
        isBuiltin: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      // 已有 builtin：尊重保存的字段，但若 prompt 为空且 legacy 有值，迁回
      if (!builtin.prompt && legacyText) builtin.prompt = legacyText;
    }
    s.promptTemplates[builtin.id] = builtin;
    // 把同 mode 的非 builtin 也合并进来
    for (const t of existingForMode) {
      if (!t.id || t.id === builtinId) continue;
      s.promptTemplates[t.id] = Object.assign(
        { id: t.id, mode: m, name: t.name || "未命名", prompt: t.prompt || "", isBuiltin: false, createdAt: t.createdAt || new Date().toISOString(), updatedAt: t.updatedAt || new Date().toISOString() },
        t
      );
    }
    // active id：优先用持久化的，其次 builtin
    const savedActive = activeBag[m];
    if (savedActive && s.promptTemplates[savedActive]) s.activeTemplateByMode[m] = savedActive;
    else s.activeTemplateByMode[m] = builtin.id;
  }
  // 把不属于内置模式的模板也保留下来（不丢用户数据）。带 customMode 的模板会成为可直接调用的自定义模式。
  for (const id of Object.keys(tplBag)) {
    const t = tplBag[id];
    if (!t || !t.id) continue;
    if (!s.promptTemplates[id]) s.promptTemplates[id] = t;
  }
  for (const id of Object.keys(s.promptTemplates)) {
    const t = s.promptTemplates[id];
    if (!isCustomPromptModeTemplate(t)) continue;
    if (!t.name) t.name = "自定义提示词";
    if (!t.baseMode || !MODE_META[t.baseMode] || t.baseMode === "off") t.baseMode = "learning";
    t.mode = t.id;
    t.customMode = true;
    s.activeTemplateByMode[t.id] = t.id;
  }

  return s;
}

function serializeLexVoiceSettings(s) {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    storage: {
      recordingLibraryPath: s.audioFolder,
      briefingNotePath: s.mdFolder,
      meetingMaterialPath: s.meetingMaterialsFolder || DEFAULT_SETTINGS.meetingMaterialsFolder,
      htmlReportPath: s.htmlReportFolder,
      htmlSlidePath: s.htmlSlideFolder,
      pptxPath: s.pptxSlideFolder,
      inboxPath: s.inboxFolder,
      autoImportInbox: s.inboxAutoImport,
      archiveSubfolder: s.inboxArchiveSubfolder,
      syncQuietMs: s.inboxStabilizeDelayMs,
      segmentCachePath: s.segmentCacheFolder,
    },
    noteNaming: {
      sessionPattern: s.noteFileNameFormatNew,
      openAfterFinish: s.autoOpenNoteAfterFinish,
      renameWithTitle: s.autoRenameWithTitle,
      consolidatedLayout: s.consolidatedLayout,
    },
    capture: {
      sourceMode: s.captureMode,
      virtualDeviceId: s.selectedVirtualDevice,
      microphoneDeviceId: s.selectedMicrophoneDevice,
      liveSegmentsEnabled: s.enableInterimOutput,
      segmentMinutes: s.segmentIntervalMinutes,
      keepSegmentAudioFiles: s.keepSegmentAudioFiles === true,
      discardVeryShortRecordings: s.filterShortRecordings !== false,
    },
    speech: {
      activeProviderId: s.activeTranscribeProvider,
      compatEndpoint: s.transcribeEndpoint,
      compatApiKey: s.transcribeApiKey,
      compatModel: s.transcribeModel,
      compatLanguage: s.transcribeLanguage,
      asrConcurrency: normalizeAsrConcurrency(s.asrConcurrency),
      providers: s.transcribeProviders || {},
    },
    composer: {
      endpoint: s.llmEndpoint,
      apiKey: s.llmApiKey,
      model: s.llmModel,
      servicePreset: s.llmServicePreset,
      profiles: normalizeLlmProfiles(s.llmProfiles),
      activeProfile: s.activeLlmProfile || "",
      defaultMode: s.polishMode,
      modePromptOverrides: {
        interview: s.polishPromptInterview || "",
        meeting: s.polishPromptMeeting || "",
        huddle: s.polishPromptHuddle || "",
        seminar: s.polishPromptSeminar || "",
        monologue: s.polishPromptMonologue || "",
        learning: s.polishPromptLearning || "",
        recruit: s.polishPromptRecruit || "",
      },
      structureLevel: s.briefingStructureLevel || "balanced",
      repolishPreferencePromptAddendum: s.repolishPreferencePromptAddendum || "",
      repolishPreference: s.repolishPreference || "",
      languagePolicy: {
        mode: s.briefingTranslationMode || "off",
        targetLanguage: s.briefingTargetLanguage || "zh-CN",
        customLanguage: s.briefingCustomLanguage || "",
        keepOriginalTerms: s.briefingKeepOriginalTerms !== false,
        extraInstruction: s.briefingLanguageInstruction || "",
      },
      industryProfile: s.industryProfile || {},
    },
    presentation: {
      slideRange: s.pptSlideRange || "6-10",
      promptAddendum: s.pptPromptAddendum || "",
      openHtmlReportAfterGenerate: s.autoOpenHtmlReportAfterGenerate !== false,
      openHtmlSlideAfterGenerate: s.autoOpenHtmlSlideAfterGenerate !== false,
      reportBrandName: s.reportBrandName || "",
    },
    vocabulary: {
      inlineTerms: s.customVocabulary || "",
      notePath: s.vocabularyFile || "",
      peopleFolder: s.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder,
      peopleBasePath: s.peopleBaseFile || DEFAULT_SETTINGS.peopleBaseFile,
      learningCardsFolder: s.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder,
      todoCardsFolder: s.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder,
      peopleContextMode: normalizePeopleContextMode(s.peopleContextMode),
      peopleHotwordsConsentAt: s.peopleHotwordsConsentAt || "",
      peopleSuggestionIgnores: normalizePeopleSuggestionIgnores(s.peopleSuggestionIgnores),
      peopleSuggestionCache: normalizePeopleSuggestionCache(s.peopleSuggestionCache),
      extractionHistory: normalizeKnowledgeExtractionHistory(s.knowledgeExtractionHistory),
    },
    views: {
      baseFolder: s.lexVoiceBasesFolder || DEFAULT_SETTINGS.lexVoiceBasesFolder,
    },
    liveOutline: {
      enabled: s.enableRealtimeOutline,
      debounceMs: s.realtimeOutlineDebounceMs,
      openOnCapture: s.autoOpenOutlineOnRecord,
    },
    dailyNote: {
      meetingOverviewEnabled: s.writeDailyMeetingOverview !== false,
      meetingOverviewHeading: s.dailyMeetingOverviewHeading || DEFAULT_SETTINGS.dailyMeetingOverviewHeading,
      meetingOverviewTemplate: s.dailyMeetingOverviewTemplate || DEFAULT_SETTINGS.dailyMeetingOverviewTemplate,
    },
    retryPolicy: {
      maxAttempts: s.maxRetries,
    },
    diagnostics: {
      enabled: s.diagnosticsLogEnabled !== false,
      folder: s.diagnosticsLogFolder || DEFAULT_SETTINGS.diagnosticsLogFolder,
    },
    ui: {
      floatingControlEnabled: s.showFloatingBall,
      floatingControlPosition: s.floatingBallPos || {},
    },
    recruiting: {
      context: s.recruitContext || {},
      askBeforeCapture: s.recruitAlwaysAskOnStart,
      contextLibrary: Array.isArray(s.recruitContextLibrary) ? s.recruitContextLibrary : [],
      unlocked: !!s.recruitFeatureUnlocked,
      jdFolder: s.recruitJdFolderPath || "JD",
      resumeFolder: s.recruitResumeFolderPath || "简历",
      desensitize: s.recruitResumeDesensitize !== false,
      homepage: s.recruitHomepagePath || "",
    },
    updates: {
      autoCheck: s.autoCheckUpdates !== false,
      lastCheckedAt: s.lastUpdateCheckAt || null,
      available: s.availableUpdate || null,
      lastError: s.lastUpdateError || "",
      installedVersion: s.installedUpdateVersion || "",
    },
    promptTemplates: s.promptTemplates || {},
    activeTemplateByMode: s.activeTemplateByMode || {},
  };
}

function extractLexVoiceJobItems(savedData) {
  const saved = isRecord(savedData) ? savedData : {};
  if (saved.backgroundJobs && Array.isArray(saved.backgroundJobs.items)) return saved.backgroundJobs.items;
  if (saved.jobs && Array.isArray(saved.jobs.items)) return saved.jobs.items;
  if (Array.isArray(saved.queue)) return saved.queue;
  return [];
}



// 更新源固定指向官方仓库。曾是设置项，但 normalize 始终把它们重置为默认值（用户值从未生效），
// 实为常量装成设置，故收编为模块常量；自定义更新源如有真实需求应连同 UI 一起正式设计。



function joinUpdateUrl(rawBase, fileName) {
  return rawBase.replace(/\/+$/g, "") + "/" + fileName.replace(/^\/+/g, "");
}

async function fetchUpdateText(url) {
  const errors = [];
  if (obsidian.requestUrl) {
    try {
      const res = await obsidian.requestUrl({
        url,
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error("HTTP " + res.status + " · " + url);
      }
      return res.text;
    } catch (e) {
      errors.push("requestUrl: " + ((e && e.message) || e));
    }
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText + " · " + url);
    return await res.text();
  } catch (e) {
    errors.push("fetch: " + ((e && e.message) || e));
  }
  throw new Error(errors.join("；"));
}

async function fetchUpdateJson(url) {
  return JSON.parse(await fetchUpdateText(url));
}

async function fetchUpdateTextFromSources(rawBases, fileName) {
  const errors = [];
  for (const rawBase of rawBases || []) {
    const url = joinUpdateUrl(rawBase, fileName) + "?t=" + Date.now();
    try {
      const text = await fetchUpdateText(url);
      return { text, rawBaseUrl: rawBase, url };
    } catch (e) {
      errors.push(rawBase + " -> " + ((e && e.message) || e));
    }
  }
  throw new Error("所有更新源都不可用：" + errors.join(" | "));
}



function updateBackupStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureAdapterFolder(adapter, folderPath) {
  const parts = obsidian.normalizePath(folderPath).split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur = cur ? cur + "/" + part : part;
    if (!(await adapter.exists(cur))) await adapter.mkdir(cur);
  }
}


// 用户面内置业务意图（recruit 走彩蛋解锁）。内部 key 保留旧字符串以避免迁移破坏老笔记 / tag / base 文件；
// huddle 是 meeting 的子风格，不再单列在新建录音下拉，但老 huddle 笔记仍能被识别和打开。

// 新建录音下拉里出现的公开意图 + 1 个彩蛋；huddle 不出现（仅旧笔记兜底使用）












function legacyPromptFieldForMode(mode) {
  const map = {
    interview: "polishPromptInterview",
    meeting: "polishPromptMeeting",
    huddle: "polishPromptHuddle",
    seminar: "polishPromptSeminar",
    monologue: "polishPromptMonologue",
    learning: "polishPromptLearning",
    recruit: "polishPromptRecruit",
  };
  return map[mode] || "";
}




// 结构化程度三档 —— 控制主体内容的层级深度
// LexVoice 视图（.base 文件）—— 默认创建到 LexVoice/视图/{按模式,场景}/ 目录下，可在设置里修改。
function getLexVoiceBasesFolder(settings) {
  return obsidian.normalizePath((settings && settings.lexVoiceBasesFolder) || DEFAULT_SETTINGS.lexVoiceBasesFolder || "LexVoice/视图");
}

const LEARNING_WALL_FILE = "学习卡片瀑布墙.md";
const CONCEPT_WALL_FILE = "概念墙.md";
const TODO_WALL_FILE = "待办墙.md";

function getLexVoiceWallPath(settings, fileName) {
  const folder = getLexVoiceBasesFolder(settings);
  return obsidian.normalizePath(folder + "/" + fileName);
}

function formatLexVoiceWallMarkdown(title, folder, tag, emptyText) {
  const folderQuery = JSON.stringify('"' + obsidian.normalizePath(folder || "") + '"');
  const tagQuery = JSON.stringify("#" + String(tag || "").replace(/^#/, ""));
  return [
    "---", "cssclasses:", "  - lvwall-page", "---", "", "# " + title, "", "```dataviewjs",
    "const root = dv.el(\"div\", \"\", { cls: \"lvwall\" });",
    "const folderQuery = " + folderQuery + ";",
    "const targetTag = " + tagQuery + ";",
    "const esc = s => String(s ?? \"\").replace(/[&<>\\\"]/g, c => c === \"&\" ? \"&amp;\" : c === \"<\" ? \"&lt;\" : c === \">\" ? \"&gt;\" : \"&quot;\");",
    "function columnCount(width){ if (width >= 1320) return 4; if (width >= 960) return 3; if (width >= 620) return 2; return 1; }",
    "function layoutWidth(){ const selectors = [\".workspace-leaf-content\", \".view-content\", \".markdown-preview-view\", \".markdown-reading-view\", \".markdown-source-view\"]; const nodes = selectors.map(sel => root.closest(sel)).filter(Boolean); nodes.push(root.parentElement, root); for (const node of nodes) { const rect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null; const width = Math.floor(Math.max(node && node.clientWidth || 0, rect && rect.width || 0)); if (width > 120) return width; } return window.innerWidth || 0; }",
    "function cardWeight(card){ return 10 + card.title.length * 1.5 + card.sum.length * 0.38 + card.src.length * 0.18 + card.tagCount * 3; }",
    "const pages = dv.pages(folderQuery).where(p => (p.file.tags || []).includes(targetTag)).sort(p => p.file.ctime, \"desc\");",
    "const cards = [];",
    "for (const p of pages) {",
    "  const type = esc(p[\"卡片类型\"] || p[\"类型\"] || p[\"状态\"] || \"卡片\");",
    "  const title = esc(p[\"标题\"] || p[\"事项\"] || p.file.name);",
    "  const sum = esc(p[\"摘要\"] || p[\"说明\"] || p[\"任务\"] || p[\"事项\"] || \"\");",
    "  const srcR = p[\"来源笔记\"] || p[\"来源\"]; let src = \"\";",
    "  if (srcR) src = esc(String(srcR.path ?? srcR).split(\"/\").pop().replace(/\\.md$|[\\[\\]]/g, \"\"));",
    "  const rawTags = p.file.tags || [];",
    "  const tags = rawTags.map(t => '<span class=\\\"lvwall-tag\\\">' + esc(String(t).replace(/^#/, \"\")) + '</span>').join(\"\");",
    "  const ct = p.file.ctime ? p.file.ctime.toFormat(\"yyyy-MM-dd HH:mm\") : \"\";",
    "  const html = '<div class=\\\"lvwall-card\\\" data-path=\\\"' + esc(p.file.path) + '\\\">' + '<div class=\\\"lvwall-head\\\"><span class=\\\"lvwall-type\\\">' + type + '</span><span class=\\\"lvwall-brand\\\">LEXVOICE CARD</span></div>' + '<div class=\\\"lvwall-title\\\">' + title + '</div>' + (sum ? '<div class=\\\"lvwall-k\\\">摘要</div><div class=\\\"lvwall-sum\\\">' + sum + '</div>' : '') + (src ? '<div class=\\\"lvwall-k\\\">来源</div><div class=\\\"lvwall-src\\\">' + src + '</div>' : '') + (tags ? '<div class=\\\"lvwall-tags\\\">' + tags + '</div>' : '') + (ct ? '<div class=\\\"lvwall-time\\\">' + ct + '</div>' : '') + '</div>';",
    "  cards.push({ html, title, sum, src, tagCount: rawTags.length });",
    "}",
    "let lastCols = 0; let raf = 0;",
    "function bindCards(){ root.querySelectorAll(\".lvwall-card\").forEach(el => el.addEventListener(\"click\", () => app.workspace.openLinkText(el.dataset.path, \"\", false))); }",
    "function renderWall(){",
    "  const width = layoutWidth();",
    "  const cols = columnCount(width);",
    "  root.style.setProperty(\"--lvwall-columns\", String(cols));",
    "  root.style.setProperty(\"--lvwall-gutter\", (width < 680 ? 18 : 24) + \"px\");",
    "  if (!cards.length) { root.classList.add(\"is-empty\"); root.innerHTML = " + JSON.stringify("<p>" + emptyText + "</p>") + "; return; }",
    "  root.classList.remove(\"is-empty\");",
    "  const buckets = Array.from({ length: cols }, () => ({ weight: 0, html: \"\" }));",
    "  for (const card of cards) {",
    "    let target = 0;",
    "    for (let i = 1; i < buckets.length; i++) if (buckets[i].weight < buckets[target].weight) target = i;",
    "    buckets[target].html += card.html;",
    "    buckets[target].weight += cardWeight(card);",
    "  }",
    "  root.innerHTML = buckets.map(b => '<div class=\\\"lvwall-col\\\">' + b.html + '</div>').join(\"\");",
    "  bindCards();",
    "  lastCols = cols;",
    "}",
    "function scheduleLayout(){",
    "  if (raf) cancelAnimationFrame(raf);",
    "  raf = requestAnimationFrame(() => {",
    "    raf = 0;",
    "    const width = layoutWidth();",
    "    const cols = columnCount(width);",
    "    root.style.setProperty(\"--lvwall-columns\", String(cols));",
    "    root.style.setProperty(\"--lvwall-gutter\", (width < 680 ? 18 : 24) + \"px\");",
    "    if (cols !== lastCols) renderWall();",
    "  });",
    "}",
    "renderWall();",
    "if (typeof ResizeObserver !== \"undefined\") { const ro = new ResizeObserver(scheduleLayout); [root, root.parentElement, root.closest(\".markdown-preview-view\"), root.closest(\".markdown-reading-view\"), root.closest(\".markdown-source-view\"), root.closest(\".view-content\"), root.closest(\".workspace-leaf-content\")].filter(Boolean).forEach(el => ro.observe(el)); }",
    "window.addEventListener(\"resize\", scheduleLayout, { passive: true });",
    "```", "",
  ].join("\n");
}
function formatLearningWallMarkdown(settings) {
  return formatLexVoiceWallMarkdown("学习卡片瀑布墙", settings && settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder, LEARNING_CARD_TAG, "没有找到学习卡片。完成学习类纪要后，可从信息提取面板保存学习卡片。");
}

function formatConceptWallMarkdown(settings) {
  const root = settings && settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder;
  return formatLexVoiceWallMarkdown("概念墙", root, CONCEPT_CARD_TAG, "没有找到概念卡片。会中用 #概念 标记或从学习纪要中提取概念后，会出现在这里。");
}

function formatTodoWallMarkdown(settings) {
  return formatLexVoiceWallMarkdown("待办墙", settings && settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder, TODO_CARD_TAG, "没有找到待办卡片。会议纪要中的明确行动项可在确认后沉淀为待办卡片。");
}

const LV_BASE_DEFINITIONS = [
  // —— 按模式 ——
  {
    relPath: "按模式/所有会议.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice/meeting")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.主题:
    displayName: 主题
  note.参会人:
    displayName: 参会人
  note.tags:
    displayName: 标签
views:
  - type: table
    name: 列表
    order:
      - file.name
      - note.time
      - note.主题
      - note.参会人
      - note.tags
    sort:
      - property: note.time
        direction: DESC
`,
  },
  {
    relPath: "按模式/内部小会.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice/huddle")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.议题:
    displayName: 议题
  note.当事人:
    displayName: 当事人
  note.参谋:
    displayName: 参谋
views:
  - type: table
    name: 列表
    order:
      - file.name
      - note.time
      - note.议题
      - note.当事人
      - note.参谋
    sort:
      - property: note.time
        direction: DESC
`,
  },
  {
    relPath: "按模式/所有访谈.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice/interview")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.主题:
    displayName: 主题
  note.受访者:
    displayName: 受访者
  note.访问者:
    displayName: 访问者
views:
  - type: table
    name: 列表
    order:
      - file.name
      - note.time
      - note.主题
      - note.受访者
      - note.访问者
    sort:
      - property: note.time
        direction: DESC
`,
  },
  {
    relPath: "按模式/招聘面试.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice/recruit")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.候选人:
    displayName: 候选人
  note.应聘岗位:
    displayName: 岗位
  note.轮次:
    displayName: 轮次
  note.录用建议:
    displayName: 录用建议
views:
  - type: table
    name: 列表
    order:
      - file.name
      - note.time
      - note.候选人
      - note.应聘岗位
      - note.轮次
      - note.录用建议
    sort:
      - property: note.time
        direction: DESC
  - type: table
    name: 强烈推荐
    filters:
      and:
        - note.录用建议 == "强烈推荐"
    order:
      - file.name
      - note.time
      - note.候选人
      - note.应聘岗位
      - note.轮次
  - type: table
    name: 推荐
    filters:
      and:
        - note.录用建议 == "推荐"
    order:
      - file.name
      - note.time
      - note.候选人
      - note.应聘岗位
      - note.轮次
  - type: table
    name: 倾向不推荐
    filters:
      or:
        - note.录用建议 == "倾向不推荐"
        - note.录用建议 == "倾向不推荐（条件性）"
    order:
      - file.name
      - note.time
      - note.候选人
      - note.应聘岗位
      - note.轮次
`,
  },
  {
    relPath: "按模式/独白手记.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice/monologue")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.主题:
    displayName: 主题
views:
  - type: table
    name: 列表
    order:
      - file.name
      - note.time
      - note.主题
    sort:
      - property: note.time
        direction: DESC
`,
  },

  // —— 场景 ——
  {
    relPath: "场景/本周纪要.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice")
    - date(note.time) >= date("today") - "7 days"
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.mode:
    displayName: 模式
  note.主题:
    displayName: 主题
  note.tags:
    displayName: 标签
views:
  - type: table
    name: 本周
    order:
      - file.name
      - note.time
      - note.mode
      - note.主题
      - note.tags
    sort:
      - property: note.time
        direction: DESC
`,
  },
  {
    relPath: "场景/招聘看板.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice/recruit")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.候选人:
    displayName: 候选人
  note.应聘岗位:
    displayName: 岗位
  note.轮次:
    displayName: 轮次
  note.录用建议:
    displayName: 建议
  note.tags:
    displayName: 主题词
views:
  - type: table
    name: 全部候选人
    order:
      - file.name
      - note.time
      - note.候选人
      - note.应聘岗位
      - note.轮次
      - note.录用建议
      - note.tags
    sort:
      - property: note.time
        direction: DESC
  - type: cards
    name: 卡片视图
    order:
      - note.候选人
      - note.应聘岗位
      - note.轮次
      - note.录用建议
      - note.time
`,
  },
  {
    relPath: "场景/决策与待办.base",
    yaml: `filters:
  or:
    - file.hasTag("lexvoice/meeting")
    - file.hasTag("lexvoice/huddle")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.mode:
    displayName: 类型
  note.主题:
    displayName: 主题
  note.议题:
    displayName: 议题
  note.参会人:
    displayName: 参会人
  note.当事人:
    displayName: 当事人
  note.tags:
    displayName: 标签
views:
  - type: table
    name: 列表
    order:
      - file.name
      - note.time
      - note.mode
      - note.主题
      - note.议题
      - note.参会人
      - note.当事人
      - note.tags
    sort:
      - property: note.time
        direction: DESC
`,
  },
  {
    relPath: "场景/全部纪要总览.base",
    yaml: `filters:
  and:
    - file.hasTag("lexvoice")
properties:
  file.name:
    displayName: 笔记
  note.time:
    displayName: 时间
  note.mode:
    displayName: 模式
  note.主题:
    displayName: 主题
  note.议题:
    displayName: 议题
  note.候选人:
    displayName: 候选人
  note.tags:
    displayName: 主题词
views:
  - type: table
    name: 全部
    order:
      - file.name
      - note.time
      - note.mode
      - note.主题
      - note.议题
      - note.候选人
      - note.tags
    sort:
      - property: note.time
        direction: DESC
`,
  },
];



function buildStructureLevelInstruction(level) {
  return STRUCTURE_LEVEL_INSTRUCTIONS[level] || STRUCTURE_LEVEL_INSTRUCTIONS.balanced;
}

// 各模式的 YAML frontmatter schema —— LLM 必须按此 schema 输出
// Frontmatter schema —— 字段名优先用中文（除 mode 程序识别 / tags Obsidian 约定）
// 角色相关字段（受访者 / 访问者 / 参会人 / 当事人 / 参谋 / 候选人 / 面试官）
// 用户后期可手动改成"代号 → 真名"形式，触发"重新整理"时插件会按映射替换正文里的代号

function buildPrompt(modeBody, isMerged, modeKey) {
  const inputDesc = isMerged
    ? `分段转写（含 \`===SEG N (MM:SS-MM:SS)===\` 分隔符，请先合并并抹平段切点处的断句）`
    : `原始转写文本`;
  const fmSchema = FRONTMATTER_SCHEMA[modeKey] || "";
  const frontmatterSection = fmSchema
    ? `**输出文件必须以 YAML frontmatter 开头**，仅包含以下精简字段（不要添加任何其他字段——\`mode\`/\`time\`/\`时长\`/\`状态\`/\`tags\`/\`人物\` 由插件自动注入，**LLM 不要输出**；也不要输出 \`date\`/\`日期\`/\`location\`/\`decision\`/\`decisions\`/\`todos\`/\`type\`/\`status\`/\`people\`）：

\`\`\`yaml
---
${fmSchema}
---
\`\`\`

填入真实值；转写未提及的字段写 "未提及"，不要编造。frontmatter 后空一行，再开始 Markdown 内容。

**末尾必须输出两条机器注释**（不会渲染显示，供插件回写 frontmatter）：先输出人员、再输出标签；如果后面还有其它机器块，放在这两条之后：

\`\`\`html
<!-- lexvoice-people: 张三, 李四 -->
<!-- lexvoice-tags: 主题/招聘流程, 主题/AI转型, 项目/晋升提名, 公司/示例科技, 行业/HR -->
\`\`\`

**lexvoice-people**：本纪要中**确实出现或被点名**的关键人名（真实姓名或明确角色称呼），逗号分隔，0–6 个；只写转写里真实出现的，不带任何前缀，会写进独立的 \`人物\` 属性。⚠️**上面示例里的"张三/李四"只是占位格式，绝对不要照抄进结果；转写里没有明确人名时，这条注释整行留空（\`<!-- lexvoice-people: -->\`）或不输出——宁可没有，也不要编造或套用任何示例名。**

**lexvoice-tags**：多维度中文 nested 标签，每个用「中文前缀 + 斜杠 + 具体词」，让 Obsidian 标签面板按维度自动分组。维度只剩 4 个（**人物已单列到 lexvoice-people，这里绝不要再写 \`人物/x\`**）：

- **主题** ✅ 必填（3–5 个）：核心议题或讨论领域。例 \`主题/招聘流程\`、\`主题/AI转型\`、\`主题/组织设计\`、\`主题/晋升机制\`
- **项目**（按需，0–3 个）：转写中明确出现的专有项目名。例 \`项目/晋升提名\`、\`项目/Q2交付\`
- **公司**（按需，0–2 个）：公司或组织名（必须明确出现）。例 \`公司/示例科技\`、\`公司/示例集团\`
- **行业**（可选，0–1 个）：行业或职能领域。例 \`行业/HR\`、\`行业/游戏\`

**硬性要求**：

- lexvoice-tags 总数 4–9 个，主题维度至少 3 个
- 每个 tag 的"具体词"部分 ≤6 个汉字，避免空格和标点（"AI转型" 而非 "AI 转型"）
- 不要重复 mode 字段语义（**禁止** 输出 \`主题/招聘面试\`、\`主题/会议\`、\`主题/访谈\` 这类与 mode 重复的词）
- 转写中**没明确出现**的项目/公司/人物**一律不写**，不要编造
- 优先具体词（"招聘漏斗指标" 而非 "招聘"；"晋升提名项目" 而非 "项目"）
- 系统标签 \`lexvoice/<mode>\` 由代码自动注入，**不要在标签建议里重复**
`
    : "";
  return `你是录音整理助手。输入是一段${inputDesc}。按下方规则生成纪要。

**【最高优先级 · 忠实还原】**：本工具第一职责是"还原"——把录音里真实说过的信息完整、准确地整理出来。下面所有关于"提炼/概括/精炼/结构化/合并"的要求，都只是让纪要更易读的手段，任何时候都不得凌驾于"还原"之上。当"写得更短/更结构化"与"保留某条具体信息"冲突时，一律保留信息；拿不准某内容是否重要时，保留而非删除。不编造与不缺漏同等重要，二者都是不可逾越的底线。

**篇幅原则**：所有句数、字数、条数都只是常规材料的写作基准，不是上限。请根据录音时长、信息密度和主题数量机动扩展；宁可让主体内容更完整，也不要为了凑短摘要而漏掉关键事实、论证、概念、决策、待办或风险。顶部摘要保持可扫读，主体内容必须覆盖完整材料，不要只整理开头或少数高频片段。

${frontmatterSection}**整体结构原则**：顶部用 callout 做结构化速览（摘要、必要时的决策清单/录用建议），**主体内容贴近原文按实际推进顺序展开**——用三级标题 + 散文段落叙述，不强行套"讨论要点 / 分歧 / 暂行结论"等模板框。关键判断引用用普通 \`> \` blockquote 即可，不要为每个话题再套 callout。

**待办任务语法**：凡是正文中出现待办 / 行动项 / 下一步，请统一使用 Markdown todo 任务列表，不要用表格、普通项目符号或 \`TODO:\` 前缀。格式：\`- [ ] 责任人：<人> 事项：<具体动作> 截止：<时间>\`；如果位于 callout 内，保留引用前缀写成 \`> - [ ] ...\`。无法判断责任人或截止时间时写「未提及」，不要编造。

**回听锚点**：如果输入分段标题中出现形如 \`[[音频文件|时间]]\` 的 Obsidian 音频链接，可以把对应链接复制到主要小节标题或关键原话后面，作为回听入口。只在内容明显来自该分段时添加；不确定就不加。不要编造音频文件名、时间或链接；每个主要小节最多放 1 个锚点，避免满屏链接。

**Callout 使用纪律**（仅以下场景用 callout，其他一律散文叙述）：
- \`> [!info]\` 仅在具体模式模板已经给出信息卡时使用；工作纪要模式不要新增元数据卡片
- \`> [!abstract]\` 顶部摘要散文
- \`> [!success]\` / \`> [!important]\` 顶部决策清单或一句话定调（仅必要时）
- \`> [!summary]\` 招聘模式专属置顶「面试评价」
- \`> [!ai-eval]\` 招聘模式专属 AI 评价
- \`> [!check]\` 招聘模式专属「重点考核项核验」（仅当上下文标注了特殊关注点时）
- \`> [!tip]\` 模式不匹配的软建议
- \`> [!question]\` 悬而未决/待澄清（仅在出现时）
- 其他正文一律不用 callout
- 连续 callout 之间必须保留两个引用空行：上一块结束后写两行单独的 \`>\`，再写下一个 \`> [!type]\`，避免 Obsidian 把多个 callout 合并成一个块

**主体内容写作要求**（**还原优先，提炼为辅**——结构化是为了让人读懂，不是为了变短）：
- 把讨论的逻辑层级**结构化**呈现：议题/主论点 → 支撑（事实、案例、数据、异议）→ 关键细节
- 按讨论实际推进的脉络组织（不预设议程），但每个话题内部要做层级提炼
- 关键判断或具有信号量的原话用 \`> "<原话>"\` 引用
- **只做无损整理**：可以去口头禅、去语气词、把同一句话的重复表述合并为一次；但凡承载事实、数字、判断、立场、例子、时间、人名、待办或风险的内容，一律保留，**不得以"概括""提炼""合并"为名删除任何一条具体信息**
- 拿不准是否重要的内容，**一律保留**而不是删除——宁可让纪要长一点，也不要让用户觉得有遗漏
- 议题间存在归并关系时，用一句话 cross-reference，不重复叙述

{{STRUCTURE_INSTRUCTION}}

${modeBody}

${SHARED_DISCIPLINE}

---

转写：
{{TRANSCRIPT}}`;
}








const POLISH_PROMPTS = {
  learning: buildPrompt(MODE_BODIES.learning, false, "learning"),
  interview: buildPrompt(MODE_BODIES.interview, false, "interview"),
  meeting: buildPrompt(MODE_BODIES.meeting, false, "meeting"),
  seminar: buildPrompt(MODE_BODIES.seminar, false, "seminar"),
  huddle: buildPrompt(MODE_BODIES.huddle, false, "huddle"),
  monologue: buildPrompt(MODE_BODIES.monologue, false, "monologue"),
  recruit: buildPrompt(MODE_BODIES.recruit, false, "recruit"),
};




const MERGE_PROMPTS = {
  learning: buildPrompt(MODE_BODIES.learning, true, "learning"),
  interview: buildPrompt(MODE_BODIES.interview, true, "interview"),
  meeting: buildPrompt(MODE_BODIES.meeting, true, "meeting"),
  seminar: buildPrompt(MODE_BODIES.seminar, true, "seminar"),
  huddle: buildPrompt(MODE_BODIES.huddle, true, "huddle"),
  monologue: buildPrompt(MODE_BODIES.monologue, true, "monologue"),
  recruit: buildPrompt(MODE_BODIES.recruit, true, "recruit"),
};

// 实时大纲：归并到共同上层概念，层级由内容涌现，不强加结构
const REALTIME_OUTLINE_MAX_SEGMENTS = 10;
const REALTIME_OUTLINE_MAX_TRANSCRIPT_CHARS = 6000;
const REALTIME_OUTLINE_MAX_PREVIOUS_CHARS = 1200;
const REALTIME_OUTLINE_MAX_MEMORY_CHARS = 800; // 与 prompt 的"memory ≤600字"对齐(留余量)，省 token、不稀释前缀缓存
const REALTIME_OUTLINE_MIN_NEW_SEGMENTS = 2;
const REALTIME_OUTLINE_MIN_NEW_CHARS = 200;
const REALTIME_OUTLINE_MIN_SILENT_INTERVAL_MS = 30000;
const REALTIME_OUTLINE_SILENT_TIMEOUT_MS = 35000;
const REALTIME_OUTLINE_MANUAL_TIMEOUT_MS = 45000;
const REALTIME_OUTLINE_FINAL_TIMEOUT_MS = 45000;
// 大纲 max_tokens 分档（按总纲："最终那次该说完不为省钱截断"）：
// - silent：控制延迟，保持适度上限；长会真正需要内容时由 manual / final 那次补足
// - final / manual：用户停止录音后那一次，必须把完整大纲跑全，不被实时档预算连累
// silent 提到 1600：全窗口重新综合 + 每个 L1 带 2-4 子要点需要更多输出空间，
// 1000 会让模型在子要点处被截断、退化成只剩一级标题（丢灵魂）。
const REALTIME_OUTLINE_SILENT_MAX_TOKENS = 1600;
const REALTIME_OUTLINE_FINAL_MAX_TOKENS = 2400;
const REALTIME_OUTLINE_FAILURE_BACKOFF_BASE_MS = 30000;
const REALTIME_OUTLINE_FAILURE_BACKOFF_MAX_MS = 5 * 60 * 1000;
const MEETING_INTERACTION_OUTLINE_MAX_CHARS = 1200;
const MEETING_INTERACTION_MEMORY_MAX_CHARS = 800;
const MEETING_INTERACTION_SEGMENT_MAX_CHARS = 700;
const MEETING_INTERACTION_TIMEOUT_MS = 35000;
// 即时问答 max_tokens 按触发符分档（按总纲："够用不截"）：
// - ?问题：直接回答，短句 5 条；轻度放宽
// - !重点：说明保留理由 + 在最终纪要中如何处理；中档
// - #概念：定义 + 用法 + 上下位 + 在当前讨论里的意义；最容易被截断，最大档
const MEETING_INTERACTION_MAX_TOKENS = 320;
const MEETING_INTERACTION_CONCEPT_MAX_TOKENS = 700;
const MEETING_INTERACTION_IMPORTANT_MAX_TOKENS = 500;

// 最终纪要（merge）max_tokens：按内容长度自适应放大「期望值」，再用「当前模型的安全输出上限」钳制。
// 之前固定封顶 8000 是基于过时认知（以为各家上限都 ≈8192）。实测现行上限：DeepSeek V4 系列 384K、
// Claude Opus/Fable 128K、Sonnet 64K、GPT-4o 16K；旧 DeepSeek-V3/chat、Claude 3.5 才是 8192。
// 策略：期望值按长度分档放大，但绝不拉满模型上限——按已知上限留 ~15% 冗余取一个安全值，
// 既让大模型的长会能产出完整纪要，又不会在小/旧模型上把 max_tokens 设过头被 API 拒成 400。
// 真正超长、单次仍装不下的会议由分段整理+拼接兜底（见 mergeAndPolishLongSession），不靠无限抬上限。
// 未知/本地模型保守上限：很多本地或小模型真实上限只有 4096/8192，且超限多半 400。8000 是历史默认、已验证安全。

// 返回当前 LLM 的「安全可用输出上限」（已留冗余，非模型真实极限）。仅用于钳制 merge 的 max_tokens。
// 名称匹配保守：拿不准就回退到安全值，宁可少给也不要因设过头而整篇 merge 失败。

// 内容期望值（未钳制）：merge 想要多少 token 才能不截断地写完。也用来判断是否需要分段（超过模型上限即需要）。

// 实际下发的 max_tokens = min(内容期望, 模型安全上限)。第二参可传 settings 启用模型上限钳制（缺省回退安全值）。

function buildSourceAwareOutlineInstruction(captureMode, modeKey) {
  const mode = normalizeAudioInputMode(captureMode || "mic");
  if (mode === "mic") {
    return `【来源标记】
当前只录麦克风。大纲不需要额外标来源。
`;
  }
  if (mode === "virtualCable") {
    return `【来源标记】
当前只录电脑音频。若一级条目明显来自播放的视频、课程、会议远端声音，可在该一级条目前加 \`[电脑音频]\`；不要给二级条目重复标记。
`;
  }
  // mix-virtual：HR/招聘模式下，麦克风/电脑音频 直接对应 面试官/候选人，应主动打标
  if (modeKey === "recruit") {
    return `【来源标记 · 线上面试 · 主动标记】
当前录音同时包含麦克风和电脑音频。在线上面试场景里：
- \`[麦克风]\` = **面试官端**（本机说话的人，即用户自己）
- \`[电脑音频]\` = **候选人端**（远端入会的对方）

请尽量给每个一级条目前加上对应的来源标记，方便后续按角色归类。判断依据优先级：
1. 该条目主要说话角色（提问/陈述自己经历）显然来自哪一端 → 直接标
2. 内容功能（提问/追问 → 多半是面试官；陈述经历/技能/项目细节 → 多半是候选人）
3. 实在交织（两端同时说话/打断）才不标，并在条目末尾加一句 \`（双端交织）\`

不要给二级条目重复标记，也不要为了凑标记而改写事实。
`;
  }
  return `【来源标记 · 谨慎使用】
当前录音同时包含麦克风和电脑音频，但转写文本是混合后的结果。请只在内容特征明显时给一级条目前加来源标记：
- \`[麦克风]\`：用户对着麦克风说的评论、测试、提问、补充说明。
- \`[电脑音频]\`：视频、课程、播客、会议远端或电脑正在播放的内容。
无法判断、两路内容交织或只是泛化主题时，不要标记。不要给二级条目重复标记，也不要为了标记而改写事实。
`;
}

function getSessionLatestSegmentEndMs(session) {
  const segments = session && Array.isArray(session.segments) ? session.segments : [];
  let latest = 0;
  for (const s of segments) {
    const end = Number(s && (s.endOffsetMs ?? s.startOffsetMs)) || 0;
    if (end > latest) latest = end;
  }
  return latest;
}

function buildRealtimeOutlineTranscript(segments) {
  const validSegments = (segments || [])
    .filter((s) => s && s.text && String(s.text).trim())
    .map((s, i) => Object.assign({ _validIndex: i }, s));
  if (!validSegments.length) return "";
  return validSegments
    .map((s, i) => {
      const n = Number.isFinite(s.index) ? s.index + 1 : (Number(s._validIndex) || 0) + 1;
      const start = formatElapsed(s.startOffsetMs || 0);
      const end = formatElapsed(s.endOffsetMs || 0);
      const anchor = getAudioTimeLink(s.audioName, getSegmentAudioLinkOffsetMs(s));
      const meta = anchor
        ? `【段落 ${n}｜${start}-${end}｜回听 ${anchor}】`
        : `【段落 ${n}｜${start}-${end}】`;
      return `${meta}\n${String(s.text || "").trim()}`;
    })
    .join("\n\n");
}

// 增量版段落选择：默认从【上次处理到的段落之后】开始（sinceCount = session.realtimeOutlineSegmentCount），
// 避免每轮把已喂过 LLM 的段落再喂一次（浪费 token + 容易让 LLM 重写老条目造成时间戳漂移）。
//
// 兼容旧调用 selectRealtimeOutlineSegments(segments)：sinceCount 未传时回退到"末尾 maxSegments 个"，
// 行为等价于改前。
//
// 边界处理：
//   sinceCount 失效（>= valid.length）→ isIncremental=true 但 selected=[] → 上层短路（无新内容不调 LLM）
//   sinceCount=0（首次）→ 走"末尾窗口"老逻辑
//   delta 段落数过多（累积未处理）→ 仍按 maxSegments / maxChars 从尾端截，确保单次输入可控
function selectRealtimeOutlineSegments(segments, opts) {
  const cfg = opts && typeof opts === "object" ? opts : {};
  const maxSegments = Number.isFinite(Number(cfg.maxSegments)) && Number(cfg.maxSegments) > 0
    ? Number(cfg.maxSegments) : REALTIME_OUTLINE_MAX_SEGMENTS;
  const maxChars = Number.isFinite(Number(cfg.maxChars)) && Number(cfg.maxChars) > 0
    ? Number(cfg.maxChars) : REALTIME_OUTLINE_MAX_TRANSCRIPT_CHARS;
  const sinceCount = Math.max(0, Number(cfg.sinceCount) || 0);

  const valid = (segments || []).filter((s) => s && s.text && String(s.text).trim());
  // 增量模式：只取 sinceCount 之后的"新"段落；首轮（sinceCount=0）退化到老窗口逻辑
  const isIncremental = sinceCount > 0;
  const candidates = isIncremental ? valid.slice(Math.min(sinceCount, valid.length)) : valid;

  const selected = [];
  let chars = 0;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const s = candidates[i];
    const chunk = String(s.text || "").trim();
    const nextChars = chars + chunk.length;
    if (selected.length >= maxSegments) break;
    if (selected.length > 0 && nextChars > maxChars) break;
    selected.unshift(s);
    chars = nextChars;
  }
}
export default LexVoicePlugin;

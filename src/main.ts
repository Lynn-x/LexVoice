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
  return {
    segments: selected,
    usedCount: selected.length,
    omittedBeforeCount: Math.max(0, valid.length - selected.length),
    totalTextCount: valid.length,
    approxChars: chars,
    isIncremental,
    sinceCount,
    deltaTotalCount: candidates.length,
  };
}

function getRealtimeOutlineTimeoutMs(windowed, opts) {
  const chars = Math.max(0, Number(windowed && windowed.approxChars) || 0);
  let base;
  if (chars >= 5000) base = 45000;
  else if (chars >= 2500) base = 35000;
  else base = 25000;
  // 本地模型档：所有阈值 ×2。本地慢、单线程，给它充足时间把大纲跑完，
  // 不为省 token 截断（总纲："最终那次该说完"），也不让它在 45 秒内被强行 abort。
  if (opts && opts.local) base = base * 2;
  return base;
}

function clipRealtimeContextText(text, maxChars) {
  const cleaned = String(text || "").trim();
  const max = Math.max(800, Number(maxChars) || 0);
  if (cleaned.length <= max) return cleaned;
  const marker = "\n\n……（中间内容已压缩，后续以主题记忆为准）……\n\n";
  const head = Math.max(300, Math.floor((max - marker.length) * 0.58));
  const tail = Math.max(300, max - marker.length - head);
  return cleaned.slice(0, head).trimEnd() + marker + cleaned.slice(-tail).trimStart();
}

function buildRollingOutlineContext(previousMemory, previousOutline, windowed) {
  const memory = clipRealtimeContextText(previousMemory, REALTIME_OUTLINE_MAX_MEMORY_CHARS);
  const outline = clipRealtimeContextText(previousOutline, REALTIME_OUTLINE_MAX_PREVIOUS_CHARS);
  const omittedBeforeCount = Math.max(0, Number(windowed && windowed.omittedBeforeCount) || 0);
  const isIncremental = !!(windowed && windowed.isIncremental);
  const lines = [];
  lines.push("【主题记忆 / 滚动摘要】");
  if (memory) {
    lines.push(
      "下面是此前较早内容压缩后的长期记忆。它用于承接主线，不直接面向用户展示；请在本轮处理后更新它。",
      "",
      memory
    );
  } else {
    lines.push("暂无主题记忆。请根据本轮转写建立第一版主题记忆。");
  }
  if (outline) {
    lines.push(
      "",
      "【当前可见大纲 · 不可改动 · 这是已生效的事实】",
      // 增量模式（有 previousOutline + windowed.isIncremental）：明确禁止重写老条目。
      // 首轮模式（无 isIncremental）：仍允许合并重复的旧节点。两种情况共用同一段大纲，
      // 但增量是默认走的，绝大多数后续轮次都受这条约束保护。
      isIncremental
        ? "下面是已经显示给用户的大纲。**整段视为只读历史**：所有一级条目（包括它们的 `[[file|HH:MM]]` 时间戳、行文措辞、顺序）都必须原样保留。本轮的任务只是 **追加** 新内容，不是重写。"
        : "下面是侧边栏当前显示的大纲。它只用于保持连续性；请保留仍然重要的主线，合并重复或过细的旧节点。",
      "",
      outline
    );
  }
  if (isIncremental) {
    lines.push(
      "",
      "【自上次大纲以来的新增转写 · 增量输入】",
      omittedBeforeCount
        ? `这些是上次大纲之后新转写出来的段落。较早内容已经在【当前可见大纲】里有归属，不要再为它们生成 L1。`
        : `这些是上次大纲之后新转写出来的段落。请只为这些新段落生成新的一级或子条目，老一级条目原样保留。`,
      "",
      "**输出要求（增量模式）**：",
      "- 完整复制【当前可见大纲】里所有老一级条目（连同时间戳、子条目、顺序）—— 一字不改。",
      "- 在大纲末尾按时间顺序 **追加** 由新增转写引出的新一级条目（用新段落里实际出现的 `[[file|HH:MM]]` 链接）。",
      "- 如果新增转写明显是某个老一级条目的延续 / 补充细节，则不新建 L1，而是在该老 L1 下追加子条目（子条目不带时间戳）。",
      "- 严禁：改写、合并、重排、删除任何老一级条目；严禁把新段落的时间戳赋给老一级条目。",
      ""
    );
  } else {
    lines.push(
      "",
      "【最近转写窗口】",
      omittedBeforeCount
        ? `为控制长录音上下文，较早的 ${omittedBeforeCount} 段已由主题记忆承接；下面只提供最近窗口的转写和会中补充。`
        : "下面是当前可用的最近转写和会中补充。",
      ""
    );
  }
  return lines.join("\n");
}

function buildRealtimeOutlineEnvelopeInstruction() {
  return [
    "【输出协议】",
    "请严格输出两个 XML 风格块，不要前言、不要解释、不要代码围栏：",
    "",
    "<lexvoice-memory>",
    "写给后续轮次使用的主题记忆 / 滚动摘要。",
    "</lexvoice-memory>",
    "",
    "<lexvoice-outline>",
    "写给用户看的实时大纲 Markdown 列表。",
    "</lexvoice-outline>",
    "",
    "【主题记忆写法】",
    "- 这是隐藏的长期上下文，不是最终纪要，不要写成漂亮文章。",
    "- 记录会议/课程主线、已出现的重要对象、待追踪问题、用户用 # / ？ / ！ / TODO / @ 标记过的意图和大致时间。",
    "- 长录音可以逐步增长，但要压缩；优先保留能帮助后续理解的话题脉络，而不是抄原文。",
    "- 控制在 600 字以内；如果信息变多，合并同类项，不要线性增长。",
    "- 不要写“未提及”“待确认”这类空字段。",
    "",
    "【可见大纲写法】",
    "- <lexvoice-outline> 内只能放用户可读的大纲列表。",
    "- 要输出一份结合主题记忆和最近窗口后的更新版大纲，不要只输出新增内容。",
    "- 合并重复节点，删掉已经不重要的细枝末节；保留能帮助用户回忆现场的关键词和时间锚点。",
    "- 控制在 8 个一级节点以内。**每个一级节点必须带 2-4 个子要点**，提炼该话题下的关键论点、事实、数据、人名或结论 —— 只有光秃秃的一级标题没有意义，子要点才是大纲的灵魂。话题确实只有一句话时至少给 1 个子要点。",
    "- 每个一级节点必须是一个具体章节/话题，并尽量以输入中真实存在的 `[[音频文件|HH:MM]]` 回听链接开头；没有明确时间锚点的信息只能放到相邻章节的子条目里。",
    "- 严禁在 <lexvoice-outline> 里输出无时间锚点的总述行，例如「课程结构」「本节包括」「四个部分」这类横跨全局的摘要；这些内容属于主题记忆，不属于可点击大纲。",
    "- 顶层格式只能是：`- [[音频文件|HH:MM]] 章节标题`。子项格式只能是两个空格缩进：`  - 子要点`。",
    "- 不确定时间锚点时，不要新增顶层节点；把信息写进 <lexvoice-memory>，或追加到最近一个已有顶层节点的子项。",
    "",
    "【换行铁律 · 最重要】",
    "- 每个条目必须独占一行，用真正的换行符分隔。",
    "- 严禁把多个条目用 ` - `（空格-连字符-空格）串在同一行，例如 `- A - B - C` 是错误的，必须写成三行：`- A` / `- B` / `- C`。",
    "- 一行里只能有一个 `- ` 开头；子项缩进两个空格后另起一行。",
    "",
    "【合格示例】",
    "- [[rec.m4a|04:41]] 商业化思维的四个问题",
    "  - 解决什么问题",
    "  - 正确商业化思维",
    "  - 感受量化手段",
    "",
    "【不合格示例，禁止输出】",
    "- 课程结构与开场四问：课程四部分、四个场景、寻找手段",
    "- 课程结构 - 课程四部分 - 四个场景 - 学员A - 学员B（错误：多条目连排一行）",
    "- [[rec.m4a|04:41]] 1.解决什么问题 2.正确商业化思维 3.感受量化手段",
  ].join("\n");
}

function extractRealtimeTaggedBlock(text, tagName) {
  const tag = String(tagName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(String(text || ""));
  return match ? String(match[1] || "").trim() : "";
}

function stripRealtimeTaggedBlocks(text) {
  return String(text || "")
    .replace(/<lexvoice-memory\b[^>]*>[\s\S]*?<\/lexvoice-memory>/gi, "")
    .replace(/<lexvoice-outline\b[^>]*>[\s\S]*?<\/lexvoice-outline>/gi, "")
    .trim();
}

function cleanRealtimeLlmText(text) {
  return String(text || "").trim()
    .replace(/^```(?:xml|markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// 兜底修复 DeepSeek 等模型把列表条目连排成 "- A - B - C" 单行不换行的问题。
// 中文大纲内容里几乎不会出现 " - "（空格-ASCII连字符-空格）作为正文，所以把它当作被折叠的
// 条目分隔符拆开是安全的；时间锚点 [[x|HH:MM]] 和箭头 → 等都不含这个模式。
//
// 关键：拆开时要**恢复层级**，不能全平铺成无锚点顶层兄弟——否则那些无锚点的段会被
// normalizeOutlineMarkdownForDisplay 当作"总述行"丢弃，导致大纲只剩光秃秃一级标题。
// 规则（仅对顶层连排行）：带时间锚点的段 = 一级条目；其后的无锚点段 = 挂到该一级条目下的子要点（缩进两格）。
function parseRealtimeOutlineResponse(raw, fallbackOutline, fallbackMemory) {
  const cleaned = cleanRealtimeLlmText(raw);
  let memory = extractRealtimeTaggedBlock(cleaned, "lexvoice-memory");
  let outline = extractRealtimeTaggedBlock(cleaned, "lexvoice-outline");
  if (!outline) outline = stripRealtimeTaggedBlocks(cleaned);
  outline = cleanRealtimeLlmText(outline);
  outline = normalizeRealtimeOutlineList(outline);  // 兜底拆行
  memory = cleanRealtimeLlmText(memory);
  if (!outline) outline = String(fallbackOutline || "").trim();
  if (!memory) memory = String(fallbackMemory || "").trim();
  return {
    outline,
    memory: clipRealtimeContextText(memory, REALTIME_OUTLINE_MAX_MEMORY_CHARS),
  };
}

function normalizeRealtimeOutlineState(value, fallbackMarkdown, fallbackMemory) {
  const raw = value && typeof value === "object" ? value : {};
  const nodes = [];
  for (const item of (Array.isArray(raw.nodes) ? raw.nodes : [])) {
    const node = makeRealtimeOutlineNode(
      item && item.anchor,
      item && item.title,
      item && item.children,
      nodes.length
    );
    if (node) {
      node.id = String((item && item.id) || node.id);
      nodes.push(node);
    }
    if (nodes.length >= REALTIME_OUTLINE_STATE_MAX_NODES) break;
  }
  if (!nodes.length) nodes.push(...parseRealtimeOutlineStateFromMarkdown(fallbackMarkdown));
  return {
    version: 1,
    nodes: nodes.slice(-REALTIME_OUTLINE_STATE_MAX_NODES),
    memory: clipRealtimeContextText(raw.memory || fallbackMemory || "", REALTIME_OUTLINE_MAX_MEMORY_CHARS),
  };
}

function renderRealtimeOutlineStateMarkdown(state) {
  const normalized = normalizeRealtimeOutlineState(state);
  const lines = [];
  for (const node of normalized.nodes) {
    const title = cleanRealtimeOutlineItemText(node.title, 90);
    if (!title) continue;
    const prefix = node.anchor ? `${node.anchor} ` : "";
    lines.push(`- ${prefix}${title}`);
    for (const child of (Array.isArray(node.children) ? node.children : [])) {
      const text = cleanRealtimeOutlineItemText(child, 120);
      if (text) lines.push(`  - ${text}`);
    }
  }
  return lines.join("\n").trim();
}

function buildOutlineAudioAnchorInstruction() {
  return `【回听锚点 · 极其重要 · 时间戳钉死规则】
转写内容按段落提供，并在段落信息里带有 Obsidian 音频回听链接，例如 \`[[音频文件.webm|12:34]]\`。

**时间戳来源的唯一合法路径**：
1. **老一级条目（在【当前可见大纲参考】里已经存在的）→ 100% 原样保留它原有的 \`[[...|HH:MM]]\` 链接**，包括文件名和时间。这是钉死规则：哪怕该段已经滚出最近转写窗口，也不要换、不要删、不要"看着不在窗口里就去窗口里抓一个最近的"。老条目的时间戳是历史事实。
2. **新一级条目（本轮新提炼出来的）→ 只能用【最近转写窗口】里实际出现的链接**复制 1 个最接近的；窗口里没有就**留空**，不要从老大纲里挪一个、也不要编造。
3. 子条目通常不重复放链接；除非它是关键原话或独立证据点。

**严禁行为**：
- 把【最近转写窗口】里的时间戳赋给【当前可见大纲参考】里的老一级条目（这会让用户点击跳转跑到错误位置）。
- 编造不在输入里的文件名或时间。
- 一个段落的链接同时复用到多个相邻一级条目（同一个时间戳出现在两个连续 L1 上，几乎一定是 bug）。
- 因为某条老一级条目的原始段落不在当前窗口而把它的链接换成窗口里的某个近邻时间。

**会中批注**：\`【会中批注】\` 是用户手动补充，不是音频转写原文；不要用它的时间戳作为大纲回听锚点。
`;
}

// 招聘需求挖掘 · 会中 coverage-scan prompt（spec §5.2.B）：整场转写 → 14 维覆盖状态 JSON。
// system 用 JOBPORTRAIT_SYSTEM_PROMPT。languageInstruction 前置（前缀缓存）。
function buildCoverageScanPrompt(transcript, languageInstruction) {
  const lang = languageInstruction ? String(languageInstruction).trim() + "\n\n" : "";
  return `${lang}任务：这是一场"招聘需求沟通会"（HRBP 与业务方沟通某岗位招人标准）的**实时进行中**转写。请扫描截至目前的全部转写，判断下面 14 个岗位画像维度各自的"覆盖状态"，输出严格 JSON。这是会中实时进度追踪，不是会后总结——只依据已出现的对话，未谈到就如实标 missing。

【先判断场景】若截至目前的对话明显不是在沟通某岗位招人标准（更像研讨、闲聊或其它会议），所有维度如实标 missing 即可，不要为了凑覆盖率把无关内容硬塞进某一维。

${buildOutlineAudioAnchorInstruction()}

【14 个维度（key 固定，不可增删改）】
硬性要求(hard)：years（年限）/ education（学历）/ industry（行业）/ must_have（必须经验）/ salary（期望薪酬）
软能力·冰山下(soft)：business_sense（业务感）/ resilience（抗挫折）/ learning（学习能力）/ values（价值观）/ communication（软技能·沟通协作）
风险信号(risk)：job_hopping（跳槽频率）/ education_suspicious（学历可疑）
文化匹配(culture)：dept_style（部门风格）/ supervisor_pref（上级偏好）

【三态判定标准（严格按此，宁缺勿滥）】
- covered（已覆盖）：业务方对该维度给出**明确标准/具体要求**，且——硬性维度有可执行的数值或硬条件（如"5 年以上""本科起""薪资 30-40K""必须做过 To B"）；软能力维度有业务方**原话证据** + 至少一个具体场景或反例（不能只是"要有责任心"这种空泛标签）。必须能定位到一段转写原话。
- partial（部分覆盖）：提到了但**不够实——只有模糊词没有量化/场景**（如"经验丰富点""学习能力强""能扛事"），或缺反例/场景，或一句带过。
- missing（未涉及）：转写里业务方**根本没谈到**。

【evidence_anchor 规则】仅 covered/partial 需要：从转写中复制**最能支撑该判定**那段所带的 \`[[音频文件.webm|HH:MM]]\` 链接，原样照抄（文件名+时间不许改）；没有可用链接或 missing → 留空串 ""。严禁编造。

【missing_what 规则】partial/missing 必填：一句话写"还缺什么、下次该追问什么"（如"只说要 To B 经验，没给年限和行业"）——这是给 HRBP 的行动提示，最有价值。covered 时留空串 ""。

【followup_question 规则】partial/missing 必填：一句"该怎么问"的具体追问话术，针对本场上下文、业务语言、可直接照着问、≤30 字（如"您说的'抗压'，能举一个去年扛住压力的具体例子吗？"）。**不得含双引号或换行**（避免把 JSON 写崩）。covered 留空串 ""。

【vague_hits 规则】若该维转写里出现模糊/对冲词（如"差不多 / 比较强 / 有一定经验 / 看情况 / 视情况 / 挺好的 / 大概 / 综合素质 / 踏实 / 靠谱"等空泛说法），把命中的词原样列进字符串数组 vague_hits（最多 3 个）；没有则空数组 []。注意"优先""最好"这类在给硬性标准时是正常用词，不算模糊。

【输出 · 只输出一个 JSON 对象，无前言无解释无代码围栏】
{
  "dims": [
    { "key": "years", "name": "年限", "status": "covered|partial|missing", "evidence_anchor": "", "missing_what": "", "followup_question": "", "vague_hits": [] },
    ... 必须**恰好 14 条，key 与上面一一对应，不可遗漏/重复**，顺序不限 ...
    { "key": "supervisor_pref", "name": "上级偏好", "status": "...", "evidence_anchor": "...", "missing_what": "...", "followup_question": "...", "vague_hits": [] }
  ]
}

【克制】转写不完整很正常，未覆盖坦诚标 missing，不要为好看硬判 covered；不引用候选人/简历内容；status 只能是 covered/partial/missing；evidence_anchor/missing_what/followup_question 缺省一律空串、vague_hits 缺省空数组 []，绝不输出 null。

【实时转写】
${transcript}`;
}

// 前缀缓存优化：所有稳定指令（含语种指令）放在前面，变化的「转写上下文」严格放最后。
// 这样 DeepSeek 等支持自动前缀缓存的服务商，每轮能命中"从头到 实时整理上下文："的稳定前缀，
// 只对变化的转写部分重新计算 —— 纯降本提速，不改输出质量。
// languageInstruction 由调用方传入并前置（不要再用 applyBriefingLanguageInstruction 追加到末尾，
// 否则语种指令会落在变化内容之后、进入不可缓存的尾巴）。
function buildOutlinePrompt(modeLabel, modeKey, transcript, captureMode, languageInstruction) {
  const langBlock = languageInstruction ? `\n\n${String(languageInstruction).trim()}` : "";
  // 招聘面试模式：大纲严格按"问题 → 回答 → AI 评价"组织
  if (modeKey === "recruit") {
    return `下面是一段${modeLabel}录音的实时整理上下文。请更新结构化的面试实时大纲和主题记忆。

${buildSourceAwareOutlineInstruction(captureMode, modeKey)}

${buildOutlineAudioAnchorInstruction()}

${buildRealtimeOutlineEnvelopeInstruction()}

【结构 · 严格按问题为单位组织】
在 <lexvoice-outline> 内，对识别到的每个"面试官提问"作为一级节点，下挂候选人回答要点和 AI 评价。

【可见大纲格式】
\`\`\`
- ❓ <问题主题，6-12 字> [[音频文件.webm|12:34]]
  - 💬 <候选人回答的关键点 1>
  - 💬 <候选人回答的关键点 2>
  - 🤖 <AI 简评：质量定调 + 一句话评价>
  - ⛏ <可继续追问的具体方向>
\`\`\`

【AI 评价行的写作要求】
- 必须以 \`🤖 \` 开头（让样式可识别为 AI 评价，与候选人内容做视觉区分）
- 简评要"具体"——不要"回答得不错""逻辑清晰"这种空话
- 必须能给面试官**实际启发**：例如"用了STAR结构但S和T一笔带过""数据来源未追问就接受""避谈失败案例"等

【追问行的要求】
- 必须以 \`⛏ \` 开头
- 追问要"挖到事实层"，不要"能不能再说说"这种泛问
- 例：候选人说"提升了 20%"，追问写成"⛏ 这 20% 的基线值是多少？参与人员只有他一个吗？"

【克制】
- 候选人回答还没出现的问题，不要预生成评价
- 转写不完整就只整理已出现的问答对
- 没听清楚的问答标注"❓ <主题>（转写不清，待复核）"，不要硬猜

【输出】
- <lexvoice-outline> 内使用纯 Markdown 列表，每个问题独立成一级节点
- 不要前言、不要总评（综合评价留给最终整合，不在大纲里出现）${langBlock}

实时整理上下文：
${transcript}`;
  }

  // 通用：归并到共同上层概念
  return `下面是一段${modeLabel}录音的实时整理上下文。请更新实时大纲和主题记忆。

${buildSourceAwareOutlineInstruction(captureMode, modeKey)}

${buildOutlineAudioAnchorInstruction()}

${buildRealtimeOutlineEnvelopeInstruction()}

【方法 · 归并】
找到讨论中可以归并的"共同上一级概念"。
- 通读全部内容，识别零散的具体观点 / 事实 / 任务（叶子）
- 把可以共用同一个上层概念的叶子聚到一起，写出那个上层概念作为父节点
- 如果多个父节点又共享更大的母题，再向上归并一层
- **层级深度由材料决定，不预设**——
  - 材料同质或简单 → 1 层即可
  - 材料丰富 → 2 层
  - 真正多议题、多分支 → 3 层或更多
- 不要为了凑层级把孤立观点强行嵌套；也不要把本可归类的扁平铺开

【克制】
- 不堆砌符号 / callout / 模板字段
- 不预设"决议 / 行动 / 假设 / 缺口"等维度——只有材料里真有，才出现
- 不复述发言原话，但也别过度抽象成空话；保留能让人回忆起讨论内容的关键词
- 讨论本身可能没那么深刻，那就让大纲也朴素一点

【输出】
- <lexvoice-outline> 内使用纯 Markdown 列表，缩进表达层级
- 每条简短，不解释、不前言、不结语；一级条目可在末尾带一个回听锚点
- 转写不完整时只整理已出现的内容${langBlock}

实时整理上下文：
${transcript}`;
}

function buildRealtimeOutlineDetails(session) {
  const outline = String(session && session.realtimeOutline ? session.realtimeOutline : "").trim();
  if (!outline) return "";
  return [
    "<details>",
    "<summary>录音中实时大纲（草稿）</summary>",
    "",
    "> 基于录音过程中已完成的分段自动生成，正文纪要以最终整理为准。时间标记可用于快速回听对应片段。",
    "",
    outline,
    "",
    "</details>",
  ].join("\n");
}

function isMeetingWorkbenchMode(mode) {
  return mode === "meeting" || mode === "seminar" || mode === "huddle";
}


function normalizeMeetingMaterials(materials, limit = 30) {
  const normalized = [];
  const seen = new Set();
  for (const item of (Array.isArray(materials) ? materials : [])) {
    if (!item || typeof item !== "object") continue;
    const path = obsidian.normalizePath(item.path || "");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    normalized.push({
      path,
      name: String(item.name || path.split("/").pop() || "").trim(),
      kind: String(item.kind || item.type || "").trim(),
      addedAt: String(item.addedAt || ""),
    });
  }
  return normalized.slice(-limit);
}

function normalizeMeetingWorkbench(value) {
  const raw = value && typeof value === "object" ? value : {};
  const entries = [];
  for (const item of (Array.isArray(raw.entries) ? raw.entries : [])) {
    if (!item || typeof item !== "object") continue;
    const text = String(item.text || "").trim();
    const materials = normalizeMeetingMaterials(item.materials, 12);
    if (!text && !materials.length) continue;
    const createdAt = String(item.createdAt || item.addedAt || "");
    const atMs = Math.max(0, Number(item.atMs ?? item.offsetMs ?? 0) || 0);
    const rawInteraction = item.interaction && typeof item.interaction === "object" ? item.interaction : null;
    const interaction = rawInteraction ? {
      kind: String(rawInteraction.kind || "").trim(),
      query: String(rawInteraction.query || "").trim(),
      status: String(rawInteraction.status || "").trim(),
      response: String(rawInteraction.response || "").trim(),
      error: String(rawInteraction.error || "").trim(),
      updatedAt: String(rawInteraction.updatedAt || ""),
    } : null;
    entries.push({
      id: String(item.id || `meeting-entry-${entries.length}-${atMs}-${createdAt || "time"}`),
      atMs,
      createdAt,
      source: String(item.source || (materials.length && !text ? "material" : "manual")),
      text,
      materials,
      interaction,
    });
  }
  return {
    notes: String(raw.notes || "").trim(),
    draft: String(raw.draft || ""),
    materials: normalizeMeetingMaterials(raw.materials, 30),
    entries: entries.slice(-100),
  };
}

// 元数据型符号（不触发 AI 即时助理，只用于结构化标注 + 传给 merge prompt）
const MEETING_METADATA_KINDS = new Set(["assignee", "todo"]);

function detectMeetingWorkbenchInteraction(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  // ---------- AI 触发型（concept / question / focus） ----------
  let match = value.match(/^[#＃]\s*(.+)$/);
  if (match && String(match[1] || "").trim()) {
    return { kind: "concept", query: String(match[1] || "").trim() };
  }
  match = value.match(/^[?？]\s*(.+)$/);
  if (match && String(match[1] || "").trim()) {
    return { kind: "question", query: String(match[1] || "").trim() };
  }
  match = value.match(/^[!！]\s*(.+)$/);
  if (match && String(match[1] || "").trim()) {
    return { kind: "focus", query: String(match[1] || "").trim() };
  }
  // ---------- 元数据型（assignee / todo） ----------
  // @xxx [任务内容]：指派给某人；assignee 取首个空白前的 token，余下作为任务说明
  match = value.match(/^[@＠]\s*(\S+)(?:\s+(.+))?$/);
  if (match && String(match[1] || "").trim()) {
    return {
      kind: "assignee",
      assignee: String(match[1] || "").trim(),
      task: String(match[2] || "").trim(),
    };
  }
  // /任务内容：创建待办；可在任务文本里再用 @xxx 标注负责人
  match = value.match(/^[/／]\s*(.+)$/);
  if (match && String(match[1] || "").trim()) {
    const raw = String(match[1] || "").trim();
    const innerAssignee = raw.match(/[@＠](\S+)/);
    return {
      kind: "todo",
      task: innerAssignee ? raw.replace(/\s*[@＠]\S+\s*/g, " ").trim() : raw,
      assignee: innerAssignee ? String(innerAssignee[1] || "").trim() : "",
    };
  }
  return null;
}

function getMeetingWorkbenchOutlineSignature(value, maxAtMs = Infinity) {
  const workbench = normalizeMeetingWorkbench(value);
  const limit = Number.isFinite(Number(maxAtMs)) ? Number(maxAtMs) : Infinity;
  const notes = String(workbench.notes || "").trim().slice(-1000);
  const entries = workbench.entries
    .filter(entry => (Number(entry.atMs) || 0) <= limit)
    .slice(-80)
    .map(entry => [
      entry.id || "",
      Math.round(Number(entry.atMs) || 0),
      entry.source || "",
      String(entry.text || "").trim(),
      (entry.materials || []).map(item => [item.path || "", item.name || "", item.kind || ""].join("@")).join(","),
    ].join("::"))
    .join("|");
  const materials = workbench.materials
    .map(item => [item.path || "", item.name || "", item.kind || ""].join("@"))
    .join("|");
  return [notes, entries, materials].filter(Boolean).join("\n");
}

function getRealtimeOutlineWorkbenchSignature(session) {
  return getMeetingWorkbenchOutlineSignature(session && session.meetingWorkbench, getSessionLatestSegmentEndMs(session));
}

function isRealtimeOutlineCurrent(session) {
  if (!session || !session.realtimeOutline) return false;
  const segmentCount = Array.isArray(session.segments) ? session.segments.length : 0;
  const processedCount = Number(session.realtimeOutlineSegmentCount) || 0;
  return processedCount >= segmentCount;
}

function getRealtimeOutlineNewSegmentCount(session) {
  if (!session) return 0;
  const segmentCount = Array.isArray(session.segments) ? session.segments.length : 0;
  const processedCount = Number(session.realtimeOutlineSegmentCount) || 0;
  return Math.max(0, segmentCount - processedCount);
}

function getRealtimeOutlineNewTextChars(session) {
  if (!session || !Array.isArray(session.segments)) return 0;
  const processedCount = Math.max(0, Number(session.realtimeOutlineSegmentCount) || 0);
  return session.segments.slice(processedCount).reduce((sum, s) => {
    return sum + String((s && s.text) || "").trim().length;
  }, 0);
}

function getRealtimeOutlineUpdatedAtMs(session) {
  const value = session && session.realtimeOutlineUpdatedAt;
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRealtimeOutlineMinSilentIntervalMs(opts) {
  // 本地模型档：把最小间隔从 30s 拉到 90s。
  // 理由（总纲：堵工程缺陷不为省钱）：本地模型慢、单线程，6000 字输入跑不完一个 30s 间隔
  // 容易触发"超时-退避-沉默"循环；拉长间隔让它有完整窗口跑完，体感稳定。
  return opts && opts.local
    ? REALTIME_OUTLINE_MIN_SILENT_INTERVAL_MS * 3
    : REALTIME_OUTLINE_MIN_SILENT_INTERVAL_MS;
}

function isRealtimeOutlineSilentIntervalActive(session, opts) {
  const updatedAt = getRealtimeOutlineUpdatedAtMs(session);
  return !!(updatedAt && Date.now() - updatedAt < getRealtimeOutlineMinSilentIntervalMs(opts));
}

function getRealtimeOutlineFailureDelayMs(session) {
  const failures = Math.max(1, Number(session && session.realtimeOutlineFailureCount) || 1);
  return Math.min(
    REALTIME_OUTLINE_FAILURE_BACKOFF_MAX_MS,
    REALTIME_OUTLINE_FAILURE_BACKOFF_BASE_MS * Math.pow(2, Math.min(4, failures - 1))
  );
}

function markRealtimeOutlineSuccess(session) {
  if (!session) return;
  session.realtimeOutlineFailureCount = 0;
  session.realtimeOutlineNextAllowedAt = 0;
}

function markRealtimeOutlineFailure(session) {
  if (!session) return;
  const failures = Math.max(0, Number(session.realtimeOutlineFailureCount) || 0) + 1;
  session.realtimeOutlineFailureCount = failures;
  session.realtimeOutlineNextAllowedAt = Date.now() + getRealtimeOutlineFailureDelayMs(session);
}

function isRealtimeOutlineBackoffActive(session) {
  return !!(session && Number(session.realtimeOutlineNextAllowedAt) > Date.now());
}

function shouldRunRealtimeOutline(session, opts = {}) {
  if (!session || !Array.isArray(session.segments) || !session.segments.length) return false;
  if (opts.force || opts.final) return true;
  if (isRealtimeOutlineCurrent(session)) return false;
  // recruit-needs 首扫豁免：短会场景下转写 job 常仍在飞，会把会中第一份 coverage 挡掉。
  // 仅"recruit-needs 且尚无既有覆盖产出"时放行首扫，其它模式/后续轮不受影响。
  const isRecruitFirstScan = session.mode === "recruit-needs"
    && !(session.jobPortraitCoverage && session.jobPortraitCoverage.updatedAt);
  if (opts.silent && !isRecruitFirstScan && Number(session.activeSegmentJobs || 0) > 0) return false;
  if (opts.silent && isRealtimeOutlineBackoffActive(session)) return false;
  // recruit-needs 不写 realtimeOutline 内容，用 jobPortraitCoverage.updatedAt 作"已有产出"门槛；
  // 节流用的游标(realtimeOutlineSegmentCount/UpdatedAt)由 coverage-scan 同步写，故内层间隔/新增检查照常生效。
  const hasPriorRealtimeOutput = session.mode === "recruit-needs"
    ? !!(session.jobPortraitCoverage && session.jobPortraitCoverage.updatedAt)
    : !!session.realtimeOutline;
  if (opts.silent && hasPriorRealtimeOutput) {
    if (isRealtimeOutlineSilentIntervalActive(session, { local: !!opts.local })) return false;
    const newSegments = getRealtimeOutlineNewSegmentCount(session);
    const newChars = getRealtimeOutlineNewTextChars(session);
    if (newSegments < REALTIME_OUTLINE_MIN_NEW_SEGMENTS && newChars < REALTIME_OUTLINE_MIN_NEW_CHARS) return false;
  }
  return true;
}

function clipMeetingInteractionSegmentLine(line) {
  const text = String(line || "").trim();
  if (text.length <= MEETING_INTERACTION_SEGMENT_MAX_CHARS) return text;
  return text.slice(0, MEETING_INTERACTION_SEGMENT_MAX_CHARS - 1).trimEnd() + "…";
}

function getMeetingInteractionMaxTokens(kind) {
  const raw = String(kind || "").toLowerCase();
  if (raw === "concept") return MEETING_INTERACTION_CONCEPT_MAX_TOKENS;
  if (raw === "focus" || raw === "important") return MEETING_INTERACTION_IMPORTANT_MAX_TOKENS;
  return MEETING_INTERACTION_MAX_TOKENS;
}

function hasMeetingWorkbenchContent(value) {
  const workbench = normalizeMeetingWorkbench(value);
  return !!(workbench.notes || workbench.materials.length || workbench.entries.length);
}

function isImageMeetingMaterial(item) {
  const path = String((item && item.path) || "").toLowerCase();
  const kind = String((item && item.kind) || "").toLowerCase();
  return kind === "image" || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(path);
}

function buildMeetingWorkbenchPrompt(value) {
  const workbench = normalizeMeetingWorkbench(value);
  if (!hasMeetingWorkbenchContent(workbench)) return "";
  const lines = [
    "## 会中补充材料（用户在 LexVoice 侧边栏手动提供）",
    "",
    "这些内容不是音频转写原文，而是用户在会议过程中补充的背景、零散想法或演示资料。整理纪要时请作为辅助上下文使用：",
    "- 音频转写仍然是事实主线；补充材料用于识别议题、PPT 结构、上下文和用户特别关注点。",
    "- 如果补充材料和转写冲突，以转写中明确出现的讨论为准，并避免把未讨论的材料硬写成会议结论。",
    "- 如果用户上传的是 PPT、图片或 PDF，当前只提供文件名和链接；可以基于文件名、用户备注和转写内容判断关联主题，不要虚构图片/PPT 里的具体文字。",
    "",
  ];
  if (workbench.notes) {
    lines.push("### 用户零散记录", workbench.notes, "");
  }
  if (workbench.entries.length) {
    // 把元数据 kinds 单独拎出来，让 merge LLM 能直接识别"指派"和"待办"两类结构化标注
    const assigneeEntries = workbench.entries.filter(e => e.interaction && e.interaction.kind === "assignee");
    const todoEntries = workbench.entries.filter(e => e.interaction && e.interaction.kind === "todo");
    if (assigneeEntries.length) {
      lines.push("### 用户指派（@ 符号）—— 视为权威的角色归属，正文应据此署名");
      for (const entry of assigneeEntries) {
        const time = formatElapsed(entry.atMs || 0);
        const who = entry.interaction.assignee || "未指定";
        const task = entry.interaction.task ? `：${entry.interaction.task}` : "";
        lines.push(`- [${time}] @${who}${task}`);
      }
      lines.push("");
    }
    if (todoEntries.length) {
      lines.push("### 用户标记的待办（/ 符号）—— 必须写入最终纪要的待办区，不要遗漏");
      for (const entry of todoEntries) {
        const time = formatElapsed(entry.atMs || 0);
        const task = entry.interaction.task || entry.text || "未命名待办";
        const who = entry.interaction.assignee ? ` 责任人：${entry.interaction.assignee}` : "";
        lines.push(`- [${time}] ${task}${who}`);
      }
      lines.push("");
    }
    // 其他普通 / AI 触发型补充
    const otherEntries = workbench.entries.filter(e => !e.interaction || !MEETING_METADATA_KINDS.has(e.interaction.kind));
    if (otherEntries.length) {
      lines.push("### 用户补充");
      for (const entry of otherEntries) {
        const time = formatElapsed(entry.atMs || 0);
        const text = entry.text ? ` ${entry.text}` : "";
        lines.push(`- [${time}]${text}`);
        if (entry.interaction && entry.interaction.response) {
          lines.push(`  - AI 补充：${String(entry.interaction.response).replace(/\r?\n/g, "；")}`);
        }
        for (const item of entry.materials || []) {
          const name = item.name || item.path.split("/").pop() || item.path;
          const kind = item.kind ? ` · ${item.kind}` : "";
          lines.push(`  - 附件：[[${item.path}|${name}]]${kind}`);
        }
      }
      lines.push("");
    }
  }
  if (workbench.materials.length) {
    lines.push("### 用户补充附件");
    for (const item of workbench.materials) {
      const name = item.name || item.path.split("/").pop() || item.path;
      const kind = item.kind ? ` · ${item.kind}` : "";
      lines.push(`- [[${item.path}|${name}]]${kind}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildMeetingWorkbenchDetails(session) {
  const workbench = normalizeMeetingWorkbench(session && session.meetingWorkbench);
  if (!hasMeetingWorkbenchContent(workbench)) return "";
  const lines = [];
  if (workbench.notes) {
    lines.push("#### 会中零散记录", "", workbench.notes, "");
  }
  if (workbench.entries.length) {
    lines.push("#### 用户补充", "");
    for (const entry of workbench.entries) {
      const text = entry.text ? ` ${entry.text}` : "";
      lines.push(`- ${formatElapsed(entry.atMs || 0)}${text}`);
      if (entry.interaction && entry.interaction.response) {
        lines.push(`  - AI：${String(entry.interaction.response).replace(/\r?\n/g, "\n    ")}`);
      }
      for (const item of entry.materials || []) {
        const name = item.name || item.path.split("/").pop() || item.path;
        const kind = item.kind ? ` · ${item.kind}` : "";
        if (isImageMeetingMaterial(item)) {
          lines.push(`  - [[${item.path}|${name}]]${kind}`, `  ![[${item.path}]]`);
        } else {
          lines.push(`  - [[${item.path}|${name}]]${kind}`);
        }
      }
    }
    lines.push("");
  }
  if (workbench.materials.length) {
    lines.push("#### 补充材料", "");
    for (const item of workbench.materials) {
      const name = item.name || item.path.split("/").pop() || item.path;
      const kind = item.kind ? ` · ${item.kind}` : "";
      if (isImageMeetingMaterial(item)) {
        lines.push(`- [[${item.path}|${name}]]${kind}`, `![[${item.path}]]`, "");
      } else {
        lines.push(`- [[${item.path}|${name}]]${kind}`);
      }
    }
    lines.push("");
  }
  return [
    "<details>",
    "<summary>会中补充材料</summary>",
    "",
    lines.join("\n").trim(),
    "",
    "</details>",
  ].join("\n");
}

// 回听时间轴模块（保留函数与样式做向后兼容；新纪要不再注入）。
// 大纲一级条目本身已挂回听锚点 [[file|HH:MM]]，逐段时间戳列表对用户冗余 —— 关闭。
// 不删函数体里的 session-segments 处理与 details 渲染：老笔记里已存在的回听时间轴
// 由侧边栏 panel 渲染（renderRecentDetail 等），仍能正常显示；
// 这里只关闭"新写入"的注入点。
function buildPlaybackTimelineDetails(session) {
  // 显式关闭：返回空串 → 后续 lines 拼接里 `|| null` 自动跳过这一块
  // 若以后想恢复，把下一行删掉即可；底层渲染逻辑完整保留
  return "";
  // eslint-disable-next-line no-unreachable
  const segments = (session && Array.isArray(session.segments)) ? session.segments : [];
  if (!segments.length) return "";
  const lines = [];
  for (const s of segments) {
    if (!s || !s.audioName) continue;
    const audioName = String(s.audioName || "").trim();
    const start = formatElapsed(s.startOffsetMs || 0);
    const end = formatElapsed(s.endOffsetMs || 0);
    const label = `${start}–${end}`;
    const n = Number.isFinite(s.index) ? s.index + 1 : lines.length + 1;
    const pillCls = s.error ? "lexvoice-playback-timeline-pill is-error" : "lexvoice-playback-timeline-pill";
    const metaCls = s.error ? "lexvoice-playback-timeline-index is-error" : "lexvoice-playback-timeline-index";
    const state = s.error ? "重试" : `段 ${n}`;
    lines.push(
      `<span class="${pillCls}">` +
      `<a class="internal-link lexvoice-time-link" data-href="${escapeHtmlText(audioName)}" href="${escapeHtmlText(audioName)}">${escapeHtmlText(label)}</a>` +
      `<span class="${metaCls}">${escapeHtmlText(state)}</span>` +
      `</span>`
    );
  }
  if (!lines.length) return "";
  return [
    "<details>",
    `<summary>回听时间轴（${lines.length} 个节点）</summary>`,
    "",
    '<div class="lexvoice-playback-timeline">',
    lines.join(""),
    "</div>",
    "",
    "</details>",
  ].join("\n");
}


function extractLexVoiceDetailsBody(markdown, summaryPattern) {
  const text = String(markdown || "");
  const re = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/gi;
  let match;
  while ((match = re.exec(text))) {
    const summary = stripHtmlText(match[1]);
    if (summaryPattern.test(summary)) return String(match[2] || "").trim();
  }
  return "";
}

function extractLexVoiceNotePanelData(file, markdown) {
  const text = String(markdown || "");
  const sedimentPreExtraction = extractSedimentPreExtractionBlock(text);
  const hasMarker = /<!--\s*lexvoice-session(?::|\s*--)/.test(text)
    || /<!--\s*lexvoice-segments-start/.test(text);
  const outlineRaw = extractLexVoiceDetailsBody(text, /录音中实时大纲/);
  const outline = outlineRaw
    .replace(/^>\s*基于录音过程中已完成的分段自动生成[^\n]*\n?/m, "")
    .trim();
  const timeline = extractLexVoiceDetailsBody(text, /回听时间轴/);
  if (!hasMarker && !outline && !timeline) return null;
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/m, "");
  const h1 = body.match(/^#\s+(.+?)\s*$/m);
  const audioRefs = collectLexVoiceAudioRefs(text);
  return {
    file,
    title: h1 ? h1[1].trim() : (file && file.basename ? file.basename : "LexVoice 纪要"),
    outline,
    timeline,
    audioRefs,
    hasMarker,
    preExtractedSediment: sedimentPreExtraction.objects,
    hasPreExtractedSediment: !!sedimentPreExtraction.objects,
  };
}

function buildRecordingInfoDetails(info) {
  const lines = [];
  if (info && info.startedAt && window.moment) {
    lines.push(`- 时间：${window.moment(info.startedAt).format("YYYY-MM-DD HH:mm:ss")}`);
  }
  if (info && info.totalMs != null) lines.push(`- 时长：${formatElapsed(info.totalMs)}`);
  if (info && info.modeLabel) lines.push(`- 模式：${info.modeLabel}`);
  if (info && info.segmentText) lines.push(`- 分段：${info.segmentText}`);
  else if (info && info.segmentCount != null) lines.push(`- 分段：${info.segmentCount}`);
  if (info && info.model) lines.push(`- 模型：${info.model}`);
  if (!lines.length) return "";
  return [
    "<details>",
    "<summary>录音信息</summary>",
    "",
    lines.join("\n"),
    "",
    "</details>",
  ].join("\n");
}


function getAudioTimeLink(audioName, ms) {
  const name = String(audioName || "").trim();
  if (!name) return "";
  return `[[${name}|${formatElapsed(ms || 0)}]]`;
}

function getAudioTimeRangeLink(audioName, startMs, endMs) {
  const name = String(audioName || "").trim();
  if (!name) return "";
  return `[[${name}|${formatElapsed(startMs || 0)}–${formatElapsed(endMs || 0)}]]`;
}

function getSegmentAudioLinkOffsetMs(segment) {
  const local = Number(segment && segment.audioStartOffsetMs);
  if (Number.isFinite(local) && local >= 0) return local;
  return Math.max(0, Number(segment && segment.startOffsetMs) || 0);
}

function getAudioSegmentListItem(segment, index) {
  if (!segment || !segment.audioName) return "";
  const n = Number.isFinite(segment.index) ? segment.index + 1 : index + 1;
  const start = formatElapsed(segment.startOffsetMs || 0);
  const end = formatElapsed(segment.endOffsetMs || 0);
  const link = getAudioTimeLink(segment.audioName, getSegmentAudioLinkOffsetMs(segment));
  return [
    `#### 段落 ${n}（${start}–${end}）`,
    "",
    `![[${segment.audioName}]]`,
    "",
    `回听：${link}`,
  ].join("\n");
}

function getSessionMasterAudioName(session) {
  const name = String(session && session.masterAudioName ? session.masterAudioName : "").trim();
  if (name) return name;
  const path = String(session && session.masterAudioPath ? session.masterAudioPath : "").trim();
  return path ? (path.split("/").pop() || path) : "";
}

function buildMasterAudioDetails(session, totalMs) {
  const audioName = getSessionMasterAudioName(session);
  if (!audioName) return "";
  return [
    "<details>",
    `<summary>原始音频（完整录音，${formatElapsed(totalMs || 0)}）</summary>`,
    "",
    `![[${audioName}]]`,
    "",
    `回听：${getAudioTimeLink(audioName, 0)}`,
    "",
    "</details>",
  ].join("\n");
}

function isTimeLabel(text) {
  const time = "(?:\\d{1,2}:)?\\d{1,2}:\\d{2}";
  return new RegExp("^" + time + "(?:\\s*[–-]\\s*" + time + ")?$").test(String(text || "").trim());
}



function getAudioLinkCandidates(linkPath) {
  const target = normalizeAudioLinkTarget(linkPath);
  const out = [];
  const add = (value) => {
    const v = obsidian.normalizePath(String(value || "").trim());
    if (v && !out.includes(v)) out.push(v);
  };
  add(target);
  add(safeDecodeUriText(target));
  const name = (target.split("/").pop() || target).trim();
  add(name);
  add(safeDecodeUriText(name));
  return out;
}

function getAudioExtFromLinkPath(linkPath) {
  const target = normalizeAudioLinkTarget(linkPath);
  const base = target.split("/").pop() || target;
  const ext = (base.split(".").pop() || "").toLowerCase();
  return AUDIO_EXT.has(ext) ? ext : "";
}

function getAudioLinkTarget(linkPath) {
  return normalizeAudioLinkTarget(linkPath);
}

function extractAudioSegmentOffsets(markdown) {
  const map = new Map();
  const text = String(markdown || "");
  const headingRe = /^###\s+段落\s+\d+\s*\(([^)\n]+?)[–-]([^)\n]+?)\)([^\n]*)$/gm;
  let match;
  while ((match = headingRe.exec(text))) {
    const startOffsetMs = parseElapsedMsToken(match[1]);
    const bodyStart = match.index + match[0].length;
    const nextHeading = text.slice(bodyStart).search(/^###\s+段落\s+\d+/m);
    const bodyEnd = nextHeading >= 0 ? bodyStart + nextHeading : text.length;
    const block = text.slice(bodyStart, bodyEnd);
    const embed = block.match(/!\[\[([^\]]+)\]\]/);
    if (!embed) continue;
    const target = getAudioLinkTarget(embed[1]);
    const name = (target.split("/").pop() || target).trim();
    if (target) map.set(obsidian.normalizePath(target), startOffsetMs);
    if (name) map.set(name, startOffsetMs);
  }
  return map;
}

// ============================================================
// 虚拟声卡识别 · 跨平台 audioinput 设备检测
// ============================================================




// 已移除 pickVirtualCableId / pickRealMicrophoneId：
// 新哲学是"插件不替用户猜设备"——acquireStream 直接透传用户在设置里选的设备（没选则系统默认/明确提示），
// 不再用名字启发式自动挑选。名字启发式（isVirtualCableLabel）仅保留给 UI 软提示，不参与任何选择。





function stripLexVoiceAutoTitleSuffix(stem, settings) {
  const prefixes = Object.values(MODE_META)
    .map(m => sanitizeFilename(m && m.prefix))
    .concat(getCustomPromptModeTemplates(settings || {}).map(t => sanitizeFilename(t.name)))
    .filter(Boolean);
  const unique = Array.from(new Set(prefixes)).sort((a, b) => b.length - a.length);
  if (!unique.length) return String(stem || "").trim();
  const re = new RegExp("\\s*·\\s*(?:" + unique.map(escapeRegExp).join("|") + ")-[^·/\\\\]+$");
  return String(stem || "").replace(re, "").trim();
}

function buildLexVoiceRenamedMarkdownPath(currentPath, mode, titleTag, settings) {
  const norm = obsidian.normalizePath(String(currentPath || ""));
  const slash = norm.lastIndexOf("/");
  const dir = slash >= 0 ? norm.slice(0, slash) : "";
  const name = slash >= 0 ? norm.slice(slash + 1) : norm;
  const stem = stripLexVoiceAutoTitleSuffix(name.replace(/\.md$/i, ""), settings);
  const meta = getModeMeta(settings, mode);
  const modePrefix = sanitizeFilename(meta.prefix || "自定义") || "自定义";
  const tag = sanitizeFilename(titleTag) || "";
  if (!stem || !tag) return "";
  const nextName = `${stem} · ${modePrefix}-${tag}.md`;
  return obsidian.normalizePath(dir ? `${dir}/${nextName}` : nextName);
}

// ===== API 密钥本地存储混淆 =====
// 目标：data.json 里不出现可直接读取的明文密钥（满足"不是明文"承诺、防止截图/误分享 data.json 泄露）。
// 诚实说明：这是「混淆」不是「加密」—— 因为本插件开源，变换算法公开，能拿到 data.json + 读源码的人仍可还原。
// 但它消除了"密钥以 sk-xxx 明文躺在配置文件里"这一最常见的泄露面，且密钥从不离开本地（仅在调用 API 时发往对应服务端点）。
// 内存中 settings 始终保存明文密钥，所有调用大模型/转写的代码无需改动；只有落盘的 data.json 是混淆态。




// 深度遍历对象，对所有名字以 apiKey 结尾的字符串字段应用 fn（落盘混淆 / 读取还原），路径无关。
// 覆盖：apiKey / llmApiKey / transcribeApiKey / compatApiKey 以及 providers[].apiKey、profiles[].apiKey 等嵌套。
function transformApiKeyFieldsDeep(obj, fn, depth) {
  const d = depth || 0;
  if (!obj || typeof obj !== "object" || d > 10) return;
  if (Array.isArray(obj)) {
    for (const item of obj) transformApiKeyFieldsDeep(item, fn, d + 1);
    return;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && /apikey$/i.test(key)) {
      obj[key] = fn(val);
    } else if (val && typeof val === "object") {
      transformApiKeyFieldsDeep(val, fn, d + 1);
    }
  }
}

// 轻量文本输入弹窗，返回 Promise<string|null>（取消返回 null）

// 检测同步冲突文件名（坚果云/Dropbox/OneDrive 等）
// 坚果云：xxx (冲突 from device YYYY-MM-DD HH:MM).m4a
// Dropbox：xxx (USERNAME's conflicted copy YYYY-MM-DD).m4a
// OneDrive：xxx-DESKTOP-XYZ.m4a 较难识别，仅匹配显式 conflict 字样
// 通用：包含 (冲突…) (…conflicted…) (conflict…) 字样的文件
function isSyncConflictName(name) {
  if (!name) return false;
  // 全角/半角括号 + 冲突/conflict/conflicted copy 字样
  return /[\(（][^\)）]*?(冲突|conflict|conflicted\s*copy)[^\(（]*[\)）]/i.test(name);
}

























// 从源纪要 frontmatter 取"人物"维度的人名：同时认 ① 新独立属性 人物（people 别名兼容）
// ② 旧笔记里 tags 的 人物/x 前缀。是"人物单列后"所有消费源纪要人物处的单一收口点。



























































// 把正文里那段沉淀元数据 HTML 注释「原样」拆出来，返回 { body, block }。
// 用途：写最终纪要时，把这坨机器可读 JSON 从"正文与原始材料之间"挪到笔记最末尾，
// 编辑模式下不再夹在中间难看（阅读视图本就因 HTML 注释而隐藏）。保留原始匹配文本不重排，
// 避免 JSON 轻微不规范时反序列化丢数据。















function parseVocabTerms(text) {
  return flattenVocabularyGroups(parseVocabularyGroups(text));
}







function normalizeModeFromLabel(settings, label) {
  const text = String(label || "").trim();
  if (!text) return "";
  if (isKnownPolishMode(settings, text)) return text;
  if (MODE_PREFIX_TO_KEY[text]) return MODE_PREFIX_TO_KEY[text];
  const normalized = text.replace(/^lexvoice\//i, "").trim();
  if (isKnownPolishMode(settings, normalized)) return normalized;
  if (MODE_PREFIX_TO_KEY[normalized]) return MODE_PREFIX_TO_KEY[normalized];
  for (const [mode, name] of getVisibleModeEntries(settings, false)) {
    if (text === name || normalized === name) return mode;
  }
  return "";
}

function detectRecentModeFromFrontmatter(settings, frontmatter) {
  const fm = frontmatter && typeof frontmatter === "object" ? frontmatter : {};
  const explicitMode = normalizeModeFromLabel(settings, fm.mode || fm["mode"] || "");
  if (explicitMode) return explicitMode;
  const explicitType = normalizeModeFromLabel(settings, fm["类型"] || fm.type || fm["模板"] || fm.template || "");
  if (explicitType) return explicitType;
  const tags = getFrontmatterTags(fm);
  for (const tag of tags) {
    const mode = normalizeModeFromLabel(settings, tag);
    if (mode) return mode;
  }
  return "";
}

function stripRecentDatePrefix(basename) {
  return String(basename || "")
    .replace(/^\d{4}-\d{2}-\d{2}(?:\s+\d{4})?\s*/, "")
    .replace(/^[-·\s]+/, "")
    .trim();
}

function getRecentModePrefixEntries(settings) {
  const entries = Object.entries(MODE_PREFIX_TO_KEY).map(([prefix, mode]) => [prefix, mode]);
  for (const [mode, label] of getVisibleModeEntries(settings, false)) entries.push([label, mode]);
  return entries
    .filter(([prefix, mode]) => prefix && mode && isKnownPolishMode(settings, mode))
    .sort((a, b) => String(b[0]).length - String(a[0]).length);
}

function detectRecentModeFromFilename(settings, basename) {
  const stem = stripRecentDatePrefix(basename);
  if (!stem) return "off";
  const inlineTag = stem.match(/(?:^|·\s*)(访谈|会议|研讨会|研讨|沙龙|小会|手记|学习记录|学习|个人笔记|招聘评估|工作纪要|学术研讨|主题沙龙|访谈调研|圆桌讨论)(?=$|[-·\s])/);
  if (inlineTag) return normalizeModeFromLabel(settings, inlineTag[1]) || "off";
  for (const [prefix, mode] of getRecentModePrefixEntries(settings)) {
    const re = new RegExp("^" + escapeRegExp(prefix) + "(?:[-·\\s]|$)");
    if (re.test(stem)) return mode;
  }
  return "off";
}

function detectRecentNoteMode(plugin, file, frontmatter) {
  const settings = plugin && plugin.settings ? plugin.settings : DEFAULT_SETTINGS;
  const fromFrontmatter = detectRecentModeFromFrontmatter(settings, frontmatter);
  const fromFilename = detectRecentModeFromFilename(settings, file && file.basename);
  if (fromFrontmatter && fromFrontmatter !== "off") return fromFrontmatter;
  if (fromFilename && fromFilename !== "off") return fromFilename;
  return fromFrontmatter || fromFilename || "off";
}

const LEXVOICE_EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const RECENT_TIME_FILTER_OPTIONS = [
  { id: "week", label: "本周" },
  { id: "today", label: "今日" },
  { id: "month", label: "本月" },
  { id: "all", label: "全部日期" },
];

const RECENT_STATUS_FILTER_OPTIONS = [
  { id: "all", label: "全部状态" },
  { id: "pending", label: "待沉淀" },
  { id: "failed", label: "转写失败" },
  { id: "raw", label: "待整理" },
  { id: "done", label: "已整理" },
];

const RECENT_TOPIC_FALLBACKS = ["招聘", "学习", "会议", "访谈", "PPT", "AI"];

function formatRecentDurationLabel(raw) {
  if (raw == null) return "";
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return formatElapsed(raw < 24 * 60 * 60 ? raw * 1000 : raw);
  }
  const text = String(raw || "").trim();
  if (!text) return "";
  const ms = parseLexVoiceDurationLabel(text);
  return ms > 0 ? formatElapsed(ms) : text;
}

function normalizeRecentTopicToken(raw) {
  let text = String(raw == null ? "" : raw).trim();
  if (!text) return "";
  text = text
    .replace(/^#/, "")
    .replace(/^主题[:：]/, "")
    .replace(/^topic[:：]/i, "")
    .trim();
  if (!text || /^lexvoice(?:\/|$)/i.test(text)) return "";
  if (/^(recording|transcript|meeting|learning-card)$/i.test(text)) return "";
  if (text.length > 18) text = text.slice(0, 18);
  return text;
}

function collectRecentTopicValues(value, out) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectRecentTopicValues(item, out);
    return;
  }
  const text = String(value || "");
  const parts = text.split(/[，,、;；\n\r]+|\s+#/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts.length ? parts : [text]) {
    const token = normalizeRecentTopicToken(part);
    if (token) out.add(token);
  }
}

function collectRecentNoteTopics(frontmatter, title, mode) {
  const topics = new Set();
  const fm = frontmatter || {};
  collectRecentTopicValues(fm["主题"], topics);
  collectRecentTopicValues(fm.topic, topics);
  collectRecentTopicValues(fm.topics, topics);
  collectRecentTopicValues(fm.tags, topics);
  collectRecentTopicValues(fm["tags"], topics);

  const source = `${title || ""} ${mode || ""}`;
  if (mode === "recruit" || /招聘|面试|JD|HR|候选人|人才/.test(source)) topics.add("招聘");
  if (mode === "learning" || /学习|课程|讲座|视频|B站|YouTube/i.test(source)) topics.add("学习");
  if (["meeting", "huddle", "seminar"].includes(mode) || /会议|纪要|同步|复盘|研讨/.test(source)) topics.add("会议");
  if (mode === "interview" || /访谈|调研|用户研究/.test(source)) topics.add("访谈");
  if (/PPT|幻灯片|AIPPT/i.test(source)) topics.add("PPT");
  if (/\bAI\b|大模型|LLM|智能/.test(source)) topics.add("AI");
  return Array.from(topics).slice(0, 8);
}

function getRecentPendingDepositPathSet(plugin) {
  const pending = normalizePeopleSuggestionCache(plugin && plugin.settings && plugin.settings.peopleSuggestionCache).pending || [];
  const set = new Set();
  for (const record of pending) {
    const path = record && (record.sourcePath || record.source);
    if (path) set.add(obsidian.normalizePath(path));
  }
  return set;
}

function getRecentNoteQuickStatus(plugin, file, pendingPathSet) {
  const queueState = getRecentQueueProcessingState(plugin, file);
  if (queueState) return queueState.kind;
  const path = file && file.path ? obsidian.normalizePath(file.path) : "";
  if (path && pendingPathSet && pendingPathSet.has(path)) return "pending";
  const frontmatter = ((plugin.app.metadataCache.getFileCache(file) || {}).frontmatter) || {};
  const statusText = String(frontmatter.status || frontmatter["状态"] || "").trim();
  if (/失败|failed/i.test(statusText)) return "failed";
  if (/待|草稿|未整理|raw|draft/i.test(statusText)) return "raw";
  return "done";
}

function getMarkdownFilesUnderFolder(app, folderPath) {
  const norm = obsidian.normalizePath(String(folderPath || "").trim());
  const folder = app && app.vault ? app.vault.getAbstractFileByPath(norm) : null;
  if (!(folder instanceof obsidian.TFolder)) return [];
  const prefix = norm ? norm + "/" : "";
  return app.vault.getMarkdownFiles()
    .filter((file) => {
      const path = obsidian.normalizePath(file && file.path || "");
      return path.startsWith(prefix);
    });
}

function getRecentNotes(plugin, limit) {
  const norm = obsidian.normalizePath(plugin.settings.mdFolder);
  const folder = plugin.app.vault.getAbstractFileByPath(norm);
  if (!(folder instanceof obsidian.TFolder)) return [];
  const moment = window.moment;
  const currentYear = moment ? moment().year() : new Date().getFullYear();
  const items = [];
  const pendingPathSet = getRecentPendingDepositPathSet(plugin);
  for (const f of getMarkdownFilesUnderFolder(plugin.app, norm)) {
    if (!(f instanceof obsidian.TFile) || f.extension !== "md") continue;
    const m = f.basename.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}))?/);
    if (!m) continue;
    const stamp = m[2] ? `${m[1]} ${m[2]}` : m[1];
    const t = moment(stamp, m[2] ? "YYYY-MM-DD HHmm" : "YYYY-MM-DD", true);
    if (!t.isValid()) continue;
    const frontmatter = ((plugin.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    const mode = detectRecentNoteMode(plugin, f, frontmatter);
    const meta = getModeMeta(plugin.settings, mode) || MODE_META.off;
    let title = stripRecentDatePrefix(f.basename);
    if (meta && meta.prefix) {
      title = title.replace(new RegExp("^" + escapeRegExp(meta.prefix) + "[-·\\s]*"), "").trim();
    }
    if (!title) title = f.basename;
    const weekday = LEXVOICE_EN_WEEKDAYS[t.day()] || t.format("dddd");
    const sameYear = t.year() === currentYear;
    const durationLabel = formatRecentDurationLabel(frontmatter["时长"] || frontmatter.duration || frontmatter["duration"]);
    const topics = collectRecentNoteTopics(frontmatter, title, mode);
    const quickStatus = getRecentNoteQuickStatus(plugin, f, pendingPathSet);
    items.push({
      file: f,
      timestamp: t.valueOf(),
      mode,
      title,
      topics,
      quickStatus,
      dateKey: t.format("YYYY-MM-DD"),
      groupTitle: weekday,
      axisPrimary: sameYear ? t.format("DD") : t.format("YYYY"),
      axisSecondary: sameYear ? t.format("M月") : t.format("M月D日"),
      displayTime: t.format(m[2] ? "HH:mm" : "MM-DD"),
      durationLabel,
    });
  }
  items.sort((a, b) => b.timestamp - a.timestamp);
  return items.slice(0, limit || 24);
}

function isSameVaultPath(a, b) {
  return !!a && !!b && obsidian.normalizePath(a) === obsidian.normalizePath(b);
}

function getQueueTasksForMarkdown(plugin, file, opts = {}) {
  if (!plugin || !plugin.queue || !Array.isArray(plugin.queue.tasks) || !(file instanceof obsidian.TFile)) return [];
  const mdPath = obsidian.normalizePath(file.path);
  const types = opts.types && opts.types.length ? new Set(opts.types) : null;
  const statuses = opts.statuses && opts.statuses.length ? new Set(opts.statuses) : null;
  return plugin.queue.tasks.filter((task) => {
    if (!task || !task.mdPath || !isSameVaultPath(task.mdPath, mdPath)) return false;
    if (types && !types.has(task.type)) return false;
    const status = task.status || "pending";
    if (statuses && !statuses.has(status)) return false;
    if (opts.failedOnly && !["failed", "missing"].includes(status)) return false;
    return true;
  });
}

function clampLexVoiceProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getSessionWorkProgressState(session, recorderState) {
  if (!session) return null;
  const progress = session.workProgress || session.aiProgress || {};
  const pct = clampLexVoiceProgress(progress.percent);
  const label = String(progress.label || "").trim();
  const detail = String(progress.detail || "").trim();
  if (session.finalizing) {
    return {
      kind: "processing",
      label: label || "AI 整理中",
      title: detail || "正在调用大模型整理纪要",
      detail: detail || "正在调用大模型整理纪要",
      percent: pct == null ? 65 : pct,
    };
  }
  if (recorderState === "recording") {
    return {
      kind: "processing",
      label: "录音中",
      title: "正在录音；分段转写会陆续写入纪要",
      detail: "正在录音；分段转写会陆续写入纪要",
      percent: pct,
    };
  }
  if (recorderState === "paused") {
    return {
      kind: "processing",
      label: "已暂停",
      title: "录音已暂停，继续后会接着处理",
      detail: "录音已暂停，继续后会接着处理",
      percent: pct,
    };
  }
  return {
    kind: "processing",
    label: label || "转写中",
    title: detail || "正在处理最后的音频片段",
    detail: detail || "正在处理最后的音频片段",
    percent: pct,
  };
}

function getActiveSessionProcessingState(plugin, file) {
  const session = plugin && plugin.session;
  if (!session || !(file instanceof obsidian.TFile) || !session.mdPath) return null;
  if (!isSameVaultPath(session.mdPath, file.path)) return null;
  const recorderState = plugin.recorder && plugin.recorder.state;
  return getSessionWorkProgressState(session, recorderState);
}

function getRecentQueueProcessingState(plugin, file) {
  const liveState = getActiveSessionProcessingState(plugin, file);
  if (liveState) return liveState;
  const tasks = getQueueTasksForMarkdown(plugin, file, { types: ["transcribe", "merge"] });
  if (!tasks.length) return null;
  const statusOf = (task) => String((task && task.status) || "pending");
  const transcribeTasks = tasks.filter((task) => task && task.type === "transcribe");
  const mergeTasks = tasks.filter((task) => task && task.type === "merge");
  const failedStatuses = new Set(["failed", "missing"]);
  const activeStatuses = new Set(["running", "processing"]);
  const blockedMergeTask = mergeTasks.find((task) => statusOf(task) === "blocked");
  if (blockedMergeTask) {
    const serviceBlocked = isLlmServiceBlockedError(blockedMergeTask.lastError || "");
    const configBlocked = isLlmConfigError(blockedMergeTask.lastError || "");
    return {
      kind: "raw",
      label: configBlocked ? "待配置" : "AI 不可用",
      title: configBlocked
        ? "AI 整理需要先补齐大模型配置；补齐后可重新整理"
        : (serviceBlocked ? "大模型服务端或账号池暂不可用；可切换模型/端点后重试" : "AI 整理请求不可自动重试；请检查错误后手动重试"),
    };
  }
  if (transcribeTasks.some((task) => failedStatuses.has(statusOf(task)))) {
    return {
      kind: "failed",
      label: "转写失败",
      title: "有音频片段转写失败；可点击重试转写片段",
    };
  }
  if (mergeTasks.some((task) => activeStatuses.has(statusOf(task)))) {
    return {
      kind: "processing",
      label: "整理中",
      title: "转写已完成，正在调用大模型整理纪要",
      percent: 65,
    };
  }
  if (transcribeTasks.some((task) => activeStatuses.has(statusOf(task)))) {
    return {
      kind: "processing",
      label: "转写中",
      title: "音频片段正在发送到转写服务",
    };
  }
  if (transcribeTasks.some((task) => statusOf(task) === "pending")) {
    return {
      kind: "processing",
      label: "待转写",
      title: "转写任务正在队列中等待处理",
    };
  }
  if (mergeTasks.some((task) => statusOf(task) === "pending")) {
    return {
      kind: "processing",
      label: "待整理",
      title: "转写已进入后续整理队列",
    };
  }
  if (mergeTasks.some((task) => failedStatuses.has(statusOf(task)))) {
    return {
      kind: "raw",
      label: "整理失败",
      title: "AI 整理失败；原始转写仍可重新整理",
    };
  }
  return null;
}


// \u5265\u6389 <details>...</details> \u6298\u53E0\u5757\uFF08\u542B\u5D4C\u5957\uFF09\uFF0C\u7528\u4E8E\u5224\u5B9A\u5F53\u524D\u6001\u65F6\u8DF3\u8FC7\u5386\u53F2\u5F52\u6863\u3002
// \u5386\u53F2\u5F52\u6863\u91CC\u6B8B\u7559\u7684\u5931\u8D25\u6807\u8BB0\u4E0D\u5E94\u8BA9"\u5F53\u524D\u5DF2\u6210\u529F"\u7684\u7EAA\u8981\u7EE7\u7EED\u4EAE\u8B66\u544A\u3002





function getAudioDurationMs(blob) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      const cleanup = () => { try { URL.revokeObjectURL(url); } catch {} };
      audio.addEventListener("loadedmetadata", () => {
        const d = audio.duration;
        cleanup();
        resolve(isFinite(d) && d > 0 ? Math.round(d * 1000) : 0);
      });
      audio.addEventListener("error", () => { cleanup(); resolve(0); });
      audio.src = url;
    } catch { resolve(0); }
  });
}

const IMPORT_LONG_AUDIO_CHUNK_MS = 5 * 60 * 1000;
const IMPORT_LONG_AUDIO_THRESHOLD_MS = 8 * 60 * 1000;
const IMPORT_LONG_AUDIO_SIZE_THRESHOLD_BYTES = 24 * 1024 * 1024;

function shouldChunkImportedAudio(blob, durationMs) {
  const size = blob && Number.isFinite(blob.size) ? blob.size : 0;
  const duration = Number(durationMs) || 0;
  return duration >= IMPORT_LONG_AUDIO_THRESHOLD_MS || size >= IMPORT_LONG_AUDIO_SIZE_THRESHOLD_BYTES;
}






// 确定性 ASR 错误：格式不被服务端接受 / 本机无法解码 / 超过体积上限 / 4xx 拒绝（密钥、余额、审核）——
// 重试同样必败，还会对大文件反复解码卡 UI、对服务端反复发必拒请求。队列对这类失败直接吃满重试退出自动重试。
// 旗标 nonRetryable 由抛错处设置（apimimoPermanentError / HTTP 4xx 分支）；正则兜底匹配已落盘任务的 lastError。




function shouldTranscodeImportedAudio(file, mime) {
  const ext = String((file && file.extension) || "").toLowerCase();
  return ext === "aac" || ext === "acc" || String(mime || "").toLowerCase().includes("audio/aac");
}

function stripLexVoiceImportAppendices(text) {
  return stripSedimentPreExtractionBlocks(String(text || ""))
    .replace(/<details>\s*<summary>\s*导入文本信息[\s\S]*?<\/details>/gi, "\n")
    .replace(/<details>\s*<summary>\s*导入文本原文[\s\S]*?<\/details>/gi, "\n")
    .replace(/<details>\s*<summary>\s*录音中实时大纲[\s\S]*?<\/details>/gi, "\n")
    .replace(/<details>\s*<summary>\s*回听时间轴[\s\S]*?<\/details>/gi, "\n")
    .replace(/<details>\s*<summary>\s*分段原始转写[\s\S]*?<\/details>/gi, "\n");
}

function cleanImportedTextForPrompt(text) {
  return String(text || "")
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractIntegratedLexVoiceBriefing(text) {
  const source = String(text || "");
  const matches = [...source.matchAll(/^##\s+(?:✨\s*)?整合版[^\n]*$/gm)];
  if (!matches.length) return "";
  const match = matches[matches.length - 1];
  const start = (match.index || 0) + match[0].length;
  const tail = source.slice(start);
  const stopPatterns = [
    /\n<details>\s*<summary>\s*导入文本信息/i,
    /\n<details>\s*<summary>\s*导入文本原文/i,
    /\n<!--\s*LEXVOICE_SEDIMENT_BEGIN/i,
  ];
  const stop = stopPatterns
    .map((re) => {
      const m = re.exec(tail);
      return m ? m.index : -1;
    })
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];
  return cleanImportedTextForPrompt(stop >= 0 ? tail.slice(0, stop) : tail);
}

export default LexVoicePlugin;

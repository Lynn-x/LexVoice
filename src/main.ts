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

export default LexVoicePlugin;

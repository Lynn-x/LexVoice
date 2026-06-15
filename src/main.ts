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

  const diagnostics = raw.diagnostics || {}
}
export default LexVoicePlugin;

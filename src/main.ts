/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// @ts-nocheck
import * as obsidian from "obsidian";
// 实时大纲"文本/状态纯函数层"已抽到独立模块并由 vitest 回归测试覆盖（src/outline-text.test.ts）。
// 这里 import 回来，保持原有调用点用裸名引用不变。
import { REALTIME_OUTLINE_STATE_MAX_NODES, normalizeRealtimeOutlineList, hashRealtimeOutlineText, getRealtimeOutlineAnchorTime, cleanRealtimeOutlineItemText, makeRealtimeOutlineNode, parseRealtimeOutlineStateFromMarkdown, mergeStableRealtimeOutlineNodes, normalizeOutlineMarkdownForDisplay, validateRealtimeOutlineMarkdown, mergeCoverageNoRegress, deriveFollowupCards, findLowEvidenceEntities, sanitizeProjectFolderName, recolorReportHtml } from "./outline-text";
import { LexVoiceSettingTab } from "./ui/settings-tab";
import { pickReportAccentColor, AudioTimeModal, PeopleDirectorySuggestionModal, QueueModal, VirtualCableSetupModal, RecruitContextModal, ImportTextModal, ImportAudioModal, BubbleWidget } from "./ui/modals";
import { LEXVOICE_UPDATE_REPO_URL, resolveUpdateRawBase, resolveUpdateRawBases, stripLexVoiceFrontmatterSimple, getRecentNoteProcessingState, lexvoiceConfirm, enumerateAudioDevices, trashLexVoiceFile, pluginBasePath, normalizeAudioInputMode, audioInputModeLabel } from "./ui/helpers";
import { isKnownPolishMode, isCustomPromptModeTemplate, makeCustomPromptModeId, getCustomPromptModeTemplate, getCustomPromptModeTemplates, getBuiltInVisiblePolishModeKeys, getVisiblePolishModeKeys, getModeMeta, getEffectivePolishMode, getVisibleModeEntries, sanitizePromptTemplate } from "./shared/mode-meta";
import { compareVersions, isLexVoiceMobileRuntime } from "./shared/util-platform";
import { normalizeKnowledgeExtractionHistory } from "./shared/util-knowledge";
import { listJDProjects } from "./recruit/jd-projects";
import { sanitizeReportFileStem, generateHtmlReportFromMarkdown, generateStyledReportFromMarkdown } from "./report/render";
import { parseElapsedMsToken, parseLexVoiceDurationLabel, TEXT_IMPORT_PRE_SUMMARY_CHUNK_CHARS, buildBriefingLanguageInstruction, applyBriefingLanguageInstruction, getSessionMetaDurationMs, getSegmentsDurationMs, truncateForLlmPrompt, splitLongTextForLlm } from "./shared/util-text";
import { JOBPORTRAIT_DIMENSIONS, DEFAULT_RECRUIT_QUALITIES, isRecruitFeatureUnlocked, buildRecruitContextPrefix, getRecruitInterviewOutline, parseRecruitQualitiesFromOutput, buildCompactRecruitContextPrefix, buildRecruitTextImportMergePrompt, generateJobPortrait, normalizeRecruitContext, hasRecruitContextContent, parseJdProject, renderRecruitCandidateBase, renderRecruitAggregateBase, ensureRecruitAggregateBase, createRecruitProject, renderRecruitHomepageTemplate, listRecruitCandidateNotes, recruitRecommendationColor } from "./recruit";
import { registerRecruitBoardView, recommendationTone } from "./recruit/bases-view";
import { normalizeAsrConcurrency, decodeAudioBlob, renderAudioBufferSliceToWav, mapLimit, transcribeImportAudioChunk, resolveTranscribeProvider, makeRecordingIssue, APIMIMO_ASR_CHUNK_MS, isApimimoAsrProvider, transcribeAudio } from "./asr/transcribe";
import { getFrontmatterTags, readFileFrontmatter, upsertFrontmatterInMarkdown, LEARNING_CARD_TAG, CONCEPT_CARD_TAG, TODO_CARD_TAG, ensureTodayDailyNoteFile } from "./shared/util-note";
import { PEOPLE_SUGGESTION_CACHE_LIMIT, normalizePeopleContextMode, splitPersonFieldValue, normalizePersonLookupText, loadPeopleDirectory, buildPeopleContextForLlm, ensurePeopleNoteRelatedBaseSection, formatPeopleBaseYaml, formatPeopleNoteMarkdown, mergeUniqueStrings, normalizePeopleSuggestion, normalizePeopleSuggestionIgnores, isPeopleSuggestionIgnored, addPeopleSuggestionIgnore, removePeopleSuggestionIgnores, getPeopleSuggestionCacheKey, normalizePeopleSuggestionCache, makePeopleSuggestionCacheRecord, isPeopleSuggestionCacheRecordCurrent, peopleSuggestionRecordToSuggestion, peopleSuggestionIgnoreRecordToSuggestion, findMatchingPersonEntry, arePeopleSuggestionsRelated, mergePeopleSuggestions, mergeSourceNoteRelatedPeopleFrontmatter, mergePersonFrontmatter, generatePeopleDirectorySuggestions, normalizePersonNameForEmail, parsePeopleFromOutput, personEntryFromFrontmatter } from "./people";
import { getSedimentTodoId, getSedimentCardId, getSedimentHotwordId, getSedimentPersonId, withSedimentCandidateIds, removeSedimentGroupDone, sanitizeSedimentText, normalizeSedimentTodoSubtasks, normalizeSedimentExtractionModel, appendSedimentPreExtractionInstruction, stripSedimentPreExtractionBlocks, extractSedimentPreExtractionBlock, splitOutSedimentBlock, appendSedimentPreExtractionBlock, upsertSedimentPreExtractionBlockInFile, generateSedimentObjects, writeSedimentObjectCards } from "./sediment";
import { createVocabularyGroups, parseVocabularyGroups, flattenVocabularyGroups, countVocabularyGroups, normalizeVocabularyInput, mergeVocabularyGroups, isStructuredVocabularyMarkdown, loadVocabularyGroups, formatVocabularyMarkdown } from "./vocabulary";
import { logLlmRequestDiagnostic, getLlmConfigIssue, isLlmConfigError, isLlmServiceBlockedError, isLlmNonRetryableError, formatLlmConfigIssue, formatLlmFailureIssue, callLlm, callBriefingMergeLlm, stripModeSuggestionBlocks } from "./llm/core";
import { DEFAULT_DAILY_MEETING_OVERVIEW_HEADING, DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE, DEFAULT_SETTINGS } from "./shared/defaults";
import type { LexVoiceSettings } from "./shared/defaults";
import { normalizeLlmProfiles, applyLlmProfileToWorkingConfig, getLlmOutputCeiling, getBriefingMergeDesiredTokens, getBriefingMergeMaxTokens, LLM_OUTPUT_CEILING_FALLBACK, classifyBriefingLength } from "./llm/config";
import { getThinkingControl } from "./llm/thinking";
import { DashScopeStreamingClient, OpenAIRealtimeTranscriptionClient, OpenAIRealtimeTranslationClient, PcmStreamEncoder } from "./asr/clients";
import { MODE_META, FRONTMATTER_SCHEMA, MODE_PREFIX_TO_KEY } from "./shared/catalog-modes";
import { SEDIMENT_GROUP_CONFIG, SEDIMENT_GROUP_ORDER, VOCABULARY_SECTIONS } from "./shared/catalog-sediment";
import { AUDIO_EXT, TEXT_IMPORT_EXT } from "./shared/catalog-import";
import { isRecord, cloneJson, pickDefined, pickNonBlankString, genId, pad, formatElapsed, sanitizeFilename, escapeRegExp, stripHtmlText, safeDecodeUriText, normalizeAudioLinkTarget } from "./shared/util-common";
import { escapeHtmlText, makeFileWikiLink } from "./shared/util-markdown";
import { mimeFromExt, extFromMime, isAsrNonRetryableError, pickMimeType, assertAudioCaptureSupported } from "./shared/util-audio";
import { isLocalLlmEndpoint } from "./shared/util-llm-endpoint";
import { obfuscateApiKey, deobfuscateApiKey, redactDiagnosticText, sanitizeDiagnosticData, diagnosticError } from "./shared/util-key-diag";
import { extractJsonObject } from "./shared/util-json";
import { MODE_BODIES } from "./prompts/mode-bodies";
import { SHARED_DISCIPLINE, STRUCTURE_LEVEL_INSTRUCTIONS } from "./prompts/discipline";
import { INDUSTRY_META_PROMPT } from "./prompts/industry-meta";
import { JOBPORTRAIT_SYSTEM_PROMPT, JOBPORTRAIT_FOLLOWUP_RULES } from "./prompts/recruit-hrbp";
import { CLEAN_TRANSCRIPT_SYSTEM, buildCleanTranscriptChunkPrompt } from "./prompts/clean-transcript";



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
  s.inboxFolder = pickDefined(storage.inboxPath, raw.inboxFolder, defaults.inboxFolder);
  s.inboxAutoImport = pickDefined(storage.autoImportInbox, raw.inboxAutoImport, defaults.inboxAutoImport);
  s.inboxArchiveSubfolder = pickDefined(storage.archiveSubfolder, raw.inboxArchiveSubfolder, defaults.inboxArchiveSubfolder);
  s.inboxStabilizeDelayMs = pickDefined(storage.syncQuietMs, raw.inboxStabilizeDelayMs, defaults.inboxStabilizeDelayMs);

  const noteNaming = raw.noteNaming || {};
  s.noteFileNameFormatNew = pickDefined(noteNaming.sessionPattern, raw.noteFileNameFormatNew, defaults.noteFileNameFormatNew);
  s.autoOpenNoteAfterFinish = pickDefined(noteNaming.openAfterFinish, raw.autoOpenNoteAfterFinish, defaults.autoOpenNoteAfterFinish);
  s.autoRenameWithTitle = pickDefined(noteNaming.renameWithTitle, raw.autoRenameWithTitle, defaults.autoRenameWithTitle);
  s.consolidatedLayout = pickDefined(noteNaming.consolidatedLayout, raw.consolidatedLayout, defaults.consolidatedLayout);
  s.sedimentAutoExtract = pickDefined(raw.sedimentAutoExtract, defaults.sedimentAutoExtract);

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
  s.thinkingMode = pickDefined(composer.thinkingMode, raw.thinkingMode, defaults.thinkingMode);
  const languagePolicy = composer.languagePolicy || raw.languagePolicy || {};
  s.briefingTranslationMode = pickDefined(languagePolicy.mode, raw.briefingTranslationMode, defaults.briefingTranslationMode);
  s.briefingTargetLanguage = pickDefined(languagePolicy.targetLanguage, raw.briefingTargetLanguage, defaults.briefingTargetLanguage);
  s.briefingCustomLanguage = pickDefined(languagePolicy.customLanguage, raw.briefingCustomLanguage, defaults.briefingCustomLanguage);
  s.briefingKeepOriginalTerms = pickDefined(languagePolicy.keepOriginalTerms, raw.briefingKeepOriginalTerms, defaults.briefingKeepOriginalTerms);
  s.briefingLanguageInstruction = pickDefined(languagePolicy.extraInstruction, raw.briefingLanguageInstruction, defaults.briefingLanguageInstruction);
  s.industryProfile = Object.assign({}, defaults.industryProfile, composer.industryProfile || raw.industryProfile || {});

  const presentation = raw.presentation || {};
  s.autoOpenHtmlReportAfterGenerate = pickDefined(presentation.openHtmlReportAfterGenerate, raw.autoOpenHtmlReportAfterGenerate, defaults.autoOpenHtmlReportAfterGenerate);
  s.reportBrandName = String(pickDefined(presentation.reportBrandName, raw.reportBrandName, defaults.reportBrandName) || "").trim();

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
      thinkingMode: s.thinkingMode || "auto",
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
      openHtmlReportAfterGenerate: s.autoOpenHtmlReportAfterGenerate !== false,
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
  errors.push("requestUrl unavailable");
  throw new Error(errors.join("；"));
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
const OBJECT_WALL_FILE = "对象总览.md";

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

function formatLexVoiceObjectWallMarkdown(settings, options = {}) {
  const title = options.title || "对象总览";
  const initialFilter = options.initialFilter || "all";
  const showFilters = options.showFilters !== false;
  const emptyText = options.emptyText || "还没有找到沉淀对象。完成纪要沉淀后，学习卡片、概念和待办会出现在这里。";
  const learningFolderQuery = JSON.stringify('"' + obsidian.normalizePath(settings && settings.learningCardsFolder || DEFAULT_SETTINGS.learningCardsFolder || "") + '"');
  const todoFolderQuery = JSON.stringify('"' + obsidian.normalizePath(settings && settings.todoCardsFolder || DEFAULT_SETTINGS.todoCardsFolder || "") + '"');
  const learningTag = JSON.stringify("#" + LEARNING_CARD_TAG);
  const conceptTag = JSON.stringify("#" + CONCEPT_CARD_TAG);
  const todoTag = JSON.stringify("#" + TODO_CARD_TAG);
  return [
    "---", "cssclasses:", "  - lvwall-page", "---", "", "# " + title, "", "```dataviewjs",
    "const shell = dv.el(\"div\", \"\", { cls: \"lvwall-shell\" });",
    "const toolbar = document.createElement(\"div\");",
    "toolbar.className = \"lvwall-filterbar\";",
    "const root = document.createElement(\"div\");",
    "root.className = \"lvwall lvwall-object\";",
    "shell.appendChild(toolbar);",
    "shell.appendChild(root);",
    "const learningFolderQuery = " + learningFolderQuery + ";",
    "const todoFolderQuery = " + todoFolderQuery + ";",
    "const learningTag = " + learningTag + ";",
    "const conceptTag = " + conceptTag + ";",
    "const todoTag = " + todoTag + ";",
    "const showFilters = " + (showFilters ? "true" : "false") + ";",
    "let activeFilter = " + JSON.stringify(initialFilter) + ";",
    "const labels = { all: \"全部\", learning: \"学习卡片\", concept: \"概念\", todo: \"待办\" };",
    "const records = [];",
    "const seen = new Set();",
    "const esc = s => String(s ?? \"\").replace(/[&<>\\\"]/g, c => c === \"&\" ? \"&amp;\" : c === \"<\" ? \"&lt;\" : c === \">\" ? \"&gt;\" : \"&quot;\");",
    "const cleanTag = t => String(t || \"\").replace(/^#/, \"\");",
    "const hasTag = (p, tag) => (p.file.tags || []).map(cleanTag).includes(cleanTag(tag));",
    "const sourceName = src => src ? String(src.path ?? src).split(\"/\").pop().replace(/\\.md$|[\\[\\]]/g, \"\") : \"\";",
    "function pushRecord(record){ if (!record || !record.id || seen.has(record.id)) return; seen.add(record.id); records.push(record); }",
    "function columnCount(width, mode){ if (mode === \"todo\") return width >= 720 ? 2 : 1; if (width >= 1320) return 4; if (width >= 960) return 3; if (width >= 620) return 2; return 1; }",
    "function layoutWidth(){ const selectors = [\".workspace-leaf-content\", \".view-content\", \".markdown-preview-view\", \".markdown-reading-view\", \".markdown-source-view\"]; const nodes = selectors.map(sel => root.closest(sel)).filter(Boolean); nodes.push(root.parentElement, root); for (const node of nodes) { const rect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null; const width = Math.floor(Math.max(node && node.clientWidth || 0, rect && rect.width || 0)); if (width > 120) return width; } return window.innerWidth || 0; }",
    "function cardWeight(card){ return 10 + String(card.title || \"\").length * 1.2 + String(card.sum || \"\").length * 0.34 + String(card.src || \"\").length * 0.16 + (card.tagCount || 0) * 3; }",
    "function addPageCard(p, kind){",
    "  const kindLabel = kind === \"concept\" ? \"概念\" : \"学习卡片\";",
    "  const type = String(p[\"卡片类型\"] || p[\"类型\"] || kindLabel);",
    "  const title = String(p[\"标题\"] || p[\"事项\"] || p.file.name || kindLabel);",
    "  const sum = String(p[\"摘要\"] || p[\"说明\"] || p[\"任务\"] || p[\"事项\"] || \"\");",
    "  const src = sourceName(p[\"来源笔记\"] || p[\"来源\"]);",
    "  const tags = (p.file.tags || []).map(t => '<span class=\\\"lvwall-tag\\\">' + esc(cleanTag(t)) + '</span>').join(\"\");",
    "  const ct = p.file.ctime ? p.file.ctime.toFormat(\"yyyy-MM-dd HH:mm\") : \"\";",
    "  pushRecord({ id: kind + \":\" + p.file.path, kind, type, title, sum, src, tags, time: ct, path: p.file.path, tagCount: (p.file.tags || []).length });",
    "}",
    "function stripTodoMarker(text){ return String(text || \"\").replace(/<!--\\s*lexvoice-todo:[\\s\\S]*?-->/g, \"\").trim(); }",
    "function readField(text, label){ const m = String(text || \"\").match(new RegExp(label + \"：([^\\\\n]+?)(?=\\\\s+(?:日期|责任人|事项|截止|时间)：|\\\\s+👤|\\\\s+\\\\(来源:|$)\")); return m ? m[1].trim() : \"\"; }",
    "function addTodoRecord(p, task){",
    "  const raw = stripTodoMarker(task && task.text || \"\");",
    "  const markerMatch = String(task && task.text || \"\").match(/lexvoice-todo:([^\\s>]+)/);",
    "  const marker = markerMatch ? markerMatch[1] : \"\";",
    "  const title = String(p[\"事项\"] || readField(raw, \"事项\") || raw || p.file.name || \"未命名待办\").replace(/^[-*]\\s*/, \"\");",
    "  const owner = String(p[\"责任人\"] || readField(raw, \"责任人\") || (raw.match(/👤\\s*([^\\s]+)/) || [])[1] || \"\").trim();",
    "  const due = String(p[\"截止\"] || readField(raw, \"截止\") || \"\").trim();",
    "  const src = sourceName(p[\"来源笔记\"] || p[\"来源\"]);",
    "  const children = Array.from(task && task.children || []).map(item => stripTodoMarker(item.text)).filter(Boolean).slice(0, 4);",
    "  const line = Number(task && task.line);",
    "  const id = \"todo:\" + p.file.path + \":\" + (Number.isFinite(line) ? line : marker || title);",
    "  pushRecord({ id, kind: \"todo\", type: \"待办\", title, sum: owner || due ? [owner && \"责任人：\" + owner, due && \"截止：\" + due].filter(Boolean).join(\" · \") : \"\", owner, due, src, subtasks: children, path: p.file.path, line, marker, completed: !!(task && task.completed), tagCount: 0 });",
    "}",
    "for (const p of dv.pages(learningFolderQuery)) {",
    "  const concept = hasTag(p, conceptTag);",
    "  const learning = hasTag(p, learningTag);",
    "  if (concept) addPageCard(p, \"concept\");",
    "  else if (learning) addPageCard(p, \"learning\");",
    "}",
    "for (const p of dv.pages(todoFolderQuery)) {",
    "  if (!hasTag(p, todoTag)) continue;",
    "  const tasks = Array.from(p.file.tasks || []).filter(t => !t.parent);",
    "  if (tasks.length) tasks.forEach(t => addTodoRecord(p, t));",
    "  else pushRecord({ id: \"todo-page:\" + p.file.path, kind: \"todo\", type: \"待办\", title: String(p[\"事项\"] || p.file.name), sum: [p[\"责任人\"] && \"责任人：\" + p[\"责任人\"], p[\"截止\"] && \"截止：\" + p[\"截止\"]].filter(Boolean).join(\" · \"), path: p.file.path, completed: String(p[\"状态\"] || \"\") === \"完成\", tagCount: 0 });",
    "}",
    "for (const p of dv.pages()) {",
    "  for (const task of Array.from(p.file.tasks || [])) {",
    "    if (String(task.text || \"\").includes(\"lexvoice-todo:\")) addTodoRecord(p, task);",
    "  }",
    "}",
    "records.sort((a, b) => String(b.time || b.path || \"\").localeCompare(String(a.time || a.path || \"\")));",
    "function filteredRecords(){ return activeFilter === \"all\" ? records : records.filter(r => r.kind === activeFilter); }",
    "function recordHtml(record){",
    "  if (record.kind === \"todo\") {",
    "    const subtasks = (record.subtasks || []).map(item => '<li>' + esc(item) + '</li>').join(\"\");",
    "    return '<div class=\\\"lvwall-card lvwall-todo-card' + (record.completed ? ' is-completed' : '') + '\\\" data-kind=\\\"todo\\\" data-id=\\\"' + esc(record.id) + '\\\" data-path=\\\"' + esc(record.path) + '\\\">' + '<label class=\\\"lvwall-todo-check\\\" title=\\\"切换完成状态\\\"><input type=\\\"checkbox\\\" data-id=\\\"' + esc(record.id) + '\\\" ' + (record.completed ? 'checked' : '') + '><span></span></label>' + '<div class=\\\"lvwall-todo-body\\\"><div class=\\\"lvwall-head\\\"><span class=\\\"lvwall-type\\\">待办</span><span class=\\\"lvwall-brand\\\">ACTION</span></div><div class=\\\"lvwall-title\\\">' + esc(record.title) + '</div>' + (record.sum ? '<div class=\\\"lvwall-sum\\\">' + esc(record.sum) + '</div>' : '') + (subtasks ? '<ul class=\\\"lvwall-subtasks\\\">' + subtasks + '</ul>' : '') + (record.src ? '<div class=\\\"lvwall-k\\\">来源</div><div class=\\\"lvwall-src\\\">' + esc(record.src) + '</div>' : '') + '</div></div>';",
    "  }",
    "  return '<div class=\\\"lvwall-card\\\" data-kind=\\\"' + esc(record.kind) + '\\\" data-path=\\\"' + esc(record.path) + '\\\">' + '<div class=\\\"lvwall-head\\\"><span class=\\\"lvwall-type\\\">' + esc(record.type) + '</span><span class=\\\"lvwall-brand\\\">' + (record.kind === 'concept' ? 'CONCEPT' : 'LEARNING') + '</span></div>' + '<div class=\\\"lvwall-title\\\">' + esc(record.title) + '</div>' + (record.sum ? '<div class=\\\"lvwall-k\\\">摘要</div><div class=\\\"lvwall-sum\\\">' + esc(record.sum) + '</div>' : '') + (record.src ? '<div class=\\\"lvwall-k\\\">来源</div><div class=\\\"lvwall-src\\\">' + esc(record.src) + '</div>' : '') + (record.tags ? '<div class=\\\"lvwall-tags\\\">' + record.tags + '</div>' : '') + (record.time ? '<div class=\\\"lvwall-time\\\">' + esc(record.time) + '</div>' : '') + '</div>';",
    "}",
    "async function setTaskDone(record, done){",
    "  if (!record || !record.path) return;",
    "  const file = app.vault.getAbstractFileByPath(record.path);",
    "  if (!file) return;",
    "  const text = await app.vault.cachedRead(file);",
    "  const eol = text.includes(\"\\r\\n\") ? \"\\r\\n\" : \"\\n\";",
    "  const lines = text.split(/\\r?\\n/);",
    "  let idx = Number(record.line);",
    "  if (!Number.isFinite(idx) || !lines[idx] || !/^\\s*-\\s\\[[ xX/-]\\]/.test(lines[idx])) {",
    "    idx = record.marker ? lines.findIndex(line => line.includes(\"lexvoice-todo:\" + record.marker)) : -1;",
    "  }",
    "  if (idx < 0 || !lines[idx]) return;",
    "  lines[idx] = lines[idx].replace(/^(\\s*-\\s\\[)[ xX/-](\\]\\s*)/, '$1' + (done ? 'x' : ' ') + '$2');",
    "  await app.vault.modify(file, lines.join(eol));",
    "  record.completed = done;",
    "}",
    "function renderToolbar(){",
    "  toolbar.innerHTML = \"\";",
    "  if (!showFilters) { toolbar.style.display = \"none\"; return; }",
    "  const filters = [\"all\", \"learning\", \"concept\", \"todo\"];",
    "  for (const key of filters) {",
    "    const count = key === \"all\" ? records.length : records.filter(r => r.kind === key).length;",
    "    const btn = document.createElement(\"button\");",
    "    btn.type = \"button\";",
    "    btn.className = \"lvwall-filter\" + (activeFilter === key ? \" is-active\" : \"\");",
    "    btn.textContent = labels[key] + \" \" + count;",
    "    btn.addEventListener(\"click\", () => { activeFilter = key; renderToolbar(); renderWall(); });",
    "    toolbar.appendChild(btn);",
    "  }",
    "}",
    "function bindCards(){",
    "  root.querySelectorAll(\".lvwall-card\").forEach(el => el.addEventListener(\"click\", event => { if (event.target && event.target.closest && event.target.closest(\"input,label,button\")) return; const path = el.dataset.path; if (path) app.workspace.openLinkText(path, \"\", false); }));",
    "  root.querySelectorAll(\".lvwall-todo-check input\").forEach(input => input.addEventListener(\"change\", async event => { event.stopPropagation(); const record = records.find(r => r.id === input.dataset.id); if (!record) return; const card = input.closest(\".lvwall-todo-card\"); try { await setTaskDone(record, input.checked); if (card) card.classList.toggle(\"is-completed\", input.checked); } catch(e) { console.error(e); new Notice(\"待办状态写回失败：\" + (e.message || e)); input.checked = !input.checked; } }));",
    "}",
    "let lastCols = 0; let raf = 0;",
    "function renderWall(){",
    "  const visible = filteredRecords();",
    "  const width = layoutWidth();",
    "  const cols = columnCount(width, activeFilter);",
    "  root.className = \"lvwall lvwall-object\" + (activeFilter === \"todo\" ? \" lvwall-todos\" : \"\");",
    "  root.style.setProperty(\"--lvwall-columns\", String(cols));",
    "  root.style.setProperty(\"--lvwall-gutter\", (width < 680 ? 18 : 24) + \"px\");",
    "  if (!visible.length) { root.classList.add(\"is-empty\"); root.innerHTML = " + JSON.stringify("<p>" + emptyText + "</p>") + "; return; }",
    "  root.classList.remove(\"is-empty\");",
    "  const buckets = Array.from({ length: cols }, () => ({ weight: 0, html: \"\" }));",
    "  for (const record of visible) {",
    "    let target = 0;",
    "    for (let i = 1; i < buckets.length; i++) if (buckets[i].weight < buckets[target].weight) target = i;",
    "    buckets[target].html += recordHtml(record);",
    "    buckets[target].weight += cardWeight(record);",
    "  }",
    "  root.innerHTML = buckets.map(b => '<div class=\\\"lvwall-col\\\">' + b.html + '</div>').join(\"\");",
    "  bindCards();",
    "  lastCols = cols;",
    "}",
    "function scheduleLayout(){ if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { raf = 0; const width = layoutWidth(); const cols = columnCount(width, activeFilter); root.style.setProperty(\"--lvwall-columns\", String(cols)); root.style.setProperty(\"--lvwall-gutter\", (width < 680 ? 18 : 24) + \"px\"); if (cols !== lastCols) renderWall(); }); }",
    "renderToolbar();",
    "renderWall();",
    "if (typeof ResizeObserver !== \"undefined\") { const ro = new ResizeObserver(scheduleLayout); [root, root.parentElement, shell, shell.parentElement, root.closest(\".markdown-preview-view\"), root.closest(\".markdown-reading-view\"), root.closest(\".markdown-source-view\"), root.closest(\".view-content\"), root.closest(\".workspace-leaf-content\")].filter(Boolean).forEach(el => ro.observe(el)); }",
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
  return formatLexVoiceObjectWallMarkdown(settings, {
    title: "待办墙",
    initialFilter: "todo",
    showFilters: false,
    emptyText: "没有找到待办卡片。会议纪要中的明确行动项可在确认后沉淀为待办。"
  });
}

function formatObjectWallMarkdown(settings) {
  return formatLexVoiceObjectWallMarkdown(settings, {
    title: "对象总览",
    initialFilter: "all",
    showFilters: true,
    emptyText: "还没有找到沉淀对象。完成纪要沉淀后，学习卡片、概念和待办会出现在这里。"
  });
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

**待办任务语法**：凡是正文中出现待办 / 行动项 / 下一步，请统一使用 Markdown todo 任务列表，不要用表格、普通项目符号或 \`TODO:\` 前缀。格式：\`- [ ] 责任人：<人> 事项：<具体动作> 截止：<时间>\`；如果位于 callout 内，保留引用前缀写成 \`> - [ ] ...\`。无法判断责任人或截止时间时**直接省略该字段**（不写「未提及」），也不要编造。

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
- 连续 callout 之间必须用**一个普通空行**隔开：上一个 callout 结束后直接空一行（**行首不要写 \`>\`**），再写下一个 \`> [!type]\`；**不要**用 \`>\` 空引用行去分隔——那样 Obsidian 会把它们当作同一个引用块、合并成一个 callout 显示

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
  // eslint-disable-next-line no-unreachable -- intentionally disabled feature; unreachable code retained for easy restore
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
  return /[(（][^)）]*?(冲突|conflict|conflicted\s*copy)[^(（]*[)）]/i.test(name);
}

























// 从源纪要 frontmatter 取"人物"维度的人名：同时认 ① 新独立属性 人物（people 别名兼容）
// ② 旧笔记里 tags 的 人物/x 前缀。是"人物单列后"所有消费源纪要人物处的单一收口点。



























































// 把正文里那段沉淀元数据 HTML 注释「原样」拆出来，返回 { body, block }。
// 用途：写最终纪要时，把这坨机器可读 JSON 从"正文与原始材料之间"挪到笔记最末尾，
// 编辑模式下不再夹在中间难看（阅读视图本就因 HTML 注释而隐藏）。保留原始匹配文本不重排，
// 避免 JSON 轻微不规范时反序列化丢数据。
















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
  const variantFiles = [];
  const pendingPathSet = getRecentPendingDepositPathSet(plugin);
  for (const f of getMarkdownFilesUnderFolder(plugin.app, norm)) {
    if (!(f instanceof obsidian.TFile) || f.extension !== "md") continue;
    const frontmatter = ((plugin.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    // 派生版本（清稿/另存版本等）不当独立会议罗列——收集起来，稍后按 source_path 挂到母本下。
    if (frontmatter["类型"] === "LexVoice派生版本" || frontmatter.contains_raw === false) {
      variantFiles.push({ file: f, fm: frontmatter });
      continue;
    }
    const mode = detectRecentNoteMode(plugin, f, frontmatter);
    // 是否 LexVoice 纪要：能识别出 mode（非 off）或 frontmatter 自带 mode / lexvoice 标记。
    // 手动改名（丢掉日期前缀）的纪要也要保留，否则在纪要面板里找不到、没法重新整理。
    const isLexVoiceNote = (mode && mode !== "off") || !!frontmatter.mode
      || /lexvoice/i.test(String(frontmatter.tags || frontmatter.tag || ""));
    const m = f.basename.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}))?/);
    if (!m && !isLexVoiceNote) continue;
    let t = null;
    if (m) {
      const stamp = m[2] ? `${m[1]} ${m[2]}` : m[1];
      t = moment(stamp, m[2] ? "YYYY-MM-DD HHmm" : "YYYY-MM-DD", true);
    }
    if (!t || !t.isValid()) {
      // 无合法日期前缀（典型=被手动改名）→ 退回 frontmatter 时间，再退回文件 ctime/mtime。
      const fmTime = frontmatter.time || frontmatter["时间"] || frontmatter.date || frontmatter["日期"];
      t = fmTime ? moment(fmTime) : null;
      if (!t || !t.isValid()) t = moment((f.stat && (f.stat.ctime || f.stat.mtime)) || undefined);
    }
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
      displayTime: t.format(m && m[2] ? "HH:mm" : "MM-DD"),
      durationLabel,
    });
  }
  // 把派生版本挂到各自母本下（按 source_path 归并；母本不在列表里的派生暂不显示，仍可经反链/文件树找到）。
  if (variantFiles.length) {
    const byPath = new Map();
    for (const it of items) byPath.set(obsidian.normalizePath(it.file.path), it);
    for (const v of variantFiles) {
      const sp = v.fm.source_path ? obsidian.normalizePath(String(v.fm.source_path)) : "";
      const host = sp ? byPath.get(sp) : null;
      if (!host) continue;
      (host.variants || (host.variants = [])).push({
        file: v.file,
        label: String(v.fm.variant_label || v.fm.variant_kind || "派生版本"),
        kind: String(v.fm.variant_kind || ""),
        sourcePath: sp,
        mtime: (v.file.stat && v.file.stat.mtime) || 0,
      });
    }
    for (const it of items) if (it.variants) it.variants.sort((a, b) => a.mtime - b.mtime);
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
      const audio = activeDocument.createElement("audio");
      audio.preload = "metadata";
      const cleanup = () => { try { URL.revokeObjectURL(url); } catch { /* intentionally empty */ } };
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

function extractLexVoiceRawTranscriptForImport(text) {
  const segments = extractLexVoiceTranscriptSegments(text);
  if (!segments.length) return "";
  return segments
    .map((seg, i) => {
      const label = Number.isFinite(seg.index) ? seg.index + 1 : i + 1;
      return [`### 原始转写 ${label}`, "", String(seg.text || "").trim()].join("\n");
    })
    .filter((block) => block.trim())
    .join("\n\n");
}

function stripImportedTextSource(text) {
  const withoutFrontmatter = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .trim();
  if (!withoutFrontmatter) return "";

  const withoutAppendices = stripLexVoiceImportAppendices(withoutFrontmatter);
  const hasLexVoiceMarker = /<!--\s*lexvoice-session(?::|\s*--)/.test(withoutFrontmatter)
    || /<!--\s*lexvoice-segments-start/.test(withoutFrontmatter)
    || /##\s+(?:✨\s*)?整合版/.test(withoutFrontmatter);
  if (hasLexVoiceMarker) {
    const integrated = extractIntegratedLexVoiceBriefing(withoutAppendices);
    if (integrated) return integrated;
    const rawTranscript = extractLexVoiceRawTranscriptForImport(withoutFrontmatter);
    if (rawTranscript) return rawTranscript;
  }

  return cleanImportedTextForPrompt(withoutAppendices);
}






function buildImportedTextSegment(source, index) {
  const file = source && source.file;
  const name = source && source.name ? source.name : (file && file.name) || `文本 ${index + 1}`;
  const path = source && source.path ? source.path : (file && file.path) || "";
  const link = path ? `[[${path}|${name}]]` : name;
  const body = String(source && source.text || "").trim();
  return [`【文本来源 ${index + 1}：${link}】`, "", body].join("\n");
}

function splitImportedTextIntoNormalSegments(sources) {
  const result = [];
  let offsetMs = 0;
  const virtualSegmentMs = 5 * 60 * 1000;
  for (const source of sources || []) {
    const text = buildImportedTextSegment(source, result.length);
    if (!text.trim()) continue;
    result.push({
      index: result.length,
      startOffsetMs: offsetMs,
      endOffsetMs: offsetMs + virtualSegmentMs,
      audioName: "",
      audioPath: "",
      sourceName: source.name,
      sourcePath: source.path,
      rawText: source.text,
      text,
      error: null,
      isFinal: false,
    });
    offsetMs += virtualSegmentMs;
  }
  if (result.length) result[result.length - 1].isFinal = true;
  return result;
}

function isTextImportSession(session) {
  return !!(session && session.source === "text-import");
}

function buildTextImportInfoDetails(session, modeLabel, model) {
  if (!isTextImportSession(session)) return "";
  const lines = [];
  if (session.startedAt && window.moment) lines.push(`- 时间：${window.moment(session.startedAt).format("YYYY-MM-DD HH:mm:ss")}`);
  if (modeLabel) lines.push(`- 模式：${modeLabel}`);
  const sources = Array.isArray(session.textImportSources) ? session.textImportSources : [];
  lines.push(`- 来源文件：${sources.length || (session.segments || []).length || 1}`);
  if (model) lines.push(`- 模型：${model}`);
  if (sources.length) {
    lines.push("", "来源：");
    for (const item of sources) {
      const name = item.name || (item.path ? item.path.split("/").pop() : "") || "未命名文本";
      lines.push(`- ${item.path ? `[[${item.path}|${name}]]` : name}`);
    }
  }
  return [
    "<details>",
    "<summary>导入文本信息</summary>",
    "",
    lines.join("\n"),
    "",
    "</details>",
  ].join("\n");
}

function buildTextImportSourceDetails(session) {
  if (!isTextImportSession(session)) return "";
  const segments = Array.isArray(session.segments) ? session.segments : [];
  if (!segments.length) return "";
  const lines = [];
  segments.forEach((seg, i) => {
    const name = seg.sourceName || `文本 ${i + 1}`;
    const path = seg.sourcePath || "";
    const link = path ? `[[${path}|${name}]]` : name;
    const body = String(seg.rawText || seg.text || "").trim() || "_[此文本来源为空]_";
    lines.push(`### ${i + 1}. ${link}`, "", body, "");
  });
  return [
    "<details>",
    `<summary>导入文本原文（${segments.length} 个来源）</summary>`,
    "",
    lines.join("\n").trim(),
    "",
    "</details>",
  ].join("\n");
}

// ============================================================
// DashScope Paraformer Realtime 流式客户端（WebSocket）
// 协议：wss://dashscope.aliyuncs.com/api-ws/v1/inference
// 鉴权：Authorization: bearer <api_key> —— 在 Electron 渲染进程通过
//   require("ws") 走 Node 端 WebSocket 以支持自定义 header（浏览器原生 WebSocket 不支持）
// ============================================================


// ============================================================
// OpenAI Realtime · gpt-realtime-whisper（流式 ASR）
// 端点：wss://api.openai.com/v1/realtime
// 协议：session.update 设 session.type="transcription" → input_audio_buffer.append（base64 PCM 24kHz）
//       → conversation.item.input_audio_transcription.delta / .completed
// ============================================================

// ============================================================
// OpenAI Realtime · gpt-realtime-translate（流式语音翻译，仅取文字）
// 端点：wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate
// 协议：session.update 设 session.audio.output.language="zh"
//       session.input_audio_buffer.append（base64 PCM 24kHz）
//       → session.input_transcript.delta / .completed（原文）
//       → session.output_transcript.delta / .completed（译文）
//       output_audio.delta 直接丢弃
// ============================================================

// ============================================================
// 流式转写客户端工厂：根据 profile.streamProtocol 返回对应实现
// 所有客户端遵守相同接口：connect / sendAudioFrame / finish / getFullText
// 回调：onPartial(text, isFinal) / onError(err) / onClosed(info)
// ============================================================
function createStreamingTranscriptionClient(profile, provider, callbacks) {
  const opts = Object.assign({}, callbacks || {}, {
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
    language: provider.language,
    targetLanguage: provider.targetLanguage,
  });
  switch (profile.streamProtocol) {
    case "openai-realtime-transcription":
      return new OpenAIRealtimeTranscriptionClient(opts);
    case "openai-realtime-translation":
      return new OpenAIRealtimeTranslationClient(opts);
    case "dashscope-ws":
    default:
      return new DashScopeStreamingClient(opts);
  }
}

// ============================================================
// PCM 实时编码器：MediaStream → PCM 16-bit mono 帧（默认 16kHz，可设 24kHz）
// 用 ScriptProcessorNode（已废弃但 Electron 下兼容性最好）
// ============================================================

class RecorderService {
  declare plugin: LexVoicePlugin;
  constructor(plugin) {
    this.plugin = plugin;
    this.recorder = null;
    this.masterRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.masterChunks = [];
    this.mime = "";
    this.masterMime = "";
    this.sessionStartedAt = 0;
    this.segmentStartOffsetMs = 0;
    this.pausedFor = 0;
    this.pausedAt = 0;
    this.state = "idle";
    this.segmentIndex = 0;
    this.segmentDurationMs = 0;
    this.quickCutMarksMs = [];
    this.nextCutAtElapsed = Infinity;
    this.cutting = false;
    this.onSegment = null;
    this.listeners = new Set();
    this.ticker = null;
    this.levelMeters = [];
    this.audioLevel = 0;
    this.issue = null;
    this.stopping = false;
    this.streamInterruptionCleanup = null;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { const info = this.getInfo(); for (const fn of this.listeners) fn(info); }
  getInfo() {
    let elapsed = 0;
    if (this.state === "recording") elapsed = Date.now() - this.sessionStartedAt - this.pausedFor;
    else if (this.state === "paused") elapsed = this.pausedAt - this.sessionStartedAt - this.pausedFor;
    return {
      state: this.state,
      elapsed,
      segmentIndex: this.segmentIndex,
      audioLevel: this.audioLevel || 0,
      sourceLevels: this.getSourceLevels(),
      issue: this.issue || null,
    };
  }
  async start(options) {
    if (this.state !== "idle") return;
    assertAudioCaptureSupported();
    const captureMode = resolveRuntimeAudioInputMode((options && options.captureMode) || "mic");
    this.stream = await this.acquireStream(captureMode);
    if (!this.stream) throw new Error("未取得可用的麦克风录音流。请检查系统麦克风权限。");
    this.issue = null;
    this.stopping = false;
    this.attachStreamInterruptionHandlers(this.stream);
    // 选 APIMiMo 时录 Opus：它只收 wav/mp3，段落要本机解码转 WAV，而 Electron 解不了 AAC（解得了 Opus）。
    let preferOpus = false;
    try { preferOpus = isApimimoAsrProvider(resolveTranscribeProvider(this.plugin)); } catch { /* intentionally empty */ }
    this.mime = pickMimeType(preferOpus);
    this.segmentIndex = 0;
    this.segmentStartOffsetMs = 0;
    this.pausedFor = 0;
    this.onSegment = (options && options.onSegment) || null;
    this.segmentDurationMs = (options && options.segmentDurationMs) || 0;
    this.quickCutMarksMs = this.segmentDurationMs > 0 && Array.isArray(options && options.quickCutMarksMs)
      ? options.quickCutMarksMs.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
      : [];
    this.nextCutAtElapsed = this.getNextCutAtElapsed(0);
    this.cutting = false;
    this.sessionStartedAt = Date.now();
    this.state = "recording";
    // 静音统计计数器：每场录音开始时清零（续录也走 start()，故不会跨场污染）。
    this._voicedTicks = 0;
    this._silentTicks = 0;
    this.startLevelMeter(this.stream);
    this.startMasterRecorder();
    this.startNewRecorder();
    if (options && typeof options.onStreamReady === "function") {
      try { await options.onStreamReady(this.stream); }
      catch (e) { console.error("[LexVoice] onStreamReady failed", e); }
    }
    this.ticker = window.setInterval(() => this.tick(), 160);
    this.emit();
  }
  attachStreamInterruptionHandlers(stream) {
    if (this.streamInterruptionCleanup) {
      try { this.streamInterruptionCleanup(); } catch { /* intentionally empty */ }
      this.streamInterruptionCleanup = null;
    }
    const tracks = stream && typeof stream.getTracks === "function" ? stream.getTracks() : [];
    const cleanups = [];
    const onEnded = () => this.handleStreamInterrupted("ended");
    const onMute = () => {
      window.setTimeout(() => {
        if (this.stopping || this.state === "idle") return;
        const liveTracks = this.stream && typeof this.stream.getAudioTracks === "function" ? this.stream.getAudioTracks() : [];
        if (liveTracks.length && liveTracks.every((track) => track.readyState === "ended")) this.handleStreamInterrupted("muted");
      }, 600);
    };
    for (const track of tracks) {
      try { track.addEventListener("ended", onEnded); cleanups.push(() => track.removeEventListener("ended", onEnded)); } catch { /* intentionally empty */ }
      try { track.addEventListener("mute", onMute); cleanups.push(() => track.removeEventListener("mute", onMute)); } catch { /* intentionally empty */ }
    }
    this.streamInterruptionCleanup = () => cleanups.forEach((fn) => { try { fn(); } catch { /* intentionally empty */ } });
  }
  handleStreamInterrupted(reason) {
    if (this.stopping || this.state === "idle" || (this.issue && this.issue.kind === "microphone")) return;
    const stoppedAtMs = this.getInfo().elapsed;
    this.issue = makeRecordingIssue("microphone", {
      reason,
      stoppedAtMs,
      message: "系统在录音过程中收回了麦克风权限。",
    });
    this.state = "paused";
    this.pausedAt = Date.now();
    try {
      if (this.plugin && typeof this.plugin.setRecordingIssue === "function") {
        this.plugin.setRecordingIssue("microphone", this.issue);
      }
    } catch { /* intentionally empty */ }
    this.emit();
  }
  getStreamLabel(stream, fallback) {
    const track = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null;
    return (track && track.label) || fallback;
  }
  createLevelMeter(kind, icon, label, stream) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !stream) {
      console.warn(`[LexVoice][meter] ${kind} 创建失败：no AudioContext / no stream`, { hasCtx: !!Ctx, hasStream: !!stream });
      return null;
    }
    let ctx;
    try { ctx = new Ctx(); }
    catch (e) {
      console.error(`[LexVoice][meter] ${kind} new AudioContext 失败`, e);
      return null;
    }
    let source;
    try { source = ctx.createMediaStreamSource(stream); }
    catch (e) {
      console.error(`[LexVoice][meter] ${kind} createMediaStreamSource 失败`, e, {
        tracks: stream.getAudioTracks().map(t => ({ label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
      });
      try { ctx.close(); } catch { /* intentionally empty */ }
      return null;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.56;
    source.connect(analyser);
    if (ctx.state === "suspended" && ctx.resume) {
      ctx.resume().then(
        () => console.log(`[LexVoice][meter] ${kind} AudioContext resumed`),
        (e) => console.warn(`[LexVoice][meter] ${kind} AudioContext resume 失败`, e)
      );
    }
    const tracks = stream.getAudioTracks();
    console.log(`[LexVoice][meter] ${kind} 已挂载：`, {
      label,
      ctxState: ctx.state,
      sampleRate: ctx.sampleRate,
      trackCount: tracks.length,
      tracks: tracks.map(t => ({ label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
    });
    return {
      kind,
      icon,
      label,
      context: ctx,
      source,
      analyser,
      timeData: new Uint8Array(analyser.fftSize),
      freqData: new Uint8Array(analyser.frequencyBinCount),
      level: 0,
      bars: new Array(12).fill(0),
      _resumeAttempts: 0,
    };
  }
  startLevelMeter(stream) {
    this.stopLevelMeter();
    try {
      const meters = [];
      if (this.micStreamRef) {
        const label = this.getStreamLabel(this.micStreamRef, "麦克风");
        const meter = this.createLevelMeter("mic", "●", label, this.micStreamRef);
        if (meter) meters.push(meter);
      }
      if (this.virtStreamRef) {
        const label = this.getStreamLabel(this.virtStreamRef, "电脑音频输入");
        const meter = this.createLevelMeter("computer", "●", label, this.virtStreamRef);
        if (meter) meters.push(meter);
      }
      if (!meters.length && stream) {
        const label = this.getStreamLabel(stream, "输入");
        const meter = this.createLevelMeter("input", "●", label, stream);
        if (meter) meters.push(meter);
      }
      this.levelMeters = meters;
      this.updateAudioLevel();
    } catch (e) {
      console.error("[LexVoice] level meter failed", e);
      this.stopLevelMeter();
    }
  }
  stopLevelMeter() {
    for (const meter of this.levelMeters || []) {
      try { if (meter.source) meter.source.disconnect(); } catch { /* intentionally empty */ }
      try { if (meter.analyser) meter.analyser.disconnect(); } catch { /* intentionally empty */ }
      try { if (meter.context) meter.context.close(); } catch { /* intentionally empty */ }
    }
    this.levelMeters = [];
    this.audioLevel = 0;
  }
  updateAudioLevel() {
    if (!this.levelMeters || !this.levelMeters.length || this.state !== "recording") {
      if (this.state !== "recording") this.audioLevel = 0;
      return this.audioLevel || 0;
    }
    let maxLevel = 0;
    for (const meter of this.levelMeters) {
      try {
        // 自愈：AudioContext 如果被浏览器挂起（autoplay 限制 / 长时间无交互），
        // 分析器读不到数据，电平条会假装"有输入"但每个频段全 0。这里每若干帧重试 resume。
        if (meter.context && meter.context.state === "suspended" && meter.context.resume) {
          meter._resumeAttempts = (meter._resumeAttempts || 0) + 1;
          if (meter._resumeAttempts <= 30 || meter._resumeAttempts % 60 === 0) {
            meter.context.resume().then(
              () => console.log(`[LexVoice][meter] ${meter.kind} 重新 resume 成功（尝试 ${meter._resumeAttempts}）`),
              () => { /* intentionally empty */ }
            );
          }
        }
        meter.analyser.getByteTimeDomainData(meter.timeData);
        meter.analyser.getByteFrequencyData(meter.freqData);
        let sum = 0;
        for (let i = 0; i < meter.timeData.length; i++) {
          const centered = (meter.timeData[i] - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / meter.timeData.length);
        const normalized = Math.max(0, Math.min(1, rms * 12));
        meter.level = (meter.level * 0.54) + (normalized * 0.46);

        const nextBars = [];
        const usableBins = Math.max(12, Math.min(meter.freqData.length, 180));
        const bandSize = Math.max(1, Math.floor(usableBins / 12));
        for (let b = 0; b < 12; b++) {
          let total = 0;
          let count = 0;
          const start = b * bandSize;
          const end = Math.min(usableBins, start + bandSize);
          for (let i = start; i < end; i++) {
            total += meter.freqData[i] || 0;
            count++;
          }
          const raw = count ? (total / count) / 255 : 0;
          const boosted = Math.max(raw, meter.level * (0.42 + (b % 4) * 0.05));
          const prev = meter.bars[b] || 0;
          nextBars[b] = (prev * 0.58) + (Math.min(1, boosted * 1.7) * 0.42);
        }
        meter.bars = nextBars;
        maxLevel = Math.max(maxLevel, meter.level);
      } catch {
        meter.level = 0;
        meter.bars = new Array(12).fill(0);
      }
    }
    this.audioLevel = maxLevel;
    // 静音统计（供"整场几乎没声音"的兜底提示）。
    // 排除 AudioContext 仍 suspended 的假 0 帧（此时分析器读不到数据，电平天然为 0，不能当静音算）。
    if (this.state === "recording") {
      const anySuspended = (this.levelMeters || []).some((m) => m && m.context && m.context.state === "suspended");
      if (!anySuspended) {
        if (maxLevel >= 0.012) this._voicedTicks = (this._voicedTicks || 0) + 1;
        else this._silentTicks = (this._silentTicks || 0) + 1;
      }
    }
    return this.audioLevel || 0;
  }
  getSourceLevels() {
    const meters = this.levelMeters || [];
    return meters.map((meter) => ({
      kind: meter.kind,
      icon: meter.icon,
      label: meter.label,
      level: meter.level || 0,
      bars: Array.isArray(meter.bars) ? meter.bars.slice(0, 12) : new Array(12).fill(0),
    }));
  }
  startNewRecorder() {
    const opts = this.mime ? { mimeType: this.mime } : undefined;
    this.recorder = new MediaRecorder(this.stream, opts);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.onerror = (e) => { console.error("[LexVoice] recorder error", e); };
    this.recorder.start(1000);
  }
  startMasterRecorder() {
    const opts = this.mime ? { mimeType: this.mime } : undefined;
    this.masterRecorder = null;
    this.masterChunks = [];
    this.masterMime = this.mime || "";
    try {
      this.masterRecorder = new MediaRecorder(this.stream, opts);
      this.masterRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.masterChunks.push(e.data); };
      this.masterRecorder.onerror = (e) => { console.error("[LexVoice] master recorder error", e); };
      this.masterRecorder.start(1000);
    } catch (e) {
      console.error("[LexVoice] master recorder start failed", e);
      this.masterRecorder = null;
      this.masterChunks = [];
    }
  }
  async stopMasterRecorder(fallbackBlob, fallbackMime) {
    const rec = this.masterRecorder;
    const chunks = this.masterChunks || [];
    const mime = (rec && (rec.mimeType || this.masterMime)) || this.masterMime || fallbackMime || "";
    if (!rec) {
      return fallbackBlob && this.segmentIndex === 0 ? { blob: fallbackBlob, mime: fallbackBlob.type || mime } : null;
    }
    const blob = await this._awaitRecorderStop(rec, () => new Blob(chunks, { type: mime }), null);
    this.masterRecorder = null;
    this.masterChunks = [];
    this.masterMime = "";
    if (blob && blob.size > 0) return { blob, mime: blob.type || mime };
    return fallbackBlob && this.segmentIndex === 0 ? { blob: fallbackBlob, mime: fallbackBlob.type || fallbackMime || mime } : null;
  }
  async acquireStream(mode) {
    mode = resolveRuntimeAudioInputMode(mode);
    // 3 种音频输入：
    //   mic                 — 仅麦克风（默认）
    //   virtualCable        — 仅电脑音频（一个被识别为虚拟设备的 audioinput）
    //   mix-virtual         — 麦克风 + 电脑音频（会议/视频推荐）
    const wantMic    = mode === "mic" || mode === "mix-virtual";
    const wantVirt   = mode === "virtualCable" || mode === "mix-virtual";

    let micStream = null, virtStream = null;

    if (wantMic) {
      let audioConstraints;
      if (isLexVoiceMobileRuntime()) {
        // 移动端：始终走系统默认输入（不带 deviceId 约束）。
        audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      } else {
        // 插件不替用户猜设备：用户在设置里选了哪只麦克风就用哪只（deviceId exact）。
        // 没选 → 不加 deviceId 约束，交给系统默认输入（系统默认是 OS/用户的系统级选择，不是插件挑的）。
        const selMic = this.plugin.settings.selectedMicrophoneDevice || "";
        audioConstraints = selMic
          ? { deviceId: { exact: selMic }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (e) {
        const name = (e && e.name) || "";
        // 用户显式选的麦克风打不开（拔了 / 设备 ID 变了 / 被占用）→ 明确提示去重选，绝不偷偷换成别的设备。
        if (audioConstraints.deviceId && /Overconstrained|NotFound|NotReadable/i.test(name)) {
          throw new Error(`所选麦克风当前不可用（${name}）。请到「设置 → 进阶 → 音频设备检测」重新选择麦克风，或清空选择以使用系统默认麦克风。`);
        }
        throw e;
      }
    }

    if (wantVirt) {
      // 电脑音频没有合理默认，必须由用户显式选定；没选 → 明确提示去选，不猜。
      const virtId = this.plugin.settings.selectedVirtualDevice || "";
      if (!virtId) {
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        throw new Error("请先在「设置 → 进阶 → 音频设备」选择电脑音频输入设备。\n\nLexVoice 不能直接监听耳机或扬声器输出，需要先安装并配置虚拟声卡：\n• Windows：VB-Cable（vb-audio.com/Cable/）\n• macOS：BlackHole（existential.audio/blackhole/）\n• Linux：PulseAudio/PipeWire monitor source\n\n安装后到 LexVoice「音频设备检测」选定该设备。");
      }
      try {
        virtStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: virtId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        // 电脑音频必须是指定的虚拟设备，退回默认会录错东西，故给清晰错误而非兜底默认。
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        const name = (e && e.name) || "";
        if (/Overconstrained|NotFound|NotReadable/i.test(name)) {
          throw new Error(`所选「电脑音频」设备当前不可用（${name}）——虚拟声卡可能已断开或设备 ID 变了。请到「设置 → 进阶 → 音频设备检测」重新选择电脑音频输入。`);
        }
        throw e;
      }
    }

    this.micStreamRef = micStream;
    this.sysStreamRef = null;
    this.virtStreamRef = virtStream;

    const sources = [micStream, virtStream].filter(Boolean);
    if (sources.length > 1) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = ctx.createMediaStreamDestination();
        for (const source of sources) ctx.createMediaStreamSource(source).connect(dest);
        this.audioContext = ctx;
        return dest.stream;
      } catch (e) {
        // 混流上下文构造失败：把已打开的 mic/virt 流全部停掉，避免 track 泄漏后再抛错。
        try { if (this.audioContext) { this.audioContext.close(); this.audioContext = null; } } catch { /* intentionally empty */ }
        for (const s of sources) { try { s.getTracks().forEach((t) => t.stop()); } catch { /* intentionally empty */ } }
        this.micStreamRef = null; this.virtStreamRef = null;
        throw e;
      }
    }
    return sources[0] || null;
  }
  releaseStream() {
    try { if (this.audioContext) { this.audioContext.close(); } } catch { /* intentionally empty */ }
    this.audioContext = null;
    if (this.micStreamRef) this.micStreamRef.getTracks().forEach((t) => t.stop());
    if (this.sysStreamRef) this.sysStreamRef.getTracks().forEach((t) => t.stop());
    if (this.virtStreamRef) this.virtStreamRef.getTracks().forEach((t) => t.stop());
    this.micStreamRef = null;
    this.sysStreamRef = null;
    this.virtStreamRef = null;
  }
  tick() {
    this.updateAudioLevel();
    this.emit();
    if (this.state !== "recording" || this.cutting) return;
    const elapsed = this.getInfo().elapsed;
    if (elapsed >= this.nextCutAtElapsed) {
      this.cutSegment().catch((e) => console.error("[LexVoice] cutSegment error", e));
    }
  }
  getNextCutAtElapsed(fromElapsed) {
    if (!this.segmentDurationMs || this.segmentDurationMs <= 0) return Infinity;
    const from = Math.max(0, Number(fromElapsed) || 0);
    const nextRegular = from + this.segmentDurationMs;
    const nextQuick = (this.quickCutMarksMs || []).find((mark) => mark > from + 500);
    return Math.min(nextQuick || Infinity, nextRegular);
  }
  // 等 MediaRecorder 的 onstop；但若 stop() 成功而 onstop 永不触发（track 已 ended——虚拟/远程设备
  // 掉线、系统收回麦克风等场景常见），4 秒后用已收集的 chunk 强制收尾，杜绝 stop()/cutSegment 永久挂起
  // 导致录音卡在"录音中…"、流/AudioContext 不释放、finalizeSession 永不触发。
  _awaitRecorderStop(rec, makeResult, fallback) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); };
      if (!rec) return finish(fallback);
      rec.onstop = () => finish(makeResult());
      try { rec.stop(); } catch { finish(fallback); }
      window.setTimeout(() => finish(makeResult()), 4000);
    });
  }
  async cutSegment() {
    if (this.cutting || this.state !== "recording") return;
    this.cutting = true;
    const chunksAtCut = this.chunks;
    const mimeAtCut = this.recorder.mimeType || this.mime;
    const endOffset = this.getInfo().elapsed;
    const startOffset = this.segmentStartOffsetMs;
    const index = this.segmentIndex;

    await this._awaitRecorderStop(this.recorder, () => undefined, undefined);

    const blob = new Blob(chunksAtCut, { type: mimeAtCut });
    this.segmentIndex++;
    this.segmentStartOffsetMs = endOffset;
    this.nextCutAtElapsed = this.getNextCutAtElapsed(endOffset);

    if (this.state !== "idle") this.startNewRecorder();
    this.cutting = false;

    if (this.onSegment) {
      try { await this.onSegment({ blob, index, startOffsetMs: startOffset, endOffsetMs: endOffset, isFinal: false, ext: extFromMime(mimeAtCut) }); }
      catch (e) { console.error("[LexVoice] onSegment error", e); }
    }
    this.emit();
  }
  pause() {
    if (this.state !== "recording") return;
    try { this.recorder.pause(); } catch { /* intentionally empty */ }
    try { if (this.masterRecorder && this.masterRecorder.state === "recording") this.masterRecorder.pause(); } catch { /* intentionally empty */ }
    this.pausedAt = Date.now();
    this.state = "paused";
    this.emit();
  }
  resume() {
    if (this.state !== "paused") return;
    try { this.recorder.resume(); } catch { /* intentionally empty */ }
    try { if (this.masterRecorder && this.masterRecorder.state === "paused") this.masterRecorder.resume(); } catch { /* intentionally empty */ }
    this.pausedFor += Date.now() - this.pausedAt;
    this.state = "recording";
    this.emit();
  }
  async stop() {
    if (this.state === "idle") return null;
    this.stopping = true;
    const elapsedAtStop = this.getInfo().elapsed;
    const startOffset = this.segmentStartOffsetMs;
    const index = this.segmentIndex;
    const mime = this.recorder ? (this.recorder.mimeType || this.mime) : this.mime;
    const chunksAtStop = this.chunks;

    const finalBlob = await this._awaitRecorderStop(this.recorder, () => new Blob(chunksAtStop, { type: mime }), null);
    const master = await this.stopMasterRecorder(finalBlob, mime);

    this.stopLevelMeter();
    if (this.streamInterruptionCleanup) {
      try { this.streamInterruptionCleanup(); } catch { /* intentionally empty */ }
      this.streamInterruptionCleanup = null;
    }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.releaseStream();
    this.stream = null; this.recorder = null; this.chunks = [];
    this.issue = null;
    this.state = "idle";
    this.stopping = false;
    if (this.ticker) { window.clearInterval(this.ticker); this.ticker = null; }
    this.segmentIndex++;
    this.emit();

    if (this.onSegment && finalBlob) {
      try {
        await this.onSegment({
          blob: finalBlob,
          index,
          startOffsetMs: startOffset,
          endOffsetMs: elapsedAtStop,
          isFinal: true,
          ext: extFromMime(mime),
          masterBlob: master && master.blob,
          masterMime: master && master.mime,
          masterExt: extFromMime((master && master.mime) || mime),
        });
      }
      catch (e) { console.error("[LexVoice] onSegment(final) error", e); }
    }
    return { totalDurationMs: elapsedAtStop, segmentsEmitted: index + 1 };
  }
}


// 解析当前激活的转写 provider 配置（带向后兼容：旧版顶层字段兜底）

// 轻量确认弹窗：危险/不可逆/有成本的操作前二次确认。resolve(true) 仅当用户点了确认按钮。






function getErrorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error && typeof error.message === "string") return error.message;
  try { return String(error); } catch { return ""; }
}

function isNetworkLikeError(error) {
  const message = getErrorMessage(error);
  if (!message) return false;
  return /failed to fetch|networkerror|fetch failed|err_internet_disconnected|err_network|dns|enotfound|econn(?:reset|refused|aborted)|etimedout|net::/i.test(message);
}

function classifyRecordingIssue(error) {
  return isNetworkLikeError(error) ? "network" : "service";
}



// 官方限额（usage-guide 2026-06-02 + 实测）：单块 base64 编码字符串 ≤ 10MB（≈7.5MB 原始音频）。
// 留 0.5MB 余量防双方对"10MB"的口径差异。base64 长度 = ceil(bytes/3)*4。
// MiMo 服务端只收 wav / mp3（实测发 audio/mp4 返回 400："mime type must be one of:
// audio/wav, audio/mp3, audio/mpeg"）。其余格式（m4a/flac/ogg/webm…）一律本机解码转 WAV。
// 转码切块时长：16kHz 单声道 16-bit WAV ≈ 1.92MB/分钟，3 分钟 ≈ 5.8MB 原始（base64 ≈ 7.7MB），
// 安全低于 10MB 上限。
// 切块数量上限：160 块 ≈ 8 小时。注意它防的是失控的转码渲染循环——
// 解码（decodeAudioBlob）本身是全量进内存的，超长音频会先在解码处失败，与导入路径行为一致。

// base64 编码后约占原始字节的 4/3。

// 原生格式 → data URL 用的 MIME 前缀（MiMo 靠 MIME 识别格式，不读 format 字段）。
// 服务端白名单仅 audio/wav / audio/mp3 / audio/mpeg，其余 MIME 一律 400。



// 确定性失败：换个时间重试同样必败（格式/解码/超限/4xx 拒绝），标上 nonRetryable 让队列不再空转重试。

// 返回一个或多个待转写块（每块 base64 ≤ 10MB）。
// MiMo 服务端只收 wav/mp3（实测 audio/mp4 直接 400），所以仅这两种且未超限才原样直发；
// 其余格式（webm/m4a/flac/ogg…）或超限块需解码后按时长切 16k 单声道 WAV。
// 注意：Electron 的 decodeAudioData 解不了 mp4/AAC——录音侧已配合（选 MiMo 时录 WebM/Opus），
// 但用其它服务录的旧 m4a 段拿来重转写仍会在此失败，错误信息引导改用 SiliconFlow。


// 单块请求：把一个 ≤10MB(base64) 的 prepared 块发给 MiMo，返回原始文本（不做热词修正，留给上层对全文统一修）。




























// 解析一行 SSE "data: {...}"，把 delta/message 文本累加到 state.content。返回是否累加了内容。
// 同时捕获 finish_reason：用于检测"撞 max_tokens 被截断"（finish_reason==="length"），
// 否则半截纪要会被当成完整输出静默落盘，是"用户觉得纪要有错漏"的头号来源。

// 流式读取 LLM 响应：每收到一个 chunk 调一次 onActivity（用于重置空闲超时计时器），
// 边收边累加文本。设计目标——只要 token 还在流动就永不被超时误杀；真中断（如空闲 abort）
// 时也返回已累计内容，不浪费服务端已经生成并计费的部分。
// 返回 { content, finishReason }：finishReason 用于上层检测截断（"length"）。中断场景下若已有内容也带上。

// 兜底：若没解析出任何 SSE 内容，但端点其实返回的是普通 JSON（忽略了 stream 参数），按普通响应取内容。
// 统一返回 { content, finishReason }。





// 拉取 OpenAI 兼容服务的可用模型列表（GET {base}/models）。用 obsidian.requestUrl 绕过 CORS。
// 让「获取可用模型」对 Poe / OpenRouter / MiMo / 硅基 / 本地 等都通用、永不过期，免去手敲 bot 名。

// 简易搜索 + 点选 Modal：从一串字符串里选一个。onPick(选中值) 在点击后调用。








// finish_reason 提取：流式经 requestLlmChatCompletion 透传，普通 JSON 直接来自 API。
// "length" = 撞 max_tokens 截断；"aborted" = 流被空闲超时/网络中断。两者都意味着输出可能不完整。

// 返回 { text, finishReason }——给最终纪要 merge 用，需要据 finishReason 检测截断并告警。


// 最终纪要被 max_tokens 截断时，正文顶部插显式告警——把"静默残缺"变成"用户可见"。守住"不缺漏"底线。
const BRIEFING_TRUNCATION_WARNING = "> [!warning] 本纪要可能未完整\n> AI 整理在写到输出长度上限时被截断，后半段内容可能缺失。完整原文已保留在本笔记底部的原始转写区；如需完整纪要，可点「重新整理」重试，或把超长录音分段后再整理。";
// 超长文本导入预压缩告警：原文先被分段摘要再整理，纪要为"摘要的整理"，具体数字/原话以底部原文为准。
const BRIEFING_PRESUMMARY_NOTICE = "> [!info] 本纪要基于自动摘要稿生成\n> 导入文本过长，已先分段摘要再整理，部分原文细节（具体数字、原话、边角事实）可能未进入纪要。完整原文见本笔记底部折叠区，关键信息请以原文为准。";



// 标准 Obsidian callout 类型全集 + LexVoice 自定义类型。
// 用全集而非小白名单：DeepSeek 等模型常丢 `>` 前缀，规整器要能认出任意标准 callout 补回前缀。
// 风险：正文里出现字面 [!xxx] 才会误判，而中文纪要正文几乎不会写这种 Obsidian 专有语法，安全。
const LEXVOICE_CALLOUT_NORMALIZE_TYPES = new Set([
  // 官方标准类型
  "note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint",
  "important", "success", "check", "done", "question", "help", "faq",
  "warning", "caution", "attention", "failure", "fail", "missing",
  "danger", "error", "bug", "example", "quote", "cite",
  // LexVoice 自定义
  "ai-eval",
]);

// 顶部摘要 / 一句话定调这类 callout 的"短标题"识别：
// 模型有时把 `> [!abstract] 摘要\n> 长正文...` 折叠成一行 `[!abstract] 摘要 长正文...`，
// 渲染出来标题超长。这里把"短标题 + 空格 + 长正文"拆开，正文挪到续行。
function splitLexVoiceCalloutInlineBody(title) {
  const t = String(title || "").trim();
  if (!t) return { label: "", body: "" };
  // 找第一个空白分隔；只有当分隔后的"正文"足够长（≥12 字）才认为是被折叠的正文，
  // 否则像 "AI 评价" / "核心 摘要" 这种两词标题不拆。
  const m = t.match(/^(\S{1,8})\s+(.+)$/);
  if (m && String(m[2] || "").trim().length >= 12) {
    return { label: m[1].trim(), body: m[2].trim() };
  }
  return { label: t, body: "" };
}

function getLexVoiceCalloutHeader(line) {
  const m = String(line || "").match(/^\s*(?:>\s*)?(?:[-*+•]\s+)?\[!([a-z][a-z0-9_-]*)([+-]?)\]\s*(.*)$/i);
  if (!m) return null;
  const type = String(m[1] || "").toLowerCase();
  if (!LEXVOICE_CALLOUT_NORMALIZE_TYPES.has(type)) return null;
  const fold = m[2] || "";
  const rawTitle = String(m[3] || "").trim();
  const { label, body } = splitLexVoiceCalloutInlineBody(rawTitle);
  return {
    type,
    text: `[!${type}${fold}]${label ? " " + label : ""}`,
    inlineBody: body,  // 若非空，规整时作为续行 `> <body>` 紧跟标题
  };
}

function isLexVoiceCalloutBoundary(line) {
  const text = String(line || "");
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (getLexVoiceCalloutHeader(text)) return true;
  return /^#{1,6}\s+/.test(trimmed)
    || /^-{3,}$/.test(trimmed)
    || /^<details\b/i.test(trimmed)
    || /^<\/details>/i.test(trimmed)
    || /^<!--\s*lexvoice-/i.test(trimmed)
    || /^\*\*[^*\n]{1,40}\*\*[:：]?/.test(trimmed)
    || /^####\s+/.test(trimmed);
}

function ensureLexVoiceCalloutGapBeforeHeader(out) {
  if (!Array.isArray(out) || !out.length) return;
  // 删除上一块尾部的空行与「>」空引用行——它们是 blockquote 续行，会让 Obsidian 把相邻 callout 合并成一个块
  while (out.length) {
    const last = String(out[out.length - 1] || "");
    if (!last.trim() || /^\s*>\s*$/.test(last)) { out.pop(); continue; }
    break;
  }
  // 用一个「真正的空行」(行首无 >) 断开，使下一个 callout 成为独立块；位于开头时不补前导空行
  if (out.length) out.push("");
}

function normalizeLexVoiceCallouts(markdown) {
  if (!markdown) return "";
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inFence = false;
  let inFixedCallout = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      inFixedCallout = false;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const header = getLexVoiceCalloutHeader(line);
    if (header) {
      ensureLexVoiceCalloutGapBeforeHeader(out);
      out.push(`> ${header.text}`);
      // 模型把标题和长正文折叠到同一行时，把正文拆到续行，避免标题超长
      if (header.inlineBody) out.push(`> ${header.inlineBody}`);
      inFixedCallout = true;
      continue;
    }

    if (inFixedCallout) {
      if (isLexVoiceCalloutBoundary(line)) {
        inFixedCallout = false;
        out.push(line);
        continue;
      }
      const trimmed = String(line || "").trim();
      if (!trimmed) {
        out.push(">");
        continue;
      }
      if (/^\s*>/.test(line)) {
        out.push(line.replace(/^\s*/, ""));
      } else {
        out.push(`> ${line.trimStart()}`);
      }
      continue;
    }

    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}







const EMAIL_DRAFT_FOLDER = "LexVoice/邮件草稿";
const EMAIL_DRAFT_ATTACHMENT_FOLDER = `${EMAIL_DRAFT_FOLDER}/附件`;
const EMAIL_ATTENDEE_FIELDS = ["参会人", "与会人", "参与者", "出席人", "受访者", "访问者", "面试官", "候选人", "当事人", "相关人员", "人员", "人物"];

function normalizeEmailAddressList(value) {
  const raw = Array.isArray(value) ? value.flatMap(normalizeEmailAddressList) : String(value || "").split(/[，,、;；\s]+/);
  const emails = [];
  for (const item of raw) {
    const text = String(item || "").trim().replace(/^<|>$/g, "");
    if (!text) continue;
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) emails.push(match[0]);
  }
  return Array.from(new Set(emails.map(e => e.toLowerCase())));
}


function extractMeetingAttendeeNames(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object") return [];
  const raw = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      const direct = value["姓名"] || value.name || value["人员"] || value.person || value.label;
      if (direct) raw.push(direct);
      else Object.values(value).forEach(walk);
    } else if (value != null) {
      raw.push(...splitPersonFieldValue(value));
    }
  };
  for (const key of EMAIL_ATTENDEE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) walk(frontmatter[key]);
  }
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const name = normalizePersonNameForEmail(item);
    const key = normalizePersonLookupText(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function utf8ToBase64(value) {
  const text = String(value || "");
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + size)));
  }
  return btoa(binary);
}

function wrapBase64Lines(value) {
  return String(value || "").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function encodeMailHeader(value) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  return /[^\x20-\x7E]/.test(text) ? `=?UTF-8?B?${utf8ToBase64(text)}?=` : text;
}

function sanitizeMailHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function guessEmailAttachmentMime(file) {
  const ext = String(file && file.extension || "").toLowerCase();
  if (ext === "md") return "text/markdown; charset=utf-8";
  if (ext === "pdf") return "application/pdf";
  if (ext === "html" || ext === "htm") return "text/html; charset=utf-8";
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === "ppt") return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
}

function buildEmailDraftContent({ to = [], subject = "", body = "", attachments = [] }) {
  const boundary = `----=_LexVoice_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `To: ${to.map(sanitizeMailHeader).join(", ")}`,
    `Subject: ${encodeMailHeader(subject || "LexVoice 会议纪要")}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "X-Unsent: 1",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64Lines(utf8ToBase64(body || "")),
    "",
  ];
  for (const attachment of attachments) {
    const name = attachment.name || "attachment";
    const encodedName = encodeMailHeader(name);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mime || "application/octet-stream"}; name="${encodedName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodedName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "",
      wrapBase64Lines(attachment.base64 || ""),
      "",
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

function stripMarkdownForEmailBrief(markdown) {
  let text = stripLexVoiceFrontmatterSimple(String(markdown || ""));
  text = text.replace(/<details[\s\S]*?<\/details>/gi, "\n");
  text = text.replace(/<!--[\s\S]*?-->/g, "\n");
  const rawSplit = text.split(/\n(?=#{1,6}\s+(?:📁\s*)?(?:原始材料|原始转写|逐字稿|录音原文|回听时间轴|录音中实时大纲)\b)/);
  return (rawSplit[0] || text).trim();
}

function cleanEmailMarkdownLine(line) {
  let s = String(line || "").trim();
  if (!s) return "";
  if (/^```/.test(s)) return "";
  s = s.replace(/^>\s?/, "").trim();
  s = s.replace(/^\[![^\]]+\][+-]?\s*/i, "").trim();
  s = s.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").trim();
  if (!s || /^(录音信息|回听时间轴|原始材料|原始转写|逐字稿|录音原文)$/i.test(s)) return "";
  if (/^!\[\[.+?\]\]$/.test(s) || /^!\[[^\]]*\]\([^)]+\)$/.test(s)) return "";
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "");
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/<[^>]+>/g, "").trim();
  return s;
}

function normalizeEmailBullet(line) {
  let s = cleanEmailMarkdownLine(line);
  if (!s) return "";
  if (/^[-*+]\s+\[[ xX]\]\s+/.test(s)) return s.replace(/^[-*+]\s+/, "- ");
  s = s.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
  return s ? `- ${s}` : "";
}

function pushUniqueEmailLine(target, line, limit) {
  const value = cleanEmailMarkdownLine(line);
  if (!value || target.includes(value)) return;
  if (limit && target.length >= limit) return;
  target.push(value);
}

function pushUniqueEmailBullet(target, line, limit) {
  const value = normalizeEmailBullet(line);
  if (!value || target.includes(value)) return;
  if (limit && target.length >= limit) return;
  target.push(value);
}

function categorizeEmailBriefSection(title) {
  const t = String(title || "").replace(/\s+/g, "");
  if (!t) return "";
  if (/摘要|概要|核心摘要|研讨摘要|学习摘要|整体综述|主要内容/.test(t)) return "summary";
  if (/决策|决议|结论|定调|共识/.test(t)) return "decisions";
  if (/待办|行动项|下一步|后续动作|TODO|ToDo/i.test(t)) return "todos";
  if (/悬而未决|未决|待澄清|待确认|会后跟进|跟进|风险|开放问题|问题清单/.test(t)) return "pending";
  return "";
}

function addEmailBriefLines(result, category, lines) {
  const list = Array.isArray(lines) ? lines : [];
  if (category === "summary") {
    for (const line of list) pushUniqueEmailLine(result.summary, line, 8);
    return;
  }
  if (category === "decisions") {
    for (const line of list) pushUniqueEmailBullet(result.decisions, line, 12);
    return;
  }
  if (category === "todos") {
    for (const line of list) pushUniqueEmailBullet(result.todos, line, 14);
    return;
  }
  if (category === "pending") {
    for (const line of list) pushUniqueEmailBullet(result.pending, line, 12);
  }
}

function extractEmailCalloutBlocks(text, result) {
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i] || "";
    if (!/^\s*>\s*\[!/.test(first)) continue;
    const block = [];
    let j = i;
    while (j < lines.length && (/^\s*>/.test(lines[j]) || !String(lines[j] || "").trim())) {
      block.push(lines[j]);
      j++;
    }
    const marker = first.match(/\[!([a-zA-Z-]+)\][+-]?\s*(.*)$/);
    const type = marker ? marker[1].toLowerCase() : "";
    const title = marker ? marker[2] : first;
    let category = categorizeEmailBriefSection(title);
    if (!category) {
      if (/abstract|summary|note/.test(type)) category = "summary";
      else if (/success|important|check|done/.test(type)) category = "decisions";
      else if (/todo|tip/.test(type)) category = "todos";
      else if (/question|warning|danger|caution|failure/.test(type)) category = "pending";
    }
    if (category) addEmailBriefLines(result, category, block.slice(1));
    i = Math.max(i, j - 1);
  }
}

function extractEmailHeadingBlocks(text, result) {
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = String(lines[i] || "").match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const category = categorizeEmailBriefSection(match[2]);
    if (!category) continue;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s{0,3}#{1,6}\s+/.test(lines[j] || "")) break;
      body.push(lines[j]);
    }
    addEmailBriefLines(result, category, body);
  }
}

function extractEmailTodoLines(text, result) {
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*>?\s*[-*+]\s+\[[ xX]\]\s+/.test(line || "")) {
      pushUniqueEmailBullet(result.todos, line, 14);
    }
  }
}

function extractEmailFallbackSummary(text, result) {
  if (result.summary.length) return;
  const lines = String(text || "").split(/\r?\n/)
    .map(cleanEmailMarkdownLine)
    .filter(line => line && !/^[-*+]\s+/.test(line) && line.length >= 12);
  for (const line of lines.slice(0, 3)) pushUniqueEmailLine(result.summary, line, 3);
}

function extractEmailBriefing(markdown) {
  const source = stripMarkdownForEmailBrief(markdown);
  const result = { summary: [], decisions: [], todos: [], pending: [] };
  extractEmailCalloutBlocks(source, result);
  extractEmailHeadingBlocks(source, result);
  extractEmailTodoLines(source, result);
  extractEmailFallbackSummary(source, result);
  return result;
}

function buildEmailSection(title, lines) {
  const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!list.length) return [];
  return [title, ...list, ""];
}

function buildMeetingEmailBody({ file, markdown, attendeeNames = [], attachmentsCount = 0 }) {
  const brief = extractEmailBriefing(markdown);
  const body = [
    "你好，",
    "",
    "以下是本次纪要的简要同步，完整 Markdown、PDF 及已生成的报告 / PPT 已随邮件附上。",
    "",
    `纪要：${file && file.basename ? file.basename : "LexVoice 会议纪要"}.md`,
    `自动匹配参会人：${attendeeNames.length ? attendeeNames.join("、") : "未识别到可匹配人员"}`,
    `附件数量：${attachmentsCount}`,
    "",
  ];
  const sections = [
    buildEmailSection("一、摘要", brief.summary),
    buildEmailSection("二、决策", brief.decisions),
    buildEmailSection("三、待办", brief.todos),
    buildEmailSection("四、会后跟进 / 悬而未决", brief.pending),
  ].flat();
  if (sections.length) {
    body.push(...sections);
  } else {
    body.push("本篇纪要未识别到可直接写入邮件正文的摘要、决策、待办或悬而未决事项，请以附件中的完整纪要为准。", "");
  }
  body.push("此邮件草稿由 LexVoice 在本地生成。发送前请确认收件人、正文和附件是否正确。");
  return body.join("\n");
}















// 纯白弥散报告（recruit 面试评估 / seminar 研讨）：大模型按提取提示词只产出 DATA JSON，注入固定模板的哨兵段。
// 模型碰不到 CSS/版式（最省 token、最稳）。公司名由 reportBrandName 设置注入（默认空 → 沿用纪要「公司/」标签）；报告不含 logo。

// 报告生成前的配色选择器：预设或自定义颜色 → 返回 hex（取消/关闭返回 null）。报告按所选色相整体重着色。






























































function cleanLexVoiceTranscriptBlock(block) {
  return String(block || "")
    .replace(/<!--[^>]*-->/g, "")
    .replace(/<summary>[\s\S]*?<\/summary>/gi, "")
    .replace(/<\/?details>/gi, "")
    .replace(/^###\s+段落\s+\d+[^\n]*$/gm, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/^_\[转写失败[^\n]*$/gm, "")
    .replace(/^_\[此段无内容\]_$/gm, "")
    .replace(/^\s*---\s*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLexVoiceTranscriptSections(markdown) {
  const text = String(markdown || "");
  const sections = [];
  let searchFrom = 0;
  while (true) {
    const labelIdx = text.indexOf("分段原始转写", searchFrom);
    if (labelIdx < 0) break;
    const summaryEnd = text.indexOf("</summary>", labelIdx);
    const detailsEnd = summaryEnd >= 0 ? text.indexOf("</details>", summaryEnd) : -1;
    if (summaryEnd >= 0 && detailsEnd > summaryEnd) {
      sections.push(text.slice(summaryEnd + "</summary>".length, detailsEnd));
      searchFrom = detailsEnd + "</details>".length;
    } else {
      searchFrom = labelIdx + 1;
    }
  }

  const startRe = /<!--\s*lexvoice-segments-start(?::[^>]*)?\s*-->/g;
  while (startRe.exec(text)) {
    const endRe = /<!--\s*lexvoice-segments-end(?::[^>]*)?\s*-->/g;
    endRe.lastIndex = startRe.lastIndex;
    const endMatch = endRe.exec(text);
    if (endMatch) sections.push(text.slice(startRe.lastIndex, endMatch.index));
  }

  if (!sections.length) {
    const rawIdx = text.lastIndexOf("原始转写：");
    if (rawIdx >= 0) sections.push(text.slice(rawIdx + "原始转写：".length));
  }
  return sections;
}

function extractLexVoiceTranscriptSegments(markdown) {
  const sections = splitLexVoiceTranscriptSections(markdown);
  const segments = [];
  for (const section of sections) {
    const headingRe = /^###\s+段落\s+(\d+)([^\n]*)$/gm;
    const heads = [...String(section).matchAll(headingRe)];
    if (!heads.length) {
      const text = cleanLexVoiceTranscriptBlock(section);
      if (text) segments.push({ index: segments.length, startOffsetMs: 0, endOffsetMs: 0, text });
      continue;
    }
    for (let i = 0; i < heads.length; i++) {
      const head = heads[i];
      const bodyStart = head.index + head[0].length;
      const bodyEnd = i + 1 < heads.length ? heads[i + 1].index : section.length;
      const body = cleanLexVoiceTranscriptBlock(section.slice(bodyStart, bodyEnd));
      if (!body) continue;
      const timeMatch = head[2].match(/\(([^)]+?)[–-]([^)]+?)\)/);
      const startOffsetMs = timeMatch ? parseElapsedMsToken(timeMatch[1]) : 0;
      const endOffsetMs = timeMatch ? parseElapsedMsToken(timeMatch[2]) : startOffsetMs;
      const rawBlock = section.slice(bodyStart, bodyEnd);
      const audioMatch = rawBlock.match(/!\[\[([^\]]+)\]\]/);
      const audioName = audioMatch ? (getAudioLinkTarget(audioMatch[1]).split("/").pop() || getAudioLinkTarget(audioMatch[1])) : "";
      segments.push({
        index: segments.length,
        startOffsetMs,
        endOffsetMs,
        audioName,
        text: body,
      });
    }
  }
  return segments;
}

const LEXVOICE_EMPTY_SHORT_LIMIT_MS = 10 * 1000;


function getLexVoiceDurationMs(markdown) {
  const text = String(markdown || "");
  let maxMs = 0;
  let sawDuration = false;
  const segmentHeadingRe = /^###\s+段落\s+\d+\s*\(([^)\n]+?)[–-]([^)\n]+?)\)/gm;
  let match;
  while ((match = segmentHeadingRe.exec(text))) {
    sawDuration = true;
    maxMs = Math.max(maxMs, parseLexVoiceDurationLabel(match[2]));
  }
  if (sawDuration) return maxMs;

  const durationRe = /(?:时长|共)\s*[：:]?\s*(\d{1,3}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*(?:秒|分钟))/g;
  while ((match = durationRe.exec(text))) {
    const ms = parseLexVoiceDurationLabel(match[1]);
    if (ms > 0) {
      sawDuration = true;
      maxMs = Math.max(maxMs, ms);
    }
  }
  return sawDuration ? maxMs : 0;
}

function getLexVoiceSegmentsDurationMs(segments) {
  let maxMs = 0;
  for (const seg of segments || []) {
    const end = Number(seg && seg.endOffsetMs) || 0;
    if (end > maxMs) maxMs = end;
  }
  return maxMs;
}

function inferLexVoiceNoteStartedAtIso(file, frontmatter) {
  const moment = window.moment;
  const fm = frontmatter || {};
  const candidates = [
    fm.time,
    fm["time"],
    fm["日期"] && fm["时间"] ? `${fm["日期"]}T${fm["时间"]}` : "",
    fm["日期"] || fm.date || "",
  ].map(v => String(v || "").trim()).filter(Boolean);
  if (moment) {
    for (const value of candidates) {
      const parsed = moment(value, [
        moment.ISO_8601,
        "YYYY-MM-DDTHH:mm:ss",
        "YYYY-MM-DD HH:mm:ss",
        "YYYY-MM-DDTHH:mm",
        "YYYY-MM-DD HH:mm",
        "YYYY-MM-DD",
      ], true);
      if (parsed && parsed.isValid && parsed.isValid()) return parsed.toDate().toISOString();
    }
    const m = String(file && file.basename || "").match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}))?/);
    if (m) {
      const parsed = moment(m[2] ? `${m[1]} ${m[2]}` : m[1], m[2] ? "YYYY-MM-DD HHmm" : "YYYY-MM-DD", true);
      if (parsed && parsed.isValid && parsed.isValid()) return parsed.toDate().toISOString();
    }
  }
  return new Date(file && file.stat && file.stat.ctime ? file.stat.ctime : Date.now()).toISOString();
}

function normalizeSegmentsForMergedNote(segments, offsetMs, startIndex, sourceFile) {
  const offset = Math.max(0, Number(offsetMs) || 0);
  const baseIndex = Math.max(0, Number(startIndex) || 0);
  const sourceName = sourceFile && sourceFile.basename ? sourceFile.basename : "";
  const sourcePath = sourceFile && sourceFile.path ? sourceFile.path : "";
  return (segments || []).map((seg, i) => {
    const rawStart = Math.max(0, Number(seg && seg.startOffsetMs) || 0);
    const rawEnd = Math.max(rawStart, Number(seg && seg.endOffsetMs) || 0);
    const start = rawStart + offset;
    const end = Math.max(start, rawEnd + offset);
    const localStart = Number(seg && seg.audioStartOffsetMs);
    const localEnd = Number(seg && seg.audioEndOffsetMs);
    return Object.assign({}, seg || {}, {
      index: baseIndex + i,
      startOffsetMs: start,
      endOffsetMs: end,
      audioStartOffsetMs: Number.isFinite(localStart) && localStart >= 0 ? localStart : rawStart,
      audioEndOffsetMs: Number.isFinite(localEnd) && localEnd >= 0 ? localEnd : rawEnd,
      sourceName: (seg && seg.sourceName) || sourceName,
      sourcePath: (seg && seg.sourcePath) || sourcePath,
    });
  });
}

function stripLexVoiceEmptyPlaceholders(text) {
  return String(text || "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/_?\[(?:此段无内容|无输出|转写失败|合并润色失败)[^\]\n]*\]_?/g, "")
    .replace(/^(?:没有|暂无)(?:可整理内容|有效内容|实际内容|可用内容)[。.!！]*$/gm, "")
    .replace(/^转写(?:为空|返回为空|无内容)[。.!！]*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasLexVoiceMeaningfulTranscript(text) {
  return stripLexVoiceEmptyPlaceholders(text).trim().length > 0;
}

function isStandaloneLexVoiceGeneratedNote(markdown) {
  const body = String(markdown || "").replace(/^---\n[\s\S]*?\n---\n?/m, "");
  const firstLine = (body.split(/\r?\n/).find((line) => line.trim()) || "").trim();
  return /^#\s+.+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+·\s+/.test(firstLine);
}

function getLexVoiceMeaningfulRemainder(markdown) {
  let text = String(markdown || "");
  text = text
    .replace(/^---\n[\s\S]*?\n---\n?/m, "")
    .replace(/<!--[^>]*-->/g, "")
    .replace(/<summary>[\s\S]*?<\/summary>/gi, "")
    .replace(/<\/?details>/gi, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^>\s*\[!info\].*$/gm, "")
    .replace(/^>\s*(?:开始|时间|合并自)[：:].*$/gm, "")
    .replace(/^>\s*.*(?:时长|模式|分段|模型).*$/gm, "")
    .replace(/^\s*---\s*$/gm, "");
  text = stripLexVoiceEmptyPlaceholders(text);
  return text.replace(/^\s*$/gm, "").trim();
}

function collectLexVoiceAudioRefs(markdown) {
  const refs = [];
  const seen = new Set();
  const re = /!\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = re.exec(String(markdown || "")))) {
    const ref = String(match[1] || "").split("|")[0].split("#")[0].trim();
    const fileName = ref.split("/").pop() || ref;
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (!ref || !AUDIO_EXT.has(ext)) continue;
    const key = obsidian.normalizePath(ref);
    if (!seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
}

function resolveLexVoiceAudioFile(app, settings, ref) {
  const normalizedRef = obsidian.normalizePath(String(ref || ""));
  const direct = app.vault.getAbstractFileByPath(normalizedRef);
  if (direct instanceof obsidian.TFile && AUDIO_EXT.has((direct.extension || "").toLowerCase())) return direct;

  const audioFolder = obsidian.normalizePath((settings && settings.audioFolder) || DEFAULT_SETTINGS.audioFolder);
  const fileName = normalizedRef.split("/").pop();
  if (!fileName) return null;
  const scoped = app.vault.getAbstractFileByPath(obsidian.normalizePath(`${audioFolder}/${fileName}`));
  if (scoped instanceof obsidian.TFile && AUDIO_EXT.has((scoped.extension || "").toLowerCase())) return scoped;

  const folder = app.vault.getAbstractFileByPath(audioFolder);
  if (!(folder instanceof obsidian.TFolder)) return null;
  const stack = folder.children.slice();
  while (stack.length) {
    const item = stack.pop();
    if (item instanceof obsidian.TFolder) {
      stack.push(...item.children);
    } else if (item instanceof obsidian.TFile && item.name === fileName && AUDIO_EXT.has((item.extension || "").toLowerCase())) {
      return item;
    }
  }
  return null;
}

function analyzeLexVoiceEmptyShortNote(file, markdown, settings) {
  const text = String(markdown || "");
  const hasLexVoiceMarker = /<!--\s*lexvoice-session(?::|\s*--)/.test(text) || /<!--\s*lexvoice-segments-start/.test(text);
  if (!hasLexVoiceMarker) return null;
  if (!isStandaloneLexVoiceGeneratedNote(text)) return null;

  const durationMs = getLexVoiceDurationMs(text);
  if (!(durationMs > 0 && durationMs <= LEXVOICE_EMPTY_SHORT_LIMIT_MS)) return null;

  const segments = extractLexVoiceTranscriptSegments(text);
  if (segments.some((seg) => hasLexVoiceMeaningfulTranscript(seg.text))) return null;
  if (hasLexVoiceMeaningfulTranscript(getLexVoiceMeaningfulRemainder(text))) return null;

  const audioRefs = collectLexVoiceAudioRefs(text);
  return { file, durationMs, audioRefs, audioFiles: [] };
}


// 解析 frontmatter 角色字段中的"代号 → 真名"映射
// 用户在 yaml 里把 `参会人:` 数组的某项改成 `业务需求方 → 某候选人`，
// 重新整理时这条会被解析成 { from: "业务需求方", to: "某候选人" }
const ROLE_MAPPING_FIELDS = ["参会人", "参谋", "受访者", "访问者", "面试官", "候选人", "当事人"];

function parseRoleMapItem(item) {
  const text = String(item == null ? "" : item).trim();
  if (!text) return null;
  // 支持 "代号 → 真名" / "代号 -> 真名" / "代号 => 真名" 三种箭头
  const m = text.match(/^(.+?)\s*(?:→|=>|->)\s*(.+)$/);
  if (!m) return null;
  const from = m[1].trim();
  const to = m[2].trim();
  if (!from || !to || from === to) return null;
  return { from, to };
}

function extractRoleMappingFromFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object") return [];
  const mapping = [];
  const seen = new Set();
  for (const field of ROLE_MAPPING_FIELDS) {
    const v = frontmatter[field];
    if (Array.isArray(v)) {
      for (const item of v) {
        const m = parseRoleMapItem(item);
        if (m && !seen.has(m.from)) {
          mapping.push(m);
          seen.add(m.from);
        }
      }
    } else if (typeof v === "string") {
      const m = parseRoleMapItem(v);
      if (m && !seen.has(m.from)) {
        mapping.push(m);
        seen.add(m.from);
      }
    }
  }
  return mapping;
}

// 把映射应用到 segments 的 text（按 from 长度降序，避免短代号在长代号内部被错替换）
function applyRoleMappingToSegments(segments, mapping) {
  if (!mapping || !mapping.length) return segments;
  const sorted = [...mapping].sort((a, b) => b.from.length - a.from.length);
  return segments.map(s => {
    let text = s.text || "";
    for (const m of sorted) {
      if (!m.from) continue;
      // 全局替换；用字符串而非正则，避免代号含正则元字符出错
      text = text.split(m.from).join(m.to);
    }
    return Object.assign({}, s, { text });
  });
}

// 在 frontmatter 字符串里把"代号 → 真名"项替换为单纯"真名"，让重整后的 yaml 干净
function rewriteFrontmatterRoleMappings(frontmatterText, mapping) {
  if (!frontmatterText || !mapping || !mapping.length) return frontmatterText;
  let next = frontmatterText;
  for (const m of mapping) {
    // 转义 from 用于正则
    const escFrom = m.from.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    // 匹配 "<from> [→/->/=>] <to>" 整个片段（保留前后空白），替换为 to
    const re = new RegExp(escFrom + "\\s*(?:→|=>|->)\\s*" + m.to.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
    next = next.replace(re, m.to);
  }
  return next;
}


function extractLexVoiceSessionId(content, fallback) {
  const match = String(content || "").match(/<!--\s*lexvoice-session:([^>\s]+)\s*-->/);
  return match ? match[1].trim() : fallback;
}

function cleanInlineMarkdown(text) {
  return String(text || "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text, max = 220) {
  const cleaned = cleanInlineMarkdown(text);
  return cleaned.length > max ? cleaned.slice(0, max - 1).trimEnd() + "…" : cleaned;
}

function extractBriefingSummary(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/\[!abstract\]|整体概要|概要|摘要/.test(lines[i])) {
      const collected = [];
      for (let j = i + 1; j < lines.length; j++) {
        const raw = lines[j];
        const t = raw.trim();
        if (!t) {
          if (collected.length) break;
          continue;
        }
        if (/^#{1,6}\s+/.test(t) || /^---+$/.test(t)) break;
        if (/^>\s*\[!/.test(t)) break;
        collected.push(t.replace(/^>\s?/, ""));
        if (collected.join("").length > 260) break;
      }
      const summary = truncateText(collected.join(" "), 240);
      if (summary) return summary;
    }
  }

  for (const line of lines) {
    const t = line.trim();
    if (!t || /^#{1,6}\s+/.test(t) || /^>/.test(t) || /^[-*]\s+/.test(t) || /^\|/.test(t) || /^---+$/.test(t)) continue;
    const summary = truncateText(t, 240);
    if (summary) return summary;
  }
  return "";
}

function normalizeTaskText(line) {
  let t = String(line || "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
  t = cleanInlineMarkdown(t).replace(/[。；;，,]+$/, "").trim();
  if (!t || /^<.*>$/.test(t)) return "";
  if (/^(无|暂无|没有|未提及|不适用|跳过|待定)$/.test(t)) return "";
  return t;
}

function extractActionItems(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const items = [];
  const seen = new Set();
  let inActionSection = false;
  const actionRe = /(待办|行动项|下一步|跟进|后续|TODO|To[- ]?do|Action\s*Items?)/i;

  function add(line) {
    const text = normalizeTaskText(line);
    if (!text || seen.has(text)) return;
    seen.add(text);
    items.push(`- [ ] ${text}`);
  }

  for (const raw of lines) {
    const line = raw.trim();
    const visible = line.replace(/^>\s?/, "");
    if (/^[-*+]\s+\[[ xX]\]\s+/.test(visible)) {
      add(visible);
      continue;
    }
    if (/^#{1,6}\s+/.test(visible) || /^>\s*\[!/.test(line)) {
      inActionSection = actionRe.test(visible);
      continue;
    }
    if (inActionSection && /^[-*+]\s+/.test(visible)) add(visible);
  }
  return items.slice(0, 12);
}

function makeNoteLink(path) {
  const target = String(path || "").replace(/\.md$/i, "");
  const label = target.split("/").pop() || target;
  return `[[${target}|${label}]]`;
}

function renderDailyTemplate(template, vars) {
  return String(template || DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE)
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const value = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
      return value == null ? "" : String(value);
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDailyMeetingOverviewEntry(session, polished, settings) {
  const meta = getModeMeta(settings, session.mode);
  const moment = window.moment;
  const startedAt = moment ? moment(session.startedAt) : null;
  const time = startedAt && startedAt.isValid && startedAt.isValid() ? startedAt.format("HH:mm") : "";
  const date = startedAt && startedAt.isValid && startedAt.isValid() ? startedAt.format("YYYY-MM-DD") : "";
  const totalMs = session.segments && session.segments.length ? session.segments[session.segments.length - 1].endOffsetMs : 0;
  const title = String(session.mdPath || "").split("/").pop().replace(/\.md$/i, "");
  const summary = extractBriefingSummary(polished) || "见完整纪要。";
  const tasks = extractActionItems(polished);
  const vars = {
    date,
    time,
    note_link: makeNoteLink(session.mdPath),
    note_path: String(session.mdPath || ""),
    title,
    mode: meta.prefix,
    duration: formatElapsed(totalMs),
    duration_text: formatElapsed(totalMs),
    segments: session.segments ? session.segments.length : 0,
    model: settings.llmModel || "",
    summary,
    todo_count: tasks.length,
    todos: tasks.join("\n"),
    todos_block: tasks.length ? ["#### 待办", ...tasks].join("\n") : "",
  };
  const body = renderDailyTemplate(settings.dailyMeetingOverviewTemplate || DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE, vars)
    || renderDailyTemplate(DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE, vars);
  return [
    `<!-- lexvoice-daily-overview:${session.id} -->`,
    body,
    `<!-- lexvoice-daily-overview-end:${session.id} -->`,
  ].join("\n");
}

// 为日记里插一条 Markdown 复选 todo 行（兼容 Tasks 插件 + Dataview 查询）
// 格式：- [ ] {task} 📅 {due} 👤 {owner} (来源: [[source]]) <!-- lexvoice-todo:{id} -->
// 备注：
//   - 📅 是 Tasks 插件识别的截止日期约定（仅当 due 能解析为日期时使用）
//   - 否则用 Dataview inline 字段 [截止:: {due}]
//   - 👤 owner 作为视觉标记（Tasks 插件没有 owner 约定）；同时给 Dataview 友好的 [责任人:: owner]
//   - HTML 注释里的 id 用于幂等 upsert（同 id 待办只插入一次）

// 把待办插入 / 更新到日记的指定标题下（默认 "## 待办"）。
// 同 id 的待办存在时整段（含子任务缩进行）替换；不存在时追加到 ## 待办 列表末尾；
// 标题都不存在时在文末新建 ## 待办 段。

function upsertDailyMeetingOverview(content, sessionId, entry, settings) {
  const start = `<!-- lexvoice-daily-overview:${sessionId} -->`;
  const end = `<!-- lexvoice-daily-overview-end:${sessionId} -->`;
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end, startIdx);
  if (startIdx >= 0 && endIdx > startIdx) {
    return content.slice(0, startIdx) + entry + content.slice(endIdx + end.length);
  }

  const heading = String(settings && settings.dailyMeetingOverviewHeading || DEFAULT_DAILY_MEETING_OVERVIEW_HEADING).replace(/^#+\s*/, "").trim() || DEFAULT_DAILY_MEETING_OVERVIEW_HEADING;
  const headingRe = new RegExp("^##\\s+" + escapeRegExp(heading) + "\\s*$", "m");
  const match = headingRe.exec(content);
  if (!match) {
    const sep = content.trim() ? "\n\n" : "";
    return content.replace(/\s*$/, "") + sep + `## ${heading}\n\n` + entry + "\n";
  }

  const afterHeading = content.indexOf("\n", match.index) + 1;
  const rest = content.slice(afterHeading);
  const nextHeading = rest.search(/\n##\s+/);
  const insertAt = nextHeading >= 0 ? afterHeading + nextHeading : content.length;
  const before = content.slice(0, insertAt).replace(/\s*$/, "\n\n");
  const after = content.slice(insertAt).replace(/^\n*/, "\n");
  return before + entry + after;
}


// 录音开始时据 JD / 简历 / 特殊关注点生成「面试提纲」——供面试官面试中照着提问。
// 重点围绕"候选人经历 × JD 要求的匹配度"设计针对性问题。无 JD 且无简历则返回空（不生成）。


// ====== F3 统一面试提纲：通用段（写回 JD、跨候选人复用）+ 针对段（含上轮待澄清）======

// 统一轮次排序：把 PRD（初试<复试<HR面<终面）与代码（初面/二面/终面/复试/交叉面）两套词归一到同一序数。

// 在同一招聘项目文件夹里找该候选人「更早一轮」的最近一条纪要，取其「待澄清」列表（供针对段转追问）。

// 把通用段写回 JD 文件的「## 统一面试提纲」章节。优先用 vault.process（原子读改写，避开 read→async→modify
// 期间用户编辑器改动被覆盖的竞态）；老版本无 process 时回退 read+modify。找不到该章节则文件尾追加。

// 生成通用面试提纲：素质考核题置首（逐项覆盖必备素质）+ JD 通用能力题；不引用任何具体候选人（保证可复用）。

// F3 编排器：通用段（JD 已有非空则复用、空则生成并写回 JD）+ 针对段（注入通用段去重 + 上轮待澄清）。

// 把已生成的面试提纲渲染成折叠块，供最终整合版（rewriteConsolidated）放进「原始材料」区保留。
function buildInterviewBriefDetails(session) {
  const brief = session && session.interviewBrief ? String(session.interviewBrief).trim() : "";
  if (!brief) return "";
  return ["<details>", "<summary>面试提纲（录音前据 JD / 简历生成）</summary>", "", brief, "", "</details>"].join("\n");
}

function renderRecordingInterviewBriefBlock(sessionId, brief) {
  const body = String(brief || "").trim();
  if (!body) return "";
  return [
    "",
    "## 面试提纲（录音前据 JD / 简历生成 · 仅供面试参考）",
    `<!-- lexvoice-interview-brief-start:${sessionId} -->`,
    body,
    `<!-- lexvoice-interview-brief-end:${sessionId} -->`,
    "",
  ].join("\n");
}

// 由代码注入的会话元信息前缀 —— LLM 不需要推断 frontmatter 里的 time/时长
// 这些字段从 session.startedAt / session 时长直接给定
const FRONTMATTER_CONTENT_KEYS = {
  learning: ["主题", "来源", "语言"],
  interview: ["主题", "受访者", "访问者"],
  meeting: ["主题", "参会人"],
  seminar: ["主题", "研讨对象", "参与者"],
  huddle: ["主题", "当事人", "参谋"],
  monologue: ["主题"],
  recruit: ["主题", "候选人", "联系方式", "应聘岗位", "轮次", "录用建议", "一句话评价", "待澄清"],
};

// 把任意 mode（含 custom-xxx / recruit-needs）映射到用于查 frontmatter schema 表的 baseKey。
// custom 模式天然带 baseMode（sanitize 强制落到内置模式）；recruit-needs 画像复用 recruit 字段集。
function frontmatterBaseModeKey(plugin, mode) {
  if (FRONTMATTER_CONTENT_KEYS[mode]) return mode;
  if (mode === "recruit-needs") return "recruit";
  const custom = plugin && getCustomPromptModeTemplate(plugin.settings, mode);
  if (custom && custom.baseMode && FRONTMATTER_CONTENT_KEYS[custom.baseMode]) return custom.baseMode;
  return "meeting"; // 默认回退到 meeting（含 主题+参会人），而非裸 ["主题"]，避免 custom 内容字段被裁光
}

function formatYamlDateTime(value) {
  if (!value) return "";
  const moment = window.moment;
  if (moment) {
    const m = moment(value);
    if (m && m.isValid && m.isValid()) return m.format("YYYY-MM-DDTHH:mm:ss");
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeBriefingFrontmatterFields(raw, mode, baseKey) {
  const source = (raw && typeof raw === "object") ? Object.assign({}, raw) : {};
  if (source["录音主题"] && !source["主题"]) source["主题"] = source["录音主题"];
  if (source["与会人"] && !source["参会人"]) source["参会人"] = source["与会人"];

  const keys = FRONTMATTER_CONTENT_KEYS[baseKey || mode] || ["主题"];
  const allowed = new Set(keys);
  allowed.add("人物"); // 人物 = 独立人员属性，全模式恒定保留（重整时不被当非白名单字段裁掉）
  const cleaned = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) cleaned[key] = source[key];
  }
  if (Object.prototype.hasOwnProperty.call(source, "人物")) cleaned["人物"] = source["人物"];
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(cleaned, key)) cleaned[key] = source[key];
  }
  return cleaned;
}

function splitLeadingFrontmatter(markdown) {
  const text = String(markdown || "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return { frontmatter: "", body: text };
  return {
    frontmatter: match[0].replace(/\n*$/, "\n"),
    body: text.slice(match[0].length).replace(/^\n+/, ""),
  };
}

// \u4ECE\u5168\u6587\u91CC\u628A\u6240\u6709"\u539F\u59CB / \u5143\u6570\u636E"\u5757\uFF08\u4EFB\u610F\u6DF1\u5EA6\uFF09\u62BD\u51FA\u6765\uFF0C\u4F5C\u4E3A rawTail \u4FDD\u7559\u5230\u672B\u5C3E\u3002
// \u8C03\u7528\u8005\u62FF\u5230 withoutRaw \u4E4B\u540E\u53EF\u4EE5\u5B89\u5168\u5730\u628A"\u5DF2\u6574\u7406\u5185\u5BB9"\u5377\u6210 <details>\u4E0A\u4E00\u7248\u7EAA\u8981>\uFF0C
// \u4E0D\u4F1A\u518D\u628A\u6BB5\u843D / \u539F\u59CB\u97F3\u9891 / \u6C89\u6DC0\u5757\u8FD9\u4E9B\u91CD\u578B\u5185\u5BB9\u5D4C\u5957\u8FDB details \u9020\u6210\u7206\u70B8\u5F0F\u589E\u957F\u3002
//
// \u89E3\u51B3\u7684\u5177\u4F53 bug\uFF1A
//   appendRepolishBlock \u539F\u672C\u53EA\u8BC6\u522B ## \uD83D\uDCC1 \u539F\u59CB\u6750\u6599 \u4F5C\u4E3A raw \u8FB9\u754C\uFF0C\u5BF9 appendPolishBlock
//   \u4EA7\u51FA\u7684 "## \u2728 \u6574\u5408\u7248 + \u2039details\u203A\u5F55\u97F3\u4FE1\u606F/\u539F\u59CB\u97F3\u9891/...\u2039/details\u203A" \u7ED3\u6784\u8BC6\u522B\u4E0D\u5230\uFF0C
//   \u5BFC\u81F4\u6BCF\u6B21\u91CD\u65B0\u6574\u7406\u90FD\u628A\u6574\u4E2A\u65E7\u6587\u4EF6\u5D4C\u5957\u8FDB\u65B0\u7684 \u2039details\u203A\u4E0A\u4E00\u7248\u7EAA\u8981\u203A\uFF0C\u91CD\u590D\u5B58\u653E\u6BB5\u843D\u548C\u5143\u6570\u636E\u3002
function extractAllRawBlocksFromText(text) {
  let s = String(text || "");
  const seen = new Set();
  const tailParts = [];
  const stash = (block) => {
    const trimmed = String(block || "").trim();
    if (!trimmed) return "";
    if (seen.has(trimmed)) return "";
    seen.add(trimmed);
    tailParts.push(trimmed);
    return "";
  };

  // 1. \u4EFB\u610F\u6DF1\u5EA6\u7684 \u2039details\u203A \u5143\u6570\u636E\u5757\uFF08summary \u5173\u952E\u5B57\u767D\u540D\u5355\uFF09
  const detailsPatterns = [
    /<details>\s*\n?<summary>[^<\n]*?\u5F55\u97F3\u4FE1\u606F[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
    /<details>\s*\n?<summary>[^<\n]*?\u539F\u59CB\u97F3\u9891[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
    /<details>\s*\n?<summary>[^<\n]*?\u5F55\u97F3\u4E2D\u5B9E\u65F6\u5927\u7EB2[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
    /<details>\s*\n?<summary>[^<\n]*?\u56DE\u542C\u65F6\u95F4\u8F74[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
    /<details>\s*\n?<summary>[^<\n]*?\u5206\u6BB5\u539F\u59CB\u8F6C\u5199[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
    /<details>\s*\n?<summary>[^<\n]*?\u6587\u672C\u5BFC\u5165\u6765\u6E90[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
    /<details>\s*\n?<summary>[^<\n]*?\u4F1A\u8BAE\u5DE5\u4F5C\u53F0[^<\n]*?<\/summary>[\s\S]*?<\/details>/gi,
  ];
  // \u8FED\u4EE3\u62BD\u53D6\uFF0C\u9632\u6B62\u5D4C\u5957\u5305\u88F9\u672A\u4E00\u6B21\u6027\u6D88\u5E72\u51C0
  for (let iter = 0; iter < 32; iter++) {
    let changed = false;
    for (const re of detailsPatterns) {
      const before = s;
      s = s.replace(re, (m) => stash(m));
      if (s !== before) changed = true;
    }
    if (!changed) break;
  }

  // 2. \u6BB5\u843D\u539F\u6587\uFF1A<!-- lexvoice-segments-start --> ... <!-- lexvoice-segments-end -->
  s = s.replace(/<!--\s*lexvoice-segments-start(?::[^>]*)?\s*-->[\s\S]*?<!--\s*lexvoice-segments-end(?::[^>]*)?\s*-->/gi,
    (m) => stash(m));

  // 3. session \u6807\u8BB0\uFF08\u5982\u679C\u8FD8\u6B8B\u7559\uFF09
  s = s.replace(/^[ \t]*<!--\s*lexvoice-session(?::[^>]*|\s*--)[^>]*-->[ \t]*\r?\n?/gm,
    (m) => stash(m.trim()));

  // 4. \u6C89\u6DC0\u5757\uFF1A<!--LEXVOICE_SEDIMENT_BEGIN ... LEXVOICE_SEDIMENT_END-->
  s = s.replace(/<!--\s*LEXVOICE_SEDIMENT_BEGIN[\s\S]*?LEXVOICE_SEDIMENT_END\s*-->/gi,
    (m) => stash(m));

  // 5. \u65E7\u7248\u672C\u91CC"\u5931\u8D25\u7684\u6574\u5408\u7248"\u6B8B\u9AB8\uFF08\u5DF2\u88AB\u65B0\u7248\u672C\u66FF\u4EE3\uFF0C\u4E0D\u5FC5\u4FDD\u7559\uFF09
  s = s.replace(/##\s+\u2728\s+\u6574\u5408\u7248[^\n]*\n+_\[(?:\u5408\u5E76\u6DA6\u8272\u5931\u8D25|AI \u6574\u7406\u5931\u8D25)[^\]]*\]_\s*\n?/g, "");

  // 6. \u6E05\u7406\u53EF\u80FD\u6B8B\u7559\u7684\u7A7A details \u58F3
  s = s.replace(/<details>\s*<\/details>/gi, "");
  s = s.replace(/<details>\s*\n+\s*<\/details>/gi, "");

  return { tail: tailParts.join("\n\n"), withoutRaw: s };
}

function mergeLeadingFrontmatterIntoDocument(documentText, generatedMarkdown) {
  const generated = splitLeadingFrontmatter(generatedMarkdown || "");
  if (!generated.frontmatter) return { content: String(documentText || ""), body: String(generatedMarkdown || "") };
  const current = splitLeadingFrontmatter(documentText || "");
  return {
    content: generated.frontmatter.trimEnd() + "\n\n" + current.body.replace(/^\n+/, ""),
    body: generated.body.trim() || "_[无输出]_",
  };
}


// 解析 LLM 输出末尾的标签建议注释 <!-- lexvoice-tags: 主题/招聘流程, 项目/晋升提名 -->
function parseSuggestedTagsFromOutput(text) {
  if (!text) return { tags: [], cleaned: text || "" };
  const re = /<!--\s*lexvoice-tags(?:-suggest)?\s*:\s*([\s\S]*?)\s*-->/i;
  const m = text.match(re);
  if (!m) return { tags: [], cleaned: text };
  const peopleFromTags = [];
  const tags = m[1]
    .split(/[,，;；、\n]+/)
    .map(s => s.trim())
    // 防御 LLM 可能带 # 前缀
    .map(s => s.replace(/^#+/, "").trim())
    // 防御内部出现空格或非法 tag 字符（Obsidian tag 不允许空格）
    .map(s => s.replace(/\s+/g, ""))
    .filter(Boolean)
    // 防御过长：nested tag 也很少超过 24 字
    .filter(s => s.length > 0 && s.length <= 24)
    // 防御和系统 tag 重复
    .filter(s => !/^lexvoice\//i.test(s))
    // 人物/x 不再进 tags：剥前缀转入 people（吃掉旧 LLM 输出 / 旧笔记里残留的人物维度，是旧笔记平滑迁移的关键）
    .filter(s => {
      if (/^人物\//.test(s)) { peopleFromTags.push(s.replace(/^人物\//, "").trim()); return false; }
      return true;
    });
  // 去重
  const seen = new Set();
  const unique = [];
  for (const t of tags) {
    if (!seen.has(t)) { unique.push(t); seen.add(t); }
  }
  const cleaned = text.replace(re, "").replace(/\n{3,}$/, "\n\n").trimEnd() + "\n";
  return { tags: unique, people: peopleFromTags.filter(Boolean), cleaned };
}

// 解析 LLM 输出末尾的人员机器块 <!-- lexvoice-people: 张三, 李四 -->（纯人名，不带前缀）。
// 与 tags 物理分离：人物单列成独立 frontmatter 属性，不再挤进 tags。

// F4.2：解析招聘素质三态机器块 <!-- lexvoice-recruit: {"素质":{"聪明":"达到",...}} -->，
// 映射成 frontmatter 的 素质_<名> 字段（取值仅 达到/未达/本场未验证）。解析失败安全降级为空对象。

// 把 LLM 输出（含 frontmatter + 正文 + 末尾 tags 注释）规整成最终笔记内容：
//   - 强制覆盖系统字段：mode / time / 时长 / 状态
//   - merge tags：[lexvoice/<mode>] + LLM 标签建议 + (可选) 已有 tags
//   - 删除末尾的 lexvoice-tags 注释
//   - originalFrontmatter 非空时（重新整理场景），保留它的内容字段（用户改过的代号映射等），
//     不让 LLM 的 frontmatter 覆盖；只 merge 新的 tag 建议
function postProcessBriefingOutput(rawOutput, mode, sessionMeta, originalFrontmatter, baseKey, topNotice) {
  if (!rawOutput) return rawOutput || "";
  // 先剥人员机器块、再剥招聘素质块、再剥标签机器块（cleaned 串联，保证三条注释都不残留在正文末尾）。
  const { people: suggestedPeople, cleaned: afterPeople } = parsePeopleFromOutput(rawOutput);
  const { qualities: recruitQualities, cleaned: afterQualities } = parseRecruitQualitiesFromOutput(afterPeople);
  const { tags: suggested, people: peopleFromTags, cleaned: stripped } = parseSuggestedTagsFromOutput(afterQualities);

  // 解析 LLM 输出的 frontmatter（如有）
  const fmMatch = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let llmFm = null;
  let body = stripped;
  if (fmMatch) {
    try { llmFm = obsidian.parseYaml(fmMatch[1]); } catch { llmFm = null; }
    body = stripped.slice(fmMatch[0].length).replace(/^\n+/, "");
  }
  body = normalizeLexVoiceCallouts(body);

  // base frontmatter 选择：重整时优先用 originalFrontmatter（保留用户改动），首次用 LLM 输出。
  // 随后只保留当前模式 schema 内的内容字段，避免 LLM 擅自加入 date/location/decision 等重复字段。
  const rawBase = (originalFrontmatter && typeof originalFrontmatter === "object")
    ? Object.assign({}, originalFrontmatter)
    : (llmFm && typeof llmFm === "object" ? Object.assign({}, llmFm) : {});
  const base = normalizeBriefingFrontmatterFields(rawBase, mode, baseKey);

  // 强制覆盖系统字段
  base.mode = mode;
  if (sessionMeta && sessionMeta.startedAt) {
    const time = formatYamlDateTime(sessionMeta.startedAt);
    if (time) base.time = time;
  } else if (originalFrontmatter && originalFrontmatter.time) {
    const time = formatYamlDateTime(originalFrontmatter.time);
    if (time) base.time = time;
  }
  // time 第三路兜底：前两路都拿不到时（典型：重整一篇本就缺 time 的 custom 笔记），从 fm 的
  // 日期/时间/文件名线索推断，最终回退当天——保证 time 永远非空，打断 custom 模式"缺 time 自锁"。
  if (!base.time) {
    const inferred = formatYamlDateTime(inferLexVoiceNoteStartedAtIso(null, originalFrontmatter || llmFm || {}));
    if (inferred) base.time = inferred;
  }
  if (sessionMeta && sessionMeta.duration) {
    base["时长"] = sessionMeta.duration;
  }
  base["状态"] = "已整理";

  // merge tags：[lexvoice/<mode>] + 已有 + 建议；其中 人物/x 前缀一律剥出转入人物属性，不进 tags。
  const sysTag = "lexvoice/" + mode;
  const rawTags = (originalFrontmatter && originalFrontmatter.tags) || (rawBase && rawBase.tags);
  const existingTagsAll = Array.isArray(rawTags)
    ? rawTags.map(t => String(t).trim()).filter(Boolean)
    : (typeof rawTags === "string" && rawTags.trim() ? [rawTags.trim()] : []);
  const existingPeopleFromTags = [];
  const existingTags = existingTagsAll.filter(t => {
    if (/^人物\//.test(t)) { existingPeopleFromTags.push(t.replace(/^人物\//, "").trim()); return false; }
    return true;
  });
  const tags = [];
  const seen = new Set();
  const push = (t) => { if (t && !seen.has(t)) { tags.push(t); seen.add(t); } };
  push(sysTag);
  for (const t of existingTags) push(t);
  for (const t of suggested) push(t);
  base.tags = tags;

  // 人物：独立人员属性。三源合并（机器块 lexvoice-people + tags 里 人物/ + base 旧人物），归一去重。
  // 这也是"重整一次旧笔记，人物从 tags 自动迁出到 人物 属性"的落点。
  let people = splitPersonFieldValue(base["人物"] || rawBase["人物"] || rawBase.people || []);
  people = mergeUniqueStrings(people, suggestedPeople);
  people = mergeUniqueStrings(people, peopleFromTags);
  people = mergeUniqueStrings(people, existingPeopleFromTags);
  if (people.length) base["人物"] = people; else delete base["人物"];

  // F4.2 招聘：代码注入权威字段（jd 链接 / 候选人 / 轮次）+ 素质三态机器注释 → 素质_<名>。
  // 放在白名单 normalize 之后直接挂 base：jd / 素质_* 不在白名单（否则被裁），候选人/轮次 覆盖模型推断值。
  if (mode === "recruit" && sessionMeta && sessionMeta.recruitContext) {
    const rc = sessionMeta.recruitContext;
    if (rc.jdFile) {
      const jdLink = obsidian.normalizePath(String(rc.jdFile)).replace(/\.md$/i, "");
      if (jdLink) base.jd = `[[${jdLink}]]`;
    }
    if (rc.candidateName) base["候选人"] = String(rc.candidateName).trim();
    if (rc.round) base["轮次"] = String(rc.round).trim();
  }
  for (const [qName, qVerdict] of Object.entries(recruitQualities || {})) {
    if (qName && qVerdict) base["素质_" + qName] = qVerdict;
  }

  // 字段输出顺序：mode → time → 时长 → 人物 → 内容字段 → 状态 → tags。
  // time 使用 YAML 可识别的日期时间标量，例如 2026-05-08T12:55:00；不再保留 date/日期。
  const ordered = {};
  ordered.mode = base.mode;
  if (base.time) ordered.time = base.time;
  if (base["时长"]) ordered["时长"] = base["时长"];
  if (base["人物"] && base["人物"].length) ordered["人物"] = base["人物"];
  // 中间字段：base 自身按插入顺序，但跳过已写入和末尾要写的（含 人物/people，防二次写入）
  const seenKeys = new Set(["mode", "time", "date", "日期", "时间", "时长", "人物", "people", "状态", "status", "tags"]);
  for (const k of Object.keys(base)) {
    if (seenKeys.has(k)) continue;
    ordered[k] = base[k];
  }
  ordered["状态"] = base["状态"];
  ordered.tags = base.tags;

  let yamlBlock;
  try { yamlBlock = obsidian.stringifyYaml(ordered); } catch {
    // 兜底：手动拼
    yamlBlock = Object.entries(ordered).map(([k, v]) => {
      if (Array.isArray(v)) return k + ":\n" + v.map(x => "  - " + String(x)).join("\n");
      return k + ": " + String(v == null ? "" : v);
    }).join("\n") + "\n";
  }
  // topNotice（如截断告警）插在 frontmatter 之后、正文之前——保证 frontmatter 不被破坏、告警最显眼。
  const noticeBlock = topNotice ? String(topNotice).trim() + "\n\n" : "";
  return "---\n" + yamlBlock + "---\n\n" + noticeBlock + body.trimStart();
}

// 从老笔记的文件名 + 内容推断 mode
function inferModeFromLegacyNote(filename, content) {
  // 1. 从 [!info] 录音信息 callout 里的"模式：xxx"提取（最可靠）
  const calloutLine = content.match(/>\s*\[!info\][^\n]*\n>\s*([^\n]+)/);
  if (calloutLine) {
    const mm = calloutLine[1].match(/模式\s*[:：]\s*([一-龥A-Za-z]+)/);
    if (mm) {
      const m = mm[1];
      if (m === "学习" || m === "学习记录") return "learning";
      if (m === "访谈" || m === "访谈调研") return "interview";
      if (m === "会议" || m === "工作纪要") return "meeting";
      if (m === "研讨" || m === "研讨会" || m === "学术研讨" || m === "主题沙龙") return "seminar";
      if (m === "小会" || m === "讨论" || m === "圆桌讨论") return "huddle";
      if (m === "独白" || m === "手记" || m === "个人笔记") return "monologue";
      if (m === "面试" || m === "招聘" || m === "招聘评估") return "recruit";
    }
  }

  // 2. 文件名前缀（"访谈-xxx"、"面试-xxx"等）
  if (/(?:^|·\s*)面试|招聘/i.test(filename)) return "recruit";
  if (/(?:^|·\s*)学习|视频|课程|讲座/i.test(filename)) return "learning";
  if (/(?:^|·\s*)研讨|沙龙|论坛/i.test(filename)) return "seminar";
  if (/(?:^|·\s*)访谈/i.test(filename)) return "interview";
  if (/(?:^|·\s*)小会|圆桌/i.test(filename)) return "huddle";
  if (/(?:^|·\s*)独白|(?:^|·\s*)手记|个人笔记/i.test(filename)) return "monologue";
  if (/(?:^|·\s*)会议|纪要/i.test(filename)) return "meeting";

  // 3. H1 标题里的 emoji
  const h1Match = content.match(/^#\s+([^\n]*)/m);
  if (h1Match) {
    const h1 = h1Match[1];
    if (/🧑‍💼|面试|招聘/.test(h1)) return "recruit";
    if (/📚|学习|视频|课程|讲座/.test(h1)) return "learning";
    if (/研讨|沙龙|论坛/.test(h1)) return "seminar";
    if (/🎤|访谈/.test(h1)) return "interview";
    if (/🤝|小会/.test(h1)) return "huddle";
    if (/💭|独白|手记/.test(h1)) return "monologue";
    if (/📋|会议/.test(h1)) return "meeting";
  }

  // 4. H2 标题
  const h2Match = content.match(/^##\s+([^\n]*)/m);
  if (h2Match) {
    const h2 = h2Match[1];
    if (/面试|招聘/.test(h2)) return "recruit";
    if (/学习|视频|课程|讲座/.test(h2)) return "learning";
    if (/研讨|沙龙|论坛/.test(h2)) return "seminar";
    if (/访谈/.test(h2)) return "interview";
    if (/小会/.test(h2)) return "huddle";
    if (/会议/.test(h2)) return "meeting";
    if (/独白|手记/.test(h2)) return "monologue";
  }

  // 5. 内容包含特征性段落
  if (/候选人画像|JD\s*匹配度|录用建议/.test(content)) return "recruit";
  if (/学习要点|可收纳卡片|概念与术语|学习材料/.test(content)) return "learning";
  if (/观点谱系|研讨摘要|问题意识|争议与分歧/.test(content)) return "seminar";
  if (/受访者|访问者/.test(content)) return "interview";
  if (/参谋.*戳破|认知提醒/.test(content)) return "huddle";
  if (/参会人/.test(content)) return "meeting";

  return null;
}

// 从文件名推断主题：去掉日期/时间前缀和模式标签前缀
function inferTopicFromFilename(filename) {
  let stem = String(filename || "").replace(/\.md$/i, "");
  // 去掉 "YYYY-MM-DD HHmm · " 或 "YYYY-MM-DD · " 或 "YYYY-MM-DD HHmm "
  stem = stem.replace(/^\d{4}-\d{2}-\d{2}(?:\s+\d{4})?\s*·?\s*/, "");
  // 去掉模式标签前缀（"访谈-"、"面试-"、"会议-"等）
  stem = stem.replace(/^(访谈|面试|招聘|会议|研讨|研讨会|沙龙|论坛|小会|独白|手记|纪要)\s*[-—－]?\s*/, "");
  return stem.trim();
}

function buildSessionMetaPrefix(meta, mode) {
  if (!meta || !meta.startedAt) return "";
  const m = window.moment(meta.startedAt);
  const date = m.format("YYYY-MM-DD");
  const time = m.format("HH:mm");
  const duration = meta.duration || "";
  const lines = [
    "## 会话元信息（**直接填入 frontmatter 对应字段，不要推断、不要修改**）",
    "",
    "- 日期: " + date,
    "- 时间: " + time,
  ];
  if (duration) lines.push("- 时长: " + duration);
  if (mode) lines.push("- mode: " + mode);
  lines.push("");
  lines.push("frontmatter 的「日期」「时间」「时长」「mode」字段必须照搬上面给定的值；其他字段（主题、参会人等）根据转写内容推断。");
  return lines.join("\n");
}



function buildAdaptiveBriefingLengthInstruction(mode, stats) {
  // 长度分档与 token 配额共用同一判定（src/llm/config.ts classifyBriefingLength），
  // 确保"给多少篇幅指令"和"给多少 max_tokens"始终在同一档位，不会一个说超长、另一个只给短配额。
  const tier = classifyBriefingLength(stats);
  const isUltraLong = tier === "ultra";
  const isLong = isUltraLong || tier === "long";
  const isMediumLong = isLong || tier === "medium";
  const lines = [
    "## 篇幅与信息密度策略",
    "",
    "- 【还原而非摘要】你的任务是「重建」这场录音的完整内容，不是「概括」它。原文里出现的每一个事实、数字、人名、判断、立场、案例、待办、风险都要在纪要里有对应落点；用户要的是结构化的完整还原，不是形式上的精简。",
    "- 【禁止偷懒式压缩】严禁用「此外还讨论了 X」「双方还交流了 Y 等话题」这类一句话带过一整段讨论。凡原文实际展开过的内容，纪要也必须实际展开，而不是只留一个标题或一句概述。「更结构化」指层次更清晰，绝不等于「更简略」。",
    "- 内置模板里的句数、字数和条数是常规材料的起步基准，不是封顶线；请按录音时长、信息密度和主题数量自动扩展。",
    "- 顶部摘要要便于快速扫读，但主体内容不能因为摘要短而缩水；必须覆盖开头、中段、结尾和所有主要主题。",
    "- 如果模型上下文或输出能力有限，优先保证全篇覆盖：宁可每个主题略短，也不要只整理前半段或少数高频片段。",
    "- 注意：上面这些「扩展/完整」要求针对的是原文真实存在的内容；不得为凑长度编造原文没有的事实、人名或数字（这与忠实还原同等重要）。",
  ];
  if (isUltraLong) {
    lines.push("- 当前材料属于超长录音或多文件合并材料。请先按时间顺序建立全景章节，再逐章整理，覆盖从开头到结尾的每一段。");
    lines.push("- 【篇幅自管理·重要】你的单次输出长度有限。务必把篇幅预算分配到全程：宁可每个章节写得更紧凑，也必须一路覆盖到录音结尾——绝不允许前半段写得很充分、却在中途用尽篇幅导致后半段缺失。先确保「全程都到了」，再在余量内加深细节。");
  } else if (isLong) {
    lines.push("- 当前材料属于长录音。请按主题/章节展开，不要压缩成普通短会纪要；每个主要章节都要有独立标题、核心观点和必要支撑。");
    lines.push("- 每个被实际讨论过的主题，至少展开成一段完整叙述（背景 → 展开 → 结论或分歧），不要把一个详细讨论过的主题压成单句。一小时以上的会议，主体通常应有多个三级标题、整体篇幅明显长于短会纪要。");
    lines.push("- 篇幅自管理：注意把篇幅分配到全程，确保覆盖到录音结尾，不要前段冗长、后段缺失。");
  } else if (isMediumLong) {
    lines.push("- 当前材料偏长。摘要仍保持清晰，但主体应比短录音更充分，避免把多个主题合并成过粗的一两段。");
  }
  if (mode === "learning") {
    lines.push("- 学习笔记尤其要随材料长度扩展：学习要点、概念术语、可收纳卡片和追问问题都应跟随内容密度增加；长课程优先按章节输出全景学习笔记。");
  } else if (mode === "meeting" || mode === "seminar" || mode === "huddle") {
    lines.push("- 会议/研讨类内容应随议题数量扩展：主要议题、观点谱系、决策、风险、待办和悬而未决问题都要按实际出现情况保留，不要为保持短小而合并掉关键差异。");
  } else if (mode === "interview" || mode === "recruit") {
    lines.push("- 访谈/招聘类内容应随问题数量和证据密度扩展：保留每个关键问题、回答证据、追问和判断依据，不要只输出总评。");
  } else if (mode === "monologue") {
    lines.push("- 个人口述应随思路分叉扩展：保留所有有信息量的判断、问题和延伸方向，不要把长独白压成一段摘要。");
  }
  return lines.join("\n");
}

// 把 prompt 里的 {{STRUCTURE_INSTRUCTION}} 占位符替换为用户当前选择的结构化程度指令
function applyStructureLevelInstruction(prompt, settings, overrideLevel) {
  const level = overrideLevel || (settings && settings.briefingStructureLevel) || "balanced";
  const block = buildStructureLevelInstruction(level);
  return prompt.replace("{{STRUCTURE_INSTRUCTION}}", block);
}

const REPOLISH_PREFERENCE_PRESETS = {
  detailed: {
    label: "更详细",
    detailLevel: "detailed",
    structureLevel: "balanced",
    fidelity: "faithful",
    description: "主体内容更充分，保留更多事实、论证、例子和上下文。",
  },
  concise: {
    label: "更精炼",
    detailLevel: "concise",
    structureLevel: "balanced",
    fidelity: "faithful",
    description: "压缩重复表达，保留结论、依据、待办和关键分歧。",
  },
  structured: {
    label: "更结构化",
    detailLevel: "balanced",
    structureLevel: "strict",
    fidelity: "faithful",
    description: "强化标题、层级、论点—支撑—证据关系，适合复杂讨论。",
  },
  natural: {
    label: "更自然",
    detailLevel: "balanced",
    structureLevel: "loose",
    fidelity: "faithful",
    description: "减少框架感，用更连贯的散文段落呈现。",
  },
  markdown: {
    label: "MD 强化",
    detailLevel: "balanced",
    structureLevel: "balanced",
    fidelity: "expanded",
    markdownEnhanced: true,
    description: "更多使用 Markdown 高亮、下划线和少量 callout，让重点更容易扫读。",
  },
  detailedExpanded: {
    label: "详细拓展",
    detailLevel: "detailed",
    structureLevel: "balanced",
    fidelity: "expanded",
    markdownEnhanced: true,
    description: "在更完整保留上下文的同时，补充概念、疑问和分歧视角。",
  },
  structuredExpanded: {
    label: "结构拓展",
    detailLevel: "balanced",
    structureLevel: "strict",
    fidelity: "expanded",
    markdownEnhanced: true,
    description: "在更清晰的结构里加入必要的 AI 补充和 Markdown 标记。",
  },
  faithful: {
    label: "忠于原文",
    detailLevel: "balanced",
    structureLevel: "balanced",
    fidelity: "faithful",
    description: "不主动外推，只整理录音中明确出现的内容。",
  },
  expanded: {
    label: "适度拓展",
    detailLevel: "balanced",
    structureLevel: "balanced",
    fidelity: "expanded",
    description: "在不编造事实的前提下，补足背景、逻辑关系和可执行建议。",
  },
};

function getRepolishPreferencePreset(key) {
  const preset = REPOLISH_PREFERENCE_PRESETS[key];
  return preset ? Object.assign({ key }, preset) : null;
}

function buildRepolishPreferenceInstruction(options) {
  const opt = options && typeof options === "object" ? options : {};
  const lines = [];
  if (opt.label || opt.description) {
    lines.push(`【本次重新整理的最高优先级要求 ——「${opt.label || "自定义"}」。当它和模板里的默认篇幅/排版/尺度相冲突时一律以这里为准，必须让成品和其它偏好的产出明显不同、一眼能看出区别。】`);
    if (opt.description) lines.push(`目标：${opt.description}`);
  }
  if (opt.detailLevel === "detailed") {
    lines.push("- 篇幅与详略：**显著加长、写透每一处**。每个主题都展开成「背景/起因 → 核心判断 → 支撑依据 → 关键例子或数据 → 影响 → 下一步」；原文出现的例子、数字、各方立场、反对意见、风险都要保留。长录音按主题分章逐章展开，整体篇幅应明显多于常规版，**绝不压成短摘要**。");
  } else if (opt.detailLevel === "concise") {
    lines.push("- 篇幅与详略：**大幅压缩、只留干货**。每个主题尽量 2-4 句，直给结论 + 关键依据；砍掉所有铺垫、寒暄、重复和过程性细节。待办/风险/分歧用最短的列表点出。整体篇幅应明显短于常规版。但有一条铁律高于「短」：**每个承载独立事实/数字/判断/立场/待办的信息点都必须保留至少一次——可以变短，不能变少**；某主题确有 5 条以上独立要点时，宁可超过 2-4 句也要全部点到，绝不为压缩而丢信息。");
  }
  if (opt.structureLevel === "strict") {
    lines.push("- 排版结构：**高度结构化、强骨架**。全篇用清晰的二级/三级标题切分主题；每个论点尽量走「结论 → 依据 → 影响/待办」固定顺序；可对比的信息（多个方案/候选/指标）优先用 Markdown 表格呈现；要点用列表但最多 3 级、不过度嵌套。成品应一眼看上去层级分明、骨架清楚。");
  } else if (opt.structureLevel === "loose") {
    lines.push("- 排版结构：**去框架、散文化**。以连贯的自然段落叙述讨论脉络，读起来像一篇通顺文章而非要点清单；**除待办/清单这类天然是列表的内容外，尽量不要用项目符号**；少用标题、不要把内容切成碎片。成品应一眼看上去是成段的文字。");
  }
  if (opt.fidelity === "faithful") {
    lines.push("- 处理尺度：**严格忠于原文，只增不减地保真**。不补充录音里没出现的新事实、数据或结论；同时不得删除录音中已出现的任何具体事实、数字、判断、立场或待办——精炼只能压缩「表达方式」，不能压缩「信息条数」。");
  } else if (opt.fidelity === "expanded") {
    lines.push("- 处理尺度：**主动适度拓展**（基于原文推导，绝不编造事实/数据/人名/责任人/结论）。在恰当处用下面这些 callout 补出一层分析，让成品明显比「忠于原文」版多出 AI 视角：");
    lines.push("  - `> [!question] AI 补充：疑问与待澄清` —— 原文里未闭合的问题，写清为何重要、影响什么、下一步该确认什么（2-5 条）；");
    lines.push("  - `> [!tip] AI 补充：概念背景` —— 关键概念/术语/方法论的解释、上下位关系、常见误区；");
    lines.push("  - `> [!warning] AI 观察：争议与分歧` —— 分歧集中时概括争议焦点、各方关切和未解决风险（不臆测情绪动机）；");
    lines.push("  - 所有 AI 补充必须写在 callout 标题里、与原始记录区分；没足够依据宁可不补。");
  }
  if (opt.markdownEnhanced) {
    lines.push("- Markdown 表达：适度用 `==重点==` 标最值得回看的结论/风险、`<u>关键概念</u>` 标需关注的术语；克制，每小节最多 2-4 处，不整段高亮。");
  }
  if (!lines.length) return "";
  return lines.join("\n");
}

function applyRepolishPreferenceInstruction(prompt, options, settings) {
  let block = buildRepolishPreferenceInstruction(options);
  const addendum = String(settings && settings.repolishPreferencePromptAddendum || "").trim();
  if (addendum && options) {
    block = [block, "## 用户自定义重新整理偏好", addendum].filter(Boolean).join("\n");
  }
  return block ? block + "\n\n---\n\n" + prompt : prompt;
}

// 解析活跃 prompt 模板：优先用户在管理页选中的活跃模板，
// 然后是该模板自定义的 prompt 文本（非空覆盖内置），最后回退到内置 POLISH_PROMPTS / MERGE_PROMPTS
function resolveTemplatePromptForMode(plugin, mode, isMerged) {
  const builtins = isMerged ? MERGE_PROMPTS : POLISH_PROMPTS;
  const customMode = getCustomPromptModeTemplate(plugin.settings, mode);
  const baseMode = customMode && customMode.baseMode && builtins[customMode.baseMode] ? customMode.baseMode : "learning";
  const fallback = builtins[mode] || builtins[baseMode] || builtins.interview;
  const tpls = plugin.settings.promptTemplates || {};
  const activeId = (plugin.settings.activeTemplateByMode || {})[mode];
  const tpl = activeId ? tpls[activeId] : customMode;
  if (tpl && typeof tpl.prompt === "string" && tpl.prompt.trim()) return tpl.prompt;
  const legacyKey = legacyPromptFieldForMode(mode);
  const legacy = legacyKey ? plugin.settings[legacyKey] : "";
  if (legacy && typeof legacy === "string" && legacy.trim()) return legacy;
  return fallback;
}

const TEXT_IMPORT_PRE_SUMMARY_THRESHOLD_CHARS = 120000;
const TEXT_IMPORT_PRE_SUMMARY_MAX_CHUNKS = 24;
const TEXT_IMPORT_RECRUIT_CONTEXT_CHARS = 12000;
const TEXT_IMPORT_FINAL_CONTEXT_COMPACT_THRESHOLD_CHARS = 120000;





function formatMergeSegmentForPrompt(seg, fallbackIndex) {
  const safeIndex = Number.isFinite(Number(seg && seg.index)) ? Number(seg.index) : fallbackIndex;
  const start = Number(seg && seg.startOffsetMs) || 0;
  const end = Number(seg && seg.endOffsetMs) || 0;
  const anchor = seg && seg.audioName ? ` ${getAudioTimeLink(seg.audioName, getSegmentAudioLinkOffsetMs(seg))}` : "";
  const tag = `===SEG ${safeIndex + 1} (${formatElapsed(start)}-${formatElapsed(end)})${anchor}===`;
  // 转写失败段：把失败原因带进 merge 输入并显式要求模型在纪要相应位置标注缺漏，
  // 不让"这段没内容"被模型静默跳过 → 纪要在该时段凭空断层而用户不知。
  const text = String((seg && seg.text) || "").trim();
  if (!text && seg && seg.error) {
    return `${tag}\n_[本段转写失败：${String(seg.error).slice(0, 120)}；此时间段（${formatElapsed(start)}–${formatElapsed(end)}）内容缺失，请在纪要对应位置标注"（此处约 ${formatElapsed(start)}–${formatElapsed(end)} 有内容因转写失败而缺失）"]_`;
  }
  return `${tag}\n${text || "_[此段无内容]_"}`;
}

async function maybePreSummarizeTextImportForMerge(plugin, segments, mode, recruitContext, sessionMeta) {
  if (!sessionMeta || sessionMeta.source !== "text-import") return segments;
  const joined = (segments || []).map((s, i) => formatMergeSegmentForPrompt(s, i)).join("\n\n");
  if (joined.length <= TEXT_IMPORT_PRE_SUMMARY_THRESHOLD_CHARS) return segments;

  const chunkSize = Math.max(
    TEXT_IMPORT_PRE_SUMMARY_CHUNK_CHARS,
    Math.ceil(joined.length / TEXT_IMPORT_PRE_SUMMARY_MAX_CHUNKS),
  );
  const chunks = splitLongTextForLlm(joined, chunkSize);
  if (chunks.length <= 1) return segments;

  await logLlmRequestDiagnostic(plugin, "warn", "llm.merge_long_text_presummary_start", "长文本导入启动分段预摘要", {
    mode,
    source: sessionMeta.source,
    segmentCount: Array.isArray(segments) ? segments.length : 0,
    inputChars: joined.length,
    chunkCount: chunks.length,
    chunkSize,
  });

  const recruitPrefix = mode === "recruit" && recruitContext
    ? truncateForLlmPrompt(buildRecruitContextPrefix(recruitContext), TEXT_IMPORT_RECRUIT_CONTEXT_CHARS)
    : "";
  const sys = mode === "recruit"
    ? "你是严格的招聘评估预处理助手。你的任务是把长文本片段压缩为可用于最终招聘评估的证据摘要，不做最终录用结论。"
    : "你是 LexVoice 的长文本预处理助手。你的任务是把长文本片段压缩为可用于最终整理的结构化证据摘要。";
  const summaries = [];
  for (let i = 0; i < chunks.length; i++) {
    const user = [
      recruitPrefix,
      "## 任务",
      "",
      `这是导入文本的第 ${i + 1}/${chunks.length} 个片段。请生成结构化预摘要，供后续最终整理使用。`,
      "",
      "要求：",
      "- 只依据本片段，不补充片段外事实。",
      "- 保留人物、待办、决策、问题、概念、争议点和明确证据。",
      "- 如果是招聘评估，重点保留 JD 匹配证据、红旗、追问、简历与陈述不一致处。",
      "- 输出 Markdown bullet，尽量短，但不要丢失关键事实。",
      "",
      "## 片段原文",
      "",
      chunks[i],
    ].filter(Boolean).join("\n");
    try {
      const summary = await callLlm(plugin, sys, user, { timeoutMs: 90000 });
      summaries.push(summary || "_[本片段预摘要为空]_");
    } catch (e) {
      await logLlmRequestDiagnostic(plugin, "error", "llm.merge_long_text_presummary_failed", "长文本导入分段预摘要失败", {
        mode,
        source: sessionMeta.source,
        chunkIndex: i + 1,
        chunkCount: chunks.length,
        chunkChars: chunks[i].length,
        error: diagnosticError(e),
      });
      throw e;
    }
  }

  await logLlmRequestDiagnostic(plugin, "info", "llm.merge_long_text_presummary_done", "长文本导入分段预摘要完成", {
    mode,
    source: sessionMeta.source,
    inputChars: joined.length,
    chunkCount: chunks.length,
    summaryChars: summaries.reduce((sum, text) => sum + String(text || "").length, 0),
  });

  return summaries.map((summary, i) => ({
    index: i,
    startOffsetMs: 0,
    endOffsetMs: 0,
    audioName: "",
    sourceName: `长文本预摘要 ${i + 1}`,
    sourcePath: "",
    rawText: "",
    text: `【长文本预摘要 ${i + 1}/${summaries.length}】\n${summary}`,
  }));
}

async function polishTranscript(plugin, transcript, mode, recruitContext, sessionMeta, originalFrontmatter, repolishOptions) {
  if (!transcript || !transcript.trim()) return "";
  if (mode === "off") return transcript;
  const tpl = resolveTemplatePromptForMode(plugin, mode, false);
  const sys = mode === "recruit"
    ? "你是严格的招聘评估官，立场是替面试官筛掉不达标候选人，而不是替候选人辩护。默认假设候选人不达标，需要看到正向证据才能加分。诚实/不夸大/承认边界是基础职业素养，不计入亮点。结果未闭环、独立主导不清、行业不匹配、关键能力仅'接触过'级别——这些必须列入红旗。"
    : "你是一位专业的文字编辑助手，擅长整理访谈、会议与口述的录音转写。";
  let userPrompt = applyStructureLevelInstruction(tpl, plugin.settings, repolishOptions && repolishOptions.structureLevel).replace("{{TRANSCRIPT}}", transcript);
  userPrompt = applyRepolishPreferenceInstruction(userPrompt, repolishOptions, plugin.settings);
  userPrompt = applyBriefingLanguageInstruction(userPrompt, plugin.settings);
  userPrompt = userPrompt.replace("{{STRUCTURE_INSTRUCTION}}", "");
  const adaptiveLength = buildAdaptiveBriefingLengthInstruction(mode, {
    durationMs: getSessionMetaDurationMs(sessionMeta),
    transcriptChars: transcript.length,
    segmentCount: 1,
  });
  if (adaptiveLength) userPrompt = adaptiveLength + "\n\n---\n\n" + userPrompt;
  // 自适应 max_tokens：长材料能产出更长纪要，不被 API 默认上限（~4096）一刀切。
  const briefingMergeMaxTokens = getBriefingMergeMaxTokens({
    durationMs: getSessionMetaDurationMs(sessionMeta),
    transcriptChars: transcript.length,
    segmentCount: 1,
  }, plugin.settings);
  const metaPrefix = buildSessionMetaPrefix(sessionMeta, mode);
  if (metaPrefix) userPrompt = metaPrefix + "\n\n---\n\n" + userPrompt;
  const meetingWorkbenchPrompt = buildMeetingWorkbenchPrompt(sessionMeta && sessionMeta.meetingWorkbench);
  if (meetingWorkbenchPrompt) userPrompt = meetingWorkbenchPrompt + "\n\n---\n\n" + userPrompt;
  const peopleContext = await buildPeopleContextForLlm(plugin);
  if (peopleContext) userPrompt = peopleContext + "\n\n---\n\n" + userPrompt;
  if (mode === "recruit" && recruitContext) {
    const recruitPrefix = buildRecruitContextPrefix(recruitContext);
    const compactRecruitContext = sessionMeta
      && sessionMeta.source === "text-import"
      && recruitPrefix.length + userPrompt.length > TEXT_IMPORT_FINAL_CONTEXT_COMPACT_THRESHOLD_CHARS;
    if (compactRecruitContext) {
      await logLlmRequestDiagnostic(plugin, "warn", "llm.merge_recruit_context_compacted", "招聘文本导入上下文过长，已压缩注入", {
        mode,
        source: sessionMeta.source,
        recruitContextChars: recruitPrefix.length,
        promptCharsBeforeContext: userPrompt.length,
        compactChars: TEXT_IMPORT_RECRUIT_CONTEXT_CHARS,
      });
    }
    userPrompt = (compactRecruitContext
      ? truncateForLlmPrompt(recruitPrefix, TEXT_IMPORT_RECRUIT_CONTEXT_CHARS)
      : recruitPrefix) + "\n\n" + userPrompt;
  }
  userPrompt = appendSedimentPreExtractionInstruction(userPrompt);
  // 流式：merge 是最长、最贵、跑一次的调用。流式 + 空闲超时确保服务端只要在持续输出就不会被
  // 客户端总超时 abort，避免"扣了钱却因超时拿不到结果"的浪费（符合总纲：不因工程缺陷浪费）。
  const raw = await callLlm(plugin, sys, userPrompt, { stream: true, payload: { max_tokens: briefingMergeMaxTokens } });
  const sedimentPreExtraction = extractSedimentPreExtractionBlock(raw);
  const polished = postProcessBriefingOutput(sedimentPreExtraction.cleaned, mode, sessionMeta, originalFrontmatter, frontmatterBaseModeKey(plugin, mode));
  return sedimentPreExtraction.objects ? appendSedimentPreExtractionBlock(polished, sedimentPreExtraction.objects) : polished;
}

// ============================================================
// 招聘需求挖掘模式（recruit-needs）· Phase 1：会后岗位画像生成
// HRBP × 业务方的"招聘需求沟通会"→ 结构化 JobPortrait。详见产品 spec。
// ============================================================

// 14 维画像 schema baseline（spec §7.2 / §8.1）。category 决定渲染分区。

// 会中字段树的分组标题（Phase 2 实时大纲用）。
const JOBPORTRAIT_GROUP_LABEL = { hard: "硬性要求", soft: "软能力", risk: "风险信号", culture: "文化匹配" };
const JOBPORTRAIT_GROUP_ORDER = ["hard", "soft", "risk", "culture"];
const JOBPORTRAIT_COVERAGE_ICON = { covered: "check-circle-2", partial: "circle-dot", missing: "circle" };

// Phase 3 会中"追问建议"规则库：每维一条兜底话术（模型没给定制话术时回落）+ 优先级权重。
// priority 越大越靠前，已隐含分组序 hard(5) > soft(4) > risk(3) > culture(2)，排序时不必再查 group。

// 会中同时最多显示的追问卡数（节奏控制，不刷屏）。初版保守取 2，观察真实使用后再调。
const JOBPORTRAIT_FOLLOWUP_MAX_CARDS = 2;

// 所有招聘需求挖掘 prompt 共享的 system 前缀（spec §5.1）。


// 会后整合 prompt（叙述式自然生长，v2）：整场转写 → 依据实际讨论生长出来的 Markdown 岗位画像。
// 刻意不再用固定 14 格 JSON 表单填空——那会逼模型抠片段硬套、产出稀薄；14 维只作模型内部的"挖全了没"查漏清单。

// （已移除 parseJobPortraitModel / renderJobPortraitMarkdown：会后画像改叙述式自然生长，
//   模型直接产出 Markdown，不再走 JSON 解析 + 固定模板渲染。会中字段树的结构化覆盖数据仍由
//   parseCoverageScanModel 维护；web 端结构化画像后续按需二次提取。）

// 解析会中 coverage-scan 的 14 维 JSON（防御性）：按 baseline 兜底补全缺维、status 白名单过滤、
// 挡掉编造/格式错的 evidence 锚点、单维不回退合并（防长会尾窗截断导致已覆盖维度闪回 missing）。
function parseCoverageScanModel(raw, prev, allowFreeze = true) {
  const parsedObj = extractJsonObject(stripModeSuggestionBlocks(String(raw || "")).trim());
  // parse 失败（模型把 JSON 写崩，常因 followup_question 里塞了未转义的引号/换行）→ 别逐维重建成全 missing
  // 把字段树清零；有 prev 时原样保留上一轮结果。扩 schema 抬高了整轮 JSON 崩的概率，这是"突然清零"的防线。
  if (!parsedObj && prev && prev.dims && Object.keys(prev.dims).length) {
    return prev;
  }
  const obj = parsedObj || {};
  const str = (v) => (v == null ? "" : String(v)).trim();
  const VALID = new Set(["covered", "partial", "missing"]);
  const anchorOk = (a) => /\[\[[^\]\n|]+\|\d{1,2}:\d{2}(?::\d{2})?\]\]/.test(String(a || ""));
  // 兼容 dims 是数组或对象两种形态
  const byKey = {};
  const rawDims = obj.dims;
  if (Array.isArray(rawDims)) {
    for (const d of rawDims) { if (d && d.key) byKey[str(d.key)] = d; }
  } else if (rawDims && typeof rawDims === "object") {
    for (const k of Object.keys(rawDims)) byKey[k] = Object.assign({ key: k }, rawDims[k]);
  }
  const fresh = {};
  for (const dim of JOBPORTRAIT_DIMENSIONS) {
    const d = byKey[dim.key] || {};
    let status = str(d.status);
    if (!VALID.has(status)) status = "missing";
    let anchor = str(d.evidence_anchor);
    if (!anchorOk(anchor)) anchor = ""; // 编造/格式错的锚点一律挡掉，避免渲成假可点链接
    fresh[dim.key] = {
      status,
      evidence_anchor: status === "missing" ? "" : anchor,
      missing_what: status === "covered" ? "" : str(d.missing_what),
      // Phase 3：覆盖扫描同轮顺带产出的"追问话术 + 命中模糊词"，寄生在 dim 上，不另起 LLM 调用。
      followup_question: status === "covered" ? "" : str(d.followup_question),
      vague_hits: Array.isArray(d.vague_hits) ? d.vague_hits.map(str).filter(Boolean).slice(0, 3) : [],
    };
  }
  const merged = mergeCoverageNoRegress(fresh, (prev && prev.dims) || {}, allowFreeze);
  const covered = Object.keys(merged).filter((k) => merged[k] && merged[k].status === "covered").length;
  return {
    version: 1,
    dims: merged,
    covered,
    total: JOBPORTRAIT_DIMENSIONS.length,
    updatedAt: new Date().toISOString(),
    segmentCount: (prev && prev.segmentCount) || 0,
  };
}


// 人物指认幻觉的机械兜底（软提示，不删改）：模型可能把转写里零星出现的称呼提升为贯穿全文的
// 核心人物（实测案例：把全场只提到三五次的"某称呼"指认为一号位）。这里按 lexvoice-people 名单
// 比对"产出引用次数 vs 原始转写出现次数"，明显倒挂的在文末附核对 callout。
// 字面计数会因转写错字低估真实人名（"李扣"被听写成"你扣"），所以只提示、绝不自动改写。
function appendEntityEvidenceWarning(outputMd, transcript) {
  try {
    const md = String(outputMd || "");
    const parsed = parsePeopleFromOutput(md);
    const names = (parsed && parsed.people) || [];
    if (!names.length) return outputMd;
    const findings = findLowEvidenceEntities(names, md, String(transcript || ""));
    if (!findings.length) return outputMd;
    const lines = findings.map(f => `> - 「${f.name}」：正文引用 ${f.outputCount} 次，原始转写仅出现 ${f.transcriptCount} 次——其身份/角色可能是 AI 推断，请核对`);
    return `${md}\n\n> [!warning] 人物指认核对\n${lines.join("\n")}\n> 检测按字面计数，转写错字可能造成误报；确认无误后可删除本块。`;
  } catch (e) {
    console.error("[LexVoice] entity evidence audit failed", e);
    return outputMd;
  }
}

// 把段按累计字符数贪心切成若干组，边界落在段边界（不切碎单段），每组 ~targetChars。
function splitSegmentsIntoGroups(segments, targetChars) {
  const groups = [];
  let cur = [];
  let curChars = 0;
  for (const seg of (segments || [])) {
    const segChars = String((seg && seg.text) || "").length;
    if (cur.length && curChars + segChars > targetChars) {
      groups.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(seg);
    curChars += segChars;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

// 清稿：把母本 raw 分段转写「清干净」成忠实可读的文字稿（非纪要、不压缩）。
// 关键：清稿输出 ≈ 输入长度（略短），绑定约束是「输出要塞进 ceiling」→ 分段字符目标按反推 ≈ ceiling×1.5（封顶 24000）。
// 绝不能套纪要那条 ×3.2 压缩公式——清稿不压缩，块喂太大会逐块截断、真丢内容。逐块 truncated 上报，供调用方挂警告。
async function cleanTranscript(plugin, segments, ceiling) {
  const list = Array.isArray(segments) ? segments.filter(s => s && String(s.text || "").trim()) : [];
  if (!list.length) return { text: "", truncated: false };
  const safeCeiling = Math.max(2048, Number(ceiling) || getLlmOutputCeiling(plugin.settings));
  const targetChars = Math.min(24000, Math.max(6000, Math.floor(safeCeiling * 1.5)));
  const groups = splitSegmentsIntoGroups(list, targetChars);
  const runGroup = async (g, partIndex, partTotal) => {
    const joined = g.map((s, j) => formatMergeSegmentForPrompt(s, j)).join("\n\n");
    const start = formatElapsed(Number(g[0] && g[0].startOffsetMs) || 0);
    const end = formatElapsed(Number(g[g.length - 1] && g[g.length - 1].endOffsetMs) || 0);
    let up = buildCleanTranscriptChunkPrompt(joined, partIndex, partTotal, `${start}–${end}`);
    up = applyBriefingLanguageInstruction(up, plugin.settings);
    const { text, truncated } = await callBriefingMergeLlm(
      plugin, CLEAN_TRANSCRIPT_SYSTEM, up,
      { stream: true, payload: { max_tokens: safeCeiling } },
      { mode: "cleanscript", chunked: partTotal > 1, part: partIndex, partTotal },
    );
    return { text: String(text || "").trim(), truncated: !!truncated };
  };
  if (groups.length < 2) {
    return await runGroup(list, 1, 1);
  }
  const parts = [];
  let anyTruncated = false;
  for (let i = 0; i < groups.length; i++) {
    const r = await runGroup(groups[i], i + 1, groups.length);
    if (r.truncated) anyTruncated = true;
    parts.push(r.text || "_[本部分无可整理内容]_");
  }
  return { text: parts.join("\n\n"), truncated: anyTruncated };
}

// 分段整理用的「部分」提示词：只产出本部分正文片段（无 YAML、无顶部总览），末尾给人物/标签/小结机器注释。
function buildChunkMergePrompt(joinedChunk, partIndex, partTotal, timeRange) {
  return `你正在整理一场超长会议/录音的**第 ${partIndex}/${partTotal} 部分**（时间段约 ${timeRange}）。请把这部分的分段转写整理成忠实、结构化的 Markdown 纪要**正文片段**。

【最高优先级·忠实还原】本部分出现的所有事实、数字、判断、立场、待办、风险、关键原话一律保留，宁可写长也不要漏；只做无损整理（去口头禅、合并重复表述），不得以"概括/精炼"为名删除任何一条具体信息。禁止用"还讨论了 X""此外提到 Y"这类一句话带过本部分实际展开过的内容——该展开的要展开成完整段落。

【硬性要求】
- 只整理本部分，不复述其它部分；**不要**写 YAML frontmatter；**不要**写顶部总览/摘要 callout（顶部总览由程序统一生成）。
- 用二级/三级标题组织本部分议题；按讨论实际推进顺序展开。
- 待办用 \`- [ ] 事项：<动作>\`，能确定时再补 \`责任人：<人>\` 和 \`截止：<时间>\`；无法判断就直接省略该字段，不要写"未提及"。
- 转写里没出现的人名/公司/数字一律不写，不编造。
- 直接输出本部分正文 Markdown，无前言、无解释、无代码围栏。
- 正文末尾追加三条机器注释（不渲染显示）：\`<!-- lexvoice-people: 本部分确实出现的人名，逗号分隔，没有就留空 -->\`、\`<!-- lexvoice-tags: 主题/xx 等多维标签，没有就留空 -->\`、\`<!-- lexvoice-part-summary: 本部分一句话小结 -->\`。

【本部分转写】
${joinedChunk}`;
}

// 超长会议分段整理 + 拼接：当单次输出装不下完整纪要时，按时间切成多段分别整理，再拼成一篇。
// 仅在 desired > ceiling 的超长场景触发（见 mergeAndPolish 的 shouldChunk）。返回 null 表示无法分段、退回单次。
async function mergeAndPolishLongSession(plugin, segments, mode, computedMeta, originalFrontmatter, repolishOptions, ceiling) {
  const safeCeiling = Math.max(2048, Number(ceiling) || LLM_OUTPUT_CEILING_FALLBACK);
  // 每组转写字符目标：组产出纪要 token ≈ 0.25×字符数，要落在 ceiling 内 → 字符目标 ≈ 3.2×ceiling（留余量给截断检测）。
  // 再加绝对上限 36000：确保「内容真的多」的超长会议无论模型 ceiling 多高都能切成多组、逐段充分整理，
  // 而不是因 ceiling 偏高（如 MiMo 16K → 旧公式 56000）导致 targetChars 过大、切不出多组又退回单次。
  const targetChars = Math.min(36000, Math.max(8000, Math.floor(safeCeiling * 3.2)));
  const groups = splitSegmentsIntoGroups(segments, targetChars);
  if (groups.length < 2) return null; // 切不出多组 → 退回单次
  await logLlmRequestDiagnostic(plugin, "info", "llm.merge_long_session_chunked", "超长会议启用分段整理+拼接", {
    mode, segmentCount: segments.length, groupCount: groups.length, ceiling: safeCeiling, targetChars,
  });
  const peopleContext = await buildPeopleContextForLlm(plugin);
  const sys = "你是一位专业的文字编辑助手，擅长把分段录音转写忠实整理为结构清晰的 Markdown 纪要。第一职责是还原，不得为精炼而漏掉信息。";
  const allPeople = [];
  const allTags = [];
  const partSummaries = [];
  const partBodies = [];
  let anyTruncated = false;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const joinedChunk = g.map((s, j) => formatMergeSegmentForPrompt(s, j)).join("\n\n");
    const start = formatElapsed(Number(g[0] && g[0].startOffsetMs) || 0);
    const end = formatElapsed(Number(g[g.length - 1] && g[g.length - 1].endOffsetMs) || 0);
    let up = buildChunkMergePrompt(joinedChunk, i + 1, groups.length, `${start}–${end}`);
    up = applyRepolishPreferenceInstruction(up, repolishOptions, plugin.settings);
    up = applyBriefingLanguageInstruction(up, plugin.settings);
    if (peopleContext) up = peopleContext + "\n\n---\n\n" + up;
    const { text, truncated } = await callBriefingMergeLlm(plugin, sys, up, { stream: true, payload: { max_tokens: safeCeiling } }, { mode, chunked: true, part: i + 1, partTotal: groups.length });
    if (truncated) anyTruncated = true;
    // 解析并剥掉本部分机器注释，避免散落进正文
    const pp = parsePeopleFromOutput(String(text || ""));
    const tt = parseSuggestedTagsFromOutput(pp.cleaned);
    let body = tt.cleaned;
    const sm = body.match(/<!--\s*lexvoice-part-summary\s*:\s*([\s\S]*?)\s*-->/i);
    if (sm) { partSummaries.push(sm[1].trim()); body = body.replace(sm[0], ""); }
    body = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim(); // 去模型偶发的 frontmatter
    body = stripModeSuggestionBlocks(body).trim();
    for (const p of (pp.people || [])) allPeople.push(p);
    for (const p of (tt.people || [])) allPeople.push(p);
    for (const t of (tt.tags || [])) allTags.push(t);
    partBodies.push(`## 第 ${i + 1} 部分 · ${start}–${end}\n\n${body || "_[本部分无可整理内容]_"}`);
  }
  // 顶部总览：拼各部分小结
  const overviewLines = partSummaries.length
    ? partSummaries.map((s, i) => `> ${i + 1}. ${s}`).join("\n")
    : `> 本纪要由超长录音按时间分 ${groups.length} 部分整理后拼接而成。`;
  const overview = `> [!abstract] 全程概览（按时间分 ${groups.length} 部分整理）\n${overviewLines}`;
  const bodyMd = overview + "\n\n" + partBodies.join("\n\n");
  // 聚合人物/标签去重，作为机器注释附末尾交给 postProcess 装配 frontmatter
  const people = mergeUniqueStrings([], allPeople);
  const tags = mergeUniqueStrings([], allTags).filter(t => t && !/^lexvoice\//.test(t)).slice(0, 9);
  const machine = `\n\n<!-- lexvoice-people: ${people.join(", ")} -->\n<!-- lexvoice-tags: ${tags.join(", ")} -->`;
  const fullJoined = segments.map((s, i) => formatMergeSegmentForPrompt(s, i)).join("\n\n");
  const audited = appendEntityEvidenceWarning(bodyMd + machine, fullJoined);
  const chunkedNotice = `> [!info] 超长会议 · 已分段整理\n> 本次录音较长，已按时间自动分成 ${groups.length} 部分分别整理后拼接，确保不因单次输出长度上限而丢失后半段内容。`;
  const topNotice = anyTruncated ? chunkedNotice + "\n\n" + BRIEFING_TRUNCATION_WARNING : chunkedNotice;
  return postProcessBriefingOutput(audited, mode, computedMeta, originalFrontmatter, frontmatterBaseModeKey(plugin, mode), topNotice);
}

async function mergeAndPolish(plugin, segments, mode, recruitContext, sessionMeta, originalFrontmatter, repolishOptions) {
  if (!segments || segments.length === 0) return "";
  if (mode === "off") return segments.map(s => s.text).join("\n\n");
  const segmentsForMerge = await maybePreSummarizeTextImportForMerge(plugin, segments, mode, recruitContext, sessionMeta);
  // 引用不同 = 触发了超长文本预压缩（原文被分段摘要替换）。最终纪要顶部要据此告知用户"基于摘要稿"。
  const preSummarized = segmentsForMerge !== segments;
  segments = segmentsForMerge;
  const joined = segments.map((s, i) => formatMergeSegmentForPrompt(s, i)).join("\n\n");
  let computedMeta = sessionMeta || null;
  if (!computedMeta && segments.length > 0) {
    // 兜底：mergeAndPolish 没传 sessionMeta 时，从 segments 推 duration（startedAt 仍需调用方传）
    const last = segments[segments.length - 1];
    computedMeta = { duration: formatElapsed(last.endOffsetMs || 0) };
  }
  // F4.2：把招聘上下文透传进 meta，供 postProcessBriefingOutput 代码注入 jd/候选人/轮次/素质 frontmatter。
  if (mode === "recruit" && recruitContext) {
    computedMeta = Object.assign({}, computedMeta || {}, { recruitContext });
  }
  // 招聘需求挖掘：会后产出结构化岗位画像（JobPortrait），走专用路径而非通用 Markdown 纪要。
  if (mode === "recruit-needs") {
    const { md: portraitMd, truncated } = await generateJobPortrait(plugin, joined, computedMeta, segments);
    const auditedPortrait = appendEntityEvidenceWarning(portraitMd, joined);
    // 过一遍 frontmatter 装配，让画像与其余模式结构一致（mode/time/状态/tags/人物 注入）。
    // 画像首行是 callout 非 ---，postProcess 匹配不到 frontmatter → 整体当正文、前面拼 YAML。
    return postProcessBriefingOutput(auditedPortrait, mode, computedMeta, originalFrontmatter, frontmatterBaseModeKey(plugin, mode), truncated ? BRIEFING_TRUNCATION_WARNING : "");
  }
  const isRecruitTextImport = mode === "recruit" && computedMeta && computedMeta.source === "text-import";
  // 自适应 max_tokens：让长会真正能产出更长纪要，而不是被 API 默认上限（~4096）一刀切。
  const briefingMergeMaxTokens = getBriefingMergeMaxTokens({
    durationMs: getSegmentsDurationMs(segments) || getSessionMetaDurationMs(computedMeta),
    transcriptChars: joined.length,
    segmentCount: segments.length,
  }, plugin.settings);
  // 超长会议工程兜底：当「内容期望输出」明显超过「模型安全上限」（单次必然截断）时，按时间分段整理再拼接，
  // 而不是把 max_tokens 抬过模型上限被拒。仅普通纪要模式触发；招聘评估是整体研判、文本导入已预压缩，不分段。
  const mergeCeiling = getLlmOutputCeiling(plugin.settings);
  const mergeDesired = getBriefingMergeDesiredTokens({
    durationMs: getSegmentsDurationMs(segments) || getSessionMetaDurationMs(computedMeta),
    transcriptChars: joined.length,
    segmentCount: segments.length,
  });
  if (mode !== "recruit" && !isRecruitTextImport && !preSummarized && segments.length >= 2 && mergeDesired >= mergeCeiling * 1.5) {
    try {
      const chunked = await mergeAndPolishLongSession(plugin, segments, mode, computedMeta, originalFrontmatter, repolishOptions, mergeCeiling);
      if (chunked != null) return chunked;
    } catch (e) {
      // 分段整理失败 → 退回单次整理（截断告警仍兜底），不让超长会议彻底无输出
      await logLlmRequestDiagnostic(plugin, "warn", "llm.merge_long_session_fallback", "分段整理失败，退回单次整理", { mode, error: diagnosticError(e) });
    }
  }
  const tpl = resolveTemplatePromptForMode(plugin, mode, true);
  const sys = mode === "recruit"
    ? "你是严格的招聘评估官，正在合并分段转写并产出最终面试评价。立场是替面试官筛掉不达标候选人，不替候选人辩护。默认假设候选人不达标，需要正向证据才加分。诚实/不夸大/承认边界是基础职业素养，不计入亮点。结果未闭环、独立主导不清、行业不匹配、关键能力仅'接触过'——必须列入红旗。"
    : "你是一位专业的文字编辑助手，擅长把分段录音转写合并为连续、干净、忠实原意、结构清晰的 Markdown 文档。";
  let userPrompt;
  if (isRecruitTextImport) {
    userPrompt = buildRecruitTextImportMergePrompt(joined, recruitContext);
    userPrompt = applyBriefingLanguageInstruction(userPrompt, plugin.settings);
    await logLlmRequestDiagnostic(plugin, "info", "llm.merge_recruit_text_import_compact_prompt", "招聘文本导入使用精简评估提示词", {
      mode,
      source: computedMeta.source,
      segmentCount: segments.length,
      transcriptChars: joined.length,
      recruitContextChars: buildCompactRecruitContextPrefix(recruitContext).length,
      promptChars: userPrompt.length,
    });
  } else {
    userPrompt = applyStructureLevelInstruction(tpl, plugin.settings, repolishOptions && repolishOptions.structureLevel).replace("{{TRANSCRIPT}}", joined);
    userPrompt = applyRepolishPreferenceInstruction(userPrompt, repolishOptions, plugin.settings);
    userPrompt = applyBriefingLanguageInstruction(userPrompt, plugin.settings);
    userPrompt = userPrompt.replace("{{STRUCTURE_INSTRUCTION}}", "");
    const adaptiveLength = buildAdaptiveBriefingLengthInstruction(mode, {
      durationMs: sessionMeta && sessionMeta.source === "text-import"
        ? getSessionMetaDurationMs(sessionMeta)
        : (getSegmentsDurationMs(segments) || getSessionMetaDurationMs(sessionMeta)),
      transcriptChars: joined.length,
      segmentCount: segments.length,
    });
    if (adaptiveLength) userPrompt = adaptiveLength + "\n\n---\n\n" + userPrompt;
  }
  const metaPrefix = buildSessionMetaPrefix(computedMeta, mode);
  if (metaPrefix) userPrompt = metaPrefix + "\n\n---\n\n" + userPrompt;
  const meetingWorkbenchPrompt = buildMeetingWorkbenchPrompt(computedMeta && computedMeta.meetingWorkbench);
  if (meetingWorkbenchPrompt) userPrompt = meetingWorkbenchPrompt + "\n\n---\n\n" + userPrompt;
  if (!isRecruitTextImport) {
    const peopleContext = await buildPeopleContextForLlm(plugin);
    if (peopleContext) userPrompt = peopleContext + "\n\n---\n\n" + userPrompt;
  }
  if (mode === "recruit" && recruitContext && !isRecruitTextImport) {
    const recruitPrefix = buildRecruitContextPrefix(recruitContext);
    const compactRecruitContext = computedMeta
      && computedMeta.source === "text-import"
      && recruitPrefix.length + userPrompt.length > TEXT_IMPORT_FINAL_CONTEXT_COMPACT_THRESHOLD_CHARS;
    if (compactRecruitContext) {
      await logLlmRequestDiagnostic(plugin, "warn", "llm.merge_recruit_context_compacted", "招聘文本导入上下文过长，已压缩注入", {
        mode,
        source: computedMeta.source,
        recruitContextChars: recruitPrefix.length,
        promptCharsBeforeContext: userPrompt.length,
        compactChars: TEXT_IMPORT_RECRUIT_CONTEXT_CHARS,
      });
    }
    userPrompt = (compactRecruitContext
      ? truncateForLlmPrompt(recruitPrefix, TEXT_IMPORT_RECRUIT_CONTEXT_CHARS)
      : recruitPrefix) + "\n\n" + userPrompt;
  }
  userPrompt = appendSedimentPreExtractionInstruction(userPrompt);
  // 流式：merge 是最长、最贵、跑一次的调用。流式 + 空闲超时确保服务端只要在持续输出就不会被
  // 客户端总超时 abort，避免"扣了钱却因超时拿不到结果"的浪费（符合总纲：不因工程缺陷浪费）。
  const { text: raw, truncated } = await callBriefingMergeLlm(plugin, sys, userPrompt, { stream: true, payload: { max_tokens: briefingMergeMaxTokens } }, { mode, segmentCount: segments.length, transcriptChars: joined.length });
  const sedimentPreExtraction = extractSedimentPreExtractionBlock(raw);
  const auditedOutput = appendEntityEvidenceWarning(sedimentPreExtraction.cleaned, joined);
  // 截断告警 + 文本导入预压缩告警合并成顶部 notice（都属"纪要可能不完整/有损"，一起提示）。
  const topNotices = [];
  if (truncated) topNotices.push(BRIEFING_TRUNCATION_WARNING);
  if (preSummarized) topNotices.push(BRIEFING_PRESUMMARY_NOTICE);
  const polished = postProcessBriefingOutput(auditedOutput, mode, computedMeta, originalFrontmatter, frontmatterBaseModeKey(plugin, mode), topNotices.join("\n\n"));
  return sedimentPreExtraction.objects ? appendSedimentPreExtractionBlock(polished, sedimentPreExtraction.objects) : polished;
}

async function generateTitleTag(plugin, polished, mode) {
  const prefix = getModeMeta(plugin.settings, mode).prefix;
  const snippet = (polished || "").slice(0, 2500);
  if (!snippet.trim()) return "";
  const sys = "你是文件命名助手，擅长从中文内容中提取简洁的主题标签。";
  const user = `下面是一段 ${prefix} 记录。请提取一个 ≤15 个字的主题标签。

【要求】
- 只输出标签本身，不加引号、标点、前缀、解释、emoji。
- 优先"具体对象-核心议题"格式，如"合同审查-供应商独家条款"、"周例会-Q2规划"。
- 避免宽泛词如"讨论"、"记录"、"聊天"。
- 使用中文。

【内容】
  ${snippet}`;
  try {
    const title = await callLlm(plugin, sys, user, { timeoutMs: 30 * 1000 });
    return sanitizeFilename(title);
  } catch (e) {
    console.error("[LexVoice] generateTitleTag failed", e);
    return "";
  }
}

function buildTitleSourceFromSegments(segments) {
  return (segments || [])
    .filter((s) => s && s.text && String(s.text).trim())
    .map((s, i) => {
      const n = Number.isFinite(s.index) ? s.index + 1 : i + 1;
      const start = formatElapsed(s.startOffsetMs || 0);
      const end = formatElapsed(s.endOffsetMs || 0);
      return `段落 ${n}（${start}-${end}）：${String(s.text || "").trim()}`;
    })
    .join("\n\n")
    .slice(0, 3000);
}

class TaskQueue {
  declare plugin: LexVoicePlugin;
  constructor(plugin) {
    this.plugin = plugin;
    this.tasks = [];
    this.running = false;
  }
  load(saved) {
    const raw = Array.isArray(saved) ? saved.slice() : [];
    this.tasks = raw
      .filter(t => t && typeof t === "object" && t.type)
      .map(t => {
        const task = Object.assign({}, t);
        task.id = task.id || genId();
        task.retries = Math.max(0, Number(task.retries) || 0);
        task.createdAt = task.createdAt || new Date().toISOString();
        task.updatedAt = task.updatedAt || task.createdAt;
        if (task.status === "running") {
          task.status = "pending";
          task.lastError = task.lastError || "上次运行中断，已恢复为待处理";
        }
        if (!["pending", "failed", "missing", "processing", "blocked"].includes(task.status)) task.status = "pending";
        const maxRetries = (this.plugin && this.plugin.settings && this.plugin.settings.maxRetries) || 3;
        if (task.type === "transcribe"
          && task.status === "failed"
          && task.retries >= maxRetries
          && /音频不存在/.test(String(task.lastError || ""))) {
          task.status = "pending";
          task.retries = Math.max(0, maxRetries - 1);
          task.lastError = "临时切片缺失，已升级为从完整录音恢复切片后重试";
        }
        if (task.type === "merge"
          && task.status === "failed"
          && isLlmNonRetryableError(task.lastError || "")) {
          task.status = "blocked";
          task.lastError = task.lastError || "大模型不可用，等待用户处理后再重试";
        }
        if (task.type === "merge"
          && task.status === "failed"
          && task.retries >= maxRetries
          && !isLlmNonRetryableError(task.lastError || "")
          && /Failed to fetch|LLM 调用超时|429|500|502|503|504/.test(String(task.lastError || ""))) {
          task.status = "pending";
          task.retries = Math.max(0, maxRetries - 1);
          task.lastError = "上次整理疑似网络或服务端瞬时失败，已升级为可重试";
        }
        return task;
      });
  }
  snapshot() { return this.tasks.slice(); }
  findActiveGeneratePromptTask(mode) {
    return this.tasks.find(t =>
      t &&
      t.type === "generate-prompt" &&
      t.mode === mode &&
      t.status !== "failed" &&
      t.status !== "missing"
    );
  }
  findDuplicateTask(task) {
    if (!task || !task.type) return null;
    const samePath = (a, b) => obsidian.normalizePath(String(a || "")) === obsidian.normalizePath(String(b || ""));
    if (task.type === "transcribe") {
      return this.tasks.find(t => t && t.type === "transcribe"
        && samePath(t.mdPath, task.mdPath)
        && samePath(t.audioPath, task.audioPath)
        && Number(t.segmentIndex) === Number(task.segmentIndex));
    }
    if (task.type === "merge") {
      return this.tasks.find(t => t && t.type === "merge"
        && samePath(t.mdPath, task.mdPath)
        && String(t.sessionId || "") === String(task.sessionId || ""));
    }
    if (task.type === "generate-prompt") return this.findActiveGeneratePromptTask(task.mode);
    return null;
  }
  async add(task) {
    const existing = this.findDuplicateTask(task);
    if (existing) {
      Object.assign(existing, task, {
        id: existing.id,
        createdAt: existing.createdAt || task.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retries: Math.max(0, Number(existing.retries) || 0),
        status: task.status || existing.status || "pending",
      });
      await this.plugin.saveAll();
      try { this.plugin.refreshOutlineView(); } catch { /* intentionally empty */ }
      return existing;
    }
    task.id = task.id || genId();
    task.createdAt = task.createdAt || new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    task.retries = task.retries || 0;
    task.status = task.status || "pending";
    this.tasks.push(task);
    await this.plugin.saveAll();
    try { this.plugin.refreshOutlineView(); } catch { /* intentionally empty */ }
    return task;
  }
  async remove(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    await this.plugin.saveAll();
    try { this.plugin.refreshOutlineView(); } catch { /* intentionally empty */ }
  }
  async update(id, patch) {
    const t = this.tasks.find(x => x.id === id);
    if (!t) return;
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    await this.plugin.saveAll();
    try { this.plugin.refreshOutlineView(); } catch { /* intentionally empty */ }
  }
  async processAll() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = this.tasks.filter(t => t.status !== "running" && t.status !== "missing" && t.status !== "blocked" && t.retries < (this.plugin.settings.maxRetries || 3));
      // 批量进度游标：喂状态栏指示器，让"重试全部 / 多任务"跑到哪一目了然。
      this._batchTotal = pending.length;
      this._batchDone = 0;
      try { this.plugin.updateBusyStatus(); } catch { /* intentionally empty */ }
      for (const t of pending) {
        await this.processOne(t).catch((e) => console.error("[LexVoice] queue task failed", e));
        this._batchDone++;
        try { this.plugin.updateBusyStatus(); } catch { /* intentionally empty */ }
      }
    } finally {
      this.running = false;
      this._batchTotal = 0;
      this._batchDone = 0;
      try { this.plugin.updateBusyStatus(); } catch { /* intentionally empty */ }
    }
  }
  async processOne(task) {
    if (!task || !task.id) return;
    // per-task 在途锁：processAll / 手动逐篇重试 / 队列面板逐条重试 / 启动自动重试 多条入口可能选中同一任务，
    // 若并发进入会对同一段音频发两次 ASR = 重复扣费。这个内存级 Set 同步闭合"选中→标 running"的竞态窗口。
    if (!this._inflight) this._inflight = new Set();
    if (this._inflight.has(task.id)) return;
    this._inflight.add(task.id);
    const startedAt = Date.now(); // 记录任务开始时间，完成时算出处理时长（转写重试/合并重试/提示词生成等队列任务也能记时长）
    try {
    await this.update(task.id, { status: "running", lastError: "" });
    try {
      if (task.type === "transcribe") await this.plugin.retryTranscribeTask(task);
      else if (task.type === "merge") await this.plugin.retryMergeTask(task);
      else if (task.type === "generate-prompt") await this.plugin.runGeneratePromptTask(task);
      else throw new Error(`未知任务类型：${task.type}`);
      await this.remove(task.id);
      try {
        const doneLabel = task.type === "transcribe" ? `转写完成 · 段${(task.segmentIndex || 0) + 1}`
          : task.type === "merge" ? "AI 整理完成"
          : task.type === "generate-prompt" ? "提示词生成完成" : "任务完成";
        const durationMs = Math.max(0, Date.now() - startedAt);
        this.plugin.logCompletedWork(doneLabel, task.mdPath || "", durationMs > 0 ? { durationMs } : null);
      } catch { /* intentionally empty */ }
    } catch (e) {
      const message = (e && e.message) || String(e);
      const isMissingAudio = task.type === "transcribe" && /音频不存在|临时切片不存在/.test(message);
      const isBlockedMerge = task.type === "merge" && isLlmNonRetryableError(e);
      // 确定性转写错误（格式/解码/超限/4xx）：直接吃满重试，避免必败任务空转（如对 80MB 文件反复解码）。
      const isPermanentAsr = task.type === "transcribe" && !isMissingAudio && isAsrNonRetryableError(e);
      const maxR = (this.plugin.settings && this.plugin.settings.maxRetries) || 3;
      const nextRetries = isBlockedMerge ? (task.retries || 0)
        : isPermanentAsr ? Math.max((task.retries || 0) + 1, maxR)
        : (task.retries || 0) + 1;
      await this.update(task.id, {
        status: isMissingAudio ? "missing" : isBlockedMerge ? "blocked" : "failed",
        retries: nextRetries,
        lastError: message,
      });
      await this.plugin.logDiagnostic("error", "queue.task_failed", "队列任务失败", {
        taskType: task.type,
        retries: nextRetries,
        maxRetries: this.plugin.settings.maxRetries || 3,
        mdPath: task.mdPath || "",
        audioPath: task.audioPath || "",
        mode: task.mode || "",
        error: diagnosticError(e),
      });
      throw e;
    }
    } finally {
      this._inflight.delete(task.id);
    }
  }
  hasPendingGeneratePrompt() {
    return this.tasks.some(t => t && t.type === "generate-prompt" && t.status !== "failed");
  }
}

const VIEW_TYPE_OUTLINE = "lexvoice-outline-view";

class OutlineView extends obsidian.ItemView {
  declare plugin: LexVoicePlugin;
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.aiOutline = "";
    this.outlineRunning = false;
    this.lastOutlineSegmentCount = 0;
    this.lastOutlineWorkbenchSignature = "";
    this.outlineSessionId = "";
    this.outlineRunSeq = 0;
    this._renderRaf = 0;
    this._lastSig = "";
    this._lastRenderedOutline = "";
    this.showRecentHome = true;
    this.idlePanelTab = "";
    this.recentFilters = { time: "week", mode: "all" };
    this.sedimentGroup = "person";
    this.sedimentSwitcherOpen = false;
    this.sedimentExpandedGroups = new Set(); // 哪些候选分组已"展开全部"（默认只显示前 8 条）
    this.sedimentCandidatesByPath = {};
    this.notePanelCacheKey = "";
    this.notePanelCacheData = undefined;
    this.notePanelLoading = false;
    this.inlineAudioEl = null;
    this.inlineAudioFile = null;
    this.inlineOutlineBody = null;
    this.outlineViewingMs = null;
    this.lastLiveOutlineFocusKey = "";
    this._outlineFollowRaf = 0;
    this.sedimentToastTimer = 0;
    this.sedimentAdvanceTimer = 0;
    this.sedimentScanToken = 0;
    this.sedimentLastUndo = null;
  }
  getViewType() { return VIEW_TYPE_OUTLINE; }
  getDisplayText() { return "LexVoice 实时纪要"; }
  getIcon() { return "list-tree"; }
  async onOpen() {
    this.containerEl.children[1].empty();
    this._lastSig = "";
    this.render();
    // 节流：recorder 每 500ms 滴答一次。只更新计时文本，结构不变时不重建 DOM。
    this.unsubscribeRecorder = this.plugin.recorder.on(() => this.scheduleUpdate());
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.showRecentHome = true;
      this.idlePanelTab = "";
      this.scheduleUpdate();
    }));
    // 文件改名/删除（无论从面板内还是 Obsidian 文件管理器触发）→ 让最近纪要面板跟着刷新：
    // 改名后名字同步、删除后从列表消失。computeSignature 不含最近笔记文件名，必须清掉
    // _lastSig 才会真重渲染（否则签名没变只会 updateLiveStats，看起来"没反应"）。
    // 不监听 create：Obsidian 启动时会对所有文件补发 create，易造成风暴；新建纪要本就经
    // recorder/finalize 触发刷新。
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof obsidian.TFile && (this.isRecentNotePath(file.path) || this.isRecentNotePath(oldPath))) {
        this.forceRecentRender();
      }
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file && file.path && this.isRecentNotePath(file.path)) {
        this.forceRecentRender();
      }
    }));
    if ((this.plugin.settings.enableRealtimeOutline
          || (this.plugin.session && this.plugin.session.mode === "recruit-needs"))
        && this.plugin.session
        && this.plugin.session.segments.length > 0
        && !this.aiOutline) {
      window.setTimeout(() => { void this.refreshAIOutline({ silent: true }); }, 400);
    }
  }
  async onClose() {
    if (this.unsubscribeRecorder) { this.unsubscribeRecorder(); this.unsubscribeRecorder = null; }
    if (this._renderRaf) { cancelAnimationFrame(this._renderRaf); this._renderRaf = 0; }
    if (this._outlineFollowRaf) { cancelAnimationFrame(this._outlineFollowRaf); this._outlineFollowRaf = 0; }
    if (this.sedimentToastTimer) { window.clearTimeout(this.sedimentToastTimer); this.sedimentToastTimer = 0; }
    if (this.sedimentAdvanceTimer) { window.clearTimeout(this.sedimentAdvanceTimer); this.sedimentAdvanceTimer = 0; }
  }
  syncSessionOutline(session) {
    const id = session && session.id ? session.id : "";
    const previousId = this.outlineSessionId || "";
    if (id === previousId) return;
    this.outlineSessionId = id;
    if (id) {
      this.showRecentHome = false;
      this.idlePanelTab = "outline";
    } else if (previousId) {
      this.showRecentHome = false;
      this.idlePanelTab = "outline";
    }
    this.aiOutline = session && session.realtimeOutline ? session.realtimeOutline : "";
    this.lastOutlineSegmentCount = session && session.realtimeOutlineSegmentCount ? session.realtimeOutlineSegmentCount : 0;
    this.lastOutlineWorkbenchSignature = session && session.realtimeOutlineWorkbenchSignature ? session.realtimeOutlineWorkbenchSignature : "";
    this.outlineQueued = false;
  }
  // 通过 rAF 合并连续 emit；如签名（结构性状态）未变只做轻量更新，否则全量 render
  scheduleUpdate() {
    if (this._renderRaf) return;
    this._renderRaf = window.requestAnimationFrame(() => {
      this._renderRaf = 0;
      const sig = this.computeSignature();
      if (sig === this._lastSig) {
        this.updateLiveStats();
      } else {
        this._lastSig = sig;
        this.render();
      }
    });
  }
  computeSignature() {
    const session = this.plugin.session;
    const recState = this.plugin.recorder.state;
    const segs = session ? session.segments : [];
    let segDone = 0, segErr = 0;
    for (const s of segs) { if (s.error) segErr++; else if (s.text) segDone++; }
    const queueN = this.plugin.queue ? this.plugin.queue.tasks.length : 0;
    const mode = session ? session.mode : getEffectivePolishMode(this.plugin.settings, this.plugin.settings.polishMode);
    const captureMode = this.plugin.settings.captureMode || "mic";
    const activeNote = !session ? this.getActiveLexVoiceNoteFile() : null;
    const recentFilters = this.getRecentFilters ? this.getRecentFilters() : (this.recentFilters || {});
    const recentFilterSig = [recentFilters.time, recentFilters.mode].join(":");
    const sedimentSig = this.getSedimentCandidateSignature ? this.getSedimentCandidateSignature() : "";
    // 招聘上下文卡片的"已填" vs "未填"也要进 signature——填完 JD 后卡片要重渲染
    const ctx = this.plugin.settings.recruitContext || {};
    const ctxFilled = (ctx.jd && ctx.jd.trim()) ? 1 : 0;
    const workbench = session ? normalizeMeetingWorkbench(session.meetingWorkbench) : null;
    const workbenchSig = workbench
      ? [
          workbench.entries.length,
          workbench.entries.map(item => `${item.id}:${item.source || ""}:${item.atMs || 0}:${item.text.length}:${(item.materials || []).map(m => m.path).join(",")}`).join(";"),
          workbench.materials.length,
          workbench.materials.map(item => item.path).join(","),
        ].join(":")
      : "";
    return [
      session ? session.id : "idle",
      recState,
      session && session.finalizing ? 1 : 0,
      segs.length, segDone, segErr,
      // length + FNV hash 双保险：length 抓快速差异、hash 抓"等长但内容变了"(改写/锚点时间变/A↔B换位/
      // 子要点措辞替换)——否则后台生成改了大纲但长度没变时 scheduleUpdate 不重建 DOM，用户看到旧大纲。
      this.aiOutline ? `${this.aiOutline.length}:${hashRealtimeOutlineText(this.aiOutline)}` : 0,
      // recruit-needs 的大纲不进 aiOutline，coverage 变化要单独进签名才会触发重渲染；
      // 追问卡反馈（已问/忽略，session 级）也进签名，否则点按钮后卡片不消失。
      session && session.mode === "recruit-needs" && session.jobPortraitCoverage
        ? `${session.jobPortraitCoverage.covered}:${session.jobPortraitCoverage.updatedAt}:${Object.keys((session && session.followupFeedback) || {}).sort().join(",")}` : "",
      this.outlineRunning ? 1 : 0,
      queueN,
      mode,            // ← 模式切换会触发重渲染（招聘上下文卡片显隐）
      captureMode,     // ← 音频输入方式切换会触发设备状态条重渲染
      ctxFilled,       // ← JD 填写状态变化触发卡片状态更新
      workbenchSig,
      session && session.workProgress ? `${session.workProgress.stage || ""}:${session.workProgress.label || ""}:${session.workProgress.percent ?? ""}` : "",
      this.idlePanelTab || (this.showRecentHome ? "recent" : "outline"),
      recentFilterSig,
      sedimentSig,
      this.sedimentGroup || "person",
      this.sedimentSwitcherOpen ? 1 : 0,
      activeNote ? activeNote.path : "",
      activeNote ? activeNote.stat.mtime : 0,
    ].join("|");
  }
  // 仅刷新计时和"x 段"等高频文本，避免重建按钮和重绘 Markdown
  updateLiveStats() {
    const root = this.containerEl.children[1];
    if (!root) return;
    const session = this.plugin.session;
    const info = this.plugin.recorder.getInfo();
    const metaEl = root.querySelector(".lexvoice-outline-meta");
    if (metaEl && session) {
      const stamp = window.moment(session.startedAt).format("YYYY-MM-DD HH:mm:ss");
      metaEl.setText(`${stamp} · ${formatElapsed(info.elapsed)} · ${session.segments.length} 段`);
    }
    this.updateInputMeter(root, info);
  }
  render() {
    const root = this.containerEl.children[1];
    if (!root) return;
    root.empty();
    root.addClass("lexvoice-outline");
    root.toggleClass("is-mobile", isLexVoiceMobileRuntime());
    root.removeClass("has-meeting-composer");
    this._lastRenderedOutline = "";

    const session = this.plugin.session;
    const recInfo = this.plugin.recorder.getInfo();
    const recordingIssue = this.getRecordingIssue(recInfo);
    if (recordingIssue && recordingIssue.kind) {
      root.addClass("has-recording-issue");
      root.addClass(`has-recording-issue-${recordingIssue.kind}`);
    }
    this.syncSessionOutline(session);

    if (session) {
      const sessionNote = this.getSessionNoteFile(session);
      const activeTab = this.idlePanelTab || "outline";
      const showMeetingComposer = activeTab === "outline" && recInfo && (recInfo.state === "recording" || recInfo.state === "paused");
      if (showMeetingComposer) root.addClass("has-meeting-composer");
      this.renderActiveHead(root, session, recInfo, recordingIssue);
      this.renderIdleTabs(root, activeTab);
      if (activeTab === "recent") {
        this.renderRecent(root);
      } else if (activeTab === "extract") {
        if (sessionNote) this.renderExtractionPanel(root, sessionNote);
        else this.renderPanelEmpty(root, "当前录音笔记尚未生成，录音开始写入纪要后可进行沉淀。");
      } else {
        this.renderAIOutline(root, session, recInfo, recordingIssue);
      }
      if (recordingIssue && recordingIssue.kind === "microphone") {
        this.renderMicrophoneBlockedOverlay(root, recordingIssue, recInfo);
      }
    } else {
      this.renderIdleHead(root);
      const activeNote = this.getActiveLexVoiceNoteFile();
      const activeTab = this.idlePanelTab || "outline";
      this.renderIdleTabs(root, activeTab);
      if (activeTab === "outline") {
        if (activeNote) this.renderCompletedNote(root, activeNote);
        else this.renderNoOpenNoteEmpty(root, "outline");
      } else if (activeTab === "extract") {
        if (activeNote) this.renderExtractionPanel(root, activeNote);
        else this.renderNoOpenNoteEmpty(root, "extract");
      } else {
        this.renderRecent(root);
      }
    }
    if (session) {
      const activeTab = this.idlePanelTab || "outline";
      const showMeetingComposer = activeTab === "outline" && recInfo && (recInfo.state === "recording" || recInfo.state === "paused");
      if (showMeetingComposer) this.renderMeetingComposer(root, session);
    }
    this._lastSig = this.computeSignature();
  }

  getSessionNoteFile(session) {
    const path = session && session.mdPath ? obsidian.normalizePath(session.mdPath) : "";
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof obsidian.TFile && file.extension === "md" ? file : null;
  }

  getActiveLexVoiceNoteFile() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return null;
    const mdFolder = obsidian.normalizePath(this.plugin.settings.mdFolder || DEFAULT_SETTINGS.mdFolder);
    const path = obsidian.normalizePath(file.path);
    if (path === mdFolder || path.startsWith(mdFolder + "/")) return file;
    const mode = this.plugin.detectModeFromMarkdown(file);
    return mode ? file : null;
  }

  getCompletedNotePanelData(file) {
    const key = `${file.path}|${file.stat.mtime}`;
    if (this.notePanelCacheKey === key && !this.notePanelLoading) return this.notePanelCacheData || null;
    if (this.notePanelCacheKey === key && this.notePanelLoading) return undefined;

    this.notePanelCacheKey = key;
    this.notePanelCacheData = undefined;
    this.notePanelLoading = true;
    this.app.vault.cachedRead(file)
      .then((content) => {
        if (this.notePanelCacheKey !== key) return;
        this.notePanelCacheData = extractLexVoiceNotePanelData(file, content);
      })
      .catch((e) => {
        console.error("[LexVoice] read completed note outline failed", e);
        if (this.notePanelCacheKey === key) this.notePanelCacheData = null;
      })
      .finally(() => {
        if (this.notePanelCacheKey === key) {
          this.notePanelLoading = false;
          this.render();
        }
      });
    return undefined;
  }

  renderIdleTabs(root, activeTab) {
    const tabs = root.createDiv({ cls: "lexvoice-outline-panel-tabs" });
    const outlineBtn = tabs.createEl("button", {
      text: "大纲",
      cls: activeTab === "outline" ? "is-active" : "",
      attr: { type: "button" },
    });
    outlineBtn.onclick = () => {
      this.showRecentHome = false;
      this.idlePanelTab = "outline";
      this.render();
    };
    const extractBtn = tabs.createEl("button", {
      text: "沉淀",
      cls: activeTab === "extract" ? "is-active" : "",
      attr: { type: "button" },
    });
    extractBtn.onclick = () => {
      this.showRecentHome = false;
      this.idlePanelTab = "extract";
      this.render();
    };
    const recentBtn = tabs.createEl("button", {
      text: "纪要",
      cls: activeTab === "recent" ? "is-active" : "",
      attr: { type: "button" },
    });
    recentBtn.onclick = () => {
      this.showRecentHome = true;
      this.idlePanelTab = "recent";
      this.render();
    };
  }

  renderPanelEmpty(root, text) {
    const sec = root.createDiv({ cls: "lexvoice-outline-section lexvoice-outline-panel-empty" });
    sec.createDiv({ cls: "lexvoice-outline-empty", text });
  }

  renderNoOpenNoteEmpty(root, kind = "outline") {
    const isExtract = kind === "extract";
    const sec = root.createDiv({ cls: "lexvoice-outline-section lexvoice-outline-panel-empty lexvoice-empty-state-section" });
    const box = sec.createDiv({ cls: "lexvoice-empty-state" });
    const iconWrap = box.createDiv({ cls: "lexvoice-empty-state-icon" });
    try { obsidian.setIcon(iconWrap, "file-text"); } catch { /* intentionally empty */ }
    box.createDiv({ cls: "lexvoice-empty-state-title", text: "还没有打开纪要" });
    const desc = box.createDiv({ cls: "lexvoice-empty-state-desc" });
    desc.createSpan({ text: "从纪要列表选一篇打开，" });
    desc.createEl("br");
    desc.createSpan({ text: isExtract ? "就能开始沉淀人、事、知、热词" : "就能查看大纲和回听时间轴" });
    const btn = box.createEl("button", {
      cls: "lexvoice-empty-state-action",
      attr: { type: "button" },
    });
    try { obsidian.setIcon(btn.createSpan({ cls: "lexvoice-empty-state-action-icon" }), "list"); } catch { /* intentionally empty */ }
    btn.createSpan({ text: "打开纪要列表" });
    btn.onclick = () => {
      this.showRecentHome = true;
      this.idlePanelTab = "recent";
      this.render();
    };
  }

  renderExtractionPanel(root, file) {
    const sec = root.createDiv({ cls: "lexvoice-outline-section lexvoice-outline-extract lexvoice-sediment" });
    const panelData = this.getCompletedNotePanelData(file);
    if (panelData && panelData.preExtractedSediment) this.hydrateSedimentCandidatesFromEmbedded(file, panelData.preExtractedSediment);
    const state = this.getSedimentPanelState(file);

    if (panelData === undefined) {
      sec.createDiv({ cls: "lexvoice-outline-empty", text: "读取沉淀数据…" });
      return;
    }

    if (state.scanning) {
      this.renderSedimentScanning(sec, file, state);
      return;
    }

    if (!state.hasPipelineStarted) {
      this.renderSedimentStart(sec, file, state);
      return;
    }

    const groupKey = this.getActiveSedimentGroup(state.groups);

    this.renderSedimentBaton(sec, state, groupKey, file);
    this.renderSedimentGroup(sec, file, state, groupKey);
  }

  hydrateSedimentCandidatesFromEmbedded(file, objects) {
    if (!(file instanceof obsidian.TFile) || !objects) return false;
    const current = this.getSedimentCandidateBucket(file);
    const hasExisting = !!(
      current.scannedAt
      || (current.people || []).length
      || (current.todos || []).length
      || (current.cards || []).length
      || countVocabularyGroups(current.hotwords)
    );
    if (hasExisting) return false;
    const path = obsidian.normalizePath(file.path || "");
    const normalized = withSedimentCandidateIds(objects, path, file.basename);
    this.setSedimentCandidateBucket(file, {
      people: normalized.people || [],
      todos: normalized.todos || [],
      cards: normalized.learningCards || [],
      hotwords: normalized.hotwords || createVocabularyGroups(),
      scannedAt: new Date(file.stat && file.stat.mtime ? file.stat.mtime : Date.now()).toISOString(),
      source: "pre-extracted",
      initialCounts: this.getSedimentInitialCountsFromObjects(normalized),
      doneGroups: [],
      selectedByGroup: {},
      decisionLogByGroup: {},
      transitionGroup: "",
    });
    return true;
  }

  getSedimentPanelState(file) {
    const currentPath = obsidian.normalizePath(file.path || "");
    const bucket = this.getSedimentCandidateBucket(file);
    const pendingRecords = normalizePeopleSuggestionCache(this.plugin.settings.peopleSuggestionCache).pending || [];
    const allPeople = pendingRecords.map(record => peopleSuggestionRecordToSuggestion(record)).filter(Boolean);
    const cachedPeople = allPeople.filter(item => obsidian.normalizePath(item.sourcePath || "") === currentPath);
    const currentPeople = this.mergeSedimentPeopleCandidates(currentPath, bucket.people || [], cachedPeople);
    // 应用用户在侧边栏手动改的人名（override 按原始 id，不改 id 本身）
    const nameOverrides = bucket.peopleNameOverrides || {};
    for (const p of currentPeople) {
      const pid = getSedimentPersonId(p.sourcePath || currentPath, p);
      if (pid && Object.prototype.hasOwnProperty.call(nameOverrides, pid)) p.name = nameOverrides[pid];
    }
    const otherPeopleCount = Math.max(0, allPeople.length - cachedPeople.length);
    const ignoredPeople = normalizePeopleSuggestionIgnores(this.plugin.settings.peopleSuggestionIgnores)
      .map(record => peopleSuggestionIgnoreRecordToSuggestion(record))
      .filter(Boolean)
      .filter(item => obsidian.normalizePath(item.sourcePath || "") === currentPath);
    const vocabScanned = isKnowledgeSourceAlreadyScanned(this.plugin.settings, "vocabulary", file);
    const peopleScanned = isKnowledgeSourceAlreadyScanned(this.plugin.settings, "people", file);
    const pendingCounts = {
      person: currentPeople.length,
      todo: (bucket.todos || []).length,
      card: (bucket.cards || []).length,
      hotword: this.countSedimentHotwordCandidates(bucket.hotwords),
    };
    const initialCounts = bucket.initialCounts && typeof bucket.initialCounts === "object" ? bucket.initialCounts : {};
    const doneGroups = new Set(Array.isArray(bucket.doneGroups) ? bucket.doneGroups : []);
    const hasCandidates = SEDIMENT_GROUP_ORDER.some(key => pendingCounts[key] > 0);
    const scanning = !!bucket.scanning;
    const hasPipelineStarted = !!(bucket.scannedAt || hasCandidates || peopleScanned || vocabScanned || ignoredPeople.length);
    const groups = SEDIMENT_GROUP_ORDER.map((key, index) => {
      const cfg = SEDIMENT_GROUP_CONFIG[key];
      const pending = pendingCounts[key] || 0;
      const oldDone = key === "person" ? peopleScanned : (key === "hotword" ? vocabScanned : false);
      const initial = Math.max(0, Number(initialCounts[key]) || 0);
      const hasDoneFlag = doneGroups.has(key) || oldDone;
      const emptyDone = !!bucket.scannedAt && !pending && !initial && !hasDoneFlag;
      const total = Math.max(pending, initial, (hasDoneFlag || emptyDone) ? 1 : 0);
      const done = total ? Math.max(0, Math.min(total, (hasDoneFlag || emptyDone) ? total : total - pending)) : 0;
      return {
        key,
        lead: cfg.lead,
        label: cfg.label,
        unit: cfg.unit,
        dest: cfg.dest,
        model: cfg.model,
        pending,
        total,
        done,
        emptyDone,
        status: total ? (done >= total ? "已处理" : "待加入") : "无候选",
        next: SEDIMENT_GROUP_ORDER[index + 1] || null,
      };
    });
    return { currentPeople, otherPeopleCount, ignoredPeople, vocabScanned, peopleScanned, groups, bucket, hasPipelineStarted, scanning };
  }

  getSedimentCandidateBucket(file) {
    const path = file instanceof obsidian.TFile ? obsidian.normalizePath(file.path || "") : "";
    const raw = path && this.sedimentCandidatesByPath ? this.sedimentCandidatesByPath[path] : null;
    return Object.assign({
      people: [],
      todos: [],
      cards: [],
      hotwords: createVocabularyGroups(),
      scannedAt: "",
      initialCounts: {},
      doneGroups: [],
      selectedByGroup: {},
      decisionLogByGroup: {},
      transitionGroup: "",
      scanning: false,
      scanStartedAt: "",
    }, raw || {});
  }

  setSedimentCandidateBucket(file, patch) {
    if (!(file instanceof obsidian.TFile)) return;
    const path = obsidian.normalizePath(file.path || "");
    if (!path) return;
    const current = this.getSedimentCandidateBucket(file);
    this.sedimentCandidatesByPath[path] = Object.assign({}, current, patch || {});
  }

  getSedimentInitialCountsFromObjects(objects) {
    const normalized = normalizeSedimentExtractionModel(objects);
    return {
      person: (normalized.people || []).length,
      todo: (normalized.todos || []).length,
      card: (normalized.learningCards || []).length,
      hotword: this.countSedimentHotwordCandidates(normalized.hotwords),
    };
  }

  markSedimentGroupDone(file, groupKey, fallbackTotal) {
    if (!(file instanceof obsidian.TFile) || !SEDIMENT_GROUP_CONFIG[groupKey]) return false;
    const bucket = this.getSedimentCandidateBucket(file);
    const initialCounts = Object.assign({}, bucket.initialCounts || {});
    const fallback = Math.max(0, Number(fallbackTotal) || 0);
    initialCounts[groupKey] = Math.max(Number(initialCounts[groupKey]) || 0, fallback, 1);
    const doneGroups = Array.from(new Set([...(Array.isArray(bucket.doneGroups) ? bucket.doneGroups : []), groupKey]));
    this.setSedimentCandidateBucket(file, { initialCounts, doneGroups, transitionGroup: groupKey });
    return true;
  }

  markSedimentGroupDoneIfEmpty(file, groupKey, fallbackTotal) {
    if (!(file instanceof obsidian.TFile) || !SEDIMENT_GROUP_CONFIG[groupKey]) return false;
    const state = this.getSedimentPanelState(file);
    const group = state.groups.find(item => item.key === groupKey);
    if (group && group.pending > 0) return false;
    return this.markSedimentGroupDone(file, groupKey, fallbackTotal);
  }

  getSedimentCandidateSignature() {
    const buckets = this.sedimentCandidatesByPath || {};
    return Object.keys(buckets).sort().map((path) => {
      const bucket = buckets[path] || {};
      return [
        path,
        bucket.scannedAt || "",
        (bucket.people || []).length,
        (bucket.todos || []).length,
        (bucket.cards || []).length,
        this.countSedimentHotwordCandidates(bucket.hotwords),
        JSON.stringify(bucket.initialCounts || {}),
        (bucket.doneGroups || []).join(","),
        bucket.transitionGroup || "",
        bucket.scanning ? 1 : 0,
        JSON.stringify(bucket.selectedByGroup || {}),
        JSON.stringify(bucket.decisionLogByGroup || {}),
      ].join(":");
    }).join(";");
  }

  mergeSedimentPeopleCandidates(currentPath, memoryPeople, cachedPeople) {
    const byKey = new Map();
    for (const item of (cachedPeople || [])) {
      const key = item && (item.cacheKey || item.key || getPeopleSuggestionCacheKey(item.sourcePath || currentPath, item));
      if (key) byKey.set(key, item);
    }
    for (const raw of (memoryPeople || [])) {
      const item = Object.assign({}, raw || {}, {
        sourcePath: raw && raw.sourcePath ? raw.sourcePath : currentPath,
      });
      const key = item.cacheKey || item.key || getPeopleSuggestionCacheKey(item.sourcePath || currentPath, item);
      if (key && !byKey.has(key)) byKey.set(key, item);
    }
    return Array.from(byKey.values());
  }

  countSedimentHotwordCandidates(groups) {
    let count = 0;
    const source = groups || {};
    for (const def of VOCABULARY_SECTIONS) count += Array.isArray(source[def.key]) ? source[def.key].length : 0;
    return count;
  }

  getSedimentHotwordItems(groups) {
    const items = [];
    const source = groups || {};
    for (const def of VOCABULARY_SECTIONS) {
      for (const term of (Array.isArray(source[def.key]) ? source[def.key] : [])) {
        items.push({ id: getSedimentHotwordId(def.key, term), title: term, sub: def.title, sectionKey: def.key, term });
      }
    }
    return items;
  }

  getSedimentGroupRawItems(state, groupKey) {
    const bucket = state && state.bucket || {};
    if (groupKey === "person") return state && state.currentPeople || [];
    if (groupKey === "todo") return bucket.todos || [];
    if (groupKey === "card") return bucket.cards || [];
    if (groupKey === "hotword") return this.getSedimentHotwordItems(bucket.hotwords);
    return [];
  }

  getSedimentDisplayItems(state, groupKey) {
    const iconName = groupKey === "todo" ? "check-square" : (groupKey === "card" ? "library" : (groupKey === "hotword" ? "badge-check" : "user-round"));
    if (groupKey === "todo") {
      return (this.getSedimentGroupRawItems(state, groupKey) || []).map(item => ({
        id: getSedimentTodoId(item),
        raw: item,
        iconName,
        title: item.task || item.title || "未命名待办",
        // sub 仅在没有详细字段渲染时作为兜底；owner/due 空时不污染显示
        sub: [item.owner, item.due].filter(Boolean).join(" · "),
        meta: "",
      }));
    }
    if (groupKey === "card") {
      return (this.getSedimentGroupRawItems(state, groupKey) || []).map(item => ({
        id: getSedimentCardId(item),
        raw: item,
        iconName,
        title: item.title || "未命名卡片",
        sub: item.type || "卡片",
        meta: item.summary || item.reusableLine || "",
      }));
    }
    if (groupKey === "hotword") {
      return (this.getSedimentGroupRawItems(state, groupKey) || []).map(item => Object.assign({}, item, {
        raw: item,
        iconName,
        meta: "",
      }));
    }
    return (this.getSedimentGroupRawItems(state, groupKey) || []).map(item => ({
      id: getSedimentPersonId(item.sourcePath || "", item),
      raw: item,
      iconName,
      title: item.name || "未命名人员",
      sub: item.role || "角色待补充",
      meta: item.org || item.organization || "组织待补充",
    }));
  }

  getSedimentSelectedIds(file, groupKey, items) {
    const bucket = this.getSedimentCandidateBucket(file);
    const selectedByGroup = Object.assign({}, bucket.selectedByGroup || {});
    const allIds = (items || []).map(item => item.id).filter(Boolean);
    const current = Array.isArray(selectedByGroup[groupKey]) ? selectedByGroup[groupKey].filter(id => allIds.includes(id)) : null;
    if (current) return new Set(current);
    if (SEDIMENT_GROUP_CONFIG[groupKey] && SEDIMENT_GROUP_CONFIG[groupKey].defaultAllSelected) {
      selectedByGroup[groupKey] = allIds;
      this.setSedimentCandidateBucket(file, { selectedByGroup });
      return new Set(allIds);
    }
    return new Set();
  }

  setSedimentSelectedIds(file, groupKey, ids) {
    const bucket = this.getSedimentCandidateBucket(file);
    const selectedByGroup = Object.assign({}, bucket.selectedByGroup || {});
    selectedByGroup[groupKey] = Array.from(new Set(ids || [])).filter(Boolean);
    this.setSedimentCandidateBucket(file, { selectedByGroup });
  }

  getSedimentGroupReview(file, groupKey) {
    const bucket = this.getSedimentCandidateBucket(file);
    const logs = bucket.decisionLogByGroup && typeof bucket.decisionLogByGroup === "object" ? bucket.decisionLogByGroup : {};
    return logs[groupKey] || null;
  }

  getActiveSedimentGroup(groups) {
    const keys = new Set((groups || []).map(group => group.key));
    let key = this.sedimentGroup || "person";
    if (!keys.has(key)) key = "person";
    const active = (groups || []).find(group => group.key === key);
    if (active && active.total > 0) {
      this.sedimentGroup = key;
      return key;
    }
    const firstPending = this.findSedimentNextPendingGroup(groups);
    if (firstPending) key = firstPending.key;
    else {
      const firstDone = (groups || []).find(group => group.total > 0);
      if (firstDone) key = firstDone.key;
    }
    if (!keys.has(key) && groups && groups.length) key = groups[0].key;
    this.sedimentGroup = key;
    return key;
  }

  setSedimentGroup(key) {
    this.sedimentGroup = key || "person";
    this.sedimentSwitcherOpen = false;
    this.showRecentHome = false;
    this.idlePanelTab = "extract";
    this.render();
  }

  getSedimentNodeState(group, currentKey) {
    if (!group || !group.total) return "empty";
    if (group.done >= group.total) return "done";
    if (group.key === currentKey) return "current";
    return "pending";
  }

  findSedimentNextPendingGroup(groups, afterKey = "") {
    const list = (groups || []).filter(Boolean);
    if (!list.length) return null;
    const start = afterKey ? Math.max(0, list.findIndex(group => group.key === afterKey) + 1) : 0;
    const ordered = list.slice(start).concat(list.slice(0, start));
    return ordered.find(group => group.total > 0 && group.done < group.total) || null;
  }

  scheduleSedimentAutoAdvance(file, completedKey) {
    if (!(file instanceof obsidian.TFile)) return;
    if (this.sedimentAdvanceTimer) window.clearTimeout(this.sedimentAdvanceTimer);
    const path = obsidian.normalizePath(file.path || "");
    this.sedimentAdvanceTimer = window.setTimeout(() => {
      this.sedimentAdvanceTimer = 0;
      const active = this.getActiveLexVoiceNoteFile();
      const activePath = active && active.path ? obsidian.normalizePath(active.path) : "";
      if (activePath && path && activePath !== path) return;
      const state = this.getSedimentPanelState(file);
      const next = this.findSedimentNextPendingGroup(state.groups, completedKey);
      this.setSedimentCandidateBucket(file, { transitionGroup: "" });
      if (next) this.setSedimentGroup(next.key);
      else this.render();
    }, 1000);
  }

  renderSedimentBaton(parent, state, groupKey, file) {
    const group = state.groups.find(item => item.key === groupKey) || state.groups[0];
    const allDone = (state.groups || []).length && (state.groups || []).every(item => !item.total || item.done >= item.total);
    const currentDone = group && group.total && group.done >= group.total;
    const wrap = parent.createDiv({ cls: "lexvoice-sediment-baton" + (currentDone || allDone ? " is-done" : "") });
    const top = wrap.createDiv({ cls: "lexvoice-sediment-baton-top" });
    const status = top.createDiv({ cls: "lexvoice-sediment-status" });
    status.createDiv({ cls: "lexvoice-sediment-dot" });
    const noteTitle = file && file.basename ? file.basename : "当前纪要";
    const title = status.createSpan({ cls: "lexvoice-sediment-status-title", text: allDone ? "这场会沉淀完了" : noteTitle });
    title.setAttr("title", noteTitle);
    top.createSpan({ cls: "lexvoice-sediment-progress-text", text: group && group.total ? `${group.done} / ${group.total}` : "0 / 0" });

    const pipeline = wrap.createDiv({ cls: "lexvoice-sediment-pipeline" });
    (state.groups || []).forEach((item, index) => {
      const nodeState = this.getSedimentNodeState(item, groupKey);
      const node = pipeline.createEl("button", {
        cls: `lexvoice-sediment-pipeline-node is-${nodeState}`,
        attr: {
          type: "button",
          "data-group": item.key,
          "aria-label": `${item.label}：${item.status}`,
        },
      });
      const clickable = nodeState === "pending" || (nodeState === "done" && item.key !== groupKey);
      node.disabled = !clickable;
      const circle = node.createSpan({ cls: "lexvoice-sediment-pipeline-circle" });
      if (nodeState === "done") {
        try { obsidian.setIcon(circle, "check"); } catch { circle.setText("✓"); }
      } else {
        circle.setText(String(item.total || 0));
      }
      node.createSpan({ cls: "lexvoice-sediment-pipeline-label", text: item.label });
      node.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (!clickable) return;
        this.setSedimentGroup(item.key);
      };
      if (index < (state.groups || []).length - 1) {
        const chevron = pipeline.createSpan({ cls: "lexvoice-sediment-pipeline-chevron", attr: { "aria-hidden": "true" } });
        try { obsidian.setIcon(chevron, "chevron-right"); } catch { chevron.setText("›"); }
      }
    });
  }

  renderSedimentSwitchPopover(parent, groups, groupKey) {
    const pop = parent.createDiv({ cls: "lexvoice-sediment-switch-popover" });
    for (const group of groups) {
      const item = pop.createEl("button", {
        cls: "lexvoice-sediment-switch-item" + (group.key === groupKey ? " is-current" : ""),
        attr: { type: "button" },
      });
      const left = item.createSpan({ cls: "lexvoice-sediment-switch-left" });
      left.createSpan({ cls: "lexvoice-sediment-switch-dot" });
      left.createSpan({ text: group.label });
      item.createSpan({ cls: "lexvoice-sediment-switch-count", text: group.pending ? `${group.pending} ${group.unit}` : group.status });
      item.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.setSedimentGroup(group.key);
      };
    }
  }

  renderSedimentGroup(parent, file, state, groupKey) {
    const body = parent.createDiv({ cls: "lexvoice-sediment-body" });
    const group = (state.groups || []).find(item => item.key === groupKey);
    const isReview = group && group.total > 0 && group.done >= group.total;
    if (isReview) {
      this.renderSedimentReviewGroup(body, file, state, groupKey);
      return;
    }
    if (groupKey === "person") {
      this.renderSedimentRescanRow(body, file);
      this.renderSedimentPeople(body, file, state);
    } else if (groupKey === "todo") {
      this.renderSedimentObjectList(body, file, state, "todo");
    } else if (groupKey === "card") {
      this.renderSedimentObjectList(body, file, state, "card");
    } else {
      this.renderSedimentObjectList(body, file, state, "hotword");
    }
  }

  renderSedimentRescanRow(parent, file) {
    const row = parent.createDiv({ cls: "lexvoice-sediment-rescan-row" });
    const btn = row.createEl("button", { cls: "lexvoice-sediment-rescan-button", attr: { type: "button" } });
    try { obsidian.setIcon(btn.createSpan({ cls: "lexvoice-sediment-rescan-icon" }), "refresh-cw"); } catch { /* intentionally empty */ }
    btn.createSpan({ text: "重扫" });
    btn.onclick = () => this.confirmSedimentRescan(file);
  }

  formatSedimentNoteLabel(file) {
    const name = file && file.basename ? String(file.basename) : "";
    return name.replace(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})(\d{2})(.*)$/u, "$2-$3 $4:$5$6");
  }

  renderSedimentStart(parent, file, state) {
    this.renderSedimentPrompt(parent, {
      icon: "sparkles",
      subtitle: this.formatSedimentNoteLabel(file),
      title: "AI 还没读过这篇纪要",
      desc: "扫一下，把人、事、知、热词一次整理好",
      primaryText: "扫描本篇",
      onPrimary: () => this.requestSedimentExtraction(file, !!(state.peopleScanned || state.vocabScanned || (state.currentPeople && state.currentPeople.length) || (state.ignoredPeople && state.ignoredPeople.length) || state.otherPeopleCount)),
    });
  }

  renderSedimentScanning(parent, file, state) {
    const bucket = state.bucket || {};
    const counts = bucket.initialCounts || {};
    const box = parent.createDiv({ cls: "lexvoice-sediment-prompt is-scanning" });
    const icon = box.createDiv({ cls: "lexvoice-sediment-prompt-icon" });
    // 不再用旋转 spinner（下方进度条已经表达"进行中"语义），换成静态扫描图标
    try { obsidian.setIcon(icon, "scan-line"); } catch { /* intentionally empty */ }
    box.createDiv({ cls: "lexvoice-sediment-prompt-subtitle", text: this.formatSedimentNoteLabel(file) });
    box.createDiv({ cls: "lexvoice-sediment-prompt-title", text: "正在扫描本篇纪要" });
    const progress = box.createDiv({ cls: "lexvoice-sediment-scan-progress" });
    progress.createDiv({ cls: "lexvoice-sediment-scan-progress-fill" });
    const stats = box.createDiv({ cls: "lexvoice-sediment-scan-stats" });
    for (const key of SEDIMENT_GROUP_ORDER) {
      const cfg = SEDIMENT_GROUP_CONFIG[key];
      const count = Math.max(0, Number(counts[key]) || 0);
      const stat = stats.createDiv({ cls: "lexvoice-sediment-scan-stat" });
      stat.createDiv({ cls: "lexvoice-sediment-scan-number", text: String(count) });
      stat.createDiv({ cls: "lexvoice-sediment-scan-label", text: `已识别${cfg.label}${cfg.unit}` });
    }
    const actions = box.createDiv({ cls: "lexvoice-sediment-prompt-actions" });
    actions.createEl("button", { text: "取消扫描", cls: "lexvoice-sediment-button is-secondary", attr: { type: "button" } }).onclick = () => this.cancelSedimentExtraction(file);
  }

  // "还有 N 条"改成可点击展开/收起：默认只显示前 8 条保持紧凑，点一下渲染全部（面板自然滚动），
  // 否则后面的候选既滚不到也无法逐条改名/取消选中 —— 即"操作上卡死"。
  renderSedimentMoreToggle(list, key, hiddenCount, expanded) {
    const more = list.createDiv({
      cls: "lexvoice-sediment-more is-clickable",
      text: expanded ? "收起" : `还有 ${hiddenCount} 条 · 点击展开`,
      attr: { role: "button", tabindex: "0", title: expanded ? "收起列表" : "展开全部候选" },
    });
    const toggle = (evt) => {
      if (evt) evt.stopPropagation();
      if (this.sedimentExpandedGroups.has(key)) this.sedimentExpandedGroups.delete(key);
      else this.sedimentExpandedGroups.add(key);
      this.render();
    };
    more.onclick = toggle;
    more.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } };
  }

  renderSedimentPeople(parent, file, state) {
    if (state.currentPeople.length) {
      const list = parent.createDiv({ cls: "lexvoice-sediment-list" });
      const expanded = this.sedimentExpandedGroups.has("person");
      const shown = expanded ? state.currentPeople : state.currentPeople.slice(0, 8);
      for (const item of shown) this.renderSedimentPeopleItem(list, file, item);
      if (state.currentPeople.length > 8) {
        this.renderSedimentMoreToggle(list, "person", state.currentPeople.length - 8, expanded);
      }
      this.renderSedimentFooter(parent, state.groups.find(item => item.key === "person"), state.currentPeople.length, {
        secondaryText: "全部忽略",
        onSecondary: () => this.ignorePeopleSuggestions(state.currentPeople, file),
        onPrimary: () => this.keepPeopleSuggestions(file, state.currentPeople),
      });
      return;
    }
    this.renderSedimentEmptyList(parent);
    this.renderSedimentFooter(parent, state.groups.find(item => item.key === "person"), 0, {
      secondaryText: "全部忽略",
      onSecondary: () => { /* intentionally empty */ },
      onPrimary: () => { /* intentionally empty */ },
    });
  }

  renderSedimentObjectList(parent, file, state, groupKey) {
    const group = state.groups.find(item => item.key === groupKey);
    const items = this.getSedimentDisplayItems(state, groupKey);
    const selected = this.getSedimentSelectedIds(file, groupKey, items);
    this.renderSedimentMultiselectHeader(parent, file, groupKey, items, selected);
    const list = parent.createDiv({ cls: "lexvoice-sediment-list" });
    if (!items.length) {
      this.renderSedimentEmptyList(list);
    } else {
      const expanded = this.sedimentExpandedGroups.has(groupKey);
      const shown = expanded ? items : items.slice(0, 8);
      for (const item of shown) this.renderSedimentObjectItem(list, file, groupKey, item, selected.has(item.id));
      if (items.length > 8) this.renderSedimentMoreToggle(list, groupKey, items.length - 8, expanded);
    }
    const selectedCount = Array.from(selected).filter(id => items.some(item => item.id === id)).length;
    const unselectedCount = Math.max(0, items.length - selectedCount);
    this.renderSedimentFooter(parent, group, selectedCount, {
      secondaryText: "忽略未选",
      secondaryDisabled: !unselectedCount,
      secondaryTitle: unselectedCount ? `未选的 ${unselectedCount} 条会被标为忽略` : "当前没有未选条目",
      onSecondary: () => this.confirmIgnoreSedimentUnselected(file, groupKey, unselectedCount),
      onPrimary: () => this.commitSedimentGroup(file, groupKey),
    });
  }

  renderSedimentMultiselectHeader(parent, file, groupKey, items, selected) {
    const total = (items || []).length;
    const selectedCount = Array.from(selected || []).filter(id => (items || []).some(item => item.id === id)).length;
    const allSelected = total > 0 && selectedCount === total;
    const noneSelected = selectedCount === 0;
    const header = parent.createDiv({ cls: "lexvoice-sediment-multiselect-header" });
    const left = header.createDiv({ cls: "lexvoice-sediment-multiselect-left" });
    const master = left.createEl("button", {
      cls: "lexvoice-sediment-checkbox" + (allSelected ? " is-checked" : (!noneSelected ? " is-indeterminate" : "")),
      attr: { type: "button", "aria-label": allSelected ? "取消全选" : "全选" },
    });
    master.onclick = () => {
      this.setSedimentSelectedIds(file, groupKey, allSelected ? [] : (items || []).map(item => item.id));
      this.render();
    };
    left.createSpan({ cls: "lexvoice-sediment-multiselect-count", text: `已选 ${selectedCount} / ${total}` });
    const actions = header.createDiv({ cls: "lexvoice-sediment-multiselect-actions" });
    const selectAll = actions.createEl("button", { text: "全选", cls: "lexvoice-sediment-text-button", attr: { type: "button" } });
    selectAll.disabled = allSelected || !total;
    selectAll.onclick = () => {
      this.setSedimentSelectedIds(file, groupKey, (items || []).map(item => item.id));
      this.render();
    };
    const invert = actions.createEl("button", { text: "反选", cls: "lexvoice-sediment-text-button", attr: { type: "button" } });
    invert.disabled = !total;
    invert.onclick = () => {
      const next = (items || []).filter(item => !selected.has(item.id)).map(item => item.id);
      this.setSedimentSelectedIds(file, groupKey, next);
      this.render();
    };
    const rescan = actions.createEl("button", { cls: "lexvoice-sediment-text-button lexvoice-sediment-rescan-inline", attr: { type: "button" } });
    try { obsidian.setIcon(rescan.createSpan({ cls: "lexvoice-sediment-rescan-icon" }), "refresh-cw"); } catch { /* intentionally empty */ }
    rescan.createSpan({ text: "重扫" });
    rescan.onclick = () => this.confirmSedimentRescan(file);
  }

  renderSedimentObjectItem(parent, file, groupKey, item, checked) {
    const row = parent.createDiv({ cls: `lexvoice-sediment-list-item lexvoice-sediment-select-item is-${groupKey}` + (checked ? " is-checked" : " is-unchecked") });
    const checkbox = row.createEl("button", {
      cls: "lexvoice-sediment-checkbox" + (checked ? " is-checked" : ""),
      attr: { type: "button", "aria-label": checked ? "取消选择" : "选择" },
    });
    checkbox.onclick = () => {
      const state = this.getSedimentPanelState(file);
      const items = this.getSedimentDisplayItems(state, groupKey);
      const selected = this.getSedimentSelectedIds(file, groupKey, items);
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      this.setSedimentSelectedIds(file, groupKey, selected);
      this.render();
    };
    const content = row.createDiv({ cls: "lexvoice-sediment-item-content" });
    if (groupKey === "hotword") {
      const top = content.createDiv({ cls: "lexvoice-sediment-item-title-row" });
      // 标题可点击就地改名（ASR 转错的词直接改）
      const titleEl = top.createDiv({
        cls: "lexvoice-sediment-item-title lexvoice-sediment-editable-title",
        text: item.title || "",
        attr: { role: "button", tabindex: "0", title: "点击修改" },
      });
      titleEl.onclick = (evt) => {
        evt.stopPropagation();
        this.enterSedimentInlineTitleEdit(titleEl, item.title || "", (next) => this.updateSedimentHotwordTerm(file, item, next));
      };
      this.renderSedimentTypePill(top, item.sub || "热词", this.getSedimentTypeIcon(groupKey, item.sub, item.sectionKey));
      return;
    }
    if (groupKey === "card") {
      const raw = item.raw || {};
      // 学习卡片：标题在左、带主题色底的「图标+文字」类型标签在同一行右上角；
      // 标题占满宽度自动换行，标签 flex 不缩、顶部对齐，长标题也不挤标签。
      const titleRow = content.createDiv({ cls: "lexvoice-sediment-item-title-row is-card" });
      titleRow.createDiv({ cls: "lexvoice-sediment-item-title is-card", text: item.title || "" });
      this.renderSedimentTypePill(titleRow, item.sub || "卡片", this.getSedimentTypeIcon(groupKey, item.sub, raw.type));
      // 观点类卡片：标题下方标出是谁的观点
      const holder = sanitizeSedimentText(raw.holder, 40);
      if (holder) {
        const holderEl = content.createDiv({ cls: "lexvoice-sediment-card-holder" });
        try { obsidian.setIcon(holderEl.createSpan({ cls: "lexvoice-sediment-card-holder-icon" }), "quote"); } catch { /* intentionally empty */ }
        holderEl.createSpan({ text: holder });
      }
      const summary = raw.summary || raw.reusableLine || item.meta || "";
      if (summary) content.createDiv({ cls: "lexvoice-sediment-item-summary is-card", text: summary });
      return;
    }
    if (groupKey === "todo") {
      const raw = item.raw || {};
      const todoId = getSedimentTodoId(raw);
      row.dataset.todoId = todoId;
      // 标题：可点击进入 contenteditable 编辑态
      const titleEl = content.createDiv({
        cls: "lexvoice-sediment-item-title lexvoice-todo-title",
        text: item.title || "",
        attr: { "data-field": "title", role: "button", tabindex: "0" },
      });
      titleEl.onclick = (evt) => { evt.stopPropagation(); this.enterTodoTitleEdit(titleEl, file, raw); };
      const meta = content.createDiv({ cls: "lexvoice-sediment-field-row" });
      const ownerField = this.renderSedimentField(meta, "user", raw.owner || "加责任人", raw.owner ? "" : "is-empty");
      ownerField.dataset.field = "owner";
      ownerField.onclick = (evt) => { evt.stopPropagation(); void this.enterTodoOwnerEdit(ownerField, content, file, raw); };
      const dueField = this.renderSedimentField(meta, "calendar-plus", raw.due || "加时间", raw.due ? "is-time" : "is-empty");
      dueField.dataset.field = "due";
      dueField.onclick = (evt) => { evt.stopPropagation(); this.enterTodoDueEdit(dueField, content, file, raw); };
      // Todoist 风格：字段位置永远只是"+ 添加子任务"，已有的子任务在下面常驻一条列表
      const subtaskField = this.renderSedimentField(meta, "plus", "添加子任务", "is-empty is-add-subtask");
      subtaskField.dataset.field = "subtasks";
      subtaskField.onclick = (evt) => { evt.stopPropagation(); this.enterTodoSubtasksAdd(subtaskField, content, file, raw); };
      // 常驻子任务列表（每行 contenteditable，× 删除）
      const existingSubs = normalizeSedimentTodoSubtasks(raw.subtasks || raw.children || []);
      if (existingSubs.length) this.renderTodoSubtaskStrip(content, file, raw, existingSubs);
      // 渲染完成后，如果有待恢复的 inline 编辑（来自 Tab 切换 / 保存后的下一字段），自动进入
      if (this.inlineTodoPendingFocus && this.inlineTodoPendingFocus.todoId === todoId) {
        const pending = this.inlineTodoPendingFocus;
        this.inlineTodoPendingFocus = null;
        const target = row.querySelector(`[data-field="${pending.field}"]`);
        if (target) window.setTimeout(() => target.click(), 20);
      }
      return;
    }
    const top = content.createDiv({ cls: "lexvoice-sediment-item-top" });
    top.createDiv({ cls: "lexvoice-sediment-item-title", text: item.title || "" });
    if (item.sub) content.createDiv({ cls: "lexvoice-sediment-item-sub", text: item.sub });
    if (item.meta) content.createDiv({ cls: "lexvoice-sediment-item-meta", text: item.meta });
  }

  getSedimentTypeIcon(groupKey, label, key) {
    const text = `${label || ""} ${key || ""}`;
    if (/人|people|person/i.test(text)) return "user";
    if (/品牌|机构|brand|org|company/i.test(text)) return "building";
    if (/观点|point|insight/i.test(text)) return "bulb";
    if (/机制|mechanism|settings/i.test(text)) return "settings-2";
    if (/案例|case/i.test(text)) return "flask";
    if (/问答|qa|question/i.test(text)) return "message-question";
    if (groupKey === "card") return "bookmark";
    return "tag";
  }

  renderSedimentTypePill(parent, label, iconName) {
    const pill = parent.createSpan({ cls: "lexvoice-sediment-type-pill" });
    try { obsidian.setIcon(pill.createSpan({ cls: "lexvoice-sediment-type-icon" }), iconName || "tag"); } catch { /* intentionally empty */ }
    pill.createSpan({ text: label || "类型" });
    return pill;
  }

  renderSedimentField(parent, iconName, text, cls = "") {
    const field = parent.createSpan({ cls: `lexvoice-sediment-field ${cls}`.trim() });
    field.setAttr("role", "button");
    field.setAttr("tabindex", "0");
    try { obsidian.setIcon(field.createSpan({ cls: "lexvoice-sediment-field-icon" }), iconName); } catch { /* intentionally empty */ }
    field.createSpan({ text: text || "" });
    return field;
  }

  // ===================== 待办行内编辑（v3.5 设计稿） =====================
  // 设计原则：就地编辑、零弹窗、键盘优先。同一时间只允许一个待办处于编辑态。
  // 切换字段或切换待办时，前一个编辑自动 commit + cleanup。
  // 保存触发 updateSedimentTodoCandidate → render()，DOM 整体重建。
  // Tab 切换字段：把 { todoId, field } 写入 this.inlineTodoPendingFocus，
  // render 时由 todo 渲染分支检测到并自动重新进入对应字段。

  closeInlineTodoEditor() {
    if (this.inlineTodoEditor && typeof this.inlineTodoEditor.close === "function") {
      try { this.inlineTodoEditor.close(); } catch (e) { console.warn("[LexVoice] inline close failed", e); }
    }
    this.inlineTodoEditor = null;
  }

  // 标题：contenteditable 就地改
  enterTodoTitleEdit(titleEl, file, raw) {
    if (this.inlineTodoEditor && this.inlineTodoEditor._anchor === titleEl) return;
    this.closeInlineTodoEditor();
    const original = (titleEl.textContent || "").trim();
    const todoId = getSedimentTodoId(raw);
    titleEl.contentEditable = "true";
    titleEl.classList.add("is-editing");
    titleEl.focus();
    // 全选已有文本，方便直接覆盖
    const sel = window.getSelection();
    if (sel) {
      const range = activeDocument.createRange();
      range.selectNodeContents(titleEl);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    let done = false;
    const finish = async (shouldSave, nextField) => {
      if (done) return;
      done = true;
      titleEl.contentEditable = "false";
      titleEl.classList.remove("is-editing");
      titleEl.removeEventListener("keydown", onKey);
      titleEl.removeEventListener("blur", onBlur);
      const newText = (titleEl.textContent || "").trim();
      this.inlineTodoEditor = null;
      if (nextField) this.inlineTodoPendingFocus = { todoId, field: nextField };
      if (shouldSave && newText && newText !== original) {
        await this.updateSedimentTodoCandidate(file, raw, { task: newText });
      } else if (nextField) {
        this.render();
      }
    };
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); void finish(true, null); }
      else if (e.key === "Escape") { e.preventDefault(); titleEl.textContent = original; void finish(false, null); }
      else if (e.key === "Tab") {
        e.preventDefault();
        void finish(true, e.shiftKey ? null : "owner");
      }
    };
    const onBlur = () => finish(true, null);
    titleEl.addEventListener("keydown", onKey);
    titleEl.addEventListener("blur", onBlur);
    this.inlineTodoEditor = { _anchor: titleEl, close: () => finish(true, null) };
  }

  // 责任人：字段位置改 input，下方展开下拉
  async enterTodoOwnerEdit(fieldEl, content, file, raw) {
    if (this.inlineTodoEditor && this.inlineTodoEditor._anchor === fieldEl) return;
    this.closeInlineTodoEditor();
    const todoId = getSedimentTodoId(raw);
    const input = activeDocument.createElement("input");
    input.type = "text";
    input.className = "lexvoice-todo-inline-input is-owner";
    input.placeholder = "搜索或输入新名字";
    input.value = raw.owner || "";
    fieldEl.replaceWith(input);
    const panel = content.createDiv({ cls: "lexvoice-todo-inline-panel is-owner" });
    const list = panel.createDiv({ cls: "lexvoice-todo-inline-list" });
    list.createDiv({ cls: "lexvoice-todo-inline-loading", text: "加载人员…" });
    let people = [];
    try { people = await loadPeopleDirectory(this) || []; } catch (e) { console.warn("[LexVoice] load people failed", e); }
    let items = [];
    let selectedIdx = 0;
    const highlight = () => items.forEach((it, i) => it.classList.toggle("is-active", i === selectedIdx));
    const renderList = (query) => {
      list.empty();
      items = [];
      const q = (query || "").trim().toLowerCase();
      const filtered = !q ? people : people.filter((p) => {
        const txt = `${p.name || ""} ${p.aliases || ""} ${p.role || ""} ${p.org || ""}`.toLowerCase();
        return txt.includes(q);
      });
      if (raw.owner) {
        const cur = list.createDiv({ cls: "lexvoice-todo-inline-item is-current" });
        try { obsidian.setIcon(cur.createSpan({ cls: "lexvoice-todo-inline-item-icon" }), "user-check"); } catch { /* intentionally empty */ }
        cur.createSpan({ cls: "lexvoice-todo-inline-item-name", text: raw.owner });
        const clr = cur.createSpan({ cls: "lexvoice-todo-inline-item-clear", text: "清除" });
        clr.onclick = (e) => { e.stopPropagation(); void finish("", null); };
        cur.dataset.value = raw.owner;
        cur.onclick = () => finish(raw.owner, null);
        items.push(cur);
      }
      for (const p of filtered.slice(0, 8)) {
        const it = list.createDiv({ cls: "lexvoice-todo-inline-item" });
        try { obsidian.setIcon(it.createSpan({ cls: "lexvoice-todo-inline-item-icon" }), "user"); } catch { /* intentionally empty */ }
        it.createSpan({ cls: "lexvoice-todo-inline-item-name", text: p.name || "未命名" });
        if (p.role || p.org) it.createSpan({ cls: "lexvoice-todo-inline-item-meta", text: [p.role, p.org].filter(Boolean).join(" · ") });
        it.dataset.value = p.name || "";
        it.onclick = () => finish(p.name || "", null);
        items.push(it);
      }
      if (q && !filtered.some((p) => (p.name || "").toLowerCase() === q)) {
        const it = list.createDiv({ cls: "lexvoice-todo-inline-item is-new" });
        try { obsidian.setIcon(it.createSpan({ cls: "lexvoice-todo-inline-item-icon" }), "user-plus"); } catch { /* intentionally empty */ }
        it.createSpan({ cls: "lexvoice-todo-inline-item-name", text: `+ 新建 "${query.trim()}"` });
        it.dataset.value = query.trim();
        it.onclick = () => finish(query.trim(), null);
        items.push(it);
      }
      if (!items.length) list.createDiv({ cls: "lexvoice-todo-inline-empty", text: "人员库为空，直接输入新名字 + 回车" });
      selectedIdx = 0;
      highlight();
    };
    renderList("");
    let done = false;
    const finish = async (newOwner, nextField) => {
      if (done) return;
      done = true;
      cleanup();
      this.inlineTodoEditor = null;
      if (nextField) this.inlineTodoPendingFocus = { todoId, field: nextField };
      const trimmed = String(newOwner || "").trim();
      if (trimmed !== (raw.owner || "")) {
        await this.updateSedimentTodoCandidate(file, raw, { owner: trimmed });
      } else {
        this.render();
      }
    };
    const onInput = () => renderList(input.value);
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) { selectedIdx = Math.min(selectedIdx + 1, items.length - 1); highlight(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) { selectedIdx = Math.max(selectedIdx - 1, 0); highlight(); } }
      else if (e.key === "Enter") {
        e.preventDefault();
        const target = items[selectedIdx];
        if (target) void finish(target.dataset.value || "", null);
        else if (input.value.trim()) void finish(input.value.trim(), null);
      }
      else if (e.key === "Escape") { e.preventDefault(); void finish(raw.owner || "", null); }
      else if (e.key === "Tab") { e.preventDefault(); void finish(input.value.trim() || (raw.owner || ""), e.shiftKey ? "title" : "due"); }
    };
    const onOutside = (e) => {
      if (!panel.contains(e.target) && e.target !== input && !input.contains(e.target)) void finish(input.value.trim() || (raw.owner || ""), null);
    };
    const cleanup = () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      activeDocument.removeEventListener("mousedown", onOutside, true);
    };
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);
    window.setTimeout(() => activeDocument.addEventListener("mousedown", onOutside, true), 0);
    input.focus();
    input.select();
    this.inlineTodoEditor = { _anchor: fieldEl, close: () => finish(input.value.trim() || (raw.owner || ""), null) };
  }

  // 截止日：5 个快捷 + native date input
  enterTodoDueEdit(fieldEl, content, file, raw) {
    if (this.inlineTodoEditor && this.inlineTodoEditor._anchor === fieldEl) return;
    this.closeInlineTodoEditor();
    const todoId = getSedimentTodoId(raw);
    fieldEl.classList.add("is-editing");
    // 设计稿：字段在编辑态文字变成"选时间"
    const textSpan = fieldEl.querySelector(":scope > span:not(.lexvoice-sediment-field-icon)");
    if (textSpan) textSpan.setText("选时间");
    const panel = content.createDiv({ cls: "lexvoice-todo-inline-panel is-due" });
    const bar = panel.createDiv({ cls: "lexvoice-todo-inline-quickbar" });
    const moment = window.moment;
    const presets = moment ? [
      { key: "1", label: "今天", value: moment().format("YYYY-MM-DD") },
      { key: "2", label: "明天", value: moment().add(1, "day").format("YYYY-MM-DD") },
      { key: "3", label: "本周末", value: moment().endOf("week").format("YYYY-MM-DD") },
      { key: "4", label: "下周", value: moment().add(1, "week").format("YYYY-MM-DD") },
    ] : [];
    let matched = false;
    for (const p of presets) {
      const btn = bar.createEl("button", { cls: "lexvoice-todo-inline-preset", text: p.label, attr: { type: "button", "data-key": p.key } });
      // 只让第一个匹配的 preset 高亮（避免"今天 = 本周末"这种重叠都亮起）
      if (!matched && raw.due && raw.due === p.value) { btn.classList.add("is-active"); matched = true; }
      btn.onclick = () => finish(p.value, null);
    }
    const customBtn = bar.createEl("button", { cls: "lexvoice-todo-inline-preset is-custom", attr: { type: "button", "data-key": "5" } });
    try { obsidian.setIcon(customBtn.createSpan({ cls: "lexvoice-todo-inline-preset-icon" }), "calendar"); } catch { /* intentionally empty */ }
    customBtn.createSpan({ text: "自定" });
    customBtn.onclick = () => showCustom();
    if (raw.due) {
      const clr = bar.createEl("button", { cls: "lexvoice-todo-inline-preset is-clear", text: "清除", attr: { type: "button" } });
      clr.onclick = () => finish("", null);
    }
    const showCustom = () => {
      bar.empty();
      const dateInput = bar.createEl("input", { cls: "lexvoice-todo-inline-date", attr: { type: "date" } });
      const currentISO = raw.due && /^\d{4}-\d{2}-\d{2}/.test(raw.due) ? raw.due.slice(0, 10) : "";
      dateInput.value = currentISO;
      dateInput.onchange = () => { if (dateInput.value) void finish(dateInput.value, null); };
      dateInput.focus();
      try { dateInput.click(); } catch { /* intentionally empty */ }
    };
    let done = false;
    const finish = async (newDue, nextField) => {
      if (done) return;
      done = true;
      cleanup();
      this.inlineTodoEditor = null;
      if (nextField) this.inlineTodoPendingFocus = { todoId, field: nextField };
      if (newDue !== (raw.due || "")) {
        await this.updateSedimentTodoCandidate(file, raw, { due: newDue });
      } else {
        this.render();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); void finish(raw.due || "", null); }
      else if (e.key === "Tab") { e.preventDefault(); void finish(raw.due || "", e.shiftKey ? "owner" : "subtasks"); }
      else if (["1","2","3","4","5"].includes(e.key)) {
        const btn = bar.querySelector(`[data-key="${e.key}"]`);
        if (btn) { e.preventDefault(); btn.click(); }
      }
    };
    const onOutside = (e) => { if (!panel.contains(e.target) && e.target !== fieldEl) void finish(raw.due || "", null); };
    const cleanup = () => {
      activeDocument.removeEventListener("keydown", onKey, true);
      activeDocument.removeEventListener("mousedown", onOutside, true);
    };
    window.setTimeout(() => {
      activeDocument.addEventListener("keydown", onKey, true);
      activeDocument.addEventListener("mousedown", onOutside, true);
    }, 0);
    this.inlineTodoEditor = { _anchor: fieldEl, close: () => finish(raw.due || "", null) };
  }

  // 常驻子任务列表（Todoist 风格）：永远显示已有子任务，行内可改、× 删除
  renderTodoSubtaskStrip(content, file, raw, subs) {
    const strip = content.createDiv({ cls: "lexvoice-todo-subtask-strip" });
    subs.forEach((sub, idx) => {
      const row = strip.createDiv({ cls: "lexvoice-todo-subtask-strip-row" });
      row.createSpan({ cls: "lexvoice-todo-subtask-strip-check" });
      const text = row.createSpan({ cls: "lexvoice-todo-subtask-strip-text", text: sub });
      text.setAttr("contenteditable", "true");
      text.setAttr("spellcheck", "false");
      text.dataset.original = sub;
      text.addEventListener("focus", () => text.classList.add("is-editing"));
      const saveIfChanged = async () => {
        text.classList.remove("is-editing");
        const val = (text.textContent || "").trim();
        const original = text.dataset.original || "";
        if (val === original) return;
        const next = subs.slice();
        if (val) next[idx] = val;
        else next.splice(idx, 1);
        const cleaned = next.map((s) => String(s || "").trim()).filter(Boolean);
        await this.updateSedimentTodoCandidate(file, raw, { subtasks: cleaned });
      };
      text.addEventListener("blur", () => { void saveIfChanged(); });
      text.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); text.blur(); }
        else if (e.key === "Escape") {
          e.preventDefault();
          text.textContent = text.dataset.original || "";
          text.blur();
        }
        else if (e.key === "Backspace" && !text.textContent) {
          e.preventDefault();
          text.dataset.original = ""; // 触发 blur 后按"删除"路径
          text.blur();
        }
      });
      const del = row.createSpan({ cls: "lexvoice-todo-subtask-strip-del", attr: { "aria-label": "删除" } });
      try { obsidian.setIcon(del, "x"); } catch { del.setText("×"); }
      del.onmousedown = (e) => { e.preventDefault(); }; // 防止 text contenteditable 先触发 blur
      del.onclick = async (e) => {
        e.stopPropagation();
        const next = subs.slice();
        next.splice(idx, 1);
        await this.updateSedimentTodoCandidate(file, raw, { subtasks: next });
      };
    });
  }

  // "+ 添加子任务" 专职 add：只展开一个紧凑的 input；Enter 即添加 + 即时保存
  enterTodoSubtasksAdd(fieldEl, content, file, raw) {
    if (this.inlineTodoEditor && this.inlineTodoEditor._anchor === fieldEl) return;
    this.closeInlineTodoEditor();
    const todoId = getSedimentTodoId(raw);
    const MAX = 5;
    const existingSubs = normalizeSedimentTodoSubtasks(raw.subtasks || raw.children || []);
    if (existingSubs.length >= MAX) {
      try { new obsidian.Notice("最多 5 个子任务"); } catch { /* intentionally empty */ }
      return;
    }
    fieldEl.classList.add("is-editing");
    const addPanel = content.createDiv({ cls: "lexvoice-todo-inline-panel is-subtask-add" });
    const addRow = addPanel.createDiv({ cls: "lexvoice-todo-inline-subtask-add" });
    try { obsidian.setIcon(addRow.createSpan({ cls: "lexvoice-todo-inline-subtask-add-icon" }), "plus"); } catch { /* intentionally empty */ }
    const input = addRow.createEl("input", {
      cls: "lexvoice-todo-inline-subtask-input",
      attr: { type: "text", placeholder: existingSubs.length ? `已 ${existingSubs.length}/${MAX}，继续添加` : "添加子任务，回车继续" },
    });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      fieldEl.classList.remove("is-editing");
      this.inlineTodoEditor = null;
      try { addPanel.remove(); } catch { /* intentionally empty */ }
    };
    const onKey = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = input.value.trim();
        if (!val) return;
        const fresh = normalizeSedimentTodoSubtasks(raw.subtasks || raw.children || []).slice();
        if (fresh.length >= MAX) { try { new obsidian.Notice("最多 5 个子任务"); } catch { /* intentionally empty */ }; return; }
        fresh.push(val);
        // 即时保存：会触发 render；为了让用户能继续按 Enter 添加下一条，
        // 把 pending focus 设到 subtasks 字段，render 后会自动重开 add 输入框
        cleanup();
        fieldEl.classList.remove("is-editing");
        this.inlineTodoEditor = null;
        done = true;
        if (fresh.length < MAX) this.inlineTodoPendingFocus = { todoId, field: "subtasks" };
        await this.updateSedimentTodoCandidate(file, raw, { subtasks: fresh });
      }
      else if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "Tab") { e.preventDefault(); finish(); }
    };
    const onOutside = (e) => { if (!addPanel.contains(e.target) && e.target !== fieldEl) finish(); };
    const cleanup = () => {
      input.removeEventListener("keydown", onKey);
      activeDocument.removeEventListener("mousedown", onOutside, true);
    };
    input.addEventListener("keydown", onKey);
    window.setTimeout(() => activeDocument.addEventListener("mousedown", onOutside, true), 0);
    input.focus();
    this.inlineTodoEditor = { _anchor: fieldEl, close: finish };
  }

  // (旧实现保留作 dead code；新调用走 enterTodoSubtasksAdd + renderTodoSubtaskStrip)
  enterTodoSubtasksEdit(fieldEl, content, file, raw) {
    if (this.inlineTodoEditor && this.inlineTodoEditor._anchor === fieldEl) return;
    this.closeInlineTodoEditor();
    const todoId = getSedimentTodoId(raw);
    fieldEl.classList.add("is-editing");
    const existing = normalizeSedimentTodoSubtasks(raw.subtasks || raw.children || []).slice();
    const MAX = 5;
    const panel = content.createDiv({ cls: "lexvoice-todo-inline-panel is-subtasks" });
    const listEl = panel.createDiv({ cls: "lexvoice-todo-inline-subtask-list" });
    const addRow = panel.createDiv({ cls: "lexvoice-todo-inline-subtask-add" });
    try { obsidian.setIcon(addRow.createSpan({ cls: "lexvoice-todo-inline-subtask-add-icon" }), "plus"); } catch { /* intentionally empty */ }
    const addInput = addRow.createEl("input", {
      cls: "lexvoice-todo-inline-subtask-input",
      attr: { type: "text", placeholder: "添加子任务，回车继续" },
    });
    const footer = panel.createDiv({ cls: "lexvoice-todo-inline-subtask-footer" });
    const countEl = footer.createSpan({ cls: "lexvoice-todo-inline-subtask-count" });
    footer.createSpan({ cls: "lexvoice-todo-inline-subtask-hint", text: "↵ 添加 · Esc 收起" });
    const updateCount = () => {
      countEl.setText(`${existing.length}/${MAX} 项`);
      if (existing.length >= MAX) {
        addInput.disabled = true;
        addInput.placeholder = "已达上限";
      } else {
        addInput.disabled = false;
        addInput.placeholder = "添加子任务，回车继续";
      }
    };
    const renderList = () => {
      listEl.empty();
      existing.forEach((sub, i) => {
        const row = listEl.createDiv({ cls: "lexvoice-todo-inline-subtask-row" });
        row.createSpan({ cls: "lexvoice-todo-inline-subtask-check" });
        const text = row.createSpan({ cls: "lexvoice-todo-inline-subtask-text", text: sub });
        text.setAttr("contenteditable", "true");
        text.oninput = () => { existing[i] = text.textContent || ""; };
        text.onkeydown = (e) => {
          if (e.key === "Enter") { e.preventDefault(); addInput.focus(); }
          if (e.key === "Backspace" && !text.textContent) {
            e.preventDefault();
            existing.splice(i, 1);
            renderList();
            updateCount();
          }
        };
        const del = row.createSpan({ cls: "lexvoice-todo-inline-subtask-del", attr: { "aria-label": "删除" } });
        try { obsidian.setIcon(del, "x"); } catch { del.setText("×"); }
        del.onclick = (e) => {
          e.stopPropagation();
          existing.splice(i, 1);
          renderList();
          updateCount();
        };
      });
    };
    renderList();
    updateCount();
    let done = false;
    const finish = async (nextField) => {
      if (done) return;
      done = true;
      cleanup();
      this.inlineTodoEditor = null;
      if (nextField) this.inlineTodoPendingFocus = { todoId, field: nextField };
      // 过滤空项
      const cleanedSubs = existing.map((s) => String(s || "").trim()).filter(Boolean);
      const oldSubs = normalizeSedimentTodoSubtasks(raw.subtasks || raw.children || []);
      const changed = cleanedSubs.length !== oldSubs.length
        || cleanedSubs.some((s, i) => s !== oldSubs[i]);
      if (changed) await this.updateSedimentTodoCandidate(file, raw, { subtasks: cleanedSubs });
      else this.render();
    };
    const onAddKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = addInput.value.trim();
        if (val && existing.length < MAX) {
          existing.push(val);
          addInput.value = "";
          renderList();
          updateCount();
          addInput.focus();
        }
      }
      else if (e.key === "Escape") { e.preventDefault(); void finish(null); }
      else if (e.key === "Tab") { e.preventDefault(); void finish(e.shiftKey ? "due" : null); }
    };
    const onOutside = (e) => { if (!panel.contains(e.target) && e.target !== fieldEl) void finish(null); };
    const cleanup = () => {
      addInput.removeEventListener("keydown", onAddKey);
      activeDocument.removeEventListener("mousedown", onOutside, true);
    };
    addInput.addEventListener("keydown", onAddKey);
    window.setTimeout(() => activeDocument.addEventListener("mousedown", onOutside, true), 0);
    addInput.focus();
    this.inlineTodoEditor = { _anchor: fieldEl, close: () => finish(null) };
  }
  // ===================== /待办行内编辑 =====================

  async updateSedimentTodoCandidate(file, sourceTodo, patch) {
    if (!(file instanceof obsidian.TFile) || !sourceTodo) return;
    const bucket = this.getSedimentCandidateBucket(file);
    const oldId = getSedimentTodoId(sourceTodo);
    let updated = null;
    const todos = (bucket.todos || []).map((todo) => {
      if (getSedimentTodoId(todo) !== oldId) return todo;
      updated = Object.assign({}, todo, patch || {});
      updated.subtasks = normalizeSedimentTodoSubtasks(updated.subtasks || updated.children || updated.steps || updated.items);
      // 保留空字符串，让 UI 端 "加责任人 / 加时间" 占位逻辑能生效
      if (!updated.owner || /^(未指定|无|待定|TBD|N\/A|null|none)$/i.test(String(updated.owner))) updated.owner = "";
      if (!updated.due || /^(未指定|无|待定|TBD|N\/A|null|none)$/i.test(String(updated.due))) updated.due = "";
      updated.id = updated.id || getSedimentTodoId(updated);
      return updated;
    });
    if (!updated) return;
    const selectedByGroup = Object.assign({}, bucket.selectedByGroup || {});
    if (Array.isArray(selectedByGroup.todo)) {
      const nextId = getSedimentTodoId(updated);
      selectedByGroup.todo = selectedByGroup.todo.map(id => id === oldId ? nextId : id);
    }
    this.setSedimentCandidateBucket(file, { todos, selectedByGroup });
    await this.persistSedimentCandidateBucket(file);
    this.render();
  }

  // 通用：把一个标题元素变成 contenteditable 就地编辑（热词 / 人员候选改名共用）。
  // Enter / 失焦保存（仅当有变化），Esc 恢复原文。commitFn(newText) 负责落库。
  enterSedimentInlineTitleEdit(titleEl, original, commitFn) {
    if (titleEl.classList.contains("is-editing")) return;
    const before = String(original || "").trim();
    titleEl.contentEditable = "true";
    titleEl.classList.add("is-editing");
    titleEl.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = activeDocument.createRange();
      range.selectNodeContents(titleEl);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    let done = false;
    const finish = async (shouldSave) => {
      if (done) return;
      done = true;
      titleEl.contentEditable = "false";
      titleEl.classList.remove("is-editing");
      titleEl.removeEventListener("keydown", onKey);
      titleEl.removeEventListener("blur", onBlur);
      const next = (titleEl.textContent || "").trim();
      if (shouldSave && next && next !== before) {
        await commitFn(next);
      } else if (shouldSave && !next) {
        titleEl.textContent = before; // 不允许清空
      }
    };
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); void finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); titleEl.textContent = before; void finish(false); }
    };
    const onBlur = () => finish(true);
    titleEl.addEventListener("keydown", onKey);
    titleEl.addEventListener("blur", onBlur);
  }

  // 热词候选改名：在 bucket.hotwords[sectionKey] 词数组里把旧词替换成新词
  async updateSedimentHotwordTerm(file, item, newTerm) {
    if (!(file instanceof obsidian.TFile) || !item || !item.sectionKey) return;
    const next = String(newTerm || "").trim();
    if (!next) return;
    const bucket = this.getSedimentCandidateBucket(file);
    const groups = bucket.hotwords ? JSON.parse(JSON.stringify(bucket.hotwords)) : createVocabularyGroups();
    const arr = Array.isArray(groups[item.sectionKey]) ? groups[item.sectionKey] : [];
    const oldTerm = item.term;
    const idx = arr.indexOf(oldTerm);
    if (idx < 0) return;
    if (arr.includes(next) && next !== oldTerm) {
      // 改成的词已存在 → 直接删掉旧词去重
      arr.splice(idx, 1);
    } else {
      arr[idx] = next;
    }
    groups[item.sectionKey] = arr;
    // 选择集里用旧 id 的换成新 id
    const oldId = getSedimentHotwordId(item.sectionKey, oldTerm);
    const newId = getSedimentHotwordId(item.sectionKey, next);
    const selectedByGroup = Object.assign({}, bucket.selectedByGroup || {});
    if (Array.isArray(selectedByGroup.hotword)) {
      selectedByGroup.hotword = selectedByGroup.hotword.map(id => id === oldId ? newId : id);
    }
    // 记录"笔记里的原词 → 最终更正词"映射，供"加入热词库"时回写正文。
    // 连环改名 A→B→C 归并为 A→C；改回原词则取消映射。改成已存在词（上面的去重分支）同样记录——
    // 用户意图仍是"笔记里的旧写法应当是那个词"。
    const termRenames = Object.assign({}, bucket.hotwordTermRenames || {});
    let originKey = "";
    for (const k of Object.keys(termRenames)) if (termRenames[k] === oldTerm) { originKey = k; break; }
    const origin = originKey || oldTerm;
    if (origin === next) delete termRenames[origin];
    else termRenames[origin] = next;
    this.setSedimentCandidateBucket(file, { hotwords: groups, selectedByGroup, hotwordTermRenames: termRenames });
    await this.persistSedimentCandidateBucket(file);
    this.render();
  }

  // 人员候选改名：用 override 映射（按原始 id），保留原 id 不影响选择 / 去重 / 合并逻辑
  async updateSedimentPersonName(file, item, newName) {
    if (!(file instanceof obsidian.TFile) || !item) return;
    const next = String(newName || "").trim();
    if (!next) return;
    const id = getSedimentPersonId(item.sourcePath || (file && file.path) || "", item);
    if (!id) return;
    const bucket = this.getSedimentCandidateBucket(file);
    const overrides = Object.assign({}, bucket.peopleNameOverrides || {});
    const originals = Object.assign({}, bucket.peopleOriginalNames || {});
    // 首次改名时记下"笔记正文/YAML 里写着的那个名字"(此刻 item.name 尚未被任何 override 改过)，
    // 供"加入人员库"时把旧名替换成更正后的名字。后续再改名不覆盖这个原名。
    if (!Object.prototype.hasOwnProperty.call(originals, id)) {
      const orig = String(item.name || "").trim();
      if (orig) originals[id] = orig;
    }
    overrides[id] = next;
    this.setSedimentCandidateBucket(file, { peopleNameOverrides: overrides, peopleOriginalNames: originals });
    await this.persistSedimentCandidateBucket(file);
    this.render();
  }

  // 把用户在侧边栏更正的人名（旧名 → 新名）替换到笔记正文 + YAML 人员字段 + 末尾沉淀块。
  // 触发自"加入人员库"成功后；撤销由 keepPeopleSuggestions 开头的 sourceSnapshot 兜底（整篇还原）。
  async applyPeopleRenamesToNote(file, items) {
    if (!(file instanceof obsidian.TFile)) return [];
    const bucket = this.getSedimentCandidateBucket(file);
    const originals = bucket.peopleOriginalNames || {};
    const path = obsidian.normalizePath(file.path || "");
    const renames = [];
    const seen = new Set();
    for (const item of (items || [])) {
      const pid = getSedimentPersonId(item.sourcePath || path, item);
      if (!pid) continue;
      const from = String(originals[pid] || "").trim();
      const to = String(item.name || "").trim();
      // from(原名) 与 to(更正名) 不同才替换；跳过 1 字名（无词边界，易误伤其它词）。
      if (!from || !to || from === to || from.length < 2) continue;
      // 分隔符用转义 \0（人名不可能含 NUL，键无歧义）；绝不可写成裸 0x00 字节——会让 grep/rg 把整个文件当二进制截断搜索。
      const k = from + "\0" + to;
      if (seen.has(k)) continue;
      seen.add(k);
      renames.push({ from, to });
    }
    if (!renames.length) return [];
    // 长名优先替换，避免短名先替导致长名匹配不到（与 applyRoleMappingToSegments 同策略）。
    renames.sort((a, b) => b.from.length - a.from.length);
    const content = await this.app.vault.read(file);
    let next = content;
    for (const r of renames) next = next.split(r.from).join(r.to); // 纯字符串全局替换，含正文/YAML/沉淀块
    if (next !== content) {
      await this.app.vault.modify(file, next);
      try { this.plugin.refreshOutlineView(); } catch { /* intentionally empty */ }
    }
    return renames;
  }

  // 把用户在侧边栏更正的热词（笔记原词 → 更正词）替换到笔记正文（含分段转写/沉淀块）。
  // 触发自"加入热词库"成功后，只回写本次真正入库的词；撤销由提交处的 sourceSnapshot 兜底（整篇还原）。
  async applyHotwordRenamesToNote(file, items) {
    if (!(file instanceof obsidian.TFile)) return [];
    const bucket = this.getSedimentCandidateBucket(file);
    const renameMap = bucket.hotwordTermRenames || {};
    const committedTerms = new Set((items || []).map(it => String((it && it.term) || "").trim()).filter(Boolean));
    const renames = [];
    for (const [rawFrom, rawTo] of Object.entries(renameMap)) {
      const from = String(rawFrom || "").trim();
      const to = String(rawTo || "").trim();
      if (!committedTerms.has(to)) continue;
      // 跳过 1 字词（无词边界，易误伤其它词）；from === to 不可能出现（updateSedimentHotwordTerm 已取消该映射）。
      if (!from || !to || from === to || from.length < 2) continue;
      renames.push({ from, to });
    }
    if (!renames.length) return [];
    // 长词优先替换，避免短词先替导致长词匹配不到（与人名回写同策略）。
    renames.sort((a, b) => b.from.length - a.from.length);
    const content = await this.app.vault.read(file);
    let next = content;
    for (const r of renames) next = next.split(r.from).join(r.to); // 纯字符串全局替换，含正文/YAML/沉淀块
    if (next !== content) {
      await this.app.vault.modify(file, next);
      try { this.plugin.refreshOutlineView(); } catch { /* intentionally empty */ }
    }
    // 已消费的映射清掉，避免下次提交对同一篇重复替换
    const remaining = Object.assign({}, renameMap);
    for (const r of renames) delete remaining[r.from];
    this.setSedimentCandidateBucket(file, { hotwordTermRenames: remaining });
    return renames;
  }

  openSedimentTodoEditModal(file, todo, focus = "task") {
    if (!(file instanceof obsidian.TFile) || !todo) return;
    const modal = new obsidian.Modal(this.app);
    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.empty();
      contentEl.addClass("lexvoice-sediment-rescan-modal");
      contentEl.createEl("h3", { text: "编辑待办" });
      const form = contentEl.createDiv({ cls: "lexvoice-sediment-todo-edit" });

      const makeField = (label, value, multi = false) => {
        const row = form.createDiv({ cls: "lexvoice-sediment-todo-edit-row" });
        row.createDiv({ cls: "lexvoice-sediment-todo-edit-label", text: label });
        const input = multi
          ? row.createEl("textarea", { cls: "lexvoice-sediment-todo-edit-control", attr: { rows: "4" } })
          : row.createEl("input", { cls: "lexvoice-sediment-todo-edit-control", attr: { type: "text" } });
        input.value = value || "";
        return input;
      };

      const taskInput = makeField("事项", todo.task || todo.title || "");
      const ownerInput = makeField("责任人", todo.owner && todo.owner !== "未指定" ? todo.owner : "");
      const dueInput = makeField("时间", todo.due && todo.due !== "未指定" ? todo.due : "");
      const subtasksInput = makeField("子任务", normalizeSedimentTodoSubtasks(todo.subtasks || todo.children || todo.steps || todo.items).join("\n"), true);

      const actions = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-actions" });
      const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
      const save = actions.createEl("button", { text: "保存", cls: "mod-cta", attr: { type: "button" } });
      cancel.onclick = () => modal.close();
      save.onclick = async () => {
        const task = sanitizeSedimentText(taskInput.value, 160);
        if (!task) {
          new obsidian.Notice("待办事项不能为空");
          return;
        }
        save.disabled = true;
        await this.updateSedimentTodoCandidate(file, todo, {
          task,
          // 空值保留空字符串，由 UI "加责任人 / 加时间" 占位渲染
          owner: sanitizeSedimentText(ownerInput.value, 40) || "",
          due: sanitizeSedimentText(dueInput.value, 40) || "",
          subtasks: normalizeSedimentTodoSubtasks(subtasksInput.value),
        });
        modal.close();
      };

      const focusTarget = focus === "owner" ? ownerInput : focus === "due" ? dueInput : focus === "subtasks" ? subtasksInput : taskInput;
      window.setTimeout(() => focusTarget.focus(), 0);
    };
    modal.open();
  }

  /**
   * 待办字段 inline popover（替代全屏 modal）
   * 设计参考：lexvoice-design-baseline-v2.html #assignee-1
   * - owner: 搜索 + 人员候选 + 自定义
   * - due:   快捷日期按钮 + 自定义日期 + 清除
   * - subtasks: inline 列表编辑
   */
  openSedimentTodoFieldPopover(file, todo, field, anchorEl) {
    if (!(file instanceof obsidian.TFile) || !todo || !anchorEl) return;
    // 关掉已有同类 popover
    if (this._activeTodoFieldPopover) {
      try { this._activeTodoFieldPopover.remove(); } catch { /* intentionally empty */ }
      this._activeTodoFieldPopover = null;
    }
    const pop = activeDocument.body.createDiv({ cls: `lexvoice-todo-popover is-${field}` });
    this._activeTodoFieldPopover = pop;

    // 定位：贴近 anchor，向下展开，必要时翻转
    const rect = anchorEl.getBoundingClientRect();
    pop.setCssStyles({ position: "fixed", maxWidth: "320px" });
    pop.style.left = `${Math.max(8, rect.left)}px`;
    pop.style.top = `${rect.bottom + 6}px`;

    // 渲染对应内容
    if (field === "owner") void this.renderTodoOwnerPopover(pop, file, todo);
    else if (field === "due") this.renderTodoDuePopover(pop, file, todo);
    else if (field === "subtasks") this.renderTodoSubtasksPopover(pop, file, todo);

    // 翻转：如果浮层超出视口底部，向上翻
    window.setTimeout(() => {
      const pr = pop.getBoundingClientRect();
      const vh = window.innerHeight;
      if (pr.bottom > vh - 8) {
        pop.style.top = `${Math.max(8, rect.top - pr.height - 6)}px`;
      }
      if (pr.right > window.innerWidth - 8) {
        pop.style.left = `${Math.max(8, window.innerWidth - pr.width - 12)}px`;
      }
    }, 0);

    // 点外面 / Escape 关闭
    const close = () => {
      try { pop.remove(); } catch { /* intentionally empty */ }
      if (this._activeTodoFieldPopover === pop) this._activeTodoFieldPopover = null;
      activeDocument.removeEventListener("mousedown", onDocDown, true);
      activeDocument.removeEventListener("keydown", onKeyDown, true);
    };
    const onDocDown = (e) => {
      if (!pop.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) close();
    };
    const onKeyDown = (e) => { if (e.key === "Escape") close(); };
    window.setTimeout(() => {
      activeDocument.addEventListener("mousedown", onDocDown, true);
      activeDocument.addEventListener("keydown", onKeyDown, true);
    }, 0);
    pop._lexvoiceClose = close;
  }

  async renderTodoOwnerPopover(pop, file, todo) {
    const search = pop.createEl("input", {
      cls: "lexvoice-todo-popover-search",
      attr: { type: "text", placeholder: "搜索或输入新名字…" },
    });
    const list = pop.createDiv({ cls: "lexvoice-todo-popover-list" });
    list.createDiv({ cls: "lexvoice-todo-popover-loading", text: "加载人员…" });

    let people = [];
    try {
      people = await loadPeopleDirectory(this) || [];
    } catch { /* intentionally empty */ }

    const renderRows = (filter) => {
      list.empty();
      const q = (filter || "").trim().toLowerCase();
      const filtered = !q ? people : people.filter(p => {
        const txt = `${p.name || ""} ${p.aliases || ""} ${p.role || ""} ${p.org || ""}`.toLowerCase();
        return txt.includes(q);
      });
      if (!filtered.length && !q) {
        list.createDiv({ cls: "lexvoice-todo-popover-empty", text: "人员库为空，直接输入新名字 + 回车" });
        return;
      }
      // 当前选中
      if (todo.owner) {
        list.createDiv({ cls: "lexvoice-todo-popover-section", text: "当前" });
        const row = list.createDiv({ cls: "lexvoice-todo-popover-item is-current" });
        row.createSpan({ cls: "lexvoice-todo-popover-item-name", text: todo.owner });
        const clear = row.createSpan({ cls: "lexvoice-todo-popover-item-clear", text: "清除" });
        clear.onclick = async (e) => {
          e.stopPropagation();
          await this.updateSedimentTodoCandidate(file, todo, { owner: "" });
          if (pop._lexvoiceClose) pop._lexvoiceClose();
        };
      }
      if (filtered.length) {
        list.createDiv({ cls: "lexvoice-todo-popover-section", text: q ? "匹配" : "人员库" });
        for (const p of filtered.slice(0, 12)) {
          const row = list.createDiv({ cls: "lexvoice-todo-popover-item" });
          row.createSpan({ cls: "lexvoice-todo-popover-item-name", text: p.name || "未命名" });
          if (p.role || p.org) {
            row.createSpan({
              cls: "lexvoice-todo-popover-item-meta",
              text: [p.role, p.org].filter(Boolean).join(" · "),
            });
          }
          row.onclick = async () => {
            await this.updateSedimentTodoCandidate(file, todo, { owner: p.name || "" });
            if (pop._lexvoiceClose) pop._lexvoiceClose();
          };
        }
      }
      // 当 search 有值且没匹配任何人员 → 显示"新建"项
      if (q && !filtered.some(p => (p.name || "").toLowerCase() === q)) {
        list.createDiv({ cls: "lexvoice-todo-popover-section", text: "新名字" });
        const row = list.createDiv({ cls: "lexvoice-todo-popover-item is-new" });
        row.createSpan({ cls: "lexvoice-todo-popover-item-name", text: `+ "${filter.trim()}"` });
        row.onclick = async () => {
          await this.updateSedimentTodoCandidate(file, todo, { owner: filter.trim() });
          if (pop._lexvoiceClose) pop._lexvoiceClose();
        };
      }
    };
    renderRows("");

    search.oninput = () => renderRows(search.value);
    search.onkeydown = async (e) => {
      if (e.key === "Enter" && search.value.trim()) {
        e.preventDefault();
        await this.updateSedimentTodoCandidate(file, todo, { owner: search.value.trim() });
        if (pop._lexvoiceClose) pop._lexvoiceClose();
      }
    };
    window.setTimeout(() => search.focus(), 30);
  }

  renderTodoDuePopover(pop, file, todo) {
    pop.createDiv({ cls: "lexvoice-todo-popover-section", text: "快捷" });
    const presetWrap = pop.createDiv({ cls: "lexvoice-todo-popover-presets" });
    const moment = window.moment;
    const presets = moment ? [
      { label: "今天", value: moment().format("YYYY-MM-DD") },
      { label: "明天", value: moment().add(1, "day").format("YYYY-MM-DD") },
      { label: "本周末", value: moment().endOf("week").format("YYYY-MM-DD") },
      { label: "下周", value: moment().add(1, "week").format("YYYY-MM-DD") },
      { label: "下月", value: moment().add(1, "month").format("YYYY-MM-DD") },
    ] : [];
    for (const p of presets) {
      const btn = presetWrap.createEl("button", {
        cls: "lexvoice-todo-popover-preset",
        text: p.label,
        attr: { type: "button" },
      });
      btn.onclick = async () => {
        await this.updateSedimentTodoCandidate(file, todo, { due: p.value });
        if (pop._lexvoiceClose) pop._lexvoiceClose();
      };
    }
    pop.createDiv({ cls: "lexvoice-todo-popover-divider" });
    pop.createDiv({ cls: "lexvoice-todo-popover-section", text: "自定义" });
    const dateInput = pop.createEl("input", {
      cls: "lexvoice-todo-popover-date",
      attr: { type: "date" },
    });
    const currentISO = todo.due && /^\d{4}-\d{2}-\d{2}/.test(todo.due) ? todo.due.slice(0, 10) : "";
    dateInput.value = currentISO;
    dateInput.onchange = async () => {
      if (dateInput.value) {
        await this.updateSedimentTodoCandidate(file, todo, { due: dateInput.value });
        if (pop._lexvoiceClose) pop._lexvoiceClose();
      }
    };
    if (todo.due) {
      const clear = pop.createEl("button", {
        cls: "lexvoice-todo-popover-clear",
        text: "清除时间",
        attr: { type: "button" },
      });
      clear.onclick = async () => {
        await this.updateSedimentTodoCandidate(file, todo, { due: "" });
        if (pop._lexvoiceClose) pop._lexvoiceClose();
      };
    }
  }

  renderTodoSubtasksPopover(pop, file, todo) {
    pop.createDiv({ cls: "lexvoice-todo-popover-section", text: "子任务" });
    const existing = normalizeSedimentTodoSubtasks(todo.subtasks || todo.children || []);
    const list = pop.createDiv({ cls: "lexvoice-todo-popover-subtasks" });
    const renderList = () => {
      list.empty();
      existing.forEach((sub, i) => {
        const row = list.createDiv({ cls: "lexvoice-todo-popover-subtask-row" });
        const input = row.createEl("input", {
          cls: "lexvoice-todo-popover-subtask-input",
          attr: { type: "text", value: sub },
        });
        input.value = sub;
        input.oninput = () => { existing[i] = input.value; };
        const del = row.createEl("button", {
          cls: "lexvoice-todo-popover-subtask-del",
          attr: { type: "button", "aria-label": "删除子任务" },
        });
        try { obsidian.setIcon(del, "x"); } catch { del.setText("×"); }
        del.onclick = (e) => {
          e.stopPropagation();
          existing.splice(i, 1);
          renderList();
        };
      });
    };
    renderList();
    const addRow = pop.createDiv({ cls: "lexvoice-todo-popover-subtask-add" });
    const addInput = addRow.createEl("input", {
      cls: "lexvoice-todo-popover-subtask-input",
      attr: { type: "text", placeholder: "+ 添加子任务，回车确认" },
    });
    addInput.onkeydown = (e) => {
      if (e.key === "Enter" && addInput.value.trim()) {
        e.preventDefault();
        existing.push(addInput.value.trim());
        addInput.value = "";
        renderList();
        addInput.focus();
      }
    };
    const actions = pop.createDiv({ cls: "lexvoice-todo-popover-actions" });
    const save = actions.createEl("button", {
      cls: "lexvoice-todo-popover-save mod-cta",
      text: "保存",
      attr: { type: "button" },
    });
    save.onclick = async () => {
      const cleaned = existing.map(s => sanitizeSedimentText(s, 100)).filter(Boolean);
      await this.updateSedimentTodoCandidate(file, todo, { subtasks: cleaned });
      if (pop._lexvoiceClose) pop._lexvoiceClose();
    };
    window.setTimeout(() => addInput.focus(), 30);
  }

  renderSedimentEmptyList(parent, text) {
    const empty = parent.createDiv({ cls: "lexvoice-sediment-empty-line" });
    empty.setText(text || "暂无待加入内容");
  }

  renderSedimentReviewGroup(parent, file, state, groupKey) {
    const review = this.getSedimentGroupReview(file, groupKey);
    const items = review && Array.isArray(review.items) ? review.items : [];
    const canRollback = !!(review && review.restore);
    // 顶部说明：只有真有处理记录可看的时候才提"N 条记录可回看"
    const note = parent.createDiv({ cls: "lexvoice-sediment-review-note" });
    note.setText(items.length ? `本组已处理完毕 · ${items.length} 条记录可回看` : "本组已处理完毕");
    // 有记录才画列表；空记录不再硬塞"本组无处理记录"占位（会让用户困惑）
    if (items.length) {
      const list = parent.createDiv({ cls: "lexvoice-sediment-list" });
      for (const item of items.slice(0, 10)) {
        const row = list.createDiv({ cls: "lexvoice-sediment-list-item lexvoice-sediment-review-item" });
        const badge = row.createSpan({ cls: `lexvoice-sediment-review-badge is-${item.status || "done"}`, text: item.statusText || "已处理" });
        badge.setAttr("title", item.statusText || "已处理");
        const content = row.createDiv({ cls: "lexvoice-sediment-item-content" });
        const top = content.createDiv({ cls: "lexvoice-sediment-item-top" });
        top.createDiv({ cls: "lexvoice-sediment-item-title", text: item.title || "" });
        if (item.sub) content.createDiv({ cls: "lexvoice-sediment-item-sub", text: item.sub });
        if (item.meta) content.createDiv({ cls: "lexvoice-sediment-item-meta", text: item.meta });
      }
      if (items.length > 10) list.createDiv({ cls: "lexvoice-sediment-more", text: `还有 ${items.length - 10} 条处理记录` });
    }
    // "重新处理本组"按钮只有当 review 真有 restore 快照可以单组回滚时才出现 —— 这种情况下点击只影响本组。
    // 没有 restore 时（旧版本 / 无快照）不再画这个按钮，避免和顶部全局"重扫"重复并误导用户。
    if (canRollback) {
      const footer = parent.createDiv({ cls: "lexvoice-sediment-footer" });
      const reset = footer.createEl("button", { text: "重新处理本组", cls: "lexvoice-sediment-text-button", attr: { type: "button" } });
      reset.onclick = async () => {
        reset.disabled = true;
        try {
          await this.reprocessSedimentGroup(file, groupKey);
        } finally {
          reset.disabled = false;
        }
      };
    }
  }

  renderSedimentFooter(parent, group, count, actions) {
    const cfg = Object.assign({}, SEDIMENT_GROUP_CONFIG[(group && group.key) || "person"] || SEDIMENT_GROUP_CONFIG.person, group || {});
    const footer = parent.createDiv({ cls: "lexvoice-sediment-footer" });
    const secondary = footer.createEl("button", { text: actions.secondaryText || "忽略未选", cls: "lexvoice-sediment-text-button", attr: { type: "button" } });
    secondary.disabled = actions.secondaryDisabled !== undefined ? !!actions.secondaryDisabled : !count;
    if (actions.secondaryTitle) secondary.setAttr("title", actions.secondaryTitle);
    secondary.onclick = () => {
      if (secondary.disabled || typeof actions.onSecondary !== "function") return;
      actions.onSecondary();
    };
    const primaryText = typeof cfg.primaryButtonText === "function" ? cfg.primaryButtonText(count) : `加入${cfg.dest}（${count}）`;
    const primary = footer.createEl("button", { text: primaryText, cls: "lexvoice-sediment-button is-primary", attr: { type: "button" } });
    primary.disabled = !count;
    if (!count) primary.setAttr("title", "请至少选择一条");
    primary.onclick = () => {
      if (!count || typeof actions.onPrimary !== "function") return;
      actions.onPrimary();
    };
  }

  renderSedimentPeopleItem(parent, file, item) {
    const row = parent.createDiv({ cls: "lexvoice-sediment-list-item is-person-candidate" });
    const evidence = item.evidence || item.reason || item.note || "";
    if (evidence) row.setAttr("title", `依据：${evidence}`);
    const icon = row.createDiv({ cls: "lexvoice-sediment-item-icon" });
    try { obsidian.setIcon(icon, "user-round"); } catch { icon.setText("人"); }
    const content = row.createDiv({ cls: "lexvoice-sediment-item-content" });
    const top = content.createDiv({ cls: "lexvoice-sediment-item-top" });
    // 人名可点击就地改名（ASR 转错的名字直接改）
    const nameEl = top.createDiv({
      cls: "lexvoice-sediment-item-title lexvoice-sediment-editable-title",
      text: item.name || "未命名人员",
      attr: { role: "button", tabindex: "0", title: "点击修改" },
    });
    nameEl.onclick = (evt) => {
      evt.stopPropagation();
      this.enterSedimentInlineTitleEdit(nameEl, item.name || "", (next) => this.updateSedimentPersonName(file, item, next));
    };
    const actions = top.createDiv({ cls: "lexvoice-sediment-actions" });
    actions.createEl("button", { text: "留下", cls: "lexvoice-sediment-action is-primary", attr: { type: "button" } }).onclick = () => this.keepPeopleSuggestions(file, [item]);
    actions.createEl("button", { text: "合并", cls: "lexvoice-sediment-action", attr: { type: "button" } }).onclick = () => {
      new PeopleDirectorySuggestionModal(this.app, this.plugin, file, [item], { fromCache: true, cachedCount: 1 }).open();
    };
    actions.createEl("button", { text: "忽略", cls: "lexvoice-sediment-action is-muted", attr: { type: "button" } }).onclick = () => this.ignorePeopleSuggestions([item], file);
    const org = item.org || item.organization || "";
    const aliases = item.aliases && item.aliases.length ? item.aliases.join("、") : "";
    const meta = [item.role || "", org, aliases].filter(Boolean).join(" · ");
    content.createDiv({ cls: "lexvoice-sediment-item-meta", text: meta || "身份待补充" });
  }

  renderSedimentPrompt(parent, opts) {
    const box = parent.createDiv({ cls: "lexvoice-sediment-prompt" });
    const icon = box.createDiv({ cls: "lexvoice-sediment-prompt-icon" });
    try { obsidian.setIcon(icon, opts.icon || "sparkles"); } catch { /* intentionally empty */ }
    if (opts.subtitle) box.createDiv({ cls: "lexvoice-sediment-prompt-subtitle", text: opts.subtitle });
    if (opts.title) box.createDiv({ cls: "lexvoice-sediment-prompt-title", text: opts.title });
    if (opts.desc) box.createDiv({ cls: "lexvoice-sediment-prompt-desc", text: opts.desc });
    const actions = box.createDiv({ cls: "lexvoice-sediment-prompt-actions" });
    if (opts.secondaryText && opts.onSecondary) {
      actions.createEl("button", { text: opts.secondaryText, cls: "lexvoice-sediment-button is-secondary", attr: { type: "button" } }).onclick = opts.onSecondary;
    }
    if (opts.primaryText && opts.onPrimary) {
      actions.createEl("button", { text: opts.primaryText, cls: "lexvoice-sediment-button is-primary", attr: { type: "button" } }).onclick = opts.onPrimary;
    }
    if (opts.smallText) box.createDiv({ cls: "lexvoice-sediment-prompt-small", text: opts.smallText });
    if (opts.extraActions && opts.extraActions.length) {
      const extra = box.createDiv({ cls: "lexvoice-sediment-extra-actions" });
      for (const item of opts.extraActions) {
        extra.createEl("button", { text: item.text, cls: "lexvoice-sediment-text-button", attr: { type: "button" } }).onclick = item.action;
      }
    }
  }

  renderDepositGroup(parent, opts) {
    const group = parent.createDiv({ cls: `lexvoice-deposit-group ${opts.cls || ""}` });
    const head = group.createDiv({ cls: "lexvoice-deposit-group-head" });
    const title = head.createDiv({ cls: "lexvoice-deposit-group-title" });
    title.createSpan({ text: opts.label || "" });
    title.createSpan({ cls: "lexvoice-deposit-count", text: `${opts.count || 0} ${opts.status || ""}`.trim() });
    const actions = head.createDiv({ cls: "lexvoice-deposit-group-actions" });
    if (opts.primaryText && opts.onPrimary) actions.createEl("button", { text: opts.primaryText }).onclick = opts.onPrimary;
    if (opts.secondaryText && opts.onSecondary) actions.createEl("button", { text: opts.secondaryText }).onclick = opts.onSecondary;
    if (opts.moreActions && opts.moreActions.length) {
      actions.createEl("button", { text: "..." }).onclick = (evt) => {
        const menu = new obsidian.Menu();
        for (const item of opts.moreActions) menu.addItem(mi => mi.setTitle(item.text).onClick(item.action));
        menu.showAtMouseEvent(evt);
      };
    }
    if (opts.desc) group.createDiv({ cls: "lexvoice-deposit-group-desc", text: opts.desc });
    const body = group.createDiv({ cls: "lexvoice-deposit-group-body" });
    if (opts.renderBody) opts.renderBody(body);
  }

  renderPeopleSuggestionCard(parent, file, item) {
    const card = parent.createDiv({ cls: "lexvoice-deposit-candidate-card is-person" });
    const top = card.createDiv({ cls: "lexvoice-deposit-candidate-top" });
    top.createDiv({ cls: "lexvoice-deposit-candidate-title", text: item.name || "未命名人员" });
    if (item.matchPath) top.createDiv({ cls: "lexvoice-deposit-badge", text: "可合并" });
    const meta = card.createDiv({ cls: "lexvoice-deposit-candidate-meta" });
    meta.createDiv({ text: `角色：${item.role || "待补充"}` });
    meta.createDiv({ text: `组织：${item.org || item.organization || "待补充"}` });
    if (item.aliases && item.aliases.length) meta.createDiv({ text: `常用称呼：${item.aliases.join("、")}` });
    card.createDiv({ cls: "lexvoice-deposit-candidate-source", text: `来源：${item.sourceBasename || file.basename}` });
    const evidence = item.evidence || item.reason || item.note || "";
    if (evidence) card.createDiv({ cls: "lexvoice-deposit-candidate-evidence", text: `依据：${evidence}` });
    const actions = card.createDiv({ cls: "lexvoice-deposit-candidate-actions" });
    actions.createEl("button", { text: "留下" }).onclick = () => this.keepPeopleSuggestions(file, [item]);
    actions.createEl("button", { text: "合并到已有人员" }).onclick = () => {
      new PeopleDirectorySuggestionModal(this.app, this.plugin, file, [item], { fromCache: true, cachedCount: 1 }).open();
    };
    actions.createEl("button", { text: "忽略" }).onclick = () => this.ignorePeopleSuggestions([item], file);
  }

  requestSedimentExtraction(file, needsConfirm) {
    if (needsConfirm) {
      this.confirmSedimentRescan(file);
      return;
    }
    void this.extractSedimentForFile(file);
  }

  getSedimentPendingCandidateCount(file) {
    const state = this.getSedimentPanelState(file);
    return (state.groups || []).reduce((sum, group) => sum + Math.max(0, Number(group.pending) || 0), 0);
  }

  confirmSedimentRescan(file) {
    const modal = new obsidian.Modal(this.app);
    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.addClass("lexvoice-sediment-rescan-modal");
      const head = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-head" });
      const icon = head.createDiv({ cls: "lexvoice-sediment-confirm-icon" });
      try { obsidian.setIcon(icon, "refresh-cw"); } catch { /* intentionally empty */ }
      head.createEl("h3", { text: "重新扫描本篇？" });
      const pendingCount = this.getSedimentPendingCandidateCount(file);
      const list = contentEl.createEl("ul", { cls: "lexvoice-sediment-confirm-list" });
      [
        ["check", "已入库内容不受影响"],
        ["check", "已忽略的不会再次出现"],
        ["alert-triangle", `当前 ${pendingCount} 条未确认候选会被覆盖`],
      ].forEach(([iconName, text]) => {
        const li = list.createEl("li");
        try { obsidian.setIcon(li.createSpan({ cls: "lexvoice-sediment-confirm-list-icon" }), iconName); } catch { /* intentionally empty */ }
        li.createSpan({ text });
      });
      const note = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-note" });
      note.setText("重新扫描会重新生成四组候选，已经加入库里的内容不会自动删除。");
      const actions = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-actions" });
      const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
      const confirm = actions.createEl("button", { text: "重新扫描", cls: "mod-cta", attr: { type: "button" } });
      cancel.onclick = () => modal.close();
      confirm.onclick = async () => {
        confirm.disabled = true;
        modal.close();
        await this.extractSedimentForFile(file);
      };
    };
    modal.open();
  }

  showSedimentToast(message, opts = {}) {
    const root = this.containerEl && this.containerEl.children && this.containerEl.children[1];
    if (!root) return;
    const old = root.querySelector(".lexvoice-sediment-toast");
    if (old) old.remove();
    if (this.sedimentToastTimer) {
      window.clearTimeout(this.sedimentToastTimer);
      this.sedimentToastTimer = 0;
    }
    const toast = root.createDiv({ cls: "lexvoice-sediment-toast" + (opts.variant ? ` is-${opts.variant}` : "") });
    const icon = toast.createDiv({ cls: "lexvoice-sediment-toast-icon" });
    try { obsidian.setIcon(icon, opts.icon || "check"); } catch { /* intentionally empty */ }
    toast.createDiv({ cls: "lexvoice-sediment-toast-message", text: message || "" });
    const actions = Array.isArray(opts.actions) ? opts.actions : (opts.actionText && typeof opts.onAction === "function" ? [{ text: opts.actionText, action: opts.onAction }] : []);
    for (const item of actions) {
      if (!item || !item.text || typeof item.action !== "function") continue;
      const action = toast.createEl("button", { text: item.text, cls: "lexvoice-sediment-toast-action", attr: { type: "button" } });
      action.onclick = () => item.action();
    }
    this.sedimentToastTimer = window.setTimeout(() => {
      toast.remove();
      this.sedimentToastTimer = 0;
    }, opts.duration || 5000);
  }

  async extractVocabularyForFile(file) {
    try {
      const markdown = await this.app.vault.cachedRead(file);
      const terms = await this.plugin.extractVocabularyFromMarkdown(file, markdown);
      this.plugin.markKnowledgeExtractionSource("vocabulary", file);
      await this.plugin.saveSettings();
      new obsidian.Notice(`ASR 热词提取完成：${terms.length} 个候选词`);
      this.render();
    } catch (e) {
      console.error("[LexVoice] extract vocabulary from current note failed", e);
      new obsidian.Notice(`提取失败：${(e && e.message) || e}`, 8000);
    }
  }

  async extractPeopleSuggestionsForFile(file) {
    try {
      const markdown = await this.app.vault.cachedRead(file);
      const items = await generatePeopleDirectorySuggestions(this.plugin, file, markdown);
      const added = this.plugin.cachePeopleDirectorySuggestions(file, items);
      this.plugin.markKnowledgeExtractionSource("people", file);
      await this.plugin.saveSettings();
      new obsidian.Notice(added ? `人员建议已生成：${added} 条待确认` : "没有识别到新的人员建议");
      this.render();
    } catch (e) {
      console.error("[LexVoice] extract people from current note failed", e);
      new obsidian.Notice(`人员建议提取失败：${(e && e.message) || e}`, 8000);
    }
  }

  getSedimentObjectsFromBucket(file) {
    const bucket = this.getSedimentCandidateBucket(file);
    return {
      people: bucket.people || [],
      todos: bucket.todos || [],
      learningCards: bucket.cards || [],
      hotwords: bucket.hotwords || createVocabularyGroups(),
    };
  }

  async persistSedimentCandidateBucket(file) {
    try {
      await upsertSedimentPreExtractionBlockInFile(this.plugin, file, this.getSedimentObjectsFromBucket(file));
      this.notePanelCacheKey = "";
      return true;
    } catch (e) {
      console.warn("[LexVoice] persist pre-extracted sediment failed", e);
      new obsidian.Notice(`沉淀状态写回失败：${(e && e.message) || e}`, 8000);
      return false;
    }
  }

  async extractSedimentForFile(file) {
    const token = ++this.sedimentScanToken;
    try {
      this.setSedimentCandidateBucket(file, { scanning: true, scanStartedAt: new Date().toISOString() });
      this.render();
      const markdown = await this.app.vault.cachedRead(file);
      // 扫描中状态已经由全屏 prompt（带 scan-line 图标 + 进度条 + 实时计数）表达，
      // 不再额外弹底部 toast，避免与上方主面板视觉重复
      const objects = await generateSedimentObjects(this.plugin, file, markdown);
      if (token !== this.sedimentScanToken) return;
      const path = obsidian.normalizePath(file.path || "");
      const normalized = withSedimentCandidateIds(objects, path, file.basename);
      this.setSedimentCandidateBucket(file, {
        people: normalized.people || [],
        todos: normalized.todos || [],
        cards: normalized.learningCards || [],
        hotwords: normalized.hotwords || createVocabularyGroups(),
        scannedAt: new Date().toISOString(),
        initialCounts: this.getSedimentInitialCountsFromObjects(normalized),
        doneGroups: [],
        selectedByGroup: {},
        decisionLogByGroup: {},
        transitionGroup: "",
        scanning: false,
        scanStartedAt: "",
      });
      await this.persistSedimentCandidateBucket(file);
      const nextState = this.getSedimentPanelState(file);
      const firstPending = this.findSedimentNextPendingGroup(nextState.groups);
      this.sedimentGroup = firstPending ? firstPending.key : "person";
      this.sedimentSwitcherOpen = false;
      this.render();
      this.showSedimentToast(`扫描完成：人员 ${(objects.people || []).length}，待办 ${(objects.todos || []).length}，学习 ${(objects.learningCards || []).length}，热词 ${countVocabularyGroups(objects.hotwords)}`, {
        icon: "check",
      });
    } catch (e) {
      this.setSedimentCandidateBucket(file, { scanning: false, scanStartedAt: "" });
      this.render();
      console.error("[LexVoice] extract sediment from current note failed", e);
      new obsidian.Notice(`本篇扫描失败：${(e && e.message) || e}`, 8000);
    }
  }

  cancelSedimentExtraction(file) {
    this.sedimentScanToken++;
    this.setSedimentCandidateBucket(file, { scanning: false, scanStartedAt: "" });
    this.render();
    this.showSedimentToast("已取消本次扫描", { icon: "circle-minus", variant: "muted" });
  }

  cloneSedimentBucket(file) {
    try {
      return JSON.parse(JSON.stringify(this.getSedimentCandidateBucket(file) || {}));
    } catch {
      return Object.assign({}, this.getSedimentCandidateBucket(file) || {});
    }
  }

  setSedimentDecisionLog(file, groupKey, log) {
    const bucket = this.getSedimentCandidateBucket(file);
    const decisionLogByGroup = Object.assign({}, bucket.decisionLogByGroup || {});
    if (log) decisionLogByGroup[groupKey] = log;
    else delete decisionLogByGroup[groupKey];
    this.setSedimentCandidateBucket(file, { decisionLogByGroup });
  }

  appendSedimentDecisionItems(file, groupKey, rawItems, status, statusText, state) {
    const bucket = this.getSedimentCandidateBucket(file);
    const logs = Object.assign({}, bucket.decisionLogByGroup || {});
    const current = logs[groupKey] || {
      groupKey,
      completedAt: "",
      restore: {},
      selectedIds: [],
      items: [],
    };
    if (!current.restore || !Object.keys(current.restore).length) {
      const snapshotState = state || this.getSedimentPanelState(file);
      if (groupKey === "person") current.restore = { people: JSON.parse(JSON.stringify(snapshotState.currentPeople || [])) };
      else current.restore = (this.buildSedimentDecisionLog(snapshotState, groupKey, new Set()).restore || {});
    }
    const sourcePath = file instanceof obsidian.TFile ? obsidian.normalizePath(file.path || "") : "";
    for (const raw of rawItems || []) {
      if (!raw) continue;
      const id = groupKey === "person" ? getSedimentPersonId(raw.sourcePath || sourcePath, raw) : String(raw.id || "");
      current.items = (current.items || []).filter(item => item.id !== id);
      current.items.push({
        id,
        title: raw.name || raw.title || raw.task || "",
        sub: raw.role || raw.type || "",
        meta: raw.org || raw.organization || raw.note || raw.summary || "",
        status,
        statusText,
      });
      if (status === "kept" && !current.selectedIds.includes(id)) current.selectedIds.push(id);
    }
    current.completedAt = current.completedAt || new Date().toISOString();
    logs[groupKey] = current;
    this.setSedimentCandidateBucket(file, { decisionLogByGroup: logs });
  }

  buildSedimentDecisionLog(state, groupKey, selectedIds, actionLabel) {
    const selected = new Set(selectedIds || []);
    const displayItems = this.getSedimentDisplayItems(state, groupKey);
    const restore = {};
    if (groupKey === "person") restore.people = JSON.parse(JSON.stringify(state.currentPeople || []));
    else if (groupKey === "todo") restore.todos = JSON.parse(JSON.stringify((state.bucket && state.bucket.todos) || []));
    else if (groupKey === "card") restore.cards = JSON.parse(JSON.stringify((state.bucket && state.bucket.cards) || []));
    else if (groupKey === "hotword") restore.hotwords = JSON.parse(JSON.stringify((state.bucket && state.bucket.hotwords) || createVocabularyGroups()));
    return {
      groupKey,
      completedAt: new Date().toISOString(),
      restore,
      selectedIds: Array.from(selected),
      items: displayItems.map(item => {
        const kept = selected.has(item.id);
        return {
          id: item.id,
          title: item.title || "",
          sub: item.sub || "",
          meta: item.meta || "",
          status: kept ? "kept" : "ignored",
          statusText: kept ? (actionLabel || "已加入") : "已忽略",
        };
      }),
    };
  }

  buildVocabularyGroupsFromHotwordItems(items) {
    const groups = createVocabularyGroups();
    for (const item of items || []) {
      const sectionKey = item && (item.sectionKey || (item.raw && item.raw.sectionKey));
      const term = item && (item.term || item.title || (item.raw && item.raw.term));
      if (sectionKey && groups[sectionKey] && term && !groups[sectionKey].includes(term)) groups[sectionKey].push(term);
    }
    return groups;
  }

  async restoreSedimentUndo(undo) {
    if (!undo) return;
    try {
      for (const entry of undo.entries || []) {
        const file = entry && entry.path ? this.app.vault.getAbstractFileByPath(entry.path) : entry.file;
        if (!(file instanceof obsidian.TFile)) continue;
        if (entry.created) await trashLexVoiceFile(this.app, file);
        else await this.app.vault.modify(file, entry.previousContent || "");
      }
      if (undo.vocabulary) {
        const v = undo.vocabulary;
        if (v.path) {
          const file = this.app.vault.getAbstractFileByPath(v.path);
          if (v.existed && file instanceof obsidian.TFile) await this.app.vault.modify(file, v.previousContent || "");
          else if (!v.existed && file instanceof obsidian.TFile) await trashLexVoiceFile(this.app, file);
        } else {
          this.plugin.settings.customVocabulary = v.previousCustomVocabulary || "";
          await this.plugin.saveSettings();
        }
      }
      if (undo.sourceSnapshot && undo.sourceSnapshot.path) {
        const source = this.app.vault.getAbstractFileByPath(undo.sourceSnapshot.path);
        if (source instanceof obsidian.TFile) await this.app.vault.modify(source, undo.sourceSnapshot.content || "");
      }
      if (undo.bucketBefore && undo.filePath) {
        const file = this.app.vault.getAbstractFileByPath(undo.filePath);
        if (file instanceof obsidian.TFile) {
          this.sedimentCandidatesByPath[undo.filePath] = undo.bucketBefore;
          await this.persistSedimentCandidateBucket(file);
        }
      }
      this.render();
      this.showSedimentToast("已撤销本次入库", { icon: "rotate-ccw", variant: "muted" });
    } catch (e) {
      console.error("[LexVoice] undo sediment commit failed", e);
      new obsidian.Notice(`撤销失败：${(e && e.message) || e}`, 8000);
    }
  }

  async openSedimentCommitTarget(undo) {
    const entry = undo && (undo.entries || []).find(item => item && item.path);
    if (entry) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof obsidian.TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
        return;
      }
    }
    if (undo && undo.vocabulary && undo.vocabulary.path) {
      const file = this.app.vault.getAbstractFileByPath(undo.vocabulary.path);
      if (file instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  showSedimentCommitToast(message, undo) {
    this.sedimentLastUndo = undo || null;
    this.showSedimentToast(message, {
      icon: "check",
      actions: [
        { text: "撤销", action: () => this.restoreSedimentUndo(this.sedimentLastUndo) },
        { text: "查看", action: () => this.openSedimentCommitTarget(this.sedimentLastUndo) },
      ],
      duration: 5000,
    });
  }

  confirmIgnoreSedimentUnselected(file, groupKey, count) {
    if (!(count > 0)) return;
    const modal = new obsidian.Modal(this.app);
    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.addClass("lexvoice-sediment-rescan-modal");
      const head = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-head" });
      const icon = head.createDiv({ cls: "lexvoice-sediment-confirm-icon" });
      try { obsidian.setIcon(icon, "circle-minus"); } catch { /* intentionally empty */ }
      head.createEl("h3", { text: "忽略未选内容？" });
      const note = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-note" });
      note.setText(`未选的 ${count} 条会被标为忽略，无法恢复。继续后，已选内容会加入对应库。`);
      const actions = contentEl.createDiv({ cls: "lexvoice-sediment-confirm-actions" });
      const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
      const confirm = actions.createEl("button", { text: "继续", cls: "mod-cta", attr: { type: "button" } });
      cancel.onclick = () => modal.close();
      confirm.onclick = async () => {
        confirm.disabled = true;
        modal.close();
        await this.commitSedimentGroup(file, groupKey);
      };
    };
    modal.open();
  }

  async commitSedimentGroup(file, groupKey) {
    try {
      let successText = "";
      let completed = false;
      const state = this.getSedimentPanelState(file);
      const displayItems = this.getSedimentDisplayItems(state, groupKey);
      const selected = groupKey === "person"
        ? new Set(displayItems.map(item => item.id))
        : this.getSedimentSelectedIds(file, groupKey, displayItems);
      const selectedItems = displayItems.filter(item => selected.has(item.id));
      if (SEDIMENT_GROUP_CONFIG[groupKey] && SEDIMENT_GROUP_CONFIG[groupKey].decisionModel === "checkbox" && !selectedItems.length) return;
      const filePath = obsidian.normalizePath(file.path || "");
      const undo = {
        filePath,
        bucketBefore: this.cloneSedimentBucket(file),
        entries: [],
      };
      if (groupKey === "todo") {
        const count = selectedItems.length;
        if (!count) return;
        const result = await writeSedimentObjectCards(this.plugin, file, { todos: selectedItems.map(item => item.raw), learningCards: [] });
        undo.entries = result.entries || [];
        this.setSedimentDecisionLog(file, groupKey, this.buildSedimentDecisionLog(state, groupKey, selected, "已加入"));
        this.setSedimentCandidateBucket(file, { todos: [] });
        completed = this.markSedimentGroupDone(file, groupKey, displayItems.length || count);
        successText = `已加入待办：${count} 条`;
      } else if (groupKey === "card") {
        const count = selectedItems.length;
        if (!count) return;
        const result = await writeSedimentObjectCards(this.plugin, file, { todos: [], learningCards: selectedItems.map(item => item.raw) });
        undo.entries = result.entries || [];
        this.setSedimentDecisionLog(file, groupKey, this.buildSedimentDecisionLog(state, groupKey, selected, "已加入"));
        this.setSedimentCandidateBucket(file, { cards: [] });
        completed = this.markSedimentGroupDone(file, groupKey, displayItems.length || count);
        successText = `已加入卡片库：${count} 张`;
      } else if (groupKey === "hotword") {
        const hotwordCount = selectedItems.length;
        if (!hotwordCount) return;
        // 热词改名回写会动笔记正文，先抓整篇快照供撤销（恢复时先整篇还原，再回写沉淀块）。
        try { undo.sourceSnapshot = { path: filePath, content: await this.app.vault.read(file) }; } catch { /* intentionally empty */ }
        const vocabPath = this.plugin.settings.vocabularyFile;
        if (vocabPath) {
          const norm = obsidian.normalizePath(vocabPath);
          const vocabFile = this.app.vault.getAbstractFileByPath(norm);
          undo.vocabulary = {
            path: norm,
            existed: vocabFile instanceof obsidian.TFile,
            previousContent: vocabFile instanceof obsidian.TFile ? await this.app.vault.read(vocabFile) : "",
          };
        } else {
          undo.vocabulary = {
            path: "",
            existed: false,
            previousCustomVocabulary: this.plugin.settings.customVocabulary || "",
          };
        }
        const existing = await loadVocabularyGroups(this.plugin);
        const selectedGroups = this.buildVocabularyGroupsFromHotwordItems(selectedItems);
        await this.plugin.writeVocabularyFile(mergeVocabularyGroups(existing, selectedGroups));
        // 用户在侧边栏改对的热词，自动把笔记里的原词替换成更正后的词（撤销由上面的 sourceSnapshot 兜底）。
        let hotwordRenames = [];
        try { hotwordRenames = await this.applyHotwordRenamesToNote(file, selectedItems); } catch (e) { console.error("[LexVoice] rename hotwords in note failed", e); }
        this.plugin.markKnowledgeExtractionSource("vocabulary", file);
        await this.plugin.saveSettings();
        this.setSedimentDecisionLog(file, groupKey, this.buildSedimentDecisionLog(state, groupKey, selected, "已加入"));
        // 候选全清，未消费的改名映射一并清掉（宿主候选已不存在，留着会在下次提交误回写）
        this.setSedimentCandidateBucket(file, { hotwords: createVocabularyGroups(), hotwordTermRenames: {} });
        completed = this.markSedimentGroupDone(file, groupKey, displayItems.length || hotwordCount);
        const hotwordRenameNote = (hotwordRenames && hotwordRenames.length)
          ? `，并把正文里的 ${hotwordRenames.map(r => `${r.from}→${r.to}`).join("、")} 一并更正`
          : "";
        successText = `已加入热词库：${hotwordCount} 个${hotwordRenameNote}`;
      } else {
        await this.keepPeopleSuggestions(file, state.currentPeople);
        return;
      }
      const selectedByGroup = Object.assign({}, this.getSedimentCandidateBucket(file).selectedByGroup || {});
      selectedByGroup[groupKey] = [];
      this.setSedimentCandidateBucket(file, { selectedByGroup });
      const persisted = await this.persistSedimentCandidateBucket(file);
      this.render();
      if (persisted && successText) this.showSedimentCommitToast(successText, undo);
      if (completed) this.scheduleSedimentAutoAdvance(file, groupKey);
    } catch (e) {
      console.error("[LexVoice] commit sediment group failed", groupKey, e);
      new obsidian.Notice(`加入失败：${(e && e.message) || e}`, 8000);
    }
  }

  async ignoreSedimentGroup(file, groupKey) {
    const state = this.getSedimentPanelState(file);
    const displayItems = this.getSedimentDisplayItems(state, groupKey);
    const count = displayItems.length;
    this.setSedimentDecisionLog(file, groupKey, this.buildSedimentDecisionLog(state, groupKey, new Set(), "已加入"));
    if (groupKey === "todo") this.setSedimentCandidateBucket(file, { todos: [] });
    else if (groupKey === "card") this.setSedimentCandidateBucket(file, { cards: [] });
    // 忽略热词组时连改名映射一起清：过期映射可能在下次提交时错误回写正文
    else if (groupKey === "hotword") this.setSedimentCandidateBucket(file, { hotwords: createVocabularyGroups(), hotwordTermRenames: {} });
    else return;
    const completed = count > 0 && this.markSedimentGroupDone(file, groupKey, count);
    const persisted = await this.persistSedimentCandidateBucket(file);
    this.render();
    if (persisted) this.showSedimentToast("已忽略未选内容", { icon: "circle-minus", variant: "muted" });
    if (completed) this.scheduleSedimentAutoAdvance(file, groupKey);
  }

  async reprocessSedimentGroup(file, groupKey) {
    const review = this.getSedimentGroupReview(file, groupKey);
    const bucket = this.getSedimentCandidateBucket(file);
    const patch = {
      doneGroups: removeSedimentGroupDone(bucket.doneGroups, groupKey),
      transitionGroup: "",
    };
    const selectedByGroup = Object.assign({}, bucket.selectedByGroup || {});
    delete selectedByGroup[groupKey];
    patch.selectedByGroup = selectedByGroup;
    const decisionLogByGroup = Object.assign({}, bucket.decisionLogByGroup || {});
    delete decisionLogByGroup[groupKey];
    patch.decisionLogByGroup = decisionLogByGroup;
    const hasRestore = review && review.restore;
    if (hasRestore) {
      // 有完整的 restore 数据：把候选恢复回来
      if (groupKey === "person") patch.people = review.restore.people || [];
      else if (groupKey === "todo") patch.todos = review.restore.todos || [];
      else if (groupKey === "card") patch.cards = review.restore.cards || [];
      else if (groupKey === "hotword") { patch.hotwords = review.restore.hotwords || createVocabularyGroups(); patch.hotwordTermRenames = {}; }
    } else {
      // 旧版本的 done 状态没存 restore 快照 —— 兜底：清空本组候选并触发重新扫描
      if (groupKey === "person") patch.people = [];
      else if (groupKey === "todo") patch.todos = [];
      else if (groupKey === "card") patch.cards = [];
      else if (groupKey === "hotword") { patch.hotwords = createVocabularyGroups(); patch.hotwordTermRenames = {}; }
    }
    this.setSedimentCandidateBucket(file, patch);
    await this.persistSedimentCandidateBucket(file);
    this.setSedimentGroup(groupKey);
    if (!hasRestore) {
      // 触发对当前纪要的整体重新扫描，把候选重新跑出来
      try { new obsidian.Notice("本组无回滚数据，已触发重新扫描"); } catch { /* intentionally empty */ }
      this.requestSedimentExtraction(file, true);
    }
  }

  removeSedimentPeopleCandidates(file, suggestions) {
    const bucket = this.getSedimentCandidateBucket(file);
    if (!bucket.people || !bucket.people.length) return;
    const path = obsidian.normalizePath(file && file.path || "");
    const keys = new Set((suggestions || []).map(item => item && (item.cacheKey || item.key || getPeopleSuggestionCacheKey(item.sourcePath || path, item))).filter(Boolean));
    if (!keys.size) return;
    this.setSedimentCandidateBucket(file, {
      people: bucket.people.filter(item => !keys.has(item && (item.cacheKey || item.key || getPeopleSuggestionCacheKey(item.sourcePath || path, item)))),
    });
  }

  async keepPeopleSuggestions(file, suggestions) {
    const items = (suggestions || []).filter(Boolean);
    if (!items.length) return;
    try {
      const sourceSnapshot = file instanceof obsidian.TFile ? { path: file.path, content: await this.app.vault.read(file) } : null;
      const undo = file instanceof obsidian.TFile ? {
        filePath: obsidian.normalizePath(file.path || ""),
        bucketBefore: this.cloneSedimentBucket(file),
        entries: [],
        sourceSnapshot,
      } : null;
      const stateBefore = file instanceof obsidian.TFile ? this.getSedimentPanelState(file) : null;
      const result = await this.plugin.applyPeopleDirectorySuggestions(file, items);
      if (undo) undo.entries = result.entries || [];
      // 用户在侧边栏改对的人名，自动替换回笔记正文 + YAML 人员字段（撤销由上面的 sourceSnapshot 兜底）
      let renames = [];
      try { renames = await this.applyPeopleRenamesToNote(file, items); } catch (e) { console.error("[LexVoice] rename people in note failed", e); }
      this.plugin.removeCachedPeopleSuggestions(items);
      this.removeSedimentPeopleCandidates(file, items);
      if (file instanceof obsidian.TFile) this.appendSedimentDecisionItems(file, "person", items, "kept", "已加入", stateBefore);
      this.plugin.markKnowledgeExtractionSource("people", file);
      await this.plugin.saveSettings();
      const completed = this.markSedimentGroupDoneIfEmpty(file, "person", items.length);
      await this.persistSedimentCandidateBucket(file);
      this.render();
      const renameNote = (renames && renames.length)
        ? `，并把正文/属性里的 ${renames.map(r => `${r.from}→${r.to}`).join("、")} 一并更正`
        : "";
      this.showSedimentCommitToast(`已加入人员库：新建 ${result.created || 0}，更新 ${result.updated || 0}${renameNote}`, undo);
      if (completed) this.scheduleSedimentAutoAdvance(file, "person");
    } catch (e) {
      console.error("[LexVoice] keep people suggestions failed", e);
      new obsidian.Notice(`保存人员建议失败：${(e && e.message) || e}`, 8000);
    }
  }

  async ignorePeopleSuggestions(suggestions, file = null) {
    const items = (suggestions || []).filter(Boolean);
    if (!items.length) return;
    try {
      let count = 0;
      const stateBefore = file instanceof obsidian.TFile ? this.getSedimentPanelState(file) : null;
      for (const item of items) if (await this.plugin.ignorePeopleDirectorySuggestion(item)) count++;
      if (file instanceof obsidian.TFile) this.removeSedimentPeopleCandidates(file, items);
      if (file instanceof obsidian.TFile) this.appendSedimentDecisionItems(file, "person", items, "ignored", "已忽略", stateBefore);
      const completed = file instanceof obsidian.TFile ? this.markSedimentGroupDoneIfEmpty(file, "person", items.length) : false;
      if (file instanceof obsidian.TFile) await this.persistSedimentCandidateBucket(file);
      this.render();
      this.showSedimentToast(`已忽略 ${count} 条人员`, { icon: "circle-minus", variant: "muted" });
      if (completed) this.scheduleSedimentAutoAdvance(file, "person");
    } catch (e) {
      console.error("[LexVoice] ignore people suggestions failed", e);
      new obsidian.Notice(`忽略失败：${(e && e.message) || e}`, 8000);
    }
  }

  async openVocabularyFileFromPanel() {
    const norm = obsidian.normalizePath(this.plugin.settings.vocabularyFile || DEFAULT_SETTINGS.vocabularyFile);
    let file = this.app.vault.getAbstractFileByPath(norm);
    if (!(file instanceof obsidian.TFile)) {
      const folderPath = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
      if (folderPath) await this.plugin.ensureFolder(folderPath);
      file = await this.app.vault.create(norm, formatVocabularyMarkdown([], this.plugin.settings.industryProfile));
    }
    if (file instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }

  renderCompletedNote(root, file) {
    const data = this.getCompletedNotePanelData(file);
    if (data === undefined) {
      root.createDiv({ cls: "lexvoice-outline-empty", text: "正在读取当前纪要…" });
      return;
    }
    if (!data) {
      root.createDiv({ cls: "lexvoice-outline-empty", text: "这篇笔记没有可恢复的大纲或回听时间轴。" });
      return;
    }

    this.renderCompletedNotePlayer(root, data, file);

    const outlineSec = root.createDiv({ cls: "lexvoice-outline-section" });
    const outlineBody = outlineSec.createDiv({ cls: "lexvoice-outline-ai-body" });
    if (data.outline) {
      const rendered = obsidian.MarkdownRenderer.render(this.app, normalizeOutlineMarkdownForDisplay(data.outline), outlineBody, file.path, this);
      void Promise.resolve(rendered).then(() => {
        this.enhanceRenderedOutline(outlineBody, {
          sourcePath: file.path,
          onTimeLink: (payload) => this.seekInlineAudio(payload),
        });
        this.inlineOutlineBody = outlineBody;
        this.decoratePlaybackOutlineChapters(outlineBody);
      });
    } else {
      outlineBody.createDiv({ cls: "lexvoice-outline-empty", text: "这篇纪要没有保存实时大纲。" });
    }

    if (data.timeline) {
      const timelineSec = root.createDiv({ cls: "lexvoice-outline-section" });
      timelineSec.createDiv({ cls: "lexvoice-outline-section-title", text: "回听时间轴" });
      const timelineBody = timelineSec.createDiv({ cls: "lexvoice-outline-ai-body lexvoice-outline-note-timeline" });
      const rendered = obsidian.MarkdownRenderer.render(this.app, data.timeline, timelineBody, file.path, this);
      void Promise.resolve(rendered).then(() => this.plugin.enhanceAudioTimeLinks(timelineBody, {
        sourcePath: file.path,
        onTimeLink: (payload) => this.seekInlineAudio(payload),
      }));
    }
  }

  renderCompletedNotePlayer(root, data, sourceFile) {
    const refs = data && Array.isArray(data.audioRefs) ? data.audioRefs : [];
    const audioFile = refs
      .map((ref) => this.plugin.resolveAudioLinkFile(ref, sourceFile.path))
      .find((f) => f instanceof obsidian.TFile);
    if (!(audioFile instanceof obsidian.TFile)) {
      this.inlineAudioEl = null;
      this.inlineAudioFile = null;
      return;
    }

    const sec = root.createDiv({ cls: "lexvoice-outline-section lexvoice-outline-player-section" });
    const ui = sec.createDiv({ cls: "lexvoice-inline-player" });
    const playBtn = ui.createEl("button", {
      cls: "lexvoice-inline-player-play",
      attr: { type: "button", "aria-label": "播放录音" },
    });

    const progressWrap = ui.createDiv({ cls: "lexvoice-inline-player-progress-wrap" });
    const track = progressWrap.createDiv({ cls: "lexvoice-inline-player-track" });
    const fill = track.createDiv({ cls: "lexvoice-inline-player-fill" });
    const knob = track.createDiv({ cls: "lexvoice-inline-player-knob" });
    const times = progressWrap.createDiv({ cls: "lexvoice-inline-player-times" });
    const currentTime = times.createSpan({ cls: "lexvoice-inline-player-time is-current", text: "0:00" });
    const totalTime = times.createSpan({ cls: "lexvoice-inline-player-time", text: "0:00" });

    const volumeBtn = ui.createEl("button", {
      cls: "lexvoice-inline-player-icon-btn",
      attr: { type: "button", "aria-label": "静音/取消静音", title: "静音/取消静音" },
    });
    try { obsidian.setIcon(volumeBtn, "volume"); } catch { volumeBtn.setText("音量"); }
    const moreBtn = ui.createEl("button", {
      cls: "lexvoice-inline-player-icon-btn",
      attr: { type: "button", "aria-label": "打开录音文件", title: "打开录音文件" },
    });
    try { obsidian.setIcon(moreBtn, "more-horizontal"); } catch { moreBtn.setText("更多"); }

    const player = sec.createEl("audio", {
      cls: "lexvoice-outline-player-native",
      attr: { preload: "metadata" },
    });
    try {
      player.src = this.app.vault.getResourcePath(audioFile);
    } catch {
      player.src = "";
    }
    this.inlineAudioEl = player;
    this.inlineAudioFile = audioFile;

    const setPlayIcon = () => {
      playBtn.classList.toggle("is-playing", !player.paused);
      playBtn.classList.toggle("is-paused", player.paused);
      playBtn.setAttribute("aria-label", player.paused ? "播放录音" : "暂停录音");
    };
    const update = () => {
      const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
      const current = Math.max(0, Number(player.currentTime) || 0);
      const pct = duration ? Math.max(0, Math.min(100, current / duration * 100)) : 0;
      fill.style.width = `${pct}%`;
      knob.style.left = `${pct}%`;
      currentTime.setText(formatElapsed(Math.round(current * 1000)));
      totalTime.setText(duration ? formatElapsed(Math.round(duration * 1000)) : "0:00");
      setPlayIcon();
      this.decoratePlaybackOutlineChapters(this.inlineOutlineBody);
    };
    playBtn.onclick = () => {
      if (player.paused) player.play().catch(() => { /* intentionally empty */ });
      else player.pause();
      update();
    };
    track.onclick = (evt) => {
      const rect = track.getBoundingClientRect();
      const ratio = rect.width ? Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width)) : 0;
      if (Number.isFinite(player.duration) && player.duration > 0) {
        player.currentTime = player.duration * ratio;
        player.play().catch(() => { /* intentionally empty */ });
      }
      update();
    };
    volumeBtn.onclick = () => {
      player.muted = !player.muted;
      volumeBtn.empty();
      try { obsidian.setIcon(volumeBtn, player.muted ? "volume-x" : "volume"); } catch { /* intentionally empty */ }
    };
    moreBtn.onclick = () => this.app.workspace.getLeaf(false).openFile(audioFile);
    player.addEventListener("loadedmetadata", update);
    player.addEventListener("timeupdate", update);
    player.addEventListener("play", update);
    player.addEventListener("pause", update);
    update();
  }

  getOutlineChapterItems(body) {
    if (!body) return [];
    const rail = body.querySelector("ul.lexvoice-outline-time-rail");
    if (!rail) return [];
    return Array.from(rail.children || [])
      .filter((child) => child && child.tagName === "LI" && child.classList && child.classList.contains("lexvoice-outline-has-leading-time"));
  }

  getOutlineChapterTimeMs(li) {
    if (!li) return NaN;
    const link = li.querySelector(".lexvoice-time-link.lexvoice-outline-leading-time");
    return link ? parseElapsedMsToken((link.textContent || "").trim()) : NaN;
  }

  appendOutlineTitleAdornment(li, node) {
    if (!li || !node) return null;
    const firstParagraph = Array.from(li.children || []).find((child) => child && child.tagName === "P");
    if (firstParagraph) {
      firstParagraph.appendChild(activeDocument.createTextNode(" "));
      firstParagraph.appendChild(node);
      return node;
    }
    const firstNestedList = Array.from(li.children || [])
      .find((child) => child && /^(UL|OL)$/i.test(child.tagName || ""));
    const spacer = activeDocument.createTextNode(" ");
    if (firstNestedList) {
      li.insertBefore(spacer, firstNestedList);
      li.insertBefore(node, firstNestedList);
    } else {
      li.appendChild(spacer);
      li.appendChild(node);
    }
    return node;
  }

  addOutlineMiniWave(parent, cls = "", titleLi = null) {
    if (!parent && !titleLi) return null;
    const wave = activeDocument.createElement("span");
    wave.className = `lexvoice-outline-mini-wave ${cls}`.trim();
    if (titleLi) this.appendOutlineTitleAdornment(titleLi, wave);
    else parent.appendChild(wave);
    for (let i = 0; i < 4; i++) {
      const bar = activeDocument.createElement("span");
      bar.className = "lexvoice-outline-mini-wave-bar";
      bar.style.animationDelay = `${i * 0.15}s`;
      wave.appendChild(bar);
    }
    return wave;
  }

  decorateLiveOutlineChapters(body, session, recInfo) {
    if (!body || !session) return;
    body.addClass("is-live-outline");
    const items = this.getOutlineChapterItems(body);
    if (!items.length) return;
    const current = items[items.length - 1];
    const viewingMs = Number.isFinite(this.outlineViewingMs) ? this.outlineViewingMs : null;
    let viewingItem = null;
    for (const li of items) {
      const ms = this.getOutlineChapterTimeMs(li);
      li.addClass("lexvoice-outline-chapter");
      li.removeClass("is-generating");
      li.removeClass("is-viewing");
      li.onclick = (evt) => {
        const target = evt.target;
        if (target && target.closest && target.closest("a,button")) return;
        if (li === current) {
          this.outlineViewingMs = null;
          this.lastLiveOutlineFocusKey = "";
        } else if (Number.isFinite(ms)) {
          this.outlineViewingMs = ms;
        }
        this.render();
      };
      if (viewingMs !== null && Number.isFinite(ms) && Math.abs(ms - viewingMs) < 500) viewingItem = li;
    }
    const isRecording = recInfo && recInfo.state === "recording";
    const isPaused = recInfo && recInfo.state === "paused";
    if ((isRecording || isPaused) && current) {
      current.addClass("is-generating");
      if (!current.querySelector(".lexvoice-outline-live-badge")) {
        const badge = activeDocument.createElement("span");
        badge.className = "lexvoice-outline-live-badge";
        badge.textContent = isPaused ? "已暂停" : "正在生成";
        this.appendOutlineTitleAdornment(current, badge);
      }
    }
    if (viewingItem) {
      viewingItem.addClass("is-viewing");
      if (!viewingItem.querySelector(".lexvoice-outline-viewing-icon")) {
        const icon = activeDocument.createElement("span");
        icon.className = "lexvoice-outline-viewing-icon";
        try { obsidian.setIcon(icon, "eye"); } catch { icon.textContent = "查看"; }
        this.appendOutlineTitleAdornment(viewingItem, icon);
      }
      if (!body.querySelector(".lexvoice-back-to-current")) {
        const back = body.createEl("button", { cls: "lexvoice-back-to-current", attr: { type: "button" } });
        try { obsidian.setIcon(back.createSpan({ cls: "lexvoice-back-to-current-icon" }), "arrow-down"); } catch { /* intentionally empty */ }
        back.createSpan({ cls: "lexvoice-back-to-current-label", text: "回到当前" });
        back.onclick = () => {
          this.outlineViewingMs = null;
          this.lastLiveOutlineFocusKey = "";
          this.render();
        };
      }
    }
    this.autoFocusLiveOutlineCurrent(body, session, recInfo, current, items);
  }

  autoFocusLiveOutlineCurrent(body, session, recInfo, current, items) {
    if (!body || !session || !recInfo || !current) return;
    if (recInfo.state !== "recording" && recInfo.state !== "paused") return;
    if (Number.isFinite(this.outlineViewingMs)) return;
    const segCount = Array.isArray(session.segments) ? session.segments.length : 0;
    const itemCount = Array.isArray(items) ? items.length : 0;
    const updatedAt = session.realtimeOutlineUpdatedAt || "";
    const outlineLen = (this.aiOutline || session.realtimeOutline || "").length;
    const key = [session.id || "", recInfo.state || "", segCount, itemCount, updatedAt, outlineLen].join("|");
    if (key === this.lastLiveOutlineFocusKey) return;
    this.lastLiveOutlineFocusKey = key;
    if (this._outlineFollowRaf) cancelAnimationFrame(this._outlineFollowRaf);
    this._outlineFollowRaf = window.requestAnimationFrame(() => {
      this._outlineFollowRaf = 0;
      try {
        if (!current || !current.isConnected) return;
        current.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      } catch {
        try { current.scrollIntoView(false); } catch { /* intentionally empty */ }
      }
    });
  }

  decoratePlaybackOutlineChapters(body) {
    if (!body || !this.inlineAudioEl) return;
    const items = this.getOutlineChapterItems(body);
    if (!items.length) return;
    const currentMs = Math.max(0, Number(this.inlineAudioEl.currentTime) || 0) * 1000;
    let activeIndex = -1;
    const times = items.map((li) => this.getOutlineChapterTimeMs(li));
    for (let i = 0; i < times.length; i++) {
      if (Number.isFinite(times[i]) && times[i] <= currentMs + 250) activeIndex = i;
    }
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      li.addClass("lexvoice-outline-chapter");
      li.removeClass("is-played");
      li.removeClass("is-playing");
      li.removeClass("is-upcoming");
      const oldWave = li.querySelector(".lexvoice-outline-mini-wave");
      if (oldWave) oldWave.remove();
      if (activeIndex >= 0 && i < activeIndex) li.addClass("is-played");
      else if (i === activeIndex) {
        li.addClass("is-playing");
        const target = li.querySelector(":scope > p") || li;
        this.addOutlineMiniWave(target, "", li);
      } else li.addClass("is-upcoming");
      li.onclick = (evt) => {
        const target = evt.target;
        if (target && target.closest && target.closest("a,button")) return;
        const ms = times[i];
        if (!Number.isFinite(ms) || !this.inlineAudioEl) return;
        this.inlineAudioEl.currentTime = ms / 1000;
        this.inlineAudioEl.play().catch(() => { /* intentionally empty */ });
        this.decoratePlaybackOutlineChapters(body);
      };
    }
  }

  seekInlineAudio(payload) {
    const audio = this.inlineAudioEl;
    const audioFile = this.inlineAudioFile;
    if (!audio || !(audioFile instanceof obsidian.TFile) || !payload) return false;
    const sameFile = payload.file instanceof obsidian.TFile
      && obsidian.normalizePath(audioFile.path) === obsidian.normalizePath(payload.file.path);
    const ms = sameFile
      ? (Number.isFinite(payload.localMs) ? payload.localMs : payload.globalMs)
      : (Number.isFinite(payload.globalMs) ? payload.globalMs : payload.localMs);
    const seek = () => {
      try {
        const target = Math.max(0, Math.min(Number.isFinite(audio.duration) ? audio.duration : Number.MAX_SAFE_INTEGER, (ms || 0) / 1000));
        audio.currentTime = target;
        audio.play().catch(() => { /* intentionally empty */ });
        audio.focus();
      } catch (e) {
        console.warn("[LexVoice] inline audio seek failed", e);
      }
    };
    if (audio.readyState >= 1) seek();
    else audio.addEventListener("loadedmetadata", seek, { once: true });
    return true;
  }

  renderTitleRow(head, title, options = {}) {
    const row = head.createDiv({ cls: "lexvoice-outline-title-row" });
    row.createDiv({ cls: "lexvoice-outline-title", text: title });
    const noteFile = options && options.noteFile instanceof obsidian.TFile ? options.noteFile : null;
    if (noteFile) {
      const noteBtn = row.createEl("button", {
        cls: "clickable-icon lexvoice-outline-note-btn",
        attr: { "aria-label": "打开当前纪要", title: "打开当前纪要" },
      });
      try { obsidian.setIcon(noteBtn, "file-text"); } catch { noteBtn.setText("纪要"); }
      noteBtn.onclick = () => this.app.workspace.getLeaf(false).openFile(noteFile);
    }
    const btn = row.createEl("button", {
      cls: "clickable-icon lexvoice-outline-settings-btn",
      attr: { "aria-label": "打开 LexVoice 设置", title: "打开 LexVoice 设置" },
    });
    try { obsidian.setIcon(btn, "settings"); } catch { btn.setText("设置"); }
    btn.onclick = () => this.plugin.openSettings("home");
  }

  getRecordingIssue(recInfo) {
    const issue = this.plugin && typeof this.plugin.getRecordingIssue === "function"
      ? this.plugin.getRecordingIssue()
      : (recInfo && recInfo.issue);
    if (!issue || !issue.kind) return null;
    if (issue.kind === "microphone") return issue;
    const state = recInfo && recInfo.state ? recInfo.state : "idle";
    if (state === "idle" && !(this.plugin && this.plugin.session && this.plugin.session.finalizing)) return null;
    return issue;
  }

  renderActiveHead(root, session, recInfo, recordingIssue = null) {
    const head = root.createDiv({ cls: "lexvoice-outline-head" });
    head.addClass("is-active-session");
    this.renderTitleRow(head, "LexVoice", { noteFile: this.getSessionNoteFile(session) });
    this.renderActiveRecordingBar(head, session, recInfo, recordingIssue);
    this.renderRecordingIssueAlert(head, recordingIssue, session, recInfo);
    // "整理中"横幅只在真正合并润色（session.finalizing）或停录后还有段落待转写时显示。
    // 旧条件用 recInfo.state === "idle" 太宽——只要不在录音就一直显示，会让已完成/失败/空会话
    // 永远卡在"AI 正在整理"（无内容可整理），是误导。
    const stillTranscribing = recInfo.state === "idle" && !session.finalized
      && Array.isArray(session.segments) && session.segments.some((s) => s && !s.text && !s.error);
    if (session.finalizing || stillTranscribing) {
      const banner = head.createDiv({ cls: "lexvoice-finalizing-banner" });
      try { obsidian.setIcon(banner.createSpan({ cls: "lexvoice-finalizing-banner-icon" }), "loader-2"); } catch { /* intentionally empty */ }
      banner.createSpan({ cls: "lexvoice-finalizing-banner-text", text: session.finalizing ? "AI 正在整理最终纪要内容" : "正在等待转写完成…" });
    }
  }

  renderActiveRecordingBar(parent, session, recInfo, recordingIssue = null) {
    const state = recInfo && recInfo.state ? recInfo.state : "idle";
    const isRecording = state === "recording";
    const isPaused = state === "paused";
    const isFinalizing = !!(session && session.finalizing) || state === "idle";
    const issueKind = recordingIssue && recordingIssue.kind;
    const isMicBlocked = issueKind === "microphone";
    const wrap = parent.createDiv({ cls: "lexvoice-recording-player" + (isRecording || isPaused ? " is-live" : " is-playback") + (isPaused ? " is-paused" : "") + (issueKind ? ` is-${issueKind}` : "") });
    const main = wrap.createDiv({ cls: "lexvoice-recording-player-main" });
    const primary = main.createEl("button", {
      cls: "lexvoice-recording-player-primary",
      attr: { type: "button", "aria-label": isRecording || isPaused ? "停止录音" : "录音已停止" },
    });
    if ((isRecording || isPaused) && !isMicBlocked) {
      primary.createSpan({ cls: "lexvoice-recording-stop-square" });
      primary.onclick = () => this.plugin.stopRecording();
    } else {
      primary.addClass("is-play-icon");
      primary.disabled = true;
    }
    const middle = main.createDiv({ cls: "lexvoice-recording-player-middle" });
    if (isRecording || isPaused) {
      const wave = middle.createDiv({ cls: "lexvoice-recording-wave" });
      const heights = [10, 14, 7, 12, 16, 9, 13, 7, 11, 15, 8, 12];
      heights.forEach((h, i) => {
        const bar = wave.createSpan({ cls: "lexvoice-recording-wave-bar" });
        bar.style.height = `${h}px`;
        bar.style.animationDelay = `${i * 0.1}s`;
      });
      middle.createSpan({ cls: "lexvoice-recording-elapsed", text: formatElapsed(recInfo.elapsed || 0) });
    } else {
      const track = middle.createDiv({ cls: "lexvoice-recording-finish-track" });
      track.createDiv({ cls: "lexvoice-recording-finish-fill" });
      const times = middle.createDiv({ cls: "lexvoice-recording-finish-times" });
      times.createSpan({ text: "0:00" });
      times.createSpan({ text: formatElapsed((recInfo && recInfo.elapsed) || getSegmentsDurationMs(session && session.segments)) });
    }
    const pause = main.createEl("button", {
      cls: "lexvoice-recording-player-secondary",
      attr: { type: "button", "aria-label": isPaused ? "继续录音" : "暂停录音" },
    });
    if ((isRecording || isPaused) && !isMicBlocked) {
      pause.addClass(isPaused ? "is-play-icon" : "is-pause-icon");
      pause.onclick = () => isPaused ? this.plugin.recorder.resume() : this.plugin.recorder.pause();
    } else {
      try { obsidian.setIcon(pause, "volume"); } catch { /* intentionally empty */ }
      pause.disabled = isFinalizing;
    }
    if ((isRecording || isPaused) && !isMicBlocked) {
      this.renderInputMeter(parent, recInfo);
    }
  }

  renderRecordingIssueAlert(parent, issue, session, recInfo) {
    if (!parent || !issue || !issue.kind || issue.kind === "microphone") return;
    const isNetwork = issue.kind === "network";
    const wrap = parent.createDiv({ cls: `lexvoice-recording-alert ${isNetwork ? "is-warning" : "is-neutral"}` });
    const icon = wrap.createSpan({ cls: "lexvoice-recording-alert-icon" });
    try { obsidian.setIcon(icon, isNetwork ? "wifi-off" : "cloud-off"); } catch { /* intentionally empty */ }
    const body = wrap.createDiv({ cls: "lexvoice-recording-alert-body" });
    body.createDiv({
      cls: "lexvoice-recording-alert-title",
      text: isNetwork ? "网络中断 · 录音正常继续" : "AI 服务暂时不可用",
    });
    body.createDiv({
      cls: "lexvoice-recording-alert-desc",
      text: isNetwork
        ? "大纲实时生成已暂停，恢复网络后会自动补做。"
        : "本地录音正常进行，结束后可以手动整理大纲。",
    });
    const action = wrap.createEl("button", {
      cls: "lexvoice-recording-alert-action",
      text: isNetwork ? "重连" : "详情",
      attr: { type: "button" },
    });
    action.onclick = () => {
      if (isNetwork) {
        void this.refreshAIOutline({ silent: false });
        return;
      }
      new obsidian.Notice(issue.message ? `AI 服务暂时不可用：${issue.message}` : "AI 服务暂时不可用，本地录音仍在继续。", 8000);
    };
  }

  renderMicrophoneBlockedOverlay(root, issue, recInfo) {
    const overlay = root.createDiv({ cls: "lexvoice-recording-blocker-overlay" });
    const card = overlay.createDiv({ cls: "lexvoice-recording-blocker-card" });
    const top = card.createDiv({ cls: "lexvoice-recording-blocker-top" });
    const iconWrap = top.createDiv({ cls: "lexvoice-recording-blocker-icon" });
    try { obsidian.setIcon(iconWrap, "mic-off"); } catch { /* intentionally empty */ }
    const titleWrap = top.createDiv({ cls: "lexvoice-recording-blocker-title-wrap" });
    titleWrap.createDiv({ cls: "lexvoice-recording-blocker-title", text: "麦克风访问被拒绝" });
    const stoppedAt = Number(issue && issue.stoppedAtMs);
    const fallbackMs = Math.max(0, Number(recInfo && recInfo.elapsed) || 0);
    titleWrap.createDiv({ cls: "lexvoice-recording-blocker-subtitle", text: `录音已在 ${formatElapsed(Number.isFinite(stoppedAt) ? stoppedAt : fallbackMs)} 停止` });
    card.createDiv({
      cls: "lexvoice-recording-blocker-desc",
      text: "本场已录制的内容已保存到本地。系统在录音过程中收回了麦克风权限，因此无法继续录制新的声音。",
    });
    const steps = card.createDiv({ cls: "lexvoice-recording-blocker-steps" });
    steps.createDiv({ text: "恢复方式：" });
    steps.createDiv({ text: "1. 打开系统设置，允许 Obsidian 访问麦克风。" });
    steps.createDiv({ text: "2. 回到 LexVoice 后重新开始一段录音。" });
    const actions = card.createDiv({ cls: "lexvoice-recording-blocker-actions" });
    const saveOnly = actions.createEl("button", { cls: "lexvoice-recording-blocker-secondary", text: "仅保存录音", attr: { type: "button" } });
    saveOnly.onclick = () => this.plugin.stopRecording();
    const settings = actions.createEl("button", { cls: "lexvoice-recording-blocker-primary", attr: { type: "button" } });
    try { obsidian.setIcon(settings.createSpan({ cls: "lexvoice-recording-blocker-action-icon" }), "settings"); } catch { /* intentionally empty */ }
    settings.createSpan({ text: "打开系统设置" });
    settings.onclick = () => this.openMicrophoneSettings();
  }

  openMicrophoneSettings() {
    try { window.open("ms-settings:privacy-microphone"); } catch { /* intentionally empty */ }
    new obsidian.Notice("请在系统设置 → 隐私与安全 → 麦克风中允许 Obsidian 访问麦克风。", 9000);
  }

  renderWorkProgress(parent, state) {
    if (!parent || !state) return;
    const pct = clampLexVoiceProgress(state.percent);
    const wrap = parent.createDiv({ cls: "lexvoice-work-progress" + (pct == null ? " is-indeterminate" : "") });
    const top = wrap.createDiv({ cls: "lexvoice-work-progress-top" });
    top.createSpan({ cls: "lexvoice-work-progress-label", text: state.label || "处理中" });
    top.createSpan({ cls: "lexvoice-work-progress-percent", text: pct == null ? "" : `${pct}%` });
    const bar = wrap.createDiv({ cls: "lexvoice-work-progress-bar" });
    const fill = bar.createDiv({ cls: "lexvoice-work-progress-fill" });
    if (pct != null) fill.style.width = `${pct}%`;
    if (state.detail || state.title) wrap.createDiv({ cls: "lexvoice-work-progress-detail", text: state.detail || state.title });
  }

  renderInputMeter(parent, recInfo) {
    const wrap = parent.createDiv({ cls: "lexvoice-input-meters", attr: { title: "显示 LexVoice 实际录到的输入音量。条不动时，说明当前录音流没有收到声音。" } });
    const sources = this.getMeterSources(recInfo);
    for (const source of sources) {
      const row = wrap.createDiv({ cls: `lexvoice-input-meter is-${source.kind}`, attr: { "data-kind": source.kind } });
      row.createDiv({ cls: "lexvoice-input-meter-icon", text: source.icon || "●" });
      const name = row.createDiv({ cls: "lexvoice-input-meter-name", text: source.label || "输入" });
      name.setAttr("title", source.label || "输入");
      row.createDiv({ cls: "lexvoice-input-meter-state" });
      const bars = row.createDiv({ cls: "lexvoice-input-meter-bars" });
      for (let i = 0; i < 12; i++) bars.createSpan({ cls: "lexvoice-input-meter-bar" });
    }
    this.updateInputMeter(parent, recInfo);
  }

  getMeterSources(recInfo) {
    const sources = recInfo && Array.isArray(recInfo.sourceLevels) ? recInfo.sourceLevels : [];
    if (sources.length) return sources;
    return [{ kind: "input", icon: "●", label: "输入", level: (recInfo && recInfo.audioLevel) || 0, bars: new Array(12).fill(0) }];
  }

  updateInputMeter(root, recInfo) {
    const wrap = root.querySelector(".lexvoice-input-meters");
    if (!wrap) return;
    const sources = this.getMeterSources(recInfo);
    for (const source of sources) {
      const row = wrap.querySelector(`.lexvoice-input-meter[data-kind="${source.kind}"]`);
      if (!row) continue;
      const level = Math.max(0, Math.min(1, source.level || 0));
      const state = row.querySelector(".lexvoice-input-meter-state");
      const bars = row.querySelectorAll(".lexvoice-input-meter-bar");
      row.classList.toggle("is-silent", level < 0.012);
      row.classList.toggle("is-active", level >= 0.012);
      if (state) {
        if (recInfo && recInfo.state === "paused") state.setText("暂停");
        else state.setText(level >= 0.012 ? "有输入" : "静音");
      }
      const values = Array.isArray(source.bars) ? source.bars : [];
      bars.forEach((bar, i) => {
        const value = Math.max(0, Math.min(1, values[i] || 0));
        const height = level < 0.012 ? 3 : Math.round(4 + value * 22);
        bar.style.height = height + "px";
        bar.style.opacity = String(level < 0.012 ? 0.5 : Math.max(0.55, 0.55 + value * 0.45));
      });
    }
  }

  renderIdleHead(root) {
    const head = root.createDiv({ cls: "lexvoice-outline-head is-idle" });
    this.renderTitleRow(head, "LexVoice");
    const isMobile = isLexVoiceMobileRuntime();

    const controls = head.createDiv({ cls: "lexvoice-outline-controls" });

    // 自定义下拉：用 Obsidian Menu 替代原生 <select>（OS 渲染的选项弹层没法美化）。菜单贴字段宽度、当前项左侧加色点，样式与面板一致。
    const mkSelect = (row, opts) => {
      let curVal = opts.current;
      const find = () => opts.items.find(it => it.value === curVal) || opts.items[0];
      const trigger = row.createDiv({ cls: "lexvoice-outline-select-wrap lexvoice-outline-menu-trigger" + (opts.disabled ? " is-disabled" : "") });
      const lbl = trigger.createSpan({ cls: "lex-ms-label", text: (opts.disabled && opts.disabledLabel) ? opts.disabledLabel : ((find() || {}).label || "") });
      try { obsidian.setIcon(trigger.createSpan({ cls: "lex-ms-chev" }), "chevron-down"); } catch { /* intentionally empty */ }
      if (!opts.disabled) {
        trigger.onclick = () => {
          const menu = new obsidian.Menu();
          for (const it of opts.items) {
            menu.addItem(mi => {
              mi.setTitle(it.label);
              mi.onClick(() => { curVal = it.value; lbl.setText(it.label); void opts.onPick(it.value); });
            });
          }
          const r = trigger.getBoundingClientRect();
          menu.showAtPosition({ x: r.left, y: r.bottom + 4 });
          // 菜单贴字段宽度 + 左右留白对称 + 标记当前项（仅主题色文字，不用色点）
          try {
            menu.dom.style.minWidth = Math.round(r.width) + "px";
            menu.dom.classList.add("lexvoice-ms-menu");
            const items = menu.dom.querySelectorAll(".menu-item");
            const idx = opts.items.findIndex(it => it.value === curVal);
            if (idx >= 0 && items[idx]) items[idx].classList.add("lex-ms-active");
          } catch { /* intentionally empty */ }
        };
      }
      return trigger;
    };

    // 模板（常驻显示——最常切换的"录音整理成什么"）
    const modeRow = controls.createDiv({ cls: "lexvoice-outline-control-row" });
    modeRow.createEl("span", { cls: "lexvoice-outline-control-label", text: "模板" });
    const currentMode = getEffectivePolishMode(this.plugin.settings, this.plugin.settings.polishMode);
    mkSelect(modeRow, {
      current: currentMode,
      items: getVisiblePolishModeKeys(this.plugin.settings).map(k => ({ value: k, label: getModeMeta(this.plugin.settings, k).label })),
      onPick: async (k) => { this.plugin.settings.polishMode = k; await this.plugin.saveSettings(); this.scheduleUpdate(); },
    });

    // 音频输入（常驻，和模板并列——最常跟着录音场景切换：会议 / 视频 / 纯麦）
    const capRow = controls.createDiv({ cls: "lexvoice-outline-control-row" });
    capRow.createEl("span", { cls: "lexvoice-outline-control-label", text: "音频" });
    const capOpts = isMobile
      ? [["mic", "仅麦克风（手机端）"]]
      : [
          ["mic", "仅麦克风"],
          ["mix-virtual", "麦克风 + 电脑音频（会议/讲解）"],
          ["virtualCable", "仅电脑音频（视频/课程）"],
        ];
    const currentInputMode = resolveRuntimeAudioInputMode(this.plugin.settings.captureMode || "mic");
    mkSelect(capRow, {
      current: currentInputMode,
      items: capOpts.map(([v, t]) => ({ value: v, label: t })),
      disabled: isMobile,
      onPick: async (v) => { this.plugin.settings.captureMode = resolveRuntimeAudioInputMode(v); await this.plugin.saveSettings(); this.scheduleUpdate(); },
    });
    if (isMobile) {
      capRow.createSpan({
        cls: "setting-item-description",
        text: "手机端用于现场麦克风采集；电脑音频和虚拟声卡请在桌面端使用。",
      });
    }

    // 更多设置：方案 / 偏好 / 思考 默认折叠，保持面板上半部分清爽（折叠态记在视图实例上，本次面板内保持）。
    const moreWrap = controls.createDiv({ cls: "lexvoice-outline-more" + (this._sidebarMoreExpanded ? " is-expanded" : "") });
    const moreToggle = moreWrap.createDiv({ cls: "lexvoice-outline-more-toggle" });
    try { obsidian.setIcon(moreToggle.createSpan({ cls: "lexvoice-outline-more-chev" }), "chevron-right"); } catch { /* intentionally empty */ }
    moreToggle.createSpan({ cls: "lexvoice-outline-more-label", text: "更多设置" });
    moreToggle.onclick = () => {
      this._sidebarMoreExpanded = !moreWrap.hasClass("is-expanded");
      moreWrap.toggleClass("is-expanded", this._sidebarMoreExpanded);
    };
    const moreBody = moreWrap.createDiv({ cls: "lexvoice-outline-more-body" });

    // API 方案快捷切换：复用设置页「API 方案」(llmProfiles)，侧边栏一键切换整套「转写 + AI 整理」配置。
    const schemeProfiles = Array.isArray(this.plugin.settings.llmProfiles) ? this.plugin.settings.llmProfiles : [];
    const schemeRow = moreBody.createDiv({ cls: "lexvoice-outline-control-row" });
    schemeRow.createEl("span", { cls: "lexvoice-outline-control-label", text: "方案" });
    mkSelect(schemeRow, {
      current: this.plugin.settings.activeLlmProfile || "",
      items: [{ value: "", label: schemeProfiles.length ? "临时配置（未保存）" : "未保存方案 · 去设置添加" }]
        .concat(schemeProfiles.map(p => ({ value: p.id, label: p.name || p.id }))),
      onPick: async (id) => {
        if (!id) { this.plugin.settings.activeLlmProfile = ""; await this.plugin.saveSettings(); return; }
        applyLlmProfileToWorkingConfig(this.plugin.settings, id);
        await this.plugin.saveSettings();
        const picked = (this.plugin.settings.llmProfiles || []).find(p => p.id === id);
        try { new obsidian.Notice(`已切换 API 方案：${(picked && picked.name) || id}`); } catch { /* intentionally empty */ }
        this.scheduleUpdate();
      },
    });

    // 整理偏好：复用右键「重新整理为」的偏好预设，读写同一个 repolishPreference（影响"重新整理"的风格默认值）。
    const prefRow = moreBody.createDiv({ cls: "lexvoice-outline-control-row" });
    prefRow.createEl("span", { cls: "lexvoice-outline-control-label", text: "偏好" });
    // 侧边栏只保留最小正交集合（量：详细/精炼 · 结构：结构化/自然 · 外推：适度拓展 + 默认锚点）；
    // 其余预设留在右键「重新整理为」高级菜单。主表 REPOLISH_PREFERENCE_PRESETS 不删任何 key，避免已存 repolishPreference 变孤儿。
    const SIDEBAR_PREF_KEYS = ["detailed", "concise", "structured", "natural", "expanded"];
    const curPref = this.plugin.settings.repolishPreference || "";
    const prefItems = [{ value: "", label: "无特殊偏好" }]
      .concat(SIDEBAR_PREF_KEYS.map(k => ({ value: k, label: REPOLISH_PREFERENCE_PRESETS[k].label })));
    // 当前偏好若是被精简掉的旧值，补一项让触发器显示其真实名字（不静默退成"默认"误导用户）
    if (curPref && !SIDEBAR_PREF_KEYS.includes(curPref)) {
      const hiddenPreset = getRepolishPreferencePreset(curPref);
      if (hiddenPreset) prefItems.push({ value: curPref, label: hiddenPreset.label });
    }
    mkSelect(prefRow, {
      current: curPref,
      items: prefItems,
      onPick: async (v) => { this.plugin.settings.repolishPreference = v; await this.plugin.saveSettings(); },
    });

    // 思考档：默认 / 推理 / 快速（关思维链省 token）。仅当前 AI 整理服务支持调节时可选，否则灰掉不可选。
    const thinkCtrl = getThinkingControl(this.plugin.settings.llmEndpoint, this.plugin.settings.llmModel);
    const thinkRow = moreBody.createDiv({ cls: "lexvoice-outline-control-row" });
    thinkRow.createEl("span", { cls: "lexvoice-outline-control-label", text: "思考" });
    mkSelect(thinkRow, {
      current: this.plugin.settings.thinkingMode || "auto",
      items: [
        { value: "fast", label: "快速模式" },
        { value: "auto", label: "默认模式" },
        { value: "reasoning", label: "推理模式" },
      ],
      disabled: !thinkCtrl,
      disabledLabel: "当前服务不支持调节",
      onPick: async (v) => { this.plugin.settings.thinkingMode = v; await this.plugin.saveSettings(); },
    });

    // 扩展模式解锁后才显示专属上下文卡片
    if (isRecruitFeatureUnlocked(this.plugin.settings) && currentMode === "recruit") {
      this.renderRecruitContextCard(controls);
    }

    // 设备状态条：根据当前音频输入方式检测对应硬件，给出可见反馈
    const devStatus = controls.createDiv({ cls: "lexvoice-outline-device-status" });
    void this.renderDeviceStatus(devStatus, currentInputMode);

    const actions = controls.createDiv({ cls: "lexvoice-outline-actions" });
    const startBtn = actions.createEl("button", { cls: "mod-cta lexvoice-outline-action-button is-record", attr: { type: "button" } });
    try { obsidian.setIcon(startBtn.createSpan({ cls: "lexvoice-outline-action-icon" }), "mic"); } catch { /* intentionally empty */ }
    startBtn.createSpan({ text: isMobile ? "新建录音" : "新建录音" });
    startBtn.onclick = () => this.plugin.startRecording();
    const importBtn = actions.createEl("button", { cls: "lexvoice-outline-action-button", attr: { type: "button" } });
    try { obsidian.setIcon(importBtn.createSpan({ cls: "lexvoice-outline-action-icon" }), "file-audio"); } catch { /* intentionally empty */ }
    importBtn.createSpan({ text: "音频" });
    importBtn.onclick = () => new ImportAudioModal(this.app, this.plugin).open();
    const importTextBtn = actions.createEl("button", { cls: "lexvoice-outline-action-button", attr: { type: "button" } });
    try { obsidian.setIcon(importTextBtn.createSpan({ cls: "lexvoice-outline-action-icon" }), "file-text"); } catch { /* intentionally empty */ }
    importTextBtn.createSpan({ text: "文本" });
    importTextBtn.onclick = () => new ImportTextModal(this.app, this.plugin).open();
  }

  getMeetingMaterialsFolder(session) {
    const base = obsidian.normalizePath(this.plugin.settings.meetingMaterialsFolder || DEFAULT_SETTINGS.meetingMaterialsFolder);
    const stamp = session && session.sessionStamp ? session.sessionStamp : "meeting";
    return obsidian.normalizePath(`${base}/${stamp}`);
  }

  renderMeetingComposer(root, session) {
    if (!session.meetingWorkbench) session.meetingWorkbench = { notes: "", draft: "", materials: [], entries: [] };
    const workbench = normalizeMeetingWorkbench(session.meetingWorkbench);
    session.meetingWorkbench = workbench;
    const isMobile = isLexVoiceMobileRuntime();
    const composer = root.createDiv({ cls: "lexvoice-meeting-composer" });
    if (isMobile) composer.addClass("is-mobile");
    const textarea = composer.createEl("textarea", {
      cls: "lexvoice-meeting-composer-input",
      attr: { rows: "1", "aria-label": "会中补充" },
    });
    textarea.placeholder = "记下来 · #概念 ?问题 !重点 @指派 /待办";
    textarea.value = workbench.draft || "";
    textarea.addEventListener("input", () => {
      session.meetingWorkbench.draft = textarea.value;
    });
    textarea.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && !evt.shiftKey && !evt.isComposing) {
        evt.preventDefault();
        this.addMeetingWorkbenchTextEntry(session, textarea.value);
      }
    });

    const actions = composer.createDiv({ cls: "lexvoice-meeting-composer-actions" });
    this.createMeetingMaterialInput(actions, session, {
      label: "拍照",
      icon: "camera",
      accept: "image/*",
      kind: "image",
      capture: true,
      multiple: false,
      iconOnly: true,
    });
    if (isMobile) {
      this.createMeetingMaterialInput(actions, session, {
        label: "相册",
        icon: "image-plus",
        accept: "image/*",
        kind: "image",
        capture: false,
        multiple: true,
        iconOnly: true,
      });
    }
    this.createMeetingMaterialInput(actions, session, {
      label: isMobile ? "文件" : "附件",
      icon: "paperclip",
      accept: ".ppt,.pptx,.pdf,.key,.pages,.md,.txt,image/*",
      kind: "file",
      capture: false,
      multiple: true,
      iconOnly: true,
    });
    const sendBtn = actions.createEl("button", { cls: "clickable-icon lexvoice-meeting-send", attr: { "aria-label": "发送到会中时间线", title: "发送" } });
    try { obsidian.setIcon(sendBtn, "send-horizontal"); } catch { sendBtn.setText("发"); }
    sendBtn.onclick = () => this.addMeetingWorkbenchTextEntry(session, textarea.value);
  }

  renderOutlineAnnotationEntry(parent, session, entry, options = {}) {
    const source = entry.source || ((entry.materials && entry.materials.length && !entry.text) ? "material" : "manual");
    const latestEnd = getSessionLatestSegmentEndMs(session);
    const isIntegrated = latestEnd > 0 && (Number(entry.atMs) || 0) <= latestEnd;
    const asListItem = !!(options && options.asListItem);
    const container = asListItem
      ? parent.createEl("li", { cls: "lexvoice-outline-annotation-li" })
      : parent;
    const metaKind = entry.interaction && entry.interaction.kind;
    const isMetadata = metaKind && (metaKind === "assignee" || metaKind === "todo");
    const row = container.createDiv({ cls: `lexvoice-outline-annotation is-${source} ${isIntegrated ? "is-integrated" : "is-pending"}${isMetadata ? ` is-${metaKind}` : ""}` });
    row.createDiv({ cls: `lexvoice-outline-annotation-time is-${source}`, text: formatElapsed(entry.atMs || 0) });
    const body = row.createDiv({ cls: "lexvoice-outline-annotation-body" });
    const sourcePath = session && session.mdPath ? session.mdPath : "";
    // 元数据 kinds 优先用结构化展示（不渲染原始 entry.text 的符号前缀）
    if (metaKind === "todo") {
      const todoLine = body.createDiv({ cls: "lexvoice-outline-annotation-todo" });
      todoLine.createSpan({ cls: "lexvoice-outline-annotation-todo-check" });
      todoLine.createSpan({ cls: "lexvoice-outline-annotation-todo-task", text: entry.interaction.task || entry.text || "未命名待办" });
      if (entry.interaction.assignee) {
        const chip = todoLine.createSpan({ cls: "lexvoice-outline-annotation-assignee-chip" });
        try { obsidian.setIcon(chip.createSpan({ cls: "lexvoice-outline-annotation-assignee-icon" }), "user"); } catch { /* intentionally empty */ }
        chip.createSpan({ text: entry.interaction.assignee });
      }
    } else if (metaKind === "assignee") {
      const chip = body.createDiv({ cls: "lexvoice-outline-annotation-assignee-chip is-leading" });
      try { obsidian.setIcon(chip.createSpan({ cls: "lexvoice-outline-annotation-assignee-icon" }), "user-check"); } catch { /* intentionally empty */ }
      chip.createSpan({ text: entry.interaction.assignee || "未指定" });
      if (entry.interaction.task) {
        const txt = body.createDiv({ cls: "lexvoice-outline-annotation-text" });
        try { void obsidian.MarkdownRenderer.render(this.app, entry.interaction.task, txt, sourcePath, this); }
        catch { txt.setText(entry.interaction.task); }
      }
    } else if (entry.text) {
      const txt = body.createDiv({ cls: "lexvoice-outline-annotation-text" });
      // 渲染 Markdown，让用户补充的内容里的 **粗体** / *斜体* / 列表等正常显示
      try { void obsidian.MarkdownRenderer.render(this.app, entry.text, txt, sourcePath, this); }
      catch (e) { console.warn("[LexVoice] annotation text markdown render failed", e); txt.setText(entry.text); }
    }
    if (entry.interaction && (entry.interaction.status || entry.interaction.response || entry.interaction.error)) {
      const status = entry.interaction.status || "";
      const reply = body.createDiv({ cls: `lexvoice-outline-annotation-ai ${status ? "is-" + status : ""}` });
      if (status === "running" || status === "pending") {
        reply.setText(status === "pending" ? "AI 将在转写空档补充..." : "AI 正在补充...");
      } else if (entry.interaction.response) {
        reply.empty();
        reply.createSpan({ cls: "lexvoice-outline-annotation-ai-label", text: "AI" });
        const replyBody = reply.createDiv({ cls: "lexvoice-outline-annotation-ai-body" });
        try { void obsidian.MarkdownRenderer.render(this.app, entry.interaction.response, replyBody, sourcePath, this); }
        catch (e) { console.warn("[LexVoice] annotation AI reply markdown render failed", e); replyBody.setText(entry.interaction.response); }
      } else if (entry.interaction.error) {
        reply.setText(`AI 补充失败：${entry.interaction.error}`);
      }
    }
    if (entry.materials && entry.materials.length) {
      const materials = body.createDiv({ cls: "lexvoice-outline-annotation-materials" });
      for (const item of entry.materials) this.renderMeetingMaterialChip(materials, item);
    }
    const removeBtn = row.createEl("button", { cls: "clickable-icon lexvoice-outline-annotation-remove", attr: { "aria-label": "移除这条补充", title: "移除" } });
    try { obsidian.setIcon(removeBtn, "x"); } catch { removeBtn.setText("×"); }
    removeBtn.onclick = () => {
      const current = normalizeMeetingWorkbench(session.meetingWorkbench);
      session.meetingWorkbench = normalizeMeetingWorkbench(Object.assign({}, current, {
        entries: current.entries.filter(item => item.id !== entry.id),
      }));
      this.render();
    };
    return container;
  }

  renderMeetingMaterialChip(parent, item) {
    const chip = parent.createDiv({ cls: "lexvoice-meeting-material-chip" });
    const icon = chip.createSpan({ cls: "lexvoice-meeting-material-icon" });
    try { obsidian.setIcon(icon, isImageMeetingMaterial(item) ? "image" : "paperclip"); }
    catch { icon.setText(isImageMeetingMaterial(item) ? "图" : "文"); }
    const label = chip.createSpan({ cls: "lexvoice-meeting-material-name", text: item.name || item.path });
    label.setAttr("title", item.path || item.name || "");
    chip.onclick = () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(item.path);
      if (file instanceof obsidian.TFile) this.plugin.app.workspace.getLeaf(false).openFile(file);
      else new obsidian.Notice("找不到这个材料文件");
    };
  }

  createMeetingMaterialInput(parent, session, options) {
    const input = parent.createEl("input", {
      attr: { type: "file", accept: options.accept || "" },
    });
    input.addClass("lexvoice-hidden-file-input");
    if (options.multiple !== false) input.setAttr("multiple", "true");
    if (options.capture) input.setAttr("capture", "environment");
    const cls = options.iconOnly ? "clickable-icon lexvoice-meeting-attach" : "";
    const btn = parent.createEl("button", { text: options.label || "添加材料", cls, attr: { title: options.label || "添加材料", "aria-label": options.label || "添加材料" } });
    if (options.icon) {
      btn.empty();
      try { obsidian.setIcon(btn, options.icon); } catch { /* intentionally empty */ }
      if (!options.iconOnly) btn.createSpan({ text: options.label || "添加材料" });
    }
    btn.onclick = () => input.click();
    input.addEventListener("change", async () => {
      try {
        await this.addMeetingMaterialFiles(session, Array.from(input.files || []), options.kind || "");
      } finally {
        input.value = "";
      }
    });
  }

  async addMeetingMaterialFiles(session, files, kind) {
    if (!session || !files || !files.length) return;
    const folder = this.getMeetingMaterialsFolder(session);
    await this.plugin.ensureFolder(folder);
    const current = normalizeMeetingWorkbench(session.meetingWorkbench);
    const added = [];
    for (const file of files) {
      if (!file) continue;
      const safeName = sanitizeFilename(file.name || "meeting-material") || "meeting-material";
      const targetPath = this.plugin.getAvailableVaultPath(obsidian.normalizePath(`${folder}/${safeName}`));
      if (!targetPath) continue;
      await this.plugin.app.vault.createBinary(targetPath, await file.arrayBuffer());
      added.push({
        path: targetPath,
        name: file.name || targetPath.split("/").pop() || targetPath,
        kind: kind || (String(file.type || "").startsWith("image/") ? "image" : "file"),
        addedAt: new Date().toISOString(),
      });
    }
    if (added.length) {
      const entry = {
        id: genId(),
        atMs: this.getMeetingWorkbenchOffsetMs(),
        createdAt: new Date().toISOString(),
        source: kind === "image" ? "image" : "material",
        text: kind === "image" ? "添加了图片/照片" : "添加了附件",
        materials: added,
      };
      session.meetingWorkbench = normalizeMeetingWorkbench(Object.assign({}, current, {
        entries: current.entries.concat(entry),
      }));
      new obsidian.Notice(`已添加 ${added.length} 个会中材料`);
    }
    this.render();
  }

  getMeetingWorkbenchOffsetMs() {
    const info = this.plugin.recorder && this.plugin.recorder.getInfo ? this.plugin.recorder.getInfo() : {};
    return Math.max(0, Number(info.elapsed) || 0);
  }

  updateMeetingWorkbenchEntry(session, entryId, updater) {
    if (!session || !entryId || typeof updater !== "function") return false;
    const current = normalizeMeetingWorkbench(session.meetingWorkbench);
    let changed = false;
    const entries = current.entries.map((item) => {
      if (item.id !== entryId) return item;
      changed = true;
      return Object.assign({}, item, updater(Object.assign({}, item)) || {});
    });
    if (!changed) return false;
    session.meetingWorkbench = normalizeMeetingWorkbench(Object.assign({}, current, { entries }));
    this.render();
    return true;
  }

  buildMeetingWorkbenchInteractionContext(session, entry) {
    const atMs = Number(entry && entry.atMs) || 0;
    const before = [];
    const after = [];
    for (const s of (Array.isArray(session && session.segments) ? session.segments : [])) {
      if (!s || !s.text) continue;
      const start = Number(s.startOffsetMs) || 0;
      const end = Number(s.endOffsetMs ?? s.startOffsetMs) || start;
      const line = clipMeetingInteractionSegmentLine(`[${formatElapsed(start)}-${formatElapsed(end)}] ${String(s.text || "").trim()}`);
      if (end <= atMs) before.push(line);
      else if (start >= atMs) after.push(line);
    }
    return [
      session && session.realtimeOutline ? `【当前实时大纲】\n${clipRealtimeContextText(String(session.realtimeOutline).trim(), MEETING_INTERACTION_OUTLINE_MAX_CHARS)}` : "",
      session && session.realtimeOutlineMemory ? `【主题记忆】\n${clipRealtimeContextText(String(session.realtimeOutlineMemory).trim(), MEETING_INTERACTION_MEMORY_MAX_CHARS)}` : "",
      before.length ? `【该记录前的转写片段】\n${before.slice(-3).join("\n")}` : "",
      after.length ? `【该记录后的转写片段】\n${after.slice(0, 1).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  async processMeetingWorkbenchInteraction(session, entryId) {
    if (!session || !entryId) return;
    const workbench = normalizeMeetingWorkbench(session.meetingWorkbench);
    const entry = workbench.entries.find(item => item.id === entryId);
    if (!entry || !entry.interaction || !entry.interaction.kind) return;
    // 元数据 kinds（assignee / todo）不走 AI 助理
    if (MEETING_METADATA_KINDS.has(entry.interaction.kind)) return;
    if (entry.interaction.status === "running" || entry.interaction.status === "done") return;
    this.updateMeetingWorkbenchEntry(session, entryId, (item) => ({
      interaction: Object.assign({}, item.interaction, { status: "running", error: "", updatedAt: new Date().toISOString() }),
    }));
    try {
      const latest = normalizeMeetingWorkbench(session.meetingWorkbench).entries.find(item => item.id === entryId) || entry;
      const context = this.buildMeetingWorkbenchInteractionContext(session, latest);
      const kind = latest.interaction.kind;
      const label = kind === "concept" ? "概念解释" : (kind === "question" ? "问题回答" : "重点处理");
      const system = "你是 LexVoice 的会中即时助理。只回答用户这条会中记录，不改写实时大纲，不生成完整纪要。回答要短、具体、可直接挂在这条记录下面。";
      const user = [
        `会中记录时间：${formatElapsed(latest.atMs || 0)}`,
        `触发类型：${label}`,
        `用户原文：${latest.text || latest.interaction.query}`,
        "",
        context || "当前还没有足够转写上下文，请主要根据用户问题本身作答。",
        "",
        "回答规则：",
        "- #概念：给出定义、怎么使用、上下位概念、在当前语境里的意义；最多 5 条短句。",
        "- ?问题：直接回答问题，并结合当前大纲/转写上下文；最多 5 条短句。",
        "- !重点：说明这条重点为什么要保留、最终纪要应如何处理；最多 4 条短句。",
        "- 不要写“未提及”“待确认”这类空字段；信息不足时直接说“现有上下文不足以判断”。",
        "- 不要声称做了声纹识别，不要编造人物责任。",
      ].join("\n");
      const raw = await callLlm(this.plugin, system, user, {
        timeoutMs: MEETING_INTERACTION_TIMEOUT_MS,
        payload: { max_tokens: getMeetingInteractionMaxTokens(kind) },
        priority: "user",
        noRetry: true,
      });
      const response = String(raw || "").trim();
      this.updateMeetingWorkbenchEntry(session, entryId, (item) => ({
        interaction: Object.assign({}, item.interaction, {
          status: "done",
          response: response || "现有上下文不足以判断。",
          error: "",
          updatedAt: new Date().toISOString(),
        }),
      }));
    } catch (e) {
      console.error("[LexVoice] meeting workbench interaction failed", e);
      this.updateMeetingWorkbenchEntry(session, entryId, (item) => ({
        interaction: Object.assign({}, item.interaction, {
          status: "error",
          error: (e && e.message) || String(e),
          updatedAt: new Date().toISOString(),
        }),
      }));
      await this.plugin.logDiagnostic("warn", "meeting_workbench.interaction_failed", "会中记录 AI 互动失败", {
        entryId,
        mode: session.mode,
        error: diagnosticError(e),
      });
    }
  }

  addMeetingWorkbenchEntry(session, entry) {
    if (!session) return;
    const current = normalizeMeetingWorkbench(session.meetingWorkbench);
    const nextEntry = Object.assign({
      id: genId(),
      atMs: this.getMeetingWorkbenchOffsetMs(),
      createdAt: new Date().toISOString(),
      source: "manual",
      text: "",
      materials: [],
      interaction: null,
    }, entry || {});
    if (!nextEntry.interaction) {
      const interaction = detectMeetingWorkbenchInteraction(nextEntry.text);
      if (interaction) {
        const isMetadata = MEETING_METADATA_KINDS.has(interaction.kind);
        nextEntry.interaction = Object.assign({}, interaction, {
          status: isMetadata ? "done" : "pending",
          response: "",
          error: "",
          updatedAt: new Date().toISOString(),
        });
      }
    }
    session.meetingWorkbench = normalizeMeetingWorkbench(Object.assign({}, current, {
      draft: current.draft,
      entries: current.entries.concat(nextEntry),
    }));
    this.render();
    if (nextEntry.interaction && nextEntry.interaction.kind && !MEETING_METADATA_KINDS.has(nextEntry.interaction.kind)) {
      this.plugin.scheduleMeetingWorkbenchInteraction(session, nextEntry.id);
    }
  }

  addMeetingWorkbenchTextEntry(session, text) {
    const value = String(text || "").trim();
    if (!value) return;
    const current = normalizeMeetingWorkbench(session.meetingWorkbench);
    const entry = {
      id: genId(),
      atMs: this.getMeetingWorkbenchOffsetMs(),
      createdAt: new Date().toISOString(),
      source: "manual",
      text: value,
      materials: [],
      interaction: null,
    };
    const interaction = detectMeetingWorkbenchInteraction(value);
    if (interaction) {
      const isMetadata = MEETING_METADATA_KINDS.has(interaction.kind);
      entry.interaction = Object.assign({}, interaction, {
        // 元数据型（@assignee / /todo）直接落 done，无需 AI 助理处理
        status: isMetadata ? "done" : "pending",
        response: "",
        error: "",
        updatedAt: new Date().toISOString(),
      });
    }
    session.meetingWorkbench = normalizeMeetingWorkbench(Object.assign({}, current, {
      draft: "",
      entries: current.entries.concat(entry),
    }));
    this.render();
    // 只为非元数据 kinds 排队 AI 即时助理
    if (entry.interaction && entry.interaction.kind && !MEETING_METADATA_KINDS.has(entry.interaction.kind)) {
      this.plugin.scheduleMeetingWorkbenchInteraction(session, entry.id);
    }
  }

  renderSegments(root, session) {
    const segWrap = root.createDiv({ cls: "lexvoice-outline-section" });
    segWrap.createDiv({ cls: "lexvoice-outline-section-title", text: `段落 · ${session.segments.length}` });
    const list = segWrap.createDiv({ cls: "lexvoice-outline-segments" });
    session.segments.forEach((s) => {
      const row = list.createDiv({ cls: "lexvoice-outline-seg" });
      const dotCls = s.error ? "is-failed" : (s.text ? "is-done" : "is-pending");
      const dot = row.createDiv({ cls: `lexvoice-outline-seg-dot ${dotCls}` });
      dot.setAttribute("aria-label", s.error ? "失败" : (s.text ? "已转写" : "等待中"));
      const body = row.createDiv({ cls: "lexvoice-outline-seg-body" });
      body.createDiv({ cls: "lexvoice-outline-seg-time",
        text: `${formatElapsed(s.startOffsetMs)} – ${formatElapsed(s.endOffsetMs)}` });
      const preview = s.error
        ? `失败：${s.error}`
        : (s.text ? s.text.slice(0, 80) + (s.text.length > 80 ? "…" : "") : "等待转写");
      body.createDiv({ cls: "lexvoice-outline-seg-text", text: preview });
    });
  }

  renderAIOutline(root, session, recInfo = null, recordingIssue = null) {
    const aiWrap = root.createDiv({ cls: "lexvoice-outline-section lexvoice-outline-ai-section" });
    const aiHead = aiWrap.createDiv({ cls: "lexvoice-outline-ai-head is-utility" });
    const aiTitle = aiHead.createDiv({ cls: "lexvoice-outline-source-title" });
    const aiIcon = aiTitle.createSpan({ cls: "lexvoice-outline-source-icon" });
    try { obsidian.setIcon(aiIcon, session && session.mode === "recruit" ? "user-check" : "sparkles"); } catch { /* intentionally empty */ }
    aiTitle.createSpan({ text: session && session.mode === "recruit" ? "AI 面试大纲" : "AI 整理大纲" });
    aiHead.createDiv({ cls: "lexvoice-outline-source-badge", text: session && session.mode === "recruit" ? "转写 + AI 判断" : "由转写整理" });
    const refreshBtn = aiHead.createEl("button", { text: this.outlineRunning ? "停止等待" : "刷新" });
    refreshBtn.disabled = !session || session.segments.length === 0;
    refreshBtn.onclick = () => {
      if (this.outlineRunning) this.cancelOutlineGeneration();
      else void this.refreshAIOutline();
    };

    const body = aiWrap.createDiv({ cls: "lexvoice-outline-ai-body" });
    // 招聘需求挖掘：会中渲染"画像字段树 + 覆盖状态"，早 return，绝不进入下方 time-based rail 渲染。
    // 严格 === 'recruit-needs'，不与老 recruit 面试模式（is-recruit-mode / 🤖⛏❓）串台。
    if (session && session.mode === "recruit-needs") {
      this.renderRecruitNeedsOutlineDom(body, session);
      return;
    }
    const outlineText = normalizeOutlineMarkdownForDisplay(this.aiOutline || (session && session.realtimeOutline) || "");
    if (outlineText) {
      const isRecruit = session && session.mode === "recruit";
      if (isRecruit) body.addClass("is-recruit-mode");
      const sourcePath = session && session.mdPath ? session.mdPath : "";
      // 招聘面试模式：给含语义标记的列表项打 class（由 CSS 上色区分），并把行首 emoji 剥掉——不显示 emoji。
      // 确定性渲染路径（applyOutlineMarkerIcon）会换成 lucide 图标；这条 MarkdownRenderer 回退路径至少做到「无 emoji + 颜色区分」。
      const stripLeadingMarker = (li, emoji) => {
        const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.textContent.replace(/\s+/g, "")) node = walker.nextNode();
        if (!node) return;
        const t = node.textContent;
        const i = t.indexOf(emoji);
        if (i >= 0) node.textContent = t.slice(0, i) + t.slice(i + emoji.length).replace(/^[️‍\s]+/, "");
      };
      const tagListItems = () => {
        if (!isRecruit) return;
        const markers = [["🤖", "lexvoice-ai-eval"], ["⛏", "lexvoice-ai-followup"], ["❓", "lexvoice-ai-question"], ["💬", "lexvoice-ai-answer"]];
        const lis = body.querySelectorAll("li");
        for (const li of lis) {
          const text = (li.textContent || "").trim();
          const hit = markers.find((m) => text.startsWith(m[0]));
          if (hit) { li.addClass(hit[1]); stripLeadingMarker(li, hit[0]); }
          else if (/^[?？]\s*/.test(text)) li.addClass("lexvoice-ai-question");
        }
      };
      const decorateAfterRender = () => {
        this.enhanceRenderedOutline(body, { sourcePath });
        this.injectOutlineAnnotationsByTime(body, session);
        this.decorateLiveOutlineChapters(body, session, recInfo);
        if (recordingIssue && recordingIssue.kind === "network") this.renderNetworkOutlineGap(body, recordingIssue, recInfo);
        tagListItems();
      };
      // 优先用确定性的直接渲染（绕过 MarkdownRenderer，消除对其 DOM 结构的强耦合）；
      // 解析不出节点（如纯段落）时回退 MarkdownRenderer，保证不退化。
      if (this.renderOutlineRailDom(body, outlineText)) {
        decorateAfterRender();
      } else {
        const rendered = obsidian.MarkdownRenderer.render(this.app, outlineText, body, sourcePath, this);
        void Promise.resolve(rendered).then(decorateAfterRender);
      }
    } else if (recordingIssue && recordingIssue.kind === "service") {
      this.renderServiceOutlineFallback(body);
    } else {
      const emptyEl = body.createEl("div", { cls: "lexvoice-outline-empty" });
      if (!(session.segments.length > 0)) {
        emptyEl.setText("录音开始且产出第一段后可生成大纲。");
      } else if (session && session.mode === "recruit") {
        // 不用 emoji——AI 评价 / 追问建议 用与大纲同款的 lucide 图标 + 语义色（见 applyOutlineMarkerIcon）区分。
        emptyEl.appendText("点「刷新」生成面试大纲——按问题组织，含候选人回答要点，另用 ");
        const ai = emptyEl.createSpan({ cls: "lexvoice-outline-legend lexvoice-ai-eval" });
        try { obsidian.setIcon(ai.createSpan({ cls: "lexvoice-outline-marker-icon" }), "bot"); } catch { /* intentionally empty */ }
        ai.createSpan({ text: "AI 评价" });
        emptyEl.appendText(" 与 ");
        const fu = emptyEl.createSpan({ cls: "lexvoice-outline-legend lexvoice-ai-followup" });
        try { obsidian.setIcon(fu.createSpan({ cls: "lexvoice-outline-marker-icon" }), "search"); } catch { /* intentionally empty */ }
        fu.createSpan({ text: "追问建议" });
        emptyEl.appendText(" 标注。");
      } else {
        emptyEl.setText("点「刷新」生成大纲——把零散发言归并到共同的上层概念。");
      }
      this.renderOutlineAnnotations(body, session);
      if (recordingIssue && recordingIssue.kind === "network") this.renderNetworkOutlineGap(body, recordingIssue, recInfo);
    }
  }

  renderServiceOutlineFallback(parent) {
    const box = parent.createDiv({ cls: "lexvoice-outline-safe-empty" });
    const icon = box.createDiv({ cls: "lexvoice-outline-safe-empty-icon" });
    try { obsidian.setIcon(icon, "mic"); } catch { /* intentionally empty */ }
    box.createDiv({ cls: "lexvoice-outline-safe-empty-title", text: "录音持续中" });
    box.createDiv({ cls: "lexvoice-outline-safe-empty-desc", text: "本地保存安全，结束后可重新生成大纲。" });
  }

  renderNetworkOutlineGap(parent, issue, recInfo) {
    const gap = parent.createDiv({ cls: "lexvoice-outline-network-gap" });
    const anchor = gap.createDiv({ cls: "lexvoice-outline-network-gap-anchor" });
    anchor.createDiv({ cls: "lexvoice-outline-network-gap-dot" });
    anchor.createDiv({ cls: "lexvoice-outline-network-gap-time", text: "--:--" });
    const body = gap.createDiv({ cls: "lexvoice-outline-network-gap-body" });
    body.createDiv({ cls: "lexvoice-outline-network-gap-title", text: "大纲生成已暂停" });
    const started = Number(issue && issue.startedAtMs);
    const elapsed = Number.isFinite(started) ? started : Math.max(0, Number(recInfo && recInfo.elapsed) || 0);
    body.createDiv({ cls: "lexvoice-outline-network-gap-desc", text: `录音从 ${formatElapsed(elapsed)} 起持续记录中。` });
  }

  renderOutlineAnnotations(parent, session) {
    if (!session) return;
    const workbench = normalizeMeetingWorkbench(session.meetingWorkbench);
    if (!workbench.entries.length && !workbench.notes && !workbench.materials.length) return;
    const wrap = parent.createDiv({ cls: "lexvoice-outline-annotations" });
    if (workbench.notes || workbench.materials.length) {
      const legacy = wrap.createDiv({ cls: "lexvoice-outline-annotation is-manual is-pending" });
      legacy.createDiv({ cls: "lexvoice-outline-annotation-time is-manual", text: "补充" });
      const body = legacy.createDiv({ cls: "lexvoice-outline-annotation-body" });
      if (workbench.notes) body.createDiv({ cls: "lexvoice-outline-annotation-text", text: workbench.notes });
      if (workbench.materials.length) {
        const materials = body.createDiv({ cls: "lexvoice-outline-annotation-materials" });
        for (const item of workbench.materials) this.renderMeetingMaterialChip(materials, item);
      }
    }
    for (const entry of workbench.entries) this.renderOutlineAnnotationEntry(wrap, session, entry);
  }

  injectOutlineAnnotationsByTime(body, session) {
    if (!body || !session) return;
    const workbench = normalizeMeetingWorkbench(session.meetingWorkbench);
    if (!workbench.entries.length) return;
    const children = Array.from(body.children || []);
    const topList = children.find((child) => child && child.classList && child.classList.contains("lexvoice-outline-time-rail"))
      || children.find((child) => child && /^(UL|OL)$/i.test(child.tagName || ""));
    if (!topList) {
      this.renderOutlineAnnotations(body, session);
      return;
    }
    const timedItems = Array.from(topList.children || [])
      .filter((child) => child && /^(LI)$/i.test(child.tagName || ""))
      .map((li) => {
        const links = Array.from(li.querySelectorAll("a.lexvoice-time-link"))
          .filter((link) => link.closest("li") === li);
        const leading = links.find((link) => link.classList.contains("lexvoice-outline-leading-time")) || links[0];
        const ms = leading ? parseElapsedMsToken((leading.textContent || "").trim()) : NaN;
        return { li, ms: Number.isFinite(ms) ? ms : null };
      })
      .filter((item) => item.ms !== null);
    if (!timedItems.length) {
      this.renderOutlineAnnotations(body, session);
      return;
    }
    const entries = workbench.entries.slice().sort((a, b) => (a.atMs || 0) - (b.atMs || 0));
    for (const entry of entries) {
      const node = this.renderOutlineAnnotationEntry(topList, session, entry, { asListItem: true });
      const atMs = Number(entry.atMs) || 0;
      const anchor = timedItems.find((item) => item.ms > atMs);
      if (anchor && anchor.li && node) topList.insertBefore(node, anchor.li);
      else if (node) topList.appendChild(node);
    }
  }

  // 直接从大纲文本确定性构造时间轴 DOM（绕过 MarkdownRenderer）。
  // 动机：原链路 markdown → MarkdownRenderer → 在产出的 DOM 上"猜"哪个是顶层并打 timeline class，
  // 对渲染器的 DOM 结构强耦合，是大纲视图最脆弱的一环。这里用 parseRealtimeOutlineStateFromMarkdown
  // 把文本解析成节点，再亲手构造和 MarkdownRenderer 语义一致的 <ul><li>（含子项嵌套 <ul>），
  // 结构完全由代码掌控，下游 enhanceRenderedOutline / 批注 / 章节注入都能原样工作。
  // 返回 true 表示已渲染；false 表示无可用节点（调用方回退 MarkdownRenderer）。
  renderOutlineRailDom(body, outlineText) {
    const nodes = parseRealtimeOutlineStateFromMarkdown(outlineText);
    if (!nodes.length) return false;
    const ul = body.createEl("ul");
    const anchorRe = /\[\[([^\]\n|]+)\|([^\]\n]+)\]\]/;
    for (const node of nodes) {
      const li = ul.createEl("li");
      if (node && node.anchor) {
        const m = anchorRe.exec(node.anchor);
        if (m) {
          const file = String(m[1] || "").trim();
          const label = String(m[2] || "").trim();
          // 与 MarkdownRenderer 对 [[file|label]] 的产出一致：a.internal-link + data-href/href。
          // 随后 enhanceAudioTimeLinks 会给它加 lexvoice-time-link + 点击回听；promoteOutlineTimeLinks 加 rail class。
          const a = li.createEl("a", { cls: "internal-link", text: label, href: file });
          a.setAttribute("data-href", file);
          li.appendText(" ");
        }
      }
      li.appendText(this.applyOutlineMarkerIcon(li, String((node && node.title) || "")));
      const children = node && Array.isArray(node.children) ? node.children : [];
      if (children.length) {
        const sub = li.createEl("ul");
        for (const child of children) {
          const t0 = String(child || "").trim();
          if (!t0) continue;
          const cli = sub.createEl("li");
          cli.appendText(this.applyOutlineMarkerIcon(cli, t0));
        }
      }
    }
    return true;
  }

  // 招聘模式的语义标记：模型用 emoji 标出条目类型（❓提问 / 💬候选人回答 / 🤖AI评价 / ⛏追问）。
  // emoji 难看——这里把行首 emoji 剥掉，改成对应 Lucide 图标 + 类型 class（颜色由 CSS 控）。
  // 返回去掉标记后的文本。emoji 仍保留在底层状态/文本里作为语义信号，只是不直接显示。
  applyOutlineMarkerIcon(li, text) {
    const markers = [
      { emoji: "❓", cls: "lexvoice-ai-question", icon: "help-circle" },
      { emoji: "？", cls: "lexvoice-ai-question", icon: "help-circle" },
      { emoji: "?", cls: "lexvoice-ai-question", icon: "help-circle" },
      { emoji: "💬", cls: "lexvoice-ai-answer", icon: "message-square" },
      { emoji: "🤖", cls: "lexvoice-ai-eval", icon: "bot" },
      { emoji: "⛏", cls: "lexvoice-ai-followup", icon: "search" },
    ];
    const s = String(text || "");
    for (const mk of markers) {
      if (s.startsWith(mk.emoji)) {
        li.addClass(mk.cls);
        const iconSpan = li.createSpan({ cls: "lexvoice-outline-marker-icon" });
        try { obsidian.setIcon(iconSpan, mk.icon); } catch { /* intentionally empty */ }
        // 去掉 emoji 本体 + 可能跟随的变体选择符(️)/零宽连接符 + 空白
        return s.slice(mk.emoji.length).replace(/^[️‍\s]+/, "");
      }
    }
    return s;
  }

  // 招聘需求挖掘 · 会中"画像字段树"渲染（structure-based，非 time-based）。
  // 直接从 session.jobPortraitCoverage 确定性构造 DOM：顶部 N/14 进度 + 4 分组 + 14 叶
  // （三态 lucide 图标 covered/partial/missing + evidence 回听锚点 + partial 的缺口提示）。
  // 点击回听复用 enhanceAudioTimeLinks；绝不调 enhanceRenderedOutline/promoteOutlineTimeLinks（依赖 time-rail，对字段树有害）。
  renderRecruitNeedsOutlineDom(body, session) {
    const cov = (session && session.jobPortraitCoverage) || {};
    const dims = (cov && cov.dims) || {};
    const get = (key) => dims[key] || { status: "missing", evidence_anchor: "", missing_what: "" };
    const total = JOBPORTRAIT_DIMENSIONS.length;
    const coveredCount = JOBPORTRAIT_DIMENSIONS.filter((d) => get(d.key).status === "covered").length;
    const anchorRe = /\[\[([^\]\n|]+)\|([^\]\n]+)\]\]/;

    const head = body.createDiv({ cls: "lexvoice-outline-jobportrait-head" });
    head.createSpan({ cls: "lexvoice-outline-jobportrait-progress", text: `岗位画像 ─ ${coveredCount}/${total}` });

    // Phase 3 会中"追问建议"：从覆盖态派生追问卡（节奏控制 K + 已问/忽略本场压制），放最顶最显眼。
    const followupSuppressed = new Set(Object.keys((session && session.followupFeedback) || {}));
    const followupCards = deriveFollowupCards(dims, {
      rules: JOBPORTRAIT_FOLLOWUP_RULES,
      dimOrder: JOBPORTRAIT_DIMENSIONS,
      suppressed: followupSuppressed,
      maxCards: JOBPORTRAIT_FOLLOWUP_MAX_CARDS,
    });
    if (followupCards.length) {
      const wrap = body.createDiv({ cls: "lexvoice-outline-followup" });
      const ftitle = wrap.createDiv({ cls: "lexvoice-outline-followup-title" });
      const tIco = ftitle.createSpan({ cls: "lexvoice-outline-followup-title-icon" });
      try { obsidian.setIcon(tIco, "help-circle"); } catch { /* intentionally empty */ }
      ftitle.createSpan({ cls: "lexvoice-outline-followup-title-text", text: `建议追问（${followupCards.length}）` });
      for (const card of followupCards) {
        const c = wrap.createDiv({ cls: "lexvoice-outline-followup-card lexvoice-followup-status-" + card.status });
        const ch = c.createDiv({ cls: "lexvoice-followup-card-head" });
        const dico = ch.createSpan({ cls: "lexvoice-followup-dim-icon" });
        try { obsidian.setIcon(dico, JOBPORTRAIT_COVERAGE_ICON[card.status] || "circle"); } catch { /* intentionally empty */ }
        ch.createSpan({ cls: "lexvoice-followup-dim-name", text: card.name });
        ch.createSpan({ cls: "lexvoice-followup-badge", text: card.status === "missing" ? "缺失" : "模糊" });
        if (card.reason) c.createDiv({ cls: "lexvoice-followup-reason", text: card.reason });
        if (card.question) c.createDiv({ cls: "lexvoice-followup-question", text: card.question });
        const acts = c.createDiv({ cls: "lexvoice-followup-actions" });
        const mkBtn = (icon, label, fb) => {
          const b = acts.createEl("button", { cls: "lexvoice-followup-btn", attr: { type: "button", "aria-label": label, title: label } });
          const bi = b.createSpan({ cls: "lexvoice-followup-btn-icon" });
          try { obsidian.setIcon(bi, icon); } catch { /* intentionally empty */ }
          b.createSpan({ cls: "lexvoice-followup-btn-text", text: label });
          b.onclick = () => {
            if (!session.followupFeedback) session.followupFeedback = {};
            session.followupFeedback[card.key] = fb; // session 级，换场清零，不跨岗位污染
            try { this.scheduleUpdate(); } catch { /* intentionally empty */ }
          };
        };
        mkBtn("check", "已问", "asked");
        mkBtn("x", "忽略", "dismissed");
      }
    }

    for (const g of JOBPORTRAIT_GROUP_ORDER) {
      const groupDims = JOBPORTRAIT_DIMENSIONS.filter((d) => d.group === g);
      if (!groupDims.length) continue;
      const groupCovered = groupDims.filter((d) => get(d.key).status === "covered").length;
      const group = body.createDiv({ cls: "lexvoice-outline-dim-group" });
      group.createDiv({ cls: "lexvoice-outline-dim-group-title", text: `${JOBPORTRAIT_GROUP_LABEL[g]} ─ ${groupCovered}/${groupDims.length}` });
      for (const d of groupDims) {
        const item = get(d.key);
        const status = ["covered", "partial", "missing"].includes(item.status) ? item.status : "missing";
        const leaf = group.createDiv({ cls: "lexvoice-outline-dim-leaf lexvoice-outline-dim-status-" + status });
        const ico = leaf.createSpan({ cls: "lexvoice-outline-marker-icon" });
        try { obsidian.setIcon(ico, JOBPORTRAIT_COVERAGE_ICON[status] || "circle"); } catch { /* intentionally empty */ }
        leaf.createSpan({ cls: "lexvoice-outline-dim-name", text: d.name });
        // evidence 回听锚点（仅 covered/partial 且锚点合法）：造 a.internal-link 种子，由 enhanceAudioTimeLinks 挂点击
        if (status !== "missing" && item.evidence_anchor) {
          const mm = anchorRe.exec(item.evidence_anchor);
          if (mm) {
            const file = String(mm[1] || "").trim();
            const label = String(mm[2] || "").trim();
            const a = leaf.createEl("a", { cls: "internal-link lexvoice-outline-dim-evidence", text: label, href: file });
            a.setAttribute("data-href", file);
          }
        }
        // partial 的"缺什么"提示（missing 维度只留灰名，详情在会后画像的"待追问"里，会中保持紧凑）
        if (status === "partial" && item.missing_what) {
          leaf.createSpan({ cls: "lexvoice-outline-dim-missing", text: `（${item.missing_what}）` });
        }
      }
    }

    if (!coveredCount && !Object.keys(dims).length) {
      const segN = (session && session.segments && session.segments.length) || 0;
      body.createDiv({ cls: "lexvoice-outline-empty", text: segN > 0
        ? `正在按 14 维实时扫描覆盖度…（已录 ${segN} 段，稍候自动刷新）`
        : "录音开始后，AI 会按 14 个画像维度实时标出覆盖进度。" });
    }
    // 点击回听：只调 enhanceAudioTimeLinks（认 a.internal-link[data-href=音频][text=HH:MM]），零额外代码。
    try { this.plugin.enhanceAudioTimeLinks(body, { sourcePath: (session && session.mdPath) || "" }); } catch { /* intentionally empty */ }
  }

  enhanceRenderedOutline(body, opts) {
    if (!body) return;
    this.plugin.enhanceAudioTimeLinks(body, opts || {});
    this.decorateOutlineSourceTags(body);
    this.promoteOutlineTimeLinks(body);
  }

  promoteOutlineTimeLinks(body) {
    if (!body) return;
    const listItems = body.querySelectorAll("li");
    for (const li of listItems) {
      const list = li.parentElement;
      const listParent = list ? list.parentElement : null;
      const isTopLevel = list && listParent && /^(UL|OL)$/i.test(list.tagName || "") && !listParent.closest("li");
      const links = Array.from(li.querySelectorAll("a.lexvoice-time-link"))
        .filter((link) => link.closest("li") === li);
      if (!links.length) continue;
      if (!isTopLevel) {
        links.forEach((link) => link.addClass("lexvoice-outline-secondary-time"));
        continue;
      }
      list.addClass("lexvoice-outline-time-rail");
      const first = links[0];
      if (first.classList.contains("lexvoice-outline-leading-time")) continue;
      first.classList.add("lexvoice-outline-leading-time");
      li.addClass("lexvoice-outline-has-leading-time");
      const directParagraph = Array.from(li.children || []).find((child) => child && child.tagName === "P");
      const target = directParagraph || li;
      target.insertBefore(first, target.firstChild);
      for (const extra of links.slice(1)) extra.addClass("lexvoice-outline-secondary-time");
    }
    // 连续重复时间戳标记：段落切分粗时（如段5是5分钟），多个 L1 可能都只能锚到段起点（同一个 [[file|08:00]]）
    // 视觉上两个相邻 08:00 看像 bug，但实际跳转是对的。给第二个开始的连续重复打 .is-duplicate-time，
    // CSS 把时间文字淡化 / 替换成 ↘ 延续标志；rail 圆点和点击仍正常工作
    const rails = body.querySelectorAll("ul.lexvoice-outline-time-rail");
    for (const rail of rails) {
      for (const child of Array.from(rail.children || [])) {
        if (!child || child.tagName !== "LI" || !child.classList) continue;
        if (!child.classList.contains("lexvoice-outline-has-leading-time") && !child.classList.contains("lexvoice-outline-annotation-li")) {
          child.classList.add("lexvoice-outline-untimed-top");
        } else {
          child.classList.remove("lexvoice-outline-untimed-top");
        }
      }
      const leadingLinks = rail.querySelectorAll(":scope > li .lexvoice-outline-leading-time");
      let prevHref = "";
      let prevText = "";
      for (const link of leadingLinks) {
        const href = link.getAttribute("data-href") || link.getAttribute("href") || "";
        const text = (link.textContent || "").trim();
        // 只标连续完全相同的（同 href + 同显示文字）
        if (href && href === prevHref && text && text === prevText) {
          link.classList.add("is-duplicate-time");
          const parentLi = link.closest("li");
          if (parentLi) parentLi.classList.add("lexvoice-outline-duplicate-leading");
        }
        prevHref = href;
        prevText = text;
      }
    }
  }

  decorateOutlineSourceTags(body) {
    if (!body) return;
    const sourceDefs = {
      "麦克风": { cls: "is-mic", icon: "mic", title: "麦克风输入" },
      "电脑音频": { cls: "is-computer", icon: "monitor-speaker", title: "电脑音频输入" },
    };
    const findFirstTextNode = (node) => {
      const walker = activeDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let current;
      while ((current = walker.nextNode())) {
        if ((current.nodeValue || "").trim()) return current;
      }
      return null;
    };
    const listItems = body.querySelectorAll("li");
    for (const li of listItems) {
      if (Array.from(li.children || []).some((child) => child.classList && child.classList.contains("lexvoice-outline-source-chip"))) continue;
      const textNode = findFirstTextNode(li);
      if (!textNode) continue;
      const raw = textNode.nodeValue || "";
      const match = raw.match(/^(\s*)[[【](麦克风|电脑音频)[\]】]\s*/);
      if (!match) continue;
      const def = sourceDefs[match[2]];
      if (!def) continue;
      textNode.nodeValue = raw.slice(match[0].length);
      if (match[2] === "麦克风") continue;
      const chip = activeDocument.createElement("span");
      chip.className = `lexvoice-outline-source-chip ${def.cls}`;
      chip.setAttribute("title", def.title);
      chip.setAttribute("aria-label", def.title);
      try { obsidian.setIcon(chip, def.icon); }
      catch { chip.textContent = match[2] === "麦克风" ? "M" : "C"; }
      // 把图标挂到 li 的"标题段落"末尾（句尾右对齐由 CSS 控制）
      // 优先放在第一个 <p> 末尾；没有 <p> 时直接放 li 末尾
      this.appendOutlineTitleAdornment(li, chip);
      li.addClass("lexvoice-outline-source-tagged");
    }
  }

  getRecentFilters() {
    const filters = this.recentFilters || {};
    return {
      time: filters.time || "week",
      mode: filters.mode || "all",
    };
  }

  getDefaultRecentFilters() {
    return { time: "week", mode: "all" };
  }

  isRecentFilterActive(kind, value) {
    const defaults = this.getDefaultRecentFilters();
    return (value || "all") !== (defaults[kind] || "all");
  }

  hasActiveRecentFilters() {
    const filters = this.getRecentFilters();
    return Object.keys(filters).some((key) => this.isRecentFilterActive(key, filters[key]));
  }

  setRecentFilter(key, value) {
    this.recentFilters = { ...this.getRecentFilters(), [key]: value || "all" };
    this.showRecentHome = true;
    this.idlePanelTab = "recent";
    this.render();
  }

  resetRecentFilters() {
    this.recentFilters = this.getDefaultRecentFilters();
    this.showRecentHome = true;
    this.idlePanelTab = "recent";
    this.render();
  }

  getRecentModeFilterOptions() {
    const opts = [{ id: "all", label: "全部模板" }];
    for (const [mode, label] of getVisibleModeEntries(this.plugin.settings, false)) {
      opts.push({ id: mode, label });
    }
    return opts;
  }

  getRecentTopicFilterOptions(recents) {
    const seen = new Set();
    const options = [{ id: "all", label: "全部主题" }];
    const add = (topic) => {
      const token = normalizeRecentTopicToken(topic);
      if (!token || seen.has(token)) return;
      seen.add(token);
      options.push({ id: token, label: `${token}主题` });
    };
    for (const topic of RECENT_TOPIC_FALLBACKS) add(topic);
    for (const item of recents || []) {
      for (const topic of item.topics || []) add(topic);
    }
    return options.slice(0, 18);
  }

  getRecentFilterLabel(kind, value, recents) {
    const v = value || "all";
    if (kind === "time") return (RECENT_TIME_FILTER_OPTIONS.find(item => item.id === v) || RECENT_TIME_FILTER_OPTIONS[0]).label;
    if (kind === "mode") return (this.getRecentModeFilterOptions().find(item => item.id === v) || { label: "全部模板" }).label;
    return "筛选";
  }

  matchesRecentTimeFilter(item, timeFilter) {
    const filter = timeFilter || "week";
    if (filter === "all") return true;
    const moment = window.moment;
    if (moment) {
      const t = moment(item.timestamp);
      const now = moment();
      if (filter === "today") return t.isSame(now, "day");
      if (filter === "month") return t.isSame(now, "month");
      return t.isSame(now, "week");
    }
    const d = new Date(item.timestamp);
    const now = new Date();
    if (filter === "today") return d.toDateString() === now.toDateString();
    if (filter === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    const age = now.getTime() - d.getTime();
    return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
  }

  applyRecentFilters(recents) {
    const filters = this.getRecentFilters();
    return (recents || []).filter((item) => {
      if (!this.matchesRecentTimeFilter(item, filters.time)) return false;
      if (filters.mode !== "all" && item.mode !== filters.mode) return false;
      return true;
    });
  }

  showRecentFilterMenu(evt, kind, options, currentValue) {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new obsidian.Menu();
    let currentGroup = "";
    for (const opt of options) {
      if (opt.group && opt.group !== currentGroup) {
        if (currentGroup) menu.addSeparator();
        currentGroup = opt.group;
        menu.addItem((item) => item.setTitle(opt.group).setDisabled(true));
      }
      menu.addItem((item) => {
        item.setTitle(opt.label);
        if (opt.id === currentValue) item.setIcon("check");
        item.onClick(() => this.setRecentFilter(kind, opt.id));
      });
    }
    const target = evt.currentTarget instanceof HTMLElement
      ? evt.currentTarget
      : evt.target instanceof HTMLElement
        ? evt.target.closest(".lexvoice-outline-recent-filter-chip")
        : null;
    if (target && typeof menu.showAtPosition === "function") {
      const rect = target.getBoundingClientRect();
      const menuWidthHint = 240;
      const x = Math.max(8, Math.min(Math.round(rect.left), Math.max(8, window.innerWidth - menuWidthHint - 8)));
      const y = Math.max(8, Math.min(Math.round(rect.bottom + 8), Math.max(8, window.innerHeight - 8)));
      menu.showAtPosition({ x, y });
      return;
    }
    menu.showAtMouseEvent(evt);
  }

  renderRecentFilterBar(parent, allRecents) {
    const filters = this.getRecentFilters();
    const wrap = parent.createDiv({ cls: "lexvoice-outline-recent-filter-wrap" });
    const bar = wrap.createDiv({ cls: "lexvoice-outline-recent-filters" });
    const chipDefs = [
      ["time", RECENT_TIME_FILTER_OPTIONS],
      ["mode", this.getRecentModeFilterOptions()],
    ];
    for (const [kind, options] of chipDefs) {
      const value = filters[kind] || "all";
      const label = this.getRecentFilterLabel(kind, value, allRecents);
      const isActive = kind === "time" || this.isRecentFilterActive(kind, value);
      const chip = bar.createEl("button", {
        cls: `lexvoice-outline-recent-filter-chip ${isActive ? "is-active" : ""}`,
        text: label,
        attr: { type: "button", title: "筛选纪要列表" },
      });
      chip.onclick = (evt) => this.showRecentFilterMenu(evt, kind, options, value);
    }
    const clear = wrap.createEl("button", {
      cls: "lexvoice-outline-recent-filter-clear",
      text: "清除筛选",
      attr: { type: "button" },
    });
    clear.onclick = () => this.resetRecentFilters();
  }

  renderRecentFilterEmpty(parent) {
    const box = parent.createDiv({ cls: "lexvoice-outline-recent-filter-empty" });
    box.createDiv({ cls: "lexvoice-outline-recent-filter-empty-title", text: "没有符合筛选条件的纪要" });
    const hint = box.createDiv({ cls: "lexvoice-outline-recent-filter-empty-hint" });
    hint.createSpan({ text: "试试 " });
    const filters = this.getRecentFilters();
    if (filters.time === "today") {
      const widen = hint.createEl("button", { text: "放宽时间到本周", attr: { type: "button" } });
      widen.onclick = () => this.setRecentFilter("time", "week");
      if (this.hasActiveRecentFilters()) hint.createSpan({ text: " 或 " });
    }
    if (this.hasActiveRecentFilters()) {
      const clear = hint.createEl("button", { text: "清除全部筛选", attr: { type: "button" } });
      clear.onclick = () => this.resetRecentFilters();
    }
  }

  renderRecent(root) {
    const allRecents = getRecentNotes(this.plugin, 120);
    const recents = this.applyRecentFilters(allRecents).slice(0, 48);
    const sec = root.createDiv({ cls: "lexvoice-outline-section" });
    if (allRecents.length === 0) {
      sec.createDiv({ cls: "lexvoice-outline-empty", text: "暂无录音笔记" });
      return;
    }
    this.renderRecentFilterBar(sec, allRecents);
    if (recents.length === 0) {
      this.renderRecentFilterEmpty(sec);
      return;
    }
    const active = this.getActiveLexVoiceNoteFile();
    const activePath = active && active.path ? obsidian.normalizePath(active.path) : "";
    const list = sec.createDiv({ cls: "lexvoice-outline-recent" });
    const groupCounts = new Map();
    for (const item of recents) groupCounts.set(item.dateKey, (groupCounts.get(item.dateKey) || 0) + 1);
    const moment = window.moment;
    const todayKey = moment ? moment().format("YYYY-MM-DD") : (() => {
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${mm}-${dd}`;
    })();
    let currentGroup = null;
    let groupEl = null;
    let itemsEl = null;
    for (const r of recents) {
      if (r.dateKey !== currentGroup) {
        currentGroup = r.dateKey;
        const isToday = r.dateKey === todayKey;
        groupEl = list.createDiv({ cls: `lexvoice-outline-recent-group ${isToday ? "is-today" : ""}` });
        const axis = groupEl.createDiv({ cls: "lexvoice-outline-recent-axis" });
        axis.createDiv({ cls: "lexvoice-outline-recent-axis-primary", text: r.axisPrimary });
        axis.createDiv({ cls: "lexvoice-outline-recent-axis-secondary", text: r.axisSecondary });
        itemsEl = groupEl.createDiv({ cls: "lexvoice-outline-recent-items" });
        const groupTitle = itemsEl.createDiv({ cls: "lexvoice-outline-recent-group-title" });
        groupTitle.createSpan({ cls: "lexvoice-outline-recent-group-weekday", text: r.groupTitle });
        if (isToday) groupTitle.createSpan({ cls: "lexvoice-outline-recent-group-today", text: "今日" });
        groupTitle.createSpan({ cls: "lexvoice-outline-recent-group-count", text: `${groupCounts.get(r.dateKey) || 0} 篇` });
      }
      const isActive = activePath && obsidian.normalizePath(r.file.path) === activePath;
      const row = itemsEl.createDiv({ cls: `lexvoice-outline-recent-row ${isActive ? "is-active" : ""}` });
      row.addEventListener("click", async () => {
        try { await this.app.workspace.getLeaf(false).openFile(r.file); } catch (e) { console.error(e); }
      });
      row.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        // nameEl 在本次迭代后续才声明；闭包在右键时才执行，届时已初始化（TDZ 安全）。
        this.showRecentNoteContextMenu(evt, r.file, () => this.beginRecentNoteRename(nameEl, r.file, r.title));
      });
      const meta = getModeMeta(this.plugin.settings, r.mode) || MODE_META.off;
      const chip = row.createDiv({ cls: "lexvoice-outline-recent-chip", attr: { title: meta.label || meta.prefix || "录音" } });
      try { obsidian.setIcon(chip, meta.icon || "mic"); } catch { chip.setText((meta.prefix || "录音").slice(0, 1)); }
      const body = row.createDiv({ cls: "lexvoice-outline-recent-body" });
      const titleLine = body.createDiv({ cls: "lexvoice-outline-recent-title-line" });
      const nameEl = titleLine.createDiv({ cls: "lexvoice-outline-recent-name", text: r.title || r.file.basename });
      // 改名进行中（contentEditable）时，点击姓名只移动光标，别冒泡到整行去打开笔记。
      nameEl.addEventListener("click", (e) => { if (nameEl.isContentEditable) e.stopPropagation(); });
      const metaText = [r.displayTime, meta.prefix, r.durationLabel].filter(Boolean).join(" · ");
      body.createDiv({ cls: "lexvoice-outline-recent-meta", text: metaText });
      const failedTasks = getQueueTasksForMarkdown(this.plugin, r.file, { types: ["transcribe"], failedOnly: true });
      const actions = body.createDiv({ cls: "lexvoice-outline-recent-actions" });
      // 改名入口：可见铅笔按钮（桌面悬停浮现、移动端常显，触屏也能点），点击进入就地编辑。
      this.createRecentActionButton(actions, {
        icon: "pencil",
        title: "重命名",
        cls: "is-rename",
        onClick: () => this.beginRecentNoteRename(nameEl, r.file, r.title),
      });
      const queueState = getRecentQueueProcessingState(this.plugin, r.file);
      if (queueState) this.setRecentProcessingStatus(row, actions, queueState);
      if (failedTasks.length) {
        this.createRecentActionButton(actions, {
          icon: "rotate-ccw",
          label: `重试转写${failedTasks.length > 1 ? ` ${failedTasks.length}` : ""}`,
          title: `重试这篇纪要的 ${failedTasks.length} 个转写失败片段`,
          cls: "is-retry",
          onClick: () => this.retryRecentTranscription(r.file),
        });
      }
      this.syncRecentNoteProcessingState(r.file, row, actions, failedTasks.length);
      // 派生版本（清稿等）作为母本下的缩进子行展示；点开打开派生，右键给派生专属菜单。
      if (r.variants && r.variants.length) {
        for (const v of r.variants) {
          const vrow = itemsEl.createDiv({ cls: "lexvoice-outline-recent-variant" });
          if (activePath && obsidian.normalizePath(v.file.path) === activePath) vrow.addClass("is-active");
          const vchip = vrow.createDiv({ cls: "lexvoice-outline-recent-variant-chip" });
          try { obsidian.setIcon(vchip, v.kind === "clean" ? "file-text" : "files"); } catch { /* intentionally empty */ }
          vrow.createDiv({ cls: "lexvoice-outline-recent-variant-name", text: v.label || v.file.basename });
          vrow.addEventListener("click", async () => {
            try { await this.app.workspace.getLeaf(false).openFile(v.file); } catch (e) { console.error(e); }
          });
          vrow.addEventListener("contextmenu", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            this.showVariantContextMenu(evt, v.file, v.sourcePath);
          });
        }
      }
    }
  }

  createRecentActionButton(parent, opt) {
    const btn = parent.createEl("button", {
      cls: `lexvoice-outline-recent-action ${opt.cls || ""}`,
      attr: { type: "button", title: opt.title || opt.label || "" },
    });
    if (opt.disabled) btn.disabled = true;
    if (opt.icon) {
      const icon = btn.createSpan({ cls: "lexvoice-outline-recent-action-icon" });
      try { obsidian.setIcon(icon, opt.icon); } catch { /* intentionally empty */ }
    }
    if (opt.label) btn.createSpan({ cls: "lexvoice-outline-recent-action-label", text: opt.label });
    btn.addEventListener("click", async (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (btn.disabled || typeof opt.onClick !== "function") return;
      try {
        await opt.onClick(evt);
      } catch (e) {
        console.error("[LexVoice] recent note action failed", e);
        new obsidian.Notice(`LexVoice 操作失败：${(e && e.message) || e}`, 8000);
      }
    });
    return btn;
  }

  setRecentProcessingStatus(row, actions, state) {
    if (!row || !actions || !state) return;
    row.toggleClass("has-transcribe-failure", state.kind === "failed");
    const staleStatus = actions.querySelector(".lexvoice-outline-recent-failure-status");
    if (staleStatus) staleStatus.remove();
    const status = actions.createDiv({
      cls: `lexvoice-outline-recent-failure-status is-${state.kind}`,
      attr: { title: state.title || state.label || "" },
    });
    const iconName = state.kind === "processing" ? "loader-2" : "alert-triangle";
    try { obsidian.setIcon(status.createSpan({ cls: "lexvoice-outline-recent-failure-icon" }), iconName); } catch { /* intentionally empty */ }
    const pct = clampLexVoiceProgress(state.percent);
    status.createSpan({ text: (state.label || "") + (pct == null ? "" : ` ${pct}%`) });
    if (pct != null) {
      const progress = status.createSpan({ cls: "lexvoice-outline-recent-status-progress" });
      progress.createSpan({ cls: "lexvoice-outline-recent-status-progress-fill" }).style.width = `${pct}%`;
    }
  }

  showRecentModeMenu(evt, file) {
    const menu = new obsidian.Menu();
    const modes = getVisibleModeEntries(this.plugin.settings, false);
    for (const [mode, label] of modes) {
      menu.addItem((item) => {
        item.setTitle(label)
          .setIcon("refresh-cw")
          .onClick(() => {
            const pref = this.plugin.settings.repolishPreference || "";
            this.plugin.repolishMarkdownFile(file, mode, pref ? getRepolishPreferencePreset(pref) : null);
          });
      });
    }
    menu.showAtMouseEvent(evt);
  }

  showVariantContextMenu(evt, file, sourcePath) {
    const menu = new obsidian.Menu();
    menu.addItem((item) => item.setTitle("打开母本").setIcon("corner-left-up").onClick(async () => {
      const sp = sourcePath ? obsidian.normalizePath(String(sourcePath)) : "";
      const src = sp ? this.plugin.app.vault.getAbstractFileByPath(sp) : null;
      if (src instanceof obsidian.TFile) {
        try { await this.plugin.app.workspace.getLeaf(false).openFile(src); } catch (e) { console.error(e); }
      } else {
        new obsidian.Notice("找不到母本（source_path 失效，可能母本被改名/移动）。", 6000);
      }
    }));
    menu.addItem((item) => item.setTitle("重新生成清稿").setIcon("refresh-cw").onClick(() => this.plugin.generateCleanScript(file)));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("删除此版本").setIcon("trash").onClick(async () => {
      const ok = await lexvoiceConfirm(this.plugin.app, "删除派生版本", `删除「${file.basename}」？母本和逐字稿不受影响。`, "删除");
      if (!ok) return;
      try { await trashLexVoiceFile(this.plugin.app, file); this.plugin.refreshOutlineView(); }
      catch (e) { console.error(e); new obsidian.Notice("删除失败", 6000); }
    }));
    menu.showAtMouseEvent(evt);
  }

  showRecentNoteContextMenu(evt, file, beginRename) {
    const menu = new obsidian.Menu();
    if (typeof beginRename === "function") {
      menu.addItem((item) => {
        item.setTitle("重命名").setIcon("pencil").onClick(() => beginRename());
      });
      menu.addSeparator();
    }
    const detectedMode = this.plugin.detectModeFromMarkdown(file);
    const retryTasks = getQueueTasksForMarkdown(this.plugin, file, { types: ["transcribe"], failedOnly: true });
    if (retryTasks.length) {
      menu.addItem((item) => {
        item.setTitle(`重试转写失败片段（${retryTasks.length}）`)
          .setIcon("rotate-ccw")
          .onClick(() => this.retryRecentTranscription(file));
      });
      menu.addSeparator();
    }
    menu.addItem((item) => {
      item.setTitle("继续录音到这篇")
        .setIcon("mic")
        .onClick(() => this.plugin.startRecording({ appendToFile: file }));
    });
    menu.addItem((item) => {
      item.setTitle("与上一段录音合并")
        .setIcon("git-merge")
        .onClick(() => this.plugin.mergeMarkdownFileWithPrevious(file));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("生成清稿")
        .setIcon("file-text")
        .onClick(() => this.plugin.generateCleanScript(file));
    });
    menu.addItem((item) => {
      item.setTitle(detectedMode ? "重新整理为" : "整理为")
        .setIcon("refresh-cw");
      const sub = item.setSubmenu();
      // 偏好（可选修饰）：点击只在前面打钩/取消，就地更新、菜单不关（捕获阶段拦掉点击，阻止 Obsidian 关菜单）。
      // 没勾偏好就按默认执行。真正触发整理的是下面的"模式"——届时拼接「模式模板 + 已选偏好」两段提示词。
      const prefItems = [];
      const syncPrefChecks = () => {
        const cur = this.plugin.settings.repolishPreference || "";
        for (const [k, it] of prefItems) { try { it.setChecked(cur === k); } catch { /* intentionally empty */ } }
      };
      for (const key of ["detailed", "concise", "structured", "natural", "expanded"]) {
        const preset = getRepolishPreferencePreset(key);
        if (!preset) continue;
        sub.addItem((presetItem) => {
          presetItem.setTitle(preset.label).setChecked((this.plugin.settings.repolishPreference || "") === key);
          prefItems.push([key, presetItem]);
          const dom = presetItem.dom;
          if (dom) {
            dom.addEventListener("click", (e) => {
              e.preventDefault(); e.stopPropagation();
              if (e.stopImmediatePropagation) e.stopImmediatePropagation();
              this.plugin.settings.repolishPreference = ((this.plugin.settings.repolishPreference || "") === key) ? "" : key;
              this.plugin.saveSettings();
              syncPrefChecks();
            }, true);
          }
        });
      }
      sub.addSeparator();
      const modes = getVisibleModeEntries(this.plugin.settings, false);
      for (const [mode, label] of modes) {
        sub.addItem((subItem) => {
          subItem.setTitle(label)
            .setIcon("refresh-cw")
            .onClick(() => {
              const pref = this.plugin.settings.repolishPreference || "";
              const preset = pref ? getRepolishPreferencePreset(pref) : null;
              this.plugin.repolishMarkdownFile(file, mode, preset);
            });
        });
      }
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("生成")
        .setIcon("file-output");
      const sub = item.setSubmenu();
      sub.addItem((subItem) => subItem
        .setTitle("邮件草稿")
        .onClick(() => this.plugin.createEmailDraftForMarkdownFile(file)));
      sub.addItem((subItem) => subItem
        .setTitle("HTML 报告")
        .onClick(() => this.plugin.generateHtmlReportForMarkdownFile(file)));
      sub.addItem((subItem) => subItem
        .setTitle("PDF 报告（整页不截断）")
        .onClick(() => this.plugin.generatePdfReportForMarkdownFile(file)));
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("删除转写记录")
        .setIcon("trash-2")
        .onClick(() => this.confirmDeleteRecentNote(file));
    });
    menu.showAtMouseEvent(evt);
  }

  async retryRecentTranscription(file) {
    await this.plugin.retryTranscribeTasksForMarkdown(file);
    this.render();
  }

  // 判断某路径是否属于"最近纪要面板"的范畴（mdFolder 下的 .md），用于决定要不要刷新面板。
  isRecentNotePath(path) {
    const p = obsidian.normalizePath(String(path || ""));
    if (!p || !/\.md$/i.test(p)) return false;
    const folder = obsidian.normalizePath(String(this.plugin.settings.mdFolder || ""));
    // 空/根 mdFolder 时最近列表本就扫全库（getRecentNotes 同样行为），任何 .md 变动都算相关。
    if (!folder || folder === "/" || folder === ".") return true;
    // 只认 folder 之下的文件；不认与文件夹同名的兄弟文件（如 docs.md 之于 docs/）。
    return p.startsWith(`${folder}/`);
  }

  // 强制重渲染最近面板：computeSignature 不含最近笔记文件名，必须清掉 _lastSig 才会真重建 DOM
  // （见 scheduleUpdate）。集中成一处，避免各调用点漏清 _lastSig 导致"看着没反应"。
  forceRecentRender() {
    this._lastSig = "";
    this.scheduleUpdate();
  }

  // 在面板里就地改名：复用沉淀候选那套 contentEditable 编辑器（Enter/失焦提交、Esc 取消、禁空）。
  beginRecentNoteRename(nameEl, file, displayTitle) {
    if (!nameEl || !(file instanceof obsidian.TFile)) return;
    const original = String(displayTitle != null && displayTitle !== "" ? displayTitle : (nameEl.textContent || "")).trim();
    this.enterSedimentInlineTitleEdit(nameEl, original, (next) => this.renameRecentNoteFromPanel(file, next));
  }

  // 提交改名：反向复刻 getRecentNotes 的标题派生——保留文件名里的「日期前缀 + 模式前缀」，
  // 只替换其后的人类标题；这样结构零损失、面板显示与文件名前后一致。用 fileManager.renameFile
  // 保留反向链接，sanitizeFilename 去非法字符，getAvailableMarkdownPath 防重名。
  async renameRecentNoteFromPanel(file, rawNext) {
    if (!(file instanceof obsidian.TFile)) return false;
    const nextTitle = sanitizeFilename(rawNext);
    if (!nextTitle) {
      new obsidian.Notice("名称无效（为空或仅含非法字符）", 5000);
      this.forceRecentRender(); // 复原显示
      return false;
    }
    const base = file.basename;
    const dateMatch = base.match(/^\d{4}-\d{2}-\d{2}(?:\s+\d{4})?\s*/);
    let prefix = dateMatch ? dateMatch[0] : "";
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const mode = detectRecentNoteMode(this.plugin, file, fm);
    const meta = getModeMeta(this.plugin.settings, mode) || MODE_META.off;
    if (meta && meta.prefix) {
      const mm = base.slice(prefix.length).match(new RegExp("^" + escapeRegExp(meta.prefix) + "[-·\\s]*"));
      if (mm) prefix += mm[0];
    }
    const nextBase = `${prefix}${nextTitle}`.trim();
    if (!nextBase) { this.forceRecentRender(); return false; }
    const dir = file.parent && file.parent.path ? file.parent.path : "";
    const target = obsidian.normalizePath(dir && dir !== "/" ? `${dir}/${nextBase}.md` : `${nextBase}.md`);
    const finalPath = this.plugin.getAvailableMarkdownPath(target, file.path);
    if (!finalPath || obsidian.normalizePath(finalPath) === obsidian.normalizePath(file.path)) {
      this.forceRecentRender(); // 无实际变化 → 复原显示
      return false;
    }
    try {
      await this.app.fileManager.renameFile(file, finalPath);
      this.forceRecentRender();
      return true;
    } catch (e) {
      console.error("[LexVoice] rename recent note failed", e);
      new obsidian.Notice(`重命名失败：${(e && e.message) || e}`, 8000);
      this.forceRecentRender();
      return false;
    }
  }

  confirmDeleteRecentNote(file) {
    if (!(file instanceof obsidian.TFile)) return;
    const modal = new obsidian.Modal(this.app);
    const { contentEl } = modal;
    contentEl.empty();
    contentEl.addClass("lexvoice-delete-note-modal");
    contentEl.createEl("h3", { text: "删除转写记录？" });
    const taskCount = getQueueTasksForMarkdown(this.plugin, file, { types: ["transcribe", "merge"] }).length;
    const audioFiles = this.getAudioFilesForRecentNote(file);
    const desc = contentEl.createDiv({ cls: "setting-item-description" });
    desc.setText(`将删除纪要「${file.basename}」。${taskCount ? `关联的 ${taskCount} 个队列任务会一并移除。` : "没有关联队列任务。"}`);
    let deleteAudio = false;
    if (audioFiles.length) {
      const option = contentEl.createDiv({ cls: "lexvoice-delete-note-option" });
      const id = `lexvoice-delete-audio-${Date.now()}`;
      const cb = option.createEl("input", { type: "checkbox", attr: { id } });
      const label = option.createEl("label", { attr: { for: id } });
      label.createSpan({ text: `同时删除对应录音文件（${audioFiles.length} 个）` });
      const names = audioFiles.map((audio) => audio.path || audio.name).slice(0, 3).join("、");
      option.createDiv({
        cls: "lexvoice-delete-note-option-hint",
        text: audioFiles.length > 3 ? `${names} 等` : names,
      });
      cb.onchange = () => { deleteAudio = !!cb.checked; };
    } else {
      contentEl.createDiv({ cls: "lexvoice-delete-note-option-hint", text: "未找到可关联的录音文件。" });
    }
    const actions = contentEl.createDiv({ cls: "lexvoice-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    const confirm = actions.createEl("button", { text: "确认删除", cls: "mod-warning", attr: { type: "button" } });
    cancel.onclick = () => modal.close();
    confirm.onclick = async () => {
      confirm.disabled = true;
      try {
        await this.deleteRecentNoteRecord(file, { deleteAudio });
        modal.close();
      } catch (e) {
        confirm.disabled = false;
        console.error("[LexVoice] delete recent note failed", e);
        new obsidian.Notice(`删除失败：${(e && e.message) || e}`, 8000);
      }
    };
    modal.open();
  }

  getAudioFilesForRecentNote(file) {
    if (!(file instanceof obsidian.TFile)) return [];
    const map = new Map();
    const addFile = (candidate) => {
      if (candidate instanceof obsidian.TFile && AUDIO_EXT.has(String(candidate.extension || "").toLowerCase())) {
        map.set(obsidian.normalizePath(candidate.path), candidate);
      }
    };
    try {
      const cache = this.app.metadataCache.getFileCache(file);
      const embeds = cache && Array.isArray(cache.embeds) ? cache.embeds : [];
      for (const embed of embeds) {
        const link = embed && embed.link ? String(embed.link) : "";
        if (!link || !AUDIO_EXT.has((link.split(".").pop() || "").toLowerCase())) continue;
        const linked = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        addFile(linked);
        if (!linked) addFile(resolveLexVoiceAudioFile(this.app, this.plugin.settings, link));
      }
    } catch { /* intentionally empty */ }
    const mdPath = obsidian.normalizePath(file.path);
    const tasks = getQueueTasksForMarkdown(this.plugin, file, { types: ["transcribe", "merge"] });
    for (const task of tasks) {
      for (const path of [task && task.audioPath, task && task.sourceAudioPath, task && task.masterAudioPath]) {
        if (!path) continue;
        addFile(this.app.vault.getAbstractFileByPath(obsidian.normalizePath(path)));
        addFile(resolveLexVoiceAudioFile(this.app, this.plugin.settings, path));
      }
    }
    // 兜底：从当前已读内容缓存中解析 wiki embed，覆盖 metadata 尚未刷新时的场景。
    const cacheData = this.notePanelCacheData && this.notePanelCacheKey === mdPath ? this.notePanelCacheData : null;
    if (cacheData && Array.isArray(cacheData.audioRefs)) {
      for (const ref of cacheData.audioRefs) addFile(resolveLexVoiceAudioFile(this.app, this.plugin.settings, ref));
    }
    return Array.from(map.values());
  }

  async deleteRecentNoteRecord(file, options = {}) {
    if (!(file instanceof obsidian.TFile)) return;
    const mdPath = obsidian.normalizePath(file.path);
    const audioFiles = options.deleteAudio ? this.getAudioFilesForRecentNote(file) : [];
    let removedTasks = 0;
    if (this.plugin.queue && Array.isArray(this.plugin.queue.tasks)) {
      const before = this.plugin.queue.tasks.length;
      this.plugin.queue.tasks = this.plugin.queue.tasks.filter((task) => !task || !isSameVaultPath(task.mdPath, mdPath));
      removedTasks = before - this.plugin.queue.tasks.length;
      if (removedTasks) await this.plugin.saveAll();
    }
    let removedAudio = 0;
    for (const audio of audioFiles) {
      try {
        await trashLexVoiceFile(this.app, audio);
        removedAudio++;
      } catch (e) {
        console.warn("[LexVoice] delete linked audio failed", audio && audio.path, e);
      }
    }
    await trashLexVoiceFile(this.app, file);
    this.notePanelCacheKey = "";
    this.notePanelCacheData = undefined;
    this.showRecentHome = true;
    this.idlePanelTab = "recent";
    this.render();
    new obsidian.Notice(`已删除转写记录${removedAudio ? `，并删除 ${removedAudio} 个录音文件` : ""}${removedTasks ? `，清理 ${removedTasks} 个队列任务` : ""}`);
  }

  syncRecentNoteProcessingState(file, row, actions, failedTaskCount) {
    this.app.vault.cachedRead(file)
      .then((content) => {
        const queueState = getRecentQueueProcessingState(this.plugin, file);
        if (queueState) {
          this.setRecentProcessingStatus(row, actions, queueState);
          return;
        }
        const state = getRecentNoteProcessingState(content);
        if (!state) {
          row.removeClass("has-transcribe-failure");
          const retry = actions.querySelector(".lexvoice-outline-recent-action.is-retry");
          if (retry) retry.remove();
          const staleStatus = actions.querySelector(".lexvoice-outline-recent-failure-status");
          if (staleStatus) staleStatus.remove();
          return;
        }
        if (failedTaskCount) return;
        this.setRecentProcessingStatus(row, actions, state);
      })
      .catch((e) => console.warn("[LexVoice] read recent note state failed", e));
  }

  async renderDeviceStatus(container, mode) {
    container.empty();
    container.createSpan({ text: "检测中…", cls: "lexvoice-device-status-loading" });
    let info;
    try {
      info = await enumerateAudioDevices();
    } catch (e) {
      container.empty();
      container.createSpan({ text: `⚠ 设备检测失败：${e.message || e}`, cls: "lexvoice-device-status-error" });
      return;
    }
    container.empty();

    mode = normalizeAudioInputMode(mode);
    const needMic    = mode === "mic" || mode === "mix-virtual";
    const needVirt   = mode === "virtualCable" || mode === "mix-virtual";

    // 去名字化：状态如实反映"用户选了什么"，而非按名字猜哪只是真麦/虚拟。
    const allInputs = (info.all || []).filter((d) => d && d.kind === "audioinput");
    const lines = [];
    if (needMic) {
      const selId = this.plugin.settings.selectedMicrophoneDevice || "";
      const realMic = selId
        ? allInputs.find((d) => d.deviceId === selId)
        : (allInputs.find((d) => d.deviceId === "default") || allInputs[0]);
      if (selId && !realMic) {
        lines.push({ ok: false, text: "麦克风：所选设备未检测到（请重选）", title: "所选麦克风未检测到" });
      } else if (realMic) {
        const label = realMic.label || (selId ? "已选麦克风" : "系统默认输入");
        const tag = selId ? "" : "（系统默认）";
        lines.push({ ok: true, text: `麦克风：${label}${tag}`, title: `麦克风：${label}` });
      } else {
        lines.push({ ok: false, text: "麦克风：未检测到" });
      }
    }
    if (needVirt) {
      const selId = this.plugin.settings.selectedVirtualDevice || "";
      const v = selId ? allInputs.find((d) => d.deviceId === selId) : null;
      if (v) {
        const label = v.label || "未授权读取设备名";
        lines.push({ ok: true, text: `电脑音频：${label}`, title: `电脑音频输入：${label}` });
      } else if (selId) {
        lines.push({ ok: false, text: "电脑音频：所选设备未检测到（请重选）", title: "所选电脑音频设备未检测到", action: "wizard" });
      } else {
        lines.push({ ok: false, text: "电脑音频：未选择（请在设置里选定）", title: "电脑音频输入：未选择", action: "wizard" });
      }
    }
    if (info.permissionRequired) {
      lines.push({ ok: false, text: "⚠ 麦克风权限未授予，无法读取设备名", action: "perm" });
    }

    for (const line of lines) {
      const row = container.createDiv({ cls: `lexvoice-device-status-row ${line.ok ? "is-ok" : "is-warn"}` });
      const text = row.createSpan({ text: line.text });
      text.setAttr("title", line.title || line.text);
      if (line.action === "wizard") {
        const btn = row.createEl("button", { text: "电脑音频指引", cls: "lexvoice-device-status-btn" });
        btn.onclick = () => new VirtualCableSetupModal(this.app, this.plugin).open();
      } else if (line.action === "perm") {
        const btn = row.createEl("button", { text: "授权", cls: "lexvoice-device-status-btn" });
        btn.onclick = async () => {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach(t => t.stop());
            this.scheduleUpdate();
          } catch (e) {
            new obsidian.Notice("授权失败：" + (e.message || e));
          }
        };
      }
    }
  }

  renderRecruitContextCard(parent) {
    const ctx = this.plugin.settings.recruitContext || {};
    const card = parent.createDiv({ cls: "lexvoice-recruit-card" });
    const head = card.createDiv({ cls: "lexvoice-recruit-card-head" });
    const hasJd = !!(ctx.jd && ctx.jd.trim());
    const hasResume = !!(ctx.resume && ctx.resume.trim());
    head.createSpan({ cls: `lexvoice-recruit-card-dot ${hasJd ? "is-ok" : "is-warn"}` });
    const title = head.createSpan({ cls: "lexvoice-recruit-card-title" });
    if (hasJd) {
      const positionLabel = ctx.position || "（未命名岗位）";
      const candLabel = ctx.candidateName ? ` · ${ctx.candidateName}` : "";
      const roundLabel = ctx.round ? ` · ${ctx.round}` : "";
      title.setText(`${positionLabel}${candLabel}${roundLabel}`);
    } else {
      title.setText("未注入 JD 或简历");
    }
    const editBtn = head.createEl("button", { text: hasJd ? "编辑" : "立即设置", cls: "lexvoice-recruit-card-edit", attr: { type: "button" } });
    editBtn.onclick = () => {
      const modal = new RecruitContextModal(this.app, this.plugin, {
        flow: "settings",
        onConfirm: () => this.scheduleUpdate(),
      });
      modal.open();
    };
    if (hasJd) {
      const meta = card.createDiv({ cls: "lexvoice-recruit-card-meta" });
      const flags = [];
      flags.push(hasResume ? "简历已填" : "简历未填");
      if (ctx.seniority) flags.push(ctx.seniority);
      if (ctx.interviewer) flags.push(`面试官 ${ctx.interviewer}`);
      meta.setText(flags.join(" · "));
    }
  }

  renderQueueInbox(root) {
    const queueN = this.plugin.queue ? this.plugin.queue.tasks.length : 0;
    if (queueN === 0) return;
    const sec = root.createDiv({ cls: "lexvoice-outline-queue-inbox" });
    sec.createDiv({ cls: "lexvoice-outline-queue-text", text: `${queueN} 个失败任务` });
    const btn = sec.createEl("button", { text: "打开队列" });
    btn.onclick = () => new QueueModal(this.app, this.plugin).open();
  }

  cancelOutlineGeneration() {
    this.outlineRunSeq = (this.outlineRunSeq || 0) + 1;
    this.outlineRunning = false;
    this.outlineQueued = false;
    this.plugin.logDiagnostic("warn", "outline.cancel_waiting", "用户停止等待实时大纲生成", {
      segmentCount: this.plugin.session && this.plugin.session.segments ? this.plugin.session.segments.length : 0,
      lastOutlineSegmentCount: this.lastOutlineSegmentCount,
    });
    this.render();
  }

  async refreshAIOutline(opts) {
    const silent = !!(opts && opts.silent);
    const session = this.plugin.session;
    if (!session || session.segments.length === 0) return;
    this.syncSessionOutline(session);
    if (this.outlineRunning) { this.outlineQueued = true; return; }
    const local = isLocalLlmEndpoint(this.plugin.settings && this.plugin.settings.llmEndpoint);
    if (!shouldRunRealtimeOutline(session, { silent, local })) return;
    const runId = (this.outlineRunSeq || 0) + 1;
    this.outlineRunSeq = runId;
    this.outlineRunning = true;
    this.render();
    try {
      const baseTimeout = silent ? REALTIME_OUTLINE_SILENT_TIMEOUT_MS : REALTIME_OUTLINE_MANUAL_TIMEOUT_MS;
      const result = await this.plugin.generateRealtimeOutlineForSession(session, {
        timeoutMs: local ? baseTimeout * 2 : baseTimeout,
        silent,
        maxTokens: REALTIME_OUTLINE_SILENT_MAX_TOKENS,
        local,
      });
      if (this.outlineRunSeq !== runId) return;
      this.aiOutline = result;
      this.lastOutlineSegmentCount = session.realtimeOutlineSegmentCount || session.segments.length;
      this.lastOutlineWorkbenchSignature = session.realtimeOutlineWorkbenchSignature || "";
      this.outlineErrorCount = 0;
      markRealtimeOutlineSuccess(session);
    } catch (e) {
      console.error(e);
      this.outlineErrorCount = (this.outlineErrorCount || 0) + 1;
      markRealtimeOutlineFailure(session);
      if (!silent) {
        this.plugin.setRecordingIssue(classifyRecordingIssue(e), {
          source: "outline",
          message: getErrorMessage(e),
          startedAtMs: getSegmentsDurationMs(session && session.segments),
        });
      }
      await this.plugin.logDiagnostic("error", "outline.generate_failed", "实时大纲生成失败", {
        silent,
        errorCount: this.outlineErrorCount,
        segmentCount: session.segments.length,
        lastOutlineSegmentCount: this.lastOutlineSegmentCount,
        memoryChars: String(session.realtimeOutlineMemory || "").length,
        window: session.realtimeOutlineWindow || null,
        mode: session.mode,
        captureMode: session.captureMode,
        error: diagnosticError(e),
      });
      if (!silent || this.outlineErrorCount === 1) {
        new obsidian.Notice(`大纲生成失败：${(e && e.message) || e}`);
      }
    } finally {
      if (this.outlineRunSeq === runId) {
        this.outlineRunning = false;
        this.render();
        if (this.outlineQueued) {
          this.outlineQueued = false;
          if (shouldRunRealtimeOutline(this.plugin.session, { silent: true, local })) {
            const nextAllowedAt = Number(this.plugin.session && this.plugin.session.realtimeOutlineNextAllowedAt) || 0;
            const wait = Math.max(1000, nextAllowedAt - Date.now());
            window.setTimeout(() => { void this.refreshAIOutline({ silent: true }); }, wait);
          }
        }
      }
    }
  }
}


class LexVoicePlugin extends obsidian.Plugin {
  declare settings: LexVoiceSettings;
  async onload() {
    await this.loadAll();
    this.recorder = new RecorderService(this);
    this.queue = new TaskQueue(this);
    this.queue.load(this.persistedQueue);
    this.session = null;
    this.recordingIssue = null;

    // 转写进度状态栏：常驻、一眼可见队列/转写跑到哪——消解"点了转写就黑盒"的焦虑。点击打开队列。
    this._importBusy = null;
    this._busyLabel = null;
    this.completedWorkLog = []; // 本次启动 OB 后已完成的处理（不持久化，重启清零），供"处理进度"面板展示
    this._taskMeter = null; // 单任务 token 计量窗口（beginTaskMeter→endTaskMeter）
    this.progressStatusEl = this.addStatusBarItem();
    this.progressStatusEl.addClass("lexvoice-statusbar");
    this.progressStatusEl.addEventListener("click", () => new QueueModal(this.app, this).open());
    this.updateBusyStatus();

    this.ribbonEl = this.addRibbonIcon("mic", "LexVoice：点击开始/停止，悬停展开控件", () => this.toggleRecording());
    this.recorder.on(() => this.refreshOutlineView());

    this.registerView(VIEW_TYPE_OUTLINE, (leaf) => new OutlineView(leaf, this));
    // 自定义 Bases 视图「招聘看板」（@since 1.10.0；内部自带守卫，老版本/未启用 Bases 时安全跳过）。
    registerRecruitBoardView(this);
    this.addRibbonIcon("list-tree", "LexVoice 实时纪要面板", () => this.openOutlineView());
    this.registerMarkdownPostProcessor((el, ctx) => this.enhanceAudioTimeLinks(el, ctx));

    this.bubble = new BubbleWidget(this);
    // 浮窗显隐与侧边栏（实时纪要面板）联动
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncBubbleVisibility()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncBubbleVisibility()));
    this.registerEvent(this.app.workspace.on("resize", () => this.syncBubbleVisibility()));
    this.app.workspace.onLayoutReady(() => this.syncBubbleVisibility());

    this.addCommand({ id: "toggle-recording", name: "开始/停止录音", callback: () => this.toggleRecording() });
    this.addCommand({ id: "pause-resume-recording", name: "暂停/继续录音", callback: () => {
      const s = this.recorder.state;
      if (s === "recording") this.recorder.pause(); else if (s === "paused") this.recorder.resume();
    }});
    this.addCommand({ id: "polish-selection-or-note", name: "AI 润色：当前选区或整篇", editorCallback: (editor) => this.polishEditor(editor) });
    this.addCommand({ id: "toggle-floating-ball", name: "显示/隐藏悬浮气泡（总开关）", callback: () => {
      this.settings.showFloatingBall = !this.settings.showFloatingBall;
      void this.saveSettings();
      this.syncBubbleVisibility();
      new obsidian.Notice(this.settings.showFloatingBall ? "浮窗已启用（常驻显示，可拖动）" : "浮窗已关闭");
    }});
    this.addCommand({ id: "open-queue", name: "打开待处理队列", callback: () => new QueueModal(this.app, this).open() });
    this.addCommand({ id: "retry-queue-all", name: "重试所有失败任务", callback: () => this.retryQueue() });
    this.addCommand({ id: "copy-diagnostic-report", name: "复制诊断报告", callback: () => this.copyDiagnosticReport() });
    this.addCommand({ id: "suggest-people-directory-updates", name: "AI 扫描纪要库提取人员建议", callback: () => this.suggestPeopleDirectoryFromLibrary() });
    this.addCommand({ id: "open-learning-card-wall", name: "打开学习卡片瀑布墙", callback: () => this.openLearningWall("learning") });
    this.addCommand({ id: "open-concept-wall", name: "打开概念墙", callback: () => this.openLearningWall("concept") });
    this.addCommand({ id: "open-todo-wall", name: "打开待办墙", callback: () => this.openTodoWall() });
    this.addCommand({ id: "open-object-wall", name: "打开对象总览", callback: () => this.openObjectWall() });
    this.addCommand({ id: "import-audio", name: "导入已有音频文件转写+润色", callback: () => new ImportAudioModal(this.app, this).open() });
    this.addCommand({
      id: "generate-html-report",
      name: "AI 生成当前纪要 HTML 报告",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const isMd = file instanceof obsidian.TFile && file.extension === "md";
        if (!isMd) return false;
        if (checking) return true;
        void this.generateHtmlReportForMarkdownFile(file);
        return true;
      },
    });
    this.addCommand({
      id: "generate-pdf-report",
      name: "AI 生成当前纪要 PDF 报告（整页不截断）",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const isMd = file instanceof obsidian.TFile && file.extension === "md";
        if (!isMd) return false;
        if (checking) return true;
        void this.generatePdfReportForMarkdownFile(file);
        return true;
      },
    });
    this.addCommand({ id: "check-updates", name: "检查更新", callback: () => this.checkForUpdates({ silent: false }) });
    this.addCommand({ id: "install-update", name: "安装可用更新", callback: () => this.installAvailableUpdate() });
    this.addCommand({ id: "open-outline", name: "打开实时纪要面板", callback: () => this.openOutlineView() });
    this.addCommand({ id: "record-mic-only", name: "开始录音 · 仅麦克风", callback: () => { this._oneShotCaptureMode = "mic"; void this.startRecording(); } });
    this.addCommand({ id: "record-mic-virtual", name: "开始录音 · 麦克风 + 电脑音频", callback: () => { this._oneShotCaptureMode = "mix-virtual"; void this.startRecording(); } });
    this.addCommand({ id: "record-virtual-only", name: "开始录音 · 仅电脑音频", callback: () => { this._oneShotCaptureMode = "virtualCable"; void this.startRecording(); } });
    this.addCommand({ id: "import-text", name: "导入已有文本 / MD 结构化整理", callback: () => new ImportTextModal(this.app, this).open() });

    this.settingTab = new LexVoiceSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.registerEvent(this.app.vault.on("create", (file) => {
      this.handleInboxFile(file).catch(e => console.error("[LexVoice] inbox handler error", e));
    }));

    // 文件重命名时同步迁移队列里所有指向旧路径的任务，
    // 防止 merge 任务跑完后文件被改名 → 重试时找不到旧路径报"笔记不存在"
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof obsidian.TFile) {
        this.migrateQueueTasksAfterRename(oldPath, file.path);
      }
    }));

    // 笔记被删（在 Obsidian 里直接删，非插件 UI）→ 清理指向它的队列任务，
    // 否则 merge 任务每次重试都先白烧一次 LLM 再报"笔记不存在"，永久卡 failed 清不掉。
    this.registerEvent(this.app.vault.on("delete", (file) => {
      const path = file && file.path ? file.path : "";
      if (path) this.removeQueueTasksForDeletedMarkdown(path);
    }));

    this.addCommand({ id: "scan-inbox", name: "扫描收件箱并处理所有未处理文件", callback: () => this.scanInboxFolder() });

    // F4.3：招聘项目统计自动重算——JD 库下候选人纪要 create/modify/delete/rename 时，防抖重算其所在项目文件夹。
    // 防自激：consider() 过滤掉 JD 文件本身（basename==父文件夹名），故 recalc 写 JD 触发的 modify 不会再触发重算。
    const recruitFileEvent = (file, oldPath) => {
      try {
        if (!isRecruitFeatureUnlocked(this.settings)) return;
        const root = obsidian.normalizePath(this.settings.recruitJdFolderPath || "JD");
        const underRoot = (p) => { const np = obsidian.normalizePath(p || ""); return np === root || np.startsWith(root + "/"); };
        // 文件夹整体重命名/移动：Obsidian 只发一次 rename(TFolder, oldPath)，不逐子文件发——直接对新旧文件夹路径
        // schedule（recalcRecruitProject 内部"无同名 JD 则早退"，传文件夹路径即可，无需它是 md）。
        if (file instanceof obsidian.TFolder) {
          if (underRoot(file.path)) this.scheduleRecruitRecalc(obsidian.normalizePath(file.path));
          if (oldPath && underRoot(oldPath)) this.scheduleRecruitRecalc(obsidian.normalizePath(oldPath));
          return;
        }
        const consider = (p) => {
          if (!p) return;
          const np = obsidian.normalizePath(p);
          if (!underRoot(np)) return;                              // 不在 JD 库下
          if (!/\.md$/i.test(np)) return;                          // 只看 md（.base 不触发）
          const parent = np.replace(/\/[^/]*$/, "");
          const folderName = parent.replace(/^.*\//, "");
          const base = np.replace(/^.*\//, "").replace(/\.md$/i, "");
          if (base === folderName) return;                         // JD 文件本身，跳过（防自激）
          this.scheduleRecruitRecalc(parent);
        };
        consider(file && file.path);
        if (oldPath) consider(oldPath);                            // rename：源/目标父文件夹都重算（计数才能此消彼长）
      } catch (e) { console.error("[LexVoice] recruit file event", e); }
    };
    this.registerEvent(this.app.vault.on("create", (f) => recruitFileEvent(f)));
    this.registerEvent(this.app.vault.on("modify", (f) => recruitFileEvent(f)));
    this.registerEvent(this.app.vault.on("delete", (f) => recruitFileEvent(f)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => recruitFileEvent(f, oldPath)));

    this.addCommand({ id: "refresh-recruit-project", name: "刷新当前招聘项目统计", callback: () => {
      const file = this.app.workspace.getActiveFile();
      if (!(file instanceof obsidian.TFile) || !file.parent) { new obsidian.Notice("请先打开招聘项目内的任意文件"); return; }
      this.recalcRecruitProject(file.parent.path)
        .then(ok => new obsidian.Notice(ok ? "已刷新当前招聘项目统计" : "当前文件不在招聘项目文件夹内（需与同名 JD 同目录）"))
        .catch(e => { console.error(e); new obsidian.Notice("刷新失败，详见控制台"); });
    } });
    this.addCommand({ id: "refresh-all-recruit-projects", name: "刷新全部招聘项目统计", callback: async () => {
      const projects = listJDProjects(this.app, this.settings.recruitJdFolderPath);
      let n = 0;
      for (const p of projects) { if (p.hasJd) { try { await this.recalcRecruitProject(p.folderPath); n++; } catch (e) { console.error(e); } } }
      new obsidian.Notice(`已刷新 ${n} 个招聘项目统计`);
    } });

    // F6：重建 JD 库根的聚合看板（招聘项目总览）。
    this.addCommand({ id: "rebuild-recruit-aggregate-base", name: "重建招聘项目总览看板", callback: async () => {
      try {
        const root = obsidian.normalizePath(this.settings.recruitJdFolderPath || "JD");
        if (!(this.app.vault.getAbstractFileByPath(root) instanceof obsidian.TFolder)) await this.app.vault.createFolder(root);
        const basePath = obsidian.normalizePath(`${root}/招聘项目.base`);
        const existing = this.app.vault.getAbstractFileByPath(basePath);
        if (existing instanceof obsidian.TFile) await this.app.vault.modify(existing, renderRecruitAggregateBase());
        else await this.app.vault.create(basePath, renderRecruitAggregateBase());
        const bf = this.app.vault.getAbstractFileByPath(basePath);
        if (bf instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(bf);
        new obsidian.Notice("招聘项目总览看板已重建");
      } catch (e) { console.error(e); new obsidian.Notice("重建失败，详见控制台"); }
    } });

    // F5：右键 JD 项目文件夹 → 打开 / 重建项目看板（解锁后才出现）。
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      try {
        if (!isRecruitFeatureUnlocked(this.settings)) return;
        if (!(file instanceof obsidian.TFolder)) return;
        const jdFile = (file.children || []).find(f => f instanceof obsidian.TFile && f.extension === "md" && f.basename === file.name);
        if (!jdFile) return;  // 不是招聘项目文件夹（无同名 JD）
        const basePath = obsidian.normalizePath(`${file.path}/${file.name}.base`);
        const baseExists = this.app.vault.getAbstractFileByPath(basePath) instanceof obsidian.TFile;
        const buildBase = async (open) => {
          const parsed = await parseJdProject(this.app, jdFile.path);
          const names = (parsed.综合素质 || []).map(q => q.素质).filter(Boolean);
          const content = renderRecruitCandidateBase(names.length ? names : DEFAULT_RECRUIT_QUALITIES.map(q => q.素质));
          const ex = this.app.vault.getAbstractFileByPath(basePath);
          if (ex instanceof obsidian.TFile) await this.app.vault.modify(ex, content);
          else await this.app.vault.create(basePath, content);
          if (open) { const bf = this.app.vault.getAbstractFileByPath(basePath); if (bf instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(bf); }
        };
        menu.addItem(item => item.setTitle(baseExists ? "打开项目看板" : "重建项目看板").setIcon("layout-dashboard").onClick(async () => {
          try {
            if (!baseExists) { await buildBase(true); return; }
            const bf = this.app.vault.getAbstractFileByPath(basePath);
            if (bf instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(bf);
          } catch (e) { console.error(e); new obsidian.Notice("打开项目看板失败"); }
        }));
        if (baseExists) {
          menu.addItem(item => item.setTitle("重建项目看板（刷新素质列）").setIcon("refresh-cw").onClick(async () => {
            try { await buildBase(true); new obsidian.Notice("项目看板已按当前综合素质重建"); }
            catch (e) { console.error(e); new obsidian.Notice("重建失败"); }
          }));
        }
      } catch (e) { console.error("[LexVoice] recruit folder menu", e); }
    }));

    // F7：招聘主页 4 个 code block 渲染器（实时计算零落盘，外层 try/catch 降级重试）+ 重建主页命令。
    this.mountHrBlock("lexvoice-hr-actions", (source, el, ctx) => this.renderHrActions(source, el, ctx));
    this.mountHrBlock("lexvoice-hr-stats", (source, el, ctx) => this.renderHrStats(source, el, ctx));
    this.mountHrBlock("lexvoice-hr-links", (source, el, ctx) => this.renderHrLinks(source, el, ctx));
    this.mountHrBlock("lexvoice-hr-candidates", (source, el, ctx) => this.renderHrCandidates(source, el, ctx));
    this.mountHrBlock("lexvoice-hr-recent", (source, el, ctx) => this.renderHrRecent(source, el, ctx));
    this.mountHrBlock("lexvoice-hr-latest-notes", (source, el, ctx) => this.renderHrLatest(source, el, ctx));
    this.addCommand({ id: "rebuild-recruit-homepage", name: "新建 / 重建招聘主页", callback: () => this.rebuildRecruitHomepage() });
    this.addCommand({ id: "cleanup-empty-short-recordings", name: "清理空白短录音", callback: () => this.cleanupEmptyShortRecordings() });

    this.addCommand({
      id: "migrate-legacy-notes",
      name: "迁移历史笔记到新 frontmatter 结构",
      callback: () => {
        this.migrateLegacyNotes()
          .then(r => new obsidian.Notice(`迁移：补全 ${r.migrated} / 跳过 ${r.skipped} / 无法识别 ${r.noMode} / 失败 ${r.failed}`, 8000))
          .catch(e => new obsidian.Notice(`迁移失败：${e.message || e}`, 8000));
      },
    });

    this.addCommand({
      id: "regenerate-briefing-from-frontmatter",
      name: "重新整理当前纪要（应用 yaml 角色映射）",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const isMd = file instanceof obsidian.TFile && file.extension === "md";
        const mode = isMd ? this.detectModeFromMarkdown(file) : null;
        if (!isMd || !mode) return false;
        if (checking) return true;
        void this.repolishMarkdownFile(file, mode);
        return true;
      },
    });

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof obsidian.TFile)) return;
      const ext = (file.extension || "").toLowerCase();
      if (AUDIO_EXT.has(ext)) {
        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle("LexVoice：转写并润色")
            .setIcon("mic")
            .onClick(() => this.importAudioFiles([file.path]));
        });
      }
    }));

    this.registerEvent(this.app.workspace.on("files-menu", (menu, files) => {
      const audios = (files || []).filter((f) => f instanceof obsidian.TFile && AUDIO_EXT.has((f.extension || "").toLowerCase()));
      if (audios.length === 0) return;
      const paths = audios.map((f) => f.path);
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle(`LexVoice：整合 ${audios.length} 段音频…`).setIcon("mic");
        const sub = item.setSubmenu();
        const modes = getVisibleModeEntries(this.settings, false);
        for (const [m, label] of modes) {
          const meta = getModeMeta(this.settings, m);
          sub.addItem((sub_i) => {
            sub_i.setTitle(`整合为${label}（${meta.prefix}模式）`)
              .setIcon("mic")
              .onClick(() => this.importAudioFiles(paths, m));
          });
        }
      });
    }));

    if (this.queue.tasks.length > 0) {
      new obsidian.Notice(`LexVoice：发现 ${this.queue.tasks.length} 个待处理任务，后台重试中…`);
      window.setTimeout(() => { void this.retryQueue(); }, 2500);
    }
    this.app.workspace.onLayoutReady(() => { this.warnIfBuildManifestSkew(); this.checkForUpdatesOnStartup(); });
  }

  onunload() {
    void (async () => {
      try { if (this.recorder && this.recorder.state !== "idle") await this.recorder.stop(); } catch { /* intentionally empty */ }
    })();
    if (this.bubble) this.bubble.unmount();
    // 清理招聘项目重算 Debouncer，避免卸载后 pending timer 触发已 detach 的实例
    try { if (this._recruitRecalcDebouncers) { this._recruitRecalcDebouncers.forEach(d => { try { if (d.cancel) d.cancel(); } catch { /* intentionally empty */ } }); this._recruitRecalcDebouncers.clear(); } } catch { /* intentionally empty */ }
  }

  enhanceAudioTimeLinks(el, ctx) {
    const links = Array.from(el.querySelectorAll("a.internal-link"));
    for (const link of links) {
      const label = (link.textContent || "").trim();
      const linkPath = link.getAttribute("data-href") || link.getAttribute("href") || "";
      if (!isTimeLabel(label) || !getAudioExtFromLinkPath(linkPath)) continue;
      link.classList.add("lexvoice-time-link");
      link.setAttribute("aria-label", `LexVoice 回听 ${label}`);
      const anyLink = link;
      if (anyLink.__lexvoiceTimeHandler) {
        link.removeEventListener("click", anyLink.__lexvoiceTimeHandler, true);
      }
      const handler = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (typeof evt.stopImmediatePropagation === "function") evt.stopImmediatePropagation();
        this.openAudioTimeLink(linkPath, label, ctx && ctx.sourcePath, ctx).catch((e) => {
          console.error("[LexVoice] open audio time link failed", e);
          new obsidian.Notice(`LexVoice 回听失败：${(e && e.message) || e}`);
        });
      };
      anyLink.__lexvoiceTimeHandler = handler;
      link.addEventListener("click", handler, true);
    }
  }

  resolveAudioLinkFile(linkPath, sourcePath) {
    const candidates = getAudioLinkCandidates(linkPath);
    if (!candidates.length) return null;
    const isAudioFile = (file) => file instanceof obsidian.TFile && AUDIO_EXT.has((file.extension || "").toLowerCase());
    for (const target of candidates) {
      const direct = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath || "");
      if (isAudioFile(direct)) return direct;
      const exact = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(target));
      if (isAudioFile(exact)) return exact;
      const scoped = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(`${this.settings.audioFolder}/${target.split("/").pop() || target}`));
      if (isAudioFile(scoped)) return scoped;
    }
    const names = candidates.map((target) => (target.split("/").pop() || target).trim()).filter(Boolean);
    const lowerNames = names.map((name) => name.toLowerCase());
    const stems = names
      .map((name) => name.replace(/\.[^.]+$/i, "").toLowerCase())
      .filter(Boolean);
    return this.app.vault.getFiles().find((f) => {
      if (!AUDIO_EXT.has((f.extension || "").toLowerCase())) return false;
      const fname = (f.name || "").toLowerCase();
      const fbase = (f.basename || "").toLowerCase();
      if (lowerNames.includes(fname)) return true;
      return stems.some((stem) => fbase === stem || fbase.startsWith(stem + "-"));
    }) || null;
  }

  async resolveAudioTimeLinkContext(linkPath, label, sourcePath) {
    const file = this.resolveAudioLinkFile(linkPath, sourcePath);
    if (!(file instanceof obsidian.TFile)) {
      return null;
    }
    const globalMs = parseElapsedMsToken(label);
    let localMs = globalMs;
    if (sourcePath) {
      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (sourceFile instanceof obsidian.TFile) {
        try {
          const content = await this.app.vault.cachedRead(sourceFile);
          const offsets = extractAudioSegmentOffsets(content);
          const target = getAudioLinkTarget(linkPath);
          const name = (target.split("/").pop() || target).trim();
          const offset = offsets.get(file.path) ?? offsets.get(obsidian.normalizePath(target)) ?? offsets.get(name) ?? offsets.get(file.name);
          if (Number.isFinite(offset)) localMs = Math.max(0, globalMs - offset);
        } catch (e) {
          console.warn("[LexVoice] read source note for audio offset failed", e);
        }
      }
    }
    return { file, globalMs, localMs, label, linkPath, sourcePath };
  }

  async openAudioTimeLink(linkPath, label, sourcePath, opts) {
    const payload = await this.resolveAudioTimeLinkContext(linkPath, label, sourcePath);
    if (!payload) {
      const globalMs = parseElapsedMsToken(label);
      const fallbackPayload = { file: null, globalMs, localMs: globalMs, label, linkPath, sourcePath };
      if (opts && typeof opts.onTimeLink === "function") {
        try {
          if (opts.onTimeLink(fallbackPayload) === true) return;
        } catch (e) {
          console.warn("[LexVoice] inline time link fallback failed", e);
        }
      }
      if (this.seekOutlineInlineAudio(fallbackPayload)) return;
      new obsidian.Notice("LexVoice：找不到对应音频文件，可能已被移动或删除。", 6000);
      return;
    }
    if (opts && typeof opts.onTimeLink === "function") {
      try {
        if (opts.onTimeLink(payload) === true) return;
      } catch (e) {
        console.warn("[LexVoice] inline time link handler failed", e);
      }
    }
    if (this.seekOutlineInlineAudio(payload)) return;
    new AudioTimeModal(this.app, payload.file, payload.localMs, label).open();
  }

  seekOutlineInlineAudio(payload) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE);
    for (const leaf of leaves) {
      const view = leaf && leaf.view;
      if (view && typeof view.seekInlineAudio === "function") {
        try {
          if (view.seekInlineAudio(payload) === true) return true;
        } catch (e) {
          console.warn("[LexVoice] outline inline seek failed", e);
        }
      }
    }
    return false;
  }

  async loadAll() {
    const saved = (await this.loadData()) || {};
    // 还原密钥：data.json 里的密钥是混淆态，读入内存前先解混淆（旧明文数据会原样通过，下次保存自动转混淆）
    try { transformApiKeyFieldsDeep(saved, deobfuscateApiKey); } catch (e) { console.warn("[LexVoice] key deobfuscate failed", e); }
    this.settings = normalizeLexVoiceSettings(saved);
    this.persistedQueue = extractLexVoiceJobItems(saved);
    // schema 升级：data.json 不带 schemaVersion 或低于当前版本时，
    // 立即写回新格式，避免长期保留旧平铺字段。
    const savedVersion = (saved && typeof saved === "object" && Number.isFinite(saved.schemaVersion))
      ? saved.schemaVersion
      : 0;
    let shouldSave = savedVersion !== SETTINGS_SCHEMA_VERSION;
    try {
      if (await this.migrateDefaultVocabularyFileLocation(saved)) shouldSave = true;
    } catch (e) {
      console.warn("[LexVoice] vocabulary location migrate failed", e);
    }
    if (shouldSave) {
      try { await this.saveAll(); } catch (e) { console.warn("[LexVoice] schema migrate failed", e); }
    }
  }
  async saveAll() {
    const payload = {
      settings: serializeLexVoiceSettings(this.settings),
      backgroundJobs: {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        items: this.queue ? this.queue.snapshot() : (this.persistedQueue || []),
      },
    };
    // 落盘前深拷贝再混淆密钥：serialize 里有的字段（如 transcribeProviders）是对内存的引用，
    // 直接混淆会污染内存里的明文密钥导致后续 API 调用失败。深拷贝隔离后只混淆磁盘副本。
    let safe;
    try {
      safe = JSON.parse(JSON.stringify(payload));
      transformApiKeyFieldsDeep(safe.settings, obfuscateApiKey);
    } catch (e) {
      console.warn("[LexVoice] key obfuscate failed, fallback to plain", e);
      safe = payload;
    }
    await this.saveData(safe);
  }
  async saveSettings() { await this.saveAll(); }

  getDiagnosticsFolder() {
    return obsidian.normalizePath(this.settings.diagnosticsLogFolder || DEFAULT_SETTINGS.diagnosticsLogFolder);
  }

  async logDiagnostic(level, code, message, data) {
    if (this.settings.diagnosticsLogEnabled === false) return;
    try {
      const folder = this.getDiagnosticsFolder();
      await this.ensureFolder(folder);
      const moment = window.moment;
      const day = moment ? moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
      const path = obsidian.normalizePath(`${folder}/${day}.jsonl`);
      const entry = {
        ts: new Date().toISOString(),
        level: level || "info",
        code: code || "event",
        version: this.manifest && this.manifest.version,
        message: redactDiagnosticText(message || ""),
        data: sanitizeDiagnosticData(data || {}),
      };
      const line = JSON.stringify(entry) + "\n";
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof obsidian.TFile) {
        const cur = await this.app.vault.read(file);
        await this.app.vault.modify(file, cur + line);
      } else {
        await this.app.vault.create(path, line);
      }
    } catch (e) {
      console.warn("[LexVoice] diagnostic log failed", e);
    }
  }

  async readRecentDiagnosticLines(limit = 80) {
    try {
      const folder = this.app.vault.getAbstractFileByPath(this.getDiagnosticsFolder());
      if (!(folder instanceof obsidian.TFolder)) return [];
      const files = folder.children
        .filter(f => f instanceof obsidian.TFile && /jsonl$/i.test(f.extension || ""))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, 3);
      const lines = [];
      for (const file of files.reverse()) {
        const text = await this.app.vault.read(file);
        for (const line of text.split("\n")) {
          if (line.trim()) lines.push(redactDiagnosticText(line));
        }
      }
      return lines.slice(-limit);
    } catch (e) {
      console.warn("[LexVoice] read diagnostics failed", e);
      return [];
    }
  }

  async buildDiagnosticReport() {
    const activeId = this.settings.activeTranscribeProvider || "";
    const provider = (this.settings.transcribeProviders || {})[activeId] || {};
    const queueItems = this.queue && Array.isArray(this.queue.tasks) ? this.queue.tasks : [];
    const counts = queueItems.reduce((acc, task) => {
      const key = task.status || "pending";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const lines = await this.readRecentDiagnosticLines(100);
    return [
      "# LexVoice 诊断报告",
      "",
      "## 环境",
      `- LexVoice: ${this.manifest && this.manifest.version || "unknown"}`,
      `- Obsidian API: ${obsidian.apiVersion || "unknown"}`,
      `- 平台: ${redactDiagnosticText(obsidian.Platform.isMacOS ? "macOS" : obsidian.Platform.isWin ? "Windows" : obsidian.Platform.isLinux ? "Linux" : obsidian.Platform.isIosApp ? "iOS" : obsidian.Platform.isAndroidApp ? "Android" : "unknown")}`,
      "",
      "## 当前配置摘要",
      `- 转写服务: ${redactDiagnosticText(activeId)} / ${redactDiagnosticText(provider.name || "")}`,
      `- 转写模型: ${redactDiagnosticText(provider.model || this.settings.transcribeModel || "")}`,
      `- 转写端点: ${redactDiagnosticText(provider.endpoint || this.settings.transcribeEndpoint || "")}`,
      `- ASR 并发数: ${normalizeAsrConcurrency(this.settings.asrConcurrency)}`,
      `- 音频输入: ${audioInputModeLabel(this.settings.captureMode || "mic")}`,
      `- 分段间隔: ${this.settings.segmentIntervalMinutes} 分钟`,
      `- 队列: ${JSON.stringify(counts)}`,
      "",
      "## 最近日志",
      lines.length ? lines.join("\n") : "暂无诊断日志。",
      "",
      "> 说明：诊断报告已自动隐藏常见 API Key、Token、用户目录和知识库路径；不会包含音频、转写正文或 Prompt 全文。",
    ].join("\n");
  }

  async copyDiagnosticReport() {
    const report = await this.buildDiagnosticReport();
    try {
      await navigator.clipboard.writeText(report);
      new obsidian.Notice("LexVoice 诊断报告已复制，可发给开发者排查。", 6000);
    } catch (e) {
      await this.logDiagnostic("error", "diagnostics.copy_failed", "复制诊断报告失败", { error: diagnosticError(e) });
      new obsidian.Notice(`诊断报告复制失败：${(e && e.message) || e}`, 8000);
    }
  }

  async migrateDefaultVocabularyFileLocation(savedData) {
    const saved = isRecord(savedData) ? savedData : {};
    const raw = isRecord(saved.settings) ? saved.settings : saved;
    const vocabulary = raw.vocabulary || {};
    const savedPath = pickDefined(vocabulary.notePath, raw.vocabularyFile, "");
    const normSaved = obsidian.normalizePath(savedPath || "");
    const usesLegacyDefault = !normSaved || normSaved.toLowerCase() === LEGACY_VOCABULARY_FILE.toLowerCase();
    if (!usesLegacyDefault) return false;

    const oldPath = obsidian.normalizePath(LEGACY_VOCABULARY_FILE);
    const newPath = obsidian.normalizePath(DEFAULT_SETTINGS.vocabularyFile);
    let changed = this.settings.vocabularyFile !== newPath;
    this.settings.vocabularyFile = newPath;

    const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
    const newFile = this.app.vault.getAbstractFileByPath(newPath);
    if (oldFile instanceof obsidian.TFile && !(newFile instanceof obsidian.TFile)) {
      const folderPath = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "";
      if (folderPath) await this.ensureFolder(folderPath);
      await this.app.fileManager.renameFile(oldFile, newPath);
      changed = true;
    }
    const targetFile = this.app.vault.getAbstractFileByPath(newPath);
    if (targetFile instanceof obsidian.TFile) {
      const content = await this.app.vault.cachedRead(targetFile);
      if (!isStructuredVocabularyMarkdown(content)) {
        await this.app.vault.modify(targetFile, formatVocabularyMarkdown(parseVocabularyGroups(content), this.settings.industryProfile));
        changed = true;
      }
    }
    return changed;
  }

  getTranscribeProviderProfile(id, provider) {
    const profiles = {
      siliconflow: {
        title: "硅基流动",
        badge: "云端转写",
        transcribeMode: "segmented",
        requiresKey: true,
        endpointPlaceholder: "https://api.siliconflow.cn/v1/audio/transcriptions",
        modelPlaceholder: "FunAudioLLM/SenseVoiceSmall",
        languagePlaceholder: "auto",
        endpointHelp: "硅基流动的音频转写服务地址。通常保持默认即可。",
        keyHelp: "从硅基流动控制台复制访问密钥。密钥以混淆（非加密）形式保存在本库的插件设置文件中，不会上传；请勿把整个库文件夹同步或分享给不信任的对象。",
        modelHelp: "推荐 FunAudioLLM/SenseVoiceSmall。延迟低，支持 50+ 语种，中文和粤语识别表现较好。",
        description: "OpenAI 兼容的音频转写接口。LexVoice 会按设定的分段间隔切段上传。",
        priceHint: "FunAudioLLM/SenseVoiceSmall 目前在硅基流动免费且不限用量；平台规则可能调整，以硅基流动控制台为准。",
        steps: ["注册或登录硅基流动账号", "在控制台创建访问密钥", "确认服务地址和模型名称后运行连通性测试"],
        links: [
          ["访问密钥", "https://cloud.siliconflow.cn/account/ak"],
          ["转写文档", "https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions"],
        ],
      },
      openai: {
        title: "OpenAI（切片转写）",
        badge: "云端转写",
        transcribeMode: "segmented",
        requiresKey: true,
        endpointPlaceholder: "https://api.openai.com/v1/audio/transcriptions",
        modelPlaceholder: "gpt-4o-transcribe",
        languagePlaceholder: "",
        endpointHelp: "OpenAI 的音频转写服务地址。需要可访问 OpenAI API 的网络环境。",
        keyHelp: "填写 OpenAI 项目的访问密钥。",
        modelHelp: "推荐 gpt-4o-transcribe（HTTP 切片）。需要边说边出字幕时，可改用「OpenAI Realtime · 语音转写」。",
        description: "OpenAI 兼容的音频转写接口。LexVoice 会按设定的分段间隔切段上传。",
        priceHint: "按音频用量计费（官方价 $6/百万音频 token），以 OpenAI 定价页为准。",
        steps: ["确认 OpenAI API 账户可用", "填写访问密钥", "运行连通性测试"],
        links: [["OpenAI 密钥", "https://platform.openai.com/api-keys"]],
      },
      apimimo: {
        title: "APIMiMo V2.5 ASR",
        badge: "云端转写",
        transcribeMode: "segmented",
        requiresKey: true,
        endpointPlaceholder: "https://api.xiaomimimo.com/v1/chat/completions",
        modelPlaceholder: "mimo-v2.5-asr",
        languagePlaceholder: "auto / zh / en",
        languageHelp: "留空或 auto 自动检测；明确语种时填 zh（中文，含粤语、吴语、闽南话、四川话等方言）或 en（英文）可提升准确率。其它值会按 auto 处理。",
        endpointHelp: "小米 MiMo 的服务地址，保持默认即可。LexVoice 会按 MiMo 要求的专用格式发送音频，与其他转写服务不同，无需手动调整。",
        keyHelp: "填写小米 MiMo 平台的访问密钥（API Key）。密钥以混淆（非加密）形式保存在本库的插件设置文件中，不会上传。",
        modelHelp: "固定使用 mimo-v2.5-asr。该服务只接受 wav/mp3、单段约 7.5MB 以内的音频；其他格式或更长的录音会由 LexVoice 自动转换、切段后上传，无需手动处理。",
        description: "APIMiMo-V2.5-ASR 通过 OpenAI 兼容 Chat Completions 的 input_audio 识别音频。服务端只收 wav/mp3：选用本服务时 LexVoice 会以 WebM/Opus 录音并在本机转成 WAV 分块上传；wav/mp3 文件未超限则直接发送。",
        priceHint: "按 MiMo 平台计费。大小限制由 LexVoice 自动处理：超限录音会按约 3 分钟自动切块上传，无需手动干预。",
        steps: ["在小米 MiMo 平台创建 API Key", "保持默认服务地址和模型名", "运行连通性测试"],
        links: [["MiMo ASR 文档", "https://platform.xiaomimimo.com/docs/zh-CN/api/audio/Speech-Recognition"]],
        note: "此服务不支持热词参数；LexVoice 会在转写结果返回后做本地热词纠错。在上方「识别语言」填 zh 或 en 可提升准确率。注意：此前用其他服务录制的 m4a/mp4 录音无法用本服务重新转写（仅影响重转写，新录音不受影响），如需重转写请临时切回原服务。",
      },
      "openai-realtime": {
        title: "OpenAI Realtime · 语音转写",
        badge: "流式实时",
        transcribeMode: "streaming",
        streamProtocol: "openai-realtime-transcription",
        requiresKey: true,
        endpointPlaceholder: "wss://api.openai.com/v1/realtime",
        modelPlaceholder: "gpt-realtime-whisper",
        languagePlaceholder: "（可留空，自动检测）",
        endpointHelp: "OpenAI Realtime 的 WebSocket 地址。保持默认即可。",
        keyHelp: "OpenAI 项目的访问密钥（与切片转写共用同一把 Key）。",
        modelHelp: "推荐 gpt-realtime-whisper（流式 ASR，专为实时字幕/会议记录设计）。",
        description: "流式转写，边说边出文字。LexVoice 跳过分段切片，整场录音与服务保持一条实时连线，延迟约半秒以内。",
        priceHint: "gpt-realtime-whisper ≈ $0.017 / 分钟 ≈ ¥7.2 / 小时。",
        steps: ["确认 OpenAI API 账户可用且能访问 Realtime API", "填写访问密钥", "保持模型名 gpt-realtime-whisper", "选「仅麦克风」捕获模式开始录音"],
        links: [
          ["OpenAI 密钥", "https://platform.openai.com/api-keys"],
          ["Realtime 文档", "https://developers.openai.com/api/docs/guides/realtime-transcription"],
        ],
        note: "流式模式下「分段间隔」「即时分段」设置不生效；笔记会在录音过程中实时追加文字。",
      },
      "openai-realtime-translate": {
        title: "OpenAI Realtime · 语音翻译",
        badge: "流式翻译",
        transcribeMode: "streaming",
        streamProtocol: "openai-realtime-translation",
        requiresKey: true,
        endpointPlaceholder: "wss://api.openai.com/v1/realtime/translations",
        modelPlaceholder: "gpt-realtime-translate",
        languagePlaceholder: "",
        endpointHelp: "OpenAI Realtime Translations 的 WebSocket 基础地址。模型名会自动追加为查询参数。",
        keyHelp: "OpenAI 项目的访问密钥。",
        modelHelp: "推荐 gpt-realtime-translate（70+ 语言输入 → 13 语言输出，由专业口译员录音训练）。",
        description: "流式语音翻译。自动检测说话者语言，实时输出译文+原文双轨笔记。模型同时返回译音流（LexVoice 自动丢弃，仅保留文字）。",
        priceHint: "gpt-realtime-translate ≈ $0.034 / 分钟 ≈ ¥14.4 / 小时。",
        steps: [
          "确认 OpenAI API 账户可用且能访问 Realtime API",
          "填写访问密钥",
          "在「目标语言」中选择需要的输出语言",
          "选「仅麦克风」捕获模式开始录音",
        ],
        links: [
          ["OpenAI 密钥", "https://platform.openai.com/api-keys"],
          ["Realtime 翻译文档", "https://developers.openai.com/api/docs/guides/realtime-translation"],
        ],
        note: "支持的目标语言：英语 (en)、中文 (zh)、日语 (ja)、韩语 (ko)、法语 (fr)、西班牙语 (es)、德语 (de)、意大利语 (it)、葡萄牙语 (pt)、俄语 (ru)、阿拉伯语 (ar)、印地语 (hi)、土耳其语 (tr)。",
        showTargetLanguage: true,
      },
      dashscope: {
        title: "阿里云百炼 Paraformer Realtime",
        badge: "流式实时",
        transcribeMode: "streaming",
        streamProtocol: "dashscope-ws",
        requiresKey: true,
        endpointPlaceholder: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        modelPlaceholder: "paraformer-realtime-v2",
        languagePlaceholder: "",
        endpointHelp: "Paraformer Realtime 的 WebSocket 地址。保持默认即可。",
        keyHelp: "填写百炼控制台创建的访问密钥（API Key）。密钥以混淆（非加密）形式保存在本库的插件设置文件中，不会上传。",
        modelHelp: "推荐 paraformer-realtime-v2（中英混合）；电话场景可用 paraformer-realtime-8k-v2。",
        description: "流式转写，边说边出文字。LexVoice 跳过分段切片，整场录音与服务保持一条实时连线，延迟约半秒以内。无需中转。",
        priceHint: "Paraformer Realtime ≈ ¥3.6 / 小时（国内最便宜）。",
        steps: ["在百炼控制台创建 API Key", "保持默认服务地址和模型名", "选「仅麦克风」捕获模式，开始录音即可"],
        links: [
          ["访问密钥", "https://help.aliyun.com/zh/model-studio/developer-reference/get-api-key"],
          ["Paraformer Realtime 文档", "https://help.aliyun.com/zh/model-studio/paraformer-realtime-api"],
        ],
        note: "流式模式下「分段间隔」「即时分段」设置不生效；笔记会在录音过程中实时追加文字。",
      },
      local: {
        title: "本地转写服务",
        badge: "本地服务",
        transcribeMode: "segmented",
        requiresKey: false,
        endpointPlaceholder: "http://127.0.0.1:8000/v1/audio/transcriptions",
        modelPlaceholder: "whisper-large-v3",
        languagePlaceholder: "zh",
        endpointHelp: "填写本地转写服务的 HTTP 地址。服务需要接收音频文件上传，并返回 text。",
        keyHelp: "多数本地服务可留空；如果服务要求鉴权，再填约定的密钥或令牌。",
        modelHelp: "模型名称由本地服务决定，例如 whisper-large-v3、whisper-large-v3-turbo、SenseVoiceSmall。",
        description: "适合隐私优先或离线工作流。LexVoice 不负责下载模型或启动服务，只负责把音频发送到已启动的本地转写服务。",
        priceHint: "免费（消耗本机 GPU/CPU）。",
        steps: ["安装并启动本地转写服务", "确认服务能接收音频上传并返回 text", "填写服务地址、模型名称后运行连通性测试"],
        links: [
          ["Xinference 文档", "https://inference.readthedocs.io/en/latest/models/model_abilities/audio.html"],
          ["whisper.cpp", "https://github.com/ggml-org/whisper.cpp"],
        ],
      },
      custom: {
        title: "其他转写服务",
        badge: "高级",
        transcribeMode: "segmented",
        requiresKey: false,
        endpointPlaceholder: "https://your-domain.example/v1/audio/transcriptions",
        modelPlaceholder: "your-transcribe-model",
        languagePlaceholder: "",
        endpointHelp: "填写第三方或自建转写服务地址。服务需要接收音频文件上传，并返回 text。",
        keyHelp: "按服务要求填写；不需要鉴权时可留空。",
        modelHelp: "按服务支持的模型名称填写。",
        description: "适合企业内部网关、自建转写服务或其他第三方转写服务。",
        priceHint: "",
        steps: ["确认服务能接收音频文件上传", "确认响应中包含 text 字段", "保存后运行连通性测试"],
        links: [],
      },
    };
    const base = profiles[id] || profiles.custom;
    const title = id === "custom" && provider && provider.name ? provider.name : base.title;
    return Object.assign({}, base, { title });
  }

  getActiveTranscribeProfile() {
    const id = this.settings.activeTranscribeProvider || "siliconflow";
    const provider = (this.settings.transcribeProviders || {})[id] || {};
    return this.getTranscribeProviderProfile(id, provider);
  }

  makeStreamingNoteUpdater(session) {
    let scheduled = false;
    let lastWritten = "";
    const flush = async () => {
      scheduled = false;
      if (!session || session.finalized) return;
      const text = session.streamingFullText || "";
      if (text === lastWritten) return;
      lastWritten = text;
      try {
        await this.upsertLiveTranscriptBlock(session.mdPath, session.id, text);
      } catch (e) { console.error("[LexVoice] live update failed", e); }
    };
    return () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => { void flush(); }, 1500);
    };
  }

  async upsertLiveTranscriptBlock(mdPath, sessionId, text) {
    const file = this.app.vault.getAbstractFileByPath(mdPath);
    if (!(file instanceof obsidian.TFile)) return;
    const startMarker = `<!-- lv-live-start:${sessionId} -->`;
    const endMarker = `<!-- lv-live-end:${sessionId} -->`;
    const safe = (text || "").trim().split("\n").map(l => "> " + l).join("\n");
    const body = safe || "> _（等待说话…）_";
    const block = `${startMarker}\n> [!quote]+ 实时转写中…\n${body}\n${endMarker}`;
    const cur = await this.app.vault.read(file);
    const startIdx = cur.indexOf(startMarker);
    const endIdx = cur.indexOf(endMarker);
    if (startIdx >= 0 && endIdx > startIdx) {
      const next = cur.slice(0, startIdx) + block + cur.slice(endIdx + endMarker.length);
      if (next !== cur) await this.app.vault.modify(file, next);
      return;
    }
    const segEnd = `<!-- lexvoice-segments-end:${sessionId} -->`;
    const segIdx = cur.indexOf(segEnd);
    if (segIdx >= 0) {
      const next = cur.slice(0, segIdx) + block + "\n" + cur.slice(segIdx);
      await this.app.vault.modify(file, next);
    }
  }

  async removeLiveTranscriptBlock(mdPath, sessionId) {
    const file = this.app.vault.getAbstractFileByPath(mdPath);
    if (!(file instanceof obsidian.TFile)) return;
    const startMarker = `<!-- lv-live-start:${sessionId} -->`;
    const endMarker = `<!-- lv-live-end:${sessionId} -->`;
    const cur = await this.app.vault.read(file);
    const startIdx = cur.indexOf(startMarker);
    const endIdx = cur.indexOf(endMarker);
    if (startIdx < 0 || endIdx < 0) return;
    const next = cur.slice(0, startIdx).replace(/\n+$/, "") + cur.slice(endIdx + endMarker.length).replace(/^\n+/, "\n");
    await this.app.vault.modify(file, next);
  }


  openSettings(tabId = "home") {
    if (this.settingTab) this.settingTab.activeTab = tabId;
    const setting = this.app.setting;
    if (!setting) return;
    setting.open();
    if (typeof setting.openTabById === "function") {
      setting.openTabById(this.manifest.id);
    }
    if (this.settingTab) {
      window.setTimeout(() => {
        this.settingTab.activeTab = tabId;
        this.settingTab.display();
      }, 0);
    }
  }

  getUpdateRawBase() {
    return resolveUpdateRawBase(this.settings);
  }

  getUpdateRawBases() {
    return resolveUpdateRawBases(this.settings);
  }

  checkForUpdatesOnStartup() {
    if (!this.settings.autoCheckUpdates) return;
    if (!this.getUpdateRawBase()) return;
    const last = Date.parse(this.settings.lastUpdateCheckAt || "");
    if (last && Date.now() - last < UPDATE_CHECK_INTERVAL_MS) return;
    window.setTimeout(() => {
      this.checkForUpdates({ silent: true }).catch(e => console.warn("[LexVoice] update check failed", e));
    }, 4000);
  }

  async checkForUpdates(options = {}) {
    const silent = !!options.silent;
    const allowSameVersion = !!options.allowSameVersion;
    const rawBases = this.getUpdateRawBases();
    if (!rawBases.length) {
      if (!silent) new obsidian.Notice("LexVoice 更新源未解析成功，请确认插件文件完整。", 8000);
      return null;
    }

    try {
      const manifestFetch = await fetchUpdateTextFromSources(rawBases, "manifest.json");
      const remoteManifest = JSON.parse(manifestFetch.text);
      if (!remoteManifest || remoteManifest.id !== this.manifest.id) {
        throw new Error("远端 manifest id 与当前插件不一致，已停止更新。");
      }
      const rawBase = manifestFetch.rawBaseUrl;
      const currentVersion = this.manifest.version || "0.0.0";
      const remoteVersion = remoteManifest.version || "0.0.0";
      const info = {
        version: remoteVersion,
        currentVersion,
        rawBaseUrl: rawBase,
        manifestUrl: manifestFetch.url,
        checkedAt: new Date().toISOString(),
        files: UPDATE_PLUGIN_FILES.slice(),
      };
      this.settings.lastUpdateCheckAt = info.checkedAt;
      this.settings.lastUpdateError = "";

      if (compareVersions(remoteVersion, currentVersion) > 0) {
        this.settings.availableUpdate = info;
        await this.saveSettings();
        new obsidian.Notice("LexVoice：发现新版本 " + remoteVersion + "（当前 " + currentVersion + "）。可在设置 > 更新 中一键增量更新。", silent ? 12000 : 8000);
        return info;
      }

      if (allowSameVersion && compareVersions(remoteVersion, currentVersion) === 0) {
        await this.saveSettings();
        if (!silent) new obsidian.Notice("LexVoice 当前仍是 " + currentVersion + "，将重新安装官方文件以修复本地副本。", 8000);
        return info;
      }

      this.settings.availableUpdate = null;
      await this.saveSettings();
      if (!silent) new obsidian.Notice("LexVoice 已是最新版本（" + currentVersion + "）。");
      return null;
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.settings.lastUpdateCheckAt = new Date().toISOString();
      this.settings.lastUpdateError = msg;
      await this.saveSettings();
      if (!silent) new obsidian.Notice("LexVoice 更新检查失败：" + msg, 10000);
      else console.warn("[LexVoice] update check failed", e);
      return null;
    }
  }

  async installAvailableUpdate() {
    let info = this.settings.availableUpdate;
    if (!info || !info.rawBaseUrl || compareVersions(info.version, this.manifest.version) <= 0) {
      info = await this.checkForUpdates({ silent: false, allowSameVersion: true });
    }
    if (!info || !info.rawBaseUrl) return;

    const adapter = this.app.vault.adapter;
    const basePath = pluginBasePath(this);
    const backupDir = basePath + "/.lexvoice-update-backups/" + updateBackupStamp();
    await ensureAdapterFolder(adapter, backupDir);

    const filesToBackup = UPDATE_PLUGIN_FILES.concat(["data.json"]);
    for (const fileName of filesToBackup) {
      const target = basePath + "/" + fileName;
      if (await adapter.exists(target)) {
        await adapter.write(backupDir + "/" + fileName, await adapter.read(target));
      }
    }

    const changed = [];
    const skipped = [];
    // main.js 不在仓库分支（.gitignore，只随 CI 上传到对应版本的 GitHub Release 资产），
    // 故 apply 时优先从 …/releases/download/<version>/ 取（Release 里 manifest/main.js/styles.css 都有）；
    // README.md 不是 Release 资产，会自动回落到 raw 分支（它已提交）。这修复"更新 main.js 失败：所有更新源都不可用（404）"。
    const releaseBase = info.version ? (LEXVOICE_UPDATE_REPO_URL.replace(/\/+$/, "") + "/releases/download/" + info.version) : "";
    const rawBases = [releaseBase, info.rawBaseUrl].concat(this.getUpdateRawBases()).filter(Boolean);

    // 两阶段，防「版本错位」：① 先把所有文件抓进内存——任一必需文件(manifest/main.js/styles)抓失败就整体放弃、一个字节都不写；
    // ② 写入时把 manifest.json 放最后，main.js/styles 成功落盘后才写 manifest。
    // 旧逻辑边抓边写、且 manifest 排在 main.js 之前——main.js 抓失败时 manifest 已被写成新版本号，
    // 造成「版本号涨了、代码没换」的静默错位（正是 1.7.x 一键更新 404 后用户卡在旧 main.js 的根因）。
    const fetchedFiles = {};
    for (const fileName of UPDATE_PLUGIN_FILES) {
      try {
        const fetched = await fetchUpdateTextFromSources(rawBases, fileName);
        if (fileName === "manifest.json") info.rawBaseUrl = fetched.rawBaseUrl;
        fetchedFiles[fileName] = fetched.text;
      } catch (e) {
        if (fileName === "README.md") { skipped.push(fileName); continue; } // README 非 Release 资产，缺了不阻断
        throw new Error("更新 " + fileName + " 失败：" + ((e && e.message) || e) + "（未改动任何本地文件，可稍后重试）");
      }
    }
    const writeOrder = UPDATE_PLUGIN_FILES.filter(f => f !== "manifest.json" && fetchedFiles[f] != null)
      .concat(fetchedFiles["manifest.json"] != null ? ["manifest.json"] : []);
    for (const fileName of writeOrder) {
      const target = basePath + "/" + fileName;
      const next = fetchedFiles[fileName];
      const current = (await adapter.exists(target)) ? await adapter.read(target) : "";
      if (current === next) { skipped.push(fileName); continue; }
      await adapter.write(target, next);
      const verified = await adapter.read(target);
      if (verified !== next) throw new Error("写入 " + fileName + " 后校验失败，请检查插件目录写入权限。");
      changed.push(fileName);
    }

    this.settings.installedUpdateVersion = info.version;
    this.settings.availableUpdate = null;
    this.settings.lastUpdateError = "";
    await this.saveSettings();

    const changedText = changed.length ? changed.join("、") : "无文件变化";
    const skippedText = skipped.length ? "；跳过 " + skipped.join("、") : "";
    new obsidian.Notice("LexVoice 已安装 " + info.version + "：更新 " + changedText + skippedText + "。写入目录：" + basePath + "。请重启 Obsidian 或重新启用插件生效。", 12000);
  }

  warnIfBuildManifestSkew() {
    // LEXVOICE_BUILD_VERSION 由 esbuild 构建时注入（= 打包当时 manifest.json 的版本）。它若与运行时
    // this.manifest.version 不一致，说明上次更新只写了 manifest、没换上 main.js（版本错位），插件实际跑的是旧代码。
    // 把这种「静默跑旧码」变成显式、可操作的提示，引导手动重装——曾经正是它的缺失让 404 问题被假象掩盖。
    try {
      const built = (typeof LEXVOICE_BUILD_VERSION === "string") ? LEXVOICE_BUILD_VERSION : "";
      const declared = (this.manifest && this.manifest.version) || "";
      if (built && declared && built !== declared) {
        console.warn("[LexVoice] build/manifest 版本错位：main.js=" + built + " manifest=" + declared);
        new obsidian.Notice(
          "LexVoice 版本错位：实际运行的 main.js 是 " + built + "，但 manifest 标的是 " + declared +
          "。上次更新可能没成功写入 main.js，当前在跑旧代码。请到 设置 > 更新 重新更新，或从 GitHub Release 手动重装最新版后重启 Obsidian。",
          0
        );
      }
    } catch (e) { console.warn("[LexVoice] skew check failed", e); }
  }

  setRecordingIssue(kind, patch) {
    const current = this.recordingIssue || {};
    this.recordingIssue = makeRecordingIssue(kind || current.kind || "service", Object.assign({}, current, patch || {}, {
      kind: kind || current.kind || "service",
      at: patch && patch.at ? patch.at : (current.at || Date.now()),
    }));
    try { this.refreshOutlineView(); } catch { /* intentionally empty */ }
    try { if (this.bubble && this.bubble.scheduleUpdate) this.bubble.scheduleUpdate(); } catch { /* intentionally empty */ }
  }

  clearRecordingIssue(kind) {
    if (!this.recordingIssue) return;
    if (kind && this.recordingIssue.kind !== kind) return;
    this.recordingIssue = null;
    try { this.refreshOutlineView(); } catch { /* intentionally empty */ }
    try { if (this.bubble && this.bubble.scheduleUpdate) this.bubble.scheduleUpdate(); } catch { /* intentionally empty */ }
  }

  getRecordingIssue() {
    const recorderIssue = this.recorder && this.recorder.getInfo ? (this.recorder.getInfo().issue || null) : null;
    if (recorderIssue && recorderIssue.kind === "microphone") return recorderIssue;
    return this.recordingIssue || recorderIssue || null;
  }

  refreshOutlineView() {
    try { this.updateBusyStatus(); } catch { /* intentionally empty */ }
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE);
    for (const leaf of leaves) {
      const v = leaf.view;
      if (!v) continue;
      // 优先走节流通道；旧实例兜底直调 render
      if (typeof v.scheduleUpdate === "function") v.scheduleUpdate();
      else if (typeof v.render === "function") v.render();
    }
  }

  // 转写进度状态栏：从队列 + 当前会话的实时状态渲染一行常驻指示器。
  // 挂在 refreshOutlineView（统一重绘入口）+ processAll 批量游标上，所有状态变化都能即时反映。
  updateBusyStatus() {
    const el = this.progressStatusEl;
    if (!el) return;
    const show = (icon, text, spin, muted) => {
      el.empty();
      el.removeClass("lexvoice-statusbar-hidden");
      el.toggleClass("lexvoice-statusbar-idle", !!muted);
      const ico = el.createSpan({ cls: "lexvoice-statusbar-icon" + (spin ? " lexvoice-statusbar-spin" : "") });
      try { obsidian.setIcon(ico, icon); } catch { /* intentionally empty */ }
      el.createSpan({ cls: "lexvoice-statusbar-text", text });
      el.setAttr("aria-label", text + "（点击查看转写队列）");
    };

    const q = this.queue;
    const maxR = (this.settings && this.settings.maxRetries) || 3;
    const tasks = q && Array.isArray(q.tasks) ? q.tasks : [];
    const runnable = tasks.filter((t) => t && t.status !== "running" && t.status !== "missing" && t.status !== "blocked" && (Number(t.retries) || 0) < maxR);

    const s = this.session;
    const wp = s && s.workProgress ? s.workProgress : null;
    const wpLabel = wp && wp.label ? String(wp.label) : "";
    const pct = wp && wp.percent != null && Number.isFinite(Number(wp.percent)) ? ` ${Math.round(Number(wp.percent))}%` : "";

    // 0) 导入多文件批量转写
    if (this._importBusy && Number(this._importBusy.total) > 0) {
      const ip = this._importBusy;
      show("loader-2", ip.label || `导入转写 ${Number(ip.done) || 0}/${ip.total}`, true);
      return;
    }
    // A) 批量转写处理（重试全部 / 重新转写整篇 / 多任务串行跑）——叠加当前任务的实时阶段标签。
    // 只看 _batchTotal（processAll 和手动逐条循环都会设它），不要求 q.running，避免漏掉手动循环路径。
    if (q && Number(q._batchTotal) > 0) {
      const done = Math.min(Number(q._batchDone) || 0, Number(q._batchTotal));
      show("loader-2", `转写处理中 ${done}/${q._batchTotal}${wpLabel ? " · " + wpLabel : ""}`, true);
      return;
    }
    // A2) 通用长操作（重新整理 / 整篇重新润色等，无可计数子任务）
    if (this._busyLabel) {
      show("loader-2", String(this._busyLabel), true);
      return;
    }
    // B) 会后 AI 整理：多个子阶段（整理上下文 / 生成大纲 / 合并润色…）+ 百分比，跟着 workProgress 实时切换
    if (s && s.finalizing) {
      show("loader-2", (wpLabel || "AI 整理中") + pct, true);
      return;
    }
    // C) 录音进行中：实时走动的录音时长 + 已转写段数；某段在转写时叠加"转写中"
    const rec = this.recorder;
    const recState = rec && typeof rec.state === "string" ? rec.state : "idle";
    if (s && (recState === "recording" || recState === "paused")) {
      let elapsed = 0;
      try { elapsed = (rec.getInfo && rec.getInfo().elapsed) || 0; } catch { /* intentionally empty */ }
      const segN = Array.isArray(s.segments) ? s.segments.length : 0;
      if (recState === "paused") {
        show("pause", `录音已暂停 ${formatElapsed(elapsed)}`, false);
      } else if (Number(s.activeSegmentJobs) > 0) {
        show("loader-2", `录音 ${formatElapsed(elapsed)} · 转写中`, true);
      } else {
        show("mic", `录音 ${formatElapsed(elapsed)}${segN ? " · 已转写 " + segN + " 段" : ""}`, false);
      }
      return;
    }
    // C2) 非录音但仍有段落在转写（停止后的尾段收尾）
    if (s && Number(s.activeSegmentJobs) > 0) {
      show("loader-2", (wpLabel || "转写中") + pct, true);
      return;
    }
    // D) 有待处理任务但空闲（可点重试）
    if (runnable.length > 0) {
      show("clock", `${runnable.length} 个待转写`, false);
      return;
    }
    // E) 空闲 → 低调常驻锚点
    show("circle-check", "LexVoice 就绪", false, true);
  }

  // 兼容旧调用名：早期代码里残留 this.renderStatusBar() 调用点，但 renderStatusBar 从未定义
  // → 运行时抛 TypeError（曾导致"重试失败转写/清空队列"中途崩、完成提示不弹）。统一别名到 updateBusyStatus。
  renderStatusBar() { try { this.updateBusyStatus(); } catch { /* intentionally empty */ } }

  // 记一笔"本次启动后已完成"的处理（供处理进度面板展示；不持久化，OB 重启清零）。
  logCompletedWork(title, detail, meter) {
    if (!Array.isArray(this.completedWorkLog)) this.completedWorkLog = [];
    const entry = { title: String(title || "完成"), detail: String(detail || ""), at: Date.now() };
    if (meter && Number(meter.durationMs) > 0) entry.durationMs = Math.round(Number(meter.durationMs));
    if (meter && Number(meter.tokens) > 0) { entry.tokens = Math.round(Number(meter.tokens)); entry.tokensExact = !!meter.exact; }
    this.completedWorkLog.unshift(entry);
    if (this.completedWorkLog.length > 80) this.completedWorkLog.length = 80;
    try { this.updateBusyStatus(); } catch { /* intentionally empty */ }
  }

  // 转写完成后的自动沉淀（仅 settings.sedimentAutoExtract 开启时触发）：扫描纪要 → 学习卡片/待办自动入库。
  // 后台跑、try/catch 静默——绝不影响主流程；沉淀扫描已走续写拼接（callLlmWithContinuation），不会被输出上限截断。
  async autoExtractSedimentAfterFinalize(mdPath) {
    try {
      const file = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(mdPath || ""));
      if (!(file instanceof obsidian.TFile)) return;
      const markdown = await this.app.vault.cachedRead(file);
      const objects = await generateSedimentObjects(this, file, markdown);
      await writeSedimentObjectCards(this, file, { learningCards: objects.learningCards || [], todos: objects.todos || [] });
    } catch (e) { console.error("[LexVoice] autoExtractSedimentAfterFinalize", e); }
  }

  // —— 单任务 token 计量 —— beginTaskMeter 开窗，期间所有 LLM 调用经 callLlmWithMeta→addTaskMeter 累计，endTaskMeter 结算。
  beginTaskMeter() { this._taskMeter = { inChars: 0, outChars: 0, exactTokens: 0, calls: 0, hasExact: true, startedAt: Date.now() }; }
  addTaskMeter(inChars, outChars, usage) {
    const m = this._taskMeter; if (!m) return;
    m.calls++;
    m.inChars += Number(inChars) || 0;
    m.outChars += Number(outChars) || 0;
    const t = usage && Number(usage.total_tokens);
    if (t) m.exactTokens += t; else m.hasExact = false;
  }
  endTaskMeter() {
    const m = this._taskMeter; this._taskMeter = null;
    if (!m || !m.calls) return null;
    const exact = m.hasExact && m.exactTokens > 0;
    // 流式调用拿不到精确 usage 时按字符估算：中文为主的 MiMo 约 1.6 字/token（粗估、仅供心里有数，精确以模型控制台为准）。
    const tokens = exact ? m.exactTokens : Math.round((m.inChars + m.outChars) / 1.6);
    return { tokens, exact, durationMs: m.startedAt ? Math.max(0, Date.now() - m.startedAt) : 0 };
  }

  // 当前正在进行的处理标签（导入/批量/重整/录音整理/转写/录音），空闲返回 null。供处理进度面板的"处理中"区用。
  getCurrentActivityLabel() {
    if (this._importBusy && Number(this._importBusy.total) > 0) {
      const ip = this._importBusy;
      return ip.label || `导入转写 ${Number(ip.done) || 0}/${ip.total}`;
    }
    if (this.queue && Number(this.queue._batchTotal) > 0) {
      const done = Math.min(Number(this.queue._batchDone) || 0, Number(this.queue._batchTotal));
      return `转写处理中 ${done}/${this.queue._batchTotal}`;
    }
    if (this._busyLabel) return String(this._busyLabel);
    const s = this.session;
    if (s && s.finalizing) return (s.workProgress && s.workProgress.label) || "AI 整理中";
    if (s && Number(s.activeSegmentJobs) > 0) return (s.workProgress && s.workProgress.label) || "转写中";
    if (this.recorder && this.recorder.state === "recording") return "录音中";
    return null;
  }

  // 结构化的当前活动详情：任务类型 / 模式 / 当前步骤 / 进度% / 步骤说明。供处理进度面板展开展示。
  // 与 getCurrentActivityLabel 同源同优先级，只是返回结构而非一行字符串；空闲返回 null。
  getCurrentActivityDetail() {
    const modeLabelOf = (m) => { try { return (getModeMeta(this.settings, m) || {}).label || ""; } catch { return ""; } };
    const pctOf = (wp) => (wp && wp.percent != null && Number.isFinite(Number(wp.percent))) ? Number(wp.percent) : null;
    // 0) 导入多文件批量转写
    const ip = this._importBusy;
    if (ip && Number(ip.total) > 0) {
      const total = Number(ip.total);
      const n = Math.min((Number(ip.done) || 0) + 1, total);
      return {
        kind: "导入转写",
        modeLabel: modeLabelOf(ip.mode),
        step: "转写音频中",
        stepDetail: ip.file ? `当前文件：${ip.file}` : "正在把音频发送到转写服务",
        percent: null,
        count: `第 ${n} / ${total} 个文件`,
      };
    }
    // A) 批量转写处理（重试全部 / 整篇重转）——叠加 workProgress 子阶段
    const q = this.queue;
    if (q && Number(q._batchTotal) > 0) {
      const done = Math.min(Number(q._batchDone) || 0, Number(q._batchTotal));
      const wp = this.session && this.session.workProgress;
      return {
        kind: "转写批处理",
        modeLabel: this.session ? modeLabelOf(this.session.mode) : "",
        step: (wp && wp.label) || "转写处理中",
        stepDetail: (wp && wp.detail) || "",
        percent: pctOf(wp),
        count: `${done} / ${q._batchTotal} 段`,
      };
    }
    // A2) 通用长操作（重新整理 / 整篇重新润色）
    if (this._busyLabel) {
      return { kind: "重新整理", modeLabel: "", step: String(this._busyLabel), stepDetail: "", percent: null, count: "" };
    }
    // B/C) 录音 / 段落转写 / 会后 AI 整理（this.session）
    const s = this.session;
    if (s) {
      const wp = s.workProgress || null;
      const pct = pctOf(wp);
      const modeLabel = modeLabelOf(s.mode);
      const srcKind = s.source === "import" ? "导入整理" : s.source === "text-import" ? "文本整理" : "录音整理";
      if (s.finalizing) {
        return { kind: srcKind, modeLabel, step: (wp && wp.label) || "AI 整理中", stepDetail: (wp && wp.detail) || "", percent: pct, count: "" };
      }
      const rec = this.recorder;
      const recState = rec && typeof rec.state === "string" ? rec.state : "idle";
      if (recState === "recording" || recState === "paused") {
        let elapsed = 0; try { elapsed = (rec.getInfo && rec.getInfo().elapsed) || 0; } catch { /* intentionally empty */ }
        const segN = Array.isArray(s.segments) ? s.segments.length : 0;
        const countTxt = segN ? `已转写 ${segN} 段` : "";
        if (recState === "paused") {
          return { kind: "录音中", modeLabel, step: `录音已暂停 · ${formatElapsed(elapsed)}`, stepDetail: "", percent: null, count: countTxt };
        }
        if (Number(s.activeSegmentJobs) > 0) {
          return { kind: "录音中", modeLabel, step: `录音 ${formatElapsed(elapsed)} · 转写中`, stepDetail: (wp && wp.detail) || "正在转写已切分的音频段", percent: pct, count: countTxt };
        }
        return { kind: "录音中", modeLabel, step: `正在录音 · ${formatElapsed(elapsed)}`, stepDetail: segN ? "" : "等待第一段切分", percent: null, count: countTxt };
      }
      if (Number(s.activeSegmentJobs) > 0) {
        return { kind: srcKind, modeLabel, step: (wp && wp.label) || "转写中", stepDetail: (wp && wp.detail) || "", percent: pct, count: "" };
      }
    }
    return null;
  }

  scheduleRealtimeOutline() {
    if (this.outlineRefreshTimer) window.clearTimeout(this.outlineRefreshTimer);
    const delay = Math.max(2500, this.settings.realtimeOutlineDebounceMs || 1500);
    const local = isLocalLlmEndpoint(this.settings.llmEndpoint);
    this.outlineRefreshTimer = window.setTimeout(() => {
      this.outlineRefreshTimer = null;
      if (!shouldRunRealtimeOutline(this.session, { silent: true, local })) return;
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE);
      let handledByView = false;
      for (const leaf of leaves) {
        const v = leaf.view;
        if (v && typeof v.refreshAIOutline === "function") {
          handledByView = true;
          v.refreshAIOutline({ silent: true });
        }
      }
      if (!handledByView) void this.refreshRealtimeOutlineInBackground({ silent: true });
    }, delay);
  }

  async refreshRealtimeOutlineInBackground(opts = {}) {
    const session = this.session;
    if (!session || !session.segments || !session.segments.length) return;
    if (this._backgroundOutlineRunning) {
      this._backgroundOutlineQueued = true;
      return;
    }
    const local = isLocalLlmEndpoint(this.settings.llmEndpoint);
    if (!shouldRunRealtimeOutline(session, { silent: !!opts.silent, force: !!opts.force, final: !!opts.final, local })) return;
    this._backgroundOutlineRunning = true;
    try {
      // 本地档：基础超时 ×2（在 generateRealtimeOutlineForSession 内由 getRealtimeOutlineTimeoutMs 处理），
      // 这里如果调用方显式传 timeoutMs，本地档也对它放大一倍
      const explicitTimeout = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 0;
      const baseTimeout = opts.silent ? REALTIME_OUTLINE_SILENT_TIMEOUT_MS : REALTIME_OUTLINE_MANUAL_TIMEOUT_MS;
      const effectiveTimeout = explicitTimeout || baseTimeout;
      await this.generateRealtimeOutlineForSession(session, {
        timeoutMs: local ? effectiveTimeout * 2 : effectiveTimeout,
        silent: !!opts.silent,
        force: !!opts.force,
        final: !!opts.final,
        maxTokens: opts.maxTokens || REALTIME_OUTLINE_SILENT_MAX_TOKENS,
        local,
      });
      markRealtimeOutlineSuccess(session);
      this.refreshOutlineView();
    } catch (e) {
      console.error("[LexVoice] background realtime outline failed", e);
      markRealtimeOutlineFailure(session);
      await this.logDiagnostic("error", "outline.background_generate_failed", "后台实时大纲生成失败", {
        silent: !!opts.silent,
        local,
        segmentCount: session.segments.length,
        lastOutlineSegmentCount: session.realtimeOutlineSegmentCount || 0,
        memoryChars: String(session.realtimeOutlineMemory || "").length,
        window: session.realtimeOutlineWindow || null,
        mode: session.mode,
        captureMode: session.captureMode,
        error: diagnosticError(e),
      });
    } finally {
      this._backgroundOutlineRunning = false;
      if (this._backgroundOutlineQueued) {
        this._backgroundOutlineQueued = false;
        if (shouldRunRealtimeOutline(this.session, { silent: true, local })) {
          const nextAllowedAt = Number(this.session && this.session.realtimeOutlineNextAllowedAt) || 0;
          const wait = Math.max(1000, nextAllowedAt - Date.now());
          window.setTimeout(() => { void this.refreshRealtimeOutlineInBackground({ silent: true }); }, wait);
        }
      }
    }
  }

  updateMeetingWorkbenchEntry(session, entryId, updater) {
    if (!session || !entryId || typeof updater !== "function") return false;
    const current = normalizeMeetingWorkbench(session.meetingWorkbench);
    let changed = false;
    const entries = current.entries.map((item) => {
      if (item.id !== entryId) return item;
      changed = true;
      return Object.assign({}, item, updater(Object.assign({}, item)) || {});
    });
    if (!changed) return false;
    session.meetingWorkbench = normalizeMeetingWorkbench(Object.assign({}, current, { entries }));
    this.refreshOutlineView();
    return true;
  }

  buildMeetingWorkbenchInteractionContext(session, entry) {
    const atMs = Number(entry && entry.atMs) || 0;
    const before = [];
    const after = [];
    for (const s of (Array.isArray(session && session.segments) ? session.segments : [])) {
      if (!s || !s.text) continue;
      const start = Number(s.startOffsetMs) || 0;
      const end = Number(s.endOffsetMs ?? s.startOffsetMs) || start;
      const line = clipMeetingInteractionSegmentLine(`[${formatElapsed(start)}-${formatElapsed(end)}] ${String(s.text || "").trim()}`);
      if (end <= atMs) before.push(line);
      else if (start >= atMs) after.push(line);
    }
    return [
      session && session.realtimeOutline ? `【当前实时大纲】\n${clipRealtimeContextText(String(session.realtimeOutline).trim(), MEETING_INTERACTION_OUTLINE_MAX_CHARS)}` : "",
      session && session.realtimeOutlineMemory ? `【主题记忆】\n${clipRealtimeContextText(String(session.realtimeOutlineMemory).trim(), MEETING_INTERACTION_MEMORY_MAX_CHARS)}` : "",
      before.length ? `【该记录前的转写片段】\n${before.slice(-3).join("\n")}` : "",
      after.length ? `【该记录后的转写片段】\n${after.slice(0, 1).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  hasActiveRecordingOrTranscription(session) {
    if (session && Number(session.activeSegmentJobs || 0) > 0) return true;
    return false;
  }

  canRunMeetingWorkbenchInteraction(session, opts = {}) {
    if (!session) return false;
    if (opts.force) return true;
    if (this.hasActiveRecordingOrTranscription(session)) return false;
    if (this._backgroundOutlineRunning) return false;
    const rec = this.recorder;
    if (rec && rec.state === "recording") {
      const info = rec.getInfo ? rec.getInfo() : {};
      const nextCutAt = Number(rec.nextCutAtElapsed);
      if (Number.isFinite(nextCutAt)) {
        const timeToNextCut = nextCutAt - (Number(info.elapsed) || 0);
        if (timeToNextCut > 0 && timeToNextCut < 8000) return false;
      }
    }
    return true;
  }

  scheduleMeetingWorkbenchInteraction(session, entryId) {
    if (!session || !entryId) return;
    const queue = Array.isArray(session.pendingMeetingWorkbenchInteractions)
      ? session.pendingMeetingWorkbenchInteractions
      : [];
    if (!queue.includes(entryId)) queue.push(entryId);
    session.pendingMeetingWorkbenchInteractions = queue;
    if (!this.canRunMeetingWorkbenchInteraction(session)) {
      this.refreshOutlineView();
      if (this._meetingWorkbenchInteractionTimer) window.clearTimeout(this._meetingWorkbenchInteractionTimer);
      this._meetingWorkbenchInteractionTimer = window.setTimeout(() => {
        this._meetingWorkbenchInteractionTimer = 0;
        this.processPendingMeetingWorkbenchInteractions(session).catch(e => console.error("[LexVoice] meeting workbench queue retry failed", e));
      }, 3000);
      return;
    }
    if (this._meetingWorkbenchInteractionTimer) window.clearTimeout(this._meetingWorkbenchInteractionTimer);
    this._meetingWorkbenchInteractionTimer = window.setTimeout(() => {
      this._meetingWorkbenchInteractionTimer = 0;
      this.processPendingMeetingWorkbenchInteractions(session).catch(e => console.error("[LexVoice] meeting workbench queue failed", e));
    }, 1000);
  }

  async processPendingMeetingWorkbenchInteractions(session, opts = {}) {
    if (!session) return;
    if (!this.canRunMeetingWorkbenchInteraction(session, opts)) {
      if (!opts.force) this.scheduleMeetingWorkbenchInteraction(session, (session.pendingMeetingWorkbenchInteractions || [])[0]);
      return;
    }
    if (this._meetingWorkbenchInteractionRunning) return;
    this._meetingWorkbenchInteractionRunning = true;
    try {
      const workbench = normalizeMeetingWorkbench(session.meetingWorkbench);
      const queued = Array.isArray(session.pendingMeetingWorkbenchInteractions)
        ? session.pendingMeetingWorkbenchInteractions.slice()
        : [];
      const ids = queued.length
        ? queued
        : workbench.entries
            .filter(entry => entry.interaction && entry.interaction.kind && (!entry.interaction.status || entry.interaction.status === "pending" || entry.interaction.status === "error"))
            .map(entry => entry.id);
      session.pendingMeetingWorkbenchInteractions = [];
      for (const entryId of ids) {
        if (!opts.force && !this.canRunMeetingWorkbenchInteraction(session)) {
          const rest = ids.slice(ids.indexOf(entryId));
          session.pendingMeetingWorkbenchInteractions = Array.from(new Set([...(session.pendingMeetingWorkbenchInteractions || []), ...rest]));
          this.scheduleMeetingWorkbenchInteraction(session, entryId);
          break;
        }
        await this.processMeetingWorkbenchInteraction(session, entryId);
      }
    } finally {
      this._meetingWorkbenchInteractionRunning = false;
    }
  }

  async processMeetingWorkbenchInteraction(session, entryId) {
    if (!session || !entryId) return;
    const workbench = normalizeMeetingWorkbench(session.meetingWorkbench);
    const entry = workbench.entries.find(item => item.id === entryId);
    if (!entry || !entry.interaction || !entry.interaction.kind) return;
    // 元数据 kinds（assignee / todo）不走 AI 助理
    if (MEETING_METADATA_KINDS.has(entry.interaction.kind)) return;
    if (entry.interaction.status === "running" || entry.interaction.status === "done") return;
    this.updateMeetingWorkbenchEntry(session, entryId, (item) => ({
      interaction: Object.assign({}, item.interaction, { status: "running", error: "", updatedAt: new Date().toISOString() }),
    }));
    try {
      const latest = normalizeMeetingWorkbench(session.meetingWorkbench).entries.find(item => item.id === entryId) || entry;
      const context = this.buildMeetingWorkbenchInteractionContext(session, latest);
      const kind = latest.interaction.kind;
      const label = kind === "concept" ? "概念解释" : (kind === "question" ? "问题回答" : "重点处理");
      const system = "你是 LexVoice 的会中即时助理。只回答用户这条会中记录，不改写实时大纲，不生成完整纪要。回答要短、具体、可直接挂在这条记录下面。";
      const user = [
        `会中记录时间：${formatElapsed(latest.atMs || 0)}`,
        `触发类型：${label}`,
        `用户原文：${latest.text || latest.interaction.query}`,
        "",
        context || "当前还没有足够转写上下文，请主要根据用户问题本身作答。",
        "",
        "回答规则：",
        "- #概念：给出定义、怎么使用、上下位概念、在当前语境里的意义；最多 5 条短句。",
        "- ?问题：直接回答问题，并结合当前大纲/转写上下文；最多 5 条短句。",
        "- !重点：说明这条重点为什么要保留、最终纪要应如何处理；最多 4 条短句。",
        "- 不要写“未提及”“待确认”这类空字段；信息不足时直接说“现有上下文不足以判断”。",
        "- 不要声称做了声纹识别，不要编造人物责任。",
      ].join("\n");
      const raw = await callLlm(this, system, user, {
        timeoutMs: MEETING_INTERACTION_TIMEOUT_MS,
        payload: { max_tokens: getMeetingInteractionMaxTokens(kind) },
        priority: "user",
        noRetry: true,
      });
      const response = String(raw || "").trim();
      this.updateMeetingWorkbenchEntry(session, entryId, (item) => ({
        interaction: Object.assign({}, item.interaction, {
          status: "done",
          response: response || "现有上下文不足以判断。",
          error: "",
          updatedAt: new Date().toISOString(),
        }),
      }));
    } catch (e) {
      console.error("[LexVoice] meeting workbench interaction failed", e);
      this.updateMeetingWorkbenchEntry(session, entryId, (item) => ({
        interaction: Object.assign({}, item.interaction, {
          status: "error",
          error: (e && e.message) || String(e),
          updatedAt: new Date().toISOString(),
        }),
      }));
      await this.logDiagnostic("warn", "meeting_workbench.interaction_failed", "会中记录 AI 互动失败", {
        entryId,
        mode: session.mode,
        error: diagnosticError(e),
      });
    }
  }

  async generateRealtimeOutlineForSession(session, opts = {}) {
    if (!session) return "";
    // session 级单飞锁：View / background / final(收尾) 三条触发路径都走这里，用 per-session promise 串行化，
    // 杜绝并发 read-modify-write 互相覆盖 session.realtimeOutlineState / jobPortraitCoverage。
    const prevLock = session._outlineGenLock || Promise.resolve();
    let releaseLock = () => { /* intentionally empty */ };
    session._outlineGenLock = new Promise((r) => { releaseLock = r; });
    try { await prevLock; } catch { /* intentionally empty */ }
    try {
      return await this._genOutlineInner(session, opts);
    } finally {
      releaseLock();
    }
  }
  async _genOutlineInner(session, opts = {}) {
    if (!session || !session.segments || !session.segments.length) return "";
    // 招聘需求挖掘：会中走"画像字段树覆盖扫描"，早 return，绝不进入下方 time-based 后处理
    // （parse / normalize / validate / 冻结合并对 14 维 JSON 全程有害；其它 5 个模式公共路径零改动）。
    if (session.mode === "recruit-needs") return await this.generateRecruitNeedsCoverageForSession(session, opts);
    const processedSegmentCount = session.segments.length;
    // 全窗口重新综合（不走增量）：每轮把最近窗口完整喂给模型，让它生成有层级、有子要点的丰富大纲。
    // 增量"只追加 L1"会让大纲失去灵魂（只剩光秃秃的一级标题），故回退。
    // 老话题的时间戳由 buildOutlineAudioAnchorInstruction 的钉死规则保护，不会漂移。
    const windowed = selectRealtimeOutlineSegments(session.segments);
    const workbenchSignature = "";
    const transcript = buildRealtimeOutlineTranscript(windowed.segments);
    if (!transcript.trim()) {
      session.realtimeOutlineWindow = {
        usedCount: 0,
        omittedBeforeCount: windowed.omittedBeforeCount || 0,
        totalTextCount: windowed.totalTextCount || 0,
        approxChars: 0,
        memoryChars: String(session.realtimeOutlineMemory || "").length,
        processedSegmentCount,
        workbenchChars: 0,
      };
      session.realtimeOutlineSegmentCount = processedSegmentCount;
      session.realtimeOutlineUpdatedAt = new Date().toISOString();
      return session.realtimeOutline || "";
    }
    const meta = getModeMeta(this.settings, session.mode);
    const sys = "你是结构化思考助手。任务不是复述，而是把零散的发言归并到共同的上一级概念之下。层级深度由材料决定，不预设。克制——不堆砌符号、不强加分析维度、不过度抽象。";
    const local = !!opts.local || isLocalLlmEndpoint(this.settings && this.settings.llmEndpoint);
    // 实时大纲每轮走 buildOutlinePrompt 全量综合 + 冻结合并（见下方 mergeStableRealtimeOutlineNodes）。
    // 历史上的"JSON 补丁式增量"已彻底移除：它只能点状微调、给不了丰富子要点，是大纲失魂的元凶。
    const rollingContext = buildRollingOutlineContext(session.realtimeOutlineMemory, session.realtimeOutline, windowed);
    // 前缀缓存优化：语种指令前置进稳定块（不再追加到转写之后），转写严格放最后。
    const langInstruction = buildBriefingLanguageInstruction(this.settings);
    const user = buildOutlinePrompt(meta.prefix, session.mode, rollingContext + transcript, session.captureMode, langInstruction);
    // 本地档：未传 timeoutMs 时由 getRealtimeOutlineTimeoutMs 内部 ×2；
    // opts.local 由上层调用方根据 isLocalLlmEndpoint(settings.llmEndpoint) 透传进来
    const timeoutMs = Number(opts.timeoutMs) > 0
      ? Math.round(Number(opts.timeoutMs))
      : getRealtimeOutlineTimeoutMs(windowed, { local });
    const maxTokens = Math.max(600, Math.round(Number(opts.maxTokens) || (opts.final ? REALTIME_OUTLINE_FINAL_MAX_TOKENS : REALTIME_OUTLINE_SILENT_MAX_TOKENS)));
    const raw = await callLlm(this, sys, user, {
      timeoutMs,
      payload: { max_tokens: maxTokens },
      priority: opts.final ? "normal" : "background",
      noRetry: !opts.final,
    });
    const parsed = parseRealtimeOutlineResponse(raw, session.realtimeOutline, session.realtimeOutlineMemory);
    // attachUntimed:true 只用于模型本轮 fresh 输出——把无锚点延续行降级挂靠为上一节点子项，
    // 不再整轮丢光（治 no_top_level_bullets 内容白丢）。state 渲染那次(下方 19331)不开，避免改写历史。
    const result = normalizeOutlineMarkdownForDisplay(parsed.outline, { attachUntimed: true });
    const validation = validateRealtimeOutlineMarkdown(result, { previousOutline: session.realtimeOutline });
    if (!validation.ok) {
      session.realtimeOutlineMemory = parsed.memory || session.realtimeOutlineMemory || "";
      session.realtimeOutlineUpdatedAt = new Date().toISOString();
      session.realtimeOutlineWindow = {
        usedCount: windowed.usedCount,
        omittedBeforeCount: windowed.omittedBeforeCount,
        totalTextCount: windowed.totalTextCount,
        approxChars: windowed.approxChars,
        memoryChars: String(session.realtimeOutlineMemory || "").length,
        processedSegmentCount: Math.max(0, Number(session.realtimeOutlineSegmentCount) || 0),
        workbenchChars: workbenchSignature.length,
        rejectedReason: validation.reason,
      };
      // 软失败：已有可用旧大纲时，本轮不合格也不 throw（throw 会进退避且不推进游标→同窗反复被拒、刷屏）。
      // 保留旧大纲；游标只推到"留最后 N 段重试窗"的低水位（单调不减），给被判不合格的延续内容下一轮再
      // 进窗、再综合的机会。但连续软失败超过上限就推满游标放弃这批——否则每 30s 周期性重综合同一窗口烧
      // token（软失败走 success 路径清了退避，唯一闸是 30s 间隔门，不限次会无限重试）。
      if (session.realtimeOutline && String(session.realtimeOutline).trim()) {
        session._outlineSoftFailStreak = (Number(session._outlineSoftFailStreak) || 0) + 1;
        if (session._outlineSoftFailStreak <= 3) {
          session.realtimeOutlineSegmentCount = Math.max(
            Number(session.realtimeOutlineSegmentCount) || 0,
            Math.max(0, processedSegmentCount - REALTIME_OUTLINE_MIN_NEW_SEGMENTS)
          );
        } else {
          session.realtimeOutlineSegmentCount = processedSegmentCount;
        }
        return session.realtimeOutline;
      }
      // 还没有任何大纲(开头几轮)：保持 throw，触发正常重试/退避。
      throw new Error(`实时大纲输出格式不合格：${validation.reason}`);
    }
    // 冻结合并：本轮通过验证的"新输出"（≤8 话题的近窗结果）并入已有状态——历史话题冻结、
    // 只更新"进行中的最后一个话题" + 追加真正的新话题。大纲因此全部内容稳定存在、只在末尾增量生长；
    // 单轮模型抽风（连排 / 漏拆 / 改写）最多影响末尾，碰不到已定稿的历史。
    const existingOutlineState = normalizeRealtimeOutlineState(session.realtimeOutlineState, session.realtimeOutline, session.realtimeOutlineMemory);
    const freshOutlineNodes = parseRealtimeOutlineStateFromMarkdown(result);
    const mergedOutlineNodes = mergeStableRealtimeOutlineNodes(existingOutlineState.nodes, freshOutlineNodes);
    const mergedOutlineState = normalizeRealtimeOutlineState({
      version: 1,
      nodes: mergedOutlineNodes,
      memory: parsed.memory || existingOutlineState.memory || "",
    });
    session.realtimeOutline = normalizeOutlineMarkdownForDisplay(renderRealtimeOutlineStateMarkdown(mergedOutlineState));
    session.realtimeOutlineMemory = mergedOutlineState.memory;
    session.realtimeOutlineState = mergedOutlineState;
    session.realtimeOutlineSegmentCount = processedSegmentCount;
    session._outlineSoftFailStreak = 0; // 本轮成功，清零软失败连续计数
    session.realtimeOutlineWorkbenchSignature = workbenchSignature;
    session.realtimeOutlineUpdatedAt = new Date().toISOString();
    session.realtimeOutlineWindow = {
      usedCount: windowed.usedCount,
      omittedBeforeCount: windowed.omittedBeforeCount,
      totalTextCount: windowed.totalTextCount,
      approxChars: windowed.approxChars,
      memoryChars: String(session.realtimeOutlineMemory || "").length,
      processedSegmentCount,
      workbenchChars: workbenchSignature.length,
    };
    return session.realtimeOutline || result;
  }

  // 招聘需求挖掘 · 会中"画像字段树覆盖扫描"。每轮整场转写 → 14 维 covered/partial/missing。
  // 与 time-based 大纲物理隔离：只读/写 session.jobPortraitCoverage，绝不碰 realtimeOutline 内容。
  async generateRecruitNeedsCoverageForSession(session, opts = {}) {
    if (!session || !session.segments || !session.segments.length) return "";
    // 会后画像由 generateJobPortrait 负责。但覆盖字段树面板要消费 jobPortraitCoverage——
    // 若会中一次都没扫成（短会/录一段就停），或扫过但游标没追平最新段落（中等会扫一轮就被节流），
    // finalize 这轮是唯一兜底，必须补扫，否则字段树永久空白/停滞。仅在"已扫过且游标追平"时才省这次 LLM。
    if (opts.final
      && session.jobPortraitCoverage && session.jobPortraitCoverage.updatedAt
      && Number(session.realtimeOutlineSegmentCount || 0) >= session.segments.length) {
      return "";
    }
    // 覆盖扫描是"截至目前是否谈到过某维"的累积判断，必须看整场转写——绝不能用滑动窗口：
    // 窗口会让早段谈过的维度滑出视野、本轮被模型误判 missing → 字段树覆盖数随窗口滑动而闪回（忽有忽无）。
    // 整场转写靠前缀缓存摊薄成本（稳定指令在前、转写在后且只增不改，每轮主要增量是新段落）。
    const transcript = buildRealtimeOutlineTranscript(session.segments);
    // 即使空转写也推进节流游标，避免 shouldRunRealtimeOutline 读旧值反复触发。
    const advanceThrottleCursors = () => {
      session.realtimeOutlineSegmentCount = session.segments.length;
      session.realtimeOutlineUpdatedAt = new Date().toISOString();
    };
    if (!transcript.trim()) { advanceThrottleCursors(); return ""; }
    const local = !!opts.local || isLocalLlmEndpoint(this.settings && this.settings.llmEndpoint);
    const timeoutMs = Number(opts.timeoutMs) > 0
      ? Math.round(Number(opts.timeoutMs))
      : getRealtimeOutlineTimeoutMs({ approxChars: transcript.length }, { local });
    // 扩 schema 后每维多了 followup_question(≤30字) + vague_hits 数组，14 维累计输出更长；
    // 兜到 2000 防尾部维度被截断（REALTIME_OUTLINE_SILENT_MAX_TOKENS 现为 1600）。
    const maxTokens = Math.max(2000, REALTIME_OUTLINE_SILENT_MAX_TOKENS);
    const user = buildCoverageScanPrompt(transcript, buildBriefingLanguageInstruction(this.settings));
    const raw = await callLlm(this, JOBPORTRAIT_SYSTEM_PROMPT, user, {
      timeoutMs,
      payload: { max_tokens: maxTokens },
      priority: "background",
      noRetry: true,
    });
    // 早期轮(转写还短、模型最易误判 covered)不冻结，让误判可自我纠正；积累够了再启用单调累积防闪回。
    // 闪回的真凶(滑动窗口)已改为喂整场，所以早期放开纠正不会让闪回回归。
    const allowFreeze = (transcript.length >= 1500) || ((session.segments && session.segments.length) || 0) >= 5;
    const coverage = parseCoverageScanModel(raw, session.jobPortraitCoverage, allowFreeze);
    coverage.segmentCount = session.segments.length;
    session.jobPortraitCoverage = coverage;
    // 复用 time-based 的节流游标（shouldRunRealtimeOutline 读这俩判 30s 间隔/新增段落）；
    // 这俩字段对 recruit-needs 渲染无影响（渲染读 jobPortraitCoverage），写了无副作用。
    advanceThrottleCursors();
    return "";
  }

  async ensureRealtimeOutlineForFinalNote(session) {
    // recruit-needs 的覆盖字段树是该模式的核心交付，不受面向其它 5 个模式的"实时大纲"全局开关连坐。
    if (!this.settings.enableRealtimeOutline && (!session || session.mode !== "recruit-needs")) return;
    if (!session || !session.segments || !session.segments.length) return;
    const hasTranscript = session.segments.some(s => s && s.text && String(s.text).trim());
    if (!hasTranscript) return;
    if (isRealtimeOutlineCurrent(session)) return;
    try {
      await this.generateRealtimeOutlineForSession(session, {
        timeoutMs: REALTIME_OUTLINE_FINAL_TIMEOUT_MS,
        force: true,
        final: true,
        maxTokens: REALTIME_OUTLINE_FINAL_MAX_TOKENS,
      });
      markRealtimeOutlineSuccess(session);
    } catch (e) {
      markRealtimeOutlineFailure(session);
      console.error("[LexVoice] final realtime outline failed", e);
      await this.logDiagnostic("warn", "outline.final_generate_failed", "最终纪要写入前生成实时大纲失败", {
        segmentCount: session.segments.length,
        mode: session.mode,
        captureMode: session.captureMode,
        error: diagnosticError(e),
      });
    }
  }

  async openOutlineView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE);
    if (existing.length) {
      void this.app.workspace.revealLeaf(existing[0]);
      this.syncBubbleVisibility();
      return;
    }
    const leaf = isLexVoiceMobileRuntime()
      ? this.app.workspace.getLeaf(true)
      : (this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf(true));
    await leaf.setViewState({ type: VIEW_TYPE_OUTLINE, active: true });
    void this.app.workspace.revealLeaf(leaf);
    this.syncBubbleVisibility();
  }

  // 判断实时纪要面板是否真正在 viewport 中可见
  // 三种"不可见"情况都要识别：
  //   1. leaf 不存在
  //   2. leaf 存在但所在侧边栏被折叠 (rightSplit.collapsed)
  //   3. leaf 存在且侧边栏展开，但用户切到了同侧边栏的其他 tab（leaf 未激活）
  isOutlineVisible() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE);
    if (!leaves.length) return false;
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!view) continue;
      const el = view.containerEl;
      if (!el) continue;
      // 真正的可见性判断：元素被渲染且占有空间
      // 任何情况下被隐藏（display:none / 0 高度 / 0 宽度）都返回 0
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  // 停靠式悬浮窗：只受总开关控制，不再依赖实时面板或侧边栏是否可见。
  syncBubbleVisibility() {
    if (!this.bubble) return;
    const visible = !!this.settings.showFloatingBall;
    if (visible && !this.bubble.wrapEl) {
      this.bubble.mount(this.ribbonEl);
    } else if (!visible && this.bubble.wrapEl) {
      this.bubble.unmount();
    } else if (visible && this.bubble.wrapEl) {
      this.bubble.show();
      this.bubble.keepInViewport();
      this.bubble.updateDockTail();
    }
  }

  async toggleRecording() {
    if (this.recorder.state === "idle") await this.startRecording();
    else await this.stopRecording();
  }

  async getContinuationTargetInfo(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") {
      throw new Error("目标不是 Markdown 纪要");
    }
    const content = await this.app.vault.read(file);
    const segments = extractLexVoiceTranscriptSegments(content);
    if (!segments.length) {
      throw new Error("这篇纪要里没有可续录合并的原始转写分段");
    }
    const frontmatter = ((this.app.metadataCache.getFileCache(file) || {}).frontmatter) || {};
    const mode = this.detectModeFromMarkdown(file) || getEffectivePolishMode(this.settings, this.settings.polishMode);
    const normalized = normalizeSegmentsForMergedNote(segments, 0, 0, file);
    const durationMs = getLexVoiceSegmentsDurationMs(normalized) || getLexVoiceDurationMs(content);
    return {
      file,
      content,
      mode,
      segments: normalized,
      durationMs,
      startedAt: inferLexVoiceNoteStartedAtIso(file, frontmatter),
      frontmatter,
    };
  }

  async startRecording(options = {}) {
    if (this.recorder.state !== "idle") {
      new obsidian.Notice("当前已有录音进行中，请先停止后再继续录音。", 5000);
      return;
    }
    const appendTargetFile = options && options.appendToFile instanceof obsidian.TFile ? options.appendToFile : null;
    let continuationInfo = null;
    if (appendTargetFile) {
      try {
        continuationInfo = await this.getContinuationTargetInfo(appendTargetFile);
      } catch (e) {
        console.error("[LexVoice] prepare continuation target failed", e);
        new obsidian.Notice(`无法继续录到这篇纪要：${(e && e.message) || e}`, 8000);
        return;
      }
    }
    // 招聘面试模式：先弹 RecruitContextModal 让用户注入 JD/简历，再开始录音
    const mode = continuationInfo && continuationInfo.mode
      ? continuationInfo.mode
      : getEffectivePolishMode(this.settings, this._oneShotPolishMode || this.settings.polishMode);
    if (mode === "recruit") {
      this._currentRecruitContext = null;
      if (this.settings.recruitAlwaysAskOnStart && !this._skipRecruitPrompt) {
        const result = await new Promise((resolve) => {
          const modal = new RecruitContextModal(this.app, this, {
            flow: "recording",
            onConfirm: (action, ctx) => resolve({ action, ctx }),
          });
          modal.open();
        });
        if (result.action === "cancel") {
          return; // 用户关掉了 modal，不开录音
        }
        if (result.action !== "skip") {
          this._currentRecruitContext = result.ctx;
        }
      } else {
        const savedCtx = normalizeRecruitContext(this.settings.recruitContext);
        this._currentRecruitContext = hasRecruitContextContent(savedCtx) ? savedCtx : null;
      }
    }
    try {
      this.clearRecordingIssue();
      await this.ensureFolder(this.settings.audioFolder);
      await this.ensureFolder(this.settings.mdFolder);
      const moment = window.moment;
      const startedAt = moment();
      const sessionStamp = startedAt.format("YYYYMMDD-HHmmss");
      const mdName = startedAt.format(this.settings.noteFileNameFormatNew);
      const mdPath = continuationInfo
        ? obsidian.normalizePath(continuationInfo.file.path)
        : obsidian.normalizePath(`${this.settings.mdFolder}/${mdName}.md`);

      const meta = getModeMeta(this.settings, mode);
      let recordingInterviewBrief = "";
      if (!continuationInfo && mode === "recruit" && this._currentRecruitContext && (this._currentRecruitContext.jd || this._currentRecruitContext.resume)) {
        recordingInterviewBrief = String(this._currentRecruitContext.interviewBrief || "").trim();
        if (!recordingInterviewBrief) {
          try {
            new obsidian.Notice("正在据 JD / 简历创建面试提纲…", 4000);
            recordingInterviewBrief = await getRecruitInterviewOutline(this, this._currentRecruitContext);
            if (recordingInterviewBrief) {
              this._currentRecruitContext.interviewBrief = recordingInterviewBrief;
              this.settings.recruitContext = { ...normalizeRecruitContext(this._currentRecruitContext) };
              await this.saveSettings();
            }
          } catch (e) {
            console.error("[LexVoice] create interview brief before recording failed", e);
            new obsidian.Notice("面试提纲创建失败，已继续开始录音；稍后可在纪要里手动补充。", 7000);
          }
        }
      }
      const oneShotMode = this._oneShotCaptureMode;
      const requestedCaptureMode = oneShotMode || this.settings.captureMode || "mic";
      const captureMode = resolveRuntimeAudioInputMode(requestedCaptureMode);
      const forcedMobileMic = isLexVoiceMobileRuntime() && normalizeAudioInputMode(requestedCaptureMode) !== "mic";
      this.session = {
        id: genId(),
        sessionStamp,
        startedAt: continuationInfo && continuationInfo.startedAt ? continuationInfo.startedAt : startedAt.toDate().toISOString(),
        mdPath,
        mode,
        segments: [],
        continuationBaseSegments: continuationInfo ? continuationInfo.segments : [],
        continuationOffsetMs: continuationInfo ? continuationInfo.durationMs : 0,
        continuationSourcePath: continuationInfo ? continuationInfo.file.path : "",
        continuationSourceTitle: continuationInfo ? continuationInfo.file.basename : "",
        continuationRecordedAt: continuationInfo ? startedAt.toDate().toISOString() : "",
        realtimeOutline: "",
        realtimeOutlineState: { version: 1, nodes: [], memory: "" },
        realtimeOutlineMemory: "",
        realtimeOutlineSegmentCount: 0,
        realtimeOutlineWorkbenchSignature: "",
        realtimeOutlineFailureCount: 0,
        realtimeOutlineNextAllowedAt: 0,
        interviewBrief: recordingInterviewBrief,
        writeQueue: Promise.resolve(),
        activeSegmentJobs: 0,
        pendingMeetingWorkbenchInteractions: [],
        finalized: false,
        recruitContext: this._currentRecruitContext || null,
        captureMode,
          meetingWorkbench: { notes: "", draft: "", materials: [], entries: [] },
      };
      this.setSessionWorkProgress(this.session, {
        stage: "recording",
        label: "录音中",
        percent: null,
        detail: "正在采集音频，分段后会自动转写",
      });
      this._currentRecruitContext = null;

      const activeProviderId = this.settings.activeTranscribeProvider || "siliconflow";
      const activeProvider = (this.settings.transcribeProviders || {})[activeProviderId] || {};
      const activeProfile = this.getActiveTranscribeProfile();
      const isStreaming = activeProfile && activeProfile.transcribeMode === "streaming";
      const titleLine = continuationInfo
        ? `## 续录 ${startedAt.format("YYYY-MM-DD HH:mm")} · ${meta.prefix}（录音中…）`
        : `# ${startedAt.format("YYYY-MM-DD HH:mm")} · ${meta.prefix}（录音中…）`;
      const interviewBriefBlock = (!continuationInfo && recordingInterviewBrief)
        ? renderRecordingInterviewBriefBlock(this.session.id, recordingInterviewBrief).trimEnd()
        : null;
      const header = [
        continuationInfo ? "" : null,
        titleLine,
        "",
        `<!-- lexvoice-session:${this.session.id} -->`,
        interviewBriefBlock,
        `<!-- lexvoice-segments-start:${this.session.id} -->`,
        `<!-- lexvoice-segments-end:${this.session.id} -->`,
        "",
      ].filter(v => v !== null).join("\n");
      await this.appendToNote(mdPath, header);

      const segmentDurationMs = isStreaming
        ? 0
        : (this.settings.enableInterimOutput
          ? Math.max(30, Math.floor(this.settings.segmentIntervalMinutes * 60)) * 1000
          : 0);

      const sessionRef = this.session;
      sessionRef.captureMode = captureMode;
      this._oneShotCaptureMode = null;
      if (!oneShotMode && this.settings.captureMode !== captureMode) {
        this.settings.captureMode = captureMode;
        await this.saveSettings();
      }

      let onStreamReady = null;
      if (isStreaming) {
        onStreamReady = async (mediaStream) => {
          const sampleRate = activeProfile.streamProtocol && activeProfile.streamProtocol.startsWith("openai-realtime") ? 24000 : 16000;
          const client = createStreamingTranscriptionClient(activeProfile, activeProvider, {
            onPartial: (fullText, isFinal) => {
              this.clearRecordingIssue("network");
              this.clearRecordingIssue("service");
              sessionRef.streamingFullText = fullText || "";
              if (sessionRef.scheduleStreamingNoteUpdate) sessionRef.scheduleStreamingNoteUpdate();
            },
            onError: (e) => {
              console.error("[LexVoice] streaming error", e);
              this.setRecordingIssue(classifyRecordingIssue(e), {
                source: "streaming-asr",
                message: getErrorMessage(e),
              });
              new obsidian.Notice(`流式转写错误：${(e && e.message) || e}`);
            },
            onClosed: (info) => {
              if (info && info.translatedText) sessionRef.streamingTranslatedText = info.translatedText;
              if (info && info.sourceText) sessionRef.streamingSourceText = info.sourceText;
            },
          });
          sessionRef.streamingClient = client;
          sessionRef.scheduleStreamingNoteUpdate = this.makeStreamingNoteUpdater(sessionRef);
          try {
            await client.connect();
          } catch (e) {
            console.error("[LexVoice] streaming connect failed", e);
            this.setRecordingIssue(classifyRecordingIssue(e), {
              source: "streaming-asr",
              message: getErrorMessage(e),
            });
            new obsidian.Notice(`流式转写连接失败：${(e && e.message) || e}`);
            sessionRef.streamingClient = null;
            return;
          }
          const encoder = new PcmStreamEncoder(mediaStream, {
            sampleRate,
            onFrame: (ab) => client.sendAudioFrame(ab),
          });
          encoder.start();
          sessionRef.pcmEncoder = encoder;
        };
      }

      await this.recorder.start({
        segmentDurationMs,
        quickCutMarksMs: segmentDurationMs > 0 ? QUICK_INTERIM_CUTS_MS : [],
        captureMode,
        onSegment: (seg) => this.handleSegment(sessionRef, seg),
        onStreamReady,
      });
      if (this.settings.autoOpenOutlineOnRecord) {
        try { await this.openOutlineView(); } catch (e) { console.error("[LexVoice] auto-open outline failed", e); }
      }
      const modeLabel = audioInputModeLabel(captureMode);
      const noticeText = isStreaming
        ? `录音中（${modeLabel}），${activeProfile.title || "流式服务"} 实时转写中`
        : (this.settings.enableInterimOutput
          ? `录音中（${modeLabel}），启动期快速出片，之后每 ${this.settings.segmentIntervalMinutes} 分钟即时转写`
          : `录音中（${modeLabel}），停止时统一处理`);
      new obsidian.Notice(noticeText);
      if (continuationInfo) {
        new obsidian.Notice(`已开始续录到「${continuationInfo.file.basename}」；停止后会与原纪要重新合并。`, 8000);
      }
      if (forcedMobileMic) {
        new obsidian.Notice("移动端暂只支持麦克风录音；电脑音频/虚拟声卡请在桌面端使用。", 8000);
      }
      if (isLexVoiceMobileRuntime()) {
        new obsidian.Notice("手机端录音时请保持 Obsidian 在前台，锁屏或切后台可能中断录音。", 8000);
      }
    } catch (e) {
      console.error(e);
      await this.logDiagnostic("error", "recording.start_failed", "无法开始录音", {
        captureMode: this.settings.captureMode,
        requestedMode: this._oneShotCaptureMode || "",
        error: diagnosticError(e),
      });
      new obsidian.Notice(`无法开始录音：${(e && e.message) || e}`);
      // 清理半初始化状态：acquireStream 抛错(OverconstrainedError 等)后 this.session 已赋值、"（录音中…）"
      // 占位笔记已写，若不清理会残留僵尸会话、笔记永远卡在"录音中…"。
      try { if (this.recorder && this.recorder.state !== "idle") await this.recorder.stop(); } catch { /* intentionally empty */ }
      try { if (this.recorder && typeof this.recorder.releaseStream === "function") this.recorder.releaseStream(); } catch { /* intentionally empty */ }
      const failedSession = this.session;
      this.session = null;
      this._oneShotCaptureMode = null;
      try { if (failedSession) await this.removeEmptySessionBlock(failedSession); } catch { /* intentionally empty */ }
      try { this.refreshOutlineView(); } catch { /* intentionally empty */ }
    }
  }

  async stopRecording() {
    if (this.recorder.state === "idle") return;
    new obsidian.Notice("⏹ 已请求停止，处理最后一段…");
    await this.recorder.stop();
    this.clearRecordingIssue();
  }

  shouldFilterShortRecording(session, seg) {
    if (!session || !seg || !seg.isFinal) return false;
    if (this.settings.filterShortRecordings === false) return false;
    if (session.segments && session.segments.length) return false;
    const totalMs = Math.max(0, Number(seg.endOffsetMs) || 0);
    return totalMs < SHORT_RECORDING_FILTER_MS;
  }

  async closeStreamingForDiscard(session) {
    if (!session) return;
    if (session.pcmEncoder) {
      try { session.pcmEncoder.stop(); } catch { /* intentionally empty */ }
      session.pcmEncoder = null;
    }
    if (session.streamingClient) {
      try {
        if (typeof session.streamingClient._safeClose === "function") session.streamingClient._safeClose();
        else if (typeof session.streamingClient.finish === "function") await session.streamingClient.finish();
      } catch (e) {
        console.warn("[LexVoice] close streaming client for discard failed", e);
      }
      session.streamingClient = null;
    }
    try { await this.removeLiveTranscriptBlock(session.mdPath, session.id); } catch { /* intentionally empty */ }
  }

  async discardFilteredShortSession(session) {
    await this.closeStreamingForDiscard(session);
    const file = this.app.vault.getAbstractFileByPath(session.mdPath);
    if (!(file instanceof obsidian.TFile)) return;
    const cur = await this.app.vault.read(file);
    const sessMarker = `<!-- lexvoice-session:${session.id} -->`;
    const endMarker = `<!-- lexvoice-segments-end:${session.id} -->`;
    const sessIdx = cur.indexOf(sessMarker);
    const endIdx = cur.indexOf(endMarker);
    if (sessIdx < 0 || endIdx < sessIdx) return;
    const headerLineIdx = cur.lastIndexOf("\n## ", sessIdx);
    const h1LineIdx = cur.lastIndexOf("\n# ", sessIdx);
    const startIdx = Math.max(headerLineIdx, h1LineIdx);
    const blockStart = startIdx >= 0 ? startIdx + 1 : 0;
    const blockEnd = endIdx + endMarker.length;
    const before = cur.slice(0, blockStart).replace(/\n+$/, "\n");
    const after = cur.slice(blockEnd).replace(/^\n+/, "");
    const next = before + (after ? "\n" + after : "");
    if (!next.trim()) await this.app.fileManager.trashFile(file);
    else if (next !== cur) await this.app.vault.modify(file, next);
  }

  setSessionWorkProgress(session, patch) {
    if (!session) return;
    session.workProgress = Object.assign({}, session.workProgress || {}, patch || {}, {
      updatedAt: new Date().toISOString(),
    });
    try { this.refreshOutlineView(); } catch { /* intentionally empty */ }
  }

  clearSessionWorkProgress(session) {
    if (!session) return;
    delete session.workProgress;
    try { this.refreshOutlineView(); } catch { /* intentionally empty */ }
  }

  handleSegment(session, seg) {
    if (!session) return;
    session.writeQueue = session.writeQueue.then(async () => {
      session.activeSegmentJobs = (Number(session.activeSegmentJobs) || 0) + 1;
      try {
        await this.processSegment(session, seg);
      } catch (e) {
        // 关键：吞掉本段异常，绝不让 writeQueue 链变成 rejected——否则下面的 .then(finalize) 会被跳过、
        // 后续每段挂到 rejected 链上也全部静默丢失、笔记永远卡在"录音中…"。本段失败已在 processSegment 内入队重试。
        console.error("[LexVoice] processSegment failed (swallowed to protect write chain)", e);
        try { await this.logDiagnostic("error", "segment.process_failed", "分段处理异常（已吞，避免毒化写入链）", { mode: session.mode, isFinal: !!seg.isFinal, error: diagnosticError(e) }); } catch { /* intentionally empty */ }
      } finally {
        session.activeSegmentJobs = Math.max(0, (Number(session.activeSegmentJobs) || 1) - 1);
        if (!seg.isFinal && session.pendingMeetingWorkbenchInteractions && session.pendingMeetingWorkbenchInteractions.length) {
          this.scheduleMeetingWorkbenchInteraction(session, session.pendingMeetingWorkbenchInteractions[0]);
        }
      }
    });
    if (seg.isFinal) {
      // 双分支：无论前序链 fulfilled 还是 rejected，finalizeSession 都必须跑——杜绝"最终段异常→纪要永不收尾"。
      session.writeQueue = session.writeQueue.then(
        () => this.finalizeSession(session),
        (e) => { console.error("[LexVoice] write chain rejected before finalize", e); return this.finalizeSession(session); }
      );
    }
    return session.writeQueue;
  }

  getSegmentCacheFolder() {
    return obsidian.normalizePath(this.settings.segmentCacheFolder || DEFAULT_SETTINGS.segmentCacheFolder);
  }

  isSegmentCachePath(path) {
    const norm = obsidian.normalizePath(path || "");
    const folder = this.getSegmentCacheFolder();
    return !!norm && (norm === folder || norm.startsWith(folder + "/"));
  }

  async saveMasterAudio(session, seg) {
    if (!session || session.masterAudioPath || !seg || !seg.masterBlob) return;
    try {
      const ext = seg.masterExt || extFromMime(seg.masterMime || seg.masterBlob.type || "") || seg.ext || "webm";
      await this.ensureFolder(this.settings.audioFolder);
      const target = this.getAvailableVaultPath(obsidian.normalizePath(`${this.settings.audioFolder}/lex-${session.sessionStamp}.${ext}`));
      if (!target) throw new Error("无法生成完整录音文件路径");
      const ab = await seg.masterBlob.arrayBuffer();
      await this.app.vault.createBinary(target, ab);
      session.masterAudioPath = target;
      session.masterAudioName = target.split("/").pop() || target;
      const oldNames = new Set();
      for (const item of session.segments || []) {
        if (item.audioName) oldNames.add(item.audioName);
        if (item.segmentAudioName) oldNames.add(item.segmentAudioName);
        item.audioName = session.masterAudioName;
        item.audioPath = session.masterAudioPath;
      }
      if (session.realtimeOutline && oldNames.size) {
        let outline = String(session.realtimeOutline);
        for (const oldName of oldNames) {
          if (oldName && oldName !== session.masterAudioName) {
            outline = outline.replace(new RegExp("\\[\\[" + escapeRegExp(oldName) + "\\|", "g"), "[[" + session.masterAudioName + "|");
          }
        }
        session.realtimeOutline = outline;
      }
      if (session.realtimeOutlineState && oldNames.size) {
        const state = normalizeRealtimeOutlineState(session.realtimeOutlineState, session.realtimeOutline, session.realtimeOutlineMemory);
        for (const node of state.nodes || []) {
          let anchor = String(node.anchor || "");
          for (const oldName of oldNames) {
            if (oldName && oldName !== session.masterAudioName) {
              anchor = anchor.replace(new RegExp("\\[\\[" + escapeRegExp(oldName) + "\\|", "g"), "[[" + session.masterAudioName + "|");
            }
          }
          node.anchor = anchor;
          node.time = getRealtimeOutlineAnchorTime(anchor);
        }
        session.realtimeOutlineState = state;
      }
      if (session.realtimeOutlineMemory && oldNames.size) {
        let memory = String(session.realtimeOutlineMemory);
        for (const oldName of oldNames) {
          if (oldName && oldName !== session.masterAudioName) {
            memory = memory.replace(new RegExp("\\[\\[" + escapeRegExp(oldName) + "\\|", "g"), "[[" + session.masterAudioName + "|");
          }
        }
        session.realtimeOutlineMemory = memory;
      }
    } catch (e) {
      console.error("[LexVoice] master audio write failed", e);
      new obsidian.Notice(`完整录音写入失败：${(e && e.message) || e}`, 8000);
    }
  }

  isQueuedTranscribeAudioReferenced(path, excludeTaskId) {
    const norm = obsidian.normalizePath(String(path || ""));
    if (!norm || !this.queue || typeof this.queue.snapshot !== "function") return false;
    return this.queue.snapshot().some(t => t && t.type === "transcribe"
      && t.id !== excludeTaskId
      && obsidian.normalizePath(String(t.audioPath || "")) === norm);
  }

  async maybeDeleteSegmentCacheFile(path, excludeTaskId) {
    if (this.settings.keepSegmentAudioFiles === true) return;
    if (!this.isSegmentCachePath(path)) return;
    if (this.isQueuedTranscribeAudioReferenced(path, excludeTaskId)) return;
    const file = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(path));
    if (file instanceof obsidian.TFile) {
      try { await this.app.fileManager.trashFile(file); }
      catch (e) { console.error("[LexVoice] segment cache cleanup failed", path, e); }
    }
  }

  async cleanupSuccessfulSegmentAudio(session) {
    if (!session || this.settings.keepSegmentAudioFiles === true) return;
    if (this.settings.consolidatedLayout === false) return;
    if (!getSessionMasterAudioName(session)) return;
    for (const s of session.segments || []) {
      if (!s || s.error) continue;
      await this.maybeDeleteSegmentCacheFile(s.segmentAudioPath || s.audioPath);
    }
  }

  async processSegment(session, seg) {
    if (!session) return;
    if (this.shouldFilterShortRecording(session, seg)) {
      session.filteredShortRecording = true;
      session.filteredDurationMs = Math.max(0, Number(seg.endOffsetMs) || 0);
      await this.closeStreamingForDiscard(session);
      return;
    }
    const continuationOffsetMs = Math.max(0, Number(session.continuationOffsetMs) || 0);
    const baseSegmentCount = Array.isArray(session.continuationBaseSegments) ? session.continuationBaseSegments.length : 0;
    const segmentIndex = baseSegmentCount + (Array.isArray(session.segments) ? session.segments.length : 0);
    const segNumber = segmentIndex + 1;
    const displayStartOffsetMs = Math.max(0, Number(seg.startOffsetMs) || 0) + continuationOffsetMs;
    const displayEndOffsetMs = Math.max(displayStartOffsetMs, (Number(seg.endOffsetMs) || 0) + continuationOffsetMs);
    const segmentAudioName = `lex-${session.sessionStamp}-seg${pad(segNumber)}.${seg.ext}`;
    const segmentAudioPath = obsidian.normalizePath(`${this.getSegmentCacheFolder()}/${segmentAudioName}`);

    try {
      await this.ensureFolder(this.getSegmentCacheFolder());
      const ab = await seg.blob.arrayBuffer();
      await this.app.vault.createBinary(segmentAudioPath, ab);
    } catch (e) {
      console.error(e);
      new obsidian.Notice(`段${segNumber} 音频写入失败：${(e && e.message) || e}`);
    }
    if (seg.isFinal) await this.saveMasterAudio(session, seg);

    let text = ""; let err = null;
    const activeProfile = this.getActiveTranscribeProfile();
    const isStreamingProvider = activeProfile && activeProfile.transcribeMode === "streaming";
    this.setSessionWorkProgress(session, {
      stage: "transcribing",
      label: `转写第 ${segNumber} 段`,
      percent: null,
      detail: "音频正在发送到转写服务",
    });
    if (session.streamingClient) {
      // 流式转写：跳过 HTTP 切片转写，等流式客户端 finish 后取累计文本
      try {
        if (session.pcmEncoder) { try { session.pcmEncoder.stop(); } catch { /* intentionally empty */ } session.pcmEncoder = null; }
        await session.streamingClient.finish();
        text = session.streamingClient.getFullText() || session.streamingFullText || "";
      } catch (e) {
        err = e;
        console.error("[LexVoice] streaming finish failed", e);
        text = session.streamingFullText || "";
      }
      try { await this.removeLiveTranscriptBlock(session.mdPath, session.id); } catch { /* intentionally empty */ }
      session.streamingClient = null;
    } else if (isStreamingProvider) {
      // 流式服务但客户端连接失败：保留音频但不做 HTTP 切片转写（端点是 wss://，HTTP 必失败）
      err = new Error("流式转写连接未建立，请检查 API Key 与网络后重新录音。");
      console.error("[LexVoice]", err.message);
    } else {
      try {
        text = await transcribeAudio(this, seg.blob, seg.blob.type);
      } catch (e) { err = e; console.error(e); }
    }
    if (err) {
      const issueKind = classifyRecordingIssue(err);
      this.setRecordingIssue(issueKind, {
        source: "asr",
        message: getErrorMessage(err),
        startedAtMs: displayStartOffsetMs,
      });
      await this.logDiagnostic("error", "asr.segment_failed", "录音分段转写失败", {
        provider: this.settings.activeTranscribeProvider,
        model: this.getActiveTranscribeProfile() && this.getActiveTranscribeProfile().model,
        mime: seg.blob && seg.blob.type,
        size: seg.blob && seg.blob.size,
        segmentIndex,
        startOffsetMs: displayStartOffsetMs,
        endOffsetMs: displayEndOffsetMs,
        mode: session.mode,
        error: diagnosticError(err),
      });
      new obsidian.Notice(isStreamingProvider
        ? `段 ${segNumber} 流式转写失败，无法离线重试；录音仍在本地继续，可整篇结束后用「重新整理」或重录该段。`
        : `段 ${segNumber} 转写失败，录音仍在本地继续，已加入重试队列。`, 7000);
    } else if (!text || !String(text).trim()) {
      // 转写成功返回，但内容为空 → 可能音频设备没选对 / 没有声音。
      // 请求既然成功返回，网络/服务是通的，清掉遗留横幅。
      this.clearRecordingIssue("network");
      this.clearRecordingIssue("service");
      // 防误报：只在"本场此前从未产生过任何非空转写"时提示。
      // 否则会议中途的合理静默段（开头/中场没人说话）会骚扰正在正常录音的用户。
      const hadAnyText = Array.isArray(session.segments) && session.segments.some((s) => s && s.text && String(s.text).trim());
      await this.logDiagnostic("warn", "asr.empty_result", "本段无转写内容", {
        segmentIndex, mode: session.mode, hadAnyText,
      });
      if (!hadAnyText && !session._emptyAsrNotified) {
        session._emptyAsrNotified = true;
        new obsidian.Notice("本段无转写内容，可能音频设备没选对或没有声音，请到「设置 → 进阶 → 音频设备检测」检查音频设备。", 9000);
      }
    } else {
      this.clearRecordingIssue("network");
      this.clearRecordingIssue("service");
    }

    const playbackAudioName = session.masterAudioName || segmentAudioName;
    const playbackAudioPath = session.masterAudioPath || segmentAudioPath;
    session.segments.push({
      index: segmentIndex,
      startOffsetMs: displayStartOffsetMs,
      endOffsetMs: displayEndOffsetMs,
      audioStartOffsetMs: Math.max(0, Number(seg.startOffsetMs) || 0),
      audioEndOffsetMs: Math.max(0, Number(seg.endOffsetMs) || 0),
      audioName: playbackAudioName,
      audioPath: playbackAudioPath,
      segmentAudioName,
      segmentAudioPath,
      text,
      error: err ? (err.message || String(err)) : null,
      isFinal: !!seg.isFinal,
      // 音源标记（HR 模式 / 角色识别基础）：
      //   mic           = 麦克风端
      //   virtualCable  = 电脑音频端（线上面试场景下通常是对面候选人）
      //   mix-virtual   = 当前是混合录音，分不清；后续提交里会改成双 stream 分别打标
      // seg.source 优先（来自 RecordSession 未来的双流路径），fallback 到 session.captureMode
      source: (seg && seg.source) || session.captureMode || "mic",
    });

    if (err && !isStreamingProvider) {
      // 流式 provider(endpoint 是 wss://)的失败段不入 transcribe 重试队列——重试走 HTTP 必然再失败、
      // 把任务卡在 failed 永远清不掉。流式无法离线重切重传，留在笔记里标失败即可。
      await this.queue.add({
        type: "transcribe",
        sessionId: session.id,
        mdPath: session.mdPath,
        audioPath: segmentAudioPath, segmentIndex,
        sourceAudioPath: session.masterAudioPath || "",
        sourceAudioName: session.masterAudioName || "",
        masterAudioPath: session.masterAudioPath || "",
        masterAudioName: session.masterAudioName || "",
        startOffsetMs: displayStartOffsetMs, endOffsetMs: displayEndOffsetMs,
        audioName: segmentAudioName, mode: session.mode, isFinal: !!seg.isFinal,
        lastError: err.message || String(err),
      });
    }

    const segTitle = `### 段落 ${segNumber} (${formatElapsed(displayStartOffsetMs)}–${formatElapsed(displayEndOffsetMs)}) ${getAudioTimeLink(playbackAudioName, Math.max(0, Number(seg.startOffsetMs) || 0))}${seg.isFinal ? " · 结束" : ""}`;
    const block = [
      "",
      segTitle,
      "",
      err ? (isStreamingProvider ? `_[流式转写失败，需整篇结束后重整或重录：${err.message || err}]_` : `_[转写失败（已进入重试队列）：${err.message || err}]_`) : (text ? text : "_[此段无内容]_"),
      "",
    ].join("\n");
    await this.insertBeforeSegmentsEnd(session.mdPath, block, session.id);

    this.refreshOutlineView();
    this.setSessionWorkProgress(session, {
      stage: seg.isFinal ? "transcribe-finalized" : "transcribed",
      label: seg.isFinal ? "转写收尾" : `已转写 ${session.segments.length} 段`,
      percent: null,
      detail: seg.isFinal ? "正在进入 AI 整理" : "分段转写已写入纪要",
    });

    if (!seg.isFinal && text && String(text).trim()) new obsidian.Notice(`段 ${segNumber} 已转写`);

    if ((this.settings.enableRealtimeOutline || (this.session && this.session.mode === "recruit-needs")) && text && !err) {
      this.scheduleRealtimeOutline();
    }
  }

  getSegmentsForFinalSession(session) {
    const base = Array.isArray(session && session.continuationBaseSegments) ? session.continuationBaseSegments : [];
    const fresh = Array.isArray(session && session.segments) ? session.segments : [];
    if (!base.length) return fresh;
    return normalizeSegmentsForMergedNote([...base, ...fresh], 0, 0, null);
  }

  async finalizeSession(session) {
    if (!session || session.finalized) return;
    session.finalized = true;

    // 静音统计快照：此刻录音刚结束、recorder 计数尚未被下一场 start() 重置，同步读取避免异步窗口被污染。
    const _silVoiced = this.recorder ? (this.recorder._voicedTicks || 0) : 0;
    const _silSilent = this.recorder ? (this.recorder._silentTicks || 0) : 0;

    if (session.filteredShortRecording) {
      await this.discardFilteredShortSession(session);
      new obsidian.Notice("已过滤小于三秒录音");
      if (this.session === session) this.session = null;
      this.refreshOutlineView();
      return;
    }

    if (!session.segments || session.segments.length === 0) {
      await this.removeEmptySessionBlock(session);
      new obsidian.Notice("⏭ 本次录音时长过短或无有效音频，已跳过");
      if (this.session === session) this.session = null;
      this.refreshOutlineView();
      return;
    }

    // 兜底：整场电平几乎为零（≥5s≈30 帧有效采样中，有声占比 < 2%）→ 明确提示用户去查设备。
    // 插件不替用户猜设备，只在"采到的几乎全是静音"这种失败点明确提示。逐场只弹一次。
    const _silTotal = _silVoiced + _silSilent;
    // 仅对真实录音会话判静音：导入/文本导入不经 recorder，会读到上一场录音遗留的计数残值 → 误报。
    if (!session.source && _silTotal >= 30 && (_silVoiced / _silTotal) < 0.02 && !session._silenceNotified) {
      session._silenceNotified = true;
      new obsidian.Notice("整场几乎没检测到声音，请检查所选麦克风 / 电脑音频设备（设置 → 进阶 → 音频设备检测）。", 9000);
    }

    const textImportSession = isTextImportSession(session);
    const segmentsForFinal = this.getSegmentsForFinalSession(session);
    const writeSession = segmentsForFinal === session.segments
      ? session
      : Object.assign({}, session, { segments: segmentsForFinal, multiSourceAudio: true });
    session.finalizing = true;
    this.setSessionWorkProgress(session, {
      stage: "finalize-start",
      label: textImportSession ? "读取文本完成" : "准备 AI 整理",
      percent: 12,
      detail: textImportSession ? "已跳过 ASR，正在准备结构化整理" : "转写已结束，正在整理上下文",
    });
    this.refreshOutlineView();
    new obsidian.Notice(textImportSession ? "文本已读取，AI 结构化整理中…" : "所有段已处理，AI 合并润色中…");

    let polished = ""; let mergeError = null; let nonRetryableMergeError = false;
    try {
      this.setSessionWorkProgress(session, {
        stage: "workbench",
        label: "整理上下文",
        percent: 22,
        detail: "正在合并会中记录、附件和上下文",
      });
      await this.processPendingMeetingWorkbenchInteractions(session, { force: true });
      if (!textImportSession) {
        this.setSessionWorkProgress(session, {
          stage: "outline",
          label: "生成大纲",
          percent: 36,
          detail: "正在补齐实时大纲，供最终纪要参考",
        });
        await this.ensureRealtimeOutlineForFinalNote(session);
      }
      const lastSeg = segmentsForFinal[segmentsForFinal.length - 1];
      const textImport = textImportSession;
      const sessionMeta = {
        startedAt: session.startedAt,
        duration: textImport ? "" : (lastSeg ? formatElapsed(lastSeg.endOffsetMs || 0) : ""),
        source: session.source || "",
        meetingWorkbench: normalizeMeetingWorkbench(session.meetingWorkbench),
      };
      this.setSessionWorkProgress(session, {
        stage: "llm-merge",
        label: "AI 整理中",
        percent: 62,
        detail: textImport ? "正在把导入文本交给大模型结构化整理" : "正在把分段转写合并成最终纪要",
      });
      this.beginTaskMeter();
      polished = await mergeAndPolish(this, segmentsForFinal.map(s => ({
        index: s.index, startOffsetMs: s.startOffsetMs, endOffsetMs: s.endOffsetMs, text: s.text,
        audioName: s.audioName,
        audioStartOffsetMs: s.audioStartOffsetMs,
        audioEndOffsetMs: s.audioEndOffsetMs,
        sourceName: s.sourceName,
        sourcePath: s.sourcePath,
        rawText: s.rawText,
      })), session.mode, session.recruitContext, sessionMeta);
      this.setSessionWorkProgress(session, {
        stage: "write-note",
        label: "写入纪要",
        percent: 88,
        detail: "AI 输出已返回，正在写入 Obsidian 笔记",
      });
    } catch (e) { mergeError = e; console.error(e); }
    session.finalizing = false;

    if (mergeError) {
      nonRetryableMergeError = isLlmNonRetryableError(mergeError);
      await this.logDiagnostic("error", "llm.merge_failed", "LLM 合并整理失败", {
        mode: session.mode,
        segmentCount: segmentsForFinal.length,
        duration: isTextImportSession(session) ? "" : (segmentsForFinal.length ? formatElapsed(segmentsForFinal[segmentsForFinal.length - 1].endOffsetMs || 0) : ""),
        llmEndpoint: this.settings.llmEndpoint,
        llmModel: this.settings.llmModel,
        nonRetryable: nonRetryableMergeError,
        error: diagnosticError(mergeError),
      });
      if (!nonRetryableMergeError) {
        const lastSeg = segmentsForFinal[segmentsForFinal.length - 1];
        await this.queue.add({
          type: "merge",
          sessionId: session.id,
          mdPath: session.mdPath,
          mode: session.mode,
          segments: segmentsForFinal.map(s => ({
            index: s.index, startOffsetMs: s.startOffsetMs, endOffsetMs: s.endOffsetMs, text: s.text,
            audioName: s.audioName,
            audioStartOffsetMs: s.audioStartOffsetMs,
            audioEndOffsetMs: s.audioEndOffsetMs,
            sourceName: s.sourceName,
            sourcePath: s.sourcePath,
            rawText: s.rawText,
          })),
          source: session.source || "",
          textImportSources: session.textImportSources || [],
          recruitContext: session.recruitContext || null,
          sessionMeta: {
            startedAt: session.startedAt,
            duration: isTextImportSession(session) ? "" : (lastSeg ? formatElapsed(lastSeg.endOffsetMs || 0) : ""),
            source: session.source || "",
            meetingWorkbench: normalizeMeetingWorkbench(session.meetingWorkbench),
          },
          lastError: mergeError.message || String(mergeError),
        });
      }
    }

    if ((this.settings.consolidatedLayout || textImportSession) && !mergeError) {
      await this.rewriteConsolidated(writeSession, polished);
    } else {
      await this.appendPolishBlock(writeSession, polished, mergeError, nonRetryableMergeError);
    }

    if (!mergeError) {
      this.setSessionWorkProgress(session, {
        stage: "done",
        label: "处理完成",
        percent: 100,
        detail: "纪要已写入，正在收尾",
      });
    }

    if (!mergeError && polished) {
      const beforeRenamePath = session.mdPath;
      const recruitRelocate = session.mode === "recruit" && session.recruitContext && session.recruitContext.jdFile;
      // F4.2：招聘评估且选了 JD 项目 → 移到项目文件夹 + 候选人-轮次-MMDD 命名（替代自动标题改名，保命名干净）
      const renamed = recruitRelocate
        ? await this.relocateRecruitNote(session, session.recruitContext)
        : await this.renameMarkdownWithGeneratedTitle(session.mdPath, polished, session.mode);
      if (renamed instanceof obsidian.TFile) {
        session.mdPath = renamed.path;
        writeSession.mdPath = renamed.path;
      }
      const renamedByPolished = renamed instanceof obsidian.TFile
        && obsidian.normalizePath(renamed.path) !== obsidian.normalizePath(beforeRenamePath);
      if ((session.source === "import" || session.source === "text-import") && !renamedByPolished && !recruitRelocate) {
        const rawTitleSource = buildTitleSourceFromSegments(segmentsForFinal);
        if (rawTitleSource) {
          const fallbackRenamed = await this.renameMarkdownWithGeneratedTitle(session.mdPath, rawTitleSource, session.mode);
          if (fallbackRenamed instanceof obsidian.TFile) {
            session.mdPath = fallbackRenamed.path;
            writeSession.mdPath = fallbackRenamed.path;
          }
        }
      }
    }

    if (!mergeError && polished) {
      try { await this.appendDailyMeetingOverview(writeSession, polished); }
      catch (e) { console.error("[LexVoice] daily overview failed", e); }
    }

    if (!mergeError) {
      await this.cleanupSuccessfulSegmentAudio(session);
      try {
        const doneLabel = isTextImportSession(session) ? "文本整理完成"
          : session.source === "import" ? "导入音频整理完成" : "录音纪要整理完成";
        this.logCompletedWork(doneLabel, session.mdPath || "", this.endTaskMeter());
      } catch { /* intentionally empty */ }
      // 沉淀开关默认关闭：开启后转写完成自动跑沉淀扫描并入库；关闭则照旧手动点「沉淀」。后台执行、失败静默。
      if (this.settings.sedimentAutoExtract) void this.autoExtractSedimentAfterFinalize(session.mdPath);
    }

    new obsidian.Notice(mergeError
      ? (nonRetryableMergeError
        ? `AI 整理失败：${formatLlmFailureIssue(mergeError.message || mergeError)}`
        : "合并润色失败，已加入重试队列")
      : "LexVoice 处理完成");

    if (this.settings.autoOpenNoteAfterFinish) {
      const file = this.app.vault.getAbstractFileByPath(session.mdPath);
      if (file instanceof obsidian.TFile) {
        try { await this.app.workspace.getLeaf(false).openFile(file); } catch { /* intentionally empty */ }
      }
    }
    if (this.session === session) this.session = null;
    this.refreshOutlineView();
  }

  async appendDailyMeetingOverview(session, polished) {
    if (!this.settings.writeDailyMeetingOverview) return;
    if (!session || !polished) return;
    let dailyFile = null;
    try {
      dailyFile = await ensureTodayDailyNoteFile(this.app);
    } catch (e) {
      console.error("[LexVoice] daily note ensure failed", e);
    }
    if (!(dailyFile instanceof obsidian.TFile)) return;
    if (obsidian.normalizePath(dailyFile.path) === obsidian.normalizePath(session.mdPath)) return;
    const entry = buildDailyMeetingOverviewEntry(session, polished, this.settings);
    const cur = await this.app.vault.read(dailyFile);
    const next = upsertDailyMeetingOverview(cur, session.id, entry, this.settings);
    if (next !== cur) await this.app.vault.modify(dailyFile, next);
  }

  async appendDailyMeetingOverviewForMarkdown(file, markdown, polished, mode, segments, sessionMeta) {
    if (!(file instanceof obsidian.TFile)) return;
    const startedAt = sessionMeta && sessionMeta.startedAt
      ? sessionMeta.startedAt
      : new Date(file.stat && file.stat.ctime ? file.stat.ctime : Date.now()).toISOString();
    const session = {
      id: extractLexVoiceSessionId(markdown, obsidian.normalizePath(file.path).replace(/[^A-Za-z0-9_-]+/g, "-")),
      mdPath: file.path,
      mode,
      startedAt,
      segments: Array.isArray(segments) ? segments : [],
    };
    await this.appendDailyMeetingOverview(session, polished);
  }

  getAvailableMarkdownPath(targetPath, currentPath) {
    const current = obsidian.normalizePath(currentPath || "");
    let candidate = obsidian.normalizePath(targetPath || "");
    if (!candidate || candidate === current) return candidate;
    const dot = candidate.toLowerCase().endsWith(".md") ? candidate.length - 3 : candidate.length;
    const base = candidate.slice(0, dot);
    const ext = candidate.slice(dot) || ".md";
    let i = 2;
    while (true) {
      const existing = this.app.vault.getAbstractFileByPath(candidate);
      if (!existing || obsidian.normalizePath(existing.path) === current) return candidate;
      candidate = obsidian.normalizePath(`${base}-${i}${ext}`);
      i++;
      if (i > 99) return "";
    }
  }

  // F4.2：把招聘评估纪要移到对应 JD 项目文件夹，命名 候选人-轮次-MMDD(-N)。用 fileManager.renameFile（同步更新反链）。
  async relocateRecruitNote(session, rc) {
    try {
      if (!rc || !rc.jdFile) return null;
      const jdFile = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(rc.jdFile));
      if (!(jdFile instanceof obsidian.TFile) || !jdFile.parent) return null;
      const folder = jdFile.parent.path;
      const cand = (sanitizeProjectFolderName(rc.candidateName || "候选人") || "候选人").slice(0, 40);
      let mmdd = "";
      try { mmdd = window.moment ? window.moment().format("MMDD") : ""; } catch { /* intentionally empty */ }
      const cur = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(session.mdPath));
      if (!(cur instanceof obsidian.TFile)) return null;
      // 轮次取笔记 frontmatter 实际值（与落盘一致），回退 rc.round，再回退 初面——保证文件名与 frontmatter 轮次 同源
      const noteFm = (this.app.metadataCache.getFileCache(cur) || {}).frontmatter || {};
      const round = String(noteFm.轮次 || rc.round || "初面").replace(/[\\/:*?"<>|]/g, "").trim() || "初面";
      const target = this.getAvailableMarkdownPath(obsidian.normalizePath(`${folder}/${cand}-${round}-${mmdd}.md`), cur.path);
      if (!target || obsidian.normalizePath(target) === obsidian.normalizePath(cur.path)) return cur;
      await this.app.fileManager.renameFile(cur, target);
      return this.app.vault.getAbstractFileByPath(obsidian.normalizePath(target)) || cur;
    } catch (e) {
      console.error("[LexVoice] relocateRecruitNote failed", e);
      return null;
    }
  }

  // F4.3：防抖触发某招聘项目文件夹的统计重算（3s 合并，每文件夹一个 Debouncer）。
  scheduleRecruitRecalc(folderPath) {
    if (!folderPath) return;
    if (!this._recruitRecalcDebouncers) this._recruitRecalcDebouncers = new Map();
    let d = this._recruitRecalcDebouncers.get(folderPath);
    if (!d) {
      d = obsidian.debounce(() => {
        this.recalcRecruitProject(folderPath).catch(e => console.error("[LexVoice] recruit recalc failed", e));
      }, 3000, false);
      this._recruitRecalcDebouncers.set(folderPath, d);
    }
    d();
  }

  // F4.3：扫某项目文件夹内候选人纪要，算 已面试数/候选人数/推荐数/倾向不推荐数/最新动态，原子写回 JD frontmatter。
  // 防自激：本方法只写 JD 文件，而触发它的 vault 钩子已过滤掉 JD 文件本身（basename==文件夹名），故 JD 的 modify 永不触发重算。
  async recalcRecruitProject(folderPath, retry) {
    const folder = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(folderPath || ""));
    if (!(folder instanceof obsidian.TFolder)) return false;
    const jdFile = (folder.children || []).find(f => f instanceof obsidian.TFile && f.extension === "md" && f.basename === folder.name);
    if (!(jdFile instanceof obsidian.TFile)) return false; // 不是招聘项目文件夹（无同名 JD）
    const sessions = new Set();   // 候选人|轮次 去重 = 面试场次
    const candidates = new Set();
    let rec = 0, notRec = 0;
    let latest = null, latestTime = -1;
    let staleCache = false;
    const parseTime = (fm, f) => {
      try {
        if (fm.time && window.moment) { const mm = window.moment(fm.time); if (mm && mm.isValid && mm.isValid()) return mm.valueOf(); }
        if (fm.time) { const d = Date.parse(fm.time); if (!Number.isNaN(d)) return d; }
      } catch { /* intentionally empty */ }
      return f && f.stat ? f.stat.mtime : 0;
    };
    for (const f of (folder.children || [])) {
      if (!(f instanceof obsidian.TFile) || f.extension !== "md" || f.path === jdFile.path) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // 缓存未就绪兜底：刚落盘/批量导入的候选人纪要（文件名形如 候选人-轮次-MMDD）此刻 fm 可能为空 → 标记稍后重算
      if (!Object.keys(fm).length && /-[^/]+-\d{3,4}(-\d+)?$/.test(f.basename)) { staleCache = true; continue; }
      if (fm.jd == null && fm.mode !== "recruit") continue;        // 非候选人纪要（无 jd 链接、非招聘）
      if (fm.类型 === "招聘项目") continue;                          // 防御：别把别的项目文件误计
      const cand = String(fm.候选人 || "").trim();
      const round = String(fm.轮次 || "").trim();
      if (cand) candidates.add(cand);
      sessions.add(`${cand}|${round}`);
      const rl = String(fm.录用建议 || "").trim();
      if (rl === "强烈推荐" || rl === "推荐") rec++;
      if (rl.startsWith("倾向不推荐") || rl === "不推荐") notRec++;
      const t = parseTime(fm, f);
      if (t > latestTime) { latestTime = t; latest = { cand, evalText: String(fm.一句话评价 || "").trim() }; }
    }
    // 缓存未就绪 → 稍后再重算一次（metadataCache 大概率已重建），避免统计长期偏小且无自纠正
    if (staleCache && !retry) { window.setTimeout(() => { this.recalcRecruitProject(folderPath, true).catch(() => { /* intentionally empty */ }); }, 2000); }
    const latestText = latest ? (latest.evalText ? `${latest.cand}：${latest.evalText}` : latest.cand) : "";
    try {
      await this.app.fileManager.processFrontMatter(jdFile, (fm) => {
        fm.已面试数 = sessions.size;
        fm.候选人数 = candidates.size;
        fm.推荐数 = rec;
        fm.倾向不推荐数 = notRec;
        fm.最新动态 = latestText;
      });
      return true;
    } catch (e) {
      console.error("[LexVoice] processFrontMatter recalc failed", e);
      if (!retry) { window.setTimeout(() => { this.recalcRecruitProject(folderPath, true).catch(() => { /* intentionally empty */ }); }, 1500); }
      else new obsidian.Notice("项目统计更新失败，可用命令「刷新当前招聘项目统计」手动刷新");
      return false;
    }
  }

  // F7：注册一个招聘主页 code block 渲染器，外层包 try/catch 降级为「数据加载失败 + 重试」。
  mountHrBlock(lang, render) {
    this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
      if (!isRecruitFeatureUnlocked(this.settings)) { el.empty(); el.createDiv({ cls: "lexvoice-hr-empty", text: "招聘功能未启用" }); return; }
      const go = () => Promise.resolve(render.call(this, source, el, ctx)).catch(e => {
        console.error("[LexVoice] " + lang + " 渲染失败", e);
        el.empty();
        const box = el.createDiv({ cls: "lexvoice-hr-block-error" });
        box.createSpan({ text: "数据加载失败。" });
        box.createEl("button", { text: "重试" }).onclick = () => go();
      });
      void go();
    });
  }

  renderHrActions(source, el) {
    el.empty();
    const bar = el.createDiv({ cls: "lexvoice-hr-actions" });
    bar.createEl("button", { cls: "mod-cta", text: "＋ 新建面试" }).onclick = () => {
      new RecruitContextModal(this.app, this, { flow: "settings", onConfirm: () => { /* intentionally empty */ } }).open();
    };
    bar.createEl("button", { text: "＋ 新建招聘项目" }).onclick = () => this.openNewRecruitProjectDialog();
  }

  renderHrLinks(source, el) {
    el.empty();
    const root = obsidian.normalizePath(this.settings.recruitJdFolderPath || "JD");
    const scrollToHeading = (label) => {
      const view = el.closest(".markdown-preview-view");
      if (!view) return;
      const headings = Array.from(view.querySelectorAll("h2, h3"));
      const target = headings.find(h => String(h.textContent || "").trim().includes(label));
      if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const openProjectBase = async () => {
      try {
        await ensureRecruitAggregateBase(this.app, root);
        await this.app.workspace.openLinkText(obsidian.normalizePath(`${root}/招聘项目.base`), "", false);
      } catch (e) {
        console.error("[LexVoice] open recruit base failed", e);
        new obsidian.Notice("打开招聘项目看板失败");
      }
    };
    const groups = [
      {
        title: "AGENDA",
        items: [
          { label: "新建面试", action: () => new RecruitContextModal(this.app, this, { flow: "settings", onConfirm: () => { /* intentionally empty */ } }).open() },
          { label: "新建项目", action: () => this.openNewRecruitProjectDialog() },
        ],
      },
      {
        title: "PROJECTS",
        items: [
          { label: "招聘项目", action: () => void openProjectBase() },
          { label: "在招项目", action: () => scrollToHeading("PROJECT TRACKING") },
        ],
      },
      {
        title: "PEOPLE",
        items: [
          { label: "候选人池", action: () => scrollToHeading("CANDIDATE POOL") },
          { label: "本周面试", action: () => scrollToHeading("THIS WEEK") },
        ],
      },
      {
        title: "QUERIES",
        items: [
          { label: "最近纪要", action: () => scrollToHeading("RECENT INTERVIEWS") },
          { label: "工作流", action: () => scrollToHeading("WORKFLOW") },
        ],
      },
    ];
    const grid = el.createDiv({ cls: "lexvoice-hr-links" });
    for (const group of groups) {
      const section = grid.createDiv({ cls: "lexvoice-hr-link-group" });
      section.createDiv({ cls: "lexvoice-hr-link-title", text: group.title });
      for (const item of group.items) {
        const btn = section.createEl("button", { cls: "lexvoice-hr-link-button", text: item.label });
        btn.onclick = (event) => {
          event.preventDefault();
          item.action();
        };
      }
    }
  }

  renderHrStats(source, el) {
    el.empty();
    const projects = listJDProjects(this.app, this.settings.recruitJdFolderPath);
    const notes = listRecruitCandidateNotes(this.app);
    let weekStart = 0;
    try { weekStart = window.moment ? window.moment().startOf("isoWeek").valueOf() : 0; } catch { weekStart = 0; }
    const weekNotes = notes.filter(n => n.time >= weekStart);
    const weekCands = new Set(weekNotes.map(n => n.候选人).filter(Boolean));
    const allCands = new Set(notes.map(n => n.候选人).filter(Boolean));
    const cards = [
      { label: "在招项目", value: projects.filter(p => p.status === "招聘中").length },
      { label: "候选人池", value: allCands.size },
      { label: "本周面试", value: weekNotes.length },
      { label: "本周新增候选人", value: weekCands.size },
    ];
    const grid = el.createDiv({ cls: "lexvoice-hr-stats" });
    for (const c of cards) {
      const card = grid.createDiv({ cls: "lexvoice-hr-stat-card" });
      card.createDiv({ cls: "lexvoice-hr-stat-value", text: String(c.value) });
      card.createDiv({ cls: "lexvoice-hr-stat-label", text: c.label });
    }
  }

  renderHrCandidates(source, el) {
    el.empty();
    let count = 30;
    const m = String(source || "").match(/count\s*[:=]\s*(\d+)/i);
    if (m) count = Math.max(1, parseInt(m[1], 10) || 30);
    const groups = new Map();
    for (const n of listRecruitCandidateNotes(this.app)) {
      const name = String(n.候选人 || "").trim();
      if (!name) continue;
      const key = normalizePersonLookupText(name) || name;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          候选人: name,
          联系方式: n.联系方式 || "",
          项目: n.项目 || "",
          最新轮次: n.轮次 || "",
          录用建议: n.录用建议 || "",
          一句话评价: n.一句话评价 || "",
          time: n.time || 0,
          path: n.path,
          count: 1,
        });
      } else {
        existing.count += 1;
        if (!existing.联系方式 && n.联系方式) existing.联系方式 = n.联系方式;
        if ((n.time || 0) > (existing.time || 0)) {
          existing.项目 = n.项目 || existing.项目;
          existing.最新轮次 = n.轮次 || existing.最新轮次;
          existing.录用建议 = n.录用建议 || existing.录用建议;
          existing.一句话评价 = n.一句话评价 || existing.一句话评价;
          existing.time = n.time || 0;
          existing.path = n.path;
        }
      }
    }
    const rows = Array.from(groups.values())
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, count);
    if (!rows.length) { el.createDiv({ cls: "lexvoice-hr-empty", text: "暂无候选人评估纪要" }); return; }
    const table = el.createEl("table", { cls: "lexvoice-hr-table lexvoice-hr-candidate-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of ["候选人", "项目", "面试次数", "最近轮次", "最新结论", "一句话评价"]) head.createEl("th", { text: h });
    const tbody = table.createEl("tbody");
    for (const n of rows) {
      const tr = tbody.createEl("tr");
      const nameCell = tr.createEl("td");
      nameCell.createEl("strong", { text: n.候选人 || "—" });
      if (n.联系方式) nameCell.createDiv({ cls: "lexvoice-hr-subtext", text: n.联系方式 });
      tr.createEl("td", { text: n.项目 || "—" });
      tr.createEl("td", { text: String(n.count || 1) });
      tr.createEl("td", { text: n.最新轮次 || "—" });
      const recCell = tr.createEl("td");
      if (n.录用建议) {
        recCell.createSpan({ cls: "lexvoice-hr-rec", text: n.录用建议 }).setAttribute("data-tone", recommendationTone(n.录用建议));
      } else { recCell.setText("—"); }
      tr.createEl("td", { text: n.一句话评价 || "—" });
      tr.addClass("lexvoice-hr-row");
      tr.onclick = () => this.app.workspace.openLinkText(n.path, "", false);
    }
  }

  renderHrRecent(source, el) {
    el.empty();
    let days = 7;
    const m = String(source || "").match(/days\s*[:=]\s*(\d+)/i);
    if (m) days = Math.max(1, parseInt(m[1], 10) || 7);
    let cutoff = 0;
    try { cutoff = window.moment ? window.moment().subtract(days, "days").valueOf() : 0; } catch { cutoff = 0; }
    const notes = listRecruitCandidateNotes(this.app).filter(n => n.time >= cutoff);
    if (!notes.length) { el.createDiv({ cls: "lexvoice-hr-empty", text: `近 ${days} 天暂无面试纪要` }); return; }
    const table = el.createEl("table", { cls: "lexvoice-hr-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of ["候选人", "项目", "轮次", "一句话评价", "录用建议"]) head.createEl("th", { text: h });
    const tbody = table.createEl("tbody");
    for (const n of notes) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { text: n.候选人 || "—" });
      tr.createEl("td", { text: n.项目 || "—" });
      tr.createEl("td", { text: n.轮次 || "—" });
      tr.createEl("td", { text: n.一句话评价 || "—" });
      const td = tr.createEl("td");
      if (n.录用建议) {
        td.createSpan({ cls: "lexvoice-hr-rec", text: n.录用建议 }).setAttribute("data-tone", recommendationTone(n.录用建议));
      } else { td.setText("—"); }
      tr.addClass("lexvoice-hr-row");
      tr.onclick = () => this.app.workspace.openLinkText(n.path, "", false);
    }
  }

  renderHrLatest(source, el) {
    el.empty();
    let count = 10;
    const m = String(source || "").match(/count\s*[:=]\s*(\d+)/i);
    if (m) count = Math.max(1, parseInt(m[1], 10) || 10);
    const notes = listRecruitCandidateNotes(this.app).slice(0, count);
    if (!notes.length) { el.createDiv({ cls: "lexvoice-hr-empty", text: "暂无纪要" }); return; }
    const list = el.createEl("ul", { cls: "lexvoice-hr-latest" });
    for (const n of notes) {
      const li = list.createEl("li");
      const label = `${n.候选人 || "候选人"}${n.轮次 ? " · " + n.轮次 : ""}${n.项目 ? "（" + n.项目 + "）" : ""}`;
      const a = li.createEl("a", { text: label, href: "#" });
      a.onclick = (e) => { e.preventDefault(); void this.app.workspace.openLinkText(n.path, "", false); };
    }
  }

  openNewRecruitProjectDialog() {
    const sub = new obsidian.Modal(this.app);
    sub.titleEl.setText("新建招聘项目");
    const mk = (label, val, ph) => {
      const row = sub.contentEl.createDiv({ cls: "lexvoice-recruit-meta-cell" });
      row.createEl("label", { text: label });
      const inp = row.createEl("input", { type: "text", cls: "lexvoice-recruit-input" });
      inp.value = val || ""; inp.placeholder = ph || "";
      return inp;
    };
    const nameInp = mk("职位名", "", "如：海外发行-社招负责人");
    const seqInp = mk("序列", "招聘", "如：招聘 / 产品 / 运营");
    const statusInp = mk("状态", "招聘中", "招聘中 / 已关闭 / 暂停");
    sub.contentEl.createEl("label", { text: "JD 正文（可选，可稍后在项目里补）" });
    const jdTa = sub.contentEl.createEl("textarea", { cls: "lexvoice-recruit-textarea" });
    jdTa.placeholder = "粘贴 JD 正文…";
    const actions = sub.contentEl.createDiv({ cls: "lexvoice-recruit-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => sub.close();
    actions.createEl("button", { text: "创建", cls: "mod-cta" }).onclick = async () => {
      const name = String(nameInp.value || "").trim();
      if (!name) { new obsidian.Notice("请填职位名"); return; }
      try {
        const res = await createRecruitProject(this.app, this.settings.recruitJdFolderPath, name, { 职位名: name, 序列: seqInp.value, 状态: statusInp.value }, jdTa.value);
        new obsidian.Notice(`已创建招聘项目：${res.name}`);
        sub.close();
        const f = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(res.mdPath));
        if (f instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(f);
      } catch (e) { new obsidian.Notice(`创建失败：${(e && e.message) || e}`); }
    };
    sub.open();
  }

  // F7：生成/重建招聘主页（重建前若有差异用 lexvoiceConfirm 确认覆盖）。
  async rebuildRecruitHomepage() {
    try {
      const root = obsidian.normalizePath(this.settings.recruitJdFolderPath || "JD");
      const hp = String(this.settings.recruitHomepagePath || "").trim();
      const targetPath = obsidian.normalizePath(hp || `${root}/招聘主页.md`);
      const tpl = renderRecruitHomepageTemplate();
      const slash = targetPath.lastIndexOf("/");
      const dir = slash >= 0 ? targetPath.slice(0, slash) : "";
      if (dir && !(this.app.vault.getAbstractFileByPath(dir) instanceof obsidian.TFolder)) await this.ensureFolder(dir);
      await ensureRecruitAggregateBase(this.app, root);    // 主页嵌入聚合 base，确保它存在
      const existing = this.app.vault.getAbstractFileByPath(targetPath);
      if (existing instanceof obsidian.TFile) {
        const cur = await this.app.vault.read(existing);
        if (cur.trim() !== tpl.trim()) {
          const ok = await lexvoiceConfirm(this.app, "覆盖招聘主页？", "目标已存在且与最新模板不一致，重建会覆盖你的手改。", "覆盖重建");
          if (!ok) { await this.app.workspace.getLeaf(false).openFile(existing); return; }
          await this.app.vault.modify(existing, tpl);
        }
        await this.app.workspace.getLeaf(false).openFile(existing);
      } else {
        await this.app.vault.create(targetPath, tpl);
        const f = this.app.vault.getAbstractFileByPath(targetPath);
        if (f instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(f);
      }
      new obsidian.Notice("招聘主页已就绪");
    } catch (e) {
      console.error("[LexVoice] rebuild recruit homepage failed", e);
      new obsidian.Notice(`重建招聘主页失败：${(e && e.message) || e}`);
    }
  }

  getAvailableVaultPath(targetPath) {
    let candidate = obsidian.normalizePath(targetPath || "");
    if (!candidate) return "";
    const dot = candidate.lastIndexOf(".");
    const base = dot >= 0 ? candidate.slice(0, dot) : candidate;
    const ext = dot >= 0 ? candidate.slice(dot) : "";
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = obsidian.normalizePath(`${base}-${i}${ext}`);
      i++;
      if (i > 99) return "";
    }
    return candidate;
  }

  openVaultFileInSystem(path) {
    try {
      const adapter = this.app.vault.adapter;
      const fullPath = adapter && typeof adapter.getFullPath === "function" ? adapter.getFullPath(path) : "";
      if (!fullPath) return false;
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Desktop-only system open uses Electron shell when available; non-desktop returns false.
      const electron = require("electron");
      if (electron && electron.shell && typeof electron.shell.openPath === "function") {
        electron.shell.openPath(fullPath);
        return true;
      }
    } catch (e) {
      console.warn("[LexVoice] open generated report failed", e);
    }
    return false;
  }

  async resolveEmailRecipientsForMarkdownFile(file) {
    const frontmatter = await readFileFrontmatter(this, file) || {};
    const attendeeNames = extractMeetingAttendeeNames(frontmatter);
    if (!attendeeNames.length) return { recipients: [], attendeeNames };
    const attendeeKeys = new Set(attendeeNames.map(normalizePersonLookupText).filter(Boolean));
    const people = await loadPeopleDirectory(this);
    const recipients = [];
    const seen = new Set();
    for (const person of people || []) {
      const terms = [person.name, ...(person.aliases || [])]
        .map(normalizePersonLookupText)
        .filter(Boolean);
      if (!terms.some(term => attendeeKeys.has(term))) continue;
      for (const email of normalizeEmailAddressList(person.email)) {
        if (seen.has(email)) continue;
        seen.add(email);
        recipients.push(email);
      }
    }
    return { recipients, attendeeNames };
  }

  getGeneratedEmailAttachmentFiles(file) {
    const stem = sanitizeReportFileStem(file && file.basename || "").toLowerCase();
    if (!stem) return [];
    const folders = [
      this.settings.htmlReportFolder || DEFAULT_SETTINGS.htmlReportFolder,
    ].map(p => obsidian.normalizePath(p || "")).filter(Boolean);
    const allowed = new Set(["html", "htm", "pdf"]);
    const out = [];
    const seen = new Set();
    for (const candidate of this.app.vault.getFiles()) {
      const path = obsidian.normalizePath(candidate.path || "");
      const ext = String(candidate.extension || "").toLowerCase();
      if (!allowed.has(ext)) continue;
      if (!folders.some(folder => path.startsWith(folder + "/"))) continue;
      const base = String(candidate.basename || "").toLowerCase();
      if (!base.startsWith(stem)) continue;
      if (file && obsidian.normalizePath(candidate.path) === obsidian.normalizePath(file.path)) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(candidate);
    }
    return out.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  }

  async renderMarkdownToEmailHtml(file, markdown) {
    let contentHtml = "";
    const renderComponent = new obsidian.Component();
    try {
      const el = activeDocument.createElement("article");
      if (obsidian.MarkdownRenderer && typeof obsidian.MarkdownRenderer.render === "function") {
        await obsidian.MarkdownRenderer.render(this.app, markdown, el, file.path, renderComponent);
      }
      contentHtml = el.innerHTML;
    } catch (e) {
      console.warn("[LexVoice] markdown render for email pdf failed, fallback to plain markdown", e);
    } finally {
      renderComponent.unload();
    }
    if (!contentHtml) contentHtml = `<pre>${escapeHtmlText(markdown)}</pre>`;
    const title = escapeHtmlText(file && file.basename || "LexVoice 会议纪要");
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
body { margin: 0; padding: 32px; color: #222; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; line-height: 1.65; }
article { max-width: 820px; margin: 0 auto; }
h1, h2, h3 { line-height: 1.25; }
pre { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
blockquote { margin: 12px 0; padding-left: 14px; border-left: 3px solid #ddd; color: #555; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #ddd; padding: 6px 8px; }
</style>
</head>
<body>
<article>${contentHtml}</article>
</body>
</html>`;
  }

  async printHtmlToPdfBuffer(html) {
    let BrowserWindow = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Hidden BrowserWindow PDF rendering is a desktop-only Electron capability.
      const electron = require("electron");
      BrowserWindow = electron && (electron.BrowserWindow || (electron.remote && electron.remote.BrowserWindow));
    } catch { /* intentionally empty */ }
    if (!BrowserWindow) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- @electron/remote is a compatibility fallback for older desktop Obsidian builds.
        const remote = require("@electron/remote");
        BrowserWindow = remote && remote.BrowserWindow;
      } catch { /* intentionally empty */ }
    }
    if (!BrowserWindow) throw new Error("当前 Obsidian 环境不支持自动生成 PDF");
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { marginType: "default" },
      });
      return pdf;
    } finally {
      try { win.destroy(); } catch { /* intentionally empty */ }
    }
  }

  async ensureMarkdownPdfForEmail(file, markdown) {
    const folder = obsidian.normalizePath(EMAIL_DRAFT_ATTACHMENT_FOLDER);
    await this.ensureFolder(folder);
    const target = this.getAvailableVaultPath(`${folder}/${sanitizeReportFileStem(file.basename)}-纪要PDF.pdf`);
    if (!target) throw new Error("无法生成可用的 PDF 路径");
    const html = await this.renderMarkdownToEmailHtml(file, markdown);
    const pdfBuffer = await this.printHtmlToPdfBuffer(html);
    const bytes = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer || []);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return await this.app.vault.createBinary(target, arrayBuffer);
  }

  async makeEmailAttachment(file) {
    const data = await this.app.vault.readBinary(file);
    return {
      name: file.name,
      mime: guessEmailAttachmentMime(file),
      base64: arrayBufferToBase64(data),
      path: file.path,
    };
  }

  async createEmailDraftForMarkdownFile(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return;
    try {
      new obsidian.Notice("LexVoice：正在生成邮件草稿…");
      const markdown = await this.app.vault.read(file);
      const { recipients, attendeeNames } = await this.resolveEmailRecipientsForMarkdownFile(file);
      const attachmentFiles = [file];
      let pdfFile = null;
      try {
        pdfFile = await this.ensureMarkdownPdfForEmail(file, markdown);
      } catch (e) {
        console.warn("[LexVoice] create email pdf failed", e);
        new obsidian.Notice(`PDF 自动生成失败：${(e && e.message) || e}；邮件草稿仍会包含 MD 和已有导出文件。`, 9000);
      }
      if (pdfFile instanceof obsidian.TFile) attachmentFiles.push(pdfFile);
      for (const generated of this.getGeneratedEmailAttachmentFiles(file)) {
        const path = obsidian.normalizePath(generated.path || "");
        if (!attachmentFiles.some(f => obsidian.normalizePath(f.path || "") === path)) attachmentFiles.push(generated);
      }
      const attachments = [];
      for (const attachmentFile of attachmentFiles) {
        try {
          attachments.push(await this.makeEmailAttachment(attachmentFile));
        } catch (e) {
          console.warn("[LexVoice] attach file failed", attachmentFile && attachmentFile.path, e);
        }
      }
      const subject = `会议纪要：${file.basename}`;
      const body = buildMeetingEmailBody({
        file,
        markdown,
        attendeeNames,
        attachmentsCount: attachments.length,
      });
      const eml = buildEmailDraftContent({ to: recipients, subject, body, attachments });
      const folder = obsidian.normalizePath(EMAIL_DRAFT_FOLDER);
      await this.ensureFolder(folder);
      const target = this.getAvailableVaultPath(`${folder}/${sanitizeReportFileStem(file.basename)}-邮件草稿.eml`);
      if (!target) throw new Error("无法生成可用的邮件草稿路径");
      const draft = await this.app.vault.create(target, eml);
      const opened = this.openVaultFileInSystem(draft.path);
      const recipientHint = recipients.length ? `，已填入 ${recipients.length} 个收件人` : "，未匹配到邮箱";
      new obsidian.Notice(`LexVoice：已生成邮件草稿${recipientHint}，附件 ${attachments.length} 个。${opened ? "" : "可在邮件草稿文件夹中打开。"}`, 10000);
    } catch (e) {
      console.error("[LexVoice] create email draft failed", e);
      new obsidian.Notice(`邮件草稿生成失败：${(e && e.message) || e}`, 9000);
    }
  }

  // 报告生成共用：校验 LLM 配置 →（招聘/研讨）弹配色选择 → 调模型产 HTML → 按所选色相整体重着色。
  // 返回 { html } 或 null（未配置/用户取消）。HTML 报告与 PDF 报告共用，保证选色/改色逻辑只有一份。
  async produceReportHtmlForFile(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return null;
    if (!this.settings.llmApiKey && !isLocalLlmEndpoint(this.settings.llmEndpoint)) {
      new obsidian.Notice("请先在 API 页配置大模型服务；本地 localhost 服务可留空密钥。", 8000);
      return null;
    }
    if (!this.settings.llmEndpoint || !this.settings.llmModel) {
      new obsidian.Notice("请先配置大模型服务地址和模型标识。", 8000);
      return null;
    }
    // 招聘评估 / 研讨纪要：纯白弥散数据驱动模板（大模型只产 DATA JSON 注入固定模板），生成前先选配色；其余模式沿用通用 HTML 报告。
    const frontmatter = await readFileFrontmatter(this, file);
    const mode = detectRecentNoteMode(this, file, frontmatter);
    const styled = mode === "recruit" || mode === "seminar";
    let accentHex = null;
    if (styled) {
      accentHex = await pickReportAccentColor(this.app);
      if (accentHex === null) return null;  // 用户取消
    }
    new obsidian.Notice("LexVoice：正在生成报告…");
    const markdown = await this.app.vault.read(file);
    let html = styled
      ? await generateStyledReportFromMarkdown(this, mode, markdown)
      : await generateHtmlReportFromMarkdown(this, file.basename, markdown);
    if (styled && accentHex) html = recolorReportHtml(html, accentHex);
    return { html };
  }

  async generateHtmlReportForMarkdownFile(file) {
    try {
      const r = await this.produceReportHtmlForFile(file);
      if (!r) return;
      const folder = obsidian.normalizePath(this.settings.htmlReportFolder || DEFAULT_SETTINGS.htmlReportFolder);
      await this.ensureFolder(folder);
      const target = this.getAvailableVaultPath(`${folder}/${sanitizeReportFileStem(file.basename)}-HTML报告.html`);
      if (!target) throw new Error("无法生成可用的 HTML 报告路径");
      const outFile = await this.app.vault.create(target, r.html);
      new obsidian.Notice(`LexVoice：已生成 HTML 报告：${target}`, 8000);
      if (this.settings.autoOpenHtmlReportAfterGenerate !== false) {
        this.openVaultFileInSystem(outFile.path);
      }
    } catch (e) {
      console.error("[LexVoice] generate html report failed", e);
      new obsidian.Notice(`HTML 报告生成失败：${(e && e.message) || e}`, 8000);
    }
  }

  async generatePdfReportForMarkdownFile(file) {
    try {
      const r = await this.produceReportHtmlForFile(file);
      if (!r) return;
      new obsidian.Notice("LexVoice：正在渲染整页 PDF…");
      const folder = obsidian.normalizePath(this.settings.htmlReportFolder || DEFAULT_SETTINGS.htmlReportFolder);
      await this.ensureFolder(folder);
      const target = this.getAvailableVaultPath(`${folder}/${sanitizeReportFileStem(file.basename)}-报告.pdf`);
      if (!target) throw new Error("无法生成可用的 PDF 路径");
      const pdfBuffer = await this.printHtmlToSinglePagePdfBuffer(r.html);
      const bytes = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer || []);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const outFile = await this.app.vault.createBinary(target, arrayBuffer);
      new obsidian.Notice(`LexVoice：已生成 PDF 报告：${target}`, 8000);
      if (this.settings.autoOpenHtmlReportAfterGenerate !== false) {
        this.openVaultFileInSystem(outFile.path);
      }
    } catch (e) {
      console.error("[LexVoice] generate pdf report failed", e);
      new obsidian.Notice(`PDF 报告生成失败：${(e && e.message) || e}`, 8000);
    }
  }

  // 整页不截断 PDF：隐藏窗口量内容真实尺寸 → 注入 @page 为整页全高 + preferCSSPageSize → 单页长 PDF（非 A4 分页，不截断）。
  async printHtmlToSinglePagePdfBuffer(html) {
    let BrowserWindow = null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Hidden BrowserWindow PDF rendering is a desktop-only Electron capability.
    try { const e = require("electron"); BrowserWindow = e && (e.BrowserWindow || (e.remote && e.remote.BrowserWindow)); } catch { /* intentionally empty */ }
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- @electron/remote is a compatibility fallback for older desktop Obsidian builds.
    if (!BrowserWindow) { try { BrowserWindow = require("@electron/remote").BrowserWindow; } catch { /* intentionally empty */ } }
    if (!BrowserWindow) throw new Error("当前 Obsidian 环境不支持自动生成 PDF");
    const win = new BrowserWindow({ show: false, width: 1024, height: 1400, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    // 超时兜底：渲染进程崩溃/卡死时这些 await 可能永不 settle，不加超时会让用户卡在"正在渲染…"且无法取消。
    const withTimeout = (p, ms, label) => Promise.race([
      Promise.resolve(p),
      new Promise((_, rej) => window.setTimeout(() => rej(new Error(`${label}超时（${ms / 1000}s）`)), ms)),
    ]);
    try {
      await withTimeout(win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`), 30000, "PDF 页面加载");
      await new Promise(r => window.setTimeout(r, 200));  // 等字体/布局稳定，量高才准
      // 页宽量 .doc（内容定宽容器，纯白弥散模板为 960px）实际宽度，避免把溢出/留白算进页宽导致左右白边；无 .doc 退回文档滚动宽。
      const dims = await withTimeout(win.webContents.executeJavaScript(
        "(()=>{const d=document.documentElement,b=document.body,doc=document.querySelector('.doc');return{w:(doc&&doc.offsetWidth)||Math.max(b.scrollWidth,d.scrollWidth,640),h:Math.max(b.scrollHeight,d.scrollHeight,400)};})()"
      ), 10000, "PDF 内容测量");
      const wpx = Math.min(1600, Math.max(640, Math.ceil(Number(dims && dims.w) || 960)));
      const rawH = Math.max(400, Math.ceil(Number(dims && dims.h) || 1320) + 24);
      // 单页高度上限保护：PDF 单页约 200in≈19200px(96dpi)，超了会被裁，封顶 18000px 留余量。超长则提示用户，避免静默丢内容。
      const hpx = Math.min(18000, rawH);
      if (rawH > 18000) {
        try { new obsidian.Notice("报告较长，整页 PDF 已按单页高度上限裁切；要完整内容请改用 HTML 报告。", 9000); } catch { /* intentionally empty */ }
      }
      await withTimeout(win.webContents.executeJavaScript(
        "(()=>{const s=document.createElement('style');s.textContent='@page{size:" + wpx + "px " + hpx + "px;margin:0}';document.head.appendChild(s);return true;})()"
      ), 10000, "PDF 页面尺寸注入");
      const pdf = await withTimeout(win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: "none" } }), 45000, "PDF 渲染");
      return pdf;
    } finally {
      try { win.destroy(); } catch { /* intentionally empty */ }
    }
  }

  async renameMarkdownWithGeneratedTitle(fileOrPath, polished, mode) {
    if (!this.settings.autoRenameWithTitle || !polished || mode === "off") return null;
    const file = typeof fileOrPath === "string"
      ? this.app.vault.getAbstractFileByPath(fileOrPath)
      : fileOrPath;
    if (!(file instanceof obsidian.TFile)) return null;
    try {
      const tag = await generateTitleTag(this, polished, mode);
      if (!tag) return file;
      const target = buildLexVoiceRenamedMarkdownPath(file.path, mode, tag, this.settings);
      const newPath = this.getAvailableMarkdownPath(target, file.path);
      if (!newPath || obsidian.normalizePath(newPath) === obsidian.normalizePath(file.path)) return file;
      await this.app.fileManager.renameFile(file, newPath);
      const renamed = this.app.vault.getAbstractFileByPath(newPath);
      return renamed instanceof obsidian.TFile ? renamed : file;
    } catch (e) {
      console.error("[LexVoice] rename failed", e);
      return file;
    }
  }

  async removeEmptySessionBlock(session) {
    const file = this.app.vault.getAbstractFileByPath(session.mdPath);
    if (!(file instanceof obsidian.TFile)) return;
    const cur = await this.app.vault.read(file);
    const sessMarker = `<!-- lexvoice-session:${session.id} -->`;
    const endMarker = `<!-- lexvoice-segments-end:${session.id} -->`;
    const sessIdx = cur.indexOf(sessMarker);
    const endIdx = cur.indexOf(endMarker);
    if (sessIdx < 0 || endIdx < sessIdx) return;
    const headerLineIdx = cur.lastIndexOf("\n## ", sessIdx);
    const h1LineIdx = cur.lastIndexOf("\n# ", sessIdx);
    const startIdx = Math.max(headerLineIdx, h1LineIdx);
    const blockStart = startIdx >= 0 ? startIdx + 1 : 0;
    const blockEnd = endIdx + endMarker.length;
    const before = cur.slice(0, blockStart).replace(/\n+$/, "\n");
    const after = cur.slice(blockEnd).replace(/^\n+/, "");
    const next = before + (after ? "\n" + after : "");
    if (next !== cur) await this.app.vault.modify(file, next);
  }

  async rewriteConsolidated(session, polished) {
    const file = this.app.vault.getAbstractFileByPath(session.mdPath);
    if (!(file instanceof obsidian.TFile)) return;
    const meta = getModeMeta(this.settings, session.mode);
    const moment = window.moment;
    const startedAt = moment(session.startedAt);
    const totalMs = session.segments.length ? session.segments[session.segments.length - 1].endOffsetMs : 0;
    const textImport = isTextImportSession(session);
    const masterAudioBlock = session.multiSourceAudio ? "" : buildMasterAudioDetails(session, totalMs);
    const audioRow = masterAudioBlock || session.segments.map((s, i) => getAudioSegmentListItem(s, i)).filter(Boolean).join("\n");
    const realtimeOutlineBlock = buildRealtimeOutlineDetails(session);
    const interviewBriefBlock = buildInterviewBriefDetails(session);
    const playbackTimelineBlock = buildPlaybackTimelineDetails(session);
    const meetingWorkbenchBlock = buildMeetingWorkbenchDetails(session);
    const recordingInfoBlock = textImport ? buildTextImportInfoDetails(session, meta.prefix, this.settings.llmModel) : buildRecordingInfoDetails({
      startedAt: session.startedAt,
      totalMs,
      modeLabel: meta.prefix,
      segmentCount: session.segments.length,
      model: this.settings.llmModel,
    });
    const textImportSourceBlock = textImport ? buildTextImportSourceDetails(session) : "";

    const rawBlocks = textImport ? "" : session.segments.map(s => {
      const n = s.index + 1;
      const head = `### 段落 ${n} (${formatElapsed(s.startOffsetMs)}–${formatElapsed(s.endOffsetMs)}) ${getAudioTimeLink(s.audioName, getSegmentAudioLinkOffsetMs(s))}${s.isFinal ? " · 结束" : ""}`;
      const body = s.error ? `_[转写失败：${s.error}]_` : (s.text || "_[此段无内容]_");
      return `${head}\n\n${body}\n`;
    }).join("\n");

    const polishedParts = splitLeadingFrontmatter(polished || "_[无输出]_");
    const polishedFrontmatter = polishedParts.frontmatter ? polishedParts.frontmatter.trimEnd() : "";
    // 把沉淀元数据注释从正文末尾拆出来，稍后挪到整篇笔记最末尾（不再夹在正文与原始材料之间）。
    const sediment = splitOutSedimentBlock(polishedParts.body);
    const polishedBody = sediment.body.trim() || "_[无输出]_";

    const content = [
      polishedFrontmatter || null,
      polishedFrontmatter ? "" : null,
      `# ${startedAt.format("YYYY-MM-DD HH:mm")} · ${meta.prefix}`,
      "",
      polishedBody,
      "",
      "---",
      "",
      "## 原始材料",
      "",
      recordingInfoBlock || null,
      recordingInfoBlock ? "" : null,
      interviewBriefBlock || null,
      interviewBriefBlock ? "" : null,
      meetingWorkbenchBlock || null,
      meetingWorkbenchBlock ? "" : null,
      realtimeOutlineBlock || null,
      realtimeOutlineBlock ? "" : null,
      textImport ? textImportSourceBlock || null : playbackTimelineBlock || null,
      textImport ? (textImportSourceBlock ? "" : null) : (playbackTimelineBlock ? "" : null),
      textImport ? null : (masterAudioBlock ? null : "<details>"),
      textImport ? null : (masterAudioBlock ? null : `<summary>原始音频（${session.segments.length} 段，${formatElapsed(totalMs)}）</summary>`),
      textImport ? null : "",
      textImport ? null : audioRow,
      textImport ? null : "",
      textImport ? null : (masterAudioBlock ? null : "</details>"),
      textImport ? null : "",
      textImport ? null : "<details>",
      textImport ? null : `<summary>分段原始转写（${session.segments.length} 段）</summary>`,
      textImport ? null : "",
      textImport ? null : rawBlocks,
      textImport ? null : "</details>",
      textImport ? null : "",
      `<!-- lexvoice-session:${session.id} -->`,
      "",
      // 沉淀元数据放最末尾（HTML 注释，阅读视图隐藏；挪到此处后编辑模式也不再夹在正文中间）。
      sediment.block || null,
      sediment.block ? "" : null,
    ].filter(v => v !== null).join("\n");

    await this.app.vault.modify(file, content);
  }

  async appendPolishBlock(session, polished, mergeError, nonRetryableMergeError = false) {
    const file = this.app.vault.getAbstractFileByPath(session.mdPath);
    if (!(file instanceof obsidian.TFile)) return;
    const totalMs = session.segments.length ? session.segments[session.segments.length - 1].endOffsetMs : 0;
    const meta = getModeMeta(this.settings, session.mode);
    const polishedParts = splitLeadingFrontmatter(polished || "_[无输出]_");
    const polishedFrontmatter = polishedParts.frontmatter ? polishedParts.frontmatter.trimEnd() : "";
    // 沉淀元数据从正文拆出，挪到本块最末尾，避免夹在正文与原始材料之间。
    const sediment = splitOutSedimentBlock(polishedParts.body);
    const polishedBody = sediment.body.trim() || "_[无输出]_";
    const textImport = isTextImportSession(session);
    const realtimeOutlineBlock = buildRealtimeOutlineDetails(session);
    const playbackTimelineBlock = buildPlaybackTimelineDetails(session);
    const recordingInfoBlock = textImport ? buildTextImportInfoDetails(session, meta.prefix, this.settings.llmModel) : buildRecordingInfoDetails({
      startedAt: session.startedAt,
      totalMs,
      modeLabel: meta.prefix,
      segmentCount: session.segments.length,
      model: this.settings.llmModel,
    });
    const textImportSourceBlock = textImport ? buildTextImportSourceDetails(session) : "";
    const masterAudioBlock = session.multiSourceAudio ? "" : buildMasterAudioDetails(session, totalMs);
    const meetingWorkbenchBlock = buildMeetingWorkbenchDetails(session);
    const failureText = mergeError
      ? (nonRetryableMergeError
        ? `_[AI 整理失败：${formatLlmFailureIssue(mergeError.message || mergeError)}]_`
        : `_[合并润色失败（已加入重试队列）：${mergeError.message || mergeError}]_`)
      : "";
    const block = [
      "",
      `## 整合版（${this.settings.llmModel} · ${meta.prefix}）`,
      "",
      mergeError ? failureText : polishedBody,
      "",
      recordingInfoBlock || null,
      recordingInfoBlock ? "" : null,
      textImport ? textImportSourceBlock || null : masterAudioBlock || null,
      textImport ? (textImportSourceBlock ? "" : null) : (masterAudioBlock ? "" : null),
      meetingWorkbenchBlock || null,
      meetingWorkbenchBlock ? "" : null,
      realtimeOutlineBlock || null,
      realtimeOutlineBlock ? "" : null,
      textImport ? null : playbackTimelineBlock || null,
      textImport ? null : (playbackTimelineBlock ? "" : null),
      "---",
      "",
      // 沉淀元数据放本整合块最末尾（HTML 注释，阅读视图隐藏）。
      sediment.block || null,
      sediment.block ? "" : null,
    ].filter(v => v !== null).join("\n");
    let cur = await this.app.vault.read(file);
    if (polishedFrontmatter && !mergeError) {
      const currentParts = splitLeadingFrontmatter(cur);
      cur = polishedFrontmatter + "\n\n" + currentParts.body.replace(/^\n+/, "");
    }
    const sep = cur.endsWith("\n") ? "" : "\n";
    let next = cur + sep + block;
    // 标题占位 `（录音中…）` 用全角括号；旧 regex 的 `\)?` 是半角，匹配不到全角 `）`，
    // 导致只替换"录音中…"留下原 `）` + 新拼的 `）` → 双括号 `（19:44））`。
    // 用 [)）]? 同时吃掉半/全角收尾括号，替换后只补一个全角 `）`。
    if (!textImport) next = next.replace(/录音中…[)）]?/g, `${formatElapsed(totalMs)}）`);
    await this.app.vault.modify(file, next);
  }

  async appendToNote(path, content) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof obsidian.TFile) {
      const cur = await this.app.vault.read(existing);
      const sep = cur.endsWith("\n") ? "" : "\n";
      await this.app.vault.modify(existing, cur + sep + content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  // 把内容插到 segments-start marker 之前（即分段转写区上方），用于录音期把面试提纲放在段落之上。
  async insertBeforeSegmentsStart(path, content, sessionId) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof obsidian.TFile)) return this.appendToNote(path, content);
    const cur = await this.app.vault.read(file);
    const marker = sessionId ? `<!-- lexvoice-segments-start:${sessionId} -->` : "<!-- lexvoice-segments-start -->";
    const idx = cur.indexOf(marker);
    if (idx >= 0) {
      const next = cur.slice(0, idx) + content + "\n" + cur.slice(idx);
      await this.app.vault.modify(file, next);
      return;
    }
    await this.appendToNote(path, content);
  }

  async insertBeforeSegmentsEnd(path, content, sessionId) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof obsidian.TFile)) return this.appendToNote(path, content);
    const cur = await this.app.vault.read(file);
    const specific = sessionId ? `<!-- lexvoice-segments-end:${sessionId} -->` : null;
    if (specific && cur.includes(specific)) {
      const next = cur.replace(specific, `${content}\n${specific}`);
      await this.app.vault.modify(file, next);
      return;
    }
    const legacy = "<!-- lexvoice-segments-end -->";
    const lastIdx = cur.lastIndexOf(legacy);
    if (lastIdx >= 0) {
      const next = cur.slice(0, lastIdx) + content + "\n" + cur.slice(lastIdx);
      await this.app.vault.modify(file, next);
      return;
    }
    await this.appendToNote(path, content);
  }

  // 历史笔记迁移：扫描 mdFolder 下所有 .md，给没有 frontmatter 的老纪要补全 mode/日期/主题/tags
  // 已有 mode 字段的跳过；无法识别模式的也跳过；其他都补全（写入最小 frontmatter）
  async migrateLegacyNotes() {
    const folderPath = obsidian.normalizePath(this.settings.mdFolder || "LexVoice/转写纪要");
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof obsidian.TFolder)) {
      throw new Error("笔记文件夹不存在：" + folderPath);
    }
    const files = [];
    const walk = (f) => {
      if (f instanceof obsidian.TFolder) for (const c of f.children) walk(c);
      else if (f instanceof obsidian.TFile && f.extension === "md") files.push(f);
    };
    walk(folder);

    let migrated = 0, skipped = 0, noMode = 0, failed = 0;
    const failedFiles = [];

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fmMatch) {
          try {
            const fm = obsidian.parseYaml(fmMatch[1]);
            if (fm && fm.mode) { skipped++; continue; }
          } catch { /* intentionally empty */ }
        }
        const mode = inferModeFromLegacyNote(file.name, content);
        if (!mode) { noMode++; continue; }

        const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : "";
        const durationMatch = content.match(/时长\s*[:：]\s*([\d:]+)/);
        const duration = durationMatch ? durationMatch[1] : "";
        const topic = inferTopicFromFilename(file.name);

        const fmObj = { mode };
        // 统一用 time（ISO datetime），不再写 日期；从文件名日期 + ctime 兜底推断，保证非空、跨模式一致。
        const tval = formatYamlDateTime(inferLexVoiceNoteStartedAtIso(file, date ? { "日期": date } : {}));
        if (tval) fmObj.time = tval;
        if (duration) fmObj["时长"] = duration;
        if (topic) fmObj["主题"] = topic; // 统一主键为 主题（含 huddle，不再写 议题）
        fmObj["状态"] = "已整理";
        fmObj["tags"] = ["lexvoice/" + mode, "lexvoice/legacy"];

        let yamlBlock;
        try { yamlBlock = obsidian.stringifyYaml(fmObj); }
        catch {
          yamlBlock = Object.entries(fmObj).map(([k, v]) =>
            Array.isArray(v) ? k + ":\n" + v.map(x => "  - " + x).join("\n") : k + ": " + v
          ).join("\n") + "\n";
        }

        let newContent;
        if (fmMatch) newContent = "---\n" + yamlBlock + "---\n" + content.slice(fmMatch[0].length);
        else newContent = "---\n" + yamlBlock + "---\n\n" + content;

        await this.app.vault.modify(file, newContent);
        migrated++;
      } catch (e) {
        console.error("[LexVoice] migrate failed:", file.path, e);
        failedFiles.push(file.path);
        failed++;
      }
    }
    return { migrated, skipped, noMode, failed, failedFiles, total: files.length };
  }

  async cleanupEmptyShortRecordings() {
    const folderPath = obsidian.normalizePath(this.settings.mdFolder || DEFAULT_SETTINGS.mdFolder);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof obsidian.TFolder)) {
      new obsidian.Notice(`转写纪要文件夹不存在：${folderPath}`, 8000);
      return;
    }

    const files = [];
    const walk = (item) => {
      if (item instanceof obsidian.TFolder) {
        for (const child of item.children) walk(child);
      } else if (item instanceof obsidian.TFile && item.extension === "md") {
        files.push(item);
      }
    };
    walk(folder);

    const currentPath = this.session && this.session.mdPath ? obsidian.normalizePath(this.session.mdPath) : "";
    const candidates = [];
    for (const file of files) {
      if (currentPath && obsidian.normalizePath(file.path) === currentPath) continue;
      try {
        const content = await this.app.vault.read(file);
        const candidate = analyzeLexVoiceEmptyShortNote(file, content, this.settings);
        if (!candidate) continue;
        const audioFiles = [];
        const seenAudio = new Set();
        for (const ref of candidate.audioRefs) {
          const audioFile = resolveLexVoiceAudioFile(this.app, this.settings, ref);
          if (audioFile && !seenAudio.has(audioFile.path)) {
            seenAudio.add(audioFile.path);
            audioFiles.push(audioFile);
          }
        }
        candidate.audioFiles = audioFiles;
        candidates.push(candidate);
      } catch (e) {
        console.error("[LexVoice] cleanup scan failed:", file.path, e);
      }
    }

    if (!candidates.length) {
      new obsidian.Notice("没有发现符合条件的空白短录音");
      return;
    }

    const uniqueAudioFiles = [];
    const audioPaths = new Set();
    for (const candidate of candidates) {
      for (const audioFile of candidate.audioFiles) {
        if (!audioPaths.has(audioFile.path)) {
          audioPaths.add(audioFile.path);
          uniqueAudioFiles.push(audioFile);
        }
      }
    }

    const preview = candidates
      .slice(0, 10)
      .map((c) => `- ${c.file.path}（${formatElapsed(c.durationMs)}，录音 ${c.audioFiles.length} 个）`)
      .join("\n");
    const more = candidates.length > 10 ? `\n...另有 ${candidates.length - 10} 条` : "";
    const ok = await lexvoiceConfirm(
      this.app,
      "清理空白短录音",
      `发现 ${candidates.length} 条空白短录音。\n\n条件：时长不超过 10 秒，且没有有效转写文本。\n将移入系统废纸篓：${candidates.length} 篇纪要、${uniqueAudioFiles.length} 个录音文件。\n\n${preview}${more}\n\n继续清理吗？`,
      "清理"
    );
    if (!ok) return;

    let noteDeleted = 0;
    let audioDeleted = 0;
    let failed = 0;
    const deletedNotePaths = new Set();
    const deletedAudioPaths = new Set();

    for (const candidate of candidates) {
      try {
        await trashLexVoiceFile(this.app, candidate.file);
        noteDeleted++;
        deletedNotePaths.add(obsidian.normalizePath(candidate.file.path));
      } catch (e) {
        failed++;
        console.error("[LexVoice] cleanup note delete failed:", candidate.file.path, e);
      }
    }

    for (const audioFile of uniqueAudioFiles) {
      const current = this.app.vault.getAbstractFileByPath(audioFile.path);
      if (!(current instanceof obsidian.TFile)) continue;
      try {
        await trashLexVoiceFile(this.app, current);
        audioDeleted++;
        deletedAudioPaths.add(obsidian.normalizePath(audioFile.path));
      } catch (e) {
        failed++;
        console.error("[LexVoice] cleanup audio delete failed:", audioFile.path, e);
      }
    }

    const beforeQueue = this.queue.tasks.length;
    this.queue.tasks = this.queue.tasks.filter((task) => {
      const mdPath = task.mdPath ? obsidian.normalizePath(task.mdPath) : "";
      const audioPath = task.audioPath ? obsidian.normalizePath(task.audioPath) : "";
      return !deletedNotePaths.has(mdPath) && !deletedAudioPaths.has(audioPath);
    });
    const queueRemoved = beforeQueue - this.queue.tasks.length;
    if (queueRemoved > 0) await this.saveAll();

    new obsidian.Notice(`清理完成：纪要 ${noteDeleted} 篇，录音 ${audioDeleted} 个，队列移除 ${queueRemoved} 条${failed ? `，失败 ${failed} 项` : ""}`, 10000);
  }

  // 创建 LexVoice 视图（.base 文件）—— 9 个：5 按模式 + 4 场景
  // overwrite=false：已存在的文件保留；overwrite=true：强制覆盖（用户重置/升级用）
  async createLexVoiceBases(opts) {
    const overwrite = !!(opts && opts.overwrite);
    const basesFolder = getLexVoiceBasesFolder(this.settings);
    await this.ensureFolder(basesFolder);
    await this.ensureFolder(basesFolder + "/按模式");
    await this.ensureFolder(basesFolder + "/场景");
    let created = 0, updated = 0, skipped = 0;
    for (const def of LV_BASE_DEFINITIONS) {
      if (!isRecruitFeatureUnlocked(this.settings) && /lexvoice\/recruit|招聘/.test(def.relPath + "\n" + def.yaml)) {
        skipped++;
        continue;
      }
      const path = obsidian.normalizePath(basesFolder + "/" + def.relPath);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof obsidian.TFile) {
        if (overwrite) {
          await this.app.vault.modify(existing, def.yaml);
          updated++;
        } else {
          skipped++;
        }
      } else {
        await this.app.vault.create(path, def.yaml);
        created++;
      }
    }
    return { created, updated, skipped };
  }

  async upsertGeneratedMarkdownFile(path, content, opts = {}) {
    const norm = obsidian.normalizePath(path);
    const folder = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
    if (folder) await this.ensureFolder(folder);
    let file = this.app.vault.getAbstractFileByPath(norm);
    if (file instanceof obsidian.TFile) {
      const current = await this.app.vault.cachedRead(file);
      const shouldUpdate = opts.overwrite || current.includes("<!-- lexvoice-generated-wall -->") || current.trim() === "";
      if (shouldUpdate && current !== content) await this.app.vault.modify(file, content);
      return file;
    }
    file = await this.app.vault.create(norm, content);
    return file;
  }

  async openGeneratedMarkdown(path, content, opts = {}) {
    const withMarker = content.includes("<!-- lexvoice-generated-wall -->") ? content : "<!-- lexvoice-generated-wall -->\n" + content;
    const file = await this.upsertGeneratedMarkdownFile(path, withMarker, opts);
    if (file instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  async openLearningWall(scope = "learning") {
    const isConcept = scope === "concept";
    const fileName = isConcept ? CONCEPT_WALL_FILE : LEARNING_WALL_FILE;
    const content = isConcept ? formatConceptWallMarkdown(this.settings) : formatLearningWallMarkdown(this.settings);
    return await this.openGeneratedMarkdown(getLexVoiceWallPath(this.settings, fileName), content, { overwrite: true });
  }

  async openTodoWall() {
    return await this.openGeneratedMarkdown(getLexVoiceWallPath(this.settings, TODO_WALL_FILE), formatTodoWallMarkdown(this.settings), { overwrite: true });
  }

  async openObjectWall() {
    return await this.openGeneratedMarkdown(getLexVoiceWallPath(this.settings, OBJECT_WALL_FILE), formatObjectWallMarkdown(this.settings), { overwrite: true });
  }

  async openPeopleBase() {
    const file = await this.ensurePeopleDirectoryFiles({ overwrite: false });
    if (file instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  async openLexVoiceDetailBase() {
    await this.createLexVoiceBases({ overwrite: false });
    const path = obsidian.normalizePath(getLexVoiceBasesFolder(this.settings) + "/场景/全部纪要总览.base");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof obsidian.TFile) await this.app.workspace.getLeaf(false).openFile(file);
    else new obsidian.Notice("未找到明细 Base，请先创建视图文件。", 8000);
    return file;
  }

  async archiveLegacyObjectBaseViews() {
    const root = getLexVoiceBasesFolder(this.settings);
    const archiveFolder = obsidian.normalizePath(root + "/旧视图");
    const legacyNames = ["学习卡片墙.base", "概念墙.base", "待办墙.base"];
    let archived = 0;
    let missing = 0;
    await this.ensureFolder(archiveFolder);
    for (const name of legacyNames) {
      const sourcePath = obsidian.normalizePath(root + "/" + name);
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof obsidian.TFile)) {
        missing++;
        continue;
      }
      const target = this.getAvailableVaultPath(obsidian.normalizePath(archiveFolder + "/" + name));
      if (!target) continue;
      await this.app.fileManager.renameFile(file, target);
      archived++;
    }
    new obsidian.Notice(archived ? `已归档旧对象 Base：${archived} 个` : "没有发现需要归档的旧对象 Base", 6000);
    return { archived, missing };
  }

  async ensureFolder(folderPath) {
    const norm = obsidian.normalizePath(folderPath);
    if (!norm || norm === "/") return;
    const parts = norm.split("/").filter(Boolean);
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      const exist = this.app.vault.getAbstractFileByPath(cur);
      if (!exist) { try { await this.app.vault.createFolder(cur); } catch { /* intentionally empty */ } }
    }
  }

  // 单 mode 生成定制 Prompt：调一次 LLM，返回纯文本
  async generateIndustryPromptForMode(mode) {
    const p = this.settings.industryProfile || {};
    if (!p.industry || !p.scenarios) {
      throw new Error("请先在「AI 整理」填写「行业 / 角色」和「主要工作场景」");
    }
    if (!this.settings.llmApiKey) throw new Error("请先在 API 页配置大模型服务");
    if (!isKnownPolishMode(this.settings, mode)) throw new Error("未知的 mode：" + mode);
    const meta = getModeMeta(this.settings, mode);
    const modeLabel = meta && meta.prefix ? meta.prefix : mode;
    const sys = "你是 Prompt 工程师，专门为真实工作和学习场景生成可直接用于录音整理的 Markdown Prompt。输出要克制、清晰、可维护，不要堆砌 callout。";
    const userMsg = INDUSTRY_META_PROMPT
      .replaceAll("{{INDUSTRY}}", p.industry || "（未指定）")
      .replaceAll("{{SCENARIOS}}", p.scenarios || "（未指定）")
      .replaceAll("{{FOCUS}}", p.focus || "（未指定）")
      .replaceAll("{{OUTPUT_PREFERENCE}}", p.outputPreference || "（未指定）")
      .replaceAll("{{MODE}}", `${mode}（${modeLabel}）`);
    const text = await callLlm(this, sys, userMsg);
    let cleaned = text
      .replace(/^```\w*\s*/, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    if (!cleaned.includes("{{TRANSCRIPT}}")) {
      cleaned = cleaned + "\n\n原始转写：\n{{TRANSCRIPT}}";
    }
    return cleaned;
  }

  // 把生成好的 Prompt 保存为新的自定义提示词；不再覆盖内置提示词。
  async createIndustryPromptVariant(mode, promptText, opts) {
    if (!isKnownPolishMode(this.settings, mode)) throw new Error("未知的 mode：" + mode);
    const moment = window.moment;
    const stamp = moment ? moment().format("YYYY-MM-DD HH:mm") : new Date().toISOString().slice(0, 16);
    const profile = this.settings.industryProfile || {};
    const meta = getModeMeta(this.settings, mode);
    const role = (profile.industry || "自定义").trim();
    const firstScenario = String(profile.scenarios || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || (meta.prefix || "场景");
    const name = (opts && opts.name) || (role + " · " + firstScenario);
    const id = makeCustomPromptModeId(name || "scene");
    const tpl = {
      id,
      mode: id,
      name,
      description: "由角色、任务和输出偏好生成。参考提示词：" + (meta.prefix || meta.label || mode) + "。生成时间：" + stamp,
      baseMode: mode,
      prompt: promptText,
      isBuiltin: false,
      customMode: true,
      source: "ai-prompt-generator",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!this.settings.promptTemplates) this.settings.promptTemplates = {};
    if (!this.settings.activeTemplateByMode) this.settings.activeTemplateByMode = {};
    const clean = sanitizePromptTemplate(tpl, mode);
    this.settings.promptTemplates[clean.id] = clean;
    this.settings.activeTemplateByMode[clean.id] = clean.id;
    if (!opts || opts.activate !== false) this.settings.polishMode = clean.id;
    if (!this.settings.industryProfile) this.settings.industryProfile = {};
    this.settings.industryProfile.generatedAt = new Date().toISOString();
    await this.saveSettings();
    return clean;
  }

  // 一站式入口：生成 + 入库 + 激活，由调用方决定是否走后台 queue
  async generateAndApplyIndustryPrompt(mode, options) {
    const promptText = await this.generateIndustryPromptForMode(mode);
    const tpl = await this.createIndustryPromptVariant(mode, promptText, options);
    return tpl;
  }

  async extractVocabulary(merge) {
    const p = this.settings.industryProfile || {};
    if (!this.settings.llmApiKey && !isLocalLlmEndpoint(this.settings.llmEndpoint)) throw new Error("请先在 API 页配置大模型服务");
    const customPromptBrief = getCustomPromptModeTemplates(this.settings)
      .slice(0, 12)
      .map(t => `- ${t.name || t.id}: ${(t.prompt || t.description || "").replace(/\s+/g, " ").slice(0, 180)}`)
      .join("\n") || "（暂无自定义提示词）";
    const currentMode = getEffectivePolishMode(this.settings, this.settings.polishMode, "meeting");
    const currentMeta = getModeMeta(this.settings, currentMode);
    const sys = "你是 ASR 领域词汇提取助手。请根据用户的工作描述、常用提示词和 LexVoice 使用场景，抽取最可能在录音中出现、ASR 容易识别错的专有词，并按固定类别输出。";
    const user = `【用户行业 / 角色】${p.industry || "（未指定）"}

【主要工作场景】
${p.scenarios || "（未指定）"}

【关注点】
${p.focus || "（未指定）"}

【当前默认提示词】
${currentMeta.prefix || currentMeta.label || currentMode}

【自定义提示词摘要】
${customPromptBrief}

【任务】
列出 30–80 个可能高频出现、且值得加入 ASR 热词表的专有词。若能推断出常见误写，也可以列出少量「易错写法 => 标准写法」。若用户背景为空，请根据当前默认提示词与自定义提示词推断；不要编造真实人名、真实公司或隐私信息，可以使用类别化占位词。
- 人名：客户、同事、专家、讲师、候选人、常用称呼
- 品牌/机构：公司、学校、客户、供应商、社区、品牌名
- 项目/产品：项目代号、产品名、模型名、系统名、服务名、插件名
- 行业术语：专业概念、业务流程词、缩写、英文混杂词
- 易错写法：只列非常确定的标准写法映射，例如 open router => OpenRouter；不要虚构真实姓名或真实公司
- 其他专有名词：暂时不好归类但 ASR 容易识别错的词

【输出格式】
严格只输出下面的 Markdown 结构；每行一个词，不加解释。某类没有词也保留标题。「易错写法」只允许使用“错误写法 => 标准写法”。

## 人名
- <词>

## 品牌/机构
- <词>

## 项目/产品
- <词>

## 行业术语
- <词>

## 易错写法
- <错误写法> => <标准写法>

## 其他专有名词
- <词>`;
    const result = await callLlm(this, sys, user);
    const cleaned = result
      .replace(/^```\w*\s*/, "")
      .replace(/\s*```\s*$/, "")
      .replace(/^好的[，,].*?\n/, "")
      .trim();
    let newGroups = parseVocabularyGroups(cleaned);
    let newTerms = flattenVocabularyGroups(newGroups);
    if (!newTerms.length) {
      newGroups = normalizeVocabularyInput(cleaned.split(/\r?\n/)
        .map((s) => s.replace(/^[\d\-*.、]+\s*/, "").replace(/^["「『]|["」』]$/g, "").trim())
        .filter(Boolean));
      newTerms = flattenVocabularyGroups(newGroups);
    }

    let finalGroups = newGroups;
    if (merge) {
      const existing = await loadVocabularyGroups(this);
      finalGroups = mergeVocabularyGroups(existing, newGroups);
    }
    await this.writeVocabularyFile(finalGroups);
    return newTerms;
  }

  async extractVocabularyFromMarkdown(file, markdown) {
    if (!this.settings.llmApiKey && !isLocalLlmEndpoint(this.settings.llmEndpoint)) throw new Error("请先在 API 页配置大模型服务");
    const source = String(markdown || "")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m, "")
      .slice(0, 18000);
    const sys = "你是 ASR 领域词汇提取助手。请只根据用户当前笔记提取可能提升语音转写准确率的词汇，不要编造，不要输出非指定格式。";
    const user = `请从下面这篇 LexVoice 笔记中提取适合加入 ASR 热词表的词汇。

文件名：${file && file.basename ? file.basename : "当前笔记"}

提取规则：
- 只提取笔记中真实出现、后续录音里可能反复出现、且 ASR 容易识别错的词。
- 专有名词优先：人名/称呼、品牌/机构、项目/产品、行业术语、英文缩写、中英混合词。
- 人名只提取姓名或常用称呼，不提取身份号码、手机号、住址、邮箱等隐私字段。
- 人员角色、组织关系和长期备注不要塞进 ASR 热词表；这些应进入人员资料。
- 「易错写法」只写非常确定的映射，例如 open router => OpenRouter。
- 不确定就不要提取。

输出格式：
严格只输出下面的 Markdown 结构；每行一个词，不加解释。某类没有词也保留标题。

## 人名
- <词>

## 品牌/机构
- <词>

## 项目/产品
- <词>

## 行业术语
- <词>

## 易错写法
- <错误写法> => <标准写法>

## 其他专有名词
- <词>

笔记正文：
${source}`;
    const result = await callLlm(this, sys, user, { timeoutMs: 60000 });
    const cleaned = result
      .replace(/^```\w*\s*/, "")
      .replace(/\s*```\s*$/, "")
      .replace(/^好的[，,].*?\n/, "")
      .trim();
    let newGroups = parseVocabularyGroups(cleaned);
    let newTerms = flattenVocabularyGroups(newGroups);
    if (!newTerms.length) {
      newGroups = normalizeVocabularyInput(cleaned.split(/\r?\n/)
        .map((s) => s.replace(/^[\d\-*.、]+\s*/, "").replace(/^["「『]|["」』]$/g, "").trim())
        .filter(Boolean));
      newTerms = flattenVocabularyGroups(newGroups);
    }
    if (!newTerms.length) return [];
    const existing = await loadVocabularyGroups(this);
    await this.writeVocabularyFile(mergeVocabularyGroups(existing, newGroups));
    return newTerms;
  }

  async writeVocabularyFile(terms) {
    const groups = normalizeVocabularyInput(terms);
    const path = this.settings.vocabularyFile;
    if (!path) {
      // 不再静默吞进隐藏的 customVocabulary：提示用户补路径，否则热词在设置里"看不见摸不着"
      this.settings.customVocabulary = flattenVocabularyGroups(groups).join("\n");
      await this.saveSettings();
      try { new obsidian.Notice("未配置热词表路径，本次热词已暂存在插件设置中；请在「设置 → 信息对象 → ASR 热词表」填写路径后重新整理。", 9000); } catch { /* intentionally empty */ }
      return null;
    }
    const norm = obsidian.normalizePath(path);
    const folderPath = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
    if (folderPath) await this.ensureFolder(folderPath);
    const content = formatVocabularyMarkdown(groups, this.settings.industryProfile);
    let file = this.app.vault.getAbstractFileByPath(norm);
    if (file instanceof obsidian.TFile) {
      await this.app.vault.modify(file, content);
    } else {
      file = await this.app.vault.create(norm, content);
    }
    return file;
  }

  async ensurePeopleDirectoryFiles(opts) {
    const overwrite = !!(opts && opts.overwrite);
    const folder = obsidian.normalizePath(this.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
    const basePath = obsidian.normalizePath(this.settings.peopleBaseFile || DEFAULT_SETTINGS.peopleBaseFile);
    if (folder) await this.ensureFolder(folder);
    const baseFolder = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : "";
    if (baseFolder) await this.ensureFolder(baseFolder);
    const yaml = formatPeopleBaseYaml();
    let file = this.app.vault.getAbstractFileByPath(basePath);
    if (file instanceof obsidian.TFile) {
      if (overwrite) await this.app.vault.modify(file, yaml);
    } else {
      file = await this.app.vault.create(basePath, yaml);
    }
    return file;
  }

  async createPeopleDirectoryNote(name) {
    const folder = obsidian.normalizePath(this.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
    if (folder) await this.ensureFolder(folder);
    const safeName = sanitizeFilename(String(name || "").trim()) || "未命名人员";
    const exactPath = obsidian.normalizePath(`${folder}/${safeName}.md`);
    const exact = this.app.vault.getAbstractFileByPath(exactPath);
    if (exact instanceof obsidian.TFile) return exact;
    const people = await loadPeopleDirectory(this, { force: true });
    const matched = findMatchingPersonEntry(people, { name: name || safeName, aliases: [] });
    if (matched && matched.path) {
      const file = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(matched.path));
      if (file instanceof obsidian.TFile) return file;
    }
    return await this.app.vault.create(exactPath, formatPeopleNoteMarkdown(name || safeName, this.settings.mdFolder));
  }

  choosePrimaryPeopleRecord(records) {
    const scoreRecord = (record) => {
      const file = record && record.file;
      const entry = record && record.entry;
      const basename = String(file && file.basename || "").trim();
      const name = String(entry && entry.name || "").trim();
      const cleanName = sanitizeFilename(name);
      const numericSuffix = /-\d+$/.test(basename);
      if (cleanName && basename === cleanName) return 0;
      if (!numericSuffix) return 10;
      return 20;
    };
    return (records || []).slice().sort((a, b) => {
      const scoreDiff = scoreRecord(a) - scoreRecord(b);
      if (scoreDiff) return scoreDiff;
      return String(a.file && a.file.path || "").length - String(b.file && b.file.path || "").length;
    })[0] || null;
  }

  mergeDuplicatePeopleFrontmatter(primaryFm, duplicateFm, duplicateEntry, duplicateFile) {
    const next = Object.assign({}, primaryFm || {});
    const dup = Object.assign({}, duplicateFm || {});
    const canonicalName = String(next["姓名"] || next.name || "").trim();
    const duplicateName = String(duplicateEntry && duplicateEntry.name || dup["姓名"] || dup.name || "").trim();
    if (!canonicalName && duplicateName) next["姓名"] = duplicateName;
    for (const key of ["角色", "组织", "邮箱"]) {
      if (!String(next[key] || "").trim() && String(dup[key] || "").trim()) next[key] = dup[key];
    }
    const aliasCandidates = [];
    aliasCandidates.push(...splitPersonFieldValue(next["常用称呼"] || next.aliases || []));
    aliasCandidates.push(...splitPersonFieldValue(dup["常用称呼"] || dup.aliases || []));
    if (duplicateName && normalizePersonLookupText(duplicateName) !== normalizePersonLookupText(next["姓名"] || canonicalName)) aliasCandidates.push(duplicateName);
    const aliases = mergeUniqueStrings([], aliasCandidates)
      .filter(item => !/-\d+$/.test(String(item || "").trim()));
    if (aliases.length) next["常用称呼"] = aliases;
    const sources = mergeUniqueStrings(next["来源"] || next.sources || [], dup["来源"] || dup.sources || []);
    if (sources.length) next["来源"] = sources;
    const notes = [];
    for (const value of [next["备注"] || next.note, dup["备注"] || dup.note]) {
      const text = String(value || "").trim();
      if (text && !notes.includes(text)) notes.push(text);
    }
    const duplicateLabel = duplicateFile instanceof obsidian.TFile ? duplicateFile.basename : "";
    if (duplicateLabel) notes.push(`合并历史重复人员页：${duplicateLabel}`);
    if (notes.length) next["备注"] = notes.join("\n\n");
    next.type = "lexvoice-person";
    next["最近更新"] = new Date().toISOString().slice(0, 10);
    next.tags = mergeUniqueStrings(getFrontmatterTags(next), ["lexvoice/person"]);
    delete next.name;
    delete next.aliases;
    delete next.sources;
    delete next.note;
    return next;
  }

  formatMergedPeopleArchiveMarkdown(duplicateFile, primaryFile, duplicateFm) {
    const fm = Object.assign({}, duplicateFm || {});
    fm.type = "lexvoice-person-merged";
    fm["已合并到"] = makeFileWikiLink(primaryFile);
    fm["合并日期"] = new Date().toISOString().slice(0, 10);
    fm.tags = mergeUniqueStrings(getFrontmatterTags(fm).filter(tag => tag !== "lexvoice/person"), ["lexvoice/person-merged"]);
    delete fm.name;
    delete fm.aliases;
    const title = duplicateFile instanceof obsidian.TFile ? duplicateFile.basename : "已合并人员";
    const target = makeFileWikiLink(primaryFile);
    return upsertFrontmatterInMarkdown(`# ${title}\n\n此人员档案已合并到 ${target}。\n\n保留此归档页用于回溯，LexVoice 不再把它作为人员资料读取。\n`, fm);
  }

  replacePeopleWikiLinksInText(text, replacements) {
    let next = String(text || "");
    for (const item of replacements || []) {
      const fromFile = item && item.fromFile;
      const toFile = item && item.toFile;
      if (!(fromFile instanceof obsidian.TFile) || !(toFile instanceof obsidian.TFile)) continue;
      const targets = Array.from(new Set([
        obsidian.normalizePath(fromFile.path || "").replace(/\.md$/i, ""),
        fromFile.basename,
      ].filter(Boolean)));
      const toTarget = obsidian.normalizePath(toFile.path || "").replace(/\.md$/i, "");
      const toLabel = toFile.basename;
      for (const target of targets) {
        const re = new RegExp(`\\[\\[${escapeRegExp(target)}(?:\\|([^\\]]+))?\\]\\]`, "g");
        next = next.replace(re, (_match, label) => {
          const rawLabel = String(label || "").trim();
          const display = rawLabel && !/-\d+$/.test(rawLabel) ? rawLabel : toLabel;
          return `[[${toTarget}|${display}]]`;
        });
      }
    }
    return next;
  }

  async mergeDuplicatePeopleDirectory() {
    await this.ensurePeopleDirectoryFiles({ overwrite: false });
    const folder = obsidian.normalizePath(this.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
    const prefix = folder ? folder + "/" : "";
    const files = this.app.vault.getMarkdownFiles()
      .filter(file => {
        const path = obsidian.normalizePath(file.path || "");
        return folder && path.startsWith(prefix);
      });
    const groups = new Map();
    for (const file of files) {
      const fm = await readFileFrontmatter(this, file);
      const entry = personEntryFromFrontmatter(fm, file);
      const key = normalizePersonLookupText(entry && entry.name);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ file, fm: fm || {}, entry });
    }
    const duplicateGroups = Array.from(groups.values()).filter(group => group.length > 1);
    if (!duplicateGroups.length) return { groups: 0, merged: 0, updatedLinks: 0 };

    const archiveFolder = obsidian.normalizePath("LexVoice/归档/重复人员");
    await this.ensureFolder(archiveFolder);
    const replacements = [];
    let merged = 0;
    for (const group of duplicateGroups) {
      const primary = this.choosePrimaryPeopleRecord(group);
      if (!primary) continue;
      let primaryContent = await this.app.vault.read(primary.file);
      let primaryFm = Object.assign({}, primary.fm || {});
      for (const duplicate of group) {
        if (!duplicate || duplicate.file === primary.file) continue;
        primaryFm = this.mergeDuplicatePeopleFrontmatter(primaryFm, duplicate.fm || {}, duplicate.entry, duplicate.file);
        replacements.push({ fromFile: duplicate.file, toFile: primary.file });
        const archiveMarkdown = this.formatMergedPeopleArchiveMarkdown(duplicate.file, primary.file, duplicate.fm || {});
        await this.app.vault.modify(duplicate.file, archiveMarkdown);
        const archivePath = this.getAvailableVaultPath(obsidian.normalizePath(`${archiveFolder}/${duplicate.file.basename}.md`));
        if (archivePath && this.app.fileManager && typeof this.app.fileManager.renameFile === "function") {
          await this.app.fileManager.renameFile(duplicate.file, archivePath);
        }
        merged++;
      }
      primaryContent = ensurePeopleNoteRelatedBaseSection(primaryContent, this.settings.mdFolder);
      await this.app.vault.modify(primary.file, upsertFrontmatterInMarkdown(primaryContent, primaryFm));
    }

    let updatedLinks = 0;
    if (replacements.length) {
      for (const file of this.app.vault.getMarkdownFiles()) {
        const path = obsidian.normalizePath(file.path || "");
        if (path.startsWith(archiveFolder + "/")) continue;
        const content = await this.app.vault.read(file);
        const next = this.replacePeopleWikiLinksInText(content, replacements);
        if (next !== content) {
          await this.app.vault.modify(file, next);
          updatedLinks++;
        }
      }
    }
    this.invalidatePeopleDirectoryCache();
    return { groups: duplicateGroups.length, merged, updatedLinks };
  }

  getKnowledgeExtractionSourceFiles(kind) {
    const folder = obsidian.normalizePath(this.settings.mdFolder || DEFAULT_SETTINGS.mdFolder);
    const prefix = folder ? folder + "/" : "";
    return this.app.vault.getMarkdownFiles()
      .filter(file => {
        const path = obsidian.normalizePath(file.path || "");
        if (folder && path !== folder && !path.startsWith(prefix)) return false;
        if (path === obsidian.normalizePath(this.settings.vocabularyFile || "")) return false;
        if (this.settings.peopleDirectoryFolder) {
          const peopleFolder = obsidian.normalizePath(this.settings.peopleDirectoryFolder);
          if (path === peopleFolder || path.startsWith(peopleFolder + "/")) return false;
        }
        return !isKnowledgeSourceAlreadyScanned(this.settings, kind, file);
      })
      .sort((a, b) => (b.stat && b.stat.mtime || 0) - (a.stat && a.stat.mtime || 0));
  }

  markKnowledgeExtractionSource(kind, file) {
    if (!(file instanceof obsidian.TFile)) return;
    const safeKind = kind === "people" ? "people" : "vocabulary";
    const history = normalizeKnowledgeExtractionHistory(this.settings.knowledgeExtractionHistory);
    history[safeKind][obsidian.normalizePath(file.path)] = knowledgeExtractionRecordForFile(file);
    this.settings.knowledgeExtractionHistory = history;
  }

  clearKnowledgeExtractionHistory(kind) {
    const history = normalizeKnowledgeExtractionHistory(this.settings.knowledgeExtractionHistory);
    if (kind === "people" || kind === "vocabulary") history[kind] = {};
    else {
      history.people = {};
      history.vocabulary = {};
    }
    this.settings.knowledgeExtractionHistory = history;
  }

  invalidatePeopleDirectoryCache() {
    this._peopleDirectoryCache = null;
  }

  async getCachedPeopleDirectorySuggestions() {
    const cache = normalizePeopleSuggestionCache(this.settings.peopleSuggestionCache);
    const people = await loadPeopleDirectory(this);
    const keptRecords = [];
    const suggestions = [];
    let changed = false;
    for (const record of cache.pending) {
      if (!isPeopleSuggestionCacheRecordCurrent(this, record) || isPeopleSuggestionIgnored(this.settings, record.suggestion)) {
        changed = true;
        continue;
      }
      const item = peopleSuggestionRecordToSuggestion(record);
      if (!item) {
        changed = true;
        continue;
      }
      item.match = findMatchingPersonEntry(people, item);
      item.matchPath = (item.match && item.match.path) || item.matchPath || "";
      keptRecords.push(Object.assign({}, record, {
        suggestion: Object.assign({}, record.suggestion || {}, { matchPath: item.matchPath }),
      }));
      suggestions.push(item);
    }
    if (changed || keptRecords.length !== cache.pending.length) {
      this.settings.peopleSuggestionCache = { pending: keptRecords };
      await this.saveSettings();
    }
    return suggestions;
  }

  cachePeopleDirectorySuggestions(sourceFile, suggestions) {
    const cache = normalizePeopleSuggestionCache(this.settings.peopleSuggestionCache);
    const byKey = new Map(cache.pending.map(record => [record.key, record]));
    let added = 0;
    for (const raw of suggestions || []) {
      if (isPeopleSuggestionIgnored(this.settings, raw)) continue;
      const record = makePeopleSuggestionCacheRecord(sourceFile, raw);
      if (!record) continue;
      const existing = byKey.get(record.key);
      byKey.set(record.key, Object.assign({}, existing || {}, record, {
        createdAt: existing && existing.createdAt ? existing.createdAt : record.createdAt,
        updatedAt: new Date().toISOString(),
      }));
      if (!existing) added++;
    }
    this.settings.peopleSuggestionCache = { pending: Array.from(byKey.values()).slice(-PEOPLE_SUGGESTION_CACHE_LIMIT) };
    return added;
  }

  removeCachedPeopleSuggestions(suggestions) {
    const cache = normalizePeopleSuggestionCache(this.settings.peopleSuggestionCache);
    const keys = new Set();
    for (const item of suggestions || []) {
      const key = item && (item.cacheKey || item.key || getPeopleSuggestionCacheKey(item.sourcePath || "", item));
      if (key) keys.add(String(key));
    }
    if (!keys.size) return 0;
    const pending = cache.pending.filter(record => !keys.has(record.key));
    this.settings.peopleSuggestionCache = { pending };
    return cache.pending.length - pending.length;
  }

  clearPeopleSuggestionCache() {
    this.settings.peopleSuggestionCache = { pending: [] };
  }

  async openCachedPeopleDirectorySuggestions() {
    const suggestions = await this.getCachedPeopleDirectorySuggestions();
    if (!suggestions.length) {
      new obsidian.Notice("当前没有待确认的人员建议");
      return false;
    }
    new PeopleDirectorySuggestionModal(this.app, this, null, suggestions, {
      fromCache: true,
      cachedCount: suggestions.length,
    }).open();
    return true;
  }

  async openIgnoredPeopleDirectorySuggestions() {
    const records = normalizePeopleSuggestionIgnores(this.settings.peopleSuggestionIgnores);
    if (!records.length) {
      new obsidian.Notice("当前没有已忽略的人员建议");
      return false;
    }
    const people = await loadPeopleDirectory(this);
    const suggestions = records
      .map(record => peopleSuggestionIgnoreRecordToSuggestion(record))
      .filter(Boolean)
      .map(item => {
        item.match = findMatchingPersonEntry(people, item);
        item.matchPath = (item.match && item.match.path) || item.matchPath || "";
        return item;
      });
    if (!suggestions.length) {
      new obsidian.Notice("已忽略列表里没有可编辑的人员建议");
      return false;
    }
    new PeopleDirectorySuggestionModal(this.app, this, null, suggestions, {
      fromIgnored: true,
      ignoredCount: records.length,
    }).open();
    return true;
  }

  async extractVocabularyFromLibrary() {
    if (!this.settings.llmApiKey && !isLocalLlmEndpoint(this.settings.llmEndpoint)) {
      new obsidian.Notice("请先配置大模型服务");
      return { processed: 0, added: 0, failed: 0, remaining: 0 };
    }
    const all = this.getKnowledgeExtractionSourceFiles("vocabulary");
    const batch = all.slice(0, KNOWLEDGE_EXTRACTION_BATCH_LIMIT);
    if (!batch.length) {
      new obsidian.Notice("没有需要扫描的新纪要。修改过的纪要会自动重新进入扫描。");
      return { processed: 0, added: 0, failed: 0, remaining: 0 };
    }
    new obsidian.Notice(`LexVoice：正在扫描 ${batch.length} 篇纪要提取词汇…`);
    let processed = 0;
    let added = 0;
    let failed = 0;
    for (const file of batch) {
      try {
        const markdown = await this.app.vault.cachedRead(file);
        const terms = await this.extractVocabularyFromMarkdown(file, markdown);
        added += terms.length;
        processed++;
        this.markKnowledgeExtractionSource("vocabulary", file);
      } catch (e) {
        failed++;
        console.error("[LexVoice] library vocabulary extraction failed", file && file.path, e);
      }
    }
    await this.saveSettings();
    return { processed, added, failed, remaining: Math.max(0, all.length - batch.length) };
  }

  async suggestPeopleDirectoryFromLibrary() {
    const cached = await this.getCachedPeopleDirectorySuggestions();
    if (cached.length) {
      new PeopleDirectorySuggestionModal(this.app, this, null, cached, {
        fromCache: true,
        cachedCount: cached.length,
      }).open();
      return;
    }
    if (!this.settings.llmApiKey && !isLocalLlmEndpoint(this.settings.llmEndpoint)) {
      new obsidian.Notice("请先配置大模型服务");
      return;
    }
    const all = this.getKnowledgeExtractionSourceFiles("people");
    const batch = all.slice(0, KNOWLEDGE_EXTRACTION_BATCH_LIMIT);
    if (!batch.length) {
      new obsidian.Notice("没有需要扫描的新纪要。修改过的纪要会自动重新进入扫描。");
      return;
    }
    new obsidian.Notice(`LexVoice：正在扫描 ${batch.length} 篇纪要提取人员信息…`);
    try {
      let cachedCount = 0;
      let processed = 0;
      let failed = 0;
      for (const file of batch) {
        try {
          const markdown = await this.app.vault.cachedRead(file);
          const items = await generatePeopleDirectorySuggestions(this, file, markdown);
          cachedCount += this.cachePeopleDirectorySuggestions(file, items);
          this.markKnowledgeExtractionSource("people", file);
          processed++;
        } catch (e) {
          failed++;
          console.error("[LexVoice] library people extraction failed", file && file.path, e);
        }
      }
      await this.saveSettings();
      const suggestions = await this.getCachedPeopleDirectorySuggestions();
      if (!suggestions.length) {
        const suffix = failed ? `，失败 ${failed}` : "";
        new obsidian.Notice(`没有新的人员建议（已忽略的建议不会重复显示）${suffix}`);
        return;
      }
      if (failed) new obsidian.Notice(`人员扫描完成，${failed} 篇读取或提取失败，可稍后重试。`, 8000);
      const modal = new PeopleDirectorySuggestionModal(this.app, this, null, suggestions, {
        scannedCount: processed,
        cachedCount,
        remainingCount: Math.max(0, all.length - batch.length),
      });
      modal.open();
    } catch (e) {
      console.error("[LexVoice] suggest people directory failed", e);
      new obsidian.Notice(`人员信息提取失败：${(e && e.message) || e}`, 8000);
    }
  }

  async ignorePeopleDirectorySuggestion(suggestion) {
    const ok = addPeopleSuggestionIgnore(this.settings, suggestion);
    if (ok) {
      this.removeCachedPeopleSuggestions([suggestion]);
      await this.saveSettings();
    }
    return ok;
  }

  removePeopleDirectorySuggestionIgnores(suggestions) {
    return removePeopleSuggestionIgnores(this.settings, suggestions);
  }

  async restoreIgnoredPeopleDirectorySuggestion(suggestion) {
    const removed = this.removePeopleDirectorySuggestionIgnores([suggestion]);
    if (!removed) return 0;
    const sourceFile = suggestion && suggestion.sourcePath
      ? this.app.vault.getAbstractFileByPath(obsidian.normalizePath(suggestion.sourcePath))
      : null;
    this.cachePeopleDirectorySuggestions(sourceFile instanceof obsidian.TFile ? sourceFile : null, [suggestion]);
    await this.saveSettings();
    return removed;
  }

  async updateSourceNoteRelatedPeopleLinks(sourceFile, personFiles) {
    if (!(sourceFile instanceof obsidian.TFile) || !personFiles || !personFiles.length) return false;
    const content = await this.app.vault.read(sourceFile);
    const fm = await readFileFrontmatter(this, sourceFile) || {};
    const next = upsertFrontmatterInMarkdown(content, mergeSourceNoteRelatedPeopleFrontmatter(fm, personFiles));
    if (next !== content) {
      await this.app.vault.modify(sourceFile, next);
      return true;
    }
    return false;
  }

  async resolvePeopleDirectorySuggestionTargets(suggestions) {
    const folder = obsidian.normalizePath(this.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
    let existingPeople = [];
    try {
      existingPeople = await loadPeopleDirectory(this, { force: true });
    } catch (e) {
      console.warn("[LexVoice] load people directory before resolving suggestions failed", e);
    }
    const getPersonFileByPath = (path) => {
      const normalized = obsidian.normalizePath(path || "");
      if (!normalized) return null;
      const file = this.app.vault.getAbstractFileByPath(normalized);
      return file instanceof obsidian.TFile ? file : null;
    };
    const getExactPersonFileByName = (name) => {
      const safeName = sanitizeFilename(name) || "";
      if (!folder || !safeName) return null;
      return getPersonFileByPath(obsidian.normalizePath(`${folder}/${safeName}.md`));
    };
    const normalizeForApply = (raw) => {
      const suggestion = normalizePeopleSuggestion(raw);
      if (!suggestion) return null;
      suggestion.matchPath = raw.matchPath || (raw.match && raw.match.path) || "";
      suggestion.sourcePath = raw.sourcePath || "";
      suggestion.sourceBasename = raw.sourceBasename || "";
      suggestion.cacheKey = raw.cacheKey || "";
      suggestion.ignoreKey = raw.ignoreKey || "";
      suggestion.ignoreTerms = raw.ignoreTerms || [];
      return suggestion;
    };
    const resolvePath = (suggestion) => {
      const manual = getPersonFileByPath(suggestion && suggestion.matchPath || "");
      if (manual) return obsidian.normalizePath(manual.path);
      const exact = getExactPersonFileByName(suggestion && suggestion.name);
      if (exact) return obsidian.normalizePath(exact.path);
      const match = findMatchingPersonEntry(existingPeople, suggestion);
      return obsidian.normalizePath(match && match.path || "");
    };
    const groups = [];
    for (const raw of suggestions || []) {
      const suggestion = normalizeForApply(raw);
      if (!suggestion) continue;
      const targetPath = resolvePath(suggestion);
      let group = targetPath ? groups.find(item => item.targetPath === targetPath) : null;
      if (!group) group = groups.find(item => arePeopleSuggestionsRelated(item.suggestion, suggestion));
      if (group) {
        group.suggestion = mergePeopleSuggestions(group.suggestion, suggestion);
        if (targetPath && !group.targetPath) group.targetPath = targetPath;
      } else {
        groups.push({ targetPath, suggestion });
      }
    }
    return groups.map(group => Object.assign({}, group.suggestion, {
      matchPath: group.targetPath || group.suggestion.matchPath || "",
    }));
  }

  async applyPeopleDirectorySuggestions(sourceFile, suggestions) {
    await this.ensurePeopleDirectoryFiles({ overwrite: false });
    let created = 0;
    let updated = 0;
    const linkedPeopleRecords = [];
    const entries = [];
    for (const raw of await this.resolvePeopleDirectorySuggestionTargets(suggestions)) {
      const suggestion = normalizePeopleSuggestion(raw);
      if (!suggestion) continue;
      suggestion.matchPath = raw.matchPath || (raw.match && raw.match.path) || "";
      const matchPath = obsidian.normalizePath(suggestion.matchPath || "");
      let file = matchPath ? this.app.vault.getAbstractFileByPath(matchPath) : null;
      if (file instanceof obsidian.TFile) {
        const content = await this.app.vault.read(file);
        const fm = await readFileFrontmatter(this, file) || {};
        const body = ensurePeopleNoteRelatedBaseSection(content, this.settings.mdFolder);
        await this.app.vault.modify(file, upsertFrontmatterInMarkdown(body, mergePersonFrontmatter(fm, suggestion, sourceFile)));
        linkedPeopleRecords.push({ file, relation: suggestion.relation || "mentioned" });
        entries.push({ file, path: file.path, created: false, previousContent: content, kind: "person" });
        updated++;
      } else {
        const folder = obsidian.normalizePath(this.settings.peopleDirectoryFolder || DEFAULT_SETTINGS.peopleDirectoryFolder);
        if (folder) await this.ensureFolder(folder);
        const safeName = sanitizeFilename(suggestion.name) || "未命名人员";
        const path = this.getAvailableVaultPath(obsidian.normalizePath(`${folder}/${safeName}.md`));
        if (!path) throw new Error("无法创建人员信息文件");
        const fm = mergePersonFrontmatter({ "姓名": suggestion.name }, suggestion, sourceFile);
        const body = formatPeopleNoteMarkdown(suggestion.name, this.settings.mdFolder);
        file = await this.app.vault.create(path, upsertFrontmatterInMarkdown(body, fm));
        linkedPeopleRecords.push({ file, relation: suggestion.relation || "mentioned" });
        entries.push({ file, path: file.path, created: true, previousContent: "", kind: "person" });
        created++;
      }
    }
    if (linkedPeopleRecords.length) {
      await this.updateSourceNoteRelatedPeopleLinks(sourceFile, linkedPeopleRecords);
      this.invalidatePeopleDirectoryCache();
    }
    return { created, updated, entries };
  }

  // 旧入口保留：把历史批量生成结果转成新的自定义提示词，避免覆盖内置提示词
  async applyIndustryPrompts(prompts) {
    const created = [];
    const visible = getBuiltInVisiblePolishModeKeys(this.settings);
    for (const mode of visible) {
      const text = prompts && prompts[mode];
      if (!text) continue;
      try {
        const tpl = await this.createIndustryPromptVariant(mode, text);
        created.push(tpl);
      } catch (e) {
        console.error("[LexVoice] createIndustryPromptVariant failed", mode, e);
      }
    }
    return created;
  }

  async polishEditor(editor) {
    const sel = editor.getSelection();
    const raw = sel || editor.getValue();
    if (!raw || !raw.trim()) { new obsidian.Notice("没有可润色的内容"); return; }
    new obsidian.Notice("AI 润色中…");
    try {
      const mode = getEffectivePolishMode(this.settings, this.settings.polishMode === "off" ? "meeting" : this.settings.polishMode);
      const ctx = mode === "recruit" ? this.settings.recruitContext : null;
      const polished = await polishTranscript(this, raw, mode, ctx);
      if (sel) editor.replaceSelection(polished); else editor.setValue(polished);
      new obsidian.Notice("润色完成");
    } catch (e) {
      console.error(e);
      new obsidian.Notice(`润色失败：${(e && e.message) || e}`);
    }
  }

  // 从 .md 文件的 frontmatter 推断模式（mode 字段；找不到时尝试 类型 字段中文映射）
  detectModeFromMarkdown(file) {
    if (!(file instanceof obsidian.TFile)) return null;
    const cache = (this.app.metadataCache.getFileCache(file) || {}).frontmatter;
    if (!cache) {
      const fallbackMode = detectRecentModeFromFilename(this.settings, file.basename);
      return fallbackMode && fallbackMode !== "off" ? fallbackMode : null;
    }
    const m = cache.mode;
    if (typeof m === "string" && isKnownPolishMode(this.settings, m)) return m;
    const typeStr = String(cache["类型"] || cache.type || "").trim();
    const typeToMode = {
      "学习": "learning",
      "学习记录": "learning",
      "学习视频": "learning",
      "视频学习": "learning",
      "课程笔记": "learning",
      "访谈": "interview",
      "访谈调研": "interview",
      "研讨": "seminar",
      "研讨会": "seminar",
      "学术研讨": "seminar",
      "主题沙龙": "seminar",
      "会议": "meeting",
      "工作纪要": "meeting",
      "小会": "huddle",
      "讨论": "huddle",
      "圆桌讨论": "huddle",
      "独白": "monologue",
      "手记": "monologue",
      "个人笔记": "monologue",
      "招聘面试": "recruit",
      "招聘评估": "recruit",
      "面试": "recruit",
    };
    if (typeToMode[typeStr]) {
      const mode = typeToMode[typeStr];
      if (mode === "recruit" && !isRecruitFeatureUnlocked(this.settings)) return null;
      return mode;
    }
    const fallbackMode = detectRecentModeFromFilename(this.settings, file.basename);
    return fallbackMode && fallbackMode !== "off" ? fallbackMode : null;
  }

  findPreviousRecentNoteFile(file) {
    if (!(file instanceof obsidian.TFile)) return null;
    const currentPath = obsidian.normalizePath(file.path);
    const recents = getRecentNotes(this, 240);
    const current = recents.find((item) => item && item.file && obsidian.normalizePath(item.file.path) === currentPath);
    if (!current) return null;
    const older = recents
      .filter((item) => item && item.file && obsidian.normalizePath(item.file.path) !== currentPath && item.timestamp < current.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    return older && older.file instanceof obsidian.TFile ? older.file : null;
  }

  async readMergeSourceFromMarkdown(file, offsetMs, startIndex) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") {
      throw new Error("只能合并 LexVoice Markdown 纪要");
    }
    const content = await this.app.vault.read(file);
    const rawSegments = extractLexVoiceTranscriptSegments(content);
    if (!rawSegments.length) {
      throw new Error(`「${file.basename}」没有找到原始转写分段`);
    }
    const frontmatter = ((this.app.metadataCache.getFileCache(file) || {}).frontmatter) || {};
    const rawDurationMs = getLexVoiceSegmentsDurationMs(rawSegments) || getLexVoiceDurationMs(content);
    const segments = normalizeSegmentsForMergedNote(rawSegments, offsetMs, startIndex, file);
    if (segments.length) {
      segments[0] = Object.assign({}, segments[0], {
        text: `【来源纪要：${file.basename}】\n${segments[0].text || ""}`.trim(),
      });
    }
    return {
      file,
      content,
      frontmatter,
      mode: this.detectModeFromMarkdown(file),
      startedAt: inferLexVoiceNoteStartedAtIso(file, frontmatter),
      rawDurationMs,
      segments,
    };
  }

  async mergeMarkdownFileWithPrevious(file) {
    if (!(file instanceof obsidian.TFile)) return;
    const previous = this.findPreviousRecentNoteFile(file);
    if (!(previous instanceof obsidian.TFile)) {
      new obsidian.Notice("没有找到这篇之前的最近一条 LexVoice 纪要。", 6000);
      return;
    }
    const ok = await lexvoiceConfirm(this.app, "合并纪要", `将生成一篇新的合并纪要，源文件会保留。\n\n来源：\n1. ${previous.basename}\n2. ${file.basename}\n\n继续合并？`, "合并");
    if (!ok) return;
    try {
      await this.mergeMarkdownFilesAsNew([previous, file]);
    } catch (e) {
      console.error("[LexVoice] merge notes failed", e);
      new obsidian.Notice(`合并纪要失败：${(e && e.message) || e}`, 8000);
    }
  }

  async mergeMarkdownFilesAsNew(files) {
    const sources = [];
    let offsetMs = 0;
    let startIndex = 0;
    for (const file of files || []) {
      const source = await this.readMergeSourceFromMarkdown(file, offsetMs, startIndex);
      sources.push(source);
      offsetMs += Math.max(0, Number(source.rawDurationMs) || 0);
      startIndex += source.segments.length;
    }
    if (sources.length < 2) {
      new obsidian.Notice("至少需要两篇纪要才能合并。");
      return;
    }
    const segments = sources.flatMap((source) => source.segments);
    if (!segments.length) {
      new obsidian.Notice("没有找到可合并的原始转写。", 8000);
      return;
    }
    const mode = sources[sources.length - 1].mode || sources[0].mode || getEffectivePolishMode(this.settings, this.settings.polishMode);
    if (mode === "recruit" && !isRecruitFeatureUnlocked(this.settings)) {
      new obsidian.Notice("招聘评估模式尚未启用，无法合并为招聘评估纪要。", 8000);
      return;
    }
    await this.ensureFolder(this.settings.mdFolder);
    const moment = window.moment;
    const startedAtIso = sources[0].startedAt || new Date().toISOString();
    const startedAt = moment ? moment(startedAtIso) : null;
    const stamp = startedAt && startedAt.isValid && startedAt.isValid()
      ? startedAt.format(this.settings.noteFileNameFormatNew)
      : (moment ? moment().format(this.settings.noteFileNameFormatNew) : "合并纪要");
    const targetPath = this.getAvailableMarkdownPath(obsidian.normalizePath(`${this.settings.mdFolder}/${stamp} · 合并.md`));
    if (!targetPath) throw new Error("无法生成合并纪要路径");

    new obsidian.Notice(`LexVoice：正在合并 ${sources.length} 篇纪要…`, 8000);
    await this.app.vault.create(targetPath, "");
    const session = {
      id: genId(),
      sessionStamp: moment ? moment().format("YYYYMMDD-HHmmss") : String(Date.now()),
      mdPath: targetPath,
      mode,
      startedAt: startedAtIso,
      source: "merged-notes",
      segments,
      multiSourceAudio: true,
      meetingWorkbench: { notes: "", draft: "", materials: [], entries: [] },
      mergedSources: sources.map((source) => ({
        path: source.file.path,
        title: source.file.basename,
        durationMs: source.rawDurationMs,
      })),
    };
    const lastSeg = segments[segments.length - 1];
    const sessionMeta = {
      startedAt: session.startedAt,
      duration: lastSeg ? formatElapsed(lastSeg.endOffsetMs || 0) : "",
      source: "merged-notes",
      meetingWorkbench: normalizeMeetingWorkbench(session.meetingWorkbench),
    };
    const polished = await mergeAndPolish(this, segments.map((s) => ({
      index: s.index,
      startOffsetMs: s.startOffsetMs,
      endOffsetMs: s.endOffsetMs,
      text: s.text,
      audioName: s.audioName,
      audioStartOffsetMs: s.audioStartOffsetMs,
      audioEndOffsetMs: s.audioEndOffsetMs,
      sourceName: s.sourceName,
      sourcePath: s.sourcePath,
      rawText: s.rawText,
    })), mode, null, sessionMeta);
    await this.rewriteConsolidated(session, polished);
    let finalFile = this.app.vault.getAbstractFileByPath(session.mdPath);
    const renamed = await this.renameMarkdownWithGeneratedTitle(session.mdPath, polished, mode);
    if (renamed instanceof obsidian.TFile) {
      session.mdPath = renamed.path;
      finalFile = renamed;
    }
    if (finalFile instanceof obsidian.TFile) {
      await this.appendMergeMetadataBlock(finalFile, session.mergedSources);
      try { await this.app.workspace.getLeaf(false).openFile(finalFile); } catch { /* intentionally empty */ }
    }
    try { await this.appendDailyMeetingOverview(session, polished); }
    catch (e) { console.error("[LexVoice] daily overview after merge notes failed", e); }
    new obsidian.Notice(`已生成合并纪要：${finalFile instanceof obsidian.TFile ? finalFile.basename : "合并纪要"}`);
  }

  async appendMergeMetadataBlock(file, sources) {
    if (!(file instanceof obsidian.TFile)) return;
    const payload = {
      mergedAt: new Date().toISOString(),
      sources: (sources || []).map((source) => ({
        path: source.path || "",
        title: source.title || "",
        durationMs: Number(source.durationMs) || 0,
      })),
    };
    const block = `<!-- lexvoice-merge\n${JSON.stringify(payload, null, 2)}\nlexvoice-merge-end -->`;
    const cur = await this.app.vault.read(file);
    if (/<!--\s*lexvoice-merge[\s\S]*?lexvoice-merge-end\s*-->/.test(cur)) {
      await this.app.vault.modify(file, cur.replace(/<!--\s*lexvoice-merge[\s\S]*?lexvoice-merge-end\s*-->/, block));
    } else {
      await this.app.vault.modify(file, cur.replace(/\s*$/, "\n\n" + block + "\n"));
    }
  }

  async repolishMarkdownFile(file, mode, repolishOptions = null) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return;
    if (mode === "recruit" && !isRecruitFeatureUnlocked(this.settings)) {
      new obsidian.Notice("该扩展模式尚未启用");
      return;
    }
    const meta = getModeMeta(this.settings, mode);
    try {
      const content = await this.app.vault.read(file);
      let segments = extractLexVoiceTranscriptSegments(content);
      if (!segments.length) {
        new obsidian.Notice("未找到 LexVoice 原始转写。请在包含「分段原始转写」或录音段落的纪要 Markdown 上使用。", 8000);
        return;
      }

      // 从 frontmatter 解析角色映射（"代号 → 真名" 形式的条目）
      const fmCache = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || null;
      const roleMapping = extractRoleMappingFromFrontmatter(fmCache);
      if (roleMapping.length) {
        segments = applyRoleMappingToSegments(segments, roleMapping);
      }

      // 从 frontmatter 取插件已注入的 time，作为 sessionMeta（避免 LLM 重新推断，保持时间不变）
      let sessionMeta = null;
      if (fmCache) {
        const fullTimeStr = fmCache.time || "";
        const durationStr = fmCache["时长"] || fmCache.duration || "";
        if (fullTimeStr) {
          const m = window.moment ? window.moment(fullTimeStr, [window.moment.ISO_8601, "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD HH:mm:ss"], true) : null;
          if (m && m.isValid && m.isValid()) {
            sessionMeta = { startedAt: m.toDate().toISOString(), duration: String(durationStr || "").trim() };
          }
        } else {
          // 兼容旧笔记：早期版本可能写入"日期"和"时间"两个字段；重新整理后会迁移为 time。
          const dateStr = fmCache["日期"] || fmCache.date || "";
          const timeStr = fmCache["时间"] || "";
          if (dateStr) {
            const composed = String(dateStr).trim() + (timeStr ? "T" + String(timeStr).trim() : "");
            const m = window.moment ? window.moment(composed, ["YYYY-MM-DDTHH:mm", "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss"], true) : null;
            if (m && m.isValid && m.isValid()) {
              sessionMeta = { startedAt: m.toDate().toISOString(), duration: String(durationStr || "").trim() };
            }
          }
        }
      }

      let recruitContext = null;
      if (mode === "recruit") {
        const result = await new Promise((resolve) => {
          const modal = new RecruitContextModal(this.app, this, {
            flow: "repolish",
            onConfirm: (action, ctx) => resolve({ action, ctx }),
          });
          modal.open();
        });
        if (result.action === "cancel") return;
        recruitContext = result.action === "skip" ? null : result.ctx;
      }

      const preferenceLabel = repolishOptions && repolishOptions.label ? ` · ${repolishOptions.label}` : "";
      const mapNotice = roleMapping.length
        ? `LexVoice：应用 ${roleMapping.length} 条角色映射后按${meta.prefix}模式重新整理${preferenceLabel}…`
        : `LexVoice：正在按${meta.prefix}模式重新整理${preferenceLabel}…`;
      new obsidian.Notice(mapNotice);
      // 把笔记原 frontmatter 传给 mergeAndPolish，post-process 阶段会作为 base 保留用户改动
      // （包括用户已应用的角色映射变更，仅 system 字段被覆盖、tags 被 merge）
      const originalFmForRegen = fmCache ? Object.assign({}, fmCache) : null;
      // 在 originalFm 里应用角色映射的"压平"，避免 base 里仍然带 → 形式
      if (originalFmForRegen && roleMapping.length) {
        for (const f of ROLE_MAPPING_FIELDS) {
          const v = originalFmForRegen[f];
          if (Array.isArray(v)) {
            originalFmForRegen[f] = v.map(item => {
              const m = parseRoleMapItem(item);
              return m ? m.to : item;
            });
          } else if (typeof v === "string") {
            const m = parseRoleMapItem(v);
            if (m) originalFmForRegen[f] = m.to;
          }
        }
      }
      this._busyLabel = `重新整理中（${meta.prefix}）…`;
      this.updateBusyStatus();
      this.beginTaskMeter();
      const polished = await mergeAndPolish(this, segments, mode, recruitContext, sessionMeta, originalFmForRegen, repolishOptions);

      // 重整完成后，把 frontmatter 里的"代号 → 真名"项压平为"真名"，让 yaml 干净
      let finalContent = await this.app.vault.read(file);
      if (roleMapping.length) {
        const fmMatch = finalContent.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const cleaned = rewriteFrontmatterRoleMappings(fmMatch[1], roleMapping);
          if (cleaned !== fmMatch[1]) {
            finalContent = "---\n" + cleaned + "\n---" + finalContent.slice(fmMatch[0].length);
            await this.app.vault.modify(file, finalContent);
          }
        }
      }

      await this.appendRepolishBlock(file, polished, mode, segments);
      let dailyTargetFile = file;
      const renamed = await this.renameMarkdownWithGeneratedTitle(file, polished, mode);
      if (renamed instanceof obsidian.TFile) dailyTargetFile = renamed;
      try {
        const dailyContent = await this.app.vault.read(dailyTargetFile);
        await this.appendDailyMeetingOverviewForMarkdown(dailyTargetFile, dailyContent, polished, mode, segments, sessionMeta);
      } catch (e) {
        console.error("[LexVoice] daily overview after repolish failed", e);
      }
      new obsidian.Notice(`LexVoice：已生成${meta.prefix}模式纪要${preferenceLabel}${roleMapping.length ? `（角色映射 ${roleMapping.length} 条已应用）` : ""}`);
      try { this.logCompletedWork(`重新整理完成 · ${meta.prefix}`, (file && file.path) || "", this.endTaskMeter()); } catch { /* intentionally empty */ }
    } catch (e) {
      console.error("[LexVoice] repolish markdown failed", e);
      new obsidian.Notice(`重新整理失败：${(e && e.message) || e}`, 8000);
    } finally {
      this._busyLabel = null;
      this.updateBusyStatus();
    }
  }

  async appendRepolishBlock(file, polished, mode, segments) {
    const meta = getModeMeta(this.settings, mode);
    const stamp = window.moment ? window.moment().format("YYYY-MM-DD HH:mm:ss") : new Date().toISOString();
    const cur = await this.app.vault.read(file);

    // 关键：从全文里把所有原始 / 元数据块（任意深度）抽出来，避免再次嵌套。
    // 旧实现只识别 "## 📁 原始材料"，对 appendPolishBlock 产出的
    // "## ✨ 整合版 + ‹details›录音信息/原始音频/录音中实时大纲/回听时间轴" 结构识别不到，
    // 导致每次重新整理都把整个旧文件包进新的 ‹details›上一版纪要›，重复存放段落和元数据。
    const { tail: rawTail, withoutRaw } = extractAllRawBlocksFromText(cur);
    const beforeParts = splitLeadingFrontmatter(withoutRaw);
    const beforeBody = beforeParts.body.replace(/^\n+/, "");
    const polishedParts = splitLeadingFrontmatter(stripModeSuggestionBlocks(polished || "_[无输出]_").trim());
    const polishedFrontmatter = polishedParts.frontmatter ? polishedParts.frontmatter.trimEnd() : "";
    const polishedBody = polishedParts.body.trim() || "_[无输出]_";

    const titleMatch = beforeBody.match(/^#\s+[^\n]+\n*/);
    const titleBlock = titleMatch ? titleMatch[0].replace(/\n*$/, "\n") : "";
    let previousBody = titleMatch ? beforeBody.slice(titleMatch[0].length) : beforeBody;
    previousBody = previousBody
      .replace(/\s*---\s*$/m, "")
      .replace(/\s+$/, "")
      .trim();

    const currentBlock = [
      polishedFrontmatter || beforeParts.frontmatter.trimEnd() || null,
      (polishedFrontmatter || beforeParts.frontmatter) ? "" : null,
      titleBlock ? titleBlock.trimEnd() : null,
      titleBlock ? "" : null,
      `## 当前纪要（${meta.prefix} · ${stamp}）`,
      "",
      `> [!info] 基于本文底部的原始转写重新生成 · 段数：${segments.length} · 模型：${this.settings.llmModel}`,
      "",
      polishedBody,
      "",
      "---",
      "",
      "<details>",
      `<summary>上一版纪要（重新整理前 · ${stamp}）</summary>`,
      "",
      previousBody || "_（上一版为空）_",
      "",
      "</details>",
      "",
      rawTail ? rawTail.trimEnd() : "",
      "",
    ].filter(v => v !== null).join("\n");

    await this.app.vault.modify(file, currentBlock.replace(/\n{4,}/g, "\n\n\n"));
  }

  // 生成清稿（派生版本·只读快照）：从母本逐字稿忠实清理成可读稿，写成独立文件、双链回指母本。
  // 永远从母本 raw 读（在派生上触发会先跳回母本）；清稿不含 raw、不参与「重新整理」回写。
  async generateCleanScript(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return;
    try {
      // 在派生文件上触发 → 先跳回母本（派生 contains_raw:false，本身没有 raw 可读）。
      let sourceFile = file;
      let content = await this.app.vault.read(file);
      const fm = ((this.app.metadataCache.getFileCache(file) || {}).frontmatter) || {};
      if (fm["类型"] === "LexVoice派生版本" || fm.contains_raw === false) {
        const srcPath = fm.source_path ? obsidian.normalizePath(String(fm.source_path)) : "";
        const resolved = srcPath ? this.app.vault.getAbstractFileByPath(srcPath) : null;
        if (resolved instanceof obsidian.TFile) {
          sourceFile = resolved;
          content = await this.app.vault.read(resolved);
        } else {
          new obsidian.Notice("这是派生版本，且找不到母本（source_path 失效）。请在录音母本笔记上生成清稿。", 8000);
          return;
        }
      }
      const segments = extractLexVoiceTranscriptSegments(content);
      if (!segments.length) {
        new obsidian.Notice("未找到原始转写（逐字稿）。请在含「分段原始转写」的录音母本上生成清稿。", 8000);
        return;
      }
      const baseTitle = sourceFile.basename;
      const cleanName = sanitizeFilename(`清稿-${baseTitle}`) || "清稿";
      const folder = sourceFile.parent && sourceFile.parent.path && sourceFile.parent.path !== "/" ? sourceFile.parent.path + "/" : "";
      const targetPath = obsidian.normalizePath(folder + cleanName + ".md");
      const existing = this.app.vault.getAbstractFileByPath(targetPath);
      if (existing instanceof obsidian.TFile) {
        const ok = await lexvoiceConfirm(this.app, "清稿已存在", `「${cleanName}」已存在，重新生成会覆盖它（清稿是母本的只读派生，要改请改母本而非清稿）。继续？`, "覆盖生成");
        if (!ok) return;
      }
      this._busyLabel = "清稿生成中…";
      this.updateBusyStatus();
      new obsidian.Notice("LexVoice：正在从母本逐字稿生成清稿…");
      this.beginTaskMeter();
      const { text: cleaned, truncated } = await cleanTranscript(this, segments, getLlmOutputCeiling(this.settings));
      if (!cleaned) { new obsidian.Notice("清稿生成失败：模型无输出", 8000); return; }
      const sidMatch = content.match(/<!--\s*lexvoice-session:\s*([^\s>]+)\s*-->/);
      const sourceId = sidMatch ? sidMatch[1] : "";
      const stamp = window.moment ? window.moment().format("YYYY-MM-DD HH:mm:ss") : new Date().toISOString();
      const warn = truncated
        ? "> [!warning] 清稿可能被截断：部分内容或因模型输出上限未完整。建议换更大输出上限的模型后重新生成。\n\n"
        : "";
      const fmLines = [
        "---",
        "类型: LexVoice派生版本",
        "variant_kind: clean",
        "variant_label: 清稿",
        `source_note: "[[${baseTitle}]]"`,
        `source_path: "${sourceFile.path}"`,
        `source_id: "${sourceId}"`,
        "contains_raw: false",
        `created: ${stamp}`,
        "---",
      ].join("\n");
      const noteBody = `${fmLines}\n\n# 清稿 · ${baseTitle}\n\n> [!note] 从母本逐字稿忠实清理的可读稿（非纪要、不摘要）。母本（事实源 / 逐字稿）：[[${baseTitle}]]\n\n${warn}${cleaned}\n`;
      let outFile;
      if (existing instanceof obsidian.TFile) {
        await this.app.vault.modify(existing, noteBody);
        outFile = existing;
      } else {
        outFile = await this.app.vault.create(targetPath, noteBody);
      }
      new obsidian.Notice(`LexVoice：清稿已生成 → ${cleanName}`, 6000);
      try { this.logCompletedWork("生成清稿", (outFile && outFile.path) || "", this.endTaskMeter()); } catch { /* intentionally empty */ }
      try { await this.app.workspace.getLeaf(false).openFile(outFile); } catch { /* intentionally empty */ }
    } catch (e) {
      console.error("[LexVoice] generate clean script failed", e);
      new obsidian.Notice(`清稿生成失败：${(e && e.message) || e}`, 8000);
    } finally {
      this._busyLabel = null;
      this.updateBusyStatus();
    }
  }

  async handleInboxFile(file) {
    if (!(file instanceof obsidian.TFile)) return;
    if (!AUDIO_EXT.has((file.extension || "").toLowerCase())) return;
    const inbox = this.settings.inboxFolder;
    if (!inbox) return;
    const inboxNorm = obsidian.normalizePath(inbox);
    if (!file.path.startsWith(inboxNorm + "/") && file.path !== inboxNorm) return;
    const archiveSub = this.settings.inboxArchiveSubfolder || "";
    if (archiveSub && file.path.startsWith(`${inboxNorm}/${archiveSub}/`)) return;
    // 坚果云 / Dropbox / OneDrive 同步冲突文件检测：跳过自动处理，提醒用户解冲突
    if (isSyncConflictName(file.name)) {
      this._inboxConflictNotified = this._inboxConflictNotified || new Set();
      if (!this._inboxConflictNotified.has(file.path)) {
        this._inboxConflictNotified.add(file.path);
        new obsidian.Notice(`同步冲突文件已跳过：${file.name}\n请手动解决冲突后再处理。`, 8000);
        console.warn("[LexVoice] skipped sync conflict file:", file.path);
      }
      return;
    }
    if (!this.settings.inboxAutoImport) return;

    this._inboxRecent = this._inboxRecent || new Map();
    if (this._inboxRecent.has(file.path)) return;
    this._inboxRecent.set(file.path, Date.now());

    // 显式判断而非 || 3000：让"填 0 = 立即处理"真正生效（0 是合法值，|| 会把它吞成 3000）
    const rawDelay = Number(this.settings.inboxStabilizeDelayMs);
    const delay = Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 3000;
    this._inboxLock = (this._inboxLock || Promise.resolve()).then(async () => {
      await new Promise((r) => window.setTimeout(r, delay));
      const fresh = this.app.vault.getAbstractFileByPath(file.path);
      if (!(fresh instanceof obsidian.TFile)) return;
      new obsidian.Notice(`收件箱新增音频：${file.name}，处理中…`);
      try {
        await this.importAudioFiles([file.path]);
        if (archiveSub) {
          const archivePath = obsidian.normalizePath(`${inboxNorm}/${archiveSub}/${file.name}`);
          await this.ensureFolder(`${inboxNorm}/${archiveSub}`);
          const stillExists = this.app.vault.getAbstractFileByPath(file.path);
          if (stillExists instanceof obsidian.TFile) {
            try { await this.app.fileManager.renameFile(stillExists, archivePath); }
            catch (e) { console.error("[LexVoice] archive rename failed", e); }
          }
        }
      } catch (e) {
        console.error("[LexVoice] inbox auto-import failed", e);
        new obsidian.Notice(`收件箱处理失败：${e.message || e}`);
      } finally {
        window.setTimeout(() => this._inboxRecent && this._inboxRecent.delete(file.path), 60000);
      }
    }).catch((e) => { console.error("[LexVoice] inbox queue error", e); });
  }

  async scanInboxFolder() {
    const inbox = this.settings.inboxFolder;
    if (!inbox) { new obsidian.Notice("未配置收件箱文件夹"); return; }
    const inboxNorm = obsidian.normalizePath(inbox);
    const folder = this.app.vault.getAbstractFileByPath(inboxNorm);
    if (!(folder instanceof obsidian.TFolder)) {
      new obsidian.Notice(`收件箱文件夹不存在：${inboxNorm}`);
      return;
    }
    const archiveSub = this.settings.inboxArchiveSubfolder || "";
    const allChildren = folder.children.filter((f) =>
      f instanceof obsidian.TFile
      && AUDIO_EXT.has((f.extension || "").toLowerCase())
      && (!archiveSub || !f.path.startsWith(`${inboxNorm}/${archiveSub}/`))
    );
    const conflicts = allChildren.filter(f => isSyncConflictName(f.name));
    const candidates = allChildren.filter(f => !isSyncConflictName(f.name));
    if (conflicts.length) new obsidian.Notice(`跳过 ${conflicts.length} 个同步冲突文件，请手动解决`, 8000);
    if (!candidates.length) { new obsidian.Notice("收件箱无未处理文件"); return; }
    new obsidian.Notice(`发现 ${candidates.length} 个未处理文件，开始排队…`);
    for (const f of candidates) await this.handleInboxFile(f);
  }

  async prepareImportTranscriptionChunks(file, blob, durationMs, sessionStamp, fileIndex) {
    const single = [{
      blob,
      mime: blob.type || mimeFromExt(file.extension),
      startOffsetMs: 0,
      endOffsetMs: Number(durationMs) || 0,
      retryAudioPath: file.path,
      retryAudioName: file.name,
      cleanupPath: "",
    }];
    const shouldChunk = shouldChunkImportedAudio(blob, durationMs);
    const shouldTranscode = shouldTranscodeImportedAudio(file, blob.type || mimeFromExt(file.extension));
    if (!shouldChunk && !shouldTranscode) return single;

    try {
      if (shouldChunk) new obsidian.Notice(`长音频已启用后台分块：${file.name}`);
      else if (shouldTranscode) new obsidian.Notice(`AAC 音频将先转为临时 WAV 再转写：${file.name}`);
      const audioBuffer = await decodeAudioBlob(blob);
      const totalMs = Math.max(1, Math.round(audioBuffer.duration * 1000));
      const chunks = [];
      const cacheFolder = this.getSegmentCacheFolder();
      await this.ensureFolder(cacheFolder);
      const safeBase = sanitizeFilename(file.basename || "audio") || "audio";
      if (!shouldChunk && shouldTranscode) {
        const chunkBlob = await renderAudioBufferSliceToWav(audioBuffer, 0, totalMs);
        const chunkName = `import-${sessionStamp}-${pad(fileIndex + 1)}-${safeBase}.wav`;
        const chunkPath = this.getAvailableVaultPath(obsidian.normalizePath(`${cacheFolder}/${chunkName}`));
        if (!chunkPath) throw new Error("无法生成 AAC 转写缓存路径");
        await this.app.vault.createBinary(chunkPath, await chunkBlob.arrayBuffer());
        return [{
          blob: chunkBlob,
          mime: "audio/wav",
          startOffsetMs: 0,
          endOffsetMs: totalMs,
          retryAudioPath: chunkPath,
          retryAudioName: chunkPath.split("/").pop() || chunkName,
          cleanupPath: chunkPath,
        }];
      }
      // MiMo 单块 base64 ≤10MB：5 分钟 16k WAV（base64 ≈12.8MB）必超限、会被二次解码再切——
      // 选 MiMo 时导入直接按其块长切，省一遍转码；其它服务保持 5 分钟（切点少、边界破词少）。
      let importChunkMs = IMPORT_LONG_AUDIO_CHUNK_MS;
      try { if (isApimimoAsrProvider(resolveTranscribeProvider(this))) importChunkMs = APIMIMO_ASR_CHUNK_MS; } catch { /* intentionally empty */ }
      let part = 0;
      for (let start = 0; start < totalMs; start += importChunkMs) {
        const end = Math.min(totalMs, start + importChunkMs);
        const chunkBlob = await renderAudioBufferSliceToWav(audioBuffer, start, end);
        const chunkName = `import-${sessionStamp}-${pad(fileIndex + 1)}-${pad(part + 1)}-${safeBase}.wav`;
        const chunkPath = this.getAvailableVaultPath(obsidian.normalizePath(`${cacheFolder}/${chunkName}`));
        if (!chunkPath) throw new Error("无法生成长音频分块缓存路径");
        await this.app.vault.createBinary(chunkPath, await chunkBlob.arrayBuffer());
        chunks.push({
          blob: chunkBlob,
          mime: "audio/wav",
          startOffsetMs: start,
          endOffsetMs: end,
          retryAudioPath: chunkPath,
          retryAudioName: chunkPath.split("/").pop() || chunkName,
          cleanupPath: chunkPath,
        });
        part++;
      }
      return chunks.length ? chunks : single;
    } catch (e) {
      console.error("[LexVoice] import chunking failed", e);
      await this.logDiagnostic("error", "import.chunking_failed", "导入长音频分块失败", {
        file: file.name,
        extension: file.extension,
        size: blob && blob.size,
        durationMs,
        shouldTranscode,
        error: diagnosticError(e),
      });
      new obsidian.Notice(`${shouldTranscode ? "AAC 转码" : "长音频分块"}失败，改用原文件转写：${(e && e.message) || e}`, 8000);
      return single;
    }
  }

  async importAudioFiles(paths, modeOverride) {
    if (!paths || !paths.length) return;
    paths.sort();
    const moment = window.moment;
    const startedAt = moment();
    const sessionStamp = startedAt.format("YYYYMMDD-HHmmss");
    const requestedMode = modeOverride && isKnownPolishMode(this.settings, modeOverride)
      ? modeOverride
      : (this.settings.polishMode || "meeting");
    const mode = getEffectivePolishMode(this.settings, requestedMode);
    const meta = getModeMeta(this.settings, mode);
    const mdName = `${startedAt.format(this.settings.noteFileNameFormatNew)} · 导入`;
    const mdPath = obsidian.normalizePath(`${this.settings.mdFolder}/${mdName}.md`);
    await this.ensureFolder(this.settings.mdFolder);

    // 招聘面试模式整合多文件音频时，也需要 recruit context；先弹 Modal 让用户确认
    let recruitContext = null;
    if (mode === "recruit") {
      const result = await new Promise((resolve) => {
        const modal = new RecruitContextModal(this.app, this, {
          flow: "import",
          onConfirm: (action, ctx) => resolve({ action, ctx }),
        });
        modal.open();
      });
      if (result.action === "cancel") {
        new obsidian.Notice("已取消导入");
        return;
      }
      if (result.action !== "skip") recruitContext = result.ctx;
    }
    const session = {
      id: genId(),
      sessionStamp,
      startedAt: startedAt.toDate().toISOString(),
      mdPath,
      mode: mode,
      source: "import",
      segments: [],
      realtimeOutline: "",
      realtimeOutlineState: { version: 1, nodes: [], memory: "" },
      realtimeOutlineMemory: "",
      realtimeOutlineSegmentCount: 0,
      realtimeOutlineWorkbenchSignature: "",
      finalized: false,
      recruitContext,
    };

    const header = [
      `# ${startedAt.format("YYYY-MM-DD HH:mm")} · ${meta.prefix}（导入处理中…）`,
      "",
      `> [!info] 导入信息`,
      `> 文件数：${paths.length} · 模式：${meta.prefix} · 模型：${this.settings.transcribeModel} → ${this.settings.llmModel}`,
      "",
      `<!-- lexvoice-session:${session.id} -->`,
      `<!-- lexvoice-segments-start:${session.id} -->`,
      `<!-- lexvoice-segments-end:${session.id} -->`,
      "",
    ].join("\n");
    await this.appendToNote(mdPath, header);

    new obsidian.Notice(`开始导入 ${paths.length} 个音频文件…`);
    this._importBusy = { done: 0, total: paths.length, mode };
    this.updateBusyStatus();

    let cumOffsetMs = 0;
    for (let i = 0; i < paths.length; i++) {
      const audioPath = paths[i];
      const file = this.app.vault.getAbstractFileByPath(audioPath);
      if (!(file instanceof obsidian.TFile)) {
        new obsidian.Notice(`跳过：${audioPath} 不存在`);
        continue;
      }
      this._importBusy = { done: i, total: paths.length, label: `导入转写 ${i + 1}/${paths.length}`, mode, file: file.name };
      this.updateBusyStatus();
      new obsidian.Notice(`转写中 ${i + 1}/${paths.length}：${file.name}`);

      let ab, blob, mime, durationMs;
      try {
        ab = await this.app.vault.readBinary(file);
        // 空文件（0 字节）：没有可转写的音频。明确提示并跳过——别把空 blob 送去 ASR，
        // 否则只会换来含糊的"Failed to fetch"/服务端错误，还会进重试队列反复失败。
        // 常见成因：录音/导出未完成、复制不完整、或云盘占位文件尚未下载到本地。
        if (!ab || ab.byteLength === 0) {
          new obsidian.Notice(`跳过：${file.name} 是空文件（0 字节），没有可转写的音频。请确认文件已完整下载 / 导出后再试。`, 9000);
          await this.logDiagnostic("warn", "import.empty_file", "导入音频为空文件", { audioName: file.name, size: 0 });
          continue;
        }
        mime = mimeFromExt(file.extension);
        blob = new Blob([ab], { type: mime });
        durationMs = await getAudioDurationMs(blob);
        if (paths.length === 1) {
          session.masterAudioName = file.name;
          session.masterAudioPath = audioPath;
        }
      } catch (e) {
        console.error(e);
        new obsidian.Notice(`读取失败：${file.name}`);
        continue;
      }

      const chunks = await this.prepareImportTranscriptionChunks(file, blob, durationMs, sessionStamp, i);
      const fileDurationMs = chunks.length
        ? Math.max(Number(durationMs) || 0, chunks[chunks.length - 1].endOffsetMs || 0)
        : (Number(durationMs) || 0);

      const asrConcurrency = normalizeAsrConcurrency(this.settings.asrConcurrency);
      if (chunks.length > 1 && asrConcurrency > 1) {
        new obsidian.Notice(`长音频分块转写：${chunks.length} 段，并发 ${asrConcurrency}`);
      }
      const baseSegIndex = session.segments.length;
      const chunkResults = await mapLimit(chunks, asrConcurrency, async (chunk, c) => {
        const startOffset = cumOffsetMs + (chunk.startOffsetMs || 0);
        const endOffset = cumOffsetMs + (chunk.endOffsetMs || 0);
        const isFinal = i === paths.length - 1 && c === chunks.length - 1;

        let text = ""; let err = null;
        try {
          text = await transcribeImportAudioChunk(this, chunk.blob, chunk.mime || mime, asrConcurrency);
          if (chunk.cleanupPath) await this.maybeDeleteSegmentCacheFile(chunk.cleanupPath);
        } catch (e) {
          err = e;
          console.error(e);
          await this.logDiagnostic("error", "asr.import_chunk_failed", "导入音频分块转写失败", {
            provider: this.settings.activeTranscribeProvider,
            model: ((this.settings.transcribeProviders || {})[this.settings.activeTranscribeProvider] || {}).model || this.settings.transcribeModel,
            audioName: file.name,
            chunkName: chunk.retryAudioName,
            mime: chunk.mime || mime,
            size: chunk.blob && chunk.blob.size,
            startOffsetMs: startOffset,
            endOffsetMs: endOffset,
            asrConcurrency,
            error: diagnosticError(e),
          });
        }
        return { chunk, startOffset, endOffset, isFinal, text, err };
      });

      for (let c = 0; c < chunkResults.length; c++) {
        const result = chunkResults[c];
        const chunk = result.chunk;
        const segIndex = baseSegIndex + c;
        session.segments.push({
          index: segIndex,
          startOffsetMs: result.startOffset,
          endOffsetMs: result.endOffset,
          audioName: file.name,
          audioPath,
          segmentAudioName: chunk.retryAudioName,
          segmentAudioPath: chunk.retryAudioPath,
          text: result.text,
          error: result.err ? (result.err.message || String(result.err)) : null,
          isFinal: result.isFinal,
          // 导入音频不来自双流录音，统一标 "import"
          source: "import",
        });

        if (result.err) {
          await this.queue.add({
            type: "transcribe",
            sessionId: session.id, mdPath: session.mdPath,
            audioPath: chunk.retryAudioPath || audioPath, segmentIndex: segIndex,
            sourceAudioPath: audioPath,
            sourceAudioName: file.name,
            masterAudioPath: audioPath,
            masterAudioName: file.name,
            startOffsetMs: result.startOffset, endOffsetMs: result.endOffset,
            audioName: chunk.retryAudioName || file.name, mode: session.mode, isFinal: result.isFinal,
            lastError: result.err.message || String(result.err),
          });
        }

        const segNumber = segIndex + 1;
        const segTitle = `### 段落 ${segNumber} (${formatElapsed(result.startOffset)}–${formatElapsed(result.endOffset)}) ${getAudioTimeLink(file.name, result.startOffset)}${result.isFinal ? " · 结束" : ""}`;
        const block = [
          "",
          segTitle,
          "",
          result.err ? `_[转写失败（已进入重试队列）：${result.err.message || result.err}]_` : (result.text || "_[此段无内容]_"),
          "",
        ].join("\n");
        await this.insertBeforeSegmentsEnd(session.mdPath, block, session.id);
      }

      cumOffsetMs += fileDurationMs;
    }

    this._importBusy = null;
    // 让会后 AI 整理阶段的进度（整理上下文 / 生成大纲 / 合并润色…）能在状态栏和处理进度面板显示，
    // 与文本导入一致（finalizeSession 收尾时在 this.session === session 处自动清空，无残留）。
    this.session = session;
    this.updateBusyStatus();
    await this.finalizeSession(session);
  }

  async importTextFiles(paths, modeOverride) {
    if (!paths || !paths.length) return;
    const uniquePaths = Array.from(new Set(paths.map(p => obsidian.normalizePath(String(p || ""))).filter(Boolean))).sort();
    const sources = [];
    for (const textPath of uniquePaths) {
      const file = this.app.vault.getAbstractFileByPath(textPath);
      if (!(file instanceof obsidian.TFile) || !TEXT_IMPORT_EXT.has(String(file.extension || "").toLowerCase())) {
        new obsidian.Notice(`跳过：${textPath} 不是可导入文本`);
        continue;
      }
      try {
        const raw = await this.app.vault.read(file);
        const text = stripImportedTextSource(raw);
        if (!text) {
          new obsidian.Notice(`跳过空文本：${file.name}`);
          continue;
        }
        sources.push({ file, path: file.path, name: file.name, text });
      } catch (e) {
        console.error("[LexVoice] import text read failed", e);
        new obsidian.Notice(`读取失败：${file.name}`);
      }
    }
    if (!sources.length) {
      new obsidian.Notice("没有可处理的文本内容");
      return;
    }

    const moment = window.moment;
    const startedAt = moment();
    const sessionStamp = startedAt.format("YYYYMMDD-HHmmss");
    const requestedMode = modeOverride && isKnownPolishMode(this.settings, modeOverride)
      ? modeOverride
      : (this.settings.polishMode || "meeting");
    const mode = getEffectivePolishMode(this.settings, requestedMode);
    const meta = getModeMeta(this.settings, mode);
    const llmIssue = getLlmConfigIssue(this.settings);
    if (llmIssue) {
      await this.logDiagnostic("warn", "text_import.llm_config_missing", "导入文本前大模型配置不完整", {
        mode,
        llmRoute: "composer.chat-completions",
        llmEndpoint: this.settings.llmEndpoint || "",
        llmModel: this.settings.llmModel ? "<set>" : "",
        issue: llmIssue,
      });
      new obsidian.Notice(`导入文本需要先完成大模型配置：${formatLlmConfigIssue(llmIssue)}`, 9000);
      return;
    }

    let recruitContext = null;
    if (mode === "recruit") {
      const result = await new Promise((resolve) => {
        const modal = new RecruitContextModal(this.app, this, {
          flow: "text-import",
          onConfirm: (action, ctx) => resolve({ action, ctx }),
        });
        modal.open();
      });
      if (result.action === "cancel") {
        new obsidian.Notice("已取消导入文本");
        return;
      }
      if (result.action !== "skip") recruitContext = result.ctx;
    }

    await this.ensureFolder(this.settings.mdFolder);
    const mdName = `${startedAt.format(this.settings.noteFileNameFormatNew)} · 文本导入`;
    const mdPath = this.getAvailableMarkdownPath(obsidian.normalizePath(`${this.settings.mdFolder}/${mdName}.md`));
    if (!mdPath) throw new Error("无法生成文本导入笔记路径");

    const session = {
      id: genId(),
      sessionStamp,
      startedAt: startedAt.toDate().toISOString(),
      mdPath,
      mode,
      source: "text-import",
      segments: [],
      realtimeOutline: "",
      realtimeOutlineState: { version: 1, nodes: [], memory: "" },
      realtimeOutlineMemory: "",
      realtimeOutlineSegmentCount: 0,
      realtimeOutlineWorkbenchSignature: "",
      finalized: false,
      recruitContext,
      textImportSources: sources.map(s => ({ path: s.path, name: s.name, chars: s.text.length })),
    };

    const header = [
      `# ${startedAt.format("YYYY-MM-DD HH:mm")} · ${meta.prefix}（文本导入处理中…）`,
      "",
      `> [!info] 文本导入信息`,
      `> 来源文件：${sources.length} · 模式：${meta.prefix} · 模型：${this.settings.llmModel}`,
      "",
      `<!-- lexvoice-session:${session.id} -->`,
      `<!-- lexvoice-segments-start:${session.id} -->`,
      `<!-- lexvoice-segments-end:${session.id} -->`,
      "",
    ].join("\n");
    await this.appendToNote(mdPath, header);
    this.session = session;
    this.setSessionWorkProgress(session, {
      stage: "text-import",
      label: "读取文本",
      percent: 8,
      detail: `已读取 ${sources.length} 个文本来源，准备进入 AI 整理`,
    });
    this.refreshOutlineView();
    try { await this.openOutlineView(); } catch (e) { console.warn("[LexVoice] open outline for text import failed", e); }

    session.segments = splitImportedTextIntoNormalSegments(sources);

    for (const seg of session.segments) {
      const block = [
        "",
        `### 文本来源 ${seg.index + 1}：[[${seg.sourcePath}|${seg.sourceName}]]`,
        "",
        seg.rawText || "_[此文本来源为空]_",
        "",
      ].join("\n");
      await this.insertBeforeSegmentsEnd(session.mdPath, block, session.id);
    }

    this.refreshOutlineView();
    new obsidian.Notice(`开始整理 ${sources.length} 份文本：使用 AI 整理服务，不调用语音转写服务。`);
    await this.finalizeSession(session);
  }

  async openSessionNote() {
    const mdPath = this.session && this.session.mdPath;
    if (!mdPath) { await this.openRecentNote(); return; }
    const file = this.app.vault.getAbstractFileByPath(mdPath);
    if (!(file instanceof obsidian.TFile)) { new obsidian.Notice("当前录音笔记尚未生成"); return; }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    try {
      const view = leaf.view;
      const editor = view && view.editor;
      if (editor) {
        const content = editor.getValue();
        const marker = this.session && this.session.id ? `<!-- lexvoice-segments-end:${this.session.id} -->` : "<!-- lexvoice-segments-end -->";
        const idx = content.lastIndexOf(marker);
        if (idx >= 0) {
          const line = content.slice(0, idx).split("\n").length - 1;
          editor.setCursor({ line: Math.max(0, line - 1), ch: 0 });
          editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
        } else {
          const lastLine = editor.lastLine();
          editor.setCursor({ line: lastLine, ch: 0 });
          editor.scrollIntoView({ from: { line: lastLine, ch: 0 }, to: { line: lastLine, ch: 0 } }, true);
        }
      }
    } catch { /* intentionally empty */ }
  }

  async openRecentNote() {
    const folder = this.app.vault.getAbstractFileByPath(obsidian.normalizePath(this.settings.mdFolder));
    if (!(folder instanceof obsidian.TFolder)) { new obsidian.Notice("Markdown 文件夹不存在"); return; }
    const files = getMarkdownFilesUnderFolder(this.app, this.settings.mdFolder);
    if (!files.length) { new obsidian.Notice("最近没有录音笔记"); return; }
    files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    await this.app.workspace.getLeaf(false).openFile(files[0]);
  }

  async retryQueue() {
    if (!this.queue.tasks.length) { new obsidian.Notice("队列为空"); return; }
    const blockedMergeTasks = this.queue.tasks.filter((task) => task && task.type === "merge" && task.status === "blocked");
    if (blockedMergeTasks.length) {
      const llmIssue = getLlmConfigIssue(this.settings);
      if (llmIssue) {
        new obsidian.Notice(`有 ${blockedMergeTasks.length} 个整理任务待配置：${formatLlmConfigIssue(llmIssue)}`, 9000);
      } else {
        const serviceBlocked = blockedMergeTasks.find((task) => isLlmServiceBlockedError(task.lastError || ""));
        for (const task of blockedMergeTasks) {
          task.status = "pending";
          task.lastError = "";
          task.updatedAt = new Date().toISOString();
        }
        await this.saveAll();
        new obsidian.Notice(serviceBlocked
          ? `已恢复 ${blockedMergeTasks.length} 个暂停整理任务，正在重新尝试大模型服务`
          : `已恢复 ${blockedMergeTasks.length} 个待配置整理任务`);
      }
    }
    // 与 processAll 的实际可处理集对齐（排除 running/missing/blocked 和已达重试上限），避免"重试 N…剩余 N"误导。
    // missing 任务(临时切片丢失)不在自动批量里，仍可在队列面板逐条重试触发切片恢复。
    const maxR = this.settings.maxRetries || 3;
    const runnable = this.queue.tasks.filter((task) => task
      && task.status !== "blocked" && task.status !== "missing" && task.status !== "running"
      && (Number(task.retries) || 0) < maxR);
    if (!runnable.length) {
      const missingN = this.queue.tasks.filter((t) => t && t.status === "missing").length;
      const exhaustedN = this.queue.tasks.filter((t) => t && t.status === "failed" && (Number(t.retries) || 0) >= maxR).length;
      const hints = [];
      if (missingN) hints.push(`${missingN} 个临时切片丢失`);
      if (exhaustedN) hints.push(`${exhaustedN} 个已达重试上限——若已修正配置（如补好密钥/换转写服务），可在笔记右键「重试失败转写」或队列面板逐条重试`);
      new obsidian.Notice(hints.length ? `没有可自动重试的任务（${hints.join("；")}）` : "没有可自动重试的任务", hints.length ? 9000 : 4000);
      return;
    }
    new obsidian.Notice(`重试 ${runnable.length} 个任务…`);
    await this.queue.processAll();
    new obsidian.Notice(`剩余 ${this.queue.tasks.length} 个任务`);
  }

  async retryTranscribeTasksForMarkdown(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== "md") return;
    const tasks = getQueueTasksForMarkdown(this, file, { types: ["transcribe"], failedOnly: true });
    if (!tasks.length) {
      new obsidian.Notice("这篇纪要当前没有可重试的转写任务。", 5000);
      return;
    }
    new obsidian.Notice(`LexVoice：正在重试 ${tasks.length} 个转写片段…`);
    let ok = 0;
    let failed = 0;
    const batch = tasks.slice();
    // 批量游标喂状态栏：重新转写逐段 done/total 实时可见（之前直接 for 循环没设游标 → 状态栏黑盒）。
    this.queue._batchTotal = batch.length;
    this.queue._batchDone = 0;
    this.updateBusyStatus();
    try {
      for (const task of batch) {
        try {
          await this.queue.processOne(task);
          ok++;
        } catch (e) {
          failed++;
          console.error("[LexVoice] retry transcribe task from note list failed", e);
        }
        this.queue._batchDone++;
        this.updateBusyStatus();
      }
    } finally {
      this.queue._batchTotal = 0;
      this.queue._batchDone = 0;
      this.updateBusyStatus();
    }
    await this.saveAll();
    this.refreshOutlineView();
    new obsidian.Notice(`转写重试完成：成功 ${ok} 个${failed ? `，失败 ${failed} 个` : ""}`, 8000);
  }

  async readTranscribeTaskAudioBlob(task) {
    const direct = await this.readVaultAudioBlob(task.audioPath, task.audioName);
    if (direct) return direct;

    const recovered = await this.recoverTranscribeTaskAudioBlob(task);
    if (recovered) {
      await this.logDiagnostic("warn", "queue.transcribe_audio_recovered", "转写重试已从完整录音恢复临时切片", {
        audioName: task.audioName || "",
        sourceAudioName: recovered.sourceName || "",
        startOffsetMs: task.startOffsetMs,
        endOffsetMs: task.endOffsetMs,
      });
      return recovered;
    }

    throw new Error(`音频不存在：${task.audioPath || task.audioName || "未知音频"}`);
  }

  async readVaultAudioBlob(path, fallbackName) {
    const norm = obsidian.normalizePath(String(path || ""));
    if (!norm) return null;
    const file = this.app.vault.getAbstractFileByPath(norm);
    if (!(file instanceof obsidian.TFile)) return null;
    const ab = await this.app.vault.readBinary(file);
    const ext = (file.extension || String(fallbackName || "").split(".").pop() || "").toLowerCase();
    return {
      blob: new Blob([ab], { type: mimeFromExt(ext) }),
      sourcePath: file.path,
      sourceName: file.name,
      recovered: false,
    };
  }

  resolveTranscribeRetrySourceFile(task) {
    const candidates = [];
    const push = (path) => {
      const norm = obsidian.normalizePath(String(path || "").trim());
      if (norm && !candidates.includes(norm)) candidates.push(norm);
    };

    push(task.sourceAudioPath);
    push(task.masterAudioPath);

    const audioName = String(task.audioName || (task.audioPath || "").split("/").pop() || "");
    const match = audioName.match(/^(lex-\d{8}-\d{6})-seg\d+\.(\w+)$/i);
    if (match) {
      const folder = obsidian.normalizePath(this.settings.audioFolder || DEFAULT_SETTINGS.audioFolder || "");
      const stem = match[1];
      const ext = match[2] || "m4a";
      for (const candidateExt of Array.from(new Set([ext, "m4a", "mp4", "webm", "wav"]))) {
        push(folder ? `${folder}/${stem}.${candidateExt}` : `${stem}.${candidateExt}`);
      }
    }

    for (const path of candidates) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof obsidian.TFile && AUDIO_EXT.has(String(file.extension || "").toLowerCase())) return file;
    }

    if (match) {
      const stem = match[1];
      const folder = obsidian.normalizePath(this.settings.audioFolder || DEFAULT_SETTINGS.audioFolder || "");
      const files = this.app.vault.getFiles ? this.app.vault.getFiles() : [];
      return files.find(file => file instanceof obsidian.TFile
        && AUDIO_EXT.has(String(file.extension || "").toLowerCase())
        && file.basename === stem
        && (!folder || obsidian.normalizePath(file.path).startsWith(folder + "/"))) || null;
    }

    return null;
  }

  async recoverTranscribeTaskAudioBlob(task) {
    const start = Number(task.startOffsetMs);
    const end = Number(task.endOffsetMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

    const sourceFile = this.resolveTranscribeRetrySourceFile(task);
    if (!(sourceFile instanceof obsidian.TFile)) return null;

    const source = await this.readVaultAudioBlob(sourceFile.path, sourceFile.name);
    if (!source || !source.blob) return null;
    try {
      const audioBuffer = await decodeAudioBlob(source.blob);
      const sliceBlob = await renderAudioBufferSliceToWav(audioBuffer, start, end);
      return {
        blob: sliceBlob,
        sourcePath: sourceFile.path,
        sourceName: sourceFile.name,
        recovered: true,
      };
    } catch (e) {
      throw new Error(`临时切片不存在，已找到完整录音但无法重新切片：${(e && e.message) || e}`);
    }
  }

  async retryTranscribeTask(task) {
    const audio = await this.readTranscribeTaskAudioBlob(task);
    const text = await transcribeAudio(this, audio.blob, audio.blob.type || "audio/wav");
    const replacementText = text || "_[此段暂无有效转写]_";
    if (!text) {
      await this.logDiagnostic("warn", "queue.transcribe_empty_result", "转写重试返回空文本，已按空片段处理", {
        mdPath: task.mdPath || "",
        audioName: task.audioName || "",
        startOffsetMs: task.startOffsetMs,
        endOffsetMs: task.endOffsetMs,
      });
    }
    const mdFile = this.app.vault.getAbstractFileByPath(task.mdPath);
    if (mdFile instanceof obsidian.TFile) {
      const cur = await this.app.vault.read(mdFile);
      const failMark = /_\[转写失败(?:（已进入重试队列）)?：[^\]]*\]_/;
      const next = cur.replace(failMark, replacementText);
      if (next !== cur) await this.app.vault.modify(mdFile, next);
    }
    if (!audio.recovered) await this.maybeDeleteSegmentCacheFile(task.audioPath, task.id);
  }

  // 把队列里所有指向 oldPath 的任务迁移到 newPath，并持久化。
  // 触发场景：用户/插件给纪要重命名（包括 renameMarkdownWithGeneratedTitle 自动生成的标题改名）后，
  // transcribe / merge 等待重试的任务还指向旧路径会失败报"笔记不存在"。
  migrateQueueTasksAfterRename(oldPath, newPath) {
    if (!this.queue || !Array.isArray(this.queue.tasks)) return;
    const oldNorm = obsidian.normalizePath(String(oldPath || ""));
    const newNorm = obsidian.normalizePath(String(newPath || ""));
    if (!oldNorm || !newNorm || oldNorm === newNorm) return;
    let migrated = 0;
    for (const task of this.queue.tasks) {
      if (!task) continue;
      if (task.mdPath && obsidian.normalizePath(task.mdPath) === oldNorm) {
        task.mdPath = newNorm;
        migrated++;
      }
      // 顺便把 task 里其他指向同一 md 的引用字段也迁移
      if (task.sourceMdPath && obsidian.normalizePath(task.sourceMdPath) === oldNorm) {
        task.sourceMdPath = newNorm;
      }
    }
    if (migrated > 0) {
      console.log(`[LexVoice] queue rename migrate: ${migrated} task(s) ${oldNorm} -> ${newNorm}`);
      try { (this.saveAll || this.saveSettings).call(this); } catch (e) {
        console.warn("[LexVoice] queue migrate save failed", e);
      }
    }
  }

  // 笔记被删时，从队列移除所有指向它的任务，避免孤儿 merge 任务反复白烧 LLM 再失败、永久卡 failed。
  removeQueueTasksForDeletedMarkdown(path) {
    if (!this.queue || !Array.isArray(this.queue.tasks)) return;
    const norm = obsidian.normalizePath(String(path || ""));
    if (!norm) return;
    const before = this.queue.tasks.length;
    this.queue.tasks = this.queue.tasks.filter((task) =>
      !(task && task.mdPath && obsidian.normalizePath(task.mdPath) === norm)
    );
    const removed = before - this.queue.tasks.length;
    if (removed > 0) {
      console.log(`[LexVoice] queue delete cleanup: removed ${removed} orphan task(s) for ${norm}`);
      try { (this.saveAll || this.saveSettings).call(this); } catch (e) {
        console.warn("[LexVoice] queue delete cleanup save failed", e);
      }
      try { this.refreshOutlineView(); } catch { /* intentionally empty */ }
    }
  }

  async retryMergeTask(task) {
    const polished = await mergeAndPolish(this, task.segments || [], task.mode, task.recruitContext || null, task.sessionMeta || null);
    if (!polished) throw new Error("合并返回为空");
    const file = this.app.vault.getAbstractFileByPath(task.mdPath);
    if (!(file instanceof obsidian.TFile)) throw new Error(`笔记不存在：${task.mdPath}`);
    const cur = await this.app.vault.read(file);
    const failMark = /_\[合并润色失败（已加入重试队列）：[^\]]*\]_/;
    const merged = mergeLeadingFrontmatterIntoDocument(cur, polished);
    let next;
    if (failMark.test(cur)) {
      next = merged.content.replace(failMark, merged.body);
    } else {
      const meta = getModeMeta(this.settings, task.mode);
      const block = `\n\n## 整合版（补录 · ${meta.prefix}）\n\n${merged.body}\n\n---\n`;
      next = merged.content + block;
    }
    await this.app.vault.modify(file, next);
    let targetFile = file;
    // 招聘评估重试：与 finalizeSession 一致，移到 JD 项目文件夹 + 候选人-轮次-MMDD 命名（否则项目统计漏算这一场）。
    const renamed = (task.mode === "recruit" && task.recruitContext && task.recruitContext.jdFile)
      ? await this.relocateRecruitNote({ mdPath: file.path, recruitContext: task.recruitContext }, task.recruitContext)
      : await this.renameMarkdownWithGeneratedTitle(file, polished, task.mode);
    if (renamed instanceof obsidian.TFile) targetFile = renamed;
    try {
      const latestContent = await this.app.vault.read(targetFile);
      const session = {
        id: task.sessionId || extractLexVoiceSessionId(latestContent, obsidian.normalizePath(targetFile.path).replace(/[^A-Za-z0-9_-]+/g, "-")),
        mdPath: targetFile.path,
        mode: task.mode,
        startedAt: (task.sessionMeta && task.sessionMeta.startedAt) || task.createdAt || new Date().toISOString(),
        segments: Array.isArray(task.segments) ? task.segments : [],
      };
      await this.appendDailyMeetingOverview(session, polished);
    } catch (e) {
      console.error("[LexVoice] daily overview after merge retry failed", e);
    }
  }

  async runGeneratePromptTask(task) {
    const mode = task.mode;
    if (!mode) throw new Error("缺少 mode");
    const tpl = await this.generateAndApplyIndustryPrompt(mode, { activate: task.activate !== false });
    const activated = task.activate !== false;
    new obsidian.Notice("已创建自定义提示词「" + tpl.name + "」" + (activated ? "，并设为当前默认。" : "。"), 7000);
    if (this.settingTab) {
      try { this.settingTab.display(); } catch { /* intentionally empty */ }
    }
  }

  // 把"生成 Prompt"作为后台任务入队。立刻返回，UI 切走也不影响。
  async enqueueGeneratePromptTask(mode, options) {
    if (!isKnownPolishMode(this.settings, mode)) throw new Error("未知的 mode：" + mode);
    const p = this.settings.industryProfile || {};
    if (!p.industry || !p.scenarios) throw new Error("请先在 AI 整理填写「行业 / 角色」和「主要工作场景」");
    if (!this.settings.llmApiKey) throw new Error("请先在 API 页配置大模型服务");
    const existing = this.queue.findActiveGeneratePromptTask(mode);
    if (existing) {
      const meta = getModeMeta(this.settings, mode);
      new obsidian.Notice("已存在生成任务：参考「" + (meta.prefix || mode) + "」的自定义提示词正在队列中", 5000);
      return existing;
    }
    const task = await this.queue.add({
      type: "generate-prompt",
      mode,
      activate: !options || options.activate !== false,
    });
    const meta = getModeMeta(this.settings, mode);
    new obsidian.Notice("已加入后台队列：参考「" + (meta.prefix || mode) + "」生成自定义提示词（切换页面不会中断）", 5000);
    try { this.recorder.emit(); } catch { /* intentionally empty */ }
    // 立刻拉起队列处理（不 await，让调用方立刻返回）
    this.queue.processAll()
      .catch((e) => console.error("[LexVoice] queue processAll", e))
      .finally(() => { try { this.recorder.emit(); } catch { /* intentionally empty */ } });
    return task;
  }
}






// 电脑音频捕获安装/配置向导 Modal —— 分平台引导













// ====== 招聘项目化（F2）：JD 项目库扫描 / JD 文档解析 / PDF 文本尽力提取 / 三件套创建 ======

// JD 文件判据：md 且 文件名（去扩展名）== 父文件夹名。不依赖额外字段，重命名免维护。

// 扫 JD 库根下每个子文件夹 = 一个招聘项目；取同名 .md 作 JD 文件，读 frontmatter 状态/职位名/序列。


// 解析单个 JD 文件：岗位描述 / 综合素质（frontmatter 对象数组）/ 统一面试提纲。
// 综合素质格式异常但有数据 → qualitiesError=true（调用方提示"按未配置处理"），不抛错、不阻断。

// 尽力从 PDF 提取文本（手动粘贴为主 + 尽力提取）：用 Obsidian 内置 pdf.js（window.pdfjsLib）。
// 不可用 / 扫描件 / 失败一律返回 ""，调用方提示手动粘贴。不引入任何打包依赖。

// 列出简历库里的 PDF 文件（递归，按修改时间倒序），供 Modal 简历下拉。

// 招聘项目 JD 文件模板（PRD F2.1 + 「类型: 招聘项目」键供聚合 Base 筛选）。jdBody = 粘贴的 JD 正文。
// 新建招聘项目时 JD 预置的默认综合素质（单一来源：JD 模板的 综合素质 段 + 候选人看板的 素质_* 列都用它）。


// 候选人看板 Base 模板（F5）。qualities = 素质名数组（动态追加 素质_<名> 列）。语法均为库内已验证写法：
// file.folder==this.file.folder + jd!=null 限定本项目候选人纪要；视图级 filters 叠加分页；displayName 把
// 真实字段 轮次/time/时长 显示成 面试轮次/面试时间/面试时长（不重命名 frontmatter，零迁移）；or 枚举录用建议（库内已验证）。

// 聚合看板 Base 模板（F6）：靠 JD frontmatter 的「类型: 招聘项目」过滤，天然只命中各项目的 JD 文件、排除候选人纪要。

// 在 JD 库根确保有一个聚合看板（首次建项目时按需创建，不覆盖用户改动）。

// 三件套创建：项目文件夹 + 同名 JD.md + 同名候选人看板.base；并确保 JD 库根有聚合看板。同名项目已存在则报错不覆盖。

// ====== F7 招聘主页：MD 模板 + 候选人纪要聚合 + 录用建议配色（4 个 code block 渲染器实时计算、零落盘）======

// 招聘主页 MD 模板：4 个自定义 code block + 嵌入聚合看板的「招聘中」视图。

// 聚合全库候选人面试纪要（判据：mode===recruit 或带 lexvoice/recruit 标签；排除 JD 文件/主页）。按 time 倒序。

// 录用建议 → 颜色（Obsidian 主题色变量，暗色可读）。startsWith 先长后短，吞掉「（条件性）」后缀。

// 招聘面试模式上下文 Modal —— 按录音、导入、重新整理等流程注入 JD/简历/候选人信息

// 提示词库 Modal



export default LexVoicePlugin;
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

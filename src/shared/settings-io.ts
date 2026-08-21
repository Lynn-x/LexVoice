// 设置持久化边界：从不可信磁盘数据重建完整设置，并按当前 schema 分组写回。
// normalize（读盘 → 内存平铺字段）与 serialize（内存 → 分组落盘）成对出现。
//
// ⚠️ 白名单脚枪警告：serializeLexVoiceSettings 是**重建式白名单**——它返回一个全新的嵌套对象，
// 任何没有在 serialize 里显式登记的设置键，都会在下一次保存时被静默丢弃。
// 新增设置键必须同时登记 normalize（读回）+ serialize（写出）两处，否则「保存即丢失」。
// 该 bug 类已咬过三次（第三例：sedimentAutoExtract）——现在由 tests/settings-io.test.ts 的
// round-trip 测试兜底：DEFAULT_SETTINGS 的每个顶层键都必须在 normalize→serialize→normalize 后原样存活。
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import { MODE_META } from "./catalog-modes";
import {
  isCustomPromptModeTemplate,
  normalizeAsrConcurrency,
  normalizeAudioInputMode,
  normalizeKnowledgeExtractionHistory,
  normalizeLlmProfiles,
  normalizePeopleContextMode,
  normalizePeopleSuggestionCache,
  normalizePeopleSuggestionIgnores,
} from "./settings-runtime-deps";
import type {
  AvailableUpdate,
  FloatingBallPosition,
  IndustryProfile,
  PersistedPluginSettings,
  PluginSettings,
  PromptTemplate,
  RecruitContext,
  RecruitContextLibraryEntry,
  RecruitQuality,
  TranscribeProviderSettings,
} from "./types";

export const SETTINGS_SCHEMA_VERSION = 4;
export const LEGACY_VOCABULARY_FILE = "lexvoice 词汇表.md";

type UnknownRecord = Record<string, unknown>;

const PROMPT_MODES = ["learning", "interview", "meeting", "seminar", "huddle", "monologue", "recruit"] as const;
const STRUCTURE_LEVELS = ["loose", "balanced", "strict"] as const;
const THINKING_MODES = ["auto", "reasoning", "fast"] as const;
const AUDIO_CHANNEL_MODES = ["auto", "mono", "multichannel"] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeRecordKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function firstDefined(...values: unknown[]): unknown {
  return values.find(value => value !== undefined);
}

function firstRecord(...values: unknown[]): UnknownRecord | undefined {
  return values.find(isRecord);
}

function firstArray(...values: unknown[]): unknown[] | undefined {
  return values.find(Array.isArray);
}

function firstString(fallback: string, ...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return fallback;
}

function normalizeAudioChannelMode(value: unknown): PluginSettings["audioChannelMode"] {
  const mode = typeof value === "string" ? value.trim() : "";
  return AUDIO_CHANNEL_MODES.includes(mode as typeof AUDIO_CHANNEL_MODES[number])
    ? mode as PluginSettings["audioChannelMode"]
    : "auto";
}

function firstNonBlankString(fallback: string, ...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function firstBoolean(fallback: boolean, ...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

function firstNumber(fallback: number, ...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function firstNullableString(fallback: string | null, ...values: unknown[]): string | null {
  for (const value of values) {
    if (value === null) return null;
    if (typeof value === "string") return value;
  }
  return fallback;
}

function firstEnum<const T extends string>(allowed: readonly T[], fallback: T, ...values: unknown[]): T {
  for (const value of values) {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  }
  return fallback;
}

function normalizeProvider(value: unknown, fallback: TranscribeProviderSettings = {}): TranscribeProviderSettings {
  const raw = asRecord(value);
  const result: TranscribeProviderSettings = { ...fallback };
  const stringKeys: (keyof TranscribeProviderSettings)[] = [
    "name", "endpoint", "apiKey", "model", "language", "protocol", "targetLanguage", "hint",
  ];
  for (const key of stringKeys) {
    const candidate = raw[key];
    if (typeof candidate === "string") result[key] = candidate;
  }
  return result;
}

function normalizeIndustryProfile(value: unknown, fallback: IndustryProfile): IndustryProfile {
  const raw = asRecord(value);
  return {
    industry: firstString(fallback.industry, raw.industry),
    scenarios: firstString(fallback.scenarios, raw.scenarios),
    focus: firstString(fallback.focus, raw.focus),
    outputPreference: firstString(fallback.outputPreference, raw.outputPreference),
    generatedAt: firstNullableString(fallback.generatedAt, raw.generatedAt),
  };
}

function normalizeFloatingBallPosition(value: unknown, fallback: FloatingBallPosition): FloatingBallPosition {
  const raw = asRecord(value);
  return {
    left: firstNumber(fallback.left, raw.left),
    top: firstNumber(fallback.top, raw.top),
  };
}

function normalizeRecruitQuality(value: unknown): RecruitQuality | null {
  const raw = asRecord(value);
  if (typeof raw["素质"] !== "string" || typeof raw["定义"] !== "string" || typeof raw["信号"] !== "string") return null;
  return { 素质: raw["素质"], 定义: raw["定义"], 信号: raw["信号"] };
}

function normalizeRecruitContext(value: unknown, fallback: RecruitContext): RecruitContext {
  const raw = asRecord(value);
  const result: RecruitContext = {
    jd: firstString(fallback.jd, raw.jd),
    resume: firstString(fallback.resume, raw.resume),
    candidateName: firstString(fallback.candidateName, raw.candidateName),
    position: firstString(fallback.position, raw.position),
    round: firstString(fallback.round, raw.round),
    interviewer: firstString(fallback.interviewer, raw.interviewer),
    interviewScene: firstString(fallback.interviewScene, raw.interviewScene),
    seniority: firstString(fallback.seniority, raw.seniority),
    customNote: firstString(fallback.customNote, raw.customNote),
    previousInterviewNote: firstString(fallback.previousInterviewNote, raw.previousInterviewNote),
    previousNotePath: firstString(fallback.previousNotePath, raw.previousNotePath),
    interviewBrief: firstString(fallback.interviewBrief, raw.interviewBrief),
    savedAt: firstNullableString(fallback.savedAt, raw.savedAt),
  };
  for (const key of ["jdFile", "generalOutline"] as const) {
    const candidate = raw[key];
    if (typeof candidate === "string") result[key] = candidate;
    else if (typeof fallback[key] === "string") result[key] = fallback[key];
  }
  const qualities = Array.isArray(raw.requiredQualities)
    ? raw.requiredQualities.map(normalizeRecruitQuality).filter((item): item is RecruitQuality => item !== null)
    : fallback.requiredQualities;
  if (qualities) result.requiredQualities = qualities;
  return result;
}

function normalizeRecruitContextLibrary(value: unknown): RecruitContextLibraryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const context: RecruitContextLibraryEntry = normalizeRecruitContext(item, DEFAULT_SETTINGS.recruitContext);
    if (typeof item.id === "string") context.id = item.id;
    if (typeof item.type === "string") context.type = item.type;
    return [context];
  });
}

function normalizeAvailableUpdate(value: unknown): AvailableUpdate | null {
  if (!isRecord(value)) return null;
  const files = Array.isArray(value.files) && value.files.every(item => typeof item === "string")
    ? value.files
    : null;
  if (
    typeof value.version !== "string"
    || typeof value.currentVersion !== "string"
    || typeof value.rawBaseUrl !== "string"
    || typeof value.manifestUrl !== "string"
    || typeof value.checkedAt !== "string"
    || files === null
  ) return null;
  return {
    version: value.version,
    currentVersion: value.currentVersion,
    rawBaseUrl: value.rawBaseUrl,
    manifestUrl: value.manifestUrl,
    checkedAt: value.checkedAt,
    files,
  };
}

function normalizePromptTemplate(value: unknown): PromptTemplate | null {
  if (!isRecord(value)) return null;
  const id = firstNonBlankString("", value.id);
  const mode = firstNonBlankString("", value.mode);
  if (!id || !mode) return null;
  const now = new Date().toISOString();
  const result: PromptTemplate = {
    id,
    mode,
    name: firstString("未命名", value.name),
    prompt: firstString("", value.prompt),
    createdAt: firstString(now, value.createdAt),
    updatedAt: firstString(now, value.updatedAt),
  };
  for (const key of ["description", "baseMode", "source"] as const) {
    if (typeof value[key] === "string") result[key] = value[key];
  }
  if (typeof value.isBuiltin === "boolean") result.isBuiltin = value.isBuiltin;
  if (typeof value.customMode === "boolean") result.customMode = value.customMode;
  return result;
}

function normalizeTemplateBag(value: unknown): Record<string, PromptTemplate> {
  const bag = asRecord(value);
  const result: Record<string, PromptTemplate> = {};
  for (const [key, candidate] of Object.entries(bag)) {
    if (!isSafeRecordKey(key)) continue;
    const template = normalizePromptTemplate(candidate);
    if (template && isSafeRecordKey(template.id)) result[key] = template;
  }
  return result;
}

function normalizeActiveTemplateBag(value: unknown): Record<string, string> {
  const bag = asRecord(value);
  const result: Record<string, string> = {};
  for (const [mode, id] of Object.entries(bag)) {
    if (isSafeRecordKey(mode) && typeof id === "string" && isSafeRecordKey(id)) result[mode] = id;
  }
  return result;
}

export function normalizeLexVoiceSettings(savedData: unknown): PluginSettings {
  const saved = asRecord(savedData);
  const raw = isRecord(saved.settings) ? saved.settings : saved;
  const defaults = DEFAULT_SETTINGS;
  const s: PluginSettings = { ...defaults };

  const storage = asRecord(raw.storage);
  s.audioFolder = firstString(defaults.audioFolder, storage.recordingLibraryPath, raw.audioFolder);
  s.mdFolder = firstString(defaults.mdFolder, storage.briefingNotePath, raw.mdFolder);
  s.meetingMaterialsFolder = obsidian.normalizePath(firstString(defaults.meetingMaterialsFolder, storage.meetingMaterialPath, raw.meetingMaterialsFolder));
  s.htmlReportFolder = firstString(defaults.htmlReportFolder, storage.htmlReportPath, raw.htmlReportFolder);
  s.inboxFolder = firstString(defaults.inboxFolder, storage.inboxPath, raw.inboxFolder);
  s.inboxAutoImport = firstBoolean(defaults.inboxAutoImport, storage.autoImportInbox, raw.inboxAutoImport);
  s.inboxArchiveSubfolder = firstString(defaults.inboxArchiveSubfolder, storage.archiveSubfolder, raw.inboxArchiveSubfolder);
  s.inboxStabilizeDelayMs = firstNumber(defaults.inboxStabilizeDelayMs, storage.syncQuietMs, raw.inboxStabilizeDelayMs);

  const noteNaming = asRecord(raw.noteNaming);
  s.noteFileNameFormatNew = firstString(defaults.noteFileNameFormatNew, noteNaming.sessionPattern, raw.noteFileNameFormatNew);
  s.autoOpenNoteAfterFinish = firstBoolean(defaults.autoOpenNoteAfterFinish, noteNaming.openAfterFinish, raw.autoOpenNoteAfterFinish);
  s.autoRenameWithTitle = firstBoolean(defaults.autoRenameWithTitle, noteNaming.renameWithTitle, raw.autoRenameWithTitle);
  s.consolidatedLayout = firstBoolean(defaults.consolidatedLayout, noteNaming.consolidatedLayout, raw.consolidatedLayout);
  s.sedimentAutoExtract = firstBoolean(defaults.sedimentAutoExtract, noteNaming.sedimentAutoExtract, raw.sedimentAutoExtract);

  const capture = asRecord(raw.capture);
  s.captureMode = normalizeAudioInputMode(firstDefined(capture.sourceMode, raw.captureMode, defaults.captureMode));
  s.audioChannelMode = normalizeAudioChannelMode(firstDefined(capture.channelMode, raw.audioChannelMode, defaults.audioChannelMode));
  s.selectedVirtualDevice = firstString(defaults.selectedVirtualDevice, capture.virtualDeviceId, raw.selectedVirtualDevice);
  s.selectedMicrophoneDevice = firstString(defaults.selectedMicrophoneDevice, capture.microphoneDeviceId, raw.selectedMicrophoneDevice);
  s.enableInterimOutput = firstBoolean(defaults.enableInterimOutput, capture.liveSegmentsEnabled, raw.enableInterimOutput);
  s.segmentIntervalMinutes = firstNumber(defaults.segmentIntervalMinutes, capture.segmentMinutes, raw.segmentIntervalMinutes);
  s.segmentCacheFolder = firstString(defaults.segmentCacheFolder, storage.segmentCachePath, raw.segmentCacheFolder);
  s.keepSegmentAudioFiles = firstBoolean(defaults.keepSegmentAudioFiles, capture.keepSegmentAudioFiles, raw.keepSegmentAudioFiles);
  s.filterShortRecordings = firstBoolean(defaults.filterShortRecordings, capture.discardVeryShortRecordings, raw.filterShortRecordings);

  const speech = asRecord(raw.speech);
  const savedProviders = asRecord(firstRecord(speech.providers, raw.transcribeProviders));
  const defaultProviders = defaults.transcribeProviders;
  const providerIds = new Set([...Object.keys(defaultProviders), ...Object.keys(savedProviders)]);
  s.transcribeProviders = {};
  for (const id of providerIds) {
    const defaultProvider = defaultProviders[id];
    if (!isSafeRecordKey(id) || (!defaultProvider && !isRecord(savedProviders[id]))) continue;
    const provider = normalizeProvider(savedProviders[id], defaultProvider);
    // 预设服务的展示性文案（name/hint）与协议字段始终以当前版本默认值为准：
    // 它们不是用户配置，旧版本落盘的过期文案/协议在升级后会误导用户与路由（如 1.2.3 残留的 MiMo 限额描述）。
    if (defaultProvider) {
      if (defaultProvider.name) provider.name = defaultProvider.name;
      if (defaultProvider.hint) provider.hint = defaultProvider.hint;
      if (defaultProvider.protocol) provider.protocol = defaultProvider.protocol;
    }
    s.transcribeProviders[id] = provider;
  }
  s.activeTranscribeProvider = firstString(defaults.activeTranscribeProvider, speech.activeProviderId, raw.activeTranscribeProvider);
  s.importTranscribeProvider = firstString(
    defaults.importTranscribeProvider,
    speech.importProviderId,
    raw.importTranscribeProvider,
  );
  s.importSpeakerDiarization = firstBoolean(
    defaults.importSpeakerDiarization,
    speech.importSpeakerDiarization,
    raw.importSpeakerDiarization,
  );
  s.importSpeakerCount = Math.max(0, Math.min(100, Math.floor(firstNumber(
    defaults.importSpeakerCount,
    speech.importSpeakerCount,
    raw.importSpeakerCount,
  ))));
  s.transcribeEndpoint = firstString(defaults.transcribeEndpoint, speech.compatEndpoint, raw.transcribeEndpoint);
  s.transcribeApiKey = firstString(defaults.transcribeApiKey, speech.compatApiKey, raw.transcribeApiKey);
  s.transcribeModel = firstString(defaults.transcribeModel, speech.compatModel, raw.transcribeModel);
  s.transcribeLanguage = firstString(defaults.transcribeLanguage, speech.compatLanguage, raw.transcribeLanguage);
  s.asrConcurrency = normalizeAsrConcurrency(firstDefined(speech.asrConcurrency, raw.asrConcurrency, defaults.asrConcurrency));
  if (!isRecord(savedProviders.siliconflow) && (s.transcribeApiKey || s.transcribeModel || s.transcribeEndpoint)) {
    const sf = s.transcribeProviders.siliconflow;
    if (sf) {
      if (s.transcribeApiKey) sf.apiKey = s.transcribeApiKey;
      if (s.transcribeModel) sf.model = s.transcribeModel;
      if (s.transcribeEndpoint) sf.endpoint = s.transcribeEndpoint;
      if (s.transcribeLanguage) sf.language = s.transcribeLanguage;
    }
  }

  const composer = asRecord(raw.composer);
  const promptOverrides = asRecord(firstRecord(composer.modePromptOverrides, raw.modePromptOverrides));
  s.llmEndpoint = firstNonBlankString(defaults.llmEndpoint, composer.endpoint, raw.llmEndpoint);
  s.llmApiKey = firstNonBlankString(defaults.llmApiKey, composer.apiKey, raw.llmApiKey);
  s.llmModel = firstNonBlankString(defaults.llmModel, composer.model, raw.llmModel);
  s.llmServicePreset = firstString(defaults.llmServicePreset, composer.servicePreset, raw.llmServicePreset);
  s.llmProfiles = normalizeLlmProfiles(firstArray(composer.profiles, raw.llmProfiles));
  s.activeLlmProfile = firstString(defaults.activeLlmProfile, composer.activeProfile, raw.activeLlmProfile);
  if (s.activeLlmProfile && !s.llmProfiles.some(profile => profile.id === s.activeLlmProfile)) s.activeLlmProfile = "";
  s.polishMode = firstString(defaults.polishMode, composer.defaultMode, raw.polishMode);
  s.polishPromptInterview = firstString(defaults.polishPromptInterview, promptOverrides.interview, raw.polishPromptInterview);
  s.polishPromptMeeting = firstString(defaults.polishPromptMeeting, promptOverrides.meeting, raw.polishPromptMeeting);
  s.polishPromptHuddle = firstString(defaults.polishPromptHuddle, promptOverrides.huddle, raw.polishPromptHuddle);
  s.polishPromptSeminar = firstString(defaults.polishPromptSeminar, promptOverrides.seminar, raw.polishPromptSeminar);
  s.polishPromptMonologue = firstString(defaults.polishPromptMonologue, promptOverrides.monologue, raw.polishPromptMonologue);
  s.polishPromptLearning = firstString(defaults.polishPromptLearning, promptOverrides.learning, raw.polishPromptLearning);
  s.polishPromptRecruit = firstString(defaults.polishPromptRecruit, promptOverrides.recruit, raw.polishPromptRecruit);
  s.briefingStructureLevel = firstEnum(STRUCTURE_LEVELS, defaults.briefingStructureLevel, composer.structureLevel, raw.briefingStructureLevel);
  s.repolishPreferencePromptAddendum = firstString(defaults.repolishPreferencePromptAddendum, composer.repolishPreferencePromptAddendum, raw.repolishPreferencePromptAddendum);
  s.repolishPreference = firstString(defaults.repolishPreference, composer.repolishPreference, raw.repolishPreference);
  s.thinkingMode = firstEnum(THINKING_MODES, defaults.thinkingMode, composer.thinkingMode, raw.thinkingMode);
  const languagePolicy = asRecord(firstRecord(composer.languagePolicy, raw.languagePolicy));
  s.briefingTranslationMode = firstString(defaults.briefingTranslationMode, languagePolicy.mode, raw.briefingTranslationMode);
  s.briefingTargetLanguage = firstString(defaults.briefingTargetLanguage, languagePolicy.targetLanguage, raw.briefingTargetLanguage);
  s.briefingCustomLanguage = firstString(defaults.briefingCustomLanguage, languagePolicy.customLanguage, raw.briefingCustomLanguage);
  s.briefingKeepOriginalTerms = firstBoolean(defaults.briefingKeepOriginalTerms, languagePolicy.keepOriginalTerms, raw.briefingKeepOriginalTerms);
  s.briefingLanguageInstruction = firstString(defaults.briefingLanguageInstruction, languagePolicy.extraInstruction, raw.briefingLanguageInstruction);
  s.industryProfile = normalizeIndustryProfile(firstRecord(composer.industryProfile, raw.industryProfile), defaults.industryProfile);

  const presentation = asRecord(raw.presentation);
  s.autoOpenHtmlReportAfterGenerate = firstBoolean(defaults.autoOpenHtmlReportAfterGenerate, presentation.openHtmlReportAfterGenerate, raw.autoOpenHtmlReportAfterGenerate);
  s.reportBrandName = firstString(defaults.reportBrandName, presentation.reportBrandName, raw.reportBrandName).trim();

  const vocabulary = asRecord(raw.vocabulary);
  s.customVocabulary = firstString(defaults.customVocabulary, vocabulary.inlineTerms, raw.customVocabulary);
  s.vocabularyFile = firstString(defaults.vocabularyFile, vocabulary.notePath, raw.vocabularyFile);
  if (obsidian.normalizePath(s.vocabularyFile).toLowerCase() === LEGACY_VOCABULARY_FILE.toLowerCase()) {
    s.vocabularyFile = defaults.vocabularyFile;
  }
  s.peopleDirectoryFolder = obsidian.normalizePath(firstNonBlankString(defaults.peopleDirectoryFolder, vocabulary.peopleFolder, raw.peopleDirectoryFolder));
  s.peopleBaseFile = obsidian.normalizePath(firstNonBlankString(defaults.peopleBaseFile, vocabulary.peopleBasePath, raw.peopleBaseFile));
  s.learningCardsFolder = obsidian.normalizePath(firstNonBlankString(defaults.learningCardsFolder, vocabulary.learningCardsFolder, raw.learningCardsFolder));
  s.todoCardsFolder = obsidian.normalizePath(firstNonBlankString(defaults.todoCardsFolder, vocabulary.todoCardsFolder, raw.todoCardsFolder));
  s.peopleContextMode = normalizePeopleContextMode(firstDefined(vocabulary.peopleContextMode, raw.peopleContextMode, defaults.peopleContextMode));
  s.peopleHotwordsConsentAt = firstString(defaults.peopleHotwordsConsentAt, vocabulary.peopleHotwordsConsentAt, raw.peopleHotwordsConsentAt);
  s.peopleSuggestionIgnores = normalizePeopleSuggestionIgnores(firstDefined(vocabulary.peopleSuggestionIgnores, raw.peopleSuggestionIgnores, defaults.peopleSuggestionIgnores));
  s.peopleSuggestionCache = normalizePeopleSuggestionCache(firstDefined(vocabulary.peopleSuggestionCache, raw.peopleSuggestionCache, defaults.peopleSuggestionCache));
  s.knowledgeExtractionHistory = normalizeKnowledgeExtractionHistory(firstDefined(vocabulary.extractionHistory, raw.knowledgeExtractionHistory, defaults.knowledgeExtractionHistory));

  const views = asRecord(raw.views);
  s.lexVoiceBasesFolder = obsidian.normalizePath(firstNonBlankString(defaults.lexVoiceBasesFolder, views.baseFolder, raw.lexVoiceBasesFolder));

  const liveOutline = asRecord(raw.liveOutline);
  s.enableRealtimeOutline = firstBoolean(defaults.enableRealtimeOutline, liveOutline.enabled, raw.enableRealtimeOutline);
  s.realtimeOutlineDebounceMs = firstNumber(defaults.realtimeOutlineDebounceMs, liveOutline.debounceMs, raw.realtimeOutlineDebounceMs);
  s.autoOpenOutlineOnRecord = firstBoolean(defaults.autoOpenOutlineOnRecord, liveOutline.openOnCapture, raw.autoOpenOutlineOnRecord);

  const dailyNote = asRecord(raw.dailyNote);
  s.writeDailyMeetingOverview = firstBoolean(defaults.writeDailyMeetingOverview, dailyNote.meetingOverviewEnabled, raw.writeDailyMeetingOverview);
  s.dailyMeetingOverviewHeading = firstString(defaults.dailyMeetingOverviewHeading, dailyNote.meetingOverviewHeading, raw.dailyMeetingOverviewHeading)
    .replace(/^#+\s*/, "").trim() || defaults.dailyMeetingOverviewHeading;
  s.dailyMeetingOverviewTemplate = firstString(defaults.dailyMeetingOverviewTemplate, dailyNote.meetingOverviewTemplate, raw.dailyMeetingOverviewTemplate)
    .trim() || defaults.dailyMeetingOverviewTemplate;

  const retryPolicy = asRecord(raw.retryPolicy);
  s.maxRetries = firstNumber(defaults.maxRetries, retryPolicy.maxAttempts, raw.maxRetries);

  const diagnostics = asRecord(raw.diagnostics);
  s.diagnosticsLogEnabled = firstBoolean(defaults.diagnosticsLogEnabled, diagnostics.enabled, raw.diagnosticsLogEnabled);
  s.diagnosticsLogFolder = obsidian.normalizePath(firstNonBlankString(defaults.diagnosticsLogFolder, diagnostics.folder, raw.diagnosticsLogFolder));

  const ui = asRecord(raw.ui);
  s.showFloatingBall = firstBoolean(defaults.showFloatingBall, ui.floatingControlEnabled, raw.showFloatingBall);
  s.bubbleSize = firstEnum(["large", "medium", "small"] as const, defaults.bubbleSize, ui.bubbleSize, raw.bubbleSize);
  s.floatingBallPos = normalizeFloatingBallPosition(firstRecord(ui.floatingControlPosition, raw.floatingBallPos), defaults.floatingBallPos);

  const recruiting = asRecord(raw.recruiting);
  s.recruitContext = normalizeRecruitContext(firstRecord(recruiting.context, raw.recruitContext), defaults.recruitContext);
  s.recruitAlwaysAskOnStart = firstBoolean(defaults.recruitAlwaysAskOnStart, recruiting.askBeforeCapture, raw.recruitAlwaysAskOnStart);
  s.recruitContextLibrary = normalizeRecruitContextLibrary(firstArray(recruiting.contextLibrary, raw.recruitContextLibrary));
  s.recruitFeatureUnlocked = firstBoolean(defaults.recruitFeatureUnlocked, recruiting.unlocked, raw.recruitFeatureUnlocked);
  if (!s.recruitFeatureUnlocked && s.polishMode === "recruit") s.polishMode = defaults.polishMode;
  // HR 模块路径：空串也算"已定义"，故文件夹路径做非空兜底回默认。
  s.recruitJdFolderPath = firstString(defaults.recruitJdFolderPath, recruiting.jdFolder, raw.recruitJdFolderPath).trim() || "JD";
  s.recruitResumeFolderPath = firstString(defaults.recruitResumeFolderPath, recruiting.resumeFolder, raw.recruitResumeFolderPath).trim() || "简历";
  s.recruitResumeDesensitize = firstBoolean(defaults.recruitResumeDesensitize, recruiting.desensitize, raw.recruitResumeDesensitize);
  s.recruitHomepagePath = firstString(defaults.recruitHomepagePath, recruiting.homepage, raw.recruitHomepagePath).trim();

  const updates = asRecord(raw.updates);
  // updateRepoUrl/Branch/PluginDir/RawBaseUrl 已收编为模块常量 LEXVOICE_UPDATE_*：
  // 此前 normalize 始终重置为默认值，用户落盘值从未生效过，作为设置项是假象。
  s.autoCheckUpdates = firstBoolean(defaults.autoCheckUpdates, updates.autoCheck, raw.autoCheckUpdates);
  s.lastUpdateCheckAt = firstNullableString(defaults.lastUpdateCheckAt, updates.lastCheckedAt, raw.lastUpdateCheckAt);
  s.availableUpdate = normalizeAvailableUpdate(firstDefined(updates.available, raw.availableUpdate));
  s.lastUpdateError = firstString(defaults.lastUpdateError, updates.lastError, raw.lastUpdateError);
  s.installedUpdateVersion = firstString(defaults.installedUpdateVersion, updates.installedVersion, raw.installedUpdateVersion);

  // Prompt 模板管理：每种内置模式各有一个 builtin 模板（prompt 留空表示用内置 MERGE_PROMPTS），
  // 用户可在此基础上新建变体。从旧的 polishPromptX 字段迁移：
  // 若旧字段非空且尚无对应 builtin，则保留为 builtin 的覆盖文本
  const tplBag = normalizeTemplateBag(raw.promptTemplates);
  const activeBag = normalizeActiveTemplateBag(raw.activeTemplateByMode);
  s.promptTemplates = {};
  s.activeTemplateByMode = {};
  for (const mode of PROMPT_MODES) {
    const builtinId = `builtin-${mode}`;
    const legacyKey = `polishPrompt${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
    const legacyText = firstString("", raw[legacyKey]);
    // 收集该 mode 下已存在的所有模板。
    const existingForMode = Object.values(tplBag).filter(template => template.mode === mode);
    let builtin = existingForMode.find(template => template.id === builtinId);
    if (!builtin) {
      const now = new Date().toISOString();
      builtin = {
        id: builtinId,
        mode,
        name: "默认（内置）",
        prompt: legacyText,
        isBuiltin: true,
        createdAt: now,
        updatedAt: now,
      };
    } else if (!builtin.prompt && legacyText) {
      // 已有 builtin：尊重保存的字段，但若 prompt 为空且 legacy 有值，迁回。
      builtin.prompt = legacyText;
    }
    s.promptTemplates[builtin.id] = builtin;
    // 把同 mode 的非 builtin 也合并进来。
    for (const template of existingForMode) {
      if (template.id === builtinId) continue;
      s.promptTemplates[template.id] = template;
    }
    // active id：优先用持久化的，其次 builtin。
    const savedActive = activeBag[mode];
    s.activeTemplateByMode[mode] = savedActive && s.promptTemplates[savedActive]
      ? savedActive
      : builtin.id;
  }
  // 把不属于内置模式的模板也保留下来（不丢用户数据）。带 customMode 的模板会成为可直接调用的自定义模式。
  for (const [id, template] of Object.entries(tplBag)) {
    if (!s.promptTemplates[id]) s.promptTemplates[id] = template;
  }
  for (const template of Object.values(s.promptTemplates)) {
    if (!isCustomPromptModeTemplate(template)) continue;
    if (!template.name) template.name = "自定义提示词";
    if (!template.baseMode || !(template.baseMode in MODE_META) || template.baseMode === "off") template.baseMode = "learning";
    template.mode = template.id;
    template.customMode = true;
    s.activeTemplateByMode[template.id] = template.id;
  }

  return s;
}

export function serializeLexVoiceSettings(s: PluginSettings): PersistedPluginSettings {
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
      // 曾因未登记而在每次保存时静默丢失（白名单脚枪第三例）——serialize 是重建式白名单，新增设置键必须在此登记
      sedimentAutoExtract: !!s.sedimentAutoExtract,
    },
    capture: {
      sourceMode: s.captureMode,
      channelMode: s.audioChannelMode,
      virtualDeviceId: s.selectedVirtualDevice,
      microphoneDeviceId: s.selectedMicrophoneDevice,
      liveSegmentsEnabled: s.enableInterimOutput,
      segmentMinutes: s.segmentIntervalMinutes,
      keepSegmentAudioFiles: s.keepSegmentAudioFiles === true,
      discardVeryShortRecordings: s.filterShortRecordings !== false,
    },
    speech: {
      activeProviderId: s.activeTranscribeProvider,
      importProviderId: s.importTranscribeProvider,
      importSpeakerDiarization: s.importSpeakerDiarization !== false,
      importSpeakerCount: Math.max(0, Math.min(100, Math.floor(Number(s.importSpeakerCount) || 0))),
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
      bubbleSize: s.bubbleSize || "large",
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

export function extractLexVoiceJobItems(savedData: unknown): unknown[] {
  const saved = asRecord(savedData);
  const backgroundJobs = asRecord(saved.backgroundJobs);
  if (Array.isArray(backgroundJobs.items)) return backgroundJobs.items;
  const jobs = asRecord(saved.jobs);
  if (Array.isArray(jobs.items)) return jobs.items;
  if (Array.isArray(saved.queue)) return saved.queue;
  return [];
}

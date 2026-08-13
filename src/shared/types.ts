export type AudioInputMode = "mic" | "mix-virtual" | "virtualCable";
// "auto" remains accepted only while reading legacy 1.15.x data and is
// normalized to mono before it reaches PluginSettings.
export type AudioChannelMode = "mono" | "multichannel";
export type BubbleSize = "large" | "medium" | "small";
export type PeopleContextMode = "privacy" | "hotwords" | "localFull";
export type QuickDictationTarget = "editor" | "clipboard";

export interface TranscribeProviderSettings {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  language?: string;
  protocol?: string;
  targetLanguage?: string;
  hint?: string;
}

export interface QuickDictationAsrSettings {
  endpoint: string;
  apiKey: string;
  model: string;
  language: string;
}

export interface LlmAsrSnapshot {
  providerId: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  language?: string;
}

export interface LlmProfile {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  asr?: LlmAsrSnapshot;
}

export interface PromptTemplate {
  id: string;
  mode: string;
  name: string;
  prompt: string;
  description?: string;
  baseMode?: string;
  isBuiltin?: boolean;
  customMode?: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndustryProfile {
  industry: string;
  scenarios: string;
  focus: string;
  outputPreference: string;
  generatedAt: string | null;
}

export interface RecruitQuality {
  素质: string;
  定义: string;
  信号: string;
}

export interface RecruitContext {
  jd: string;
  resume: string;
  candidateName: string;
  position: string;
  round: string;
  interviewer: string;
  interviewScene: string;
  seniority: string;
  customNote: string;
  previousInterviewNote: string;
  previousNotePath: string;
  interviewBrief: string;
  savedAt: string | null;
  jdFile?: string;
  generalOutline?: string;
  requiredQualities?: RecruitQuality[];
}

export interface RecruitContextLibraryEntry extends RecruitContext {
  id?: string;
  type?: string;
}

export interface KnowledgeExtractionRecord {
  mtime: number;
  size: number;
  scannedAt: string;
}

export interface KnowledgeExtractionHistory {
  vocabulary: Record<string, KnowledgeExtractionRecord>;
  people: Record<string, KnowledgeExtractionRecord>;
}

export interface PeopleSuggestionCache {
  pending: unknown[];
}

export interface FloatingBallPosition {
  left: number;
  top: number;
}

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  rawBaseUrl: string;
  manifestUrl: string;
  checkedAt: string;
  files: string[];
}

export interface PluginSettings {
  audioFolder: string;
  mdFolder: string;
  meetingMaterialsFolder: string;
  htmlReportFolder: string;
  reportBrandName: string;
  noteFileNameFormatNew: string;
  transcribeEndpoint: string;
  transcribeApiKey: string;
  transcribeModel: string;
  transcribeLanguage: string;
  quickDictationAsr: QuickDictationAsrSettings;
  quickDictationPrompt: string;
  quickDictationTarget: QuickDictationTarget;
  activeTranscribeProvider: string;
  transcribeProviders: Record<string, TranscribeProviderSettings>;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
  llmServicePreset: string;
  llmProfiles: LlmProfile[];
  activeLlmProfile: string;
  polishMode: string;
  polishPromptInterview: string;
  polishPromptMeeting: string;
  polishPromptHuddle: string;
  polishPromptSeminar: string;
  polishPromptMonologue: string;
  polishPromptLearning: string;
  polishPromptRecruit: string;
  promptTemplates: Record<string, PromptTemplate>;
  activeTemplateByMode: Record<string, string>;
  briefingStructureLevel: "loose" | "balanced" | "strict";
  repolishPreferencePromptAddendum: string;
  repolishPreference: string;
  thinkingMode: "auto" | "reasoning" | "fast";
  briefingTranslationMode: string;
  briefingTargetLanguage: string;
  briefingCustomLanguage: string;
  briefingKeepOriginalTerms: boolean;
  briefingLanguageInstruction: string;
  industryProfile: IndustryProfile;
  customVocabulary: string;
  vocabularyFile: string;
  peopleDirectoryFolder: string;
  peopleBaseFile: string;
  learningCardsFolder: string;
  todoCardsFolder: string;
  sedimentAutoExtract: boolean;
  lexVoiceBasesFolder: string;
  peopleContextMode: PeopleContextMode;
  peopleHotwordsConsentAt: string;
  peopleSuggestionIgnores: unknown[];
  peopleSuggestionCache: PeopleSuggestionCache;
  knowledgeExtractionHistory: KnowledgeExtractionHistory;
  inboxFolder: string;
  inboxAutoImport: boolean;
  inboxArchiveSubfolder: string;
  inboxStabilizeDelayMs: number;
  enableInterimOutput: boolean;
  segmentIntervalMinutes: number;
  asrConcurrency: number;
  segmentCacheFolder: string;
  keepSegmentAudioFiles: boolean;
  filterShortRecordings: boolean;
  captureMode: AudioInputMode;
  audioChannelMode: AudioChannelMode;
  selectedVirtualDevice: string;
  selectedMicrophoneDevice: string;
  enableRealtimeOutline: boolean;
  realtimeOutlineDebounceMs: number;
  autoOpenOutlineOnRecord: boolean;
  autoRenameWithTitle: boolean;
  consolidatedLayout: boolean;
  maxRetries: number;
  diagnosticsLogEnabled: boolean;
  diagnosticsLogFolder: string;
  showFloatingBall: boolean;
  bubbleSize: BubbleSize;
  floatingBallPos: FloatingBallPosition;
  autoOpenNoteAfterFinish: boolean;
  autoOpenHtmlReportAfterGenerate: boolean;
  writeDailyMeetingOverview: boolean;
  dailyMeetingOverviewHeading: string;
  dailyMeetingOverviewTemplate: string;
  autoCheckUpdates: boolean;
  lastUpdateCheckAt: string | null;
  availableUpdate: AvailableUpdate | null;
  lastUpdateError: string;
  installedUpdateVersion: string;
  recruitContext: RecruitContext;
  recruitAlwaysAskOnStart: boolean;
  recruitContextLibrary: RecruitContextLibraryEntry[];
  recruitFeatureUnlocked: boolean;
  recruitJdFolderPath: string;
  recruitResumeFolderPath: string;
  recruitResumeDesensitize: boolean;
  recruitHomepagePath: string;
}

export type LexVoiceSettings = PluginSettings;

export interface PersistedPluginSettings {
  schemaVersion: number;
  storage: Record<string, unknown>;
  noteNaming: Record<string, unknown>;
  capture: Record<string, unknown>;
  speech: Record<string, unknown>;
  composer: Record<string, unknown>;
  presentation: Record<string, unknown>;
  vocabulary: Record<string, unknown>;
  views: Record<string, unknown>;
  liveOutline: Record<string, unknown>;
  dailyNote: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  ui: Record<string, unknown>;
  recruiting: Record<string, unknown>;
  updates: Record<string, unknown>;
  quickDictation: Record<string, unknown>;
  promptTemplates: Record<string, PromptTemplate>;
  activeTemplateByMode: Record<string, string>;
}

export interface Segment {
  index: number;
  startOffsetMs: number;
  endOffsetMs: number;
  text: string;
  audioStartOffsetMs?: number;
  audioEndOffsetMs?: number;
  audioName?: string;
  audioPath?: string;
  segmentAudioName?: string;
  segmentAudioPath?: string;
  source?: string;
  sourceName?: string;
  sourcePath?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourcePlatform?: string;
  rawText?: string;
  audioChannelCount?: number;
  speakerIds?: string[];
  error?: string | null;
  isFinal?: boolean;
}

export type QueueTaskStatus = "pending" | "running" | "processing" | "live" | "failed" | "missing" | "blocked";

export interface QueueTaskLifecycle {
  id: string;
  status: QueueTaskStatus;
  retries: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  startedAt?: string;
  lastEventAt?: string;
  attempt?: number;
}

export interface TranscribeQueueTaskPayload {
  type: "transcribe";
  sessionId: string;
  mdPath: string;
  audioPath: string;
  segmentIndex: number;
  audioName?: string;
  sourceAudioPath?: string;
  sourceAudioName?: string;
  masterAudioPath?: string;
  masterAudioName?: string;
  temporarySourcePath?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  audioStartOffsetMs?: number;
  audioEndOffsetMs?: number;
  mode?: string;
  isFinal?: boolean;
  liveSegment?: boolean;
  deferredReason?: string;
  source?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourcePlatform?: string;
  captureMode?: string;
  audioChannelMode?: AudioChannelMode;
  audioChannelCount?: number;
}

export interface MergeQueueTaskPayload {
  type: "merge";
  sessionId: string;
  mdPath: string;
  mode: string;
  segments: Segment[];
  source?: string;
  sourceMeta?: unknown;
  textImportSources?: unknown[];
  recruitContext?: RecruitContext | null;
  sessionMeta?: unknown;
  temporarySourcePath?: string;
}

export interface GeneratePromptQueueTaskPayload {
  type: "generate-prompt";
  mode: string;
  activate?: boolean;
  mdPath?: string;
}

export type QueueTaskPayload = TranscribeQueueTaskPayload | MergeQueueTaskPayload | GeneratePromptQueueTaskPayload;
export type QueueTaskDraft = QueueTaskPayload & Partial<QueueTaskLifecycle>;
export type QueueTask = QueueTaskPayload & QueueTaskLifecycle;

export interface RecordingSession {
  id: string;
  sessionStamp: string;
  startedAt: string;
  mdPath: string;
  mode: string;
  segments: Segment[];
  finalized: boolean;
  source?: string;
  sourceMeta?: unknown;
  captureMode?: string;
  audioChannelCount?: number;
  audioChannelMaxCount?: number;
  audioChannelLabel?: string;
  audioChannelMode?: AudioChannelMode;
  speakerChannels?: Record<string, unknown>;
  channelSeparationMode?: "single" | "device-channels" | "encoder-downmix";
  _channelDownmixNotified?: boolean;
  masterAudioPath?: string;
  masterAudioName?: string;
  multiSourceAudio?: boolean;
  temporarySourcePaths?: string[];
  textImportSources?: unknown[];
  mergedSources?: unknown[];
  continuationBaseSegments?: Segment[];
  continuationOffsetMs?: number;
  continuationSourcePath?: string;
  continuationSourceTitle?: string;
  continuationRecordedAt?: string;
  interviewBrief?: string;
  recruitContext?: RecruitContext | null;
  meetingWorkbench?: unknown;
  pendingMeetingWorkbenchInteractions?: unknown[];
  workProgress?: unknown;
  importActivitySnapshot?: unknown;
  processingStartedAt?: string;
  realtimeOutline?: string;
  realtimeOutlineState?: unknown;
  realtimeOutlineMemory?: string;
  realtimeOutlineCoverage?: unknown;
  realtimeOutlineInput?: unknown;
  realtimeOutlineWindow?: unknown;
  realtimeOutlineSegmentCount?: number;
  realtimeOutlineAttemptedSegmentCount?: number;
  realtimeOutlineAttemptedAt?: string;
  realtimeOutlineWorkbenchSignature?: string;
  realtimeOutlineUpdatedAt?: string;
  realtimeOutlineFailureCount?: number;
  realtimeOutlineNextAllowedAt?: number;
  realtimeOutlineNoChangeCommittedCount?: number;
  realtimeOutlineNoChangeRetryCount?: number;
  jobPortraitCoverage?: unknown;
  followupFeedback?: unknown;
  writeQueue?: Promise<void>;
  segmentPersistQueue?: Promise<void>;
  finalizePromise?: Promise<void> | null;
  liveAsrJobs?: Map<string, unknown>;
  asrCircuitState?: unknown;
  asrBacklogLevel?: string;
  asrDeferredMode?: boolean;
  hasDeferredAsrJobs?: boolean;
  activeSegmentJobs?: number;
  streamingClient?: unknown;
  pcmEncoder?: unknown;
  finalizing?: boolean;
  finalizationError?: string;
  filteredShortRecording?: boolean;
  filteredDurationMs?: number;
  _nextLiveSegmentIndex?: number;
  _interviewBriefBackgroundRunning?: boolean;
  _asrBacklogWarningNotified?: boolean;
  _asrBacklogCriticalNotified?: boolean;
  _asrCircuitOpenNotified?: boolean;
  _segmentCacheWriteFailureNotified?: boolean;
  _segmentTaskPersistFailureNotified?: boolean;
  _emptyAsrNotified?: boolean;
  _silenceNotified?: boolean;
  _finalizeTaskMeter?: unknown;
}

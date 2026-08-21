/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import type { PluginSettings } from "./types";

export const LEGACY_DEFAULT_LIBRARY_PATHS = {
  vocabularyFile: "LexVoice/词汇表.md",
  peopleDirectoryFolder: "LexVoice/人员",
  peopleBaseFile: "LexVoice/人员库.base",
  learningCardsFolder: "LexVoice/学习卡片",
  todoCardsFolder: "LexVoice/待办卡片",
  lexVoiceBasesFolder: "LexVoice/视图",
  diagnosticsLogFolder: "LexVoice/诊断日志",
  archiveFolder: "LexVoice/归档",
  duplicatePeopleArchiveFolder: "LexVoice/归档/重复人员",
} as const;

export const DEFAULT_LIBRARY_PATHS = {
  vocabularyFile: "LexVoice/资料库/词汇表.md",
  peopleDirectoryFolder: "LexVoice/资料库/人员",
  peopleBaseFile: "LexVoice/资料库/视图/人员库.base",
  learningCardsFolder: "LexVoice/资料库/学习卡片",
  todoCardsFolder: "LexVoice/资料库/待办",
  lexVoiceBasesFolder: "LexVoice/资料库/视图",
  diagnosticsLogFolder: "LexVoice/系统/诊断日志",
  archiveFolder: "LexVoice/资料库/归档",
  duplicatePeopleArchiveFolder: "LexVoice/资料库/归档/重复人员",
} as const;

export const DEFAULT_DAILY_MEETING_OVERVIEW_HEADING = "今日会议概要";

export const DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE = [
  "### {{time}} · {{note_link}}",
  "> 模式：{{mode}} · 时长：{{duration}} · 分段：{{segments}} · 模型：{{model}}",
  "",
  "- 核心信息：{{summary}}",
  "",
  "{{todos_block}}",
].join("\n");

export const DEFAULT_SETTINGS: PluginSettings = {
  audioFolder: "LexVoice/录音",
  mdFolder: "LexVoice/转写纪要",
  meetingMaterialsFolder: "LexVoice/会议资料",
  htmlReportFolder: "LexVoice/HTML报告",
  reportBrandName: "",  // recruit/seminar 报告页脚公司名；留空则用纪要里的「公司/」标签。报告不含 logo。
  noteFileNameFormatNew: "YYYY-MM-DD HHmm",

  // —— 转写：多 provider 注册表 ——
  transcribeEndpoint: "https://api.siliconflow.cn/v1/audio/transcriptions",  // 兼容字段（旧版 / 兜底）
  transcribeApiKey: "",
  transcribeModel: "FunAudioLLM/SenseVoiceSmall",
  transcribeLanguage: "auto",

  activeTranscribeProvider: "siliconflow",
  importTranscribeProvider: "dashscope-filetrans",
  importSpeakerDiarization: true,
  importSpeakerCount: 0,
  transcribeProviders: {
    siliconflow: {
      name: "SiliconFlow",
      endpoint: "https://api.siliconflow.cn/v1/audio/transcriptions",
      apiKey: "",
      model: "FunAudioLLM/SenseVoiceSmall",
      language: "auto",
      hint: "国内访问稳定，便宜。准确度中等。",
    },
    openai: {
      name: "OpenAI 官方",
      endpoint: "https://api.openai.com/v1/audio/transcriptions",
      apiKey: "",
      model: "gpt-4o-transcribe",
      language: "",
      hint: "切片转写。准确度天花板。中文人名/专业术语识别强。需海外网络。",
    },
    "openai-diarize": {
      name: "OpenAI · 说话人分离",
      endpoint: "https://api.openai.com/v1/audio/transcriptions",
      apiKey: "",
      model: "gpt-4o-transcribe-diarize",
      language: "",
      protocol: "openai-diarized-transcription",
      hint: "整场录音完成后统一识别，并标注说话人。转写结束时可把说话人编号对应到真实姓名。",
    },
    apimimo: {
      name: "APIMiMo V2.5 ASR",
      endpoint: "https://api.xiaomimimo.com/v1/chat/completions",
      apiKey: "",
      model: "mimo-v2.5-asr",
      language: "auto",
      protocol: "apimimo-chat-input-audio",
      hint: "小米 MiMo 音频识别。Chat Completions input_audio；服务端仅收 wav/mp3（其它格式自动转码切块），单块 base64 ≤10MB；可指定语种 zh/en/auto 提准。",
    },
    "openai-realtime": {
      name: "OpenAI Realtime · 语音转写",
      endpoint: "wss://api.openai.com/v1/realtime",
      apiKey: "",
      model: "gpt-realtime-whisper",
      language: "",
      hint: "流式 ASR，边说边出字幕。$0.017/min ≈ ¥7.2/小时。",
    },
    "openai-realtime-translate": {
      name: "OpenAI Realtime · 语音翻译",
      endpoint: "wss://api.openai.com/v1/realtime/translations",
      apiKey: "",
      model: "gpt-realtime-translate",
      language: "",
      targetLanguage: "zh",
      hint: "流式翻译，70+ 输入 → 13 输出。$0.034/min ≈ ¥14.4/小时。",
    },
    dashscope: {
      name: "阿里云百炼 Paraformer Realtime",
      endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      apiKey: "",
      model: "paraformer-realtime-v2",
      language: "",
      hint: "国内最便宜的流式 ASR，约 ¥3.6/小时。",
    },
    "dashscope-filetrans": {
      name: "阿里云百炼 Fun-ASR",
      endpoint: "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
      apiKey: "",
      model: "fun-asr",
      language: "zh",
      protocol: "dashscope-filetrans",
      hint: "导入音频专用。整文件异步转写，支持说话人分离；普通转写最长 12 小时，开启说话人分离时建议不超过 2 小时。",
    },
    custom: {
      name: "其他转写服务",
      endpoint: "",
      apiKey: "",
      model: "",
      language: "",
      hint: "适合企业内部网关、自建转写服务或第三方转写服务。",
    },
    local: {
      name: "本地转写服务",
      endpoint: "http://127.0.0.1:8000/v1/audio/transcriptions",
      apiKey: "",
      model: "whisper-large-v3",
      language: "zh",
      hint: "适合 Xinference、faster-whisper-server、whisper.cpp 等本地服务；需要能接收音频文件上传并返回 text。",
    },
    whisperx: {
      name: "WhisperX · 带说话人分离（本地）",
      endpoint: "http://127.0.0.1:8000/v1/audio/transcriptions",
      apiKey: "",
      model: "whisper-large-v3",
      language: "zh",
      protocol: "speaker-diarization",
      hint: "本地 WhisperX / whisper-diarization 服务：转写同时做说话人分离。需服务在响应里返回 segments[].speaker（或在 text 内联 [SPEAKER_00]），LexVoice 会自动归一成 [说话人N]。注意：整段导入音频时说话人编号才全程一致；边录边切的分段模式跨段编号可能对不上。",
    },
  },

  llmEndpoint: "https://api.siliconflow.cn/v1/chat/completions",
  llmApiKey: "",
  llmModel: "",
  llmServicePreset: "siliconflow",
  // 已保存的 LLM 配置库（含密钥），切换时无需重输。便利层：
  // 选配置 → 把 endpoint/apiKey/model 灌进上面三个工作字段；编辑工作字段 → 回写当前配置。
  // 所有调用大模型的代码仍只读 llmEndpoint/llmApiKey/llmModel，不受影响。
  llmProfiles: [],           // [{ id, name, endpoint, apiKey, model }]
  activeLlmProfile: "",      // 当前选中的配置 id；空 = 未保存为配置（临时）

  polishMode: "synthesis",
  polishPromptInterview: "",
  polishPromptMeeting: "",
  polishPromptHuddle: "",
  polishPromptSeminar: "",
  polishPromptMonologue: "",
  polishPromptLearning: "",
  polishPromptRecruit: "",

  // 提示词管理：内置提示词负责稳定底稿，自定义提示词负责用户自己的 Prompt 规则
  promptTemplates: {},  // { [id]: { id, mode, name, description, baseMode, prompt, customMode, createdAt, updatedAt } }
  activeTemplateByMode: {},  // 现行主键：mode → 当前启用模板 id；空 = 使用内置默认

  // 结构化程度：loose（散文为主）/ balanced（散文+列表，推荐）/ strict（多层嵌套列表）
  briefingStructureLevel: "balanced",
  repolishPreferencePromptAddendum: "",
  // 右键"重新整理为"时记住的偏好修饰（detailed/concise/structured/natural/expanded 或 ""=不加偏好）。
  repolishPreference: "",
  // 思考档：auto=默认（不动请求）/ reasoning=显式开思维链 / fast=关思维链省 token（仅对可控服务生效，见 llm/thinking.ts）。
  thinkingMode: "auto",

  briefingTranslationMode: "off",
  briefingTargetLanguage: "zh-CN",
  briefingCustomLanguage: "",
  briefingKeepOriginalTerms: true,
  briefingLanguageInstruction: "",

  industryProfile: {
    industry: "",
    scenarios: "",
    focus: "",
    outputPreference: "",
    generatedAt: null,
  },

  customVocabulary: "",
  vocabularyFile: DEFAULT_LIBRARY_PATHS.vocabularyFile,
  peopleDirectoryFolder: DEFAULT_LIBRARY_PATHS.peopleDirectoryFolder,
  peopleBaseFile: DEFAULT_LIBRARY_PATHS.peopleBaseFile,
  learningCardsFolder: DEFAULT_LIBRARY_PATHS.learningCardsFolder,
  todoCardsFolder: DEFAULT_LIBRARY_PATHS.todoCardsFolder,
  sedimentAutoExtract: false,  // 默认关闭：转写完成不自动沉淀，手动点「沉淀」再扫描（省 token）；开启则转写完成后自动扫描并入库

  lexVoiceBasesFolder: DEFAULT_LIBRARY_PATHS.lexVoiceBasesFolder,
  peopleContextMode: "privacy",
  peopleHotwordsConsentAt: "",
  peopleSuggestionIgnores: [],
  peopleSuggestionCache: { pending: [] },
  knowledgeExtractionHistory: { vocabulary: {}, people: {} },

  inboxFolder: "",
  inboxAutoImport: true,
  inboxArchiveSubfolder: "processed",
  inboxStabilizeDelayMs: 3000,

  enableInterimOutput: true,
  segmentIntervalMinutes: 5,
  asrConcurrency: 1,
  segmentCacheFolder: "LexVoice/.cache/segments",
  keepSegmentAudioFiles: false,
  filterShortRecordings: true,

  captureMode: "mic",
  audioChannelMode: "auto", // 自动：多声道设备保留声道，普通单声道麦克风继续使用语音增强
  selectedVirtualDevice: "",  // 用户指定的虚拟声卡 deviceId；空 = 拒绝录制并提示用户选择，插件不自动挑选设备
  selectedMicrophoneDevice: "", // 用户指定的麦克风 deviceId；空 = 使用系统默认输入（非插件挑选），选定设备不可用时直接报错不回退

  enableRealtimeOutline: true,
  realtimeOutlineDebounceMs: 2500, // 读取点有 2500 下限，低于无效
  autoOpenOutlineOnRecord: true,

  autoRenameWithTitle: true,
  consolidatedLayout: true,

  maxRetries: 3,
  diagnosticsLogEnabled: true,
  diagnosticsLogFolder: DEFAULT_LIBRARY_PATHS.diagnosticsLogFolder,

  showFloatingBall: true,
  bubbleSize: "large",  // 悬浮气泡大小：large / medium / small
  floatingBallPos: { left: 60, top: 120 },
  autoOpenNoteAfterFinish: true,
  autoOpenHtmlReportAfterGenerate: true,
  writeDailyMeetingOverview: true,
  dailyMeetingOverviewHeading: DEFAULT_DAILY_MEETING_OVERVIEW_HEADING,
  dailyMeetingOverviewTemplate: DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE,

  autoCheckUpdates: true,
  lastUpdateCheckAt: null,
  availableUpdate: null,
  lastUpdateError: "",
  installedUpdateVersion: "",

  // 招聘面试模式上下文 —— 录音前注入 JD/简历，让 AI 评价有锚点
  recruitContext: {
    jd: "",
    resume: "",
    candidateName: "",
    position: "",
    round: "",
    interviewer: "",
    interviewScene: "",
    seniority: "",  // 初级 / 中级 / 高级 / 资深 / 总监
    customNote: "",
    previousInterviewNote: "",
    previousNotePath: "",
    interviewBrief: "",
    savedAt: null,
  },
  recruitAlwaysAskOnStart: false,  // 默认「下次直接套用此上下文、不再询问」（设计规范 §6 默认开）；录音前不打断，要改事先点铅笔进内联
  recruitContextLibrary: [],      // 历史 JD 列表，便于快速复用
  recruitFeatureUnlocked: false,
  // HR 招聘项目化模块（仅解锁后可见）：JD 库 / 简历库 / 脱敏 / 主页 路径
  recruitJdFolderPath: "JD",
  recruitResumeFolderPath: "简历",
  recruitResumeDesensitize: true,
  recruitHomepagePath: "",
};

export type { LexVoiceSettings, PluginSettings } from "./types";
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

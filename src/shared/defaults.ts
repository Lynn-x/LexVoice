/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export const DEFAULT_DAILY_MEETING_OVERVIEW_HEADING = "今日会议概要";

export const DEFAULT_DAILY_MEETING_OVERVIEW_TEMPLATE = [
  "### {{time}} · {{note_link}}",
  "> 模式：{{mode}} · 时长：{{duration}} · 分段：{{segments}} · 模型：{{model}}",
  "",
  "- 核心信息：{{summary}}",
  "",
  "{{todos_block}}",
].join("\n");

export const DEFAULT_SETTINGS = {
  audioFolder: "LexVoice/录音",
  mdFolder: "LexVoice/转写纪要",
  meetingMaterialsFolder: "LexVoice/会议资料",
  htmlReportFolder: "LexVoice/HTML报告",
  reportBrandName: "",  // recruit/seminar 报告页脚公司名；留空则用纪要里的「公司/」标签。报告不含 logo。
  htmlSlideFolder: "LexVoice/HTML幻灯片",
  pptxSlideFolder: "LexVoice/PPT",
  pptSlideRange: "6-10",
  pptPromptAddendum: "",
  noteFileNameFormatNew: "YYYY-MM-DD HHmm",

  // —— 转写：多 provider 注册表 ——
  transcribeEndpoint: "https://api.siliconflow.cn/v1/audio/transcriptions",  // 兼容字段（旧版 / 兜底）
  transcribeApiKey: "",
  transcribeModel: "FunAudioLLM/SenseVoiceSmall",
  transcribeLanguage: "auto",

  activeTranscribeProvider: "siliconflow",
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

  polishMode: "meeting",
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
  vocabularyFile: "LexVoice/词汇表.md",
  peopleDirectoryFolder: "LexVoice/人员",
  peopleBaseFile: "LexVoice/人员库.base",
  learningCardsFolder: "LexVoice/学习卡片",
  todoCardsFolder: "LexVoice/待办卡片",
  lexVoiceBasesFolder: "LexVoice/视图",
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
  selectedVirtualDevice: "",  // 用户指定的虚拟声卡 deviceId；空 = 拒绝录制并提示用户选择，插件不自动挑选设备
  selectedMicrophoneDevice: "", // 用户指定的麦克风 deviceId；空 = 使用系统默认输入（非插件挑选），选定设备不可用时直接报错不回退

  enableRealtimeOutline: true,
  realtimeOutlineDebounceMs: 2500, // 读取点有 2500 下限，低于无效
  autoOpenOutlineOnRecord: true,

  autoRenameWithTitle: true,
  consolidatedLayout: true,

  maxRetries: 3,
  diagnosticsLogEnabled: true,
  diagnosticsLogFolder: "LexVoice/诊断日志",

  showFloatingBall: true,
  floatingBallPos: { left: 60, top: 120 },
  autoOpenNoteAfterFinish: true,
  autoOpenHtmlReportAfterGenerate: true,
  autoOpenHtmlSlideAfterGenerate: true,
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
    seniority: "",  // 初级 / 中级 / 高级 / 资深 / 总监
    customNote: "",
    interviewBrief: "",
    savedAt: null,
  },
  recruitAlwaysAskOnStart: true,  // 每次开始招聘录音时弹 Modal 确认上下文
  recruitContextLibrary: [],      // 历史 JD 列表，便于快速复用
  recruitFeatureUnlocked: false,
  // HR 招聘项目化模块（仅解锁后可见）：JD 库 / 简历库 / 脱敏 / 主页 路径
  recruitJdFolderPath: "JD",
  recruitResumeFolderPath: "简历",
  recruitResumeDesensitize: true,
  recruitHomepagePath: "",
};
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

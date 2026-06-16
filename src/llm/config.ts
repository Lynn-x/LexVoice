/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { comparableLlmEndpoint } from '../shared/util-llm-endpoint';

export const LLM_SERVICE_PRESETS = [
  {
    id: "siliconflow",
    label: "硅基流动",
    endpoint: DEFAULT_SETTINGS.llmEndpoint,
    endpointHelp: "硅基流动的大模型对话接口地址。通常保持默认即可；LexVoice 会按 Chat Completions 请求发送。",
    keyHelp: "填写硅基流动控制台创建的访问密钥；语音转写同样使用硅基流动时，可以复用同一把密钥。",
    modelPlaceholder: "按硅基流动控制台的模型名称填写",
    modelHelp: "填写硅基流动模型广场或控制台显示的完整模型标识。",
  },
  {
    id: "openai",
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    endpointHelp: "OpenAI 官方 API Base URL。填写到 /v1 即可，LexVoice 会自动补全 /chat/completions。",
    keyHelp: "填写 OpenAI 项目的访问密钥（API Key）。",
    modelPlaceholder: "按 OpenAI 模型名称填写",
    modelHelp: "填写 OpenAI 平台支持的 chat/completions 模型名称。",
  },
  {
    id: "poe",
    label: "Poe",
    endpoint: "https://api.poe.com/v1",
    endpointHelp: "Poe 的 OpenAI 兼容 API Base URL，保持默认即可。一把 Poe Key 即可调用 Claude / GPT / Gemini 等众多模型。",
    keyHelp: "填写 Poe 访问密钥（在 poe.com/api_key 获取）。注意 Poe 按积分计费，每次请求消耗积分。",
    modelPlaceholder: "点击「获取可用模型」选择 Poe bot 名",
    modelHelp: "填 Poe 的 bot 名，区分大小写，必须以 Poe 模型列表返回的名称为准。建议点下方「获取可用模型」直接选择，避免手敲名称导致 404。",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    endpointHelp: "OpenRouter 的 OpenAI 兼容 API Base URL。LexVoice 会自动附加 OpenRouter 建议的应用识别请求头。",
    keyHelp: "填写 OpenRouter 访问密钥（API Key）。不同模型可能由不同上游提供商计费。",
    modelPlaceholder: "按 OpenRouter 模型列表填写，通常带提供商前缀",
    modelHelp: "填写 OpenRouter 模型列表中的完整模型 ID，通常类似 provider/model。",
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    endpoint: "https://api.moonshot.cn/v1",
    endpointHelp: "Moonshot / Kimi 的 API Base URL。填写到 /v1 即可，LexVoice 会自动补全 /chat/completions。",
    keyHelp: "填写 Moonshot 控制台创建的访问密钥（API Key）。",
    modelPlaceholder: "按 Moonshot 控制台的 Kimi 模型名称填写",
    modelHelp: "填写 Moonshot 控制台当前可用的 Kimi 模型名称。",
  },
  {
    id: "dashscope",
    label: "阿里云百炼 / DashScope",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    endpointHelp: "阿里云百炼 OpenAI 兼容模式地址。国内站点通常使用 dashscope.aliyuncs.com/compatible-mode/v1。",
    keyHelp: "填写百炼控制台创建的访问密钥（API Key）。",
    modelPlaceholder: "按百炼控制台的模型名称填写",
    modelHelp: "填写百炼 OpenAI 兼容模式支持的模型名称。",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    endpointHelp: "DeepSeek API Base URL。填写根地址即可，LexVoice 会自动补全 /chat/completions。",
    keyHelp: "填写 DeepSeek 平台创建的访问密钥（API Key）。",
    modelPlaceholder: "按 DeepSeek 控制台的模型名称填写",
    modelHelp: "填写 DeepSeek 控制台支持的模型名称。",
  },
  {
    id: "mimo",
    label: "小米 MiMo",
    endpoint: "https://api.xiaomimimo.com/v1",
    endpointHelp: "小米 MiMo 的 OpenAI 兼容 API Base URL，填到 /v1 即可，LexVoice 会自动补全 /chat/completions。与 MiMo 语音转写共用同一个地址和密钥。",
    keyHelp: "填写小米 MiMo 平台的访问密钥（API Key）。同一把 Key 既能用于语音转写（mimo-v2.5-asr）也能用于 AI 整理（mimo-v2.5-pro），无需分别申请。",
    modelPlaceholder: "mimo-v2.5-pro",
    modelHelp: "推荐 mimo-v2.5-pro（旗舰对话模型），也支持 mimo-v2.5；以 MiMo 控制台模型列表为准。注意 MiMo 是推理模型，max_tokens 太小会把额度耗在思考上、正文为空，纪要整理用的额度足够不受影响。",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    endpointHelp: "智谱开放平台 API Base URL。填写到 /api/paas/v4 即可。",
    keyHelp: "填写智谱开放平台访问密钥（API Key）。",
    modelPlaceholder: "按智谱开放平台的模型名称填写",
    modelHelp: "填写智谱开放平台支持的 GLM 模型名称。",
  },
  {
    id: "volcengine",
    label: "火山方舟",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    endpointHelp: "火山方舟 OpenAI 兼容 API Base URL。不同地域可能不同，以方舟控制台为准。",
    keyHelp: "填写火山方舟访问密钥（API Key）。",
    modelPlaceholder: "填写火山方舟推理接入点或模型标识",
    modelHelp: "火山方舟通常使用推理接入点 ID 或控制台给出的模型标识。",
  },
  {
    id: "hunyuan",
    label: "腾讯混元",
    endpoint: "https://api.hunyuan.cloud.tencent.com/v1",
    endpointHelp: "腾讯混元 OpenAI 兼容 API Base URL。填写到 /v1 即可。",
    keyHelp: "填写腾讯混元访问密钥（API Key）。",
    modelPlaceholder: "按腾讯混元控制台的模型名称填写",
    modelHelp: "填写腾讯混元控制台支持的模型名称。",
  },
  {
    id: "gemini-openai",
    label: "Google Gemini（OpenAI 兼容）",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    endpointHelp: "Gemini 的 OpenAI 兼容入口。填写到 /v1beta/openai 即可。",
    keyHelp: "填写 Google AI Studio 或 Google Cloud 提供的访问密钥（API Key）。",
    modelPlaceholder: "按 Gemini API 的 OpenAI 兼容模型名称填写",
    modelHelp: "填写 Gemini OpenAI 兼容接口支持的模型名称。",
  },
  {
    id: "xai",
    label: "xAI",
    endpoint: "https://api.x.ai/v1",
    endpointHelp: "xAI API Base URL。填写到 /v1 即可。",
    keyHelp: "填写 xAI 控制台创建的访问密钥（API Key）。",
    modelPlaceholder: "按 xAI 控制台的模型名称填写",
    modelHelp: "填写 xAI 控制台支持的模型名称。",
  },
  {
    id: "groq",
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    endpointHelp: "Groq 的 OpenAI 兼容 API Base URL。填写到 /openai/v1 即可。",
    keyHelp: "填写 Groq 控制台创建的访问密钥（API Key）。",
    modelPlaceholder: "按 Groq 控制台的模型名称填写",
    modelHelp: "填写 Groq 控制台支持的模型名称。",
  },
  {
    id: "mistral",
    label: "Mistral",
    endpoint: "https://api.mistral.ai/v1",
    endpointHelp: "Mistral API Base URL。填写到 /v1 即可。",
    keyHelp: "填写 Mistral 控制台创建的访问密钥（API Key）。",
    modelPlaceholder: "按 Mistral 控制台的模型名称填写",
    modelHelp: "填写 Mistral 控制台支持的模型名称。",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    endpoint: "https://api.perplexity.ai",
    endpointHelp: "Perplexity API Base URL。填写根地址即可，LexVoice 会自动补全 /chat/completions。",
    keyHelp: "填写 Perplexity 控制台创建的访问密钥（API Key）。",
    modelPlaceholder: "按 Perplexity 控制台的模型名称填写",
    modelHelp: "填写 Perplexity API 支持的模型名称。",
  },
  {
    id: "openai-compatible-gateway",
    label: "其他 OpenAI 兼容网关 / 中转站",
    endpoint: "",
    endpointHelp: "填写中转站提供的 OpenAI 兼容地址。可填完整 /chat/completions，也可填 Base URL。",
    keyHelp: "填写中转站提供的访问密钥；如果该网关不需要鉴权，可在本地服务场景下留空。",
    modelPlaceholder: "填写该中转站要求的模型名称",
    modelHelp: "以中转站控制台或文档显示的模型名称为准。",
  },
  {
    id: "ollama",
    label: "本地 Ollama",
    endpoint: "http://127.0.0.1:11434/v1",
    endpointHelp: "Ollama 本地 OpenAI 兼容地址。使用默认地址前，应先启动 Ollama。",
    keyHelp: "本地 Ollama 通常不需要访问密钥。",
    modelPlaceholder: "填写本地 Ollama 已安装的模型名称",
    modelHelp: "填写 `ollama list` 中已经安装的模型名称。",
  },
  {
    id: "lmstudio",
    label: "本地 LM Studio",
    endpoint: "http://127.0.0.1:1234/v1",
    endpointHelp: "LM Studio 本地 OpenAI 兼容地址。使用默认地址前，应先启动本地服务器。",
    keyHelp: "本地 LM Studio 通常不需要访问密钥。",
    modelPlaceholder: "填写 LM Studio 当前加载的模型标识",
    modelHelp: "填写 LM Studio 当前服务暴露的模型标识；不确定时查看 LM Studio Server 面板。",
  },
  {
    id: "local-openai-compatible",
    label: "本地 OpenAI 兼容服务",
    endpoint: "http://127.0.0.1:8000/v1",
    endpointHelp: "本地 OpenAI 兼容服务地址，例如 vLLM、Xinference、llama.cpp server。使用前需要先启动服务。",
    keyHelp: "本地服务通常可留空；已配置鉴权时填写对应密钥。",
    modelPlaceholder: "填写 vLLM / Xinference / llama.cpp 等本地服务的模型名称",
    modelHelp: "填写本地服务实际暴露的模型名称。",
  },
];

export const ONE_CARD_PROVIDERS = {
  mimo: {
    label: "小米 MiMo",
    asrProvider: "apimimo",
    llmPreset: "mimo",
    llmEndpoint: "https://api.xiaomimimo.com/v1",
    llmModel: "mimo-v2.5-pro",
    applyDesc: "已用同一把 MiMo Key 配好语音转写（mimo-v2.5-asr）和 AI 整理（mimo-v2.5-pro）。",
  },
  siliconflow: {
    label: "硅基流动",
    asrProvider: "siliconflow",
    llmPreset: "siliconflow",
    llmEndpoint: DEFAULT_SETTINGS.llmEndpoint,
    llmModel: "", // 硅基流动大模型型号多，留给用户在「大模型服务」里选
    applyDesc: "已用同一把硅基流动 Key 配好语音转写（SenseVoiceSmall）和大模型服务；硅基流动大模型型号较多，请到「大模型服务」填一个模型标识后测试连通。",
  },
};

export function getLlmServicePreset(id) {
  return LLM_SERVICE_PRESETS.find(p => p.id === id) || null;
}

export function normalizeLlmProfiles(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    const name = String(item.name || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const profile: Record<string, any> = {
      id,
      name: name || "未命名配置",
      endpoint: String(item.endpoint || "").trim(),
      apiKey: String(item.apiKey || ""),
      model: String(item.model || "").trim(),
    };
    const asr = normalizeSchemeAsrSnapshot(item.asr);
    if (asr) profile.asr = asr;
    out.push(profile);
  }
  return out;
}

export function findLlmProfile(settings, id) {
  if (!id) return null;
  return (settings && Array.isArray(settings.llmProfiles) ? settings.llmProfiles : []).find(p => p.id === id) || null;
}

export function syncWorkingConfigToLlmProfile(settings, id) {
  const profile = findLlmProfile(settings, id);
  if (!profile) return;
  profile.endpoint = settings.llmEndpoint || "";
  profile.apiKey = settings.llmApiKey || "";
  profile.model = settings.llmModel || "";
}

export function applyLlmProfileToWorkingConfig(settings, id) {
  const profile = findLlmProfile(settings, id);
  if (!profile) return false;
  settings.llmEndpoint = profile.endpoint || "";
  settings.llmApiKey = profile.apiKey || "";
  settings.llmModel = profile.model || "";
  settings.activeLlmProfile = id;
  settings.llmServicePreset = inferLlmServicePresetId(settings);
  // 完整方案（带 asr 快照）：一并切换并写入转写服务配置
  const asr = profile.asr;
  if (asr && asr.providerId) {
    const providers = settings.transcribeProviders || (settings.transcribeProviders = {});
    const dft = (DEFAULT_SETTINGS.transcribeProviders || {})[asr.providerId] || {};
    const cur = providers[asr.providerId] || {};
    providers[asr.providerId] = Object.assign({}, cur, {
      name: cur.name || dft.name,
      endpoint: asr.endpoint || cur.endpoint || dft.endpoint || "",
      model: asr.model || cur.model || dft.model || "",
      language: asr.language || cur.language || dft.language || "auto",
      protocol: dft.protocol || cur.protocol,
      apiKey: asr.apiKey || "",
    });
    settings.activeTranscribeProvider = asr.providerId;
  }
  return true;
}

export function inferLlmServicePresetId(settings) {
  const current = comparableLlmEndpoint(settings && settings.llmEndpoint);
  if (!current) return "";
  const matched = LLM_SERVICE_PRESETS.find(p => p.endpoint && comparableLlmEndpoint(p.endpoint) === current);
  return matched ? matched.id : "";
}

export function getActiveLlmServicePresetId(settings) {
  const saved = settings && settings.llmServicePreset ? settings.llmServicePreset : "";
  const preset = getLlmServicePreset(saved);
  if (!preset) return inferLlmServicePresetId(settings);
  if (!preset.endpoint) return saved;
  return comparableLlmEndpoint(preset.endpoint) === comparableLlmEndpoint(settings && settings.llmEndpoint)
    ? saved
    : inferLlmServicePresetId(settings);
}

export function getLlmOutputCeiling(settings) {
  // 纯按 model 名判定，不掺 endpoint——避免"未知本地模型 + claude/deepseek 命名的中转域名"被误判成大上限后超限 400。
  const model = String((settings && settings.llmModel) || "").toLowerCase();
  if (!model) return LLM_OUTPUT_CEILING_FALLBACK;
  // DeepSeek：V4 系列（v4-pro/v4-flash）与 V3.2+ 真实 384K，给充裕但留冗余的 64000；旧 chat/reasoner/V3 仍是 8192。
  if (/deepseek/.test(model)) {
    if (/v4|v3\.[2-9]/.test(model)) return 64000;
    return LLM_OUTPUT_CEILING_FALLBACK;
  }
  // Claude / Anthropic（含 opus/sonnet/haiku/fable 命名）。⚠️旧 3.5 上限只有 8192，必须先判，
  // 否则会被下面的 sonnet/haiku 分支抢先误给 48000 → 旧 3.5 超限 400。
  if (/claude|anthropic|opus|sonnet|haiku|fable/.test(model)) {
    if (/3-5|3\.5/.test(model)) return LLM_OUTPUT_CEILING_FALLBACK; // claude-3-5-sonnet / 3.5-haiku = 8192
    if (/opus|fable/.test(model)) return 96000;                    // 真实 128K
    if (/sonnet|haiku/.test(model)) return 48000;                  // 真实 64K
    return 32000;                                                  // 其它/未来 Claude：保守，仍远低于 64K+
  }
  // OpenAI GPT-4o / 4.1 / 4-turbo：16384 → 留冗余给 15000。裸 gpt-4（8192）落入下面安全回退。
  if (/gpt-4o|gpt-4\.1|gpt-4-turbo/.test(model)) return 15000;
  // 通义千问 / GLM / Kimi / Doubao / 本地 / 其它一律回退安全值（多为 8K，超限多半 400，宁少勿超）。
  return LLM_OUTPUT_CEILING_FALLBACK;
}

export function getBriefingMergeDesiredTokens(stats) {
  const durationMs = Math.max(0, Number(stats && stats.durationMs) || 0);
  const transcriptChars = Math.max(0, Number(stats && stats.transcriptChars) || 0);
  const segmentCount = Math.max(0, Number(stats && stats.segmentCount) || 0);
  const hours = durationMs / 3600000;
  const isUltraLong = hours >= 4 || transcriptChars >= 120000 || segmentCount >= 48;
  const isLong = hours >= 2 || transcriptChars >= 60000 || segmentCount >= 24;
  const isMediumLong = hours >= 1 || transcriptChars >= 30000 || segmentCount >= 12;
  if (isUltraLong) return BRIEFING_MERGE_MAX_TOKENS_ULTRA;
  if (isLong) return BRIEFING_MERGE_MAX_TOKENS_LONG;
  if (isMediumLong) return BRIEFING_MERGE_MAX_TOKENS_MEDIUM;
  return BRIEFING_MERGE_MAX_TOKENS_SHORT;
}

export function getBriefingMergeMaxTokens(stats, settings) {
  const desired = getBriefingMergeDesiredTokens(stats);
  const ceiling = settings ? getLlmOutputCeiling(settings) : LLM_OUTPUT_CEILING_FALLBACK;
  return Math.min(desired, ceiling);
}

export const BRIEFING_MERGE_MAX_TOKENS_SHORT = 4096;

export const BRIEFING_MERGE_MAX_TOKENS_MEDIUM = 8192;

export const BRIEFING_MERGE_MAX_TOKENS_LONG = 16000;

export const BRIEFING_MERGE_MAX_TOKENS_ULTRA = 32000;

export const LLM_OUTPUT_CEILING_FALLBACK = 8000;

export function normalizeSchemeAsrSnapshot(asr) {
  if (!asr || typeof asr !== "object") return undefined;
  const providerId = String(asr.providerId || "").trim();
  if (!providerId) return undefined;
  return {
    providerId,
    apiKey: String(asr.apiKey || ""),
    endpoint: String(asr.endpoint || "").trim(),
    model: String(asr.model || "").trim(),
    language: String(asr.language || "").trim(),
  };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export const AUDIO_EXT = new Set(["webm", "mp3", "m4a", "aac", "acc", "wav", "ogg", "flac", "mp4", "mpeg", "mpga", "oga"]);

export const TEXT_IMPORT_EXT = new Set(["md", "txt"]);

export const IMPORT_TEXT_CATEGORY_CONFIG = {
  "lexvoice-normal": {
    label: "已整理 LexVoice 纪要",
    shortLabel: "正常稿",
    desc: "已经完成 AI 整理，可用于多篇合并、换模板重整或转成其他模式。",
  },
  "lexvoice-repair": {
    label: "待修复 / 碎片 LexVoice 转写",
    shortLabel: "待修复",
    desc: "包含转写失败、整理失败、只有原始分段或零散内容，适合重新整理。",
  },
  external: {
    label: "外部 MD / TXT 速录稿",
    shortLabel: "外部稿",
    desc: "用户手写速录、第三方纪要或普通 Markdown，不调用语音转写，直接交给 LLM 整理。",
  },
};

export const IMPORT_TEXT_CATEGORY_ORDER = ["lexvoice-normal", "lexvoice-repair", "external"];

export const VIRTUAL_CABLE_PATTERNS = [
  // Windows
  /CABLE Output/i,             // VB-Cable
  /VB-Audio Virtual Cable/i,
  /Virtual Audio Cable/i,      // 商业版 VAC
  /VoiceMeeter Output/i,       // VoiceMeeter Banana / Potato
  /VoiceMeeter Aux Output/i,
  /VoiceMeeter VAIO[3]? Output/i,
  /立体声混音/i,
  /Stereo Mix/i,
  // macOS
  /^BlackHole/i,               // BlackHole 2ch / 16ch
  /Loopback Audio/i,           // Rogue Amoeba Loopback
  /Soundflower/i,
  /Existential Audio/i,
  /SoundWire/i,                // Network audio bridge, not a local physical mic
  // Linux
  /Monitor of /i,              // PulseAudio loopback monitor sources
  /pulse_monitor/i,
];
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */

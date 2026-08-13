import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/"),
  TFile: class TFile {},
  TFolder: class TFolder {},
}));
import {
  buildMicrophoneAudioConstraints,
  buildSpeakerMappings,
  clampSpeakerChannelCount,
  extractSpeakerIdsFromMarkdown,
  normalizeAudioChannelMode,
  normalizeSpeakerMappings,
  replaceSpeakerDisplayName,
  shouldUseIndependentChannelTranscription,
} from "../src/audio/channel-speakers";
import {
  analyzeAudioBufferChannels,
  deduplicateOverlappingSpeakerParts,
  formatChannelTranscript,
  limitSpeakerAudioSpans,
  planSpeakerAudioSpans,
} from "../src/asr/channel-transcription";

function makeAudioBuffer(channels: Float32Array[], sampleRate = 1_000): AudioBuffer {
  const length = Math.max(...channels.map((channel) => channel.length));
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (index: number) => channels[index],
  } as unknown as AudioBuffer;
}

describe("hardware channel speaker mapping", () => {
  it("migrates legacy auto mode to mono and only splits channels after explicit opt-in", () => {
    expect(normalizeAudioChannelMode("auto")).toBe("mono");
    expect(normalizeAudioChannelMode(undefined)).toBe("mono");
    expect(shouldUseIndependentChannelTranscription("auto")).toBe(false);
    expect(shouldUseIndependentChannelTranscription("mono")).toBe(false);
    expect(shouldUseIndependentChannelTranscription("multichannel")).toBe(true);
    expect(buildMicrophoneAudioConstraints({ channelMode: "auto", deviceId: "dji-rx" })).toMatchObject({
      deviceId: { exact: "dji-rx" },
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(buildMicrophoneAudioConstraints({ channelMode: "multichannel", targetChannels: 4 })).toMatchObject({
      channelCount: { ideal: 4 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it("supports one to four stable speaker channels", () => {
    expect(clampSpeakerChannelCount(0)).toBe(1);
    expect(clampSpeakerChannelCount(2)).toBe(2);
    expect(clampSpeakerChannelCount(8)).toBe(4);
    expect(Object.keys(buildSpeakerMappings(4))).toEqual(["spk-1", "spk-2", "spk-3", "spk-4"]);
  });

  it("extracts durable speaker ids and keeps existing person mappings", () => {
    const markdown = [
      "<!-- lexvoice-speaker:spk-1 -->",
      "**说话人 1：** 第一段",
      "",
      "<!-- lexvoice-speaker:spk-3 -->",
      "**说话人 3：** 第三段",
    ].join("\n");
    const ids = extractSpeakerIdsFromMarkdown(markdown);
    expect(ids).toEqual(["spk-1", "spk-3"]);
    expect(normalizeSpeakerMappings({ "spk-1": { personName: "林女士" } }, ids)).toMatchObject({
      "spk-1": { channel: 1, label: "说话人1", personName: "林女士" },
      "spk-3": { channel: 3, label: "说话人3" },
    });
  });

  it("can remap a display name without deleting the channel anchor", () => {
    const markdown = [
      "<!-- lexvoice-speaker:spk-1 -->",
      "**说话人 1：** 先说第一件事。",
      "",
      "<!-- lexvoice-speaker:spk-2 -->",
      "**说话人 2：** 我来补充。",
      "",
      "<!-- lexvoice-speaker:spk-1 -->",
      "**说话人 1：** 再补一句。",
    ].join("\n");
    const first = replaceSpeakerDisplayName(markdown, "spk-1", "胡女士");
    expect(first.replacements).toBe(2);
    expect(first.markdown.match(/lexvoice-speaker:spk-1/g)).toHaveLength(2);
    expect(first.markdown).toContain("**胡女士：** 先说第一件事。");
    expect(first.markdown).toContain("**说话人 2：** 我来补充。");

    const remapped = replaceSpeakerDisplayName(first.markdown, "spk-1", "胡悲伤");
    expect(remapped.replacements).toBe(2);
    expect(remapped.markdown).not.toContain("**胡女士：**");
    expect(remapped.markdown).toContain("**胡悲伤：**");
  });
});

describe("multichannel transcription planning", () => {
  it("removes overlapping cross-channel copies and keeps the louder channel", () => {
    const result = deduplicateOverlappingSpeakerParts([
      { speakerId: "spk-1", channel: 1, startMs: 1_000, endMs: 5_000, peakRms: 0.22, text: "我们下一步先确认产品范围，再安排试点。" },
      { speakerId: "spk-2", channel: 2, startMs: 1_200, endMs: 4_900, peakRms: 0.08, text: "我们下一步先确认产品范围，再安排试点" },
    ]);
    expect(result.removed).toBe(1);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].channel).toBe(1);
  });

  it("keeps repeated wording when it occurs at different times", () => {
    const result = deduplicateOverlappingSpeakerParts([
      { speakerId: "spk-1", channel: 1, startMs: 1_000, endMs: 3_000, peakRms: 0.22, text: "这个方案可以继续推进。" },
      { speakerId: "spk-2", channel: 2, startMs: 5_000, endMs: 7_000, peakRms: 0.18, text: "这个方案可以继续推进。" },
    ]);
    expect(result.removed).toBe(0);
    expect(result.parts).toHaveLength(2);
  });

  it("keeps different simultaneous speech on separate channels", () => {
    const result = deduplicateOverlappingSpeakerParts([
      { speakerId: "spk-1", channel: 1, startMs: 1_000, endMs: 4_000, peakRms: 0.22, text: "我负责整理需求和排期。" },
      { speakerId: "spk-2", channel: 2, startMs: 1_200, endMs: 4_200, peakRms: 0.18, text: "我补充一下预算和供应商情况。" },
    ]);
    expect(result.removed).toBe(0);
    expect(result.parts).toHaveLength(2);
  });

  it("distinguishes separated channel content from duplicated stereo", () => {
    const left = new Float32Array(4_000);
    const right = new Float32Array(4_000);
    for (let i = 0; i < 1_800; i++) left[i] = Math.sin(i / 9) * 0.2;
    for (let i = 2_000; i < 3_900; i++) right[i] = Math.sin(i / 13) * 0.18;
    const separated = analyzeAudioBufferChannels(makeAudioBuffer([left, right]));
    expect(separated.channelCount).toBe(2);
    expect(separated.channels.filter((channel) => channel.active)).toHaveLength(2);
    expect(separated.separation).toBe("separated");

    const duplicated = analyzeAudioBufferChannels(makeAudioBuffer([left, left.slice()]));
    expect(duplicated.separation).toBe("duplicated");
    expect(duplicated.pairs[0].correlation).toBeGreaterThan(0.995);
  });

  it("does not claim separation when only one channel has a useful sample", () => {
    const active = new Float32Array(2_000).fill(0.1);
    const silent = new Float32Array(2_000);
    const result = analyzeAudioBufferChannels(makeAudioBuffer([active, silent]));
    expect(result.separation).toBe("inconclusive");
  });

  it("detects separated speech windows on independent channels", () => {
    const ch1 = new Float32Array(4_000);
    const ch2 = new Float32Array(4_000);
    ch1.fill(0.12, 250, 1_500);
    ch2.fill(0.16, 2_000, 3_500);
    const spans = planSpeakerAudioSpans([ch1, ch2], 1_000, {
      frameMs: 250,
      mergeGapMs: 500,
    });
    expect(spans.some((span) => span.channel === 1 && span.startMs < 750 && span.endMs > 1_000)).toBe(true);
    expect(spans.some((span) => span.channel === 2 && span.startMs < 2_500 && span.endMs > 3_000)).toBe(true);
    expect(spans[0].channel).toBe(1);
  });

  it("caps ASR sub-jobs by merging the nearest spans on the same channel", () => {
    const spans = Array.from({ length: 16 }, (_item, index) => {
      const channel = index % 4 + 1;
      return {
        speakerId: `spk-${channel}` as const,
        channel,
        startMs: index * 2_000,
        endMs: index * 2_000 + 1_000,
        peakRms: 0.2,
      };
    });
    const limited = limitSpeakerAudioSpans(spans, 8);
    expect(limited).toHaveLength(8);
    expect(new Set(limited.map((span) => span.channel))).toEqual(new Set([1, 2, 3, 4]));
    expect(limited.every((span) => span.endMs > span.startMs)).toBe(true);
  });

  it("keeps the per-utterance timeline on long recordings instead of merging across silence", () => {
    // 30 分钟双人会议：两声道交替发言，同声道相邻两段之间隔约 55 秒（远超合并阈值）。
    // 旧实现会把它们压成 8 个跨越数分钟静音的巨块，破坏逐句时间线并撑大单次 ASR 音频。
    const spans = Array.from({ length: 60 }, (_item, index) => {
      const channel = index % 2 + 1;
      const startMs = index * 30_000;
      return {
        speakerId: `spk-${channel}` as const,
        channel,
        startMs,
        endMs: startMs + 5_000,
        peakRms: 0.2,
      };
    });
    const limited = limitSpeakerAudioSpans(spans, 8);
    expect(limited.length).toBeGreaterThan(8);
    // 没有任何一段被合并成跨越静音的巨块
    const longestSpanMs = Math.max(...limited.map((span) => span.endMs - span.startMs));
    expect(longestSpanMs).toBeLessThanOrEqual(60_000);
  });

  it("still merges same-channel spans that sit close together", () => {
    // 间隔很小的同声道碎片仍应合并，避免把一句话切成很多次 ASR 调用。
    const spans = Array.from({ length: 12 }, (_item, index) => ({
      speakerId: "spk-1" as const,
      channel: 1,
      startMs: index * 1_500,
      endMs: index * 1_500 + 1_000,
      peakRms: 0.2,
    }));
    const limited = limitSpeakerAudioSpans(spans, 4);
    expect(limited.length).toBeLessThan(spans.length);
    expect(limited.every((span) => span.endMs > span.startMs)).toBe(true);
  });

  it("formats stable channel anchors and merges adjacent speech by the same speaker", () => {
    const text = formatChannelTranscript([
      { speakerId: "spk-1", channel: 1, startMs: 0, endMs: 1_000, peakRms: 0.2, text: "第一句。" },
      { speakerId: "spk-1", channel: 1, startMs: 1_500, endMs: 2_500, peakRms: 0.2, text: "第二句。" },
      { speakerId: "spk-2", channel: 2, startMs: 3_000, endMs: 4_000, peakRms: 0.2, text: "回应。" },
    ]);
    expect(text.match(/lexvoice-speaker:spk-1/g)).toHaveLength(1);
    expect(text).toContain("**说话人1：** 第一句。 第二句。");
    expect(text).toContain("<!-- lexvoice-speaker:spk-2 -->");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const channelSpeakerSource = readFileSync(new URL("../src/audio/channel-speakers.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/shared/settings-io.ts", import.meta.url), "utf8");

describe("release runtime contracts", () => {
  it("does not retain calls to the excluded video time-link helper", () => {
    expect(mainSource).not.toMatch(/\bgetSegmentTimeLink\s*\(/);
  });

  it("builds realtime-outline and merge anchors from the existing audio helpers", () => {
    expect(mainSource).toContain(
      "getAudioTimeLink(s.audioName, getSegmentAudioLinkOffsetMs(s))",
    );
    expect(mainSource).toContain(
      "getAudioTimeLink(segment && segment.audioName, getSegmentAudioLinkOffsetMs(segment))",
    );
    expect(mainSource).toContain(
      "getAudioTimeLink(seg.audioName, getSegmentAudioLinkOffsetMs(seg))",
    );
  });

  it("requires explicit multichannel opt-in in recording and retry paths", () => {
    expect(mainSource).not.toContain('channelMode !== "mono"');
    expect(mainSource).not.toMatch(/channelTranscription\s*=\s*inspectRecordedChannels\s*\|\|/);
    expect(mainSource.match(/shouldUseIndependentChannelTranscription\(channelMode\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps legacy auto settings on the mono-safe path", () => {
    expect(channelSpeakerSource).toContain('return mode === "multichannel" ? "multichannel" : "mono"');
    expect(settingsSource).toContain('const AUDIO_CHANNEL_MODES = ["mono", "multichannel"] as const');
    expect(settingsSource).not.toContain('const AUDIO_CHANNEL_MODES = ["auto"');
  });
});

export const MAX_SPEAKER_CHANNELS = 4;
export const DEFAULT_SPEAKER_CHANNELS = 2;

export type SpeakerId = `spk-${number}`;
export type AudioChannelMode = "auto" | "mono" | "multichannel";

export interface AudioChannelInfo {
  channelCount: number;
  maxChannelCount: number;
  label: string;
  deviceId: string;
  negotiated: boolean;
}
export interface SpeakerMapping {
  id: SpeakerId;
  channel: number;
  label: string;
  personName?: string;
  personPath?: string;
}

type ExtendedTrackCapabilities = MediaTrackCapabilities & {
  channelCount?: { min?: number; max?: number };
};

type ExtendedTrackSettings = MediaTrackSettings & {
  channelCount?: number;
};

function finiteChannelCount(value: unknown, fallback = 1): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : fallback;
}

export function normalizeAudioChannelMode(value: unknown): AudioChannelMode {
  const mode = String(value || "").trim().toLowerCase();
  // 1.15.0/1.15.1 stored "auto" for most users. A multi-channel device only
  // proves that the recording has multiple channels; it does not prove that
  // each channel contains one isolated speaker. Treat every legacy/unknown
  // value as mono and require an explicit multichannel opt-in.
  return mode === "multichannel" ? "multichannel" : "mono";
}

export function shouldUseIndependentChannelTranscription(value: unknown): boolean {
  return normalizeAudioChannelMode(value) === "multichannel";
}

export function buildMicrophoneAudioConstraints(options: {
  deviceId?: string;
  channelMode?: AudioChannelMode | "auto";
  mobile?: boolean;
  targetChannels?: number;
} = {}): MediaTrackConstraints {
  const mode = normalizeAudioChannelMode(options.channelMode);
  const deviceId = String(options.deviceId || "").trim();
  const mobile = !!options.mobile;
  const preserveChannels = !mobile && shouldUseIndependentChannelTranscription(mode);
  const targetChannels = Math.max(1, Math.min(
    MAX_SPEAKER_CHANNELS,
    finiteChannelCount(options.targetChannels, DEFAULT_SPEAKER_CHANNELS),
  ));
  return {
    ...(deviceId && !mobile ? { deviceId: { exact: deviceId } } : {}),
    channelCount: { ideal: preserveChannels ? targetChannels : 1 },
    echoCancellation: !preserveChannels,
    noiseSuppression: !preserveChannels,
    autoGainControl: !preserveChannels,
  };
}

export function clampSpeakerChannelCount(value: unknown): number {
  return Math.max(1, Math.min(MAX_SPEAKER_CHANNELS, finiteChannelCount(value)));
}

export function speakerIdForChannel(channel: number): SpeakerId {
  return `spk-${clampSpeakerChannelCount(channel)}`;
}

export function speakerLabelForChannel(channel: number): string {
  return `说话人${clampSpeakerChannelCount(channel)}`;
}

export function readAudioTrackChannelInfo(track: MediaStreamTrack | null | undefined): AudioChannelInfo {
  const settings = track && typeof track.getSettings === "function"
    ? track.getSettings() as ExtendedTrackSettings
    : {} as ExtendedTrackSettings;
  let capabilities = {} as ExtendedTrackCapabilities;
  try {
    capabilities = track && typeof track.getCapabilities === "function"
      ? track.getCapabilities() as ExtendedTrackCapabilities
      : {} as ExtendedTrackCapabilities;
  } catch {
    capabilities = {} as ExtendedTrackCapabilities;
  }
  const channelCount = clampSpeakerChannelCount(settings.channelCount);
  const maxChannelCount = clampSpeakerChannelCount(capabilities.channelCount?.max || channelCount);
  return {
    channelCount,
    maxChannelCount,
    label: String(track?.label || ""),
    deviceId: String(settings.deviceId || ""),
    negotiated: false,
  };
}

export async function negotiateAudioTrackChannels(
  track: MediaStreamTrack | null | undefined,
  maxChannels = MAX_SPEAKER_CHANNELS,
): Promise<AudioChannelInfo> {
  const before = readAudioTrackChannelInfo(track);
  if (!track || typeof track.applyConstraints !== "function") return before;
  const target = Math.max(1, Math.min(clampSpeakerChannelCount(maxChannels), before.maxChannelCount));
  if (target <= 1) return before;
  try {
    await track.applyConstraints({
      channelCount: { ideal: target },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    return { ...readAudioTrackChannelInfo(track), negotiated: true };
  } catch {
    return before;
  }
}

export async function configureMicrophoneTrackChannels(
  track: MediaStreamTrack | null | undefined,
  channelMode: AudioChannelMode | "auto",
  targetChannels = DEFAULT_SPEAKER_CHANNELS,
): Promise<AudioChannelInfo> {
  const mode = normalizeAudioChannelMode(channelMode);
  if (!shouldUseIndependentChannelTranscription(mode)) return readAudioTrackChannelInfo(track);
  return negotiateAudioTrackChannels(track, targetChannels);
}

export function buildSpeakerMappings(
  channelCount: unknown,
  raw: unknown = {},
): Record<SpeakerId, SpeakerMapping> {
  const count = clampSpeakerChannelCount(channelCount);
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const mappings = {} as Record<SpeakerId, SpeakerMapping>;
  for (let channel = 1; channel <= count; channel++) {
    const id = speakerIdForChannel(channel);
    const item = source[id] && typeof source[id] === "object"
      ? source[id] as Record<string, unknown>
      : {};
    mappings[id] = {
      id,
      channel,
      label: speakerLabelForChannel(channel),
      personName: String(item.personName || item.name || "").trim() || undefined,
      personPath: String(item.personPath || item.path || "").trim() || undefined,
    };
  }
  return mappings;
}

export function extractSpeakerIdsFromMarkdown(markdown: string): SpeakerId[] {
  const text = String(markdown || "");
  const found = new Set<SpeakerId>();
  for (const match of text.matchAll(/<!--\s*lexvoice-speaker:(spk-(\d+))\s*-->/gi)) {
    found.add(speakerIdForChannel(Number(match[2])));
  }
  for (const match of text.matchAll(/(?:\[|\*\*)说话人\s*(\d+)(?:\]|\s*[：:]\*\*)/g)) {
    found.add(speakerIdForChannel(Number(match[1])));
  }
  return Array.from(found).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

export function normalizeSpeakerMappings(
  raw: unknown,
  speakerIds: SpeakerId[],
): Record<SpeakerId, SpeakerMapping> {
  const maxChannel = speakerIds.reduce((max, id) => Math.max(max, Number(id.slice(4)) || 1), 1);
  const mappings = buildSpeakerMappings(maxChannel, raw);
  const allowed = new Set(speakerIds);
  return Object.fromEntries(
    Object.entries(mappings).filter(([id]) => allowed.has(id as SpeakerId)),
  ) as Record<SpeakerId, SpeakerMapping>;
}

export function replaceSpeakerDisplayName(
  markdown: string,
  speakerId: SpeakerId,
  personName: string,
): { markdown: string; replacements: number } {
  const channel = clampSpeakerChannelCount(Number(speakerId.slice(4)));
  const safeName = String(personName || "").replace(/[\r\n]+/g, " ").trim();
  if (!safeName) return { markdown: String(markdown || ""), replacements: 0 };
  const anchored = new RegExp(
    `(<!--\\s*lexvoice-speaker:${speakerId}\\s*-->\\s*\\n?\\s*)\\*\\*[^*\\n]{1,80}[：:]\\*\\*`,
    "gi",
  );
  let replacements = 0;
  let next = String(markdown || "").replace(anchored, (_match, prefix: string) => {
    replacements += 1;
    return `${prefix}**${safeName}：**`;
  });
  const bold = new RegExp(`\\*\\*说话人\\s*${channel}[：:]\\*\\*`, "g");
  next = next.replace(bold, () => {
    replacements += 1;
    return `**${safeName}：**`;
  });
  const bracket = new RegExp(`\\[说话人\\s*${channel}\\]`, "g");
  next = next.replace(bracket, () => {
    replacements += 1;
    return `[${safeName}]`;
  });
  const result = { markdown: next, replacements };
  return result;
}

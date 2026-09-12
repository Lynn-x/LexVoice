# Privacy

LexVoice is an Obsidian plugin for recording, transcription, and AI-assisted note organization.

## Local data

LexVoice stores plugin settings locally in your vault under:

```
.obsidian/plugins/lexvoice/data.json
```

This file may contain service addresses, model names, API keys, prompt templates, queue items, and user-entered context. It is intentionally excluded from the repository by `.gitignore` and should not be committed or included in public release archives.

## Network access

LexVoice does not include analytics, advertising, or telemetry. It may make network requests only when you use or enable features that require them:

LexVoice does not operate its own cloud storage service and does not upload recordings to a LexVoice server. If recording is enabled, audio files are saved only to the local Obsidian vault path chosen by the user.


- Speech-to-text requests send audio data to the transcription service configured by the user.
- AI organization requests send transcript text and prompt context to the large-language-model service configured by the user.
- Optional meeting-material extraction sends relevant text or page images to the configured AI organization service after material use is enabled. Explicit Markdown templates can be parsed locally without a model request.
- Update checks may request release files from the GitHub/raw URL configured by the user.
- Documentation links in settings open external web pages in the system browser.

If you configure a third-party API provider, that provider's own terms and privacy policy apply to the content you send to it.

## Meeting preparation

Preparation stays in the meeting Markdown file: attendees in YAML, and topics, agendas and manually entered questions in the body. Original attachments and extraction caches are stored locally in the vault. They are user data and must not be included in a plugin release.

The per-note `lexvoice_context_use` option is off by default. Enabling it allows material extraction and lets the configured transcription and organization services use relevant names and background. Image and scanned-PDF extraction requires a model that accepts images. Turning the option off stops future material use through this workflow; it does not recall requests already sent to a provider.

Preparation is reference material, not evidence that a meeting decision occurred. Final responses use transcript excerpts, and sediment extraction excludes the preparation block. Explicitly asking other note-based features to process a note may send the text included in that request; the preparation option is not a general content-level access control for every plugin or external tool.

Dragging a note from the desktop sidebar exposes the file or its path to the target application chosen by the user.

## Sensitive content

Recordings and transcripts may contain personal, confidential, or regulated information. Users are responsible for obtaining consent where required and for choosing appropriate API providers and retention practices.

If content is confidential, private, client-related, medical, legal, HR-related, or otherwise sensitive, use local speech-to-text and a local large-language model. Do not process sensitive content through cloud APIs unless you have confirmed that doing so is acceptable for your use case and compliance obligations.

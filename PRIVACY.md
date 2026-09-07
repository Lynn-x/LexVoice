# Privacy

LexVoice is an Obsidian desktop plugin for recording, transcription, and AI-assisted note organization.

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
- Update checks may request release files from the GitHub/raw URL configured by the user.
- Documentation links in settings open external web pages in the system browser.

If you configure a third-party API provider, that provider's own terms and privacy policy apply to the content you send to it.

## Sensitive content

Recordings and transcripts may contain personal, confidential, or regulated information. Users are responsible for obtaining consent where required and for choosing appropriate API providers and retention practices.

If content is confidential, private, client-related, medical, legal, HR-related, or otherwise sensitive, use local speech-to-text and a local large-language model. Do not process sensitive content through cloud APIs unless you have confirmed that doing so is acceptable for your use case and compliance obligations.

# Third-Party Notices

## mux.js

- Source: https://github.com/videojs/mux.js
- Version: 7.1.0
- Use: streaming ADTS AAC frame parsing without audio decoding; only the parser and its local utilities are bundled.
- Copyright (c) Brightcove, Inc.
- License: Apache-2.0; full text is preserved in [`licenses/mux-js-Apache-2.0.txt`](licenses/mux-js-Apache-2.0.txt) and embedded in `main.js`.

LexVoice is shipped as `main.js`, a stylesheet, and a manifest. The JavaScript bundle includes the libraries listed below; not shipping a `node_modules` directory does not remove their license obligations. Third-party licenses apply to their respective components independently of the LexVoice Proprietary License.

## Bundled library: ws

- Project: https://github.com/websockets/ws
- License: MIT; full upstream copyright and permission text is preserved in [`licenses/ws-MIT.txt`](licenses/ws-MIT.txt) and embedded in `main.js`.
- Usage: the Node implementation is bundled and loaded lazily for desktop WebSocket authentication. Optional native accelerators are not bundled.
- The build checks the preserved notice against the installed dependency's license. Dependency changes require a new license review before distribution.

## Bundled library: mp3-parser

- Project: https://github.com/biril/mp3-parser (version 0.3.0).
- License: MIT; the upstream notice is preserved in [`licenses/mp3-parser-MIT.txt`](licenses/mp3-parser-MIT.txt) and embedded in `main.js`.
- Usage: reads MPEG audio frame headers for local, bounded-memory MP3 slicing. No external program or service is used by this parser.

## Previously MIT-licensed LexVoice material

LexVoice 2.1.2 and earlier MIT-licensed releases retain their original terms. The original notice is preserved in [`licenses/LEXVOICE-LEGACY-MIT.txt`](licenses/LEXVOICE-LEGACY-MIT.txt) and embedded in `main.js`. Its presence preserves rights in previously licensed material; it does not grant an MIT license to new proprietary material. The new license does not restrict MIT rights in old portions reused in newer versions.

## Runtime platform

- Obsidian API: LexVoice runs as an Obsidian community plugin and uses Obsidian's plugin API. Obsidian and its API belong to the Obsidian team.
- Electron / browser APIs: desktop-only recording and external-link behavior may rely on APIs available in Obsidian's desktop runtime, including the `MediaRecorder`, `AudioContext`, and `WebSocket` interfaces, and the optional Node `ws` module exposed by Obsidian's renderer.

## Optional external services

LexVoice can be configured to call external transcription or AI services. The plugin sends audio, transcript text, or prompt context to whichever endpoint the user configures. Supported integration shapes include:

- SiliconFlow audio transcription (HTTP, OpenAI-compatible)
- OpenAI audio transcription (HTTP, e.g. `gpt-4o-transcribe`)
- OpenAI Realtime API for streaming transcription (`gpt-realtime-whisper`) and live translation (`gpt-realtime-translate`)
- Alibaba Cloud Model Studio / DashScope `paraformer-realtime-v2` over WebSocket
- OpenAI-compatible chat completion endpoints for note organization
- Local transcription services that expose an OpenAI-compatible HTTP endpoint (e.g. faster-whisper-server, Xinference, whisper.cpp wrappers)

These services are not bundled with LexVoice. Their trademarks, documentation, APIs, and terms belong to their respective owners. The plugin's protocol implementations were written based on the publicly available API documentation of each provider; no code was copied from those providers.

## Optional audio tools

The README and in-app guidance may mention virtual audio tools such as VB-Cable, BlackHole, PulseAudio, and PipeWire. These tools are not bundled with LexVoice. Users should follow each project's own license and installation guidance.

## Design inspiration

LexVoice's HTML PPT feature was inspired by the HTML-first slide-deck workflow and design principles documented in:

- Huashu Design: https://github.com/alchaincyf/huashu-design
- Notice requested by that project: `Derived from alchaincyf/huashu-design`
- Guizang PPT Skill: https://github.com/op7418/guizang-ppt-skill

LexVoice does not bundle, copy, or redistribute Huashu Design or Guizang PPT Skill source code, scripts, assets, demos, generated media, templates, or starter components. The LexVoice HTML/PPTX renderer and prompt workflow are implemented independently for this plugin.

Huashu Design is distributed under its own Personal Use License. That license applies to Huashu Design itself and any use of its protected work; the LexVoice license does not grant rights to Huashu Design. If future LexVoice changes copy or adapt Huashu Design code, assets, scripts, demos, or other protected materials, those changes must be reviewed separately, carry the required notices, and obtain any authorization required by Huashu Design's license before publication.

Guizang PPT Skill is distributed under the MIT License. LexVoice references its publicly documented design workflow ideas, including slide rhythm, fixed layout discipline, and visual checklist thinking, but does not copy its implementation.

LexVoice's learning-card wall uses an independently written Obsidian Bases configuration inspired by the simple card-wall structure in PaperBell:

- Obsidian-PaperBell: https://github.com/PaperBell-Org/Obsidian-PaperBell
- Referenced file: `PaperBell/Cards/00. 概念墙.base`

Obsidian-PaperBell is distributed under the MIT License. LexVoice does not bundle or redistribute PaperBell vault content, templates, media, or project files; the LexVoice Base files are generated from the user's local LexVoice settings and folders.

## AI assistance

This plugin was developed with AI-assisted programming. All third-party APIs were integrated from public documentation, not from copied source code. Any future contribution that adapts code from another project must document the source, license, and notice in this file before being merged.

## Trademarks

Names such as Obsidian, OpenAI, GPT, Whisper, Alibaba Cloud, Paraformer, SiliconFlow, BlackHole, VB-Cable, and Xinference are the trademarks of their respective owners and are used here only to describe interoperability. LexVoice is not affiliated with, endorsed by, or sponsored by any of these projects or companies.

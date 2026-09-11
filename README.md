# LexVoice

English | [简体中文](README.zh-CN.md) · [Release notes](RELEASE_NOTES.md) · [中文文档站](https://lexvoice.cn/zh/)

LexVoice is an Obsidian plugin for recording audio, transcribing speech, building a live outline while you record, and turning meetings into reusable Markdown — todos, learning cards, people records, and ASR hotwords.

It is **not** a hosted cloud service and ships **no API keys**. You connect your own speech-to-text (ASR) service and, optionally, your own large language model (LLM). Recordings stay in your vault; nothing is uploaded to any LexVoice server (there is none).

**Official downloads and updates: [Lynn-x/LexVoice Releases](https://github.com/Lynn-x/LexVoice/releases/latest).** From 2.2.0 onward, public releases contain installation files and user documentation. Development source remains private. New material uses the [LexVoice Proprietary Software License](LICENSE); historical MIT material retains its original license.

LexVoice supports desktop and mobile Obsidian workflows. Mobile recording uses the device microphone and supports segmented or whole-audio transcription after capture. System audio, virtual audio devices, multichannel capture, desktop device diagnostics, and realtime streaming ASR providers that require custom authentication headers require the desktop app.

## What's new in 2.3.0

- **Meeting preparation:** create the meeting note before recording, paste text or import images and PDFs, and write attendees, the topic and the agenda into the same Markdown file.
- **Responses to concerns:** check questions or explicitly listed agenda items against transcript evidence, while preserving the full recorded discussion.
- **Speakers tab:** select names from the attendee list and review speaker labels in one place.
- **Copy and drag:** select live-outline text; drag a note file or its path from the desktop sidebar.
- **Provider compatibility:** fixes for some M4A diarization failures, streaming connection tests and Bailian model-list retrieval.

See the [2.3.0 release notes](RELEASE_NOTES.md) for data, cost, and compatibility boundaries.

## Features

### Meeting preparation

The collapsible preparation area at the top of the sidebar accepts pasted text and Markdown, TXT, PDF, PNG, JPEG or WebP attachments. Export Word documents to PDF first. Images and scanned PDFs require an AI organization model with image-input support.

Attendees are written to YAML properties. The topic, agenda and manually entered questions stay in the note body. The live outline and final minutes are written into the same meeting note, preserving preparation content and attachment links. You can edit the preparation directly in Markdown.

Using preparation for transcription and organization is off by default. When enabled, names and background can guide interpretation, and final responses include verifiable transcript excerpts. Items without evidence remain pending review. Important unplanned discussion remains part of the minutes.

### Live outline
Chapters grow as you record, so you can glance at "what was just discussed" mid-meeting instead of waiting until the end. After recording, chapters link to the player — click a chapter to jump to that position in the audio. When recording stops, AI completes the chapters into a full set of meeting notes.

### In-meeting notes
While recording, jot live notes under the outline. The first character can trigger different handling:

Trigger the AI assistant:
- `#term` — hit an unfamiliar term? Type `#<term>` and the AI explains it in the context of the current discussion.
- `?question` — type `?<question>` and the AI answers using the current transcript and outline.
- `!highlight` — type `!<point>` to mark something important and have the final notes treat it accordingly.

Mark only (no AI call):
- `@assignee` — record "@alice follows up"; the final notes prefer assigning that todo to them.
- `/todo` — type `/<action>` to capture an explicit todo candidate.

Half-width and full-width symbols are both accepted. In-meeting notes are fed into the final summarization prompt as clearly-labeled "live supplementary material", never mixed into the raw transcript.

### Ask this note
Ask follow-up questions when the final notes miss a detail or you want to revisit a specific part of the discussion. LexVoice answers from both the organized note and the preserved raw transcript. Useful answers can be written back to one compact **Ask this note** section in the Markdown file.

### Long meetings & recovery
In standard meeting and learning-note modes, long recordings are organized in recoverable parts instead of relying on one all-or-nothing LLM response. LexVoice builds a global topic map, saves each completed part as a local checkpoint, and assembles the final note in time order.

If a request is interrupted or a model reaches its output limit, completed work is reused and only unfinished parts are retried. The raw transcript remains available, and an incomplete result is shown as **partially completed** rather than being saved as an empty note.

### Task progress
The processing panel separates transcription, AI organization, and Markdown writing. It shows the active stage, recent activity, failures, and retry or cancel actions. Failed transcription and failed AI organization remain distinct so you can resume from the step that actually failed.

### Speaker review
When post-meeting diarization is enabled, LexVoice keeps provisional speaker labels through transcription so the meeting does not stop for identity confirmation. Afterwards, use the dedicated Speakers tab to select a name from the preparation attendee list, enter a new name, merge labels that refer to the same person, or correct a specific turn. The system does not infer a real identity from the meeting text alone.

### Sediment workflow
After each note, AI splits the content into four candidate groups you review assembly-line style — keep / merge / ignore:
- **People** — adjudicated one by one
- **Todos** — selected by default; edit owner, due date, sub-tasks
- **Learning** — concepts, mechanisms, cases, opinions, Q&A
- **Hotwords** — names, organizations, brands, terms, to improve later ASR accuracy

### Object library
LexVoice turns reusable meeting content into standalone Obsidian objects — people profiles, todo cards, learning cards, ASR hotwords, and concept / todo / learning-card walls. Everything lives in your own vault; the next time the same person comes up, it links to the existing profile.

### Meeting topics
Topic memory can connect multiple minutes about the same subject without asking you to sort every new note. Topic pages keep a source link for each summarized item and separate recorded decisions from unanswered questions. It is deliberately conservative: a later discussion does not automatically close an earlier question, merge two topics, or mark a task complete. You can pause the background work, exclude folders, or exclude an individual note in **Library** settings.

### Todo enhancements
Edit owner, due date and sub-tasks inline at the candidate stage — no dialogs. Stored todos use standard Markdown task syntax (recognized by plugins like Tasks). Source information is preserved on delete / redo for traceability.

### Recording reliability
- Level meters before and after recording show whether the mic and system audio are actually working.
- Audio inputs remain user-selectable. Device names are displayed without speculative virtual or remote-device labels.
- A device check in settings diagnoses "recorded but silent" problems.
- Compatible independent multichannel input can be detected and transcribed by channel, with speaker labels that can be mapped to names. Separation stays off when independent channels cannot be verified.
- Deleting a transcript offers to delete its audio file too.

### Export
From one set of notes you can generate an HTML report, an HTML slide deck, an editable `.pptx`, or an `.eml` email draft — same content, different skins.

### Note list
The sidebar can organize recent notes by folder or by time. Folder groups can be collapsed, the open note is highlighted, and search and template filters remain available in either view.

Live-outline text can be selected and copied. On desktop, drag a Markdown file from the note list, or hold Alt to drag its path. File acceptance depends on the target application; older hosts may support path dragging only.

## Basic usage

1. Open the LexVoice sidebar.
2. Choose a template and an audio input.
3. Start recording; check that the level meter reacts.
4. Watch the live outline; add in-meeting notes if needed.
5. Stop recording and follow transcription and AI organization in **Task progress**.
6. Ask follow-up questions from **Ask this note**, or retry only the failed stage if processing was interrupted.
7. Open **Sediment** and review people, todos, learning cards, and hotwords.
8. If you need to share, generate an HTML report, slides, PPTX, or an email draft.

Default folders (all configurable in settings):

| Content | Path |
|---|---|
| Recordings | `LexVoice/录音` |
| Transcribed notes | `LexVoice/转写纪要` |
| Meeting materials | `LexVoice/会议资料` |
| People | `LexVoice/人员` |
| Learning cards | `LexVoice/学习卡片` |
| Todo cards | `LexVoice/待办卡片` |
| Views | `LexVoice/视图` |
| HTML reports | `LexVoice/HTML报告` |
| Email drafts | `LexVoice/邮件草稿` |
| Glossary | `LexVoice/词汇表.md` |

## Requirements

Required:
- Obsidian 1.10.0 or later
- A speech-to-text service (cloud API or local)
- A vault folder for recordings and notes

Recommended:
- An LLM service — powers the live outline, summarization, sediment, export, and template tuning
- A virtual audio device on macOS / Linux, or as a Windows fallback — to record system / online-meeting audio
- A real microphone — to mix in your own voice
- A domain glossary — greatly improves recognition of names, products, organizations, and terms

## Audio input & real microphone

LexVoice can capture the Windows default playback device directly through Electron Loopback. Choose **Microphone + Windows system audio** for meetings, or **Windows system audio only** for video and courses. The capture request temporarily obtains a display stream as Electron requires, immediately discards its video track, and records audio only.

Other desktop platforms, and Windows installations where the direct test fails, can use a **virtual audio device**:

- Windows fallback: VB-Cable
- macOS: BlackHole
- Linux: PulseAudio / PipeWire monitor source

On Windows with VB-Cable, mind the naming:
- Meeting apps, browsers, and system output → **CABLE Input**
- LexVoice reads **CABLE Output** (a recording device)
- To also record yourself, the **real microphone must be your physical mic** — not CABLE Output, BlackHole, VoiceMeeter, or Stereo Mix

Run **Test device** before a long recording. A Windows Loopback track can be valid while silent, so play a short piece of audio during the test if you also want to verify the level meter.

## Privacy

No ads, no analytics, no telemetry. Settings are stored locally in `.obsidian/plugins/lexvoice/data.json`. Recordings are saved to the local vault path you choose; LexVoice has no cloud storage and uploads nothing to any LexVoice server.

However, if you use a **cloud** ASR or LLM provider, the relevant audio, transcript text, and prompt context are sent to that provider you configured. For sensitive content (client data, medical, legal, HR, recruiting, internal strategy), prefer local transcription + a local model, and obtain consent before recording. See [`PRIVACY.md`](PRIVACY.md).

Automatic meeting topics default to enabled, including upgrades without a saved value for this setting; an existing disabled setting is preserved. The feature sends the configured AI service the title, date, summary, up to ten topic headings, and limited body excerpts. It does not send audio, vault paths, or the full raw transcript. Provider charges may apply. Disable it in **Library** settings to stop new background requests.

## Installation

From the Obsidian Community plugins directory:

1. Open **Settings → Community plugins → Browse**.
2. Search for **LexVoice**, then choose **Install** and **Enable**.
3. Open LexVoice settings and configure your transcription service and audio input.

Manual install:

1. Download `main.js`, `manifest.json`, and `styles.css` from the same [official GitHub Release](https://github.com/Lynn-x/LexVoice/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/lexvoice/`.
3. Reload Obsidian and enable **LexVoice** under Community plugins.

When updating, keep your existing `data.json` and vault files. Replace only the three installation files above.

## License & credits

Beginning with the 2.2.0 release line, new LexVoice material is distributed under the [LexVoice Proprietary Software License](LICENSE). Development source code is no longer publicly released. Official JavaScript runtime files remain inspectable; that does not make this an open-source release or grant a right to redistribute the runtime or source code.

Personal and internal business use is permitted. Your recordings, notes, and exported reports may still be edited, shared, and commercially used, subject to rights in their contents. Unauthorized rebranding, repackaging, external redistribution (free or paid), resale, and white-label software offerings are prohibited. Local adjustments for your own permitted use are allowed; distributing a modified plugin is not.

Previously MIT-licensed releases, including 2.1.2, and previously MIT-licensed portions reused in later releases retain their original rights. See [the preserved MIT notice](licenses/LEXVOICE-LEGACY-MIT.txt). Third-party components retain their own licenses; see [Third-Party Notices](THIRD_PARTY_NOTICES.md). Nothing here restricts mandatory legal rights or independent implementations of general ideas.

Closed-source distribution through the Obsidian community directory is subject to [Obsidian's case-by-case review](https://docs.obsidian.md/community-directory/developer-policies). This license change does not itself establish approval for the new distribution model.

The HTML slide-deck feature was inspired by [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design); its HTML-first slide workflow and design principles influenced this work. Per the upstream license: Derived from alchaincyf/huashu-design.

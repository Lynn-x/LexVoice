# LexVoice 3.0.0

Changes since **2.8.0**; 2.9.0 was not released and its changes are included here. This release rebuilds the sidebar and replaces the pending queue window with a task center. It also decodes and reads long recordings in small pieces instead of all at once, which could freeze or crash Obsidian; cuts Xiaomi MiMo chunks directly from MP3, WAV and M4A files; applies SiliconFlow's documented file limits; keeps silent stretches from failing a meeting and transcribes the remaining parts before stopping on an empty result; explains why an import did not start; lets the meeting overview follow the meeting's real structure, with a color for each topic; adds note groups; and makes saved progress and request authentication more reliable.

## Sidebar

- The home view shows the recording setup, then Outline, Notes, Ask and Knowledge. Import audio, import text, the task center and speakers open on their own page, with Back at the top.
- After you scroll, a short bar stays at the top with the title, New recording and the same tabs. The tabs are not shown twice.
- A finished note's outline no longer repeats the note title. Times, topics and points use the same sizes as the rest of the sidebar.
- On import, the file list scrolls and the template and start button stay under the list. Import text shows one line per file, and the template opens in the sidebar menu.
- The notes list and the task center use the same status words: Queued, Organizing, Stopped, Failed, Done and Abandoned. A meeting record can be abandoned, and finished history can be cleared.
- The task center replaces the pending queue window. Click the LexVoice status in the status bar or run **Open tasks** to open it.

## Long recordings and large files

- Audio that has to be converted on the device is now decoded about two minutes at a time instead of all at once. A recording of several hours used to need several gigabytes of memory and could freeze or crash Obsidian. This covers Xiaomi MiMo, SiliconFlow parts converted to WAV, and retrying a single failed part from the full recording, for WAV, MP3, AAC, M4A (including LexVoice recordings) and WebM.
- Transcription by channel still decodes each segment whole. A segment too long to fit in memory, for example with a very long segment interval, is now transcribed as mono instead, so its channels are not separated.
- Formats that cannot be split this way, such as Ogg and FLAC, are still decoded whole. LexVoice first estimates the memory needed, assuming 48 kHz stereo; when it would not fit, which for these formats means roughly 15 minutes or longer, LexVoice asks you to convert the file to MP3 or M4A instead of trying.
- On desktop, audio is read from disk in 8 MB blocks instead of being loaded into memory in one piece. This applies to imports, post-meeting transcription, retries and part recovery. Audio files are read unchanged, so tasks in progress continue from their saved progress. On mobile, files are still read whole.
- On desktop, importing an MP4 video, such as a screen recording exported from a meeting app, reads only its audio track, without decoding or re-encoding. If the audio track cannot be taken out this way, as with some phone recordings, a file of 1 GB or smaller is read whole, as in 2.8.0.
- On desktop, WebM video, MP4 files without an audio track, and fragmented MP4 video are not read: LexVoice shows "Cannot read audio from this file. It may be an unsupported video format. Export the audio (MP3 or M4A) first and import that; the original file is kept." WebM files that contain only audio are imported as before.
- On desktop, a WAV file over 1 GB that is not already 16 kHz mono is first reduced to 16 kHz mono, two minutes at a time. Other files over 1 GB (for an MP4 video, its audio track) are not read; the message gives the file size and asks you to export the audio first.
- Playing a recording from a timestamp streams the file, so a long recording is no longer loaded into memory before playback starts.
- New recordings are saved as M4A (AAC) wherever the system supports it, also when Xiaomi MiMo is the transcription service. 2.8.0 recorded WebM for MiMo.

## Xiaomi MiMo chunks

- MP3 and WAV files are cut directly from the file, and standard M4A files by their index, so a long file is not decoded in one piece.
- A task started in 2.8.0 continues from its saved chunks; chunks already transcribed are not requested again.
- For MiMo, LexVoice accepts up to 8 hours per file and asks you to split longer files. This is LexVoice's own safeguard, not a MiMo limit. 2.8.0 stopped at about 5 hours 20 minutes (160 chunks of 2 minutes).
- Waits between MiMo requests are shorter: about 110 ms per second of audio instead of 160 ms, at most 45 seconds, to stay within MiMo's 10K tokens-per-minute limit.
- When MiMo reaches its 2K-token output limit without returning any text, the chunk can be retried instead of failing for good. Text returned before the limit is kept with a note that the end may be missing; this now also applies when MiMo answers without streaming.
- A transcription language set to a regional code such as `zh-CN` or `en-US` is sent to MiMo as Chinese or English. Before, it was sent as automatic detection.

## SiliconFlow limits and rate limits

- On SiliconFlow's own endpoints, LexVoice now uses the documented limits of 1 hour and 50 MB per file. Connections that use another address are not split for duration. With speaker separation on, the whole file is still tried first.
- With speaker separation off, audio over either limit is split. MP3, AAC and M4A keep their format, in parts of at most 59 minutes and at most 48 MB; 2.8.0 split them by size only, so a part could be longer than 1 hour. Other formats are converted on the device into WAV parts of about 20 minutes. A file under 50 MB that only exceeds 1 hour and cannot be split in its own format, such as WebM, Ogg or FLAC, is still submitted whole first.
- A task started in 2.8.0 that already has transcribed parts continues with its old parts. A plan with no results yet is split again under the new limits.
- If SiliconFlow rejects a whole file for size or duration, transcription with speaker separation off now falls back once to a few large parts, as speaker separation already did.
- The one-time fallback, with or without speaker separation, now allows up to 12 parts instead of 8; for audio converted to WAV, that is about 4.9 hours. When more parts would be needed, the message says about how many hours the current part length can handle.
- A rate-limited part is requested up to 4 times, waiting about 2, 4 and 8 seconds, or as long as the service asks (at most 90 seconds). If it is still rate-limited, transcription stops with the parts done so far kept, and a later retry continues from them. 2.8.0 retried once after 1.5 seconds. Parts of the one-time large-part fallback, and a whole file over 50 MB, get no extra attempts on rate limits. Timeouts, network and server errors are still retried once after 1.5 seconds.
- Stopping during a retry wait takes effect within about half a second.
- The **Concurrent transcriptions** setting is removed: transcription already sent parts one at a time, so it had no effect. The rate-limit hint in the task panel no longer suggests lowering concurrency.
- SiliconFlow International with a XingChen model is no longer blocked before recording, because LexVoice cannot tell whether your account offers it. The model row in **Transcription & AI** and the task row on the home page show "SiliconFlow International does not list XingChen models. If requests fail, choose another model or service." If the service reports that the model does not exist, the error says so, and the task panel points you to the service settings instead of offering Retry as the main action. The connection summary lists speaker separation again for the international site.
- On the China site, XingChen ASR V3.2 and V3.2-Ultra are listed as free and Qwen3-ASR-1.7B as paid (about ¥0.79 per hour). A connection whose enabled transcription task uses a paid model no longer shows "Free transcription".
- The hotword file description in settings says that with SiliconFlow, hotwords are not used for recognition; only common misspellings are replaced after transcription.

## Silence and empty results

- When SiliconFlow transcribes audio in parts, a part converted to WAV that is digital silence, such as audio written to the recording while paused, is not uploaded. It is recorded as having no recognizable speech, and the transcript notes that stretch.
- If a part returns no text, LexVoice waits 1.5 seconds and asks once more. If it is still empty and the device detects no voice in it, it is recorded as no speech and transcription continues. Otherwise it is marked as a gap: the other parts are transcribed first, then the task stops, lists the gaps by part and time, and keeps everything else. Retrying requests only the gaps, or you can choose **Create notes from completed parts only**. The device can check only parts converted to WAV; an empty part sent in its own format (MP3, AAC or M4A) is always a gap.
- If every part has no recognizable speech, the task stops and asks you to listen to the audio and check the recording device, without offering a retry.
- Xiaomi MiMo: chunks that are digital silence are not uploaded. If MiMo returns no text twice and no voice is detected in the chunk, it counts as no speech and the transcript notes about how many minutes had no recognizable speech, instead of failing the meeting. A chunk with voice that still returns nothing stops the task as before, with the audio kept. An MP3 chunk that cannot be fully decoded on the device is uploaded rather than treated as silent.
- **Create notes from completed parts only** now also finds progress saved after a whole-file attempt or a large-part fallback.
- Post-meeting transcription is treated as transcription in the task panel and diagnostics: it no longer shows **Retry organization**, and retrying checks the transcription service settings instead of AI organization.

## Import errors explain the reason

- If an import cannot start, for example because another meeting is still being processed or a service is not fully set up, a notice shows "Import incomplete:" with the reason, and the failure is written to the diagnostic log. Before, nothing happened after you confirmed the import.
- If a file cannot be read, the notice gives the reason (too large, no audio track, unsupported video) instead of only "Read failed".

## Meeting overview

- The mind-map overview now follows the structure of the notes: LexVoice reads the sections itself, so each section is one topic and subsections stay inside it, whatever the model writes. Conclusions, actions, open questions and AI suggestions at the end of the notes are left out. A diagram holds about 44 labels in all, every section with content gets at least one point, and at most two points show sub-points. Before, the AI was limited to 8 topics and 3 points per topic, and a reply with more was rejected.
- The overview is made from the finished notes in one request instead of sending the transcript again. Preparation material, **Ask** answers and raw transcripts are not included. Notes that have not been organized yet still use the transcript, and notes without clear sections are still divided by issue.
- Each topic has its own color, on the node, its lines and their arrows, which point away from the center. Exports use the same colors, and dark themes keep them.
- When a reply is very large, every topic is kept and the finest points are left out of the diagram, with a line above it saying so. If a reply is cut off or is not valid JSON, whatever can be read is still drawn, the diagram says it is incomplete, and generating it by hand asks before sending a new request. The notes themselves are always complete.
- Overviews already in your notes stay as they are. Generating one again uses the new layout and colors, and sends a new AI request. An overview from 2.7 or earlier first changes layout on the device; generating it once more sends the request.
- **Generate overview** is now at the top level of the right-click menu, instead of under **Reorganize as**. The menu no longer has a stop item.
- **Fast model** under AI organization in **Transcription & AI** lets outlines and overviews use another model on the same connection, while notes and reports keep the main model. By default it is **Same as above**. A meeting in progress keeps the model it started with.
- If you add or remove a line in the diagram's source by hand, also update the numbers in its `linkStyle` lines, as the comment there says. Otherwise Obsidian cannot draw the diagram in the note; exports still work.

## Note groups

- Groups are the folders inside your notes folder, the same as the columns of the **Notes board**.
- In the notes list **By date**, each note shows its group. **By folder** and board cards show the date with the time, so notes from a multi-day event are easy to tell apart. The list view you choose is remembered on this device.
- Right-click a note in the notes list or a card on the **Notes board** and choose **Move to group** to pick a group, **Uncategorized** or **New group**. This also works on mobile, where dragging is not available.
- A note that is being recorded, processed or transcribed cannot be moved. Derived versions in the same folder move with it.
- After a note is moved or renamed, processing records that are no longer running (failed, stopped or completed) follow it, so **Resume processing** still finds the note.

## Recovery and authentication

- Saved progress (transcription and note checkpoints, meeting recovery records, the topic memory record, the automatic import record and saved AI responses) is written more carefully: missing folders are created, every write is read back and checked, saves to the same file are queued, and a newer copy left by an interrupted write is preferred over the older file.
- Topic organization keeps the AI response it has already received: automatic retries reuse it instead of paying for it again, and **Retry unfinished topic organization** requests a new one.
- If saved progress cannot be read, including a newer copy left incomplete by an interrupted write, LexVoice stops and keeps the files instead of starting over, which could bill the same audio or AI request again. The message reads, for example, "The transcription checkpoint could not be read. Original files were preserved; audio was not resubmitted."
- If the full recording cannot be written to disk, it stays in memory and LexVoice asks you to keep the app open, free disk space and retry; the meeting is not shown as finished. **Resume processing** saves the recording first and stops there if saving fails again. If the recording was saved and only updating its outline links failed, it is no longer reported as unsaved.
- **Ask** answers are written into the current content of the note and marked as written only after the write succeeds, so edits made in the meantime are kept.
- A meeting in progress keeps the processing plan it started with: turning the live outline on or off in settings during a recording no longer changes the current meeting.
- Each request uses the authentication method of the connection its task is bound to (Bearer, `api-key` header or custom headers). Connections on the same gateway address no longer take over each other's method, and a long-audio upload, submission and status checks all use the same one. A task keeps the address and method it started with; keys and custom headers are read from the current connection, so retrying after you replace a key uses the new key.
- Connections that authenticate with custom headers and have no API key are no longer stopped as having no key configured.
- Alibaba Cloud Bailian: a status check that does not respond no longer waits past the task's total wait time, and downloading the result has a time limit. After you stop the task, no further checks or downloads are made.
- A task's result changes a connection's status in **Model services** only if the connection's address, key and authentication are unchanged since the task started. After you delete a connection, edit it or replace its key, older results no longer affect it.
- A connection still needed by an unfinished meeting that can be resumed cannot be removed.
- In-app updates installed from 3.0.0 onward check the backup before writing. If writing a file fails, the files and settings already changed are restored; if that is incomplete, the error names the backup folder. The update to 3.0.0 itself still runs the 2.8.0 updater.

## Other fixes

- New recording notes start with a Meeting info box for the name, speaker and outline, without the old title line. If filled in, it is used for transcription, the note is named `Speaker-Name`, and the outline sets the level-2 headings. It is sent to your configured AI services, and to transcription services that accept a prompt. An empty box is removed at the end. Some templates, continued recordings, prepared notes and imports do not have this box.
- Text typed directly into a recording note, outside the transcript, used to be lost when the notes were finished. It is now kept in a collapsed callout in the raw materials at the end of the note. It is left out when generating notes, the overview and reports; scanning a note for Sediment and polishing a whole note can read it. Text typed between transcript segments, or while continuing a recording, is still replaced.
- Undoing **Add to tasks** in Sediment no longer removes the whole daily note. It restores the note as it was before the tasks were added.
- The recording panel shows level bars with a microphone or computer icon, without a status label, and the search box in the notes list no longer shows an icon.
- Quick setup keeps a task's current transcription service and model when it points the task to a connection that supports them.
- Diagnostic reports no longer show the last progress line of a task that is not running as if it were current.
- When XingChen speaker separation rejects a whole M4A file, the diagnostic log records the service's message, request ID and audio format, to help find the cause.
- SiliconFlow model descriptions in settings are updated for the China and International sites, and the Xiaomi MiMo description no longer states a fixed chunk length.

## Updating

- Reload the plugin after updating. Updating does not rename notes, rewrite note text or change connection addresses and keys.
- Tasks started in 2.8.0 continue: SiliconFlow parts and MiMo chunks already transcribed are kept and resumed with their original lengths.
- If several devices sync the same vault, including the plugin folder, update them all before resuming unfinished transcriptions. 2.8.0 does not recognize some of the new SiliconFlow and MiMo part layouts: resuming a task started in 3.0.0 on a 2.8.0 device can discard its saved parts and transcribe from the start, which may be billed again.
- The **Concurrent transcriptions** setting is removed. Its saved value stays in the settings file but is no longer used.

---

## 中文说明

相对 **2.8.0**；2.9.0 没有单独发布，内容都在本版。本版重做了侧栏，用任务中心取代待处理队列弹窗；还把长录音改为分小段解码和读入，不再一次性整段处理（那样可能让 Obsidian 卡死或崩溃）；小米 MiMo 直接从 MP3、WAV、M4A 文件切块，硅基流动按官方的文件上限处理；静音不再让整场失败，遇到空结果时先转完其余段再停下；导入开不了工时说明原因；会议概览按实际内容分层，每个主题一种颜色；新增纪要分组；并让恢复记录的保存和请求鉴权更可靠。

### 侧栏

- 首页先是录音设置，下面是「大纲」「纪要」「问一问」「沉淀」。导入音频、导入文本、任务中心和说话人各开一页，顶部有「返回」。
- 往下滚后，顶部固定一条精简栏，有标题、「新建录音」和同一组标签，标签不再出现两次。
- 已完成纪要的大纲不再重复笔记标题。时间、主题和要点与侧栏其余文字同一字号。
- 导入时文件列表可滚动，模板和开始按钮固定在列表下方。导入文本每个文件一行，模板在侧栏菜单里选。
- 纪要列表和任务中心用同一套状态词：排队中、整理中、已停止、失败、已完成、已放弃。会议记录可以放弃，已完成的历史可以清除。
- 任务中心取代待处理队列弹窗。点状态栏的 LexVoice 状态或运行「打开任务中心」打开。

### 长录音与大文件

- 需要在本机转换的音频改为每次只解码约 2 分钟，不再整段解码。几个小时的录音整段解码要占好几 GB 内存，可能让 Obsidian 卡死或崩溃。覆盖小米 MiMo、硅基流动转成 WAV 的分段、从完整录音截取失败段重试，格式包括 WAV、MP3、AAC、M4A（含 LexVoice 自己的录音）和 WebM。
- 分声道转写仍整段解码每一段。段太长、内存放不下时（例如分段间隔设得很长），改按单声道转写，这一段不再分声道。
- 无法按段切分的格式（如 Ogg、FLAC）仍需整段解码。LexVoice 先按 48 kHz 立体声估算所需内存，放不下时（对这类格式大约 15 分钟以上）直接说明，请你先转换为 MP3 或 M4A，不去硬解。
- 桌面端改为从磁盘按 8 MB 分块读入音频，不再整个读进内存，适用于导入、会后转写、重试和失败段截取。纯音频原样读入、字节不变，进行中的任务照常从已保存的进度续跑。移动端仍整个读入。
- 桌面端导入 MP4 视频（例如会议软件导出的录屏）时只读取音轨，不解码、不转码。音轨无法这样取出时（部分手机录像就是如此），不超过 1 GB 的文件按 2.8.0 的方式整个读入。
- 桌面端对 WebM 视频、没有音轨的 MP4、分片写入的 MP4 视频不再读取，提示「无法从这个文件中读取声音，可能是暂不支持的视频格式。请先导出音频（MP3 或 M4A）再导入；原文件已保留。」只含音频的 WebM 照常导入。
- 桌面端超过 1 GB 的 WAV，若不是 16 kHz 单声道，先按每 2 分钟一段降成 16 kHz 单声道；其余超过 1 GB 的文件（MP4 视频按取出的音轨计）不读取，提示文件大小并请你先导出音频。
- 从时间点回听录音改为按需读取文件，长录音不必先整个读进内存才能播放。
- 新录音在系统支持时一律保存为 M4A（AAC），选用小米 MiMo 转写时也是如此；2.8.0 为 MiMo 改录 WebM。

### 小米 MiMo 切块

- MP3、WAV 直接从文件里切出，标准 M4A 按索引切出，长文件不再整段解码。
- 2.8.0 开始、尚未转完的任务从已保存的块续跑，已转好的块不重复请求。
- 使用 MiMo 时，LexVoice 单个文件最长接受 8 小时，更长的请先拆分。这是 LexVoice 自设的保险，不是 MiMo 的限制；2.8.0 最多约 5 小时 20 分钟（160 块 × 2 分钟）。
- MiMo 请求之间的等待缩短：每秒音频约等 110 毫秒（原为 160 毫秒），单次最多 45 秒，以免超过 MiMo 每分钟 10K tokens 的限额。
- MiMo 输出达到 2K tokens 上限且一个字都没有返回时，可以重试，不再判为永久失败；触顶前返回的文字照常保留，并标注末尾可能未转完。非流式返回现在也做这项检查。
- 识别语言设为 `zh-CN`、`en-US` 这类带地区的写法时，按中文或英文发给 MiMo；以前会当成自动识别。

### 硅基流动按官方上限并改进限流

- 使用硅基流动官方地址时，按官方「单个文件 1 小时、50 MB」上限处理；同一服务填了其他地址的连接，不因时长切段。开启说话人分离时仍先整段提交。
- 关闭说话人分离时，超过任一上限的音频会切段：MP3、AAC、M4A 保留原格式，每段不超过 59 分钟、不超过 48 MB（2.8.0 只按大小切，一段可能超过 1 小时）；其他格式在本机转成约 20 分钟一段的 WAV。不足 50 MB、只超过 1 小时、又不能按原格式切分的文件（如 WebM、Ogg、FLAC），仍先整段提交。
- 2.8.0 开始、已有转写结果的任务沿用原来的分段续跑；还没有结果的按新上限重新切分。
- 整段被硅基流动以大小或时长超限拒绝时，关闭说话人分离的转写现在也只回退一轮少量大段，与说话人分离一致。
- 这一轮回退（开不开说话人分离都一样）最多 12 段（原为 8 段），转成 WAV 时约能处理 4.9 小时；超出时报错写明按目前每段长度约能处理多少小时。
- 分段遇到限流时最多请求 4 次，依次等约 2、4、8 秒，或按服务要求的时间等待（最多 90 秒）；仍限流就停下，已转好的段保留，稍后重试时从这里接着转。2.8.0 只等 1.5 秒重试一次。一轮回退里的大段、超过 50 MB 的整段，遇限流不增加次数。超时、网络和服务端错误仍等 1.5 秒重试一次。
- 重试等待期间点「停止」，约半秒内生效。
- 删除了不起作用的「同时转写数」设置：各条转写路径本来就逐段串行请求。任务面板的限流提示不再让你降低并发。
- 硅基流动国际站选用 XingChen 模型时不再在录音前拦下（LexVoice 无法知道你的账户是否提供该模型）。「转写与整理」的模型行和首页任务行提示「硅基流动国际站未列出 XingChen 模型，调用失败时请更换模型或服务」。服务返回模型不存在时，报错会说明，任务面板的主要操作改为去改服务设置，而不是重试。国际站连接的摘要重新列出「说话人分离」。
- 国内站把 XingChen ASR V3.2、V3.2-Ultra 列为免费，Qwen3-ASR-1.7B 标为收费（约 0.79 元/小时）。已启用的转写任务用了收费模型的连接，不再标「转写免费」。
- 设置里热词文件的说明写明：用硅基流动时热词不参与识别，只有易错写法会在转写完成后替换。

### 静音与空结果不再让整场失败

- 硅基流动分段转写时，转成 WAV 后为数字静音的段（例如暂停期间仍写进录音文件的部分）不上传，记为「无可识别语音」，转写里注明这段时间。
- 某段返回空文字时，等 1.5 秒再请求一次；仍为空、且本机检测不到人声时记为无语音，继续后面的段。否则记为缺口：先转完其余段再停下，按段号和时间列出缺口，其余结果保留。重试只请求缺口段，也可以选「仅用已完成部分生成纪要」。本机只能检查转成 WAV 的段；按原格式（MP3、AAC、M4A）上传的段返回空文字时一律记为缺口。
- 各段都没有可识别的语音时，任务停下并提示回听音频、检查录音设备，不提供重试。
- 小米 MiMo：数字静音的块不上传；连续两次返回空文字、且本机检测不到人声的块记为无语音，转写里注明约几分钟无可识别语音，不再让整场失败。有人声却仍无文字的块和以前一样停下，音频保留。本机解不完整的 MP3 块照常上传，不当作静音。
- 「仅用已完成部分生成纪要」现在也能找到整段提交或大段回退后保存的进度。
- 会后完整转写在任务面板和诊断中按转写阶段处理：不再显示「重试整理」，重试时检查的是转写服务设置，而不是 AI 整理。

### 导入失败会说明原因

- 导入开工前的检查没通过时（例如另一场会议仍在处理、服务配置不完整），提示「导入未完成：」并写明原因，同时写入诊断日志。以前确认导入后没有任何反应。
- 文件读取失败时，提示写明原因（文件太大、没有声音轨道、不支持的视频），不再只说「读取失败」。

### 会议概览

- 思维导图概览跟着纪要的结构走：章节由 LexVoice 直接读取，每节一个主题，小节留在节内，不随模型变化。纪要末尾的结论、行动、未决问题和 AI 建议不进图。全图约 44 个标签，有内容的章节至少一个要点，第三列全图最多两处。以前限制最多 8 个主题、每个主题最多 3 个要点，超出的回复会被判为无效。
- 概览直接读纪要正文，一次请求完成，不再把转写重新发一遍。会前材料、「问一问」的回答和原始转写都不会发送。还没整理的笔记仍读转写，没有明确章节的纪要仍按议题分。
- 每个主题一种颜色，节点、连线和箭头都带颜色，箭头从中心往外。导出时颜色相同。
- 回复内容特别多时，主题全部保留，最细的要点不画入图中，并在图上方写明。回复中途断开时，所有章节仍会显示，图上注明不完整，手动生成时会先询问是否重新请求。纪要本身始终完整。
- 笔记里已有的概览保持不变。重新生成后使用新的分层和颜色，会发送一次新的 AI 请求。2.7 及更早版本的概览第一次只在本机换布局，再生成一次才发送请求。
- 「生成概览」移到右键菜单第一级，不再放在「重新整理为」里面，菜单里也不再有停止项。
- 「转写与整理」的 AI 整理下新增「快速模型」：大纲和概览可以用同一条连接下的另一个模型，纪要和报告继续用主模型。默认「与上方相同」。进行中的会议沿用开始时的模型。
- 手动在图的源码里增删连线时，要同时修改 `linkStyle` 行的序号（图里有注释说明），否则 Obsidian 画不出这张图；导出不受影响。

### 纪要分组

- 分组就是纪要目录下的文件夹，与「纪要看板」的列一致。
- 纪要列表「按时间」查看时，每条纪要显示所在分组；「按文件夹」查看和看板卡片的时间带上日期，多天的活动也分得清是哪天。选择的查看方式记在本机。
- 在纪要列表或「纪要看板」的卡片上右键，选「移到分组」，可选已有分组、「未分类」或「新建分组」。移动端不能拖拽时也能用。
- 正在录音、处理或转写的纪要不能移动；同一文件夹里的派生版本随母本一起移动。
- 纪要移动或改名后，已结束（失败、停止或完成）的处理记录跟着更新路径，「继续处理」仍能找到它。

### 恢复与鉴权

- 恢复记录（转写与纪要检查点、会议恢复记录、主题记忆记录、自动导入记录、已获得的 AI 结果）的保存更稳：缺少的文件夹自动创建，每次写入后读回校验，同一文件的保存排队进行，写入中断留下的较新副本优先于旧文件使用。
- 主题整理会保留已收到的 AI 回复：自动重试直接复用，不再重复付费；「重试未完成的主题整理」会重新请求。
- 恢复记录读不出来时（包括写入中断留下、不完整的较新副本），LexVoice 停下并保留文件，不再从头开始（那可能对同一段音频或同一次 AI 请求重复计费）。例如提示「转写检查点无法读取，已保留原文件，未重新提交音频」。
- 完整录音写不进磁盘时暂存在内存里，提示不要退出应用、释放磁盘空间后重试，会议不会显示为已完成。「继续处理」会先保存录音，再次失败就停在这一步。录音已经保存、只是大纲里的录音链接没更新成功时，不再报成录音未保存。
- 「问一问」的回答写入纪要的最新内容，写入成功后才标记为已写入，期间你做的修改不会被覆盖。
- 进行中的会议沿用开始时的处理计划：录音期间在设置里开关实时大纲，不再影响这场会议。
- 每个请求使用其任务所绑定连接的鉴权方式（Bearer、`api-key` 请求头或自定义请求头）。同一网关地址上的多条连接不再互相覆盖鉴权方式，长音频的上传、提交和查询状态始终用同一份。任务沿用开始时的地址和鉴权方式；密钥和自定义请求头从当前连接读取，换了 Key 之后重试会用新 Key。
- 用自定义请求头鉴权、没填 API Key 的连接，不再被判为未配置密钥。
- 阿里云百炼：查询状态无响应时，不再超过任务的总等待时限；下载结果也有时限。停止任务后不再继续查询或下载。
- 任务结果只在连接的地址、Key 和鉴权方式与任务开始时一致时，才更新「模型服务」里该连接的状态。删除、修改连接或换 Key 之后，旧结果不再影响它。
- 仍有可继续处理的未完成会议在使用的连接，不能移除。
- 从 3.0.0 起安装的插件内更新，写入前先校验备份；写入任何文件失败时，把已改动的文件和设置恢复原样，恢复不完整时报错写明备份位置。更新到 3.0.0 这一次仍由 2.8.0 的更新程序执行。

### 其他修复

- 新建的录音笔记最前面是「会议信息」框，不再有标题行，可以填会议名称、发言人和大纲。填了就用于转写参考，笔记按「发言人-会议名称」命名，二级标题按大纲组织。这些内容会发给你配置的 AI 服务，能接收提示的转写服务也会收到。没填的框在定稿时去掉。部分专用模板、续录、会前准备笔记和导入没有这个框。
- 录音时直接写在笔记里、转写区以外的文字，以前在定稿时会丢。现在收进笔记末尾原始材料里的折叠 callout「手写笔记」。生成纪要、概览和报告时不发给 AI，沉淀扫描和整篇润色会读到。写在转写段落之间的文字和续录时新写的文字仍会被覆盖。
- 沉淀里加入待办后点撤销，不再把整篇日记移走或清空，只恢复到加入之前的内容。
- 录音面板只显示电平条和麦克风、电脑图标，不再显示状态文字；纪要列表的搜索框去掉了图标。
- 快速开始把任务改指到某条连接时，若连接支持当前的转写服务和模型，就保留它们。
- 诊断报告不再把未在运行的任务的最后一条进度当作当前进度显示。
- XingChen 说话人分离拒收整段 M4A 时，诊断日志记下服务端原话、请求编号和音频格式，便于查明原因。
- 设置里硅基流动国内站、国际站的模型说明已更新；小米 MiMo 的说明不再写死块长。

### 更新

- 更新后重载插件。更新本身不会改名笔记、改写笔记正文，也不会改动连接地址和密钥。
- 2.8.0 开始的任务照常续跑：硅基流动已转好的分段和 MiMo 已转好的块保留，按原来的长度继续。
- 多台设备同步同一个库（含插件文件夹）时，请都更新后再继续未完成的转写。2.8.0 认不出 3.0.0 对硅基流动和 MiMo 的部分分段方式，在 2.8.0 的设备上继续 3.0.0 开始的任务，可能丢弃已保存的部分、从头转写，并重复计费。
- 「同时转写数」设置已删除，设置文件里原有的值保留，但不再使用。

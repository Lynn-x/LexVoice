# LexVoice 2.6.0

Changes since **2.5.0**.

## Meeting overviews

- Add a Mermaid overview near the beginning of organized notes, covering the topics, conclusions, actions and open questions found in the available meeting transcript. Partial transcripts remain labeled as partial.
- Generate or update the overview separately without retranscribing the recording. Each reorganized note version has its own diagram; existing notes and manually edited diagrams are protected from automatic replacement.
- Include saved overviews in HTML and PDF exports. If a diagram cannot be rendered, preserve the report text. Oversized report PDFs use pagination instead of dropping the end of the report.

## Meeting processing and recovery

- When usable live transcription is already saved, deliver notes from that text while post-meeting transcription is pending or unavailable. Keep the source and coverage visible; later transcription does not silently replace delivered notes.
- Stop draining live-outline and Q&A backlogs at recording end. Pending questions can be completed separately after note delivery, without rewriting the saved report.
- Save supported organization and overview responses before parsing or publishing them, so local recovery can reuse completed work. An explicit new paid overview request requires confirmation.
- Add separate actions to restart with current settings and relink a moved original note. Original-task retry keeps its original plan and checkpoints; a new-settings task preserves the original task and its results.
- Create a separate note from successful transcription parts when other parts fail, with missing audio ranges listed explicitly.
- Record speaker-attribution changes and allow undo of batch assignments and individual corrections. Undo preserves unrelated note edits and refuses to apply to a changed transcript. This does not add automatic cross-chunk voice identification.

## Recording and service fixes

- Restore early cuts at 10 seconds, 1 minute and 3 minutes for non-streaming recording, using only cut points earlier than the configured update interval. The first transcription can start before that full interval elapses.
- Create separate numbered files when recording names collide. Keep full meeting titles in processing records even when filenames use a compact date format, and close recording titles independently of organization success.
- Improve XingChen long-audio import when a whole upload exceeds the local memory budget: use a bounded number of large parts where the audio format supports it, while retaining completed parts for recovery.
- Distinguish pay-as-you-go and Token Plan connections for Bailian and MiMo, check mismatched keys and endpoints, and show incomplete task configuration separately from connection health. Bailian Token Plan is offered for AI organization only in LexVoice.
- Improve Bailian upload-policy compatibility with workspace endpoints and repair saved post-meeting HTTP endpoints that were incorrectly configured as WebSocket URLs.
- Allow size-aware timeouts for long non-streaming organization requests, without adding automatic retries on timeout. Progress and diagnostics show the current organization step and latest model activity; elapsed time is not presented as model compute time.

## Notes and interface fixes

- Default the minutes sidebar to time grouping with all dates and templates visible, until a filter is selected. Include recordings that have not yet been organized.
- Open the actual new note after manual reorganization instead of leaving the unchanged source on screen. Repeated reorganization creates separate versions rather than overwriting an earlier output.
- Fix consent-state synchronization and agenda/material submission during recording, while preserving existing transcripts and unsent drafts.
- Fix the processing-step tooltip appearing away from the hovered content. Add an overall timeout and renderer cleanup for email PDF export.

## Defaults and updating

- Automatic meeting overviews are enabled by default for organized notes and can be disabled in settings. Generation can make additional requests to the configured AI service and incur charges. Rendering an already saved overview does not itself make another AI request; raw-transcription-only mode does not automatically generate an overview.
- Retrying with current settings may upload the recording and authorized materials again. The action asks for confirmation and retains the original task.
- Finish active recording and processing before updating, then reload the plugin. Keep configuration, recordings, notes and recovery data. Existing notes are not rewritten merely by updating.

---

## 中文说明

相对 **2.5.0**，本版新增会议概览图、人物归属撤销和任务恢复入口，并改进录音结束后的纪要交付。

### 会议概览图

- 根据整场当前可用的转写内容，在纪要前部生成 Mermaid 概览，展示主要议题、结论、行动项和未决问题；转写不完整时保留部分覆盖提示。
- 支持单独生成或更新概览，无需重新转写录音。重新整理的新版本拥有自己的图，不套用旧版本的图，也不自动覆盖人工修改。
- HTML、PDF 导出保留已有概览；图渲染失败时仍保留文字。超长报告 PDF 改用分页，不再因单页高度限制丢失末尾内容。

### 处理与恢复

- 已有可用会中转写时，可先生成纪要，不再被尚未完成或失败的会后识别阻断。明确标注所用来源和覆盖情况，后续完整转写不会静默替换已交付纪要。
- 结束录音不再补跑实时大纲和问答积压。未完成的问题可以在纪要交付后单独补做，结果不改写原纪要。
- 整理与概览生成先保存响应，再解析和写入；本地恢复优先复用已有结果，概览重新付费请求需明确确认。
- 区分“按原配置重试”和“按当前设置新建任务”，支持重新关联移动后的原笔记。新任务保留原任务、已有结果及纪要。
- 部分转写失败时，可用成功片段另存纪要，并明确列出缺失音频范围。
- 人物批量归属和逐条纠正增加修改记录与撤销。撤销只改变相关归属，不回滚其他正文；转写内容变化时拒绝错误撤销。本版不新增跨段声纹自动识别。

### 录音与服务修复

- 恢复非流式录音开头 10 秒、1 分钟、3 分钟的提前切段，仅保留早于设置间隔的切点，首批转写无需等满整个更新间隔。
- 同名录音自动编号，避免多场录音共用一篇笔记。短日期文件名仍显示完整会议标题，录音标题收尾不再依赖整理成功。
- 改善星辰长音频导入：本机上传内存预算不足时，支持的音频格式可改用数量受限的大段处理，并保留成功片段供恢复。
- 百炼、MiMo 区分按量付费与 Token Plan，检查密钥和地址错配；连接可用但任务配置未完成时明确提示。LexVoice 中的百炼 Token Plan 仅用于 AI 整理。
- 改善百炼业务空间地址获取上传凭证的兼容性，修复会后 HTTP 转写地址误存为 WebSocket 地址的问题。
- 长文本非流式整理按请求规模调整等待上限，不因超时自动重复请求。进度与诊断显示当前整理步骤和最近模型活动，区分累计等待与模型计算耗时。

### 笔记与界面修复

- 纪要侧栏默认按时间分组、显示全部日期和模板，用户选择后才筛选；未整理的录音也可在列表中找到。
- 手动整理完成后打开实际生成的新文档，重复整理另存版本，不覆盖上次结果。
- 修复录音中追加议程、材料时的授权状态同步与提交问题，保留已有转写和未发送草稿。
- 修复处理步骤提示框远离鼠标位置的问题；邮件 PDF 导出增加整体超时与窗口清理。

### 默认行为与更新

- 整理纪要的自动概览默认开启，可在设置中关闭。生成概览可能新增 AI 服务请求及费用；仅渲染已有概览不会再次请求 AI，纯转写模式不自动生成概览。
- 按当前设置新建任务可能重新上传录音和已授权材料，操作前会确认，原任务保留。
- 更新前结束录音和处理任务，更新后重载插件。保留配置、录音、笔记及恢复数据；更新本身不会批量改写旧笔记。

# LexVoice 2.7.0

Changes since **2.6.0**.

## Model providers

- Add and edit connections in a **Model providers** dialog, which replaces the previous add-service dialog. The Model services list keeps its layout; selecting a row opens that connection, and **Add provider** opens the provider catalog. Without any connection, the page shows the catalog directly.
- Each connection has Billing, Region, API Key, Base URL and Test connection in one place; per-feature Base URLs and API keys remain under advanced settings. A connection can be added before an API key is entered and is shown as not configured until it is complete. Changes save immediately.
- Billing and region presets cover Bailian, SiliconFlow and MiMo. Switching region updates every feature's official Base URL; workspace endpoints and custom gateways are kept. New connections preselect mainland endpoints in a Chinese interface and international endpoints in English or Japanese. Existing connections are not migrated.
- Status labels are the same across the plugin: Available, Unavailable, Not tested, Not configured, Invalid API key, Network error and Insufficient balance. A connection shows the latest test or call result for the tasks it serves. A successful test clears earlier network and key errors, but not balance or access failures left by a task.
- Narrow windows and mobile use a list-then-detail layout. Actions in the dialog are text or icon actions that work with Enter and Space.

## Bailian (Alibaba Cloud Model Studio)

- Add Singapore pay-as-you-go and Token Plan presets, and Hong Kong and US pay-as-you-go presets for AI organization only. Workspace hosts whose region cannot be recognized no longer fall back to Beijing. SiliconFlow adds an international preset.
- Pasting an official URL with a path into Base URL keeps only the host, and each feature keeps its official path. The connection test checks each feature against Bailian's official paths and names the correct address when a path is wrong.
- Post-meeting transcription and audio import submit the original file whole by default, with the same parameters as 2.6.0. With speaker separation on and a recording longer than two hours, the file is split losslessly into the fewest even parts of at most two hours (M4A, MP3, ADTS AAC and PCM WAV). Overlapping sentences are kept once; speaker numbers continue across parts and need review. Files above the provider's upload size limit are split the same way. Formats that cannot be split losslessly are submitted whole with a notice, and only stop, keeping the original audio, when they exceed the upload limit.
- A part with no recognizable speech is saved as a placeholder and the remaining parts continue; a retry does not submit it again. Recovery continues parts already submitted to the cloud without uploading them again.
- Waiting for a cloud result is limited to 1.5 times the audio duration (10 minutes to 3 hours). A timeout keeps the cloud task, so a manual retry continues the same task instead of submitting again. Network errors while polling or downloading resume automatically without another submission. A gateway 504, or a 502 without an error code, on submission requires a manual retry to avoid duplicate charges.
- The model list for file transcription is the current model plus the region's documented models; no model-list request is made.
- Realtime transcription chooses the sample rate from the model (8 kHz models receive 8 kHz audio), keeps the connection alive with heartbeats, and reconnects automatically after an unexpected disconnect. The missing interval is reported, and failures at the end of a session are no longer hidden. Singapore defaults to `fun-asr-realtime`; Hong Kong and US connections report that realtime transcription is unavailable in that region.
- In **Fast** mode, AI organization sends the thinking-off parameter to Bailian Token Plan and workspace endpoints; MiniMax-M3 on Bailian uses its own parameter. If a server rejects the parameter, the request is sent once more without it.
- Token Plan endpoints use Obsidian's request channel directly instead of failing once at every startup. Cancelling an organization request on that channel releases the queue immediately, and a late response is discarded.
- An exhausted Token Plan quota and billing-related 429 errors are not retried. Without a server-provided delay, Bailian rate-limit retries wait at least 60 seconds, and the wait can be cancelled; pay-as-you-go per-minute token limits can still be retried.
- Bailian error codes are kept and explained with a short note in Chinese. For "Access to model denied", the explanation lists account arrears first, followed by subscription, plan and model availability. Permission errors are no longer reported as an invalid API key, rate limits are no longer reported as insufficient balance, and billing errors are classified separately from key errors.

## Other transcription fixes

- Pausing a recording sends silence to streaming transcription services. Speech during the pause is not uploaded or added to notes, and the connection stays open.
- SiliconFlow `XingChenASR-Diarize-V3.0` with speaker separation: when a whole M4A file is rejected with HTTP 400 and no specific parameter error, LexVoice retries once with locally decoded 16 kHz mono WAV, whole when it fits about 24 minutes, otherwise in 2 to 8 WAV parts. The choice is saved for recovery, and stopping during this retry is reported as stopped rather than as a failure.

## Task progress

- Each row in **Awaiting your action** and **Waiting to resume** shows one main action; the other actions are in the expanded details. Failures that would recur unchanged offer **New task with current settings** instead of a retry.
- Add **Remove** for tasks that are neither running nor completed, and **Retry all** and **Clear all** for the tasks awaiting your action. Retry all runs one task at a time and skips tasks that would fail again unchanged, have a note conflict or still lack their audio. Tasks that need a settings change run last; the batch stops if one of them fails again, when you stop it, or when another task is running. Clear all asks for confirmation and removes failed meetings, failed background tasks and stopped transcription retries; meetings with generated results that are not yet saved stay in the list. Recordings and notes already written are not affected, and removed tasks cannot be resumed.
- Fix text sizes that used undefined theme variables and could appear larger than intended. The panel uses a smaller set of text sizes, including on mobile.

## Meeting overviews

- Overviews place topics in one column and their details in the next, from left to right. Diagram width no longer grows with the number of topics, and the title is no longer repeated as a root node. Long unbroken strings such as links can wrap.
- When you update an overview created by 2.6.0 and the transcript and output language have not changed, LexVoice switches it to the new layout locally without another AI request. Manually edited overviews are not converted.
- HTML and PDF exports show the diagram at its natural size instead of enlarging narrow diagrams. A4 printing paginates by topic, without blank pages or nodes cut across pages. `&`, `"`, `<` and `>` no longer appear as entity codes in exports.

## Audio import

- The import dialogs use the same rows and controls as settings: a switch for speaker separation, dropdowns and fields, and text or icon actions instead of native buttons, all usable with Enter and Space.
- The file-selection dialog scrolls as a whole, so the file list stays visible in short windows and on phones.

## Updating

- Finish active recording and processing before updating, then reload the plugin. Configuration, recordings, notes and recovery data are kept. Existing notes and connection addresses are not rewritten merely by updating.

---

## 中文说明

相对 **2.6.0**，本版新增模型供应商浮窗和百炼多地域接入，改进百炼会后转写、实时转写与错误说明，并整理任务面板和会议概览布局。

### 模型供应商

- 连接改在「模型供应商」浮窗里添加和编辑，取代原来的「添加服务」弹窗。模型服务页的列表不变，点一行打开这条连接，「添加供应商」打开供应商目录；一条连接都没有时，页面直接显示目录。
- 每条连接的计费方式、区域、API Key、Base URL 和测试连接集中在一处，各功能 Base URL 与 API Key 放在高级设置。未填 API Key 也可先添加，状态显示「未配置」。修改即时保存。
- 百炼、硅基流动、MiMo 提供计费方式与区域预设。切换区域时各功能的官方 Base URL 一并更换，业务空间地址和自定义网关保留。新建连接按界面语言预选：中文默认国内站，英文、日文默认国际站。已有连接不做迁移。
- 状态标签全插件统一为：可用、不可用、未测试、未配置、API Key 无效、网络错误、余额不足。连接状态取它负责的任务最近一次测试或调用的结果。测试成功会撤下较早的网络和密钥类失败，但不会掩盖任务留下的余额不足或无权调用。
- 窄窗口和手机上改为先列表、后详情的两级视图。浮窗内的操作均为文字或图标，支持 Enter 和空格触发。

### 百炼

- 新增新加坡按量付费与 Token Plan 预设，以及香港、美国按量付费预设（仅用于 AI 整理）。认不出区域的业务空间地址不再按北京处理。硅基流动新增国际站预设。
- Base URL 粘贴带路径的官方地址时只取主机，各功能保留官方路径。测试连接按功能核对百炼官方路径，路径不对时直接给出正确地址。
- 会后转写与导入音频默认整段提交原文件，参数与 2.6.0 相同。开启区分说话人且录音超过 2 小时时，按原格式无损分成尽量少、尽量均匀的段，每段不超过 2 小时（支持 M4A、MP3、ADTS AAC、PCM WAV）；段间重叠的句子只保留一份，说话人编号顺延，需要核对。超过服务上传大小上限时同样分段。无法无损切分的格式整段提交并给出提示，超过上传上限才停止，原音频保留。
- 分段中某段没有可识别语音时，记一行占位并继续后面的段，重试时不再重复提交这一段。恢复时，已提交到云端的段继续查询原任务，不重新上传。
- 等待云端结果的时限为音频时长的 1.5 倍（10 分钟至 3 小时）。超时保留云端任务，手动重试继续查询同一任务，不重新提交。查询或下载结果时的网络异常自动续查，不重复提交。提交时遇到网关 504 或不带错误码的 502，改为手动重试，避免重复计费。
- 文件转写的模型列表改为当前模型加该区域官方列出的模型，不再请求模型列表接口。
- 实时转写按模型确定采样率（8k 模型发送 8 kHz 音频），保持心跳，意外断线后自动重连，并如实提示缺失的时间段；会话收尾阶段的失败不再被忽略。新加坡默认使用 `fun-asr-realtime`；香港、美国连接直接提示该区域不支持实时转写。
- 快速模式下，AI 整理向百炼 Token Plan 与业务空间地址发送关闭思考的参数；百炼上的 MiniMax-M3 使用其专用参数。服务端拒绝该参数时，去掉参数重发一次。
- Token Plan 地址直接走 Obsidian 请求通道，不再每次启动先失败一次。该通道上的整理请求可以取消，取消后立即释放队列，晚到的结果丢弃。
- Token Plan 额度用尽和账务类 429 不再重试。服务端未给出等待时间时，百炼限流重试至少等待 60 秒，等待可以取消；按量付费的每分钟 token 限流仍可重试。
- 保留百炼错误码并附简短中文说明。「Access to model denied」的说明把阿里云账号欠费列为第一个原因，其后是订阅、套餐和模型范围。权限类错误不再显示为 API Key 无效，限流不再显示为余额不足，账务类错误与密钥错误分开归类。

### 其他转写修复

- 暂停录音时，流式转写只发送静音。暂停期间的话不上传、不写进纪要，连接保持。
- 硅基流动 `XingChenASR-Diarize-V3.0` 开启区分说话人时，整段 M4A 被 HTTP 400 拒收且未指出具体参数错误，会改用本机解码的 16 kHz 单声道 WAV 重试一次：约 24 分钟以内整段提交，更长时分为 2 到 8 段 WAV。这一选择会保存供恢复使用；重试期间手动停止按「已停止」处理，不再记为失败。

### 处理进度

- 「等你处理」「等待继续」的每一行只显示一个主要操作，其余操作收进展开区。原样再试仍会失败的任务不再给「重试」，改为「按当前设置新建任务」。
- 新增「移除」，用于未在运行且未完成的任务；「等你处理」新增「全部重试」「全部清除」。全部重试逐条执行，跳过原样再试仍会失败、笔记冲突或仍缺音频的任务；需要改设置的排在最后，其中任一条再次失败、手动停止或有其他任务占用时中止。全部清除需要确认，移除失败的会议、失败的后台任务和已停止重试的转写项；有已生成但未写入结果的会议保留在列表中。录音和已写入的纪要不受影响，移除后的任务不能再继续。
- 修复因引用不存在的主题变量导致文字偏大的问题；面板字号收敛为更少的几级，手机上同样适用。

### 会议概览

- 概览改为左右两列：主题一列，细节一列。图宽不再随主题数增长，标题不再重复作为根节点；链接等无空格长串可以换行。
- 更新 2.6.0 生成的概览时，如果转写和输出语言都没有变化，直接在本地换成新布局，不再请求 AI。手动修改过的概览不做转换。
- HTML、PDF 导出按原尺寸显示概览，不再放大窄图。A4 打印按主题分页，不再出现空白页或被页边切开的节点。导出中的 `&`、`"`、`<`、`>` 不再显示成实体代码。

### 导入音频

- 导入弹窗改用与设置页相同的行和控件：区分说话人用开关，配合下拉框与输入框；原生按钮改为文字或图标操作，支持 Enter 和空格触发。
- 选择文件的导入弹窗整体可滚动，矮窗口和手机上文件列表不再被挤出可视范围。

### 更新

- 更新前结束录音和处理任务，更新后重载插件。保留配置、录音、笔记及恢复数据；更新本身不会改写旧笔记和已有连接地址。

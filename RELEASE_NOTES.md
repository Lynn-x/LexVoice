# LexVoice 2.8.0

Changes since **2.7.1**. This release adds built-in Coding Plan and Token Plan presets and nine providers for AI organization, names notes "date · topic", turns the meeting overview into a mind map, and stops **Test connection** from reporting any key as available on services whose model list does not check the key.

## Coding Plan and Token Plan presets

- The **Billing** menu in the provider window adds **Coding Plan** next to **Pay as you go** and **Token Plan**. Choosing a plan fills in its official address, for the selected region where the provider has more than one. A connection that uses a proxy address keeps it and only records the billing method.
- Alibaba Cloud Bailian adds Coding Plan for China and International (`sk-sp-` keys). Zhipu GLM, Moonshot / Kimi and Volcengine Ark get **Billing** and **Region** menus, with pay as you go and Coding Plan on both the China and International sites. Z.ai and BytePlus ModelArk are the international sites of Zhipu and Volcengine; the Moonshot / Kimi Coding Plan is Kimi Code, which needs a key created in the Kimi Code console. Xiaomi MiMo Token Plan team keys (`ttp-`) are recognized.
- Nine providers are added for AI organization only, each with its pay-as-you-go address and presets for its main plans: Tencent Cloud TokenHub, MiniMax, JD Cloud, Baidu Qianfan, iFLYTEK MaaS, StepFun, Huawei Cloud MaaS, StreamLake and Atlas Cloud. A few enterprise and discontinued plans have no preset but are recognized on existing connections.
- Coding Plans and the plans of the new providers handle AI organization only and are not offered for transcription. A transcription task still assigned to a Coding Plan connection, such as an existing Bailian one, shows "Coding Plan does not support this task. Use a pay-as-you-go connection."
- When a provider offers more than one billing method, the **Model services** list and the provider window show a Pay as you go, Token Plan or Coding Plan tag. On the home readiness card, tasks on a plan connection are tagged Token Plan or Coding Plan instead of Usage-based.
- For a plan that needs its own key, the API key field says which key to enter (Bailian and MiMo Token Plan keep the 2.7.1 behavior and say nothing while the key is empty). The placeholder shows the key prefix where the provider publishes one, and **Get API key** opens the key page for that plan or site, or is hidden where the provider gives none.
- A key that does not match the chosen billing method is flagged only where plan keys have their own prefix: Alibaba Cloud Bailian, Xiaomi MiMo, Tencent Cloud TokenHub and MiniMax. Zhipu GLM, Volcengine Ark, StepFun and Huawei Cloud MaaS use one key for both methods and bill by address, so switching such a connection to **Pay as you go** bills the same key at pay-as-you-go rates without a warning. Atlas Cloud uses one address for both, so a pay-as-you-go key entered under Coding Plan is billed pay as you go.
- Where a plan's address has no model list, the AI organization model is chosen from built-in candidates. Quick setup cannot set up a Coding Plan: add the key in **Model services** and set **Billing** to **Coding Plan**.
- New connections default to pay as you go: the China site in the Chinese interface, the International site in English and Japanese.
- A Bailian connection that uses `https://coding.dashscope.aliyuncs.com/v1` with an `sk-sp-` key, which 2.7.1 reported as unusable, now works for AI organization without changes. An `/apps/anthropic` address on that host still cannot be used; the hint now points to the `/v1` address.

## Check your plan's terms

- Check a subscription plan's terms before using it for AI organization. As of October 2026, the official terms of these plans limit them to coding or listed AI tools and prohibit API use from other apps; possible consequences include plan suspension, key revocation or account suspension. Coding Plans from Alibaba Cloud Bailian, Zhipu GLM / Z.ai, Volcengine Ark / BytePlus ModelArk, Tencent Cloud, iFLYTEK and StreamLake; Token Plans from Alibaba Cloud Bailian, Xiaomi MiMo, Tencent Cloud (personal), Baidu Qianfan and Huawei Cloud MaaS. Kimi Code is limited to personal interactive use, and StepFun's Step Plan to supported tools. Atlas Cloud's Coding Plan and JD Cloud's Token Plan allow direct API use. Where a plan does not allow it, use pay as you go.
- Some plans let the provider use your inputs and outputs to improve its models, for example Alibaba Cloud Bailian's personal plans and Volcengine Ark's Coding Plan. Meeting notes are often sensitive; check the data terms first.

## Plan limits and provider errors

- When a Bailian Coding Plan 5-hour, weekly or monthly quota runs out, or a Zhipu GLM Coding Plan usage limit that states a reset time is reached, the task is not retried automatically and is not treated as a balance or key problem; retry it later from the task panel. Short Bailian Coding Plan rate limits are retried automatically after about a minute. Expired Zhipu plans, models outside the plan and fair-use limits are not retried, and the connection shows "Access denied" in **Model services**.
- On MiniMax's own endpoints (`api.minimax.cn`, `api.minimax.io` and `api.minimaxi.com`), reasoning text is no longer mixed into note text.
- Kimi K3 models on the Moonshot platform, and all models on Kimi Code, no longer receive a temperature setting, which those models reject.

## Connection tests

- Some model list endpoints, such as OpenRouter's, do not check the API key, so any key used to test as available. **Test connection** now also confirms the key: OpenRouter through its key endpoint, Poe through its balance endpoint, other services by comparing with a request made with an invalid key. Local and LAN services, and connections without a key, are not checked this way.
- If the key cannot be confirmed, the test shows "API key not verified", suggests testing in **Transcription & AI**, and the connection's status stays **Not tested**. When only some services on a connection can be confirmed, it still shows as available and the unconfirmed ones are marked "not verified". If the check times out, is rate-limited, or the network or service fails, it shows "Could not confirm the API key right now. Try again later." and keeps the previous result.
- An earlier "Available" that came only from such a model list is withdrawn at the next test or startup check. Results from tasks that ran successfully, or from tests in **Transcription & AI**, are kept.
- Bailian Coding Plan, and other plan or new-provider addresses that have no model list, cannot be checked here: the test says to test AI organization in **Transcription & AI** and records neither Available nor Unavailable.

## Note names

- New recordings, audio and text imports, merged notes and pre-meeting notes are first named with the date only; the source is no longer added to the file name. A pre-meeting note's date follows **Note file-name format**, and when it is first organized the date becomes the meeting's actual start time.
- With **Append topic to file name** on, an organized note is named "date · topic", without the template name. The template stays in the `mode` property; imports and merged notes record their source in a new `lexvoice_source` property. With the option off, names stay date only.
- New notes record the name LexVoice gave them in a `lexvoice_auto_name` property. If you rename the file, it is no longer renamed when organized again and no topic is requested; to turn automatic naming back on, rename it to that value. Older notes without this property keep their names if they have no date prefix; names in the "date · template-topic" form keep that form and only the topic changes.
- An empty **Note file-name format** falls back to `YYYY-MM-DD HHmm`.
- Names already in use still get a number suffix. If a new recording, import or merged note's name is taken at the moment the note is created, LexVoice stops with an error instead of writing into that note.

## Notes list

- The list shows only the final title. The date, a number suffix, source markers and the template name (built-in, earlier names or your own templates) are removed, for the default format, `MM-DD` and numeric custom formats. A word is removed only when ·, • or - follows it or it ends the name, so other titles that start with these words are kept; a dated title you typed that starts with an earlier template name and a hyphen loses that word in the list.
- If nothing is left, the note's topic property is shown, or "Untitled meeting".
- Text imports get an "Imported text" tag. When the file name does not start with a full date (for example `MM-DD`), the list shows the hour and minute from the note's time property. Renaming from the list keeps the date prefix.
- **Ask** uses the same titles. The topic index also removes the date, source markers and built-in template names.

## Outline

- The live outline no longer marks items with microphone or system-audio sources. A mixed recording is a single stream, so these markers were guesses and often wrong. Markers in existing outlines are hidden in the outline panel and reading view; note files are not changed.
- Recruitment assessments no longer assign roles by audio source. The side asking questions is the interviewer and the side describing their own experience is the candidate. Speaker labels only group lines by person; a label number does not imply a role.
- Timestamps no longer have a pill background. When several items share a time, the repeats after the first show the time faintly instead of an arrow. The current item's title and timestamp are tinted with the accent color, its left bar is removed, and played items are no longer dimmed.
- Outline prompts ask the AI not to add bracketed remarks about the recording, such as "(unfinished)".

## Meeting overview

- The overview is now a mind map: the meeting title is in the center and topics are split between the left and right, clockwise from the top right. A diagram wider than the note scales down instead of overflowing, and long node text wraps.
- The overview prompt asks the AI for keywords: in Chinese and Japanese, up to 10 characters for the title, 6 per topic and 10 per detail; in other languages, 5, 3 and 6 words.
- Running **Generate or update meeting overview** on an overview you have not edited, with the same transcript and output language, switches it to the mind map locally without an AI request. Its text is kept, so earlier long phrases remain; run it again to regenerate shorter text, which sends an AI request.
- Mind-map overviews also appear as mind maps in exported reports; an overview that has not been converted exports in its old layout. When printing, an overview with several topics is split into one diagram per topic.

## Interface

- **Processing** on the home page is now a dropdown: Live only, Post-meeting only or Both.
- Truncated values in home page dropdowns show the full text on hover.
- The task panel and status colors follow your Obsidian theme instead of fixed orange, red and green. Most colored left bars, such as those on failed or slow requests, warnings and hints, are replaced by a light border and background; the selected template row keeps only its background, and AI annotation errors change only the text color.

## Updating

- Reload the plugin after updating. Updating does not rename notes, rewrite note text or change connection addresses and keys.
- Update every device that syncs the same vault. On a device running 2.7.1 or earlier, exports show "The overview could not be rendered. All note text has been preserved." for mind-map overviews; organizing renames notes the old way, so a "date · topic" name gets " · template-new topic" appended and file names you changed are renamed too; saving settings can drop Coding Plan choices for Atlas Cloud or for a plan behind a proxy address, which then show as **Pay as you go** in 2.8.0 and need to be chosen again; and Bailian Coding Plan connections are reported as unusable.
- Overview responses saved by earlier versions, such as one left by an interrupted run or one that could not be parsed, are not reused; retrying sends a new AI request.

---

## 中文说明

相对 **2.7.1**，本版内置各家 Coding Plan / Token Plan 预设与九家 AI 整理服务商，纪要改用「日期 · 主题」命名，会议概览改为思维导图，并修正模型列表不检查 Key 的服务在测试连接时把任意 Key 判为可用的问题。

### Coding Plan 与 Token Plan 预设

- 模型供应商浮窗的「计费方式」在「按量付费」「Token Plan」之外新增「Coding Plan」。选定套餐即填入该套餐的官方地址（服务商分区域时按所选区域）；使用代理地址的连接保留原地址，只记录计费方式。
- 阿里云百炼新增 Coding Plan，分中国与国际（`sk-sp-` 开头的 Key）。智谱 GLM、Moonshot / Kimi、火山方舟新增「计费方式」「区域」，中国站与国际站都有按量付费与 Coding Plan。智谱国际站为 Z.ai，火山国际站为 BytePlus ModelArk；Moonshot / Kimi 的 Coding Plan 即 Kimi Code，需在 Kimi Code 控制台单独创建 Key。小米 MiMo Token Plan 团队版 Key（`ttp-`）可以识别。
- 新增九家仅用于 AI 整理的服务商，内置各自的按量付费地址与主要套餐：腾讯云 TokenHub、MiniMax、京东云、百度千帆、讯飞星辰 MaaS、阶跃星辰、华为云 MaaS、快手 StreamLake、Atlas Cloud。少数企业版和已停售套餐没有预设，只在已有连接上识别计费方式。
- 各家 Coding Plan 与新服务商的套餐只做 AI 整理，不会出现在转写任务的服务列表里；已绑定转写任务的 Coding Plan 连接（例如原有的百炼连接）会提示「Coding Plan 暂不支持该任务，请改用按量付费的连接」。
- 同一服务商有多种计费方式时，「模型服务」列表与浮窗显示「按量付费」「Token Plan」或「Coding Plan」标签。首页准备卡里，使用套餐连接的任务标签由「按量」改为「Token Plan」或「Coding Plan」。
- 需要专属 Key 的套餐，API Key 输入框下会写明要填哪种 Key（百炼、MiMo 的 Token Plan 维持 2.7.1 的做法，Key 为空时不提示）。官方公开了前缀的，占位文字显示该前缀；「获取 API Key」打开对应套餐或站点的取 Key 页面，官方没有提供时不显示。
- 只有套餐 Key 带专属前缀的服务商（阿里云百炼、小米 MiMo、腾讯云 TokenHub、MiniMax）能标出 Key 与计费方式不符。智谱 GLM、火山方舟、阶跃星辰、华为云 MaaS 两种方式共用一把 Key、按地址计费：把「计费方式」切到「按量付费」后，同一把 Key 会按量扣费，界面不会提示。Atlas Cloud 两种方式地址相同，在 Coding Plan 下填了按量 Key 也会按量计费。
- 套餐地址没有模型列表时，AI 整理模型从内置候选中选择。快速开始不能配置 Coding Plan：请在「模型服务」里添加 Key，并把「计费方式」选为「Coding Plan」。
- 新建连接默认按量付费：中文界面默认中国站，英文、日文界面默认国际站。
- 2.7.1 判为不可用的百炼连接（`https://coding.dashscope.aliyuncs.com/v1` 地址加 `sk-sp-` Key）现在可以直接用于 AI 整理。同一主机上的 `/apps/anthropic` 地址仍不能使用，提示改为让你换成 `/v1` 地址。

### 使用套餐前请看条款

- 把订阅套餐用于 AI 整理前，请先确认服务商条款。截至 2026 年 10 月，以下套餐的官方条款限定只能在编程工具或指定的 AI 工具中使用，禁止从其他应用以 API 方式调用，违反可能导致套餐停用、Key 被封或账号封禁：Coding Plan——阿里云百炼、智谱 GLM / Z.ai、火山方舟 / BytePlus ModelArk、腾讯云、讯飞星辰、快手 StreamLake；Token Plan——阿里云百炼、小米 MiMo、腾讯云个人版、百度千帆、华为云 MaaS。Kimi Code 限个人交互式使用，阶跃星辰 Step Plan 限平台支持的工具。Atlas Cloud 的 Coding Plan、京东云的 Token Plan 允许直接通过 API 调用。条款不允许时，请改用按量付费。
- 部分套餐的条款允许服务商把你的输入和输出用于模型优化，例如阿里云百炼的个人版套餐、火山方舟的 Coding Plan。会议纪要往往敏感，请先确认数据条款。

### 套餐额度与服务报错

- 百炼 Coding Plan 的 5 小时、每周、每月额度用完，或智谱 GLM Coding Plan 达到写明重置时间的使用上限时，任务不自动重试，也不记成余额或 Key 问题，可稍后在任务面板手动重试。百炼 Coding Plan 短时限流约 1 分钟后自动重试。智谱套餐到期、套餐不含该模型、触发公平使用限制时不重试，「模型服务」里该连接显示「访问被拒绝」。
- 调用 MiniMax 官方地址（`api.minimax.cn`、`api.minimax.io`、`api.minimaxi.com`）时，思考内容不再混进纪要正文。
- 在 Moonshot 开放平台上使用 Kimi K3 系列，或使用 Kimi Code 上的任何模型时，不再发送温度参数，这些模型会拒绝该参数。

### 测试连接

- 有些服务的模型列表接口不检查 API Key（例如 OpenRouter），以前随便填一串 Key 也会测出可用。「测试连接」现在会再确认 Key：OpenRouter 走官方 Key 查询接口，Poe 走余额查询接口，其他服务用一把无效 Key 再请求一次作对照。本地、局域网服务和没填 Key 的连接不做这一步。
- 确认不了时测试行显示「未验证 Key」，提示到「转写与整理」中测试，连接的状态标签仍为「未测试」。一条连接上只有部分功能能确认时，整体仍显示可用，并写明哪一项未验证。核对时遇到断网、超时、限流或服务出错，提示「暂时无法确认 API Key 是否有效，请稍后重试」，保留上次结论。
- 旧版仅凭这类模型列表记下的「可用」，会在下次测试或启动复检时撤下。实际运行任务成功后，或在「转写与整理」中测试通过后记下的结论保留。
- 百炼 Coding Plan，以及其他没有模型列表接口的套餐或新服务商地址，在这里无法验证：测试结果提示到「转写与整理」中测试 AI 整理，不记为「可用」，也不记为「不可用」。

### 纪要命名

- 新建的录音、音频导入、文本导入、合并纪要和会前准备笔记，文件名一开始只有日期，不再带「导入」「合并」等来源。会前准备笔记的日期跟随「纪要文件名格式」，第一次整理起名时改用会议实际开始的时间。
- 开启「自动添加主题到文件名」时，整理后的纪要命名为「日期 · 主题」，不再带模板名。模板仍记在属性 `mode` 中；导入与合并纪要的来源记在新属性 `lexvoice_source` 中。关闭该选项时，文件名保持只有日期。
- 新笔记会把 LexVoice 起的文件名记在属性 `lexvoice_auto_name` 里。文件名改得和它不一样后，再次整理不再自动改名，也不再请求生成主题；想恢复自动命名，把文件名改回这个值。没有该属性的旧纪要：无日期前缀的保持原名，「日期 · 模板-主题」形式的保持该形式，只替换主题。
- 「纪要文件名格式」为空时改用 `YYYY-MM-DD HHmm`。
- 同名时仍自动加编号；新建录音、导入或合并纪要时，如果创建那一刻文件名刚被占用，会报错停止，不再写进已有笔记。

### 纪要列表

- 列表只显示最终标题：去掉开头的日期、编号、来源标记和模板名（内置、旧名或自建模板），默认格式、`MM-DD` 和纯数字的自定义格式都适用。这些词后面紧跟分隔符（· • -）或位于名称末尾时才会去掉，所以「会议安排讨论」这类标题保持原样；带日期前缀、以旧模板名加连字符开头的手动标题（如「会议-…」），列表会去掉这个词。
- 去掉之后没有剩余内容时，显示笔记属性里的主题，否则显示「未命名会议」。
- 文本导入的纪要显示「文本导入」标签。文件名开头不是完整的年月日（例如 `MM-DD`）时，小字显示笔记属性里的时:分。在列表里改名时保留日期前缀。
- 「问一问」使用同样的标题；主题索引也会去掉日期、来源标记和内置模板名。

### 大纲

- 实时大纲不再给条目标注麦克风或电脑音频来源。混合录音是一路音频，这些标记是 AI 猜的，常常标错。旧大纲里的标记在大纲面板和阅读视图中不再显示，笔记文件不改动。
- 招聘评估不再按音频来源判断面试官和候选人，改按发言内容判断：提问、追问的一方是面试官，讲自己经历的一方是候选人。说话人标签只用来把同一个人的话归在一起，标签编号不代表角色。
- 时间戳去掉胶囊底色。多个条目共用同一时间时，从第二个起改用淡色显示时间，代替箭头。当前条目的标题和时间戳改用强调色调，左侧竖条去掉；已播放的条目不再变淡。
- 大纲提示词要求 AI 不加「（未说完）」这类说明录音情况的括号备注。

### 会议概览

- 概览改为思维导图：会议标题在中心，主题分在左右两侧，从右上开始顺时针排列。图比正文宽时整体缩小，不再溢出；节点文字过长时自动折行。
- 概览提示词要求 AI 只写关键词：中文、日文的标题不超过 10 个字，主题不超过 6 个字，要点不超过 10 个字；其他语言分别不超过 5、3、6 个词。
- 对没有手改过、转写和输出语言都没变的概览执行「生成或更新会议概览」，会在本地换成思维导图，不请求 AI。文字保持不变，原来的长句仍在；再执行一次会重新生成更短的文字，这一次会请求 AI。
- 已换成思维导图的概览，导出的报告里也是思维导图；没有转换过的旧概览按原布局导出。打印时，多个主题的概览按主题拆成小图。

### 界面

- 首页「处理」改为下拉单选：仅实时、仅会后、实时 + 会后。
- 首页下拉框的内容被截断时，悬停显示完整文字。
- 任务面板和各处状态色跟随 Obsidian 主题，不再固定为橙、红、绿。大多数左侧彩色竖条（失败或变慢的请求、各类警告与提示）改为浅色细边框加浅底；模板列表的选中行只保留底色，AI 注解出错只改文字颜色。

### 更新

- 更新后重载插件。更新本身不会改名笔记、改写笔记正文，也不会改动连接地址和密钥。
- 同步同一个库的设备请一起更新。仍装 2.7.1 或更早版本的设备：导出思维导图概览时显示「概览无法渲染，正文已完整保留。」；整理时仍按旧规则改名，新格式「日期 · 主题」后面会再追加「 · 模板-新主题」，手动改过的文件名也会被改；保存设置时可能丢掉 Atlas Cloud 或代理地址后面的 Coding Plan 选择，回到 2.8.0 显示为「按量付费」，需要重新选；百炼 Coding Plan 连接会被判为不可用。
- 旧版保存的概览响应（例如生成中断后留下的，或格式无法解析的）不再复用，重试会重新请求 AI。

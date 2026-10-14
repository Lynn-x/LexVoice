# LexVoice 2.7.1

Changes since **2.7.0**.

## Setup outside mainland China

- In English and Japanese, a new installation uses international endpoints: SiliconFlow's international site and Alibaba Cloud Model Studio (Singapore). Its tasks point to Alibaba Cloud Bailian (Singapore) by default. The Chinese interface is unchanged.
- Quick setup in English and Japanese recommends and preselects Alibaba Cloud Bailian. In Singapore, one API key covers live transcription (`fun-asr-realtime`), post-meeting transcription with speaker separation (`fun-asr`) and AI organization.
- Enabling an unmodified built-in connection from Quick setup in English or Japanese switches it to the international site or Singapore before testing. Connections that have a key, edited addresses or a region chosen in **Model providers** keep their site. If your account is on the China site, choose the region in **Model providers**; when the test fails on an international site chosen from the interface language, the message says so.
- **Sign up** opens the API key page of the site that will be used.
- SiliconFlow's free-transcription note is shown only for its China site. XingChen speaker-separation models are not listed on SiliconFlow's international site; the readiness check says so instead of reporting a missing key, and the connection summary no longer lists speaker separation there.
- When Quick setup picks an AI organization model from the service's list, it skips translation, vision and other special-purpose models. Bailian Singapore uses `qwen3.7-plus` when the account lists it.

## Interface language

- Reasons for blocked recording, Quick setup and connection test results, model-list errors, readiness hints in **Transcription & AI**, and connection removal prompts are shown in English and Japanese. Test buttons report missing settings before contacting the service. Bailian error-code explanations remain in Chinese.
- The built-in local connection's name is shown in the interface language.

## Fixes

- Fix the SiliconFlow transcription documentation link.

## Updating

- Reload the plugin after updating. Existing connection addresses, keys, task bindings and notes are not changed by updating.

---

## 中文说明

相对 **2.7.0**，本版改进中国大陆以外的首次设置，并补齐设置相关提示的英文、日文翻译。

### 海外首次设置

- 英文、日文界面的新安装使用国际站地址：硅基流动国际站与阿里云百炼新加坡，任务默认指向百炼新加坡。中文界面不变。
- 英文、日文界面的快速开始推荐并默认选中阿里云百炼。在新加坡，一把 API Key 覆盖实时转写（`fun-asr-realtime`）、会后转写含区分说话人（`fun-asr`）和 AI 整理。
- 英文、日文界面下，从快速开始启用未改动过的内置连接时，先换到国际站或新加坡再测试。已填 Key、改过地址或在「模型供应商」里选过区域的连接保持原站点。账号在中国站时，请在「模型供应商」里选择区域；按界面语言使用国际站后测试失败，提示会说明这一点。
- 「去开通」打开将要使用的站点的 API Key 页面。
- 硅基流动「转写免费」只在中国站显示。硅基流动国际站未列出 XingChen 说话人分离模型，就绪检查会说明原因，不再显示为缺少密钥；连接摘要也不再列出说话人分离。
- 快速开始从服务的模型列表挑选 AI 整理模型时，跳过翻译、视觉等专用模型；百炼新加坡在账号列出时使用 `qwen3.7-plus`。

### 界面语言

- 录音被拦下的原因、快速开始与连接测试结果、模型列表错误、「转写与整理」页的就绪提示和移除连接的提示，在英文、日文界面下显示对应语言。测试按钮先报出缺少的设置，再请求服务。百炼错误码说明仍为中文。
- 英文、日文界面下，内置本地连接的名称显示为对应语言。

### 修复

- 修正硅基流动转写文档链接。

### 更新

- 更新后重载插件。更新本身不会改变已有连接地址、密钥、任务绑定和笔记。

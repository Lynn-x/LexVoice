# LexVoice 2.5.0

Released: 2026-09-15

Changes since **2.4.0**.

## English and Japanese support

- One plugin with Chinese, English, and Japanese interfaces. LexVoice follows the language selected in Obsidian, including settings, menus, suggested questions, knowledge actions, and processing controls.
- Built-in AI note templates follow Obsidian's language. The default AI output policy also follows the host; existing explicit language preferences and custom prompts are preserved.
- Newly generated recording headings, segment labels, and unchanged built-in daily-note templates follow the host language. Known built-in labels on older derived notes are localized for display without rewriting their files.
- Existing notes, raw transcripts, custom template names, paths, and historical error messages are not automatically translated. Speech recognition retains the spoken language rather than translating audio to the interface language.

## Layout fixes

- Long menu labels wrap and stay within the window, including audio-input choices.
- Recording input status and level bars have separate space, preventing text overlap.
- Speaker-count and name inputs remain readable in narrow import dialogs.
- Fixed overlapping setup-state buttons, processing controls, and crowded library labels.

## Updating

Update through LexVoice's update settings, or download `main.js`, `manifest.json`, and `styles.css` from this release. Finish any active recording or processing first, then reload the plugin. Keep `data.json`, recordings, and notes.

Only distribution artifacts and user documentation are public. GitHub's automatically generated "Source code" archives contain the public distribution snapshot, not private development source.

---

## 中文说明

相对 **2.4.0**，本版新增中英日界面及内置 AI 模板语言跟随，覆盖设置、菜单、建议问题、知识整理及处理控件。默认 AI 输出语言跟随 Obsidian，已有明确语言偏好和自定义提示词保留。

新录音标题、分段标签和未修改的内置日记模板随宿主语言生成；已知内置派生标签只转换显示，不改写文件。旧笔记、原始转写、自定义名称、路径和历史错误不自动翻译，原始转写保留实际发言语言。

修复长菜单截断、状态按钮重叠、录音电平条遮挡文字、说话人输入框挤压和资料卡布局。更新前请先完成录音和处理任务，保留配置、录音及笔记，再重载插件。

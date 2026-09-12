# LexVoice 2.3.2

发布日期：2026-09-12

修复录音大纲中覆盖范围提示的样式。

- 提示改用正常字号和文字颜色，去掉小字斜体、圆角装饰边框和主题附加的引用装饰。
- 保留覆盖段数与补齐提示。大纲时间轴、回听链接和原始材料折叠方式不变。
- 仅调整 LexVoice 大纲内的提示，不改变正文引用和其他 callout 的主题样式。

本次不调整 ASR 转写或切分策略，也没有新增自动双链功能。更新不会改写已有笔记。

手动安装：替换插件目录中的 `main.js`、`manifest.json` 和 `styles.css`，再重新加载 LexVoice。保留 `data.json`、录音和笔记。

安装产物在 [Lynn-x/LexVoice](https://github.com/Lynn-x/LexVoice/releases) 发布，开发源码仍为私有。许可证未变。
